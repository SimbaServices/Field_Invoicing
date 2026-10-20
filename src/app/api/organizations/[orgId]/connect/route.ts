import { jsonError, jsonOk } from "@/lib/api";
import { createConnectOnboardingLink, ensureConnectAccount } from "@/lib/stripe";
import { publicAppUrl } from "@/lib/access-tokens";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;
    const account = await ensureConnectAccount(orgId);
    return jsonOk(account);
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    const { orgId } = await params;
    const link = await createConnectOnboardingLink(
      orgId,
      publicAppUrl(`/orgs/${orgId}?connect=refresh`),
      publicAppUrl(`/orgs/${orgId}?connect=return`),
    );
    return jsonOk(link);
  } catch (e) {
    return jsonError(e);
  }
}
