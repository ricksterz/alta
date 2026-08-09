import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { encryptOptional, isEncrypted } from "../src/crypto/fieldEncryption.js";

// One-time backfill for tax profiles written before column encryption landed.
// Idempotent: encryptOptional passes through anything already in v1 form, so
// re-running is safe and a partial run can simply be repeated.
const prisma = new PrismaClient();

async function main() {
  const profiles = await prisma.investorTaxProfile.findMany();
  let updated = 0;
  let alreadyDone = 0;

  for (const p of profiles) {
    const needsWork =
      (p.w9TaxpayerId && !isEncrypted(p.w9TaxpayerId)) ||
      (p.w8ForeignTaxId && !isEncrypted(p.w8ForeignTaxId));
    if (!needsWork) {
      alreadyDone++;
      continue;
    }
    await prisma.investorTaxProfile.update({
      where: { id: p.id },
      data: {
        w9TaxpayerId: encryptOptional(p.w9TaxpayerId),
        w8ForeignTaxId: encryptOptional(p.w8ForeignTaxId),
      },
    });
    updated++;
  }

  console.log(`Encrypted ${updated} tax profile(s); ${alreadyDone} already encrypted or empty.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
