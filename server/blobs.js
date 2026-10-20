import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

function root() {
  if (process.env.BLOB_STORAGE_ROOT) return process.env.BLOB_STORAGE_ROOT;
  const dbPath = process.env.FIELD_DB_PATH;
  if (dbPath) return path.join(path.dirname(dbPath), "blobs");
  return path.join(process.cwd(), "data", "blobs");
}

export function invoiceStorageKey({ organizationId, customerId, invoiceId, filename }) {
  const safe = String(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
  return `orgs/${organizationId}/customers/${customerId}/invoices/${invoiceId}/${safe}`;
}

function fullPath(storageKey) {
  if (!storageKey || storageKey.includes("..") || path.isAbsolute(storageKey)) {
    throw new Error("Invalid storage key");
  }
  const base = path.resolve(root());
  const full = path.resolve(base, storageKey);
  if (!full.startsWith(base + path.sep)) throw new Error("Invalid storage key");
  return full;
}

export function putBlob(storageKey, data) {
  const full = fullPath(storageKey);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, data);
  const checksum = createHash("sha256").update(data).digest("hex");
  return { storageKey, sizeBytes: data.length, checksum, fullPath: full };
}

export function readBlob(storageKey) {
  return readFileSync(fullPath(storageKey));
}
