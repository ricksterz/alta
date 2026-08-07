import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
