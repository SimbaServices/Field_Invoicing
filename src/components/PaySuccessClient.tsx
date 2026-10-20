"use client";

import { useEffect, useState } from "react";

/** Completes stub checkouts in local/dev when Stripe webhooks are not configured */
export function PaySuccessClient({ sessionId }: { sessionId: string }) {
  const [status, setStatus] = useState("Confirming…");

  useEffect(() => {
    fetch("/api/pay/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
    })
      .then(async (res) => {
        const data = await res.json();
        setStatus(res.ok ? "Invoice marked paid." : data.error ?? "Pending webhook");
      })
      .catch(() => setStatus("Pending webhook confirmation"));
  }, [sessionId]);

  return <p className="mt-4 text-sm font-medium text-[var(--tide)]">{status}</p>;
}
