import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Isolation tests share one Postgres database and seed overlapping tenant
    // fixtures, so they must not run concurrently with each other.
    fileParallelism: false,
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/globalSetup.ts"],
  },
});
