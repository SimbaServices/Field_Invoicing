import { NextResponse } from "next/server";
import { getStripe, markPaymentSucceeded } from "@/lib/stripe";
import { prisma } from "@/lib/db";

export async function POST(req: Request) {
  const stripe = getStripe();
  const body = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: { type: string; data: { object: Record<string, unknown> } };

  if (stripe && process.env.STRIPE_WEBHOOK_SECRET && signature) {
    try {
      event = stripe.webhooks.constructEvent(
        body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      ) as unknown as typeof event;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Webhook error";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  } else {
    // Dev / stub mode
    event = JSON.parse(body);
  }

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as {
        id: string;
        payment_status?: string;
      };
      if (
        event.type === "checkout.session.completed" &&
        session.payment_status &&
        session.payment_status !== "paid"
      ) {
        break;
      }
      await markPaymentSucceeded(session.id);
      break;
    }
    case "account.updated": {
      const account = event.data.object as {
        id: string;
        charges_enabled?: boolean;
        payouts_enabled?: boolean;
      };
      await prisma.stripeConnectAccount.updateMany({
        where: { stripeAccountId: account.id },
        data: {
          onboardingComplete: Boolean(account.charges_enabled || account.payouts_enabled),
          transfersActive: Boolean(account.payouts_enabled),
        },
      });
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
