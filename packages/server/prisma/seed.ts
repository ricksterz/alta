import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_SPONSORS } from "./seedFunds.js";
import { SEED_INVESTORS } from "./seedInvestors.js";
import { encryptOptional } from "../src/crypto/fieldEncryption.js";
import { openPositionForSubscription } from "../src/workflow/positions.js";
import { seedDocumentAndSignatures } from "./seedDocuments.js";

const prisma = new PrismaClient();

const DEV_PASSWORD = "password123";

async function main() {
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  // --- Advisor tenant (Phase 1) ---
  const advisorTenant = await prisma.tenant.upsert({
    where: { slug: "harborview-wealth" },
    update: {},
    create: {
      type: "advisor_firm",
      name: "Harborview Wealth Partners",
      slug: "harborview-wealth",
    },
  });

  const admin = await prisma.advisorRep.upsert({
    where: { email: "admin@harborview.test" },
    update: {},
    create: {
      tenantId: advisorTenant.id,
      email: "admin@harborview.test",
      passwordHash,
      firstName: "Ava",
      lastName: "Chen",
      role: "advisor_admin",
    },
  });

  await prisma.advisorRep.upsert({
    where: { email: "rep@harborview.test" },
    update: {},
    create: {
      tenantId: advisorTenant.id,
      email: "rep@harborview.test",
      passwordHash,
      firstName: "Marcus",
      lastName: "Ibe",
      role: "advisor_rep",
    },
  });

  // --- Sponsor tenant (Phase 2) ---
  const sponsorTenant = await prisma.tenant.upsert({
    where: { slug: "meridian-capital" },
    update: {},
    create: {
      type: "sponsor_firm",
      name: "Meridian Capital Partners",
      slug: "meridian-capital",
    },
  });

  const gpOps = await prisma.advisorRep.upsert({
    where: { email: "gpops@meridiancapital.test" },
    update: {},
    create: {
      tenantId: sponsorTenant.id,
      email: "gpops@meridiancapital.test",
      passwordHash,
      firstName: "Priya",
      lastName: "Nair",
      role: "gp_ops",
    },
  });

  await prisma.fund.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    // Same reasoning as the sponsor funds below: a reseed after adding a
    // column should backfill it rather than leave the fixture stale.
    update: { exclusion: "section_3c1", domicile: "Delaware" },
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      sponsorTenantId: sponsorTenant.id,
      name: "Meridian Growth Fund III",
      legalName: "Meridian Growth Fund III, LP",
      vehicleType: "lp",
      structure: "drawdown",
      minInvestment: 250000,
      status: "active",
      gpSignatoryName: "Priya Nair",
      // Deliberately 3(c)(1): the one seeded fund a merely-accredited investor
      // can subscribe to, so the eligibility gate is visible from both sides.
      exclusion: "section_3c1",
      domicile: "Delaware",
    },
  });

  console.log("Seeded advisor tenant:", advisorTenant.slug);
  console.log("  Login as:", admin.email, "/", DEV_PASSWORD);
  console.log("Seeded sponsor tenant:", sponsorTenant.slug);
  console.log("  Login as:", gpOps.email, "/", DEV_PASSWORD);

  // --- Real sponsors & funds from the Open Disclosure dataset ---
  //
  // Meridian above is kept as the synthetic fixture: it owns the document
  // template, field mappings, and the worked subscription the demo walks
  // through. The sponsors below add breadth — real names, types, domiciles,
  // and fund sizes — without disturbing that.
  //
  // The real ADV exclusion (3(c)(1) vs 3(c)(7)), domicile, and master/feeder
  // flags now land on Fund and drive live behaviour: 3(c)(7) funds are gated
  // to qualified purchasers by workflow/eligibility.ts. Most funds in this
  // seed are 3(c)(7), and Meridian below is deliberately 3(c)(1), so both
  // sides of that gate are reachable in a demo.
  let fundCount = 0;

  for (const sponsor of SEED_SPONSORS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: sponsor.slug },
      update: {},
      create: { type: "sponsor_firm", name: sponsor.name, slug: sponsor.slug },
    });

    await prisma.advisorRep.upsert({
      where: { email: sponsor.gpEmail },
      update: {},
      create: {
        tenantId: tenant.id,
        email: sponsor.gpEmail,
        passwordHash,
        firstName: sponsor.gpFirstName,
        lastName: sponsor.gpLastName,
        role: "gp_ops",
      },
    });

    for (const fund of sponsor.funds) {
      // Re-applied rather than skipped when the fund already exists: a reseed
      // after adding a Fund column should backfill it, not leave stale rows
      // that silently miss the new data.
      const fundData = {
        legalName: fund.legalName,
        vehicleType: fund.vehicleType,
        structure: fund.structure,
        minInvestment: fund.minInvestment,
        closeDate: fund.closeDate ? new Date(fund.closeDate) : null,
        status: "active" as const,
        gpSignatoryName: fund.gpSignatoryName,
        exclusion:
          fund.exclusion === "3c7"
            ? ("section_3c7" as const)
            : fund.exclusion === "3c1"
              ? ("section_3c1" as const)
              : null,
        domicile: fund.domicile,
        isMasterFund: fund.isMasterFund,
        isFeederFund: fund.isFeederFund,
      };

      const existing = await prisma.fund.findFirst({
        where: { sponsorTenantId: tenant.id, name: fund.name },
      });
      if (existing) {
        await prisma.fund.update({ where: { id: existing.id }, data: fundData });
      } else {
        await prisma.fund.create({
          data: { sponsorTenantId: tenant.id, name: fund.name, ...fundData },
        });
        fundCount++;
      }
    }
  }

  // Entitle Harborview to a subset only — an advisor firm can offer some
  // sponsors' funds and not others, and the demo should show that rather than
  // implying universal access.
  const entitledSlugs = SEED_SPONSORS.slice(0, 3).map((s) => s.slug);
  let entitlementCount = 0;
  for (const slug of entitledSlugs) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) continue;
    const funds = await prisma.fund.findMany({ where: { sponsorTenantId: tenant.id } });
    for (const fund of funds) {
      const already = await prisma.fundAdvisorEntitlement.findFirst({
        where: { fundId: fund.id, advisorTenantId: advisorTenant.id },
      });
      if (already) continue;
      await prisma.fundAdvisorEntitlement.create({
        data: {
          sponsorTenantId: tenant.id,
          fundId: fund.id,
          advisorTenantId: advisorTenant.id,
          grantedByRepId: admin.id,
          status: "active",
        },
      });
      entitlementCount++;
    }
  }

  // Give every entitled fund a ready template with fully-mapped fields, so the
  // seeded funds are actually subscribable rather than decorative. The
  // "detected fields" here are synthetic: real ones come back from Anvil's
  // Document AI on upload, which needs an API key. Field keys mirror the shape
  // Anvil returns (a stable per-field id plus a human label).
  const SEED_TEMPLATE_FIELDS: { key: string; label: string; canonical: string }[] = [
    { key: "investorLegalName", label: "Investor Legal Name", canonical: "investor.legal_name" },
    { key: "investorTaxId", label: "Taxpayer ID", canonical: "investor.tax_id" },
    { key: "investorAddress", label: "Address", canonical: "investor.address_line1" },
    { key: "accreditationBasis", label: "Accreditation Basis", canonical: "investor.accreditation_basis" },
    { key: "subscriptionAmount", label: "Subscription Amount", canonical: "subscription.amount" },
    { key: "subscriptionDate", label: "Subscription Date", canonical: "subscription.date" },
    { key: "fundLegalName", label: "Fund Legal Name", canonical: "fund.legal_name" },
  ];

  let templateCount = 0;
  for (const slug of entitledSlugs) {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) continue;
    const funds = await prisma.fund.findMany({ where: { sponsorTenantId: tenant.id } });
    const gp = await prisma.advisorRep.findFirst({ where: { tenantId: tenant.id } });
    if (!gp) continue;

    for (const fund of funds) {
      const already = await prisma.documentTemplate.findFirst({ where: { fundId: fund.id } });
      if (already) continue;

      const slugName = fund.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const template = await prisma.documentTemplate.create({
        data: {
          sponsorTenantId: tenant.id,
          fundId: fund.id,
          anvilTemplateId: `seed-cast-${slugName}`,
          originalFilename: `${slugName}-subscription-agreement.pdf`,
          status: "ready",
          detectedFieldsRaw: SEED_TEMPLATE_FIELDS.map((f) => ({ id: f.key, name: f.label })),
          uploadedByRepId: gp.id,
        },
      });

      await prisma.fieldMapping.createMany({
        data: [
          ...SEED_TEMPLATE_FIELDS.map((f) => ({
            sponsorTenantId: tenant.id,
            templateId: template.id,
            anvilFieldKey: f.key,
            anvilFieldLabel: f.label,
            mappingType: "canonical" as const,
            canonicalField: f.canonical,
          })),
          {
            sponsorTenantId: tenant.id,
            templateId: template.id,
            anvilFieldKey: "gpSignatoryName",
            anvilFieldLabel: "GP Signatory",
            mappingType: "static_value" as const,
            staticValue: fund.gpSignatoryName ?? "Fund General Partner",
          },
        ],
      });
      templateCount++;
    }
  }

  // --- Fund administrator tenant (Phase 5) ---
  // Engaged on the first sponsor's funds only, so both paths stay demoable:
  // subscriptions to those funds route to the administrator for review, and
  // subscriptions to every other fund fall back to the sponsor.
  const adminTenant = await prisma.tenant.upsert({
    where: { slug: "northbridge-fund-services" },
    update: {},
    create: {
      type: "fund_admin",
      name: "Northbridge Fund Services",
      slug: "northbridge-fund-services",
    },
  });

  await prisma.advisorRep.upsert({
    where: { email: "ops@northbridge.test" },
    update: {},
    create: {
      tenantId: adminTenant.id,
      email: "ops@northbridge.test",
      passwordHash,
      firstName: "Tomas",
      lastName: "Berg",
      role: "fund_admin_ops",
    },
  });

  const adminSponsorSlug = SEED_SPONSORS[0].slug;
  const adminSponsor = await prisma.tenant.findUnique({ where: { slug: adminSponsorSlug } });
  if (adminSponsor) {
    await prisma.fund.updateMany({
      where: { sponsorTenantId: adminSponsor.id },
      data: { fundAdminTenantId: adminTenant.id },
    });
  }

  // --- Fund closes ---
  // Evergreen/continuous funds get a recurring quarterly cadence; drawdown
  // funds get a single upcoming close. Fixed dates keep the seed deterministic.
  const QUARTERLY = [
    { name: "Q1 2027 Close", date: "2027-03-31" },
    { name: "Q2 2027 Close", date: "2027-06-30" },
    { name: "Q3 2027 Close", date: "2027-09-30" },
    { name: "Q4 2027 Close", date: "2027-12-31" },
  ];
  let closeCount = 0;
  const allFunds = await prisma.fund.findMany();
  for (const fund of allFunds) {
    const existing = await prisma.fundClose.count({ where: { fundId: fund.id } });
    if (existing > 0) continue;

    const windows =
      fund.structure === "continuous"
        ? QUARTERLY
        : [{ name: "Final Close", date: fund.closeDate?.toISOString().slice(0, 10) ?? "2027-12-31" }];

    for (const w of windows) {
      await prisma.fundClose.create({
        data: {
          sponsorTenantId: fund.sponsorTenantId,
          fundId: fund.id,
          name: w.name,
          closeDate: new Date(w.date),
          status: "open",
        },
      });
      closeCount++;
    }
  }

  // --- Signature blocks on every ready template ---
  // A realistic subscription agreement carries many marks per signer. Seven
  // here (investor initials on three questionnaire pages, signature, date; GP
  // signature and date) rather than one, so the execution flow exercises the
  // multi-block path.
  const SEED_BLOCKS = [
    { key: "investorInitialsP2", label: "Investor initials — p.2", type: "initials" as const, role: "investor_signer" as const, page: 2 },
    { key: "investorInitialsP3", label: "Investor initials — p.3", type: "initials" as const, role: "investor_signer" as const, page: 3 },
    { key: "investorInitialsP4", label: "Investor initials — p.4", type: "initials" as const, role: "investor_signer" as const, page: 4 },
    { key: "investorSignature", label: "Investor signature", type: "signature" as const, role: "investor_signer" as const, page: 5 },
    { key: "investorSignDate", label: "Investor date", type: "date" as const, role: "investor_signer" as const, page: 5 },
    { key: "gpSignature", label: "General Partner signature", type: "signature" as const, role: "gp_countersigner" as const, page: 5 },
    { key: "gpSignDate", label: "General Partner date", type: "date" as const, role: "gp_countersigner" as const, page: 5 },
  ];

  let blockCount = 0;
  const templates = await prisma.documentTemplate.findMany();
  for (const template of templates) {
    const existing = await prisma.signatureBlock.count({ where: { templateId: template.id } });
    if (existing > 0) continue;
    await prisma.signatureBlock.createMany({
      data: SEED_BLOCKS.map((b) => ({
        sponsorTenantId: template.sponsorTenantId,
        templateId: template.id,
        anvilFieldKey: b.key,
        label: b.label,
        blockType: b.type,
        signerRole: b.role,
        pageNum: b.page,
      })),
      skipDuplicates: true,
    });
    blockCount += SEED_BLOCKS.length;
  }

  console.log(`Seeded fund admin: ops@northbridge.test / ${DEV_PASSWORD} — ${adminTenant.name}`);
  console.log(`  administering ${adminSponsorSlug} funds; other funds fall back to their sponsor`);
  console.log(`Seeded ${closeCount} fund closes, ${blockCount} signature blocks.`);

  // --- Fund counsel tenant (Phase 8) ---
  // Engaged on a DIFFERENT sponsor's funds than the fund administrator above,
  // so the two review paths stay independently demoable rather than always
  // co-occurring on the same fund.
  const legalTenant = await prisma.tenant.upsert({
    where: { slug: "sterling-cross-llp" },
    update: {},
    create: {
      type: "fund_legal",
      name: "Sterling & Cross LLP",
      slug: "sterling-cross-llp",
    },
  });

  const legalRep = await prisma.advisorRep.upsert({
    where: { email: "counsel@sterlingcross.test" },
    update: {},
    create: {
      tenantId: legalTenant.id,
      email: "counsel@sterlingcross.test",
      passwordHash,
      firstName: "Renata",
      lastName: "Okafor",
      role: "legal_ops",
    },
  });

  const legalSponsorSlug = SEED_SPONSORS[1]?.slug;
  const legalSponsor = legalSponsorSlug
    ? await prisma.tenant.findUnique({ where: { slug: legalSponsorSlug } })
    : null;
  if (legalSponsor) {
    await prisma.fund.updateMany({
      where: { sponsorTenantId: legalSponsor.id },
      data: { fundLegalTenantId: legalTenant.id },
    });

    // Put one already-mapped template into pending_legal_review so the queue
    // has something in it from a fresh seed, rather than being empty until
    // someone manually submits one. Every seeded template is fully mapped
    // (see SEED_TEMPLATE_FIELDS above), so this is a legitimate state, not a
    // shortcut past the unmapped-field guard.
    const legalFund = await prisma.fund.findFirst({ where: { sponsorTenantId: legalSponsor.id } });
    if (legalFund) {
      await prisma.documentTemplate.updateMany({
        where: { fundId: legalFund.id, status: "ready" },
        data: { status: "pending_legal_review" },
      });
    }
  }

  console.log(`Seeded fund counsel: ${legalRep.email} / ${DEV_PASSWORD} — ${legalTenant.name}`);
  console.log(`  engaged on ${legalSponsorSlug ?? "(no sponsor available)"} funds`);

  // --- Custodian tenant (Phase 8) ---
  // Not pre-attached to any subscription: an advisor attaches one per
  // subscription from the subscription detail page, which is the flow worth
  // demoing rather than a fixture that skips it.
  const custodianTenant = await prisma.tenant.upsert({
    where: { slug: "meridian-trust-custody" },
    update: {},
    create: {
      type: "custodian",
      name: "Meridian Trust & Custody",
      slug: "meridian-trust-custody",
    },
  });

  const custodianRep = await prisma.advisorRep.upsert({
    where: { email: "ops@meridiantrust.test" },
    update: {},
    create: {
      tenantId: custodianTenant.id,
      email: "ops@meridiantrust.test",
      passwordHash,
      firstName: "Daniel",
      lastName: "Kwan",
      role: "custodian_ops",
    },
  });

  console.log(`Seeded custodian: ${custodianRep.email} / ${DEV_PASSWORD} — ${custodianTenant.name}`);
  console.log("  attach it to a subscription from that subscription's detail page to demo funding confirmation");

  console.log(
    `Seeded ${SEED_SPONSORS.length} Open Disclosure sponsors, ${fundCount} funds, ` +
      `${entitlementCount} entitlements to ${advisorTenant.slug}, ${templateCount} templates.`
  );
  for (const s of SEED_SPONSORS) console.log(`  ${s.gpEmail} / ${DEV_PASSWORD} — ${s.name}`);

  // --- Hypothetical investors, subscriptions, positions, and documents ---
  //
  // Most subscriptions sit at pending_investor_data so the generate → sign →
  // countersign → accept → fund path can still be driven live in a demo. The
  // ones seeded further along (accepted / funded / rejected) get a real
  // generated PDF and a fully-signed signature/fulfillment trail via
  // seedDocumentAndSignatures — those statuses are unreachable in the real
  // workflow without a document, so a seed that skipped it would be a state
  // the app itself can never produce. The PDF is written to local disk like
  // any local-provider fill; on a deployed host that disk is ephemeral and
  // won't survive a redeploy, but the DB rows (and the eligibility/signature
  // history they carry) do — only the "view PDF" link goes stale, which
  // GET /:id/document already 404s on gracefully.
  let investorCount = 0;
  let subscriptionCount = 0;
  let positionCount = 0;
  let documentCount = 0;

  for (const seed of SEED_INVESTORS) {
    const { taxForm, principals, subscriptions, ...profile } = seed;

    await prisma.investor.upsert({
      where: { id: seed.id },
      update: {},
      create: {
        ...profile,
        tenantId: advisorTenant.id,
        createdByRepId: admin.id,
        accreditationAttestedAt: new Date("2026-07-01"),
        qpAttestedAt: seed.qualifiedPurchaserBasis ? new Date("2026-07-01") : null,
      },
    });
    investorCount++;

    const existingPrincipals = await prisma.investorPrincipal.count({
      where: { investorId: seed.id },
    });
    if (existingPrincipals === 0) {
      await prisma.investorPrincipal.createMany({
        data: principals.map((p) => ({
          ...p,
          tenantId: advisorTenant.id,
          investorId: seed.id,
        })),
      });
    }

    // Taxpayer identifiers go through the same encryption path as a real
    // submission — see crypto/fieldEncryption.ts. Seeding them in plaintext
    // would leave rows the decrypt path can't read.
    const existingTax = await prisma.investorTaxProfile.findUnique({
      where: { investorId: seed.id },
    });
    if (!existingTax) {
      await prisma.investorTaxProfile.create({
        data: {
          tenantId: advisorTenant.id,
          investorId: seed.id,
          formType: taxForm.formType,
          w9TaxpayerIdType: taxForm.w9TaxpayerIdType ?? null,
          w9TaxpayerId: encryptOptional(taxForm.w9TaxpayerId),
          w8CountryOfCitizenship: taxForm.w8CountryOfCitizenship ?? null,
          w8ForeignTaxId: encryptOptional(taxForm.w8ForeignTaxId),
          certifiedAt: new Date("2026-07-01"),
        },
      });
    }

    for (const [i, sub] of (subscriptions ?? []).entries()) {
      const fund = await prisma.fund.findFirst({ where: { name: sub.fundName } });
      if (!fund) {
        console.warn(`  ! no fund named "${sub.fundName}" — skipping a subscription`);
        continue;
      }

      // Deterministic id derived from the investor's — swap the leading block
      // for a 2-prefixed one carrying the subscription index — so re-seeding
      // is idempotent without needing a natural key on Subscription.
      const subId = seed.id.replace(/^\w{8}/, `2222222${i}`);
      const already = await prisma.subscription.findUnique({ where: { id: subId } });

      if (!already) {
        const close = await prisma.fundClose.findFirst({
          where: { fundId: fund.id, status: "open" },
          orderBy: { closeDate: "asc" },
        });

        const terminal = sub.status === "funded" || sub.status === "rejected";
        await prisma.subscription.create({
          data: {
            id: subId,
            tenantId: advisorTenant.id,
            sponsorTenantId: fund.sponsorTenantId,
            investorId: seed.id,
            fundId: fund.id,
            fundCloseId: close?.id ?? null,
            amount: sub.amount,
            status: sub.status,
            createdByRepId: admin.id,
            submittedAt: new Date("2026-07-15"),
            decidedAt: terminal || sub.status === "accepted" ? new Date("2026-08-01") : null,
            fundedAt: sub.status === "funded" ? new Date("2026-08-05") : null,
            rejectionReason: sub.rejectionReason ?? null,
          },
        });
        subscriptionCount++;

        // The fund's engaged administrator rides along as a participant,
        // exactly as routes/subscriptions.ts does on a real create.
        if (fund.fundAdminTenantId) {
          await prisma.subscriptionParticipant.create({
            data: { subscriptionId: subId, tenantId: fund.fundAdminTenantId, role: "fund_admin" },
          });
        }
      }

      // Runs whether the subscription row is new or pre-existing (from a
      // prior seed run before documents were added), and is itself idempotent
      // — seedDocumentAndSignatures no-ops if a document already exists.
      if (sub.status === "accepted" || sub.status === "rejected" || sub.status === "funded") {
        const seeded = await seedDocumentAndSignatures(prisma, subId, {
          generatedAt: new Date("2026-07-20"),
          signedAt: new Date("2026-07-25"),
        });
        if (seeded) documentCount++;
      }

      if (sub.status === "funded") {
        await openPositionForSubscription(subId);
        positionCount++;
      }
    }
  }

  console.log(
    `Seeded ${investorCount} investors, ${subscriptionCount} subscriptions, ` +
      `${documentCount} signed documents, ${positionCount} positions.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
