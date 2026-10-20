import { PaySuccessClient } from "@/components/PaySuccessClient";

export default async function PaySuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  return (
    <div className="min-h-screen px-5 py-16">
      <div className="mx-auto max-w-md panel fade-up p-8 text-center">
        <h1 className="display text-3xl font-semibold text-[var(--steel)]">
          Payment received
        </h1>
        <p className="mt-3 text-[var(--ink-soft)]">
          Thank you. The receivable will update once the payment provider confirms
          settlement.
        </p>
        {session_id ? <PaySuccessClient sessionId={session_id} /> : null}
      </div>
    </div>
  );
}
