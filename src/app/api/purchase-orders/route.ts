import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { createJobPo, createSubPo } from "@/lib/purchase-orders";

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("job"),
    customerId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    budgetCents: z.number().int().nonnegative().optional(),
    jobCode: z.string().optional(),
  }),
  z.object({
    kind: z.literal("sub"),
    parentPoId: z.string(),
    title: z.string(),
    description: z.string().optional(),
    budgetCents: z.number().int().nonnegative().optional(),
  }),
]);

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const po =
      body.kind === "job"
        ? await createJobPo(body)
        : await createSubPo(body);
    return jsonOk(po, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
