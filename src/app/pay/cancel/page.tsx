import Link from "next/link";

export default function PayCancelPage() {
  return (
    <div className="min-h-screen px-5 py-16">
      <div className="mx-auto max-w-md panel p-8 text-center">
        <h1 className="display text-3xl font-semibold">Payment cancelled</h1>
        <p className="mt-3 text-[var(--ink-soft)]">
          No charge was made. You can reopen your payment link anytime before it
          expires.
        </p>
        <Link href="/" className="btn btn-primary mt-6 inline-flex">
          Back to Fieldline
        </Link>
      </div>
    </div>
  );
}
