"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run(fn: () => Promise<string | void>) {
    setPending(true);
    setMessage(null);
    try {
      const msg = await fn();
      if (msg) setMessage(msg);
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return { pending, message, run, setMessage };
}

function InvoiceActions({
  invoiceId,
  status,
}: {
  invoiceId: string;
  status: string;
}) {
  const { pending, message, run } = useAction();

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {status === "pending" ? (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await fetch(`/api/invoices/${invoiceId}/sign`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      signedByName: "On-site signer",
                      signedByEmail: "signer@customer.example",
                      signatureData: "typed:On-site signer",
                    }),
                  });
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                  return `Signed. Payment link emailed. ${data.payUrl}`;
                })
              }
            >
              Sign invoice
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending}
              onClick={() =>
                run(async () => {
                  const res = await fetch(
                    `/api/invoices/${invoiceId}/send-sign-link`,
                    { method: "POST" },
                  );
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.error);
                  return `Sign link sent: ${data.url}`;
                })
              }
            >
              Send sign link
            </button>
          </>
        ) : null}
        {status === "signed" ? (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const res = await fetch(`/api/invoices/${invoiceId}/pay`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ sendLink: true }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                if (data.url) window.open(data.url, "_blank");
                return data.limitedAccessUrl
                  ? `Checkout + link ${data.limitedAccessUrl}`
                  : "Checkout started";
              })
            }
          >
            Collect payment
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const res = await fetch(
                `/api/invoices/${invoiceId}/sync-quickbooks`,
                { method: "POST" },
              );
              const data = await res.json();
              if (!res.ok) throw new Error(data.error);
              return data.ok ? "Synced to QuickBooks (stub)" : data.reason;
            })
          }
        >
          Sync QBO
        </button>
      </div>
      {message ? (
        <p className="max-w-xs text-right text-xs text-[var(--ink-soft)]">{message}</p>
      ) : null}
    </div>
  );
}

function TermSheetButton({ customerId }: { customerId: string }) {
  const { pending, message, run } = useAction();
  return (
    <div>
      <button
        type="button"
        className="btn btn-ghost"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const res = await fetch("/api/term-sheets", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ customerId, assistedBy: "template" }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return "Term sheet draft created";
          })
        }
      >
        Generate assisted term sheet
      </button>
      {message ? <p className="mt-2 text-xs text-[var(--ink-soft)]">{message}</p> : null}
    </div>
  );
}

function QuoteForm({ customerId }: { customerId: string }) {
  const { pending, message, run } = useAction();

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        run(async () => {
          const res = await fetch("/api/quotes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              customerId,
              title: String(form.get("title")),
              send: true,
              lineItems: [
                {
                  description: String(form.get("description")),
                  quantity: Number(form.get("quantity") || 1),
                  unitCents: Math.round(Number(form.get("amount") || 0) * 100),
                },
              ],
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return `Quote ${data.number} sent`;
        });
      }}
    >
      <div className="field">
        <label>Title</label>
        <input name="title" required placeholder="Site work package" />
      </div>
      <div className="field">
        <label>Line item</label>
        <input name="description" required placeholder="Mobilization" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label>Qty</label>
          <input name="quantity" type="number" defaultValue={1} min={1} />
        </div>
        <div className="field">
          <label>Amount ($)</label>
          <input name="amount" type="number" step="0.01" required />
        </div>
      </div>
      <button className="btn btn-primary" disabled={pending} type="submit">
        Create & email quote
      </button>
      {message ? <p className="text-xs text-[var(--ink-soft)]">{message}</p> : null}
    </form>
  );
}

function JobPoForm({ customerId }: { customerId: string }) {
  const { pending, message, run } = useAction();
  return (
    <form
      className="mt-4 space-y-3 border-t border-[var(--line)] pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        run(async () => {
          const res = await fetch("/api/purchase-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "job",
              customerId,
              title: String(form.get("title")),
              budgetCents: Math.round(Number(form.get("budget") || 0) * 100),
              jobCode: String(form.get("jobCode") || "") || undefined,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return `Created ${data.number}`;
        });
      }}
    >
      <p className="text-sm font-semibold">New job PO</p>
      <div className="field">
        <label>Title</label>
        <input name="title" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label>Job code</label>
          <input name="jobCode" placeholder="HRB-P4" />
        </div>
        <div className="field">
          <label>Budget ($)</label>
          <input name="budget" type="number" step="0.01" />
        </div>
      </div>
      <button className="btn btn-secondary" disabled={pending} type="submit">
        Create job PO
      </button>
      {message ? <p className="text-xs text-[var(--ink-soft)]">{message}</p> : null}
    </form>
  );
}

function SubPoForm({ parentPoId }: { parentPoId: string }) {
  const { pending, message, run } = useAction();
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        run(async () => {
          const res = await fetch("/api/purchase-orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "sub",
              parentPoId,
              title: String(form.get("title")),
              budgetCents: Math.round(Number(form.get("budget") || 0) * 100) || undefined,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          return `Sub-PO ${data.number}`;
        });
      }}
    >
      <div className="field grow">
        <label>Add sub-PO</label>
        <input name="title" required placeholder="Optional cash-flow split" />
      </div>
      <div className="field w-28">
        <label>Budget</label>
        <input name="budget" type="number" step="0.01" />
      </div>
      <button className="btn btn-ghost" disabled={pending} type="submit">
        Add
      </button>
      {message ? <p className="w-full text-xs text-[var(--ink-soft)]">{message}</p> : null}
    </form>
  );
}

function InvoiceForms({
  customerId,
  purchaseOrders,
}: {
  customerId: string;
  purchaseOrders: { id: string; number: string; title: string }[];
}) {
  const { pending, message, run } = useAction();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          run(async () => {
            const res = await fetch("/api/invoices", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                mode: "generated",
                customerId,
                purchaseOrderId: String(form.get("purchaseOrderId") || "") || undefined,
                title: String(form.get("title")),
                lineItems: [
                  {
                    description: String(form.get("description")),
                    quantity: 1,
                    unitCents: Math.round(Number(form.get("amount") || 0) * 100),
                  },
                ],
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return `Created ${data.number}`;
          });
        }}
      >
        <p className="font-semibold">Generate in-app</p>
        <div className="field">
          <label>Title</label>
          <input name="title" required />
        </div>
        <div className="field">
          <label>Description</label>
          <input name="description" required />
        </div>
        <div className="field">
          <label>Amount ($)</label>
          <input name="amount" type="number" step="0.01" required />
        </div>
        <div className="field">
          <label>PO (optional)</label>
          <select name="purchaseOrderId" defaultValue="">
            <option value="">None</option>
            {purchaseOrders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number} — {p.title}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" disabled={pending} type="submit">
          Create invoice
        </button>
      </form>

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const data = new FormData(form);
          data.set("customerId", customerId);
          run(async () => {
            const res = await fetch("/api/invoices", { method: "POST", body: data });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error);
            return `Uploaded ${json.number} as ${json.lifecyclePhase}`;
          });
        }}
      >
        <p className="font-semibold">Upload hard-copy (digitize)</p>
        <div className="field">
          <label>Title</label>
          <input name="title" required />
        </div>
        <div className="field">
          <label>Amount (cents)</label>
          <input name="amountCents" type="number" required />
        </div>
        <div className="field">
          <label>Lifecycle phase at upload</label>
          <select name="lifecyclePhase" defaultValue="pending">
            <option value="pending">pending</option>
            <option value="signed">signed</option>
            <option value="paid">paid</option>
          </select>
        </div>
        <div className="field">
          <label>PO (optional)</label>
          <select name="purchaseOrderId" defaultValue="">
            <option value="">None</option>
            {purchaseOrders.map((p) => (
              <option key={p.id} value={p.id}>
                {p.number}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Scan / PDF</label>
          <input name="file" type="file" required />
        </div>
        <button className="btn btn-secondary" disabled={pending} type="submit">
          Upload & digitize
        </button>
      </form>
      {message ? <p className="text-sm text-[var(--ink-soft)] md:col-span-2">{message}</p> : null}
    </div>
  );
}

export {
  InvoiceActions,
  TermSheetButton,
  QuoteForm,
  JobPoForm,
  SubPoForm,
  InvoiceForms,
};
