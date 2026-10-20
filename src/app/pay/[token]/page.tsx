import { notFound } from "next/navigation";
import { resolveAccessToken } from "@/lib/access-tokens";
import { formatCents } from "@/lib/money";
import { receivableCountdown } from "@/lib/receivables";
import { PayButton } from "@/components/PayButton";

export const dynamic = "force-dynamic";

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await resolveAccessToken(token, "pay");
  if (!access) notFound();

  const { invoice } = access;
  const countdown = invoice.receivable
    ? receivableCountdown(invoice.receivable.dueAt)
    : null;

  return (
    <div className="min-h-screen px-5 py-12">
      <div className="mx-auto max-w-lg">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--tide)]">
          Limited-access payment
        </p>
        <h1 className="display mb-2 text-4xl font-semibold text-[var(--steel)]">
          Fieldline
        </h1>
        <p className="mb-8 text-[var(--ink-soft)]">
          Pay the confirmed receivable for invoice {invoice.number}. Funds are
          brokered to {invoice.customer.organization.name}.
        </p>

        <section className="panel fade-up mb-6 p-6">
          <h2 className="display text-2xl font-semibold">{invoice.title}</h2>
          <p className="mt-2 text-3xl font-semibold">
            {formatCents(invoice.amountCents, invoice.currency)}
          </p>
          {countdown ? (
            <p
              className={`mt-3 font-semibold ${
                countdown.overdue ? "text-[var(--danger)]" : "text-[var(--tide)]"
              }`}
            >
              {countdown.label}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-[var(--ink-soft)]">Status: {invoice.status}</p>
        </section>

        {invoice.status === "paid" ? (
          <p className="panel p-5 text-[var(--ok)]">This invoice is already paid.</p>
        ) : invoice.status !== "signed" ? (
          <p className="panel p-5 text-[var(--warn)]">
            This invoice must be signed before payment.
          </p>
        ) : (
          <PayButton token={token} />
        )}
      </div>
    </div>
  );
}
