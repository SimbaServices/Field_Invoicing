import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";

/**
 * This host already runs PostgreSQL for CRM. Field invoicing keeps its own
 * SQLite file so it does not share connections, memory, or disk with that
 * database. Invoice scans live on the filesystem; SQLite stores only the
 * path, checksum, and size.
 */
const dbPath = process.env.FIELD_DB_PATH || path.join(process.cwd(), "data", "field.db");
mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    organizationId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE (organizationId, email)
  );
  CREATE INDEX IF NOT EXISTS users_org ON users(organizationId);

  CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    organizationId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    legalName TEXT,
    email TEXT,
    phone TEXT,
    billingAddress TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS customers_org ON customers(organizationId);

  CREATE TABLE IF NOT EXISTS customer_email_configs (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL,
    role TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    isDefault INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS email_configs_customer ON customer_email_configs(customerId, purpose);

  CREATE TABLE IF NOT EXISTS payment_terms (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Net 30',
    netDays INTEGER NOT NULL DEFAULT 30,
    earlyPayDiscount REAL,
    lateFeePercent REAL,
    currency TEXT NOT NULL DEFAULT 'usd',
    notes TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS term_sheets (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    contentJson TEXT NOT NULL,
    contentMarkdown TEXT,
    assistedBy TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS term_sheets_customer ON term_sheets(customerId);

  CREATE TABLE IF NOT EXISTS quotes (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    number TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    lineItemsJson TEXT NOT NULL,
    subtotalCents INTEGER NOT NULL,
    taxCents INTEGER NOT NULL DEFAULT 0,
    totalCents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    validUntil TEXT,
    sentAt TEXT,
    sentToJson TEXT,
    notes TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE (customerId, number)
  );
  CREATE INDEX IF NOT EXISTS quotes_customer ON quotes(customerId);

  CREATE TABLE IF NOT EXISTS purchase_orders (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    parentPoId TEXT REFERENCES purchase_orders(id),
    number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    budgetCents INTEGER,
    currency TEXT NOT NULL DEFAULT 'usd',
    parentNumber TEXT,
    jobCode TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    closedAt TEXT,
    UNIQUE (customerId, number)
  );
  CREATE INDEX IF NOT EXISTS po_customer ON purchase_orders(customerId);
  CREATE INDEX IF NOT EXISTS po_parent ON purchase_orders(parentPoId);
  CREATE INDEX IF NOT EXISTS po_job ON purchase_orders(jobCode);

  CREATE TABLE IF NOT EXISTS invoices (
    id TEXT PRIMARY KEY,
    customerId TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    purchaseOrderId TEXT REFERENCES purchase_orders(id),
    number TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'generated',
    amountCents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    lineItemsJson TEXT NOT NULL DEFAULT '[]',
    lifecyclePhase TEXT NOT NULL DEFAULT 'pending',
    signedAt TEXT,
    signedByName TEXT,
    signedByEmail TEXT,
    signatureData TEXT,
    paidAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE (customerId, number)
  );
  CREATE INDEX IF NOT EXISTS invoices_customer ON invoices(customerId);
  CREATE INDEX IF NOT EXISTS invoices_po ON invoices(purchaseOrderId);
  CREATE INDEX IF NOT EXISTS invoices_status ON invoices(status);

  CREATE TABLE IF NOT EXISTS invoice_blobs (
    id TEXT PRIMARY KEY,
    invoiceId TEXT NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
    storageKey TEXT NOT NULL,
    filename TEXT NOT NULL,
    contentType TEXT NOT NULL,
    sizeBytes INTEGER NOT NULL,
    checksum TEXT,
    digitizedText TEXT,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS receivables (
    id TEXT PRIMARY KEY,
    invoiceId TEXT NOT NULL UNIQUE REFERENCES invoices(id) ON DELETE CASCADE,
    amountCents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    confirmedAt TEXT NOT NULL,
    dueAt TEXT NOT NULL,
    netDays INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    paidAt TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS receivables_due ON receivables(dueAt);
  CREATE INDEX IF NOT EXISTS receivables_status ON receivables(status);

  CREATE TABLE IF NOT EXISTS access_tokens (
    id TEXT PRIMARY KEY,
    invoiceId TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    purpose TEXT NOT NULL,
    expiresAt TEXT NOT NULL,
    usedAt TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS tokens_invoice ON access_tokens(invoiceId, purpose);

  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    invoiceId TEXT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amountCents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'usd',
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT NOT NULL DEFAULT 'stripe',
    stripeCheckoutSessionId TEXT,
    stripePaymentIntentId TEXT,
    providerRef TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS payments_invoice ON payments(invoiceId);

  CREATE TABLE IF NOT EXISTS banking_accounts (
    id TEXT PRIMARY KEY,
    organizationId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    provider TEXT NOT NULL,
    isDefault INTEGER NOT NULL DEFAULT 0,
    accountLast4 TEXT,
    routingLast4 TEXT,
    currency TEXT NOT NULL DEFAULT 'usd',
    stripeExternalAccountId TEXT,
    metadataJson TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS banking_org ON banking_accounts(organizationId);

  CREATE TABLE IF NOT EXISTS stripe_connect_accounts (
    id TEXT PRIMARY KEY,
    organizationId TEXT NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    stripeAccountId TEXT NOT NULL UNIQUE,
    dashboard TEXT NOT NULL DEFAULT 'express',
    feesCollector TEXT NOT NULL DEFAULT 'application',
    lossesCollector TEXT NOT NULL DEFAULT 'application',
    chargePattern TEXT NOT NULL DEFAULT 'destination',
    onboardingComplete INTEGER NOT NULL DEFAULT 0,
    transfersActive INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS integration_configs (
    id TEXT PRIMARY KEY,
    organizationId TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'disconnected',
    externalRealmId TEXT,
    accessTokenEnc TEXT,
    refreshTokenEnc TEXT,
    metadataJson TEXT NOT NULL DEFAULT '{}',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL,
    UNIQUE (organizationId, provider)
  );
  CREATE INDEX IF NOT EXISTS integrations_org ON integration_configs(organizationId);

  CREATE TABLE IF NOT EXISTS outbound_emails (
    id TEXT PRIMARY KEY,
    customerId TEXT,
    toJson TEXT NOT NULL,
    fromEmail TEXT NOT NULL,
    subject TEXT NOT NULL,
    bodyText TEXT NOT NULL,
    purpose TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    relatedType TEXT,
    relatedId TEXT,
    sentAt TEXT,
    createdAt TEXT NOT NULL
  );
`);

export function now() {
  return new Date().toISOString();
}

export function get(sql, ...params) {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : undefined;
}

export function all(sql, ...params) {
  return db.prepare(sql).all(...params).map((row) => ({ ...row }));
}

export function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}

export function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function count(sql, ...params) {
  return Number(get(sql, ...params)?.n ?? 0);
}
