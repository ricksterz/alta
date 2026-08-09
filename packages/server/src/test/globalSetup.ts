import "dotenv/config";
import { execSync } from "node:child_process";

// Isolation tests run against a dedicated database, never the dev one. Two
// reasons: they create and delete tenants, and a test that silently passed
// because it was reading someone's leftover dev data would be worse than no
// test at all.
const TEST_DB_URL =
  process.env.TEST_DATABASE_URL ??
  (process.env.DATABASE_URL ?? "").replace(/\/[^/?]+(\?|$)/, "/alta_test$1");

export default function setup() {
  if (!TEST_DB_URL || !TEST_DB_URL.includes("alta_test")) {
    throw new Error(
      "Refusing to run tests without a database whose name contains 'alta_test'. " +
        "Set TEST_DATABASE_URL explicitly."
    );
  }

  process.env.DATABASE_URL = TEST_DB_URL;

  // `migrate reset --force` drops and re-applies, so each run starts from a
  // known schema with no rows.
  execSync("npx prisma migrate reset --force --skip-seed --skip-generate", {
    env: { ...process.env, DATABASE_URL: TEST_DB_URL },
    stdio: "pipe",
  });
}
