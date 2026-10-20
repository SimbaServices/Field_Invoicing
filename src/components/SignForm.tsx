"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignForm({ token }: { token: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch(`/api/access/${token}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        signedByName: String(form.get("signedByName")),
        signedByEmail: String(form.get("signedByEmail")),
        signatureData: `typed:${form.get("signedByName")}`,
      }),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error ?? "Signing failed");
      return;
    }
    setDone(
      `Signed. A payment link was emailed to configured recipients. Due ${data.receivable.dueAt.slice(0, 10)}.`,
    );
    router.refresh();
  }

  if (done) {
    return <p className="panel fade-up p-5 text-[var(--ok)]">{done}</p>;
  }

  return (
    <form onSubmit={onSubmit} className="panel fade-up space-y-3 p-6">
      <div className="field">
        <label htmlFor="signedByName">Full name</label>
        <input id="signedByName" name="signedByName" required />
      </div>
      <div className="field">
        <label htmlFor="signedByEmail">Email</label>
        <input id="signedByEmail" name="signedByEmail" type="email" required />
      </div>
      <p className="text-xs text-[var(--ink-soft)]">
        By signing you confirm this invoice as a receivable under the customer&apos;s
        payment terms.
      </p>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button className="btn btn-primary w-full pulse-soft" disabled={pending} type="submit">
        {pending ? "Signing…" : "Sign invoice"}
      </button>
    </form>
  );
}
