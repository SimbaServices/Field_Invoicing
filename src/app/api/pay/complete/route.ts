import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { markPaymentSucceeded } from "@/lib/stripe";

const schema = z.object({
  sessionId: z.string().min(1),
});

/** Completes stub checkouts in development when Stripe webhooks are unavailable */
export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const payment = await markPaymentSucceeded(body.sessionId);
    if (!payment) return jsonError(new Error("Payment not found"), 404);
    return jsonOk({ ok: true, payment });
  } catch (e) {
    return jsonError(e);
  }
}
