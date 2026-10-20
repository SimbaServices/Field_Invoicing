import { notFound } from "next/navigation";
import { resolveAccessToken } from "@/lib/access-tokens";
import { formatCents } from "@/lib/money";
import { SignForm } from "@/components/SignForm";

export const dynamic = "force-dynamic";

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const access = await resolveAccessToken(token, "sign");
  if (!access) notFound();

  const { invoice } = access;
  const alreadyDone = invoice.status === "signed" || invoice.status === "paid";

  return (
    <div className="min-h-screen px-5 py-12">
      <div className="mx-auto max-w-lg">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--tide)]">
          Limited-access signing
        </p>
        <h1 className="display mb-2 text-4xl font-semibold text-[var(--steel)]">
          Fieldline
        </h1>
        <p className="mb-8 text-[var(--ink-soft)]">
          No account required. Review and sign invoice {invoice.number} for{" "}
          {invoice.customer.organization.name}.
        </p>

        <section className="panel fade-up mb-6 p-6">
          <h2 className="display text-2xl font-semibold">{invoice.title}</h2>
          <p className="mt-2 text-lg font-semibold">
            {formatCents(invoice.amountCents, invoice.currency)}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-soft)]">
            Customer: {invoice.customer.name}
            {invoice.purchaseOrder ? ` · PO ${invoice.purchaseOrder.number}` : ""}
          </p>
          {invoice.description ? (
            <p className="mt-4 text-sm">{invoice.description}</p>
          ) : null}
        </section>

        {alreadyDone ? (
          <p className="panel p-5 text-[var(--ok)]">
            This invoice has already been {invoice.status}.
          </p>
        ) : (
          <SignForm token={token} />
        )}
      </div>
    </div>
  );
}
