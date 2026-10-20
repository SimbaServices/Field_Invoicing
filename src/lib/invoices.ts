import { prisma } from "./db";
import { invoiceStorageKey, putBlob } from "./blob-storage";
import { createReceivableFromSignedInvoice } from "./receivables";
import { createAccessToken, publicAppUrl } from "./access-tokens";
import { resolveCustomerEmails, sendEmail } from "./email";
import { createDestinationCheckout } from "./stripe";
import type { LineItem } from "./types";
import { sumLineItems } from "./money";

export async function createGeneratedInvoice(input: {
  customerId: string;
  purchaseOrderId?: string;
  title: string;
  description?: string;
  lineItems: LineItem[];
  currency?: string;
  lifecyclePhase?: "pending" | "signed" | "paid";
}) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: input.customerId },
  });
  const count = await prisma.invoice.count({ where: { customerId: input.customerId } });
  const number = `INV-${String(count + 1).padStart(4, "0")}`;
  const amountCents = sumLineItems(input.lineItems);
  const phase = input.lifecyclePhase ?? "pending";

  const invoice = await prisma.invoice.create({
    data: {
      customerId: input.customerId,
      purchaseOrderId: input.purchaseOrderId,
      number,
      title: input.title,
      description: input.description,
      status: phase,
      source: "generated",
      amountCents,
      currency: input.currency ?? "usd",
      lineItemsJson: JSON.stringify(input.lineItems),
      lifecyclePhase: phase,
    },
  });

  // Persist a generated PDF-like text blob so generated & uploaded share the same storage path model
  const body = [
    `Invoice ${number}`,
    `Customer: ${customer.name}`,
    `Title: ${input.title}`,
    `Amount: ${(amountCents / 100).toFixed(2)}`,
    "",
    ...input.lineItems.map(
      (li) => `- ${li.description}: ${li.quantity} x ${(li.unitCents / 100).toFixed(2)}`,
    ),
  ].join("\n");

  const storageKey = invoiceStorageKey({
    organizationId: customer.organizationId,
    customerId: customer.id,
    invoiceId: invoice.id,
    filename: `${number}.txt`,
  });
  const stored = await putBlob(storageKey, Buffer.from(body, "utf8"), "text/plain");
  await prisma.invoiceBlob.create({
    data: {
      invoiceId: invoice.id,
      storageKey: stored.storageKey,
      filename: `${number}.txt`,
      contentType: "text/plain",
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      digitizedText: body,
    },
  });

  return invoice;
}

export async function uploadInvoice(input: {
  customerId: string;
  purchaseOrderId?: string;
  title: string;
  amountCents: number;
  currency?: string;
  filename: string;
  contentType: string;
  data: Buffer;
  /** Phase assigned at upload — thereafter indistinguishable from generated invoices */
  lifecyclePhase: "pending" | "signed" | "paid";
  digitizedText?: string;
}) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: input.customerId },
  });
  const count = await prisma.invoice.count({ where: { customerId: input.customerId } });
  const number = `INV-${String(count + 1).padStart(4, "0")}`;

  const invoice = await prisma.invoice.create({
    data: {
      customerId: input.customerId,
      purchaseOrderId: input.purchaseOrderId,
      number,
      title: input.title,
      status: input.lifecyclePhase,
      source: "uploaded",
      amountCents: input.amountCents,
      currency: input.currency ?? "usd",
      lineItemsJson: JSON.stringify([
        {
          description: input.title,
          quantity: 1,
          unitCents: input.amountCents,
        },
      ]),
      lifecyclePhase: input.lifecyclePhase,
      signedAt: input.lifecyclePhase !== "pending" ? new Date() : null,
      paidAt: input.lifecyclePhase === "paid" ? new Date() : null,
    },
  });

  const storageKey = invoiceStorageKey({
    organizationId: customer.organizationId,
    customerId: customer.id,
    invoiceId: invoice.id,
    filename: input.filename,
  });
  const stored = await putBlob(storageKey, input.data, input.contentType);

  await prisma.invoiceBlob.create({
    data: {
      invoiceId: invoice.id,
      storageKey: stored.storageKey,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: stored.sizeBytes,
      checksum: stored.checksum,
      digitizedText:
        input.digitizedText ??
        `[Digitized upload] ${input.filename} — ${input.title} — $${(input.amountCents / 100).toFixed(2)}`,
    },
  });

  if (input.lifecyclePhase === "signed" || input.lifecyclePhase === "paid") {
    await createReceivableFromSignedInvoice(invoice.id);
  }
  if (input.lifecyclePhase === "paid") {
    await prisma.receivable.updateMany({
      where: { invoiceId: invoice.id },
      data: { status: "paid", paidAt: new Date() },
    });
  }

  return invoice;
}

export async function signInvoice(input: {
  invoiceId: string;
  signedByName: string;
  signedByEmail: string;
  signatureData?: string;
  accessTokenId?: string;
}) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: input.invoiceId },
    include: { customer: { include: { organization: true } } },
  });

  if (invoice.status === "paid") {
    throw new Error("Invoice is already paid");
  }

  const updated = await prisma.invoice.update({
    where: { id: input.invoiceId },
    data: {
      status: "signed",
      lifecyclePhase: "signed",
      signedAt: new Date(),
      signedByName: input.signedByName,
      signedByEmail: input.signedByEmail,
      signatureData: input.signatureData,
    },
  });

  if (input.accessTokenId) {
    await prisma.accessToken.update({
      where: { id: input.accessTokenId },
      data: { usedAt: new Date() },
    });
  }

  const receivable = await createReceivableFromSignedInvoice(updated.id);

  // Auto-send limited-access payment link to configured recipients
  const payToken = await createAccessToken(updated.id, "pay");
  const payUrl = publicAppUrl(`/pay/${payToken.token}`);
  const emails = await resolveCustomerEmails(invoice.customerId, "payment");
  const from =
    emails.senders[0]?.email ??
    process.env.DEFAULT_FROM_EMAIL ??
    "billing@fieldinvoicing.local";

  await sendEmail({
    customerId: invoice.customerId,
    to: emails.recipients.map((r) => r.email),
    fromEmail: from,
    subject: `Payment requested — Invoice ${updated.number}`,
    bodyText: [
      `Invoice ${updated.number} was signed and is now a confirmed receivable.`,
      `Amount: $${(updated.amountCents / 100).toFixed(2)} ${updated.currency.toUpperCase()}`,
      `Due: ${receivable.dueAt.toISOString().slice(0, 10)}`,
      "",
      `Pay securely (no account required): ${payUrl}`,
    ].join("\n"),
    purpose: "payment_link",
    relatedType: "invoice",
    relatedId: updated.id,
  });

  return { invoice: updated, receivable, payUrl };
}

export async function sendSignLink(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });
  const token = await createAccessToken(invoiceId, "sign");
  const url = publicAppUrl(`/sign/${token.token}`);
  const emails = await resolveCustomerEmails(invoice.customerId, "signing");
  const from =
    emails.senders[0]?.email ??
    process.env.DEFAULT_FROM_EMAIL ??
    "billing@fieldinvoicing.local";

  await sendEmail({
    customerId: invoice.customerId,
    to: emails.recipients.map((r) => r.email),
    fromEmail: from,
    subject: `Please sign invoice ${invoice.number}`,
    bodyText: `Please review and digitally sign invoice ${invoice.number}:\n\n${url}`,
    purpose: "sign_link",
    relatedType: "invoice",
    relatedId: invoice.id,
  });

  return { url, token };
}

export async function startPaymentForInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });

  if (invoice.status !== "signed" && invoice.status !== "pending") {
    // allow pending only if uploaded as signed? payment is for signed/confirmed
  }
  if (invoice.status === "paid") {
    throw new Error("Invoice already paid");
  }
  if (invoice.status !== "signed") {
    throw new Error("Invoice must be signed before payment");
  }

  const checkout = await createDestinationCheckout({
    invoiceId: invoice.id,
    amountCents: invoice.amountCents,
    currency: invoice.currency,
    organizationId: invoice.customer.organizationId,
    customerEmail: invoice.customer.email,
    successUrl: publicAppUrl(`/pay/success?session_id={CHECKOUT_SESSION_ID}`),
    cancelUrl: publicAppUrl(`/pay/cancel?invoice=${invoice.id}`),
  });

  return checkout;
}
