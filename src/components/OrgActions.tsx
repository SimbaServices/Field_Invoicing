"use client";

import { useState } from "react";

export function OrgActions({ orgId }: { orgId: string }) {
  const [message, setMessage] = useState<string | null>(null);

  async function startConnect() {
    const res = await fetch(`/api/organizations/${orgId}/connect`, { method: "POST" });
    const data = await res.json();
    if (data.url) {
      setMessage(`Onboarding URL ready${data.url.includes("stub") ? " (stub mode)" : ""}`);
      window.open(data.url, "_blank");
    } else {
      setMessage(data.error ?? "Failed");
    }
  }

  async function connectQbo() {
    const res = await fetch(`/api/organizations/${orgId}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "quickbooks", action: "connect" }),
    });
    const data = await res.json();
    setMessage(res.ok ? `QuickBooks connected (${data.externalRealmId})` : data.error);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className="btn btn-secondary" onClick={startConnect}>
        Connect payouts
      </button>
      <button type="button" className="btn btn-ghost" onClick={connectQbo}>
        Connect QuickBooks
      </button>
      {message ? <p className="w-full text-sm text-[var(--ink-soft)]">{message}</p> : null}
    </div>
  );
}
