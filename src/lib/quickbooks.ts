import { prisma } from "./db";

/**
 * QuickBooks Online integration stub.
 * Wire OAuth + Invoice sync using Intuit's API when credentials are present.
 */
export async function connectQuickBooks(organizationId: string, realmId: string) {
  return prisma.integrationConfig.upsert({
    where: {
      organizationId_provider: { organizationId, provider: "quickbooks" },
    },
    create: {
      organizationId,
      provider: "quickbooks",
      status: "connected",
      externalRealmId: realmId,
      metadataJson: JSON.stringify({ connectedAt: new Date().toISOString() }),
    },
    update: {
      status: "connected",
      externalRealmId: realmId,
      metadataJson: JSON.stringify({ connectedAt: new Date().toISOString() }),
    },
  });
}

export async function syncInvoiceToQuickBooks(invoiceId: string) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });

  const integration = await prisma.integrationConfig.findUnique({
    where: {
      organizationId_provider: {
        organizationId: invoice.customer.organizationId,
        provider: "quickbooks",
      },
    },
  });

  if (!integration || integration.status !== "connected") {
    return {
      ok: false as const,
      reason: "QuickBooks is not connected for this organization",
    };
  }

  // Placeholder payload that a real adapter would POST to QBO
  const payload = {
    DocNumber: invoice.number,
    CustomerRef: { name: invoice.customer.name },
    TotalAmt: invoice.amountCents / 100,
    PrivateNote: `Field Invoicing sync — ${invoice.id}`,
    realmId: integration.externalRealmId,
  };

  console.info("[quickbooks] sync invoice", payload);

  return { ok: true as const, payload };
}

export async function listIntegrations(organizationId: string) {
  return prisma.integrationConfig.findMany({ where: { organizationId } });
}
