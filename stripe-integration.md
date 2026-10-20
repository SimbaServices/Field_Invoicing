# Stripe integration transcript — Fieldline

This is the integration record for the configuration already chosen for Fieldline. It is a marketplace funds flow: the platform hosts checkout, the customer pays the platform, and the organization receives the remainder on its connected account.

## Configuration

| Decision | Value |
| --- | --- |
| Dashboard | Express (lightweight view for organizations) |
| Fee collection | Your platform manages pricing (`fees.payer: application`) |
| Negative balance liability | Your platform (`losses.payments: application`) |
| Charge pattern | Destination charges |
| Account capability | `transfers` |
| Platform fee | `PLATFORM_FEE_RATE` (default `0.029`) as `application_fee_amount` |

Destination charges make the platform the merchant of record. The platform’s name is the one the customer pays. The organization does not run its own checkout.

With destination charges, Stripe’s processing fee is taken from the platform balance. `application_fee_amount` is how the platform keeps its own fee. Set that amount high enough to cover Stripe’s processing fee and the margin you want. Rates are on [stripe.com/pricing](https://stripe.com/pricing). Do not describe the connected account as the party that pays Stripe’s processing fee on this charge pattern.

When a customer disputes a destination charge, the disputed amount can create a negative balance. Negative balance liability on the platform matches that flow: the platform balance is debited, and the connected account can go negative so the transfer can be reversed.

## What the code does

Implementation: `server/stripe.js`.

1. Creating an organization calls `accounts.create` with the controller block above and requests the `transfers` capability. Without `STRIPE_SECRET_KEY`, the desk stores `acct_stub_…` and continues.
2. **Connect payouts** creates an Account Link (`type: account_onboarding`). The refresh URL is `/orgs/{id}?connect=refresh`. The return URL is `/orgs/{id}?connected=1`, which reloads the account and stores whether charges or payouts are enabled.
3. A signed invoice starts Checkout in `payment` mode. `payment_intent_data.transfer_data.destination` is the organization’s connected account. `payment_intent_data.application_fee_amount` is `round(amountCents * PLATFORM_FEE_RATE)`.
4. Checkout success returns to `/pay/success?session_id={CHECKOUT_SESSION_ID}`. Cancel returns to `/pay/cancel?invoice={id}`.
5. `POST /api/webhooks/stripe` verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET` when both the secret key and the webhook secret are set.
   - `checkout.session.completed` marks the invoice and receivable paid when `payment_status` is `paid`.
   - `checkout.session.async_payment_succeeded` marks them paid.
   - `account.updated` stores onboarding and payout readiness from `charges_enabled` and `payouts_enabled`.

## Turn on live charges

1. In the Stripe Dashboard, finish the Connect platform profile for destination charges and Express onboarding.
2. Put the secret key and webhook secret in `/etc/field-invoicing/env` on the host (or `.env` locally):

   ```
   STRIPE_SECRET_KEY=sk_live_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   PLATFORM_FEE_RATE=0.029
   APP_URL=https://invoice.simba.services
   ```

3. Register the webhook endpoint `https://invoice.simba.services/api/webhooks/stripe` for the three events above. Use the raw request body for signature verification.
4. Restart `field-invoicing`. New organizations then get real connected accounts. **Connect payouts** sends the organization through Express onboarding. Collect payment on a signed invoice opens Checkout and transfers the net amount to that account.

Leave both Stripe variables empty to stay in stub mode. Checkout then completes on `/pay/success` without calling Stripe.
