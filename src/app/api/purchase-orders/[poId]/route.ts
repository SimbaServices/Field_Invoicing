import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { closePurchaseOrder, poCashFlow } from "@/lib/purchase-orders";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ poId: string }> },
) {
  try {
    const { poId } = await params;
    const flow = await poCashFlow(poId);
    return jsonOk(flow);
  } catch (e) {
    return jsonError(e, 404);
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ poId: string }> },
) {
  try {
    const { poId } = await params;
    const body = await req.json();
    if (body.action === "close") {
      const po = await closePurchaseOrder(poId);
      return jsonOk(po);
    }
    if (body.status) {
      const po = await prisma.purchaseOrder.update({
        where: { id: poId },
        data: { status: body.status },
      });
      return jsonOk(po);
    }
    return jsonError(new Error("Unsupported action"));
  } catch (e) {
    return jsonError(e);
  }
}
