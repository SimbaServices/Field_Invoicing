import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { generateTermSheetDraft } from "@/lib/term-sheet";

const schema = z.object({
  customerId: z.string(),
  assistedBy: z.enum(["ai", "template", "manual"]).default("template"),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { id: body.customerId },
      include: { organization: true, paymentTerms: true },
    });
    if (!customer.paymentTerms) {
      return jsonError(new Error("Customer has no payment terms"), 400);
    }

    const draft = generateTermSheetDraft({
      customerName: customer.name,
      organizationName: customer.organization.name,
      netDays: customer.paymentTerms.netDays,
      earlyPayDiscount: customer.paymentTerms.earlyPayDiscount,
      lateFeePercent: customer.paymentTerms.lateFeePercent,
      currency: customer.paymentTerms.currency,
      notes: customer.paymentTerms.notes,
    });

    const termSheet = await prisma.termSheet.create({
      data: {
        customerId: customer.id,
        title: draft.title,
        contentJson: JSON.stringify(draft.sections),
        contentMarkdown: draft.markdown,
        assistedBy: body.assistedBy,
        status: "draft",
      },
    });

    return jsonOk(termSheet, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
