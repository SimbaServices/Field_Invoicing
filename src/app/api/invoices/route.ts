import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { createGeneratedInvoice, uploadInvoice } from "@/lib/invoices";

const lineItem = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitCents: z.number().int().nonnegative(),
});

const generatedSchema = z.object({
  mode: z.literal("generated"),
  customerId: z.string(),
  purchaseOrderId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  lineItems: z.array(lineItem).min(1),
});

export async function POST(req: Request) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return jsonError(new Error("file is required"));
      }
      const customerId = String(form.get("customerId") ?? "");
      const title = String(form.get("title") ?? file.name);
      const amountCents = Number(form.get("amountCents") ?? 0);
      const lifecyclePhase = String(form.get("lifecyclePhase") ?? "pending") as
        | "pending"
        | "signed"
        | "paid";
      const purchaseOrderId = form.get("purchaseOrderId")
        ? String(form.get("purchaseOrderId"))
        : undefined;

      if (!customerId || !amountCents) {
        return jsonError(new Error("customerId and amountCents are required"));
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const invoice = await uploadInvoice({
        customerId,
        purchaseOrderId,
        title,
        amountCents,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        data: buffer,
        lifecyclePhase,
      });
      return jsonOk(invoice, { status: 201 });
    }

    const body = generatedSchema.parse(await req.json());
    const invoice = await createGeneratedInvoice(body);
    return jsonOk(invoice, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
