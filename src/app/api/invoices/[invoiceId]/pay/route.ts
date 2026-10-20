import { jsonError, jsonOk } from "@/lib/api";
import { startPaymentForInvoice } from "@/lib/invoices";
import { createAccessToken, publicAppUrl } from "@/lib/access-tokens";
import { resolveCustomerEmails, sendEmail } from "@/lib/email";
import { prisma } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> },
) {
  try {
    const { invoiceId } = await params;
    const body = await req.json().catch(() => ({}));
    const checkout = await startPaymentForInvoice(invoiceId);

    if (body.sendLink) {
      const invoice = await prisma.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
      });
      const token = await createAccessToken(invoiceId, "pay");
      const url = publicAppUrl(`/pay/${token.token}`);
      const emails = await resolveCustomerEmails(invoice.customerId, "payment");
      await sendEmail({
        customerId: invoice.customerId,
        to: emails.recipients.map((r) => r.email),
        fromEmail:
          emails.senders[0]?.email ??
          process.env.DEFAULT_FROM_EMAIL ??
          "billing@fieldinvoicing.local",
        subject: `Pay invoice ${invoice.number}`,
        bodyText: `Pay securely: ${url}`,
        purpose: "payment_link",
        relatedType: "invoice",
        relatedId: invoice.id,
      });
      return jsonOk({ ...checkout, limitedAccessUrl: url });
    }

    return jsonOk(checkout);
  } catch (e) {
    return jsonError(e);
  }
}
