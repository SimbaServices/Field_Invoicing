export function formatCents(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

export function sumLineItems(
  items: { quantity: number; unitCents: number }[],
): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitCents, 0);
}
