"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateCustomerForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organizationId,
        name: String(form.get("name")),
        email: String(form.get("email") || "") || undefined,
        paymentTerms: {
          name: String(form.get("termsName") || "Net 30"),
          netDays: Number(form.get("netDays") || 30),
          currency: "usd",
        },
        generateTermSheet: true,
      }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error ?? "Failed");
      return;
    }
    router.push(`/customers/${data.customer.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="field">
        <label htmlFor="name">Customer name</label>
        <input id="name" name="name" required />
      </div>
      <div className="field">
        <label htmlFor="email">Primary email</label>
        <input id="email" name="email" type="email" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label htmlFor="termsName">Terms name</label>
          <input id="termsName" name="termsName" defaultValue="Net 30" />
        </div>
        <div className="field">
          <label htmlFor="netDays">Net days</label>
          <input id="netDays" name="netDays" type="number" defaultValue={30} min={1} />
        </div>
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button className="btn btn-primary w-full" disabled={pending} type="submit">
        {pending ? "Creating…" : "Create with term sheet"}
      </button>
    </form>
  );
}
