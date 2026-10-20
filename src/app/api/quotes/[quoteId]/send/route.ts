import { jsonError, jsonOk } from "@/lib/api";
import { sendQuote } from "@/lib/quotes";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ quoteId: string }> },
) {
  try {
    const { quoteId } = await params;
    const quote = await sendQuote(quoteId);
    return jsonOk(quote);
  } catch (e) {
    return jsonError(e);
  }
}
