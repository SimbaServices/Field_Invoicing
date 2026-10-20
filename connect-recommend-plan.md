# Recommended Connect integration plan — Fieldline

## Business summary

Fieldline is a multi-tenant SaaS for field / job invoicing. Organizations use the platform to manage customers, quotes, POs, invoices, e-sign, and receivables. **The platform owns the payment UX** (limited-access payment links emailed on signature) and **brokers funds to each organization’s banking / Connect account**.

## Recommended configuration

| Dimension | Value |
| --- | --- |
| Dashboard | `express` |
| Fees collector | `application` |
| Losses collector | `application` |
| Charge pattern | **Destination charges** |
| Account shape | Recipient (`transfers` capability) |

### Why

- Platform hosts checkout for confirmed receivables → platform is merchant of record for the charge → destination charges.
- Organizations need low-ops payout onboarding → Express dashboard.
- Destination charges require platform-owned fee pricing and negative-balance liability.

### Embedded components (when wiring live Connect UI)

- `account_onboarding`
- `notification_banner` (required)
- `account_management`
- `payments`, `payouts`

### Implementation notes

- Code path: `src/lib/stripe.ts` (`transfer_data.destination` + `application_fee_amount`).
- Webhooks: `POST /api/webhooks/stripe` handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `account.updated`.
- Stub mode runs without `STRIPE_SECRET_KEY` for local demos.
