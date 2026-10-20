import { addDays, differenceInSeconds, formatDistanceStrict } from "date-fns";
import { prisma } from "./db";

export async function createReceivableFromSignedInvoice(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: { include: { paymentTerms: true } }, receivable: true },
  });

  if (invoice.receivable) return invoice.receivable;

  const netDays = invoice.customer.paymentTerms?.netDays ?? 30;
  const confirmedAt = invoice.signedAt ?? new Date();
  const dueAt = addDays(confirmedAt, netDays);

  return prisma.receivable.create({
    data: {
      invoiceId,
      amountCents: invoice.amountCents,
      currency: invoice.currency,
      confirmedAt,
      dueAt,
      netDays,
      status: "open",
    },
  });
}

export function receivableCountdown(dueAt: Date, now = new Date()) {
  const seconds = differenceInSeconds(dueAt, now);
  const overdue = seconds < 0;
  return {
    dueAt: dueAt.toISOString(),
    overdue,
    secondsRemaining: seconds,
    label: overdue
      ? `Overdue by ${formatDistanceStrict(now, dueAt)}`
      : `Due in ${formatDistanceStrict(dueAt, now)}`,
  };
}

export async function refreshOverdueReceivables() {
  const now = new Date();
  return prisma.receivable.updateMany({
    where: { status: "open", dueAt: { lt: now } },
    data: { status: "overdue" },
  });
}
