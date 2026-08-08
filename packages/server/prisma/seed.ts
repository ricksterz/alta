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
    update: {},
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
  // Three ADV characteristics are dropped here because Alta's Fund model has
  // no column for them. Listed explicitly rather than quietly discarded:
  //   - 3(c)(1) vs 3(c)(7): the investor-eligibility regime. 3(c)(7) requires
  //     a QUALIFIED PURCHASER (~$5M in investments), a materially higher bar
  //     than the accredited-investor status Alta models today. Most funds in
  //     this seed are 3(c)(7), so Alta would currently let a merely-accredited
  //     investor subscribe to them — a real compliance gap, not cosmetic.
  //   - domicile: Delaware vs Cayman/Luxembourg/Ireland drives whether W-9 or
  //     W-8BEN applies. Alta collects both but never ties them to the fund.
  //   - master/feeder: two independent booleans in ADV, whereas Alta folds a
  //     partial version of this into vehicleType = llc_feeder.
  let fundCount = 0;
  const droppedExclusions = new Set<string>();

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
      if (fund.exclusion) droppedExclusions.add(fund.exclusion);
      const existing = await prisma.fund.findFirst({
        where: { sponsorTenantId: tenant.id, name: fund.name },
      });
      if (existing) continue;

      await prisma.fund.create({
        data: {
          sponsorTenantId: tenant.id,
          name: fund.name,
          legalName: fund.legalName,
          vehicleType: fund.vehicleType,
          structure: fund.structure,
          minInvestment: fund.minInvestment,
          closeDate: fund.closeDate ? new Date(fund.closeDate) : null,
          status: "active",
          gpSignatoryName: fund.gpSignatoryName,
        },
      });
      fundCount++;
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

  console.log(
    `Seeded ${SEED_SPONSORS.length} Open Disclosure sponsors, ${fundCount} funds, ` +
      `${entitlementCount} entitlements to ${advisorTenant.slug}, ${templateCount} templates.`
  );
  for (const s of SEED_SPONSORS) console.log(`  ${s.gpEmail} / ${DEV_PASSWORD} — ${s.name}`);
  console.log(
    `NOTE: dropped ADV characteristics with no Fund column: ` +
      `exclusion (${[...droppedExclusions].join("/")}) , domicile, master/feeder.`
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
