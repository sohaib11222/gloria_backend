/**
 * Clears P3018 when `20260124000000_add_plan_and_source_subscription` failed
 * (e.g. Table 'Plan' already exists), then runs `migrate deploy` again.
 *
 *   npx tsx scripts/resolve-failed-plan-subscription-migrate.ts
 */
import "dotenv/config";
import { execSync } from "node:child_process";

const MIGRATION = "20260124000000_add_plan_and_source_subscription";

execSync(`npx prisma migrate resolve --rolled-back "${MIGRATION}"`, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

console.log("\n[repair] Running prisma migrate deploy …\n");
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

console.log("\n[repair] Done.");
