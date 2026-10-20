import { jsonError, jsonOk } from "@/lib/api";
import { syncInvoiceToQuickBooks } from "@/lib/quickbooks";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const { invoiceId } = await params;
    const result = await syncInvoiceToQuickBooks(invoiceId);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e);
  }
}
