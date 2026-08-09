import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { SEED_SPONSORS } from "./seedFunds.js";

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

  console.log(
    `Seeded ${SEED_SPONSORS.length} Open Disclosure sponsors, ${fundCount} funds, ` +
      `${entitlementCount} entitlements to ${advisorTenant.slug}, ${templateCount} templates.`
  );
  for (const s of SEED_SPONSORS) console.log(`  ${s.gpEmail} / ${DEV_PASSWORD} — ${s.name}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
