import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const MAX_BODY = 20 * 1024 * 1024;

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

export async function readRaw(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error("Upload is larger than 20 MB");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readRequest(req) {
  const raw = await readRaw(req);
  const type = String(req.headers["content-type"] || "");
  if (type.includes("application/json")) {
    const data = raw.length ? JSON.parse(raw.toString("utf8")) : {};
    return { fields: data, files: {}, raw };
  }
  if (type.includes("multipart/form-data")) {
    const boundary = /boundary=(?:"([^"]+)"|([^;]+))/.exec(type)?.[1] || /boundary=(?:"([^"]+)"|([^;]+))/.exec(type)?.[2];
    if (!boundary) throw new Error("Missing upload boundary");
    return { ...parseMultipart(raw, boundary), raw };
  }
  const params = new URLSearchParams(raw.toString("utf8"));
  const fields = {};
  for (const [key, value] of params) fields[key] = value;
  return { fields, files: {}, raw };
}

function parseMultipart(buf, boundary) {
  const delim = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let start = buf.indexOf(delim);
  if (start < 0) return { fields, files };
  start += delim.length;
  while (start < buf.length) {
    if (buf[start] === 45 && buf[start + 1] === 45) break;
    if (buf[start] === 13 && buf[start + 1] === 10) start += 2;
    const headerEnd = buf.indexOf("\r\n\r\n", start);
    if (headerEnd < 0) break;
    const header = buf.slice(start, headerEnd).toString("utf8");
    const next = buf.indexOf(delim, headerEnd + 4);
    if (next < 0) break;
    let bodyEnd = next;
    if (buf[bodyEnd - 2] === 13 && buf[bodyEnd - 1] === 10) bodyEnd -= 2;
    const body = buf.subarray(headerEnd + 4, bodyEnd);
    const name = /name="([^"]+)"/.exec(header)?.[1];
    const filename = /filename="([^"]*)"/.exec(header)?.[1];
    const contentType = /content-type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim();
    if (name && filename !== undefined) {
      files[name] = { filename: filename || "upload.bin", contentType, data: Buffer.from(body) };
    } else if (name) {
      fields[name] = body.toString("utf8");
    }
    start = next + delim.length;
  }
  return { fields, files };
}

export function redirect(res, location) {
  const headers = { Location: location };
  if (/^https?:\/\//i.test(location)) headers["HX-Redirect"] = location;
  res.writeHead(303, headers);
  res.end();
}

export function html(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

export function withQuery(pathname, params) {
  const url = new URL(pathname, "http://local");
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}`;
}

export function safeNext(value, fallback) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}

export async function serveStatic(res, pathname) {
  const name = pathname.replace(/^\/assets\//, "");
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    res.writeHead(404);
    res.end();
    return;
  }
  const full = path.join(publicDir, name);
  try {
    const data = await readFile(full);
    res.writeHead(200, {
      "Content-Type": TYPES[path.extname(name)] || "application/octet-stream",
      "Cache-Control": "public, max-age=86400",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
}

export function file(res, { filename, contentType, data }) {
  res.writeHead(200, {
    "Content-Type": contentType || "application/octet-stream",
    "Content-Length": data.length,
    "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
    "Cache-Control": "private, no-store",
  });
  res.end(data);
}
