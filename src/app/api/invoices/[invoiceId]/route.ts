import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { receivableCountdown } from "@/lib/receivables";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const { invoiceId } = await params;
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        customer: { include: { paymentTerms: true, organization: true } },
        purchaseOrder: true,
        blob: true,
        receivable: true,
        payments: true,
        accessTokens: true,
      },
    });
    if (!invoice) return jsonError(new Error("Invoice not found"), 404);

    return jsonOk({
      invoice,
      countdown: invoice.receivable
        ? receivableCountdown(invoice.receivable.dueAt)
        : null,
    });
  } catch (e) {
    return jsonError(e, 500);
  }
}
