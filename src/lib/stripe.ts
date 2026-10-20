import Stripe from "stripe";
import { prisma } from "./db";

/**
 * Connect configuration for Field Invoicing:
 * - Destination charges (platform owns limited-access payment links)
 * - Express dashboard for organizations
 * - Platform collects fees + owns negative balance liability
 *
 * Accounts v2 is preferred in production; the Node SDK helper below
 * uses Account Links for Express onboarding until v2 client helpers stabilize.
 */
export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-09-30.endive",
    typescript: true,
  });
}

export async function ensureConnectAccount(organizationId: string) {
  const existing = await prisma.stripeConnectAccount.findUnique({
    where: { organizationId },
  });
  if (existing) return existing;

  const stripe = getStripe();
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
  });

  if (!stripe) {
    // Dev stub — no Stripe keys yet
    return prisma.stripeConnectAccount.create({
      data: {
        organizationId,
        stripeAccountId: `acct_stub_${organizationId.slice(0, 8)}`,
        dashboard: "express",
        feesCollector: "application",
        lossesCollector: "application",
        chargePattern: "destination",
        onboardingComplete: false,
        transfersActive: false,
      },
    });
  }

  const account = await stripe.accounts.create({
    controller: {
      stripe_dashboard: { type: "express" },
      fees: { payer: "application" },
      losses: { payments: "application" },
    },
    capabilities: {
      transfers: { requested: true },
    },
    business_profile: { name: org.name },
    metadata: { organizationId, organizationSlug: org.slug },
  });

  return prisma.stripeConnectAccount.create({
    data: {
      organizationId,
      stripeAccountId: account.id,
      dashboard: "express",
      feesCollector: "application",
      lossesCollector: "application",
      chargePattern: "destination",
    },
  });
}

export async function createConnectOnboardingLink(
  organizationId: string,
  refreshUrl: string,
  returnUrl: string,
) {
  const stripe = getStripe();
  const connect = await ensureConnectAccount(organizationId);
  if (!stripe) {
    return { url: returnUrl + "?stub=1", accountId: connect.stripeAccountId };
  }

  const link = await stripe.accountLinks.create({
    account: connect.stripeAccountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return { url: link.url, accountId: connect.stripeAccountId };
}

export async function createDestinationCheckout(params: {
  invoiceId: string;
  amountCents: number;
  currency: string;
  organizationId: string;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
  applicationFeeCents?: number;
}) {
  const stripe = getStripe();
  const connect = await ensureConnectAccount(params.organizationId);
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: params.invoiceId },
  });

  const fee =
    params.applicationFeeCents ??
    Math.round(params.amountCents * (Number(process.env.PLATFORM_FEE_RATE ?? "0.029")));

  if (!stripe) {
    const payment = await prisma.payment.create({
      data: {
        invoiceId: params.invoiceId,
        amountCents: params.amountCents,
        currency: params.currency,
        status: "pending",
        provider: "stripe",
        providerRef: `stub_session_${invoice.number}`,
      },
    });
    return {
      url: params.successUrl.replace("{CHECKOUT_SESSION_ID}", payment.id),
      sessionId: payment.id,
      stub: true as const,
    };
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: params.customerEmail ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: params.currency,
          unit_amount: params.amountCents,
          product_data: {
            name: `Invoice ${invoice.number}`,
            description: invoice.title,
          },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: {
        destination: connect.stripeAccountId,
      },
      metadata: {
        invoiceId: invoice.id,
        organizationId: params.organizationId,
      },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      invoiceId: invoice.id,
      organizationId: params.organizationId,
    },
  });

  await prisma.payment.create({
    data: {
      invoiceId: params.invoiceId,
      amountCents: params.amountCents,
      currency: params.currency,
      status: "pending",
      provider: "stripe",
      stripeCheckoutSessionId: session.id,
    },
  });

  return { url: session.url!, sessionId: session.id, stub: false as const };
}

export async function markPaymentSucceeded(sessionId: string) {
  const payment = await prisma.payment.findFirst({
    where: {
      OR: [{ stripeCheckoutSessionId: sessionId }, { id: sessionId }],
    },
    include: { invoice: true },
  });
  if (!payment) return null;

  await prisma.$transaction([
    prisma.payment.update({
      where: { id: payment.id },
      data: { status: "succeeded" },
    }),
    prisma.invoice.update({
      where: { id: payment.invoiceId },
      data: { status: "paid", lifecyclePhase: "paid", paidAt: new Date() },
    }),
    prisma.receivable.updateMany({
      where: { invoiceId: payment.invoiceId },
      data: { status: "paid", paidAt: new Date() },
    }),
  ]);

  return payment;
}
