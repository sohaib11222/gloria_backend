/**
 * Clears a failed migration (P3009 / P3018), then runs `prisma migrate deploy`.
 *
 *   npx tsx scripts/resolve-failed-migration-and-deploy.ts 20260129000000_add_availability_endpoint_and_sample
 *
 * Or:
 *   npm run prisma:repair-migration-and-deploy -- 20260129000000_add_availability_endpoint_and_sample
 */
import "dotenv/config";
import { execSync } from "node:child_process";

const name = process.argv[2]?.trim();
if (!name) {
  console.error(
    "Usage: npx tsx scripts/resolve-failed-migration-and-deploy.ts <migration_directory_name>\n" +
      "Example: npx tsx scripts/resolve-failed-migration-and-deploy.ts 20260129000000_add_availability_endpoint_and_sample"
  );
  process.exit(1);
}

console.log(`[repair] Marking migration as rolled back: ${name}\n`);
execSync(`npx prisma migrate resolve --rolled-back "${name}"`, {
  stdio: "inherit",
  cwd: process.cwd(),
  env: process.env,
});

console.log("\n[repair] Running prisma migrate deploy …\n");
try {
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
} catch {
  console.error(
    "\n[repair] migrate deploy failed. If Prisma reports P3018, fix that migration SQL (or mark resolve), then run:\n" +
      "  npx prisma migrate resolve --rolled-back \"<failed_migration_name>\"\n" +
      "  npx prisma migrate deploy\n"
  );
  process.exit(1);
}

console.log("\n[repair] Done.");
