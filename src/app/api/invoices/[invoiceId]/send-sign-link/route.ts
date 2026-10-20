import { jsonError, jsonOk } from "@/lib/api";
import { sendSignLink } from "@/lib/invoices";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const { invoiceId } = await params;
    const result = await sendSignLink(invoiceId);
    return jsonOk(result);
  } catch (e) {
    return jsonError(e);
  }
}
