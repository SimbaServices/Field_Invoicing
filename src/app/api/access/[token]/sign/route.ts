import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { resolveAccessToken } from "@/lib/access-tokens";
import { signInvoice } from "@/lib/invoices";

const schema = z.object({
  signedByName: z.string().min(1),
  signedByEmail: z.string().email(),
  signatureData: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await params;
    const access = await resolveAccessToken(token, "sign");
    if (!access) return jsonError(new Error("Invalid or expired signing link"), 401);
    if (access.invoice.status === "signed" || access.invoice.status === "paid") {
      return jsonError(new Error("Invoice already signed"), 409);
    }

    const body = schema.parse(await req.json());
    const result = await signInvoice({
      invoiceId: access.invoiceId,
      accessTokenId: access.id,
      ...body,
    });
    return jsonOk(result);
  } catch (e) {
    return jsonError(e);
  }
}
