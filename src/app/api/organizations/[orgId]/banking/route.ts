import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";

const schema = z.object({
  label: z.string().min(1),
  provider: z.enum(["stripe_connect", "plaid", "manual", "ach"]),
  isDefault: z.boolean().optional(),
  accountLast4: z.string().optional(),
  routingLast4: z.string().optional(),
  currency: z.string().default("usd"),
  metadataJson: z.string().optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const accounts = await prisma.bankingAccount.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk(accounts);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;
    const body = schema.parse(await req.json());

    if (body.isDefault) {
      await prisma.bankingAccount.updateMany({
        where: { organizationId: orgId },
        data: { isDefault: false },
      });
    }

    const account = await prisma.bankingAccount.create({
      data: {
        organizationId: orgId,
        ...body,
        metadataJson: body.metadataJson ?? "{}",
      },
    });
    return jsonOk(account, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
