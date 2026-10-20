"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function CreateOrgForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const payload = {
      name: String(form.get("name")),
      slug: String(form.get("slug")),
      ownerName: String(form.get("ownerName")),
      ownerEmail: String(form.get("ownerEmail")),
    };
    const res = await fetch("/api/organizations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to create organization");
      return;
    }
    router.push(`/orgs/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="field">
        <label htmlFor="name">Organization name</label>
        <input id="name" name="name" required placeholder="Northline Field Services" />
      </div>
      <div className="field">
        <label htmlFor="slug">Slug</label>
        <input id="slug" name="slug" required pattern="[a-z0-9-]+" placeholder="northline" />
      </div>
      <div className="field">
        <label htmlFor="ownerName">Owner name</label>
        <input id="ownerName" name="ownerName" required placeholder="Alex Rivera" />
      </div>
      <div className="field">
        <label htmlFor="ownerEmail">Owner email</label>
        <input
          id="ownerEmail"
          name="ownerEmail"
          type="email"
          required
          placeholder="ops@example.com"
        />
      </div>
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <button className="btn btn-primary w-full" disabled={pending} type="submit">
        {pending ? "Creating…" : "Create organization"}
      </button>
    </form>
  );
}
