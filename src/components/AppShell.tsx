import Link from "next/link";

export function AppShell({
  children,
  crumb,
}: {
  children: React.ReactNode;
  crumb?: string;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-white/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-baseline gap-2">
            <span className="display text-2xl font-semibold text-[var(--steel)]">
              Fieldline
            </span>
            <span className="hidden text-sm text-[var(--ink-soft)] sm:inline">
              ticketing & receivables
            </span>
          </Link>
          {crumb ? (
            <p className="text-sm font-medium text-[var(--ink-soft)]">{crumb}</p>
          ) : null}
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-8">{children}</main>
    </div>
  );
}
