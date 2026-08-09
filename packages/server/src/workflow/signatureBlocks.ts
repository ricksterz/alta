import type { SignerRole } from "@prisma/client";
import { prisma } from "../db/client.js";
import type { ScopedClient } from "../db/scopedClient.js";

// Executing signature blocks.
//
// A signer does not sign "a document" — they execute a set of marks defined by
// the template: signatures, initials, dates, each at a known page. This
// resolves the blocks for the signer's role and records one fulfillment per
// block, so the audit answers "which marks are present" rather than only "did
// they sign".

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

export async function fulfillBlocksForSigner(args: {
  db: ScopedClient;
  tenantId: string;
  sponsorTenantId: string;
  signatureRequestId: string;
  documentId: string;
  role: SignerRole;
  typedName: string;
  signedAt: Date;
}) {
  // Blocks belong to the sponsor's template. An advisor-tenant caller cannot
  // read them through its own scoped client, and this is a legitimate
  // cross-boundary read for the same reason template field mappings are: the
  // signer must be shown, and bound by, the marks the sponsor defined.
  const document = await prisma.subscriptionDocument.findUnique({
    where: { id: args.documentId },
    select: { templateId: true },
  });
  if (!document) return [];

  const blocks = await prisma.signatureBlock.findMany({
    where: { templateId: document.templateId, signerRole: args.role },
    orderBy: [{ pageNum: "asc" }, { anvilFieldKey: "asc" }],
  });
  if (blocks.length === 0) return [];

  await args.db.signatureBlockFulfillment.createMany({
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

  return blocks;
}

/** Block counts for a template, by role — for progress display. */
export async function blockSummaryForTemplate(templateId: string) {
  const blocks = await prisma.signatureBlock.findMany({ where: { templateId } });
  return {
    total: blocks.length,
    byRole: blocks.reduce<Record<string, number>>((acc, b) => {
      acc[b.signerRole] = (acc[b.signerRole] ?? 0) + 1;
      return acc;
    }, {}),
  };
}
