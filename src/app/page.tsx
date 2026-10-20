import Link from "next/link";
import { prisma } from "@/lib/db";
import { AppShell } from "@/components/AppShell";
import { CreateOrgForm } from "@/components/CreateOrgForm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const orgs = await prisma.organization.findMany({
    include: {
      _count: { select: { customers: true } },
      stripeConnect: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell>
      <section className="hero-grid fade-up mb-10 overflow-hidden rounded-[22px] border border-[var(--line)] bg-[linear-gradient(135deg,#12324a_0%,#1c3d5a_45%,#0f6e6a_100%)] px-8 py-14 text-white md:px-12">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
          Multi-tenant field operations
        </p>
        <h1 className="display mb-4 max-w-3xl text-4xl font-semibold leading-tight md:text-5xl">
          Fieldline
        </h1>
        <p className="fade-up-delay mb-8 max-w-2xl text-lg text-white/85">
          Assisted term sheets, quotes, job POs with optional sub-POs, digitized
          invoices, e-sign, receivable countdowns, and payment brokering to your
          banking rails.
        </p>
        <div className="flex flex-wrap gap-3">
          <a href="#orgs" className="btn btn-primary pulse-soft bg-white text-[var(--steel)]">
            Open organizations
          </a>
          <a href="#create" className="btn btn-ghost border-white/30 text-white">
            Create organization
          </a>
        </div>
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section id="orgs" className="panel fade-up p-6">
          <h2 className="display mb-1 text-2xl font-semibold">Organizations</h2>
          <p className="mb-5 text-sm text-[var(--ink-soft)]">
            Each organization is an isolated tenant with its own customers,
            banking destinations, and integrations.
          </p>
          {orgs.length === 0 ? (
            <p className="text-[var(--ink-soft)]">
              No organizations yet. Seed the database or create one.
            </p>
          ) : (
            <ul className="space-y-3">
              {orgs.map((org) => (
                <li key={org.id}>
                  <Link
                    href={`/orgs/${org.id}`}
                    className="flex items-center justify-between rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3 transition hover:border-[var(--tide)]"
                  >
                    <div>
                      <p className="font-semibold">{org.name}</p>
                      <p className="text-sm text-[var(--ink-soft)]">
                        /{org.slug} · {org._count.customers} customers · Connect{" "}
                        {org.stripeConnect?.onboardingComplete
                          ? "ready"
                          : "pending"}
                      </p>
                    </div>
                    <span className="text-[var(--tide)]">View →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section id="create" className="panel fade-up-delay p-6">
          <h2 className="display mb-1 text-2xl font-semibold">New organization</h2>
          <p className="mb-5 text-sm text-[var(--ink-soft)]">
            Spin up a tenant and attach Stripe Connect for payout brokering.
          </p>
          <CreateOrgForm />
        </section>
      </div>
    </AppShell>
  );
}
