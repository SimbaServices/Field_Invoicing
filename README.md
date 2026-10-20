# Fieldline — Digital ticketing & receivables

Multi-tenant field invoicing platform for organizations that need assisted payment terms, quotes, job/purchase orders (with optional sub-POs), invoice generation & hard-copy digitization, e-sign, receivable countdowns, and payment brokering to connected banking accounts.

## Capabilities

| Area | What it does |
| --- | --- |
| **Organizations** | Indefinite separately operating tenants with users, banking destinations, and integrations |
| **Customers** | Under an org; payment terms + configurable sender/recipient emails per purpose (quote / signing / payment) |
| **Term sheets** | Assisted automated drafts from payment terms |
| **Quotes** | Create and email to configured recipients |
| **Job POs & sub-POs** | Parent job POs; optional sub-POs inherit `parentNumber` + shared `jobCode` for cash-flow structure |
| **Invoices** | Generated in-app or uploaded (digitized). Upload assigns lifecycle phase (`pending` / `signed` / `paid`); thereafter identical storage & handling. Blobs under `orgs/{org}/customers/{customer}/invoices/{id}/` |
| **E-sign** | In-app sign action, or limited-access `/sign/{token}` link (no account) |
| **Receivables** | Created on signature; countdown uses customer Net days |
| **Payments** | On sign, payment link emailed automatically. Stripe Connect **destination charges** broker funds to the org’s connected account. Limited-access `/pay/{token}` |
| **Integrations** | QuickBooks connect/sync stubs; banking account registry for multi-provider payouts |

## Stripe Connect model

- **Charge pattern:** destination charges (platform hosts payment links; org receives funds)
- **Dashboard:** Express
- **Fees / losses collector:** application (platform)
- Works without Stripe keys in **stub mode**
- Setup record: [stripe-integration.md](stripe-integration.md)

## Quick start

```bash
npm install
npm start
```

Open [http://127.0.0.1:8791](http://127.0.0.1:8791). Copy `.env.example` → `.env` and add `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` when ready for live Connect checkout. Without those keys, Connect and checkout run in stub mode. Webhook endpoint: `POST /api/webhooks/stripe`.

## Stack

Node HTTP server · HTMX · vanilla JS · SQLite for records · filesystem for invoice scans · Stripe for destination charges and Connect onboarding. The only package dependency is Stripe.
