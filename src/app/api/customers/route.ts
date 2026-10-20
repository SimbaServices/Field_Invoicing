import { z } from "zod";
import { prisma } from "@/lib/db";
import { jsonError, jsonOk } from "@/lib/api";
import { generateTermSheetDraft } from "@/lib/term-sheet";

const createSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  legalName: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  billingAddress: z.string().optional(),
  paymentTerms: z
    .object({
      name: z.string().default("Net 30"),
      netDays: z.number().int().positive().default(30),
      earlyPayDiscount: z.number().optional(),
      lateFeePercent: z.number().optional(),
      currency: z.string().default("usd"),
      notes: z.string().optional(),
    })
    .optional(),
  emailConfigs: z
    .array(
      z.object({
        purpose: z.enum(["quote", "payment", "signing", "general"]),
        role: z.enum(["sender", "recipient"]),
        email: z.string().email(),
        name: z.string().optional(),
        isDefault: z.boolean().optional(),
      }),
    )
    .optional(),
  generateTermSheet: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = createSchema.parse(await req.json());
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: body.organizationId },
    });

    const terms = body.paymentTerms ?? { name: "Net 30", netDays: 30, currency: "usd" };

    const customer = await prisma.customer.create({
      data: {
        organizationId: body.organizationId,
        name: body.name,
        legalName: body.legalName,
        email: body.email,
        phone: body.phone,
        billingAddress: body.billingAddress,
        paymentTerms: {
          create: {
            name: terms.name ?? "Net 30",
            netDays: terms.netDays ?? 30,
            earlyPayDiscount: terms.earlyPayDiscount,
            lateFeePercent: terms.lateFeePercent,
            currency: terms.currency ?? "usd",
            notes: terms.notes,
          },
        },
        emailConfigs: body.emailConfigs
          ? { create: body.emailConfigs }
          : body.email
            ? {
                create: [
                  {
                    purpose: "general",
                    role: "recipient",
                    email: body.email,
                    name: body.name,
                    isDefault: true,
                  },
                ],
              }
            : undefined,
      },
      include: { paymentTerms: true, emailConfigs: true },
    });

    let termSheet = null;
    if (body.generateTermSheet !== false && customer.paymentTerms) {
      const draft = generateTermSheetDraft({
        customerName: customer.name,
        organizationName: org.name,
        netDays: customer.paymentTerms.netDays,
        earlyPayDiscount: customer.paymentTerms.earlyPayDiscount,
        lateFeePercent: customer.paymentTerms.lateFeePercent,
        currency: customer.paymentTerms.currency,
        notes: customer.paymentTerms.notes,
      });
      termSheet = await prisma.termSheet.create({
        data: {
          customerId: customer.id,
          title: draft.title,
          status: "draft",
          contentJson: JSON.stringify(draft.sections),
          contentMarkdown: draft.markdown,
          assistedBy: "template",
        },
      });
    }

    return jsonOk({ customer, termSheet }, { status: 201 });
  } catch (e) {
    return jsonError(e);
  }
}
