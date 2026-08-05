import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEV_PASSWORD = "password123";

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "harborview-wealth" },
    update: {},
    create: {
      name: "Harborview Wealth Partners",
      slug: "harborview-wealth",
    },
  });

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 12);

  const admin = await prisma.advisorRep.upsert({
    where: { email: "admin@harborview.test" },
    update: {},
    create: {
      tenantId: tenant.id,
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
      tenantId: tenant.id,
      email: "rep@harborview.test",
      passwordHash,
      firstName: "Marcus",
      lastName: "Ibe",
      role: "advisor_rep",
    },
  });

  await prisma.fund.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      tenantId: tenant.id,
      name: "Meridian Growth Fund III",
      legalName: "Meridian Growth Fund III, LP",
      minimumInvestment: 250000,
    },
  });

  console.log("Seeded tenant:", tenant.slug);
  console.log("Login as:", admin.email, "/", DEV_PASSWORD);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
