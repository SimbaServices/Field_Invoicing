import { prisma } from "./db";
import { resolveCustomerEmails, sendEmail } from "./email";
import type { LineItem } from "./types";
import { sumLineItems } from "./money";

export async function createQuote(input: {
  customerId: string;
  title: string;
  lineItems: LineItem[];
  notes?: string;
  validUntil?: Date;
  taxCents?: number;
  currency?: string;
}) {
  const count = await prisma.quote.count({ where: { customerId: input.customerId } });
  const number = `Q-${String(count + 1).padStart(4, "0")}`;
  const subtotalCents = sumLineItems(input.lineItems);
  const taxCents = input.taxCents ?? 0;

  return prisma.quote.create({
    data: {
      customerId: input.customerId,
      number,
      title: input.title,
      lineItemsJson: JSON.stringify(input.lineItems),
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      currency: input.currency ?? "usd",
      validUntil: input.validUntil,
      notes: input.notes,
    },
  });
}

export async function sendQuote(quoteId: string) {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: { customer: true },
  });

  const emails = await resolveCustomerEmails(quote.customerId, "quote");
  const from =
    emails.senders[0]?.email ??
    process.env.DEFAULT_FROM_EMAIL ??
    "quotes@fieldinvoicing.local";
  const recipients = emails.recipients.map((r) => r.email);

  await sendEmail({
    customerId: quote.customerId,
    to: recipients,
    fromEmail: from,
    subject: `Quote ${quote.number}: ${quote.title}`,
    bodyText: [
      `Quote ${quote.number} — ${quote.title}`,
      `Total: $${(quote.totalCents / 100).toFixed(2)} ${quote.currency.toUpperCase()}`,
      quote.notes ? `\nNotes: ${quote.notes}` : "",
      "",
      "Reply to accept this quote or contact your account representative.",
    ].join("\n"),
    purpose: "quote",
    relatedType: "quote",
    relatedId: quote.id,
  });

  return prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: "sent",
      sentAt: new Date(),
      sentToJson: JSON.stringify(recipients),
    },
  });
}
