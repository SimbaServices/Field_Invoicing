import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { poCashFlow } from "@/lib/purchase-orders";
import { receivableCountdown } from "@/lib/receivables";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  try {
    const { customerId } = await params;
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        organization: true,
        paymentTerms: true,
        emailConfigs: true,
        termSheets: { orderBy: { createdAt: "desc" } },
        quotes: { orderBy: { createdAt: "desc" } },
        purchaseOrders: {
          where: { parentPoId: null },
          include: { children: true },
          orderBy: { createdAt: "desc" },
        },
        invoices: {
          include: { receivable: true, blob: true, purchaseOrder: true },
          orderBy: { createdAt: "desc" },
        },
      },
    });
    if (!customer) return jsonError(new Error("Customer not found"), 404);

    const receivables = customer.invoices
      .filter((i) => i.receivable)
      .map((i) => ({
        invoiceId: i.id,
        invoiceNumber: i.number,
        amountCents: i.receivable!.amountCents,
        status: i.receivable!.status,
        countdown: receivableCountdown(i.receivable!.dueAt),
      }));

    const cashFlows = await Promise.all(
      customer.purchaseOrders.map((po) => poCashFlow(po.id)),
    );

    return jsonOk({ customer, receivables, cashFlows });
  } catch (e) {
    return jsonError(e, 500);
  }
}
