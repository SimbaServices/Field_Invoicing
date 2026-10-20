import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { CreateCustomerForm } from "@/components/CreateCustomerForm";
import { OrgActions } from "@/components/OrgActions";

export const dynamic = "force-dynamic";

export default async function OrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    include: {
      customers: {
        include: {
          paymentTerms: true,
          _count: { select: { invoices: true, purchaseOrders: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      bankingAccounts: true,
      integrations: true,
      stripeConnect: true,
      users: true,
    },
  });
  if (!org) notFound();

  return (
    <AppShell crumb={org.name}>
      <div className="mb-8 fade-up">
        <h1 className="display text-4xl font-semibold text-[var(--steel)]">
          {org.name}
        </h1>
        <p className="mt-2 text-[var(--ink-soft)]">
          Tenant <code>/{org.slug}</code> · {org.users.length} users ·{" "}
          {org.customers.length} customers
        </p>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-3">
        <section className="panel fade-up p-5 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="display text-2xl font-semibold">Customers</h2>
          </div>
          {org.customers.length === 0 ? (
            <p className="text-[var(--ink-soft)]">No customers yet.</p>
          ) : (
            <ul className="space-y-3">
              {org.customers.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/customers/${c.id}`}
                    className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 transition hover:border-[var(--tide)]"
                  >
                    <div>
                      <p className="font-semibold">{c.name}</p>
                      <p className="text-sm text-[var(--ink-soft)]">
                        {c.paymentTerms?.name ?? "No terms"} ·{" "}
                        {c._count.purchaseOrders} POs · {c._count.invoices} invoices
                      </p>
                    </div>
                    <span className="text-[var(--tide)]">Open →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel fade-up-delay p-5">
          <h2 className="display mb-3 text-xl font-semibold">New customer</h2>
          <p className="mb-4 text-sm text-[var(--ink-soft)]">
            Creates payment terms and an assisted term sheet draft.
          </p>
          <CreateCustomerForm organizationId={org.id} />
        </section>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel p-5">
          <h2 className="display mb-3 text-xl font-semibold">Banking & Connect</h2>
          <p className="mb-3 text-sm text-[var(--ink-soft)]">
            Destination charges broker customer payments to this organization&apos;s
            connected account / banking destinations.
          </p>
          <ul className="mb-4 space-y-2 text-sm">
            {org.bankingAccounts.map((b) => (
              <li key={b.id} className="rounded-lg border border-[var(--line)] px-3 py-2">
                <strong>{b.label}</strong>
                <span className="text-[var(--ink-soft)]">
                  {" "}
                  · {b.provider}
                  {b.isDefault ? " · default" : ""}
                </span>
              </li>
            ))}
          </ul>
          <p className="mb-4 text-sm">
            Stripe Connect:{" "}
            <code>{org.stripeConnect?.stripeAccountId ?? "not linked"}</code>
            <br />
            Pattern: {org.stripeConnect?.chargePattern ?? "destination"} · dashboard{" "}
            {org.stripeConnect?.dashboard ?? "express"}
          </p>
          <OrgActions orgId={org.id} />
        </section>

        <section className="panel p-5">
          <h2 className="display mb-3 text-xl font-semibold">Integrations</h2>
          <ul className="space-y-2 text-sm">
            {org.integrations.length === 0 ? (
              <li className="text-[var(--ink-soft)]">No integrations connected.</li>
            ) : (
              org.integrations.map((i) => (
                <li key={i.id} className="rounded-lg border border-[var(--line)] px-3 py-2">
                  <strong className="capitalize">{i.provider}</strong> — {i.status}
                  {i.externalRealmId ? ` · ${i.externalRealmId}` : ""}
                </li>
              ))
            )}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
