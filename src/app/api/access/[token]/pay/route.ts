import { jsonError, jsonOk } from "@/lib/api";
import { resolveAccessToken } from "@/lib/access-tokens";
import { startPaymentForInvoice } from "@/lib/invoices";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const access = await resolveAccessToken(token, "pay");
    if (!access) return jsonError(new Error("Invalid or expired payment link"), 401);
    if (access.invoice.status === "paid") {
      return jsonError(new Error("Invoice already paid"), 409);
    }
    if (access.invoice.status !== "signed") {
      return jsonError(new Error("Invoice must be signed before payment"), 400);
    }

    const checkout = await startPaymentForInvoice(access.invoiceId);
    return jsonOk(checkout);
  } catch (e) {
    return jsonError(e);
  }
}
