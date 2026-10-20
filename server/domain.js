import { randomBytes, randomUUID } from "node:crypto";
import { all, count, get, now, run, tx } from "./db.js";
import { invoiceStorageKey, putBlob, readBlob } from "./blobs.js";

export function id() {
  return randomUUID();
}

export function appUrl(pathname) {
  const base = process.env.APP_URL || "http://127.0.0.1:8791";
  return `${base.replace(/\/$/, "")}${pathname}`;
}

export function money(cents, currency = "usd") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: String(currency || "usd").toUpperCase(),
  }).format((Number(cents) || 0) / 100);
}

export function dollarsToCents(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error("Amount must be a positive number");
  return Math.round(n * 100);
}

function addDays(iso, days) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + Number(days));
  return d.toISOString();
}

export function countdown(dueAt, nowDate = new Date()) {
  const ms = new Date(dueAt).getTime() - nowDate.getTime();
  const overdue = ms < 0;
  const abs = Math.abs(ms);
  const minutes = Math.max(1, Math.round(abs / 60000));
  let span;
  if (minutes < 90) span = `${minutes} minute${minutes === 1 ? "" : "s"}`;
  else {
    const hours = Math.round(minutes / 60);
    if (hours < 48) span = `${hours} hour${hours === 1 ? "" : "s"}`;
    else {
      const days = Math.round(hours / 24);
      span = `${days} day${days === 1 ? "" : "s"}`;
    }
  }
  return { overdue, label: overdue ? `Overdue by ${span}` : `Due in ${span}` };
}

function requireEmail(value, label) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim())) {
    throw new Error(`${label} is invalid`);
  }
  return String(value).trim();
}

export function refreshOverdue() {
  const t = now();
  run(
    `UPDATE receivables SET status = 'overdue', updatedAt = ? WHERE status = 'open' AND dueAt < ?`,
    t,
    t,
  );
}

export function generateTermSheetDraft(input) {
  const sections = [
    {
      heading: "Parties",
      body: `This payment terms agreement is between ${input.organizationName} (“Provider”) and ${input.customerName} (“Customer”).`,
    },
    {
      heading: "Payment timing",
      body: `Invoices are due within ${input.netDays} days of the Customer’s digital signature confirming the receivable (Net ${input.netDays}).`,
    },
    {
      heading: "Currency",
      body: `All amounts are denominated in ${String(input.currency).toUpperCase()} unless otherwise stated on the invoice.`,
    },
  ];
  if (input.earlyPayDiscount) {
    sections.push({
      heading: "Early payment discount",
      body: `A ${input.earlyPayDiscount}% discount may apply when payment is received within 10 days of signature.`,
    });
  }
  if (input.lateFeePercent) {
    sections.push({
      heading: "Late fees",
      body: `Past-due balances may incur a late fee of ${input.lateFeePercent}% per month on the outstanding principal.`,
    });
  }
  sections.push({
    heading: "Invoicing & signature",
    body: "Invoices may be generated in-app or digitized from hard-copy uploads. Signing (in-app or via limited-access link) confirms the receivable and starts the payment-term countdown.",
  });
  sections.push({
    heading: "Payment methods",
    body: "Upon signature, Customer will receive a limited-access payment link for the confirmed receivable. Payments may be processed through connected banking and accounting integrations configured by Provider.",
  });
  if (input.notes) sections.push({ heading: "Additional notes", body: input.notes });
  const markdown = sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  return { title: `Payment Terms — ${input.customerName}`, sections, markdown };
}

function fromAddress(purpose) {
  return (
    process.env.DEFAULT_FROM_EMAIL ||
    (purpose === "quote" ? "quotes@invoice.simba.services" : "billing@invoice.simba.services")
  );
}

export function resolveCustomerEmails(customerId, purpose) {
  const configs = all(`SELECT * FROM customer_email_configs WHERE customerId = ?`, customerId);
  const pick = (role) => {
    const exact = configs.filter((c) => c.role === role && c.purpose === purpose);
    if (exact.length) return exact;
    return configs.filter((c) => c.role === role && c.purpose === "general");
  };
  let recipients = pick("recipient");
  if (recipients.length === 0) {
    const customer = get(`SELECT email, name FROM customers WHERE id = ?`, customerId);
    if (customer?.email) recipients = [{ email: customer.email, name: customer.name }];
  }
  const seen = new Set();
  return {
    senders: pick("sender").map((s) => ({ email: s.email, name: s.name })),
    recipients: recipients
      .filter((r) => (seen.has(r.email) ? false : seen.add(r.email)))
      .map((r) => ({ email: r.email, name: r.name })),
  };
}

export function sendEmail(input) {
  console.info("[email]", {
    from: input.fromEmail,
    to: input.to,
    subject: input.subject,
    purpose: input.purpose,
  });
  const t = now();
  const rowId = id();
  run(
    `INSERT INTO outbound_emails
      (id, customerId, toJson, fromEmail, subject, bodyText, purpose, status, relatedType, relatedId, sentAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?, ?, ?, ?)`,
    rowId,
    input.customerId || null,
    JSON.stringify(input.to),
    input.fromEmail,
    input.subject,
    input.bodyText,
    input.purpose,
    input.relatedType || null,
    input.relatedId || null,
    t,
    t,
  );
  return get(`SELECT * FROM outbound_emails WHERE id = ?`, rowId);
}

export function createAccessToken(invoiceId, purpose, ttlDays = 14) {
  const t = now();
  const rowId = id();
  const token = randomBytes(24).toString("base64url");
  run(
    `INSERT INTO access_tokens (id, invoiceId, token, purpose, expiresAt, createdAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    rowId,
    invoiceId,
    token,
    purpose,
    addDays(t, ttlDays),
    t,
  );
  return get(`SELECT * FROM access_tokens WHERE id = ?`, rowId);
}

export function resolveAccessToken(token, purpose) {
  const record = get(`SELECT * FROM access_tokens WHERE token = ?`, token);
  if (!record) return null;
  if (purpose && record.purpose !== purpose) return null;
  if (new Date(record.expiresAt) < new Date()) return null;
  const invoice = loadInvoice(record.invoiceId);
  if (!invoice) return null;
  return { ...record, invoice };
}

export function createOrganization({ name, slug, ownerName, ownerEmail }) {
  const cleanName = String(name || "").trim();
  const cleanSlug = String(slug || "").trim();
  if (cleanName.length < 2) throw new Error("Organization name is required");
  if (!/^[a-z0-9-]{2,}$/.test(cleanSlug)) {
    throw new Error("Slug must be lowercase letters, numbers, and hyphens");
  }
  const email = requireEmail(ownerEmail, "Owner email");
  const owner = String(ownerName || "").trim();
  if (!owner) throw new Error("Owner name is required");
  if (get(`SELECT id FROM organizations WHERE slug = ?`, cleanSlug)) {
    throw new Error("That slug is already in use");
  }
  const orgId = id();
  const t = now();
  tx(() => {
    run(
      `INSERT INTO organizations (id, name, slug, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
      orgId,
      cleanName,
      cleanSlug,
      t,
      t,
    );
    run(
      `INSERT INTO users (id, organizationId, email, name, role, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'owner', ?, ?)`,
      id(),
      orgId,
      email,
      owner,
      t,
      t,
    );
  });
  return get(`SELECT * FROM organizations WHERE id = ?`, orgId);
}

export function listOrganizations() {
  refreshOverdue();
  return all(`SELECT * FROM organizations ORDER BY createdAt DESC`).map((org) => ({
    ...org,
    customerCount: count(`SELECT COUNT(*) AS n FROM customers WHERE organizationId = ?`, org.id),
    connect: get(`SELECT * FROM stripe_connect_accounts WHERE organizationId = ?`, org.id),
  }));
}

export function loadOrg(orgId) {
  const org = get(`SELECT * FROM organizations WHERE id = ?`, orgId);
  if (!org) return null;
  return {
    ...org,
    customers: all(
      `SELECT customers.*,
              payment_terms.name AS termsName,
              (SELECT COUNT(*) FROM invoices WHERE invoices.customerId = customers.id) AS invoiceCount,
              (SELECT COUNT(*) FROM purchase_orders WHERE purchase_orders.customerId = customers.id) AS poCount
       FROM customers
       LEFT JOIN payment_terms ON payment_terms.customerId = customers.id
       WHERE customers.organizationId = ?
       ORDER BY customers.createdAt DESC`,
      orgId,
    ),
    users: all(`SELECT * FROM users WHERE organizationId = ? ORDER BY createdAt`, orgId),
    banking: all(
      `SELECT * FROM banking_accounts WHERE organizationId = ? ORDER BY createdAt DESC`,
      orgId,
    ),
    integrations: all(`SELECT * FROM integration_configs WHERE organizationId = ?`, orgId),
    connect: get(`SELECT * FROM stripe_connect_accounts WHERE organizationId = ?`, orgId),
  };
}

function saveTermSheet(customer, org, terms, assistedBy = "template") {
  const draft = generateTermSheetDraft({
    customerName: customer.name,
    organizationName: org.name,
    netDays: terms.netDays,
    earlyPayDiscount: terms.earlyPayDiscount,
    lateFeePercent: terms.lateFeePercent,
    currency: terms.currency,
    notes: terms.notes,
  });
  const t = now();
  const rowId = id();
  run(
    `INSERT INTO term_sheets
      (id, customerId, title, status, contentJson, contentMarkdown, assistedBy, createdAt, updatedAt)
     VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?)`,
    rowId,
    customer.id,
    draft.title,
    JSON.stringify(draft.sections),
    draft.markdown,
    assistedBy,
    t,
    t,
  );
  return get(`SELECT * FROM term_sheets WHERE id = ?`, rowId);
}

export function createCustomer(input) {
  const org = get(`SELECT * FROM organizations WHERE id = ?`, input.organizationId);
  if (!org) throw new Error("Organization not found");
  const name = String(input.name || "").trim();
  if (!name) throw new Error("Customer name is required");
  const email = String(input.email || "").trim();
  if (email) requireEmail(email, "Customer email");
  const netDays = Number(input.netDays || 30);
  if (!Number.isInteger(netDays) || netDays < 1) throw new Error("Net days must be at least 1");
  const termsName = String(input.termsName || "Net 30").trim() || "Net 30";
  const customerId = id();
  const t = now();
  tx(() => {
    run(
      `INSERT INTO customers
        (id, organizationId, name, legalName, email, phone, billingAddress, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      customerId,
      org.id,
      name,
      input.legalName || null,
      email || null,
      input.phone || null,
      input.billingAddress || null,
      t,
      t,
    );
    run(
      `INSERT INTO payment_terms
        (id, customerId, name, netDays, currency, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'usd', ?, ?)`,
      id(),
      customerId,
      termsName,
      netDays,
      t,
      t,
    );
    if (email) {
      for (const purpose of ["general", "quote", "signing", "payment"]) {
        run(
          `INSERT INTO customer_email_configs
            (id, customerId, purpose, role, email, name, isDefault, createdAt)
           VALUES (?, ?, ?, 'recipient', ?, ?, 1, ?)`,
          id(),
          customerId,
          purpose,
          email,
          name,
          t,
        );
      }
    }
  });
  const customer = get(`SELECT * FROM customers WHERE id = ?`, customerId);
  const terms = get(`SELECT * FROM payment_terms WHERE customerId = ?`, customerId);
  saveTermSheet(customer, org, terms);
  return customer;
}

export function createTermSheet(customerId) {
  const customer = get(`SELECT * FROM customers WHERE id = ?`, customerId);
  if (!customer) throw new Error("Customer not found");
  const org = get(`SELECT * FROM organizations WHERE id = ?`, customer.organizationId);
  const terms = get(`SELECT * FROM payment_terms WHERE customerId = ?`, customerId);
  if (!terms) throw new Error("Add payment terms before generating a term sheet");
  return saveTermSheet(customer, org, terms);
}

export function createQuote(input) {
  const customer = get(`SELECT id FROM customers WHERE id = ?`, input.customerId);
  if (!customer) throw new Error("Customer not found");
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  if (!title || !description) throw new Error("Quote title and line item are required");
  const quantity = Number(input.quantity || 1);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error("Quantity must be positive");
  const unitCents = dollarsToCents(input.amount);
  if (unitCents <= 0) throw new Error("Amount must be greater than zero");
  const lineItems = [{ description, quantity, unitCents }];
  const subtotalCents = Math.round(quantity * unitCents);
  const t = now();
  const rowId = id();
  const quote = tx(() => {
    const number = `Q-${String(count(`SELECT COUNT(*) AS n FROM quotes WHERE customerId = ?`, input.customerId) + 1).padStart(4, "0")}`;
    run(
      `INSERT INTO quotes
        (id, customerId, number, title, status, lineItemsJson, subtotalCents, taxCents, totalCents, currency, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'draft', ?, ?, 0, ?, 'usd', ?, ?)`,
      rowId,
      input.customerId,
      number,
      title,
      JSON.stringify(lineItems),
      subtotalCents,
      subtotalCents,
      t,
      t,
    );
    return get(`SELECT * FROM quotes WHERE id = ?`, rowId);
  });
  return sendQuote(quote.id);
}

export function sendQuote(quoteId) {
  const quote = get(`SELECT * FROM quotes WHERE id = ?`, quoteId);
  if (!quote) throw new Error("Quote not found");
  const emails = resolveCustomerEmails(quote.customerId, "quote");
  const recipients = emails.recipients.map((r) => r.email);
  const from = emails.senders[0]?.email || fromAddress("quote");
  sendEmail({
    customerId: quote.customerId,
    to: recipients,
    fromEmail: from,
    subject: `Quote ${quote.number}: ${quote.title}`,
    bodyText: [
      `Quote ${quote.number} — ${quote.title}`,
      `Total: ${money(quote.totalCents, quote.currency)}`,
      quote.notes ? `\nNotes: ${quote.notes}` : "",
      "",
      "Reply to accept this quote or contact your account representative.",
    ].join("\n"),
    purpose: "quote",
    relatedType: "quote",
    relatedId: quote.id,
  });
  const t = now();
  run(
    `UPDATE quotes SET status = 'sent', sentAt = ?, sentToJson = ?, updatedAt = ? WHERE id = ?`,
    t,
    JSON.stringify(recipients),
    t,
    quote.id,
  );
  return get(`SELECT * FROM quotes WHERE id = ?`, quote.id);
}

export function createJobPo(input) {
  const customer = get(`SELECT id FROM customers WHERE id = ?`, input.customerId);
  if (!customer) throw new Error("Customer not found");
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Job PO title is required");
  const budgetCents = input.budget ? dollarsToCents(input.budget) : null;
  const t = now();
  return tx(() => {
    const n = count(
      `SELECT COUNT(*) AS n FROM purchase_orders WHERE customerId = ? AND parentPoId IS NULL`,
      input.customerId,
    );
    const number = `PO-${String(n + 1).padStart(4, "0")}`;
    const jobCode = String(input.jobCode || "").trim() || number;
    const rowId = id();
    run(
      `INSERT INTO purchase_orders
        (id, customerId, number, title, status, budgetCents, currency, jobCode, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, 'open', ?, 'usd', ?, ?, ?)`,
      rowId,
      input.customerId,
      number,
      title,
      budgetCents,
      jobCode,
      t,
      t,
    );
    return get(`SELECT * FROM purchase_orders WHERE id = ?`, rowId);
  });
}

export function createSubPo(input) {
  const parent = get(`SELECT * FROM purchase_orders WHERE id = ?`, input.parentPoId);
  if (!parent) throw new Error("Parent purchase order not found");
  if (parent.parentPoId) throw new Error("Cannot nest sub-POs under another sub-PO");
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Sub-PO title is required");
  const budgetCents = input.budget ? dollarsToCents(input.budget) : null;
  const t = now();
  return tx(() => {
    const n = count(`SELECT COUNT(*) AS n FROM purchase_orders WHERE parentPoId = ?`, parent.id);
    const number = `${parent.number}-S${String(n + 1).padStart(2, "0")}`;
    const rowId = id();
    run(
      `INSERT INTO purchase_orders
        (id, customerId, parentPoId, number, title, status, budgetCents, currency, parentNumber, jobCode, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
      rowId,
      parent.customerId,
      parent.id,
      number,
      title,
      budgetCents,
      parent.currency,
      parent.number,
      parent.jobCode || parent.number,
      t,
      t,
    );
    return get(`SELECT * FROM purchase_orders WHERE id = ?`, rowId);
  });
}

export function closePurchaseOrder(poId) {
  const po = get(`SELECT id FROM purchase_orders WHERE id = ?`, poId);
  if (!po) throw new Error("Purchase order not found");
  const t = now();
  run(
    `UPDATE purchase_orders SET status = 'closed', closedAt = ?, updatedAt = ? WHERE id = ?`,
    t,
    t,
    poId,
  );
  return get(`SELECT * FROM purchase_orders WHERE id = ?`, poId);
}

function summarize(invoices) {
  const sum = (status) =>
    invoices.filter((i) => i.status === status).reduce((s, i) => s + Number(i.amountCents), 0);
  const pending = sum("pending");
  const signed = sum("signed");
  const paid = sum("paid");
  return { pending, signed, paid, total: pending + signed + paid, count: invoices.length };
}

export function poCashFlow(poId) {
  const po = get(`SELECT * FROM purchase_orders WHERE id = ?`, poId);
  if (!po) throw new Error("Purchase order not found");
  const children = all(
    `SELECT * FROM purchase_orders WHERE parentPoId = ? ORDER BY createdAt`,
    poId,
  );
  const own = all(`SELECT * FROM invoices WHERE purchaseOrderId = ?`, poId);
  const childInvoices = children.length
    ? all(
        `SELECT * FROM invoices WHERE purchaseOrderId IN (${children.map(() => "?").join(",")})`,
        ...children.map((c) => c.id),
      )
    : [];
  return {
    purchaseOrder: po,
    job: summarize([...own, ...childInvoices]),
    subPos: children.map((child) => ({
      ...child,
      ...summarize(childInvoices.filter((inv) => inv.purchaseOrderId === child.id)),
    })),
  };
}

function insertBlob(invoice, customer, filename, contentType, data, digitizedText) {
  const storageKey = invoiceStorageKey({
    organizationId: customer.organizationId,
    customerId: customer.id,
    invoiceId: invoice.id,
    filename,
  });
  const stored = putBlob(storageKey, data);
  run(
    `INSERT INTO invoice_blobs
      (id, invoiceId, storageKey, filename, contentType, sizeBytes, checksum, digitizedText, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id(),
    invoice.id,
    stored.storageKey,
    filename,
    contentType,
    stored.sizeBytes,
    stored.checksum,
    digitizedText,
    now(),
  );
}

export function createGeneratedInvoice(input) {
  const customer = get(`SELECT * FROM customers WHERE id = ?`, input.customerId);
  if (!customer) throw new Error("Customer not found");
  const title = String(input.title || "").trim();
  const description = String(input.description || "").trim();
  if (!title || !description) throw new Error("Invoice title and description are required");
  const unitCents = dollarsToCents(input.amount);
  if (unitCents <= 0) throw new Error("Amount must be greater than zero");
  const lineItems = [{ description, quantity: 1, unitCents }];
  let purchaseOrderId = input.purchaseOrderId || null;
  if (purchaseOrderId && !get(`SELECT id FROM purchase_orders WHERE id = ? AND customerId = ?`, purchaseOrderId, customer.id)) {
    throw new Error("Purchase order does not belong to this customer");
  }
  const t = now();
  const invoice = tx(() => {
    const number = `INV-${String(count(`SELECT COUNT(*) AS n FROM invoices WHERE customerId = ?`, customer.id) + 1).padStart(4, "0")}`;
    const rowId = id();
    run(
      `INSERT INTO invoices
        (id, customerId, purchaseOrderId, number, title, description, status, source, amountCents, currency, lineItemsJson, lifecyclePhase, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', 'generated', ?, 'usd', ?, 'pending', ?, ?)`,
      rowId,
      customer.id,
      purchaseOrderId,
      number,
      title,
      description,
      unitCents,
      JSON.stringify(lineItems),
      t,
      t,
    );
    return get(`SELECT * FROM invoices WHERE id = ?`, rowId);
  });
  const body = [
    `Invoice ${invoice.number}`,
    `Customer: ${customer.name}`,
    `Title: ${title}`,
    `Amount: ${(unitCents / 100).toFixed(2)}`,
    "",
    `- ${description}: 1 x ${(unitCents / 100).toFixed(2)}`,
  ].join("\n");
  insertBlob(invoice, customer, `${invoice.number}.txt`, "text/plain", Buffer.from(body, "utf8"), body);
  return invoice;
}

export function uploadInvoice(input) {
  const customer = get(`SELECT * FROM customers WHERE id = ?`, input.customerId);
  if (!customer) throw new Error("Customer not found");
  const title = String(input.title || "").trim();
  if (!title) throw new Error("Invoice title is required");
  const amountCents = dollarsToCents(input.amount);
  if (amountCents <= 0) throw new Error("Amount must be greater than zero");
  const phase = input.lifecyclePhase || "pending";
  if (!["pending", "signed", "paid"].includes(phase)) throw new Error("Invalid lifecycle phase");
  if (!input.file?.data?.length) throw new Error("A scan or PDF is required");
  let purchaseOrderId = input.purchaseOrderId || null;
  if (purchaseOrderId && !get(`SELECT id FROM purchase_orders WHERE id = ? AND customerId = ?`, purchaseOrderId, customer.id)) {
    throw new Error("Purchase order does not belong to this customer");
  }
  const t = now();
  const invoice = tx(() => {
    const number = `INV-${String(count(`SELECT COUNT(*) AS n FROM invoices WHERE customerId = ?`, customer.id) + 1).padStart(4, "0")}`;
    const rowId = id();
    run(
      `INSERT INTO invoices
        (id, customerId, purchaseOrderId, number, title, status, source, amountCents, currency, lineItemsJson, lifecyclePhase, signedAt, paidAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 'uploaded', ?, 'usd', ?, ?, ?, ?, ?, ?)`,
      rowId,
      customer.id,
      purchaseOrderId,
      number,
      title,
      phase,
      amountCents,
      JSON.stringify([{ description: title, quantity: 1, unitCents: amountCents }]),
      phase,
      phase === "pending" ? null : t,
      phase === "paid" ? t : null,
      t,
      t,
    );
    return get(`SELECT * FROM invoices WHERE id = ?`, rowId);
  });
  const digitized =
    `[Digitized upload] ${input.file.filename} — ${title} — $${(amountCents / 100).toFixed(2)}`;
  insertBlob(
    invoice,
    customer,
    input.file.filename || "upload.bin",
    input.file.contentType || "application/octet-stream",
    input.file.data,
    digitized,
  );
  if (phase === "signed" || phase === "paid") createReceivable(invoice.id);
  if (phase === "paid") {
    run(
      `UPDATE receivables SET status = 'paid', paidAt = ?, updatedAt = ? WHERE invoiceId = ?`,
      t,
      t,
      invoice.id,
    );
  }
  return get(`SELECT * FROM invoices WHERE id = ?`, invoice.id);
}

export function createReceivable(invoiceId) {
  const existing = get(`SELECT * FROM receivables WHERE invoiceId = ?`, invoiceId);
  if (existing) return existing;
  const invoice = get(
    `SELECT invoices.*, payment_terms.netDays AS netDays
     FROM invoices
     JOIN customers ON customers.id = invoices.customerId
     LEFT JOIN payment_terms ON payment_terms.customerId = customers.id
     WHERE invoices.id = ?`,
    invoiceId,
  );
  if (!invoice) throw new Error("Invoice not found");
  const netDays = Number(invoice.netDays ?? 30);
  const confirmedAt = invoice.signedAt || now();
  const t = now();
  const rowId = id();
  run(
    `INSERT INTO receivables
      (id, invoiceId, amountCents, currency, confirmedAt, dueAt, netDays, status, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    rowId,
    invoiceId,
    invoice.amountCents,
    invoice.currency,
    confirmedAt,
    addDays(confirmedAt, netDays),
    netDays,
    t,
    t,
  );
  return get(`SELECT * FROM receivables WHERE id = ?`, rowId);
}

export function signInvoice(input) {
  const invoice = get(`SELECT * FROM invoices WHERE id = ?`, input.invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status === "paid") throw new Error("Invoice is already paid");
  const signedByName = String(input.signedByName || "").trim();
  const signedByEmail = requireEmail(input.signedByEmail, "Signer email");
  if (!signedByName) throw new Error("Signer name is required");
  const t = now();
  run(
    `UPDATE invoices
     SET status = 'signed', lifecyclePhase = 'signed', signedAt = ?, signedByName = ?, signedByEmail = ?, signatureData = ?, updatedAt = ?
     WHERE id = ?`,
    t,
    signedByName,
    signedByEmail,
    input.signatureData || `typed:${signedByName}`,
    t,
    invoice.id,
  );
  if (input.accessTokenId) {
    run(`UPDATE access_tokens SET usedAt = ? WHERE id = ?`, t, input.accessTokenId);
  }
  const updated = get(`SELECT * FROM invoices WHERE id = ?`, invoice.id);
  const receivable = createReceivable(updated.id);
  const payToken = createAccessToken(updated.id, "pay");
  const payUrl = appUrl(`/pay/${payToken.token}`);
  const emails = resolveCustomerEmails(invoice.customerId, "payment");
  sendEmail({
    customerId: invoice.customerId,
    to: emails.recipients.map((r) => r.email),
    fromEmail: emails.senders[0]?.email || fromAddress("payment"),
    subject: `Payment requested — Invoice ${updated.number}`,
    bodyText: [
      `Invoice ${updated.number} was signed and is now a confirmed receivable.`,
      `Amount: ${money(updated.amountCents, updated.currency)}`,
      `Due: ${receivable.dueAt.slice(0, 10)}`,
      "",
      `Pay securely (no account required): ${payUrl}`,
    ].join("\n"),
    purpose: "payment_link",
    relatedType: "invoice",
    relatedId: updated.id,
  });
  return { invoice: updated, receivable, payUrl };
}

export function sendSignLink(invoiceId) {
  const invoice = get(`SELECT * FROM invoices WHERE id = ?`, invoiceId);
  if (!invoice) throw new Error("Invoice not found");
  if (invoice.status !== "pending") throw new Error("Only a pending invoice can be sent for signature");
  const token = createAccessToken(invoiceId, "sign");
  const url = appUrl(`/sign/${token.token}`);
  const emails = resolveCustomerEmails(invoice.customerId, "signing");
  sendEmail({
    customerId: invoice.customerId,
    to: emails.recipients.map((r) => r.email),
    fromEmail: emails.senders[0]?.email || fromAddress("signing"),
    subject: `Please sign invoice ${invoice.number}`,
    bodyText: `Please review and digitally sign invoice ${invoice.number}:\n\n${url}`,
    purpose: "sign_link",
    relatedType: "invoice",
    relatedId: invoice.id,
  });
  return { url, token };
}

export function connectQuickBooks(organizationId, realmId) {
  const org = get(`SELECT id FROM organizations WHERE id = ?`, organizationId);
  if (!org) throw new Error("Organization not found");
  const realm = String(realmId || "").trim() || `realm_stub_${organizationId.slice(0, 6)}`;
  const existing = get(
    `SELECT * FROM integration_configs WHERE organizationId = ? AND provider = 'quickbooks'`,
    organizationId,
  );
  const t = now();
  const meta = JSON.stringify({ connectedAt: t });
  if (existing) {
    run(
      `UPDATE integration_configs
       SET status = 'connected', externalRealmId = ?, metadataJson = ?, updatedAt = ?
       WHERE id = ?`,
      realm,
      meta,
      t,
      existing.id,
    );
  } else {
    run(
      `INSERT INTO integration_configs
        (id, organizationId, provider, status, externalRealmId, metadataJson, createdAt, updatedAt)
       VALUES (?, ?, 'quickbooks', 'connected', ?, ?, ?, ?)`,
      id(),
      organizationId,
      realm,
      meta,
      t,
      t,
    );
  }
  return get(
    `SELECT * FROM integration_configs WHERE organizationId = ? AND provider = 'quickbooks'`,
    organizationId,
  );
}

export function syncInvoiceToQuickBooks(invoiceId) {
  const invoice = get(
    `SELECT invoices.*, customers.organizationId AS organizationId, customers.name AS customerName
     FROM invoices JOIN customers ON customers.id = invoices.customerId
     WHERE invoices.id = ?`,
    invoiceId,
  );
  if (!invoice) throw new Error("Invoice not found");
  const integration = get(
    `SELECT * FROM integration_configs WHERE organizationId = ? AND provider = 'quickbooks'`,
    invoice.organizationId,
  );
  if (!integration || integration.status !== "connected") {
    return { ok: false, reason: "QuickBooks is not connected for this organization" };
  }
  const payload = {
    DocNumber: invoice.number,
    CustomerRef: { name: invoice.customerName },
    TotalAmt: invoice.amountCents / 100,
    PrivateNote: `Field Invoicing sync — ${invoice.id}`,
    realmId: integration.externalRealmId,
  };
  console.info("[quickbooks] sync invoice", payload);
  return { ok: true, payload };
}

export function addBankAccount(input) {
  const org = get(`SELECT id FROM organizations WHERE id = ?`, input.organizationId);
  if (!org) throw new Error("Organization not found");
  const label = String(input.label || "").trim();
  if (!label) throw new Error("Account label is required");
  const provider = input.provider || "manual";
  if (!["stripe_connect", "plaid", "manual", "ach"].includes(provider)) {
    throw new Error("Unsupported banking provider");
  }
  const t = now();
  const isDefault = input.isDefault ? 1 : 0;
  const rowId = id();
  tx(() => {
    if (isDefault) {
      run(`UPDATE banking_accounts SET isDefault = 0 WHERE organizationId = ?`, input.organizationId);
    }
    run(
      `INSERT INTO banking_accounts
        (id, organizationId, label, provider, isDefault, accountLast4, routingLast4, currency, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'usd', ?, ?)`,
      rowId,
      input.organizationId,
      label,
      provider,
      isDefault,
      String(input.accountLast4 || "").slice(0, 4) || null,
      String(input.routingLast4 || "").slice(0, 4) || null,
      t,
      t,
    );
  });
  return get(`SELECT * FROM banking_accounts WHERE id = ?`, rowId);
}

export function loadCustomer(customerId) {
  refreshOverdue();
  const customer = get(`SELECT * FROM customers WHERE id = ?`, customerId);
  if (!customer) return null;
  const purchaseOrders = all(
    `SELECT * FROM purchase_orders WHERE customerId = ? AND parentPoId IS NULL ORDER BY createdAt DESC`,
    customerId,
  );
  return {
    ...customer,
    organization: get(`SELECT * FROM organizations WHERE id = ?`, customer.organizationId),
    paymentTerms: get(`SELECT * FROM payment_terms WHERE customerId = ?`, customerId),
    emailConfigs: all(
      `SELECT * FROM customer_email_configs WHERE customerId = ? ORDER BY purpose, role`,
      customerId,
    ),
    termSheets: all(
      `SELECT * FROM term_sheets WHERE customerId = ? ORDER BY createdAt DESC`,
      customerId,
    ),
    quotes: all(`SELECT * FROM quotes WHERE customerId = ? ORDER BY createdAt DESC`, customerId),
    flows: purchaseOrders.map((po) => poCashFlow(po.id)),
    poOptions: all(
      `SELECT id, number, title FROM purchase_orders WHERE customerId = ? ORDER BY number`,
      customerId,
    ),
    invoices: all(
      `SELECT invoices.*,
              purchase_orders.number AS poNumber,
              invoice_blobs.filename AS blobFilename,
              receivables.dueAt AS dueAt,
              receivables.status AS receivableStatus
       FROM invoices
       LEFT JOIN purchase_orders ON purchase_orders.id = invoices.purchaseOrderId
       LEFT JOIN invoice_blobs ON invoice_blobs.invoiceId = invoices.id
       LEFT JOIN receivables ON receivables.invoiceId = invoices.id
       WHERE invoices.customerId = ?
       ORDER BY invoices.createdAt DESC`,
      customerId,
    ),
  };
}

export function loadInvoice(invoiceId) {
  const invoice = get(`SELECT * FROM invoices WHERE id = ?`, invoiceId);
  if (!invoice) return null;
  const customer = get(`SELECT * FROM customers WHERE id = ?`, invoice.customerId);
  return {
    ...invoice,
    customer: {
      ...customer,
      organization: get(`SELECT * FROM organizations WHERE id = ?`, customer.organizationId),
      paymentTerms: get(`SELECT * FROM payment_terms WHERE customerId = ?`, customer.id),
    },
    purchaseOrder: invoice.purchaseOrderId
      ? get(`SELECT * FROM purchase_orders WHERE id = ?`, invoice.purchaseOrderId)
      : null,
    receivable: get(`SELECT * FROM receivables WHERE invoiceId = ?`, invoice.id),
  };
}

export function readInvoiceFile(invoiceId) {
  const blob = get(`SELECT * FROM invoice_blobs WHERE invoiceId = ?`, invoiceId);
  if (!blob) return null;
  return { blob, data: readBlob(blob.storageKey) };
}

export function customerIdForInvoice(invoiceId) {
  return get(`SELECT customerId FROM invoices WHERE id = ?`, invoiceId)?.customerId;
}

export function customerIdForPo(poId) {
  return get(`SELECT customerId FROM purchase_orders WHERE id = ?`, poId)?.customerId;
}
