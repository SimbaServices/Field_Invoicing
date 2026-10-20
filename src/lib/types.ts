export type LineItem = {
  description: string;
  quantity: number;
  unitCents: number;
};

export type TermSheetSection = {
  heading: string;
  body: string;
};

export type InvoiceStatus = "pending" | "signed" | "paid";
export type PoStatus = "open" | "in_progress" | "closed" | "cancelled";
export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "expired";
