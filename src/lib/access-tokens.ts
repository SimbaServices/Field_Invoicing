import { addDays } from "date-fns";
import { nanoid } from "nanoid";
import { prisma } from "./db";

export async function createAccessToken(
  invoiceId: string,
  purpose: "sign" | "pay",
  ttlDays = 14,
) {
  return prisma.accessToken.create({
    data: {
      invoiceId,
      purpose,
      token: nanoid(32),
      expiresAt: addDays(new Date(), ttlDays),
    },
  });
}

export async function resolveAccessToken(token: string, purpose?: "sign" | "pay") {
  const record = await prisma.accessToken.findUnique({
    where: { token },
    include: {
      invoice: {
        include: {
          customer: { include: { organization: true, paymentTerms: true } },
          receivable: true,
          purchaseOrder: true,
        },
      },
    },
  });

  if (!record) return null;
  if (purpose && record.purpose !== purpose) return null;
  if (record.expiresAt < new Date()) return null;
  return record;
}

export function publicAppUrl(path: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}${path}`;
}
