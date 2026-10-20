import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: {
        customers: {
          include: {
            paymentTerms: true,
            _count: { select: { invoices: true, purchaseOrders: true, quotes: true } },
          },
        },
        bankingAccounts: true,
        integrations: true,
        stripeConnect: true,
        users: true,
      },
    });
    if (!org) return jsonError(new Error("Organization not found"), 404);
    return jsonOk(org);
  } catch (e) {
    return jsonError(e, 500);
  }
}
