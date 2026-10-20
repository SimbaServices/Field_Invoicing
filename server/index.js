import http from "node:http";
import * as domain from "./domain.js";
import * as pages from "./pages.js";
import * as stripe from "./stripe.js";
import { file, html, json, readRaw, readRequest, redirect, serveStatic } from "./http.js";

const host = process.env.HOSTNAME || "127.0.0.1";
const port = Number(process.env.PORT || 8791);

function flash(url) {
  return {
    notice: url.searchParams.get("m") || "",
    error: url.searchParams.get("e") || "",
  };
}

function localPath(referer) {
  if (!referer) return "/";
  try {
    const target = new URL(referer, "http://local");
    if (target.pathname.startsWith("/") && !target.pathname.startsWith("//")) {
      return `${target.pathname}${target.search}`;
    }
  } catch {
    return "/";
  }
  return "/";
}

function fail(res, error, nextPath) {
  const message = error instanceof Error ? error.message : "Request failed";
  console.error(message);
  const back = new URL(localPath(nextPath), "http://local");
  back.searchParams.set("e", message);
  redirect(res, `${back.pathname}${back.search}`);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${host}`);
  try {
    if (req.method === "GET" && url.pathname.startsWith("/assets/")) {
      await serveStatic(res, url.pathname);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/webhooks/stripe") {
      const raw = await readRaw(req);
      const result = await stripe.handleWebhook(raw, req.headers["stripe-signature"]);
      json(res, 200, result);
      return;
    }
    const posted = req.method === "POST" ? await readRequest(req) : { fields: {}, files: {} };
    await route(req, res, url, posted);
  } catch (error) {
    if (req.method === "POST" && url.pathname === "/api/webhooks/stripe") {
      json(res, 400, { error: error instanceof Error ? error.message : "Webhook error" });
      return;
    }
    fail(res, error, req.headers.referer || "/");
  }
});

async function route(req, res, url, posted) {
  const { pathname } = url;
  const { fields, files } = posted;

  if (req.method === "GET" && pathname === "/") {
    html(res, 200, pages.home({ orgs: domain.listOrganizations(), ...flash(url) }));
    return;
  }

  if (req.method === "POST" && pathname === "/organizations") {
    const org = domain.createOrganization(fields);
    await stripe.ensureConnectAccount(org.id);
    redirect(res, `/orgs/${org.id}`);
    return;
  }

  const orgId = match(pathname, "/orgs/:id");
  if (orgId && req.method === "GET") {
    if (url.searchParams.get("connected")) await stripe.refreshConnectAccount(orgId);
    const org = domain.loadOrg(orgId);
    if (!org) return html(res, 404, pages.notFound("Organization not found"));
    const note = url.searchParams.get("stub") ? "Stripe is in stub mode. A connected account id was reserved locally." : "";
    html(res, 200, pages.orgPage({ org, ...flash(url), notice: flash(url).notice || note }));
    return;
  }

  if (req.method === "POST" && match(pathname, "/orgs/:id/customers")) {
    const customer = domain.createCustomer({ ...fields, organizationId: match(pathname, "/orgs/:id/customers") });
    redirect(res, `/customers/${customer.id}?m=${encodeURIComponent("Customer created with a term sheet draft")}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/orgs/:id/banking")) {
    const id = match(pathname, "/orgs/:id/banking");
    domain.addBankAccount({ ...fields, organizationId: id, isDefault: fields.isDefault === "1" });
    redirect(res, `/orgs/${id}?m=${encodeURIComponent("Banking destination saved")}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/orgs/:id/connect")) {
    const id = match(pathname, "/orgs/:id/connect");
    const link = await stripe.createConnectOnboardingLink(id);
    redirect(res, link.url);
    return;
  }

  if (req.method === "POST" && match(pathname, "/orgs/:id/integrations")) {
    const id = match(pathname, "/orgs/:id/integrations");
    const integration = domain.connectQuickBooks(id, fields.realmId);
    redirect(res, `/orgs/${id}?m=${encodeURIComponent(`QuickBooks connected (${integration.externalRealmId})`)}`);
    return;
  }

  const customerId = match(pathname, "/customers/:id");
  if (customerId && req.method === "GET") {
    const customer = domain.loadCustomer(customerId);
    if (!customer) return html(res, 404, pages.notFound("Customer not found"));
    html(res, 200, pages.customerPage({ customer, ...flash(url) }));
    return;
  }

  if (req.method === "POST" && match(pathname, "/customers/:id/term-sheets")) {
    const id = match(pathname, "/customers/:id/term-sheets");
    domain.createTermSheet(id);
    redirect(res, `/customers/${id}?m=${encodeURIComponent("Term sheet draft created")}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/customers/:id/quotes")) {
    const id = match(pathname, "/customers/:id/quotes");
    const quote = domain.createQuote({ ...fields, customerId: id });
    redirect(res, `/customers/${id}?m=${encodeURIComponent(`Quote ${quote.number} emailed`)}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/customers/:id/purchase-orders")) {
    const id = match(pathname, "/customers/:id/purchase-orders");
    const po = domain.createJobPo({ ...fields, customerId: id });
    redirect(res, `/customers/${id}?m=${encodeURIComponent(`Created ${po.number}`)}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/customers/:id/invoices/upload")) {
    const id = match(pathname, "/customers/:id/invoices/upload");
    const invoice = domain.uploadInvoice({ ...fields, customerId: id, file: files.file });
    redirect(res, `/customers/${id}?m=${encodeURIComponent(`Uploaded ${invoice.number} as ${invoice.lifecyclePhase}`)}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/customers/:id/invoices")) {
    const id = match(pathname, "/customers/:id/invoices");
    const invoice = domain.createGeneratedInvoice({ ...fields, customerId: id });
    redirect(res, `/customers/${id}?m=${encodeURIComponent(`Created ${invoice.number}`)}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/purchase-orders/:id/sub")) {
    const po = domain.createSubPo({ ...fields, parentPoId: match(pathname, "/purchase-orders/:id/sub") });
    redirect(res, `/customers/${po.customerId}?m=${encodeURIComponent(`Sub-PO ${po.number}`)}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/purchase-orders/:id/close")) {
    const poId = match(pathname, "/purchase-orders/:id/close");
    domain.closePurchaseOrder(poId);
    const customerIdForPo = domain.customerIdForPo(poId);
    redirect(res, `/customers/${customerIdForPo}?m=${encodeURIComponent("Purchase order closed")}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/invoices/:id/sign")) {
    const invoiceId = match(pathname, "/invoices/:id/sign");
    const result = domain.signInvoice({ ...fields, invoiceId });
    const customerIdForInvoice = domain.customerIdForInvoice(invoiceId);
    redirect(res, `/customers/${customerIdForInvoice}?m=${encodeURIComponent(`Signed. Payment link emailed. ${result.payUrl}`)}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/invoices/:id/sign-link")) {
    const invoiceId = match(pathname, "/invoices/:id/sign-link");
    const result = domain.sendSignLink(invoiceId);
    redirect(res, `/customers/${domain.customerIdForInvoice(invoiceId)}?m=${encodeURIComponent(`Sign link sent: ${result.url}`)}`);
    return;
  }

  if (req.method === "POST" && match(pathname, "/invoices/:id/pay")) {
    const invoice = domain.loadInvoice(match(pathname, "/invoices/:id/pay"));
    if (!invoice) throw new Error("Invoice not found");
    if (invoice.status === "paid") throw new Error("Invoice already paid");
    if (invoice.status !== "signed") throw new Error("Invoice must be signed before payment");
    const checkout = await stripe.createDestinationCheckout(invoice);
    redirect(res, checkout.url);
    return;
  }

  if (req.method === "POST" && match(pathname, "/invoices/:id/quickbooks")) {
    const invoiceId = match(pathname, "/invoices/:id/quickbooks");
    const result = domain.syncInvoiceToQuickBooks(invoiceId);
    const message = result.ok ? "Synced to QuickBooks (stub)" : result.reason;
    redirect(res, `/customers/${domain.customerIdForInvoice(invoiceId)}?m=${encodeURIComponent(message)}`);
    return;
  }

  if (req.method === "GET" && match(pathname, "/invoices/:id/file")) {
    const stored = domain.readInvoiceFile(match(pathname, "/invoices/:id/file"));
    if (!stored) return html(res, 404, pages.notFound("File not found"));
    file(res, { filename: stored.blob.filename, contentType: stored.blob.contentType, data: stored.data });
    return;
  }

  const signToken = match(pathname, "/sign/:token");
  if (signToken && req.method === "GET") {
    const access = domain.resolveAccessToken(signToken, "sign");
    if (!access) return html(res, 404, pages.notFound("This signing link is invalid or expired."));
    html(res, 200, pages.signPage({ access, ...flash(url) }));
    return;
  }
  if (signToken && req.method === "POST") {
    const access = domain.resolveAccessToken(signToken, "sign");
    if (!access) throw new Error("This signing link is invalid or expired.");
    const result = domain.signInvoice({
      ...fields,
      invoiceId: access.invoice.id,
      accessTokenId: access.id,
    });
    html(res, 200, pages.signPage({
      access: { ...access, invoice: domain.loadInvoice(access.invoice.id) },
      done: `Signed. A payment link was emailed to configured recipients. Due ${result.receivable.dueAt.slice(0, 10)}.`,
    }));
    return;
  }

  const payToken = match(pathname, "/pay/:token");
  if (payToken && !["success", "cancel"].includes(payToken) && req.method === "GET") {
    const access = domain.resolveAccessToken(payToken, "pay");
    if (!access) return html(res, 404, pages.notFound("This payment link is invalid or expired."));
    html(res, 200, pages.payPage({ access, ...flash(url) }));
    return;
  }
  if (payToken && !["success", "cancel"].includes(payToken) && req.method === "POST") {
    const access = domain.resolveAccessToken(payToken, "pay");
    if (!access) throw new Error("This payment link is invalid or expired.");
    if (access.invoice.status !== "signed") throw new Error("Invoice must be signed before payment");
    const checkout = await stripe.createDestinationCheckout(access.invoice);
    redirect(res, checkout.url);
    return;
  }

  if (req.method === "GET" && pathname === "/pay/success") {
    const sessionId = url.searchParams.get("session_id");
    if (!sessionId) return html(res, 404, pages.notFound("Missing checkout session"));
    const result = await stripe.completeCheckout(sessionId);
    const message = result.state === "paid"
      ? "Payment received. The receivable is marked paid."
      : result.state === "pending"
        ? "Checkout is still pending. The receivable updates when Stripe confirms payment."
        : "That checkout session was not found.";
    html(res, 200, pages.resultPage({
      title: "Payment",
      crumb: "Payment",
      message,
      tone: result.state === "paid" ? "ok" : "warn",
      href: "/",
      hrefLabel: "Back to the desk",
    }));
    return;
  }

  if (req.method === "GET" && pathname === "/pay/cancel") {
    const invoice = url.searchParams.get("invoice") ? domain.loadInvoice(url.searchParams.get("invoice")) : null;
    html(res, 200, pages.resultPage({
      title: "Payment canceled",
      crumb: "Payment canceled",
      message: "Checkout was canceled. The invoice is still awaiting payment.",
      tone: "warn",
      href: invoice ? `/customers/${invoice.customerId}` : "/",
      hrefLabel: invoice ? "Return to the customer" : "Back to the desk",
    }));
    return;
  }

  html(res, 404, pages.notFound());
}

function match(pathname, pattern) {
  const names = [];
  const expression = new RegExp(
    `^${pattern.replace(/:([A-Za-z]+)/g, (_, name) => {
      names.push(name);
      return "([^/]+)";
    })}$`,
  );
  const found = expression.exec(pathname);
  if (!found) return null;
  return decodeURIComponent(found[1]);
}

server.listen(port, host, () => {
  console.log(`field-invoicing listening on http://${host}:${port}`);
});
