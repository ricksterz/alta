import type { PrismaClient, SignerRole } from "@prisma/client";
import { decryptOptional } from "../src/crypto/fieldEncryption.js";
import { resolveFields } from "../src/workflow/resolveFields.js";
import { getDocumentProvider } from "../src/workflow/documentProvider.js";
import { CANONICAL_FIELDS } from "../src/canonicalFields.js";

// Generates a real, filled PDF (via the same local pdf-lib provider the app
// uses) and a full set of signed SignatureRequest + SignatureBlockFulfillment
// rows for a subscription that has already progressed past pending_signatures
// in the seed fixture (accepted / funded / rejected all imply the real
// workflow reached full execution before that decision was made).
//
// This mirrors POST /subscriptions/:id/generate-document and
// POST /subscriptions/:id/signatures/:sigId/sign in routes/subscriptions.ts
// and workflow/signatureBlocks.ts, but talks to the unscoped seed `prisma`
// client directly rather than a request-scoped ScopedClient.
//
// The generated PDF is written to local disk (UPLOAD_ROOT) exactly like a
// real local-provider fill — including on a deployed host, where that disk is
// ephemeral and the file will not survive a redeploy. The DB rows do: only
// the "view PDF" link goes stale, and GET /:id/document already 404s
// gracefully when the file is missing.

function investorDisplayName(inv: {
  type: string;
  firstName: string | null;
  lastName: string | null;
  entityName: string | null;
}) {
  return inv.type === "entity" || inv.type === "trust"
    ? (inv.entityName ?? "(unnamed)")
    : `${inv.firstName ?? ""} ${inv.lastName ?? ""}`.trim() || "(unnamed)";
}

function markFor(blockType: string, typedName: string, signedAt: Date): string {
  switch (blockType) {
    case "initials":
      return typedName
        .split(/\s+/)
        .filter(Boolean)
        .map((part) => part[0]!.toUpperCase())
        .join("");
    case "date":
      return signedAt.toISOString().slice(0, 10);
    default:
      return typedName;
  }
}

async function fulfillBlocks(
  prisma: PrismaClient,
  args: {
    tenantId: string;
    sponsorTenantId: string;
    templateId: string;
    signatureRequestId: string;
    role: SignerRole;
    typedName: string;
    signedAt: Date;
  }
) {
  const blocks = await prisma.signatureBlock.findMany({
    where: { templateId: args.templateId, signerRole: args.role },
    orderBy: [{ pageNum: "asc" }, { anvilFieldKey: "asc" }],
  });
  if (blocks.length === 0) return;

  await prisma.signatureBlockFulfillment.createMany({
    data: blocks.map((block) => ({
      tenantId: args.tenantId,
      sponsorTenantId: args.sponsorTenantId,
      signatureRequestId: args.signatureRequestId,
      signatureBlockId: block.id,
      appliedValue: markFor(block.blockType, args.typedName, args.signedAt),
      appliedAt: args.signedAt,
    })),
    skipDuplicates: true,
  });
}

export async function seedDocumentAndSignatures(
  prisma: PrismaClient,
  subscriptionId: string,
  opts: { generatedAt: Date; signedAt: Date }
): Promise<boolean> {
  const already = await prisma.subscriptionDocument.findFirst({ where: { subscriptionId } });
  if (already) return true;

  const subscription = await prisma.subscription.findUniqueOrThrow({
    where: { id: subscriptionId },
    include: {
      investor: { include: { taxProfile: true, principals: true } },
      fund: { include: { terms: true } },
      shareClass: true,
    },
  });

  // A subscription that already reached accepted/funded/rejected must, in the
  // real workflow, have had a *ready* template at generation time — but its
  // template's status can move on afterward (e.g. sent back for legal
  // re-review), same as any other seeded fixture drifting after the fact.
  // Any fully-mapped template for the fund is a legitimate stand-in here;
  // this is reconstructing history, not re-running today's gate.
  const template = await prisma.documentTemplate.findFirst({
    where: { fundId: subscription.fundId },
    orderBy: { uploadedAt: "desc" },
    include: { fieldMappings: true },
  });
  if (!template) {
    console.warn(`  ! no template at all for fund ${subscription.fundId} — skipping document seed for ${subscriptionId}`);
    return false;
  }

  const investorForFill = {
    ...subscription.investor,
    taxProfile: subscription.investor.taxProfile
      ? {
          ...subscription.investor.taxProfile,
          w9TaxpayerId: decryptOptional(subscription.investor.taxProfile.w9TaxpayerId),
          w8ForeignTaxId: decryptOptional(subscription.investor.taxProfile.w8ForeignTaxId),
        }
      : null,
  };

  const resolution = resolveFields(
    template.fieldMappings.map((m) => ({
      anvilFieldKey: m.anvilFieldKey,
      mappingType: m.mappingType,
      canonicalField: m.canonicalField,
      staticValue: m.staticValue,
    })),
    { investor: investorForFill, subscription, fund: subscription.fund, shareClass: subscription.shareClass }
  );

  const fieldLabels: Record<string, string> = {};
  for (const m of template.fieldMappings) {
    const canonical = CANONICAL_FIELDS.find((f) => f.key === m.canonicalField);
    fieldLabels[m.anvilFieldKey] = canonical?.label ?? m.anvilFieldLabel ?? m.anvilFieldKey;
  }

  const provider = getDocumentProvider();
  const filled = await provider.fill({
    subscriptionId: subscription.id,
    tenantId: subscription.tenantId,
    anvilTemplateId: template.anvilTemplateId,
    originalFilename: template.originalFilename,
    values: resolution.values,
    context: {
      fundName: subscription.fund.legalName ?? subscription.fund.name,
      investorName: investorDisplayName(subscription.investor),
      fieldLabels,
    },
  });

  const unresolvedForRecord = [
    ...resolution.unresolved,
    ...resolution.unmapped.map((k) => ({
      anvilFieldKey: k,
      canonicalField: "(unmapped)",
      reason: "Field was never mapped by the fund sponsor",
    })),
  ];

  const document = await prisma.subscriptionDocument.create({
    data: {
      tenantId: subscription.tenantId,
      sponsorTenantId: subscription.sponsorTenantId,
      subscriptionId: subscription.id,
      templateId: template.id,
      provider: filled.provider,
      storagePath: filled.storagePath,
      fieldValues: resolution.values,
      unresolvedFields: unresolvedForRecord,
      generatedAt: opts.generatedAt,
    },
  });

  const principals = subscription.investor.principals;
  const investorSignatures = [];
  for (const [i, p] of principals.entries()) {
    investorSignatures.push(
      await prisma.signatureRequest.create({
        data: {
          tenantId: subscription.tenantId,
          sponsorTenantId: subscription.sponsorTenantId,
          subscriptionId: subscription.id,
          documentId: document.id,
          role: "investor_signer",
          sequence: i + 1,
          investorPrincipalId: p.id,
          signerName: `${p.firstName} ${p.lastName}`,
          signerEmail: p.email,
        },
      })
    );
  }

  const gpSignature = await prisma.signatureRequest.create({
    data: {
      tenantId: subscription.tenantId,
      sponsorTenantId: subscription.sponsorTenantId,
      subscriptionId: subscription.id,
      documentId: document.id,
      role: "gp_countersigner",
      sequence: principals.length + 1,
      signerName: subscription.fund.gpSignatoryName ?? "Fund General Partner",
    },
  });

  for (const sig of investorSignatures) {
    const principal = principals.find((p) => p.id === sig.investorPrincipalId)!;
    const typedName = `${principal.firstName} ${principal.lastName}`;
    await prisma.signatureRequest.update({
      where: { id: sig.id },
      data: { status: "signed", signedAt: opts.signedAt, typedName },
    });
    await fulfillBlocks(prisma, {
      tenantId: subscription.tenantId,
      sponsorTenantId: subscription.sponsorTenantId,
      templateId: template.id,
      signatureRequestId: sig.id,
      role: "investor_signer",
      typedName,
      signedAt: opts.signedAt,
    });
  }

  const gpTypedName = subscription.fund.gpSignatoryName ?? "Fund General Partner";
  await prisma.signatureRequest.update({
    where: { id: gpSignature.id },
    data: { status: "signed", signedAt: opts.signedAt, typedName: gpTypedName },
  });
  await fulfillBlocks(prisma, {
    tenantId: subscription.tenantId,
    sponsorTenantId: subscription.sponsorTenantId,
    templateId: template.id,
    signatureRequestId: gpSignature.id,
    role: "gp_countersigner",
    typedName: gpTypedName,
    signedAt: opts.signedAt,
  });

  return true;
}
