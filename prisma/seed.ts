import { PrismaClient } from "@prisma/client";
import { generateTermSheetDraft } from "../src/lib/term-sheet";
import { createGeneratedInvoice, uploadInvoice, signInvoice } from "../src/lib/invoices";
import { createQuote, sendQuote } from "../src/lib/quotes";
import { createJobPo, createSubPo } from "../src/lib/purchase-orders";
import { ensureConnectAccount } from "../src/lib/stripe";
import { connectQuickBooks } from "../src/lib/quickbooks";

const prisma = new PrismaClient();

async function main() {
  await prisma.outboundEmail.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.accessToken.deleteMany();
  await prisma.receivable.deleteMany();
  await prisma.invoiceBlob.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.purchaseOrder.deleteMany();
  await prisma.quote.deleteMany();
  await prisma.termSheet.deleteMany();
  await prisma.customerEmailConfig.deleteMany();
  await prisma.paymentTerms.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.bankingAccount.deleteMany();
  await prisma.integrationConfig.deleteMany();
  await prisma.stripeConnectAccount.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();

  const org = await prisma.organization.create({
    data: {
      name: "Northline Field Services",
      slug: "northline",
      users: {
        create: {
          email: "ops@northline.example",
          name: "Alex Rivera",
          role: "owner",
        },
      },
      bankingAccounts: {
        create: {
          label: "Operating — Chase ****4421",
          provider: "stripe_connect",
          isDefault: true,
          accountLast4: "4421",
          routingLast4: "0210",
        },
      },
    },
  });

  await ensureConnectAccount(org.id);
  await connectQuickBooks(org.id, "realm_demo_northline");

  const customer = await prisma.customer.create({
    data: {
      organizationId: org.id,
      name: "Harbor Municipal Works",
      legalName: "Harbor Municipal Works Authority",
      email: "ap@harborworks.example",
      phone: "+1-555-0142",
      billingAddress: "100 Waterfront Ave, Harbor City",
      paymentTerms: {
        create: {
          name: "Net 30",
          netDays: 30,
          earlyPayDiscount: 2,
          lateFeePercent: 1.5,
          currency: "usd",
          notes: "Standard municipal payment terms.",
        },
      },
      emailConfigs: {
        create: [
          {
            purpose: "quote",
            role: "sender",
            email: "quotes@northline.example",
            name: "Northline Quotes",
            isDefault: true,
          },
          {
            purpose: "quote",
            role: "recipient",
            email: "ap@harborworks.example",
            name: "Harbor AP",
            isDefault: true,
          },
          {
            purpose: "payment",
            role: "sender",
            email: "billing@northline.example",
            name: "Northline Billing",
          },
          {
            purpose: "payment",
            role: "recipient",
            email: "ap@harborworks.example",
            name: "Harbor AP",
          },
          {
            purpose: "signing",
            role: "recipient",
            email: "pm@harborworks.example",
            name: "Harbor Project Manager",
          },
        ],
      },
    },
    include: { paymentTerms: true },
  });

  const draft = generateTermSheetDraft({
    customerName: customer.name,
    organizationName: org.name,
    netDays: customer.paymentTerms!.netDays,
    earlyPayDiscount: customer.paymentTerms!.earlyPayDiscount,
    lateFeePercent: customer.paymentTerms!.lateFeePercent,
    currency: customer.paymentTerms!.currency,
    notes: customer.paymentTerms!.notes,
  });

  await prisma.termSheet.create({
    data: {
      customerId: customer.id,
      title: draft.title,
      contentJson: JSON.stringify(draft.sections),
      contentMarkdown: draft.markdown,
      assistedBy: "template",
      status: "accepted",
    },
  });

  const quote = await createQuote({
    customerId: customer.id,
    title: "Q3 Site Restoration Package",
    lineItems: [
      { description: "Mobilization", quantity: 1, unitCents: 450000 },
      { description: "Daily crew rate", quantity: 10, unitCents: 185000 },
    ],
    notes: "Includes equipment and waste haul.",
  });
  await sendQuote(quote.id);

  const jobPo = await createJobPo({
    customerId: customer.id,
    title: "Pier 4 Restoration",
    description: "Primary job PO for Harbor pier restoration",
    budgetCents: 2500000,
    jobCode: "HRB-P4",
  });

  const subPo = await createSubPo({
    parentPoId: jobPo.id,
    title: "Electrical subcontract",
    description: "Optional sub-PO for electrical cash-flow tracking",
    budgetCents: 400000,
  });

  const invoice = await createGeneratedInvoice({
    customerId: customer.id,
    purchaseOrderId: jobPo.id,
    title: "Progress billing — Phase 1",
    lineItems: [
      { description: "Site prep", quantity: 1, unitCents: 750000 },
      { description: "Materials", quantity: 1, unitCents: 320000 },
    ],
  });

  await createGeneratedInvoice({
    customerId: customer.id,
    purchaseOrderId: subPo.id,
    title: "Electrical rough-in",
    lineItems: [{ description: "Rough-in labor & materials", quantity: 1, unitCents: 185000 }],
  });

  await uploadInvoice({
    customerId: customer.id,
    purchaseOrderId: jobPo.id,
    title: "Hard-copy invoice — Crane rental",
    amountCents: 96000,
    filename: "crane-rental-scan.pdf",
    contentType: "application/pdf",
    data: Buffer.from("%PDF-1.4 stub digitized invoice for crane rental"),
    lifecyclePhase: "pending",
    digitizedText: "Crane rental — Harbor Pier 4 — $960.00",
  });

  await signInvoice({
    invoiceId: invoice.id,
    signedByName: "Jordan Lee",
    signedByEmail: "pm@harborworks.example",
    signatureData: "typed:Jordan Lee",
  });

  console.log("Seeded organization:", org.slug);
  console.log("Customer:", customer.name);
  console.log("Signed invoice:", invoice.number);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
