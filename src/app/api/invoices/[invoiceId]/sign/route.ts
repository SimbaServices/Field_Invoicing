import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { signInvoice } from "@/lib/invoices";

const schema = z.object({
  signedByName: z.string().min(1),
  signedByEmail: z.string().email(),
  signatureData: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const { invoiceId } = await params;
    const body = schema.parse(await req.json());
    const result = await signInvoice({ invoiceId, ...body });
    return jsonOk(result);
  } catch (e) {
    return jsonError(e);
  }
}
