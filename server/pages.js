import { countdown, money } from "./domain.js";

export function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function badge(status) {
  const ok = ["paid", "accepted", "connected", "signed", "closed"];
  const danger = ["overdue", "failed", "declined", "cancelled"];
  const kind = ok.includes(status) ? "ok" : danger.includes(status) ? "danger" : "warn";
  return `<span class="badge badge-${kind}">${esc(status)}</span>`;
}

function poOptions(options, selected = "") {
  const items = (options || [])
    .map(
      (po) =>
        `<option value="${esc(po.id)}"${po.id === selected ? " selected" : ""}>${esc(po.number)} — ${esc(po.title)}</option>`,
    )
    .join("");
  return `<option value="">None</option>${items}`;
}

export function layout({ title, crumb, body, notice, error }) {
  const flash = error
    ? `<p class="flash flash-error">${esc(error)}</p>`
    : notice
      ? `<p class="flash flash-ok">${esc(notice)}</p>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)} — Fieldline</title>
  <link rel="stylesheet" href="/assets/app.css">
  <script src="/assets/htmx.min.js"></script>
</head>
<body hx-boost="true">
  <header class="top">
    <a class="brand" href="/">Fieldline</a>
    <p class="crumb">${crumb ? esc(crumb) : "Digital ticketing & receivables"}</p>
  </header>
  <main class="wrap">
    ${flash}
    ${body}
  </main>
  <script src="/assets/app.js"></script>
</body>
</html>`;
}

function shell(opts, inner) {
  return layout({ ...opts, body: inner });
}

export function home({ orgs, notice, error }) {
  const list = orgs.length
    ? `<ul class="stack">${orgs
        .map(
          (org) => `<li><a class="row" href="/orgs/${esc(org.id)}">
            <span><strong>${esc(org.name)}</strong><small>/${esc(org.slug)} · ${Number(org.customerCount)} customers · Connect ${org.connect?.onboardingComplete ? "ready" : "pending"}</small></span>
            <span class="go">View →</span>
          </a></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No organizations yet. Create one to open a tenant.</p>`;
  return shell(
    { title: "Organizations", notice, error },
    `<section class="hero">
      <p class="kicker">Multi-tenant field operations</p>
      <h1>Fieldline</h1>
      <p>Assisted term sheets, quotes, job POs with optional sub-POs, digitized invoices, e-sign, receivable countdowns, and payment brokering.</p>
    </section>
    <div class="grid-2">
      <section class="panel">
        <h2>Organizations</h2>
        <p class="muted">Each organization is an isolated tenant with its own customers, banking destinations, and integrations.</p>
        ${list}
      </section>
      <section class="panel" id="create">
        <h2>New organization</h2>
        <form method="post" action="/organizations" class="stack">
          <label class="field">Organization name<input name="name" required placeholder="Northline Field Services" data-slug-source></label>
          <label class="field">Slug<input name="slug" required pattern="[a-z0-9-]+" placeholder="northline" data-slug-target></label>
          <label class="field">Owner name<input name="ownerName" required placeholder="Alex Rivera"></label>
          <label class="field">Owner email<input name="ownerEmail" type="email" required placeholder="ops@example.com"></label>
          <button class="btn btn-primary" type="submit">Create organization</button>
        </form>
      </section>
    </div>`,
  );
}

export function orgPage({ org, notice, error }) {
  const customers = org.customers.length
    ? `<ul class="stack">${org.customers
        .map(
          (c) => `<li><a class="row" href="/customers/${esc(c.id)}">
            <span><strong>${esc(c.name)}</strong><small>${esc(c.termsName || "No terms")} · ${Number(c.poCount)} POs · ${Number(c.invoiceCount)} invoices</small></span>
            <span class="go">Open →</span>
          </a></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No customers yet.</p>`;
  const banks = org.banking.length
    ? `<ul class="stack">${org.banking
        .map(
          (b) => `<li class="row static"><span><strong>${esc(b.label)}</strong><small>${esc(b.provider)}${b.isDefault ? " · default" : ""}${b.accountLast4 ? ` · ···${esc(b.accountLast4)}` : ""}</small></span></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No payout destinations yet.</p>`;
  const integrations = org.integrations.length
    ? `<ul class="stack">${org.integrations
        .map(
          (i) => `<li class="row static"><span><strong class="cap">${esc(i.provider)}</strong><small>${esc(i.status)}${i.externalRealmId ? ` · ${esc(i.externalRealmId)}` : ""}</small></span></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No integrations connected.</p>`;
  const connect = org.connect;
  return shell(
    { title: org.name, crumb: org.name, notice, error },
    `<div class="page-head">
      <h1>${esc(org.name)}</h1>
      <p class="muted">Tenant <code>/${esc(org.slug)}</code> · ${org.users.length} users · ${org.customers.length} customers</p>
    </div>
    <div class="grid-2">
      <section class="panel wide">
        <h2>Customers</h2>
        ${customers}
      </section>
      <section class="panel">
        <h2>New customer</h2>
        <p class="muted">Creates payment terms and an assisted term sheet draft.</p>
        <form method="post" action="/orgs/${esc(org.id)}/customers" class="stack">
          <label class="field">Customer name<input name="name" required></label>
          <label class="field">Primary email<input name="email" type="email"></label>
          <div class="split">
            <label class="field">Terms name<input name="termsName" value="Net 30"></label>
            <label class="field">Net days<input name="netDays" type="number" min="1" value="30"></label>
          </div>
          <button class="btn btn-primary" type="submit">Create with term sheet</button>
        </form>
      </section>
    </div>
    <div class="grid-2">
      <section class="panel">
        <h2>Banking & Connect</h2>
        <p class="muted">Destination charges broker customer payments to this organization's connected account.</p>
        ${banks}
        <p>Stripe Connect: <code>${esc(connect?.stripeAccountId || "not linked")}</code><br>
        Pattern: ${esc(connect?.chargePattern || "destination")} · dashboard ${esc(connect?.dashboard || "express")}
        · ${connect?.onboardingComplete ? "onboarding complete" : "onboarding pending"}</p>
        <form method="post" action="/orgs/${esc(org.id)}/banking" class="stack tight">
          <div class="split">
            <label class="field">Label<input name="label" required placeholder="Operating account"></label>
            <label class="field">Provider
              <select name="provider">
                <option value="manual">manual</option>
                <option value="ach">ach</option>
                <option value="stripe_connect">stripe_connect</option>
                <option value="plaid">plaid</option>
              </select>
            </label>
          </div>
          <div class="split">
            <label class="field">Account last 4<input name="accountLast4" maxlength="4" inputmode="numeric"></label>
            <label class="field">Routing last 4<input name="routingLast4" maxlength="4" inputmode="numeric"></label>
          </div>
          <label class="check"><input type="checkbox" name="isDefault" value="1"> Default payout destination</label>
          <button class="btn btn-ghost" type="submit">Save banking destination</button>
        </form>
        <form method="post" action="/orgs/${esc(org.id)}/connect" hx-boost="false">
          <button class="btn btn-secondary" type="submit">Connect payouts</button>
        </form>
      </section>
      <section class="panel">
        <h2>Integrations</h2>
        ${integrations}
        <form method="post" action="/orgs/${esc(org.id)}/integrations" class="stack tight">
          <label class="field">QuickBooks realm id<input name="realmId" placeholder="Optional — a stub realm is used if blank"></label>
          <button class="btn btn-ghost" type="submit">Connect QuickBooks</button>
        </form>
      </section>
    </div>`,
  );
}

export function customerPage({ customer, notice, error }) {
  const terms = customer.paymentTerms;
  const invoices = customer.invoices.length
    ? customer.invoices
        .map((inv) => {
          const due = inv.dueAt ? countdown(inv.dueAt) : null;
          const actions = [];
          if (inv.status === "pending") {
            actions.push(`<form method="post" action="/invoices/${esc(inv.id)}/sign" class="inline">
              <input name="signedByName" required placeholder="Signer name">
              <input name="signedByEmail" type="email" required placeholder="Signer email">
              <button class="btn btn-primary" type="submit">Sign</button>
            </form>
            <form method="post" action="/invoices/${esc(inv.id)}/sign-link">
              <button class="btn btn-ghost" type="submit">Send sign link</button>
            </form>`);
          }
          if (inv.status === "signed") {
            actions.push(`<form method="post" action="/invoices/${esc(inv.id)}/pay" hx-boost="false">
              <button class="btn btn-secondary" type="submit">Collect payment</button>
            </form>`);
          }
          actions.push(`<form method="post" action="/invoices/${esc(inv.id)}/quickbooks">
            <button class="btn btn-ghost" type="submit">Sync QBO</button>
          </form>`);
          return `<article class="card">
            <div>
              <p class="title">${esc(inv.number)} — ${esc(inv.title)} ${badge(inv.status)} <span class="badge">${esc(inv.source)}</span></p>
              <p class="muted">${money(inv.amountCents, inv.currency)}${inv.poNumber ? ` · ${esc(inv.poNumber)}` : ""}${inv.blobFilename ? ` · <a href="/invoices/${esc(inv.id)}/file" hx-boost="false">${esc(inv.blobFilename)}</a>` : ""}</p>
              ${due ? `<p class="${due.overdue ? "danger" : "tide"}">Receivable: ${esc(due.label)}</p>` : ""}
            </div>
            <div class="actions">${actions.join("")}</div>
          </article>`;
        })
        .join("")
    : `<p class="muted">No invoices yet.</p>`;

  const emails = customer.emailConfigs.length
    ? `<ul class="plain">${customer.emailConfigs
        .map(
          (e) =>
            `<li><strong class="cap">${esc(e.purpose)}/${esc(e.role)}</strong>: ${esc(e.email)}</li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No email routes yet.</p>`;

  const sheets = customer.termSheets
    .map(
      (t) => `<details class="sheet">
        <summary><strong>${esc(t.title)}</strong> <span class="muted">${esc(t.status)} · ${esc(t.assistedBy || "template")}</span></summary>
        <pre>${esc(t.contentMarkdown || "")}</pre>
      </details>`,
    )
    .join("");

  const quotes = customer.quotes.length
    ? `<ul class="stack">${customer.quotes
        .map(
          (q) =>
            `<li class="row static"><span>${esc(q.number)} — ${esc(q.title)}</span><span>${money(q.totalCents, q.currency)} ${badge(q.status)}</span></li>`,
        )
        .join("")}</ul>`
    : `<p class="muted">No quotes yet.</p>`;

  const flows = customer.flows
    .map((flow) => {
      const po = flow.purchaseOrder;
      const subs = flow.subPos.length
        ? `<ul class="plain">${flow.subPos
            .map(
              (s) =>
                `<li>Sub-PO ${esc(s.number)} (parent ${esc(s.parentNumber)}): pending ${money(s.pending)}, paid ${money(s.paid)}</li>`,
            )
            .join("")}</ul>`
        : "";
      return `<article class="card flat">
        <div>
          <p class="title">${esc(po.number)} — ${esc(po.title)} ${badge(po.status)}</p>
          <p class="muted">Job code ${esc(po.jobCode)} · Pending ${money(flow.job.pending)} · Signed ${money(flow.job.signed)} · Paid ${money(flow.job.paid)}</p>
          ${subs}
        </div>
        <form method="post" action="/purchase-orders/${esc(po.id)}/sub" class="split end">
          <label class="field">Add sub-PO<input name="title" required placeholder="Optional cash-flow split"></label>
          <label class="field">Budget<input name="budget" type="number" min="0" step="0.01"></label>
          <button class="btn btn-ghost" type="submit">Add</button>
        </form>
        ${po.status !== "closed" ? `<form method="post" action="/purchase-orders/${esc(po.id)}/close"><button class="btn btn-ghost" type="submit">Close PO</button></form>` : ""}
      </article>`;
    })
    .join("");

  return shell(
    {
      title: customer.name,
      crumb: `${customer.organization.name} / ${customer.name}`,
      notice,
      error,
    },
    `<p><a class="back" href="/orgs/${esc(customer.organizationId)}">← ${esc(customer.organization.name)}</a></p>
    <div class="page-head">
      <h1>${esc(customer.name)}</h1>
      <p class="muted">${esc(terms?.name || "No payment terms")} · Net ${esc(terms?.netDays ?? "—")} days</p>
    </div>
    <div class="grid-side">
      <section class="panel">
        <h2>Invoices</h2>
        <div class="stack">${invoices}</div>
      </section>
      <aside class="stack">
        <section class="panel">
          <h2>Email routing</h2>
          ${emails}
        </section>
        <section class="panel">
          <h2>Term sheets</h2>
          ${sheets || `<p class="muted">No drafts yet.</p>`}
          <form method="post" action="/customers/${esc(customer.id)}/term-sheets">
            <button class="btn btn-ghost" type="submit">Generate assisted term sheet</button>
          </form>
        </section>
      </aside>
    </div>
    <div class="grid-2">
      <section class="panel">
        <h2>Quotes</h2>
        ${quotes}
        <form method="post" action="/customers/${esc(customer.id)}/quotes" class="stack tight">
          <label class="field">Title<input name="title" required placeholder="Site work package"></label>
          <label class="field">Line item<input name="description" required placeholder="Mobilization"></label>
          <div class="split">
            <label class="field">Qty<input name="quantity" type="number" min="0.01" step="0.01" value="1"></label>
            <label class="field">Amount ($)<input name="amount" type="number" min="0.01" step="0.01" required></label>
          </div>
          <button class="btn btn-primary" type="submit">Create & email quote</button>
        </form>
      </section>
      <section class="panel">
        <h2>Job POs & cash flow</h2>
        <div class="stack">${flows || `<p class="muted">No job POs yet.</p>`}</div>
        <form method="post" action="/customers/${esc(customer.id)}/purchase-orders" class="stack tight">
          <p class="label">New job PO</p>
          <label class="field">Title<input name="title" required></label>
          <div class="split">
            <label class="field">Job code<input name="jobCode" placeholder="HRB-P4"></label>
            <label class="field">Budget ($)<input name="budget" type="number" min="0" step="0.01"></label>
          </div>
          <button class="btn btn-secondary" type="submit">Create job PO</button>
        </form>
      </section>
    </div>
    <section class="panel">
      <h2>Create / upload invoice</h2>
      <div class="grid-2">
        <form method="post" action="/customers/${esc(customer.id)}/invoices" class="stack">
          <p class="label">Generate in-app</p>
          <label class="field">Title<input name="title" required></label>
          <label class="field">Description<input name="description" required></label>
          <label class="field">Amount ($)<input name="amount" type="number" min="0.01" step="0.01" required></label>
          <label class="field">PO (optional)<select name="purchaseOrderId">${poOptions(customer.poOptions)}</select></label>
          <button class="btn btn-primary" type="submit">Create invoice</button>
        </form>
        <form method="post" action="/customers/${esc(customer.id)}/invoices/upload" enctype="multipart/form-data" class="stack">
          <p class="label">Upload hard-copy (digitize)</p>
          <label class="field">Title<input name="title" required></label>
          <label class="field">Amount ($)<input name="amount" type="number" min="0.01" step="0.01" required></label>
          <label class="field">Lifecycle phase at upload
            <select name="lifecyclePhase">
              <option value="pending">pending</option>
              <option value="signed">signed</option>
              <option value="paid">paid</option>
            </select>
          </label>
          <label class="field">PO (optional)<select name="purchaseOrderId">${poOptions(customer.poOptions)}</select></label>
          <label class="field">Scan / PDF<input name="file" type="file" required></label>
          <button class="btn btn-secondary" type="submit">Upload & digitize</button>
        </form>
      </div>
    </section>`,
  );
}

function publicHead(kicker) {
  return `<p class="kicker">${esc(kicker)}</p><h1>Fieldline</h1>`;
}

export function signPage({ access, notice, error, done }) {
  const invoice = access.invoice;
  const finished = done || invoice.status === "signed" || invoice.status === "paid";
  const form = finished
    ? `<p class="panel ok">${done || `This invoice has already been ${esc(invoice.status)}.`}</p>`
    : `<form method="post" action="/sign/${esc(access.token)}" class="panel stack">
        <label class="field">Full name<input name="signedByName" required></label>
        <label class="field">Email<input name="signedByEmail" type="email" required></label>
        <label class="field">Signature
          <canvas data-sign-pad width="480" height="140"></canvas>
          <input type="hidden" name="signatureData">
        </label>
        <p class="muted">By signing you confirm this invoice as a receivable under the customer's payment terms. No account is required.</p>
        <button class="btn btn-primary" type="submit">Sign invoice</button>
      </form>`;
  return shell(
    { title: `Sign ${invoice.number}`, crumb: "Limited-access signing", notice, error },
    `<section class="narrow">
      ${publicHead("Limited-access signing")}
      <p class="muted">Review and sign invoice ${esc(invoice.number)} for ${esc(invoice.customer.organization.name)}.</p>
      <section class="panel">
        <h2>${esc(invoice.title)}</h2>
        <p class="amount">${money(invoice.amountCents, invoice.currency)}</p>
        <p class="muted">Customer: ${esc(invoice.customer.name)}${invoice.purchaseOrder ? ` · PO ${esc(invoice.purchaseOrder.number)}` : ""}</p>
        ${invoice.description ? `<p>${esc(invoice.description)}</p>` : ""}
      </section>
      ${form}
    </section>`,
  );
}

export function payPage({ access, notice, error }) {
  const invoice = access.invoice;
  const due = invoice.receivable ? countdown(invoice.receivable.dueAt) : null;
  let action;
  if (invoice.status === "paid") action = `<p class="panel ok">This invoice is already paid.</p>`;
  else if (invoice.status !== "signed") action = `<p class="panel warn">This invoice must be signed before payment.</p>`;
  else {
    action = `<form method="post" action="/pay/${esc(access.token)}" class="panel" hx-boost="false">
      <button class="btn btn-primary" type="submit">Pay securely</button>
    </form>`;
  }
  return shell(
    { title: `Pay ${invoice.number}`, crumb: "Limited-access payment", notice, error },
    `<section class="narrow">
      ${publicHead("Limited-access payment")}
      <p class="muted">Pay the confirmed receivable for invoice ${esc(invoice.number)}. Funds are brokered to ${esc(invoice.customer.organization.name)}.</p>
      <section class="panel">
        <h2>${esc(invoice.title)}</h2>
        <p class="amount">${money(invoice.amountCents, invoice.currency)}</p>
        ${due ? `<p class="${due.overdue ? "danger" : "tide"}">${esc(due.label)}</p>` : ""}
        <p class="muted">Status: ${esc(invoice.status)}</p>
      </section>
      ${action}
    </section>`,
  );
}

export function resultPage({ title, crumb, message, href, hrefLabel, notice, error, tone = "ok" }) {
  return shell(
    { title, crumb, notice, error },
    `<section class="narrow">
      ${publicHead(crumb)}
      <p class="panel ${tone}">${esc(message)}</p>
      ${href ? `<p><a class="btn btn-secondary" href="${esc(href)}">${esc(hrefLabel || "Continue")}</a></p>` : ""}
    </section>`,
  );
}

export function notFound(message = "That page is not available.") {
  return shell({ title: "Not found" }, `<section class="narrow"><h1>Not found</h1><p class="muted">${esc(message)}</p><p><a href="/">Back to the desk</a></p></section>`);
}
