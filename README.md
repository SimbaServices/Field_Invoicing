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
- Works without Stripe keys in **stub mode** for local demos

## Quick start

```bash
npm install
npx prisma migrate dev --name init
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Seeded tenant: **Northline Field Services** with Harbor Municipal Works, a signed receivable, job + sub-PO, and an uploaded invoice scan.

Copy `.env.example` → `.env` and add `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` when ready for live Connect checkout. Webhook endpoint: `POST /api/webhooks/stripe`.

## Key API routes

- `POST /api/organizations` — create tenant
- `POST /api/customers` — customer + terms + optional term sheet
- `POST /api/quotes` · `POST /api/quotes/:id/send`
- `POST /api/purchase-orders` — `{ kind: "job" | "sub" }`
- `GET/PATCH /api/purchase-orders/:id` — cash flow / close
- `POST /api/invoices` — JSON generate or multipart upload
- `POST /api/invoices/:id/sign` · `send-sign-link` · `pay`
- `POST /api/access/:token/sign` · `pay` — limited-access flows
- `POST /api/organizations/:id/connect` — Stripe Connect onboarding
- `POST /api/organizations/:id/integrations` — QuickBooks etc.
- `POST /api/webhooks/stripe`

## Stack

Next.js App Router · Prisma · SQLite (swap `DATABASE_URL` for Postgres in production) · local blob adapter (S3-shaped keys) · Stripe · Zod
