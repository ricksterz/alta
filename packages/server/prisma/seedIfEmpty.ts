import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Runs on every production boot. A freshly provisioned database (e.g. after a
// free-tier Postgres expires and is replaced) comes up with the schema but no
// demo accounts, so the login page would list roles nobody can enter.
const prisma = new PrismaClient();
const tenantCount = await prisma.tenant.count();
await prisma.$disconnect();

if (tenantCount > 0) {
  console.log(`Database already has ${tenantCount} tenants — skipping seed.`);
} else {
  console.log("Empty database — seeding demo data.");
  await import("./seed.js");
}
