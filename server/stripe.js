import Stripe from "stripe";
import { get, now, run, tx } from "./db.js";
import { appUrl, id } from "./domain.js";

let client;

export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

export async function ensureConnectAccount(organizationId) {
  const existing = get(
    `SELECT * FROM stripe_connect_accounts WHERE organizationId = ?`,
    organizationId,
  );
  if (existing) return existing;
  const org = get(`SELECT * FROM organizations WHERE id = ?`, organizationId);
  if (!org) throw new Error("Organization not found");
  const stripe = getStripe();
  const t = now();
  let stripeAccountId = `acct_stub_${organizationId.slice(0, 8)}`;
  if (stripe) {
    const account = await stripe.accounts.create({
      controller: {
        stripe_dashboard: { type: "express" },
        fees: { payer: "application" },
        losses: { payments: "application" },
      },
      capabilities: { transfers: { requested: true } },
      business_profile: { name: org.name },
      metadata: { organizationId, organizationSlug: org.slug },
    });
    stripeAccountId = account.id;
  }
  const rowId = id();
  run(
    `INSERT INTO stripe_connect_accounts
      (id, organizationId, stripeAccountId, dashboard, feesCollector, lossesCollector, chargePattern, onboardingComplete, transfersActive, createdAt, updatedAt)
     VALUES (?, ?, ?, 'express', 'application', 'application', 'destination', 0, 0, ?, ?)`,
    rowId,
    organizationId,
    stripeAccountId,
    t,
    t,
  );
  return get(`SELECT * FROM stripe_connect_accounts WHERE id = ?`, rowId);
}

export async function createConnectOnboardingLink(organizationId) {
  const stripe = getStripe();
  const connect = await ensureConnectAccount(organizationId);
  const returnUrl = appUrl(`/orgs/${organizationId}?connected=1`);
  if (!stripe) return { url: `${returnUrl}&stub=1`, accountId: connect.stripeAccountId };
  const link = await stripe.accountLinks.create({
    account: connect.stripeAccountId,
    refresh_url: appUrl(`/orgs/${organizationId}?connect=refresh`),
    return_url: returnUrl,
    type: "account_onboarding",
  });
  return { url: link.url, accountId: connect.stripeAccountId };
}

export async function refreshConnectAccount(organizationId) {
  const stripe = getStripe();
  const connect = get(
    `SELECT * FROM stripe_connect_accounts WHERE organizationId = ?`,
    organizationId,
  );
  if (!stripe || !connect || String(connect.stripeAccountId).startsWith("acct_stub_")) return connect;
  const account = await stripe.accounts.retrieve(connect.stripeAccountId);
  run(
    `UPDATE stripe_connect_accounts
     SET onboardingComplete = ?, transfersActive = ?, updatedAt = ?
     WHERE id = ?`,
    account.charges_enabled || account.payouts_enabled ? 1 : 0,
    account.payouts_enabled ? 1 : 0,
    now(),
    connect.id,
  );
  return get(`SELECT * FROM stripe_connect_accounts WHERE id = ?`, connect.id);
}

export async function createDestinationCheckout(invoice) {
  const stripe = getStripe();
  const connect = await ensureConnectAccount(invoice.customer.organization.id);
  const fee = Math.round(invoice.amountCents * Number(process.env.PLATFORM_FEE_RATE || "0.029"));
  const t = now();
  if (!stripe) {
    const paymentId = id();
    run(
      `INSERT INTO payments
        (id, invoiceId, amountCents, currency, status, provider, providerRef, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'pending', 'stripe', ?, ?, ?)`,
      paymentId,
      invoice.id,
      invoice.amountCents,
      invoice.currency,
      `stub_session_${invoice.number}`,
      t,
      t,
    );
    return {
      url: appUrl(`/pay/success?session_id=${paymentId}`),
      sessionId: paymentId,
      stub: true,
    };
  }
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.customer.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: invoice.currency,
          unit_amount: invoice.amountCents,
          product_data: {
            name: `Invoice ${invoice.number}`,
            description: invoice.title,
          },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: fee,
      transfer_data: { destination: connect.stripeAccountId },
      metadata: {
        invoiceId: invoice.id,
        organizationId: invoice.customer.organization.id,
      },
    },
    success_url: appUrl("/pay/success?session_id={CHECKOUT_SESSION_ID}"),
    cancel_url: appUrl(`/pay/cancel?invoice=${invoice.id}`),
    metadata: {
      invoiceId: invoice.id,
      organizationId: invoice.customer.organization.id,
    },
  });
  run(
    `INSERT INTO payments
      (id, invoiceId, amountCents, currency, status, provider, stripeCheckoutSessionId, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, 'pending', 'stripe', ?, ?, ?)`,
    id(),
    invoice.id,
    invoice.amountCents,
    invoice.currency,
    session.id,
    t,
    t,
  );
  return { url: session.url, sessionId: session.id, stub: false };
}

export function markPaymentSucceeded(sessionId) {
  const payment = get(
    `SELECT * FROM payments WHERE stripeCheckoutSessionId = ? OR id = ?`,
    sessionId,
    sessionId,
  );
  if (!payment) return null;
  const t = now();
  tx(() => {
    run(`UPDATE payments SET status = 'succeeded', updatedAt = ? WHERE id = ?`, t, payment.id);
    run(
      `UPDATE invoices SET status = 'paid', lifecyclePhase = 'paid', paidAt = ?, updatedAt = ? WHERE id = ?`,
      t,
      t,
      payment.invoiceId,
    );
    run(
      `UPDATE receivables SET status = 'paid', paidAt = ?, updatedAt = ? WHERE invoiceId = ?`,
      t,
      t,
      payment.invoiceId,
    );
  });
  return get(`SELECT * FROM payments WHERE id = ?`, payment.id);
}

export async function completeCheckout(sessionId) {
  const stripe = getStripe();
  if (stripe && String(sessionId).startsWith("cs_")) {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.payment_status !== "paid") return { state: "pending" };
  }
  const payment = markPaymentSucceeded(sessionId);
  if (!payment) return { state: "missing" };
  return { state: "paid", payment };
}

export async function handleWebhook(raw, signature) {
  const stripe = getStripe();
  let event;
  if (stripe && process.env.STRIPE_WEBHOOK_SECRET && signature) {
    event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET);
  } else if (stripe && process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("Missing Stripe signature");
  } else {
    event = JSON.parse(raw.toString("utf8"));
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object;
    if (
      event.type === "checkout.session.completed" &&
      session.payment_status &&
      session.payment_status !== "paid"
    ) {
      return { received: true };
    }
    markPaymentSucceeded(session.id);
  }

  if (event.type === "account.updated") {
    const account = event.data.object;
    run(
      `UPDATE stripe_connect_accounts
       SET onboardingComplete = ?, transfersActive = ?, updatedAt = ?
       WHERE stripeAccountId = ?`,
      account.charges_enabled || account.payouts_enabled ? 1 : 0,
      account.payouts_enabled ? 1 : 0,
      now(),
      account.id,
    );
  }

  return { received: true };
}
