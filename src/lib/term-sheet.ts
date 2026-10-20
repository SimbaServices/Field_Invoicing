import type { TermSheetSection } from "./types";

/**
 * Assisted term-sheet generation from payment terms + customer context.
 * Replace with an LLM call behind the same interface when ready.
 */
export function generateTermSheetDraft(input: {
  customerName: string;
  organizationName: string;
  netDays: number;
  earlyPayDiscount?: number | null;
  lateFeePercent?: number | null;
  currency: string;
  notes?: string | null;
}): { title: string; sections: TermSheetSection[]; markdown: string } {
  const sections: TermSheetSection[] = [
    {
      heading: "Parties",
      body: `This payment terms agreement is between ${input.organizationName} (“Provider”) and ${input.customerName} (“Customer”).`,
    },
    {
      heading: "Payment timing",
      body: `Invoices are due within ${input.netDays} days of the Customer’s digital signature confirming the receivable (Net ${input.netDays}).`,
    },
    {
      heading: "Currency",
      body: `All amounts are denominated in ${input.currency.toUpperCase()} unless otherwise stated on the invoice.`,
    },
  ];

  if (input.earlyPayDiscount) {
    sections.push({
      heading: "Early payment discount",
      body: `A ${input.earlyPayDiscount}% discount may apply when payment is received within 10 days of signature.`,
    });
  }

  if (input.lateFeePercent) {
    sections.push({
      heading: "Late fees",
      body: `Past-due balances may incur a late fee of ${input.lateFeePercent}% per month on the outstanding principal.`,
    });
  }

  sections.push({
    heading: "Invoicing & signature",
    body: "Invoices may be generated in-app or digitized from hard-copy uploads. Signing (in-app or via limited-access link) confirms the receivable and starts the payment-term countdown.",
  });

  sections.push({
    heading: "Payment methods",
    body: "Upon signature, Customer will receive a limited-access payment link for the confirmed receivable. Payments may be processed through connected banking and accounting integrations configured by Provider.",
  });

  if (input.notes) {
    sections.push({ heading: "Additional notes", body: input.notes });
  }

  const markdown = sections.map((s) => `## ${s.heading}\n\n${s.body}`).join("\n\n");
  return {
    title: `Payment Terms — ${input.customerName}`,
    sections,
    markdown,
  };
}
