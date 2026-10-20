import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { ensureConnectAccount } from "@/lib/stripe";

const createSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  ownerEmail: z.string().email(),
  ownerName: z.string().min(1),
});

export async function GET() {
  const orgs = await prisma.organization.findMany({
    include: {
      _count: { select: { customers: true, users: true } },
      stripeConnect: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return jsonOk(orgs);
}

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const org = await prisma.organization.create({
      data: {
        name: body.name,
        slug: body.slug,
        users: {
          create: {
            email: body.ownerEmail,
            name: body.ownerName,
            role: "owner",
          },
        },
      },
      include: { users: true },
    });
    await ensureConnectAccount(org.id);
    return jsonOk(org, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
