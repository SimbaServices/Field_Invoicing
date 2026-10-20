import { prisma } from "./db";

export async function createJobPo(input: {
  customerId: string;
  title: string;
  description?: string;
  budgetCents?: number;
  jobCode?: string;
  currency?: string;
}) {
  const count = await prisma.purchaseOrder.count({
    where: { customerId: input.customerId, parentPoId: null },
  });
  const number = `PO-${String(count + 1).padStart(4, "0")}`;
  const jobCode = input.jobCode ?? number;

  return prisma.purchaseOrder.create({
    data: {
      customerId: input.customerId,
      number,
      title: input.title,
      description: input.description,
      budgetCents: input.budgetCents,
      jobCode,
      currency: input.currency ?? "usd",
      status: "open",
    },
  });
}

/**
 * Sub-POs are optional cash-flow structure under a job PO.
 * They inherit customer scope and stamp parentNumber + shared jobCode.
 */
export async function createSubPo(input: {
  parentPoId: string;
  title: string;
  description?: string;
  budgetCents?: number;
}) {
  const parent = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: input.parentPoId },
  });
  if (parent.parentPoId) {
    throw new Error("Cannot nest sub-POs under another sub-PO");
  }

  const siblingCount = await prisma.purchaseOrder.count({
    where: { parentPoId: parent.id },
  });
  const number = `${parent.number}-S${String(siblingCount + 1).padStart(2, "0")}`;

  return prisma.purchaseOrder.create({
    data: {
      customerId: parent.customerId,
      parentPoId: parent.id,
      number,
      title: input.title,
      description: input.description,
      budgetCents: input.budgetCents,
      currency: parent.currency,
      parentNumber: parent.number,
      jobCode: parent.jobCode ?? parent.number,
      status: "open",
    },
  });
}

export async function closePurchaseOrder(poId: string) {
  return prisma.purchaseOrder.update({
    where: { id: poId },
    data: { status: "closed", closedAt: new Date() },
  });
}

/** Cash-flow summary for a job PO including optional sub-POs and their invoices */
export async function poCashFlow(poId: string) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: {
      children: {
        include: {
          invoices: { include: { receivable: true, payments: true } },
        },
      },
      invoices: { include: { receivable: true, payments: true } },
    },
  });

  const allInvoices = [
    ...po.invoices,
    ...po.children.flatMap((c) => c.invoices),
  ];

  const summarize = (invoices: typeof allInvoices) => {
    const pending = invoices
      .filter((i) => i.status === "pending")
      .reduce((s, i) => s + i.amountCents, 0);
    const signed = invoices
      .filter((i) => i.status === "signed")
      .reduce((s, i) => s + i.amountCents, 0);
    const paid = invoices
      .filter((i) => i.status === "paid")
      .reduce((s, i) => s + i.amountCents, 0);
    return { pending, signed, paid, total: pending + signed + paid, count: invoices.length };
  };

  return {
    purchaseOrder: po,
    job: summarize(allInvoices),
    parentOnly: summarize(po.invoices),
    subPos: po.children.map((child) => ({
      id: child.id,
      number: child.number,
      title: child.title,
      parentNumber: child.parentNumber,
      jobCode: child.jobCode,
      ...summarize(child.invoices),
    })),
  };
}
