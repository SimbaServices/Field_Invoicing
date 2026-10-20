import { createHash } from "crypto";
import { mkdir, writeFile, readFile, access } from "fs/promises";
import path from "path";

/**
 * Local blob store that mirrors a remote object-storage layout:
 * orgs/{orgId}/customers/{customerId}/invoices/{invoiceId}/{filename}
 *
 * Swap the filesystem adapter for S3/GCS/Azure without changing callers.
 */
const ROOT = path.join(/*turbopackIgnore: true*/ process.cwd(), "storage", "blobs");

export function invoiceStorageKey(params: {
  organizationId: string;
  customerId: string;
  invoiceId: string;
  filename: string;
}): string {
  const safe = params.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `orgs/${params.organizationId}/customers/${params.customerId}/invoices/${params.invoiceId}/${safe}`;
}

export async function putBlob(storageKey: string, data: Buffer, _contentType: string) {
  const fullPath = path.join(/*turbopackIgnore: true*/ ROOT, storageKey);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ fullPath, data);
  const checksum = createHash("sha256").update(data).digest("hex");
  return { storageKey, sizeBytes: data.length, checksum, fullPath };
}

export async function getBlob(storageKey: string): Promise<Buffer> {
  const fullPath = path.join(/*turbopackIgnore: true*/ ROOT, storageKey);
  return readFile(/*turbopackIgnore: true*/ fullPath);
}

export async function blobExists(storageKey: string): Promise<boolean> {
  try {
    await access(path.join(/*turbopackIgnore: true*/ ROOT, storageKey));
    return true;
  } catch {
    return false;
  }
}

export function getBlobRoot() {
  return ROOT;
}
