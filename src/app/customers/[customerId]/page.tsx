import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Money } from "@/components/Money";
import { receivableCountdown } from "@/lib/receivables";
import { poCashFlow } from "@/lib/purchase-orders";
import { CustomerWorkbench } from "@/components/CustomerWorkbench";

export const dynamic = "force-dynamic";

export default async function CustomerPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = await params;
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      organization: true,
      paymentTerms: true,
      emailConfigs: true,
      termSheets: { orderBy: { createdAt: "desc" } },
      quotes: { orderBy: { createdAt: "desc" } },
      purchaseOrders: {
        where: { parentPoId: null },
        include: { children: true },
        orderBy: { createdAt: "desc" },
      },
      invoices: {
        include: { receivable: true, blob: true, purchaseOrder: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!customer) notFound();

  const cashFlows = await Promise.all(
    customer.purchaseOrders.map((po) => poCashFlow(po.id)),
  );

  return (
    <AppShell crumb={`${customer.organization.name} / ${customer.name}`}>
      <div className="mb-8 fade-up">
        <Link
          href={`/orgs/${customer.organizationId}`}
          className="text-sm font-medium text-[var(--tide)]"
        >
          ← {customer.organization.name}
        </Link>
        <h1 className="display mt-2 text-4xl font-semibold text-[var(--steel)]">
          {customer.name}
        </h1>
        <p className="mt-2 text-[var(--ink-soft)]">
          {customer.paymentTerms?.name ?? "No payment terms"} · Net{" "}
          {customer.paymentTerms?.netDays ?? "—"} days
        </p>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section className="panel fade-up p-5">
          <h2 className="display mb-4 text-2xl font-semibold">Invoices</h2>
          <div className="space-y-3">
            {customer.invoices.map((inv) => {
              const countdown = inv.receivable
                ? receivableCountdown(inv.receivable.dueAt)
                : null;
              return (
                <div
                  key={inv.id}
                  className="rounded-xl border border-[var(--line)] bg-white/80 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <p className="font-semibold">
                          {inv.number} — {inv.title}
                        </p>
                        <StatusBadge status={inv.status} />
                        <span className="badge badge-open">{inv.source}</span>
                      </div>
                      <p className="text-sm text-[var(--ink-soft)]">
                        <Money cents={inv.amountCents} currency={inv.currency} />
                        {inv.purchaseOrder
                          ? ` · ${inv.purchaseOrder.number}`
                          : ""}
                        {inv.blob ? ` · blob ${inv.blob.filename}` : ""}
                      </p>
                      {countdown ? (
                        <p
                          className={`mt-1 text-sm font-semibold ${
                            countdown.overdue ? "text-[var(--danger)]" : "text-[var(--tide)]"
                          }`}
                        >
                          Receivable: {countdown.label}
                        </p>
                      ) : null}
                    </div>
                    <CustomerWorkbench.InvoiceActions
                      invoiceId={inv.id}
                      status={inv.status}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="space-y-6">
          <section className="panel fade-up-delay p-5">
            <h2 className="display mb-3 text-xl font-semibold">Email routing</h2>
            <ul className="space-y-2 text-sm">
              {customer.emailConfigs.map((e) => (
                <li key={e.id}>
                  <span className="font-semibold capitalize">
                    {e.purpose}/{e.role}
                  </span>
                  : {e.email}
                </li>
              ))}
            </ul>
          </section>

          <section className="panel p-5">
            <h2 className="display mb-3 text-xl font-semibold">Term sheets</h2>
            {customer.termSheets.map((t) => (
              <article key={t.id} className="mb-3 rounded-lg border border-[var(--line)] p-3">
                <p className="font-semibold">{t.title}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {t.status} · assisted by {t.assistedBy}
                </p>
              </article>
            ))}
            <CustomerWorkbench.TermSheetButton customerId={customer.id} />
          </section>
        </aside>
      </div>

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="display mb-4 text-2xl font-semibold">Quotes</h2>
          <ul className="mb-4 space-y-2">
            {customer.quotes.map((q) => (
              <li
                key={q.id}
                className="flex items-center justify-between rounded-lg border border-[var(--line)] px-3 py-2 text-sm"
              >
                <span>
                  {q.number} — {q.title}
                </span>
                <span className="flex items-center gap-2">
                  <Money cents={q.totalCents} />
                  <StatusBadge status={q.status} />
                </span>
              </li>
            ))}
          </ul>
          <CustomerWorkbench.QuoteForm customerId={customer.id} />
        </section>

        <section className="panel p-5">
          <h2 className="display mb-4 text-2xl font-semibold">Job POs & cash flow</h2>
          {cashFlows.map((flow) => (
            <div
              key={flow.purchaseOrder.id}
              className="mb-4 rounded-xl border border-[var(--line)] p-4"
            >
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">
                  {flow.purchaseOrder.number} — {flow.purchaseOrder.title}
                </p>
                <StatusBadge status={flow.purchaseOrder.status} />
              </div>
              <p className="mb-2 text-sm text-[var(--ink-soft)]">
                Job code {flow.purchaseOrder.jobCode} · Pending{" "}
                <Money cents={flow.job.pending} /> · Signed{" "}
                <Money cents={flow.job.signed} /> · Paid{" "}
                <Money cents={flow.job.paid} />
              </p>
              {flow.subPos.length > 0 ? (
                <ul className="mb-3 space-y-1 text-sm">
                  {flow.subPos.map((s) => (
                    <li key={s.id}>
                      Sub-PO {s.number} (parent {s.parentNumber}): pending{" "}
                      <Money cents={s.pending} />, paid <Money cents={s.paid} />
                    </li>
                  ))}
                </ul>
              ) : null}
              <CustomerWorkbench.SubPoForm parentPoId={flow.purchaseOrder.id} />
            </div>
          ))}
          <CustomerWorkbench.JobPoForm customerId={customer.id} />
        </section>
      </div>

      <section className="panel p-5">
        <h2 className="display mb-4 text-2xl font-semibold">Create / upload invoice</h2>
        <CustomerWorkbench.InvoiceForms
          customerId={customer.id}
          purchaseOrders={[
            ...customer.purchaseOrders,
            ...customer.purchaseOrders.flatMap((p) => p.children),
          ].map((p) => ({ id: p.id, number: p.number, title: p.title }))}
        />
      </section>
    </AppShell>
  );
}
