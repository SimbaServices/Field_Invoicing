export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "paid"
      ? "badge-paid"
      : status === "signed"
        ? "badge-signed"
        : status === "open" || status === "sent" || status === "accepted"
          ? "badge-open"
          : "badge-pending";
  return <span className={`badge ${cls}`}>{status}</span>;
}
