import { z } from "zod";
import { jsonError, jsonOk } from "@/lib/api";
import { connectQuickBooks, listIntegrations } from "@/lib/quickbooks";
import { prisma } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  const { orgId } = await params;
  const integrations = await listIntegrations(orgId);
  return jsonOk(integrations);
}

const schema = z.object({
  provider: z.enum(["quickbooks", "xero", "paypal", "square", "other"]),
  action: z.enum(["connect", "disconnect"]),
  realmId: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;
    const body = schema.parse(await req.json());

    if (body.provider === "quickbooks" && body.action === "connect") {
      const integration = await connectQuickBooks(
        orgId,
        body.realmId ?? `realm_stub_${orgId.slice(0, 6)}`,
      );
      return jsonOk(integration);
    }

    if (body.action === "disconnect") {
      const integration = await prisma.integrationConfig.upsert({
        where: {
          organizationId_provider: { organizationId: orgId, provider: body.provider },
        },
        create: {
          organizationId: orgId,
          provider: body.provider,
          status: "disconnected",
        },
        update: { status: "disconnected" },
      });
      return jsonOk(integration);
    }

    const integration = await prisma.integrationConfig.upsert({
      where: {
        organizationId_provider: { organizationId: orgId, provider: body.provider },
      },
      create: {
        organizationId: orgId,
        provider: body.provider,
        status: "connected",
        metadataJson: JSON.stringify({ connectedAt: new Date().toISOString() }),
      },
      update: { status: "connected" },
    });
    return jsonOk(integration);
  } catch (e) {
    return jsonError(e);
  }
}
