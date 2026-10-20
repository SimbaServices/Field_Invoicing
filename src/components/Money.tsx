import { formatCents } from "@/lib/money";

export function Money({
  cents,
  currency = "usd",
}: {
  cents: number;
  currency?: string;
}) {
  return <span className="countdown">{formatCents(cents, currency)}</span>;
}
