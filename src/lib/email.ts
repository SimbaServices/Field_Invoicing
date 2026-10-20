import { prisma } from "./db";

type SendEmailInput = {
  customerId?: string;
  to: string[];
  fromEmail: string;
  subject: string;
  bodyText: string;
  purpose: "quote" | "sign_link" | "payment_link" | "general";
  relatedType?: string;
  relatedId?: string;
};

/**
 * Outbound email adapter. Persists every message for auditability.
 * In production, swap `deliver` for SES / Postmark / Resend.
 */
async function deliver(input: SendEmailInput): Promise<"sent" | "failed"> {
  if (process.env.EMAIL_PROVIDER === "console" || !process.env.EMAIL_PROVIDER) {
    console.info("[email]", {
      from: input.fromEmail,
      to: input.to,
      subject: input.subject,
      purpose: input.purpose,
    });
    return "sent";
  }
  // Extension point for real providers
  return "sent";
}

export async function sendEmail(input: SendEmailInput) {
  const status = await deliver(input);
  return prisma.outboundEmail.create({
    data: {
      customerId: input.customerId,
      toJson: JSON.stringify(input.to),
      fromEmail: input.fromEmail,
      subject: input.subject,
      bodyText: input.bodyText,
      purpose: input.purpose,
      status,
      relatedType: input.relatedType,
      relatedId: input.relatedId,
      sentAt: status === "sent" ? new Date() : null,
    },
  });
}

export async function resolveCustomerEmails(
  customerId: string,
  purpose: string,
): Promise<{ senders: { email: string; name: string | null }[]; recipients: { email: string; name: string | null }[] }> {
  const configs = await prisma.customerEmailConfig.findMany({
    where: { customerId, purpose: { in: [purpose, "general"] } },
  });

  const senders = configs.filter((c) => c.role === "sender");
  const recipients = configs.filter((c) => c.role === "recipient");

  const fallback = await prisma.customer.findUnique({ where: { id: customerId } });
  if (recipients.length === 0 && fallback?.email) {
    recipients.push({
      id: "fallback",
      customerId,
      purpose,
      role: "recipient",
      email: fallback.email,
      name: fallback.name,
      isDefault: true,
      createdAt: new Date(),
    });
  }

  return {
    senders: senders.map((s) => ({ email: s.email, name: s.name })),
    recipients: recipients.map((r) => ({ email: r.email, name: r.name })),
  };
}
