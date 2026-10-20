import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { createQuote, sendQuote } from "@/lib/quotes";

const lineItem = z.object({
  description: z.string(),
  quantity: z.number().positive(),
  unitCents: z.number().int().nonnegative(),
});

const schema = z.object({
  customerId: z.string(),
  title: z.string(),
  lineItems: z.array(lineItem).min(1),
  notes: z.string().optional(),
  taxCents: z.number().int().nonnegative().optional(),
  send: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    let quote = await createQuote(body);
    if (body.send) {
      quote = await sendQuote(quote.id);
    }
    return jsonOk(quote, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
