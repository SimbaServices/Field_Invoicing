"use client";

import { useState } from "react";

export function PayButton({ token }: { token: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/access/${token}/pay`, { method: "POST" });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error ?? "Payment start failed");
      return;
    }
    if (data.url) {
      window.location.href = data.url;
      return;
    }
    setError("No checkout URL returned");
  }

  return (
    <div className="panel fade-up p-6">
      <button
        type="button"
        className="btn btn-primary w-full pulse-soft"
        disabled={pending}
        onClick={pay}
      >
        {pending ? "Starting checkout…" : "Pay securely"}
      </button>
      {error ? <p className="mt-3 text-sm text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
