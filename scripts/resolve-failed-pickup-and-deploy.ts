/**
 * Unblocks Prisma P3009 when `20260122000001_add_pickup_dropoff_times` is stuck as "failed",
 * then runs `migrate deploy` so later migrations (e.g. ReferralLink) can apply.
 *
 * Usage (from repo root):
 *   npx tsx scripts/resolve-failed-pickup-and-deploy.ts
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const MIGRATION = "20260122000001_add_pickup_dropoff_times";

async function main() {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'Branch'
        AND COLUMN_NAME IN ('pickupTimes', 'dropoffTimes')
    `;
    const colCount = Number(rows[0]?.c ?? 0);

    if (colCount >= 2) {
      console.log(
        "[repair] Branch has pickupTimes + dropoffTimes → marking migration as APPLIED, then deploy.\n"
      );
      execSync(`npx prisma migrate resolve --applied "${MIGRATION}"`, {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      });
    } else {
      console.log(
        `[repair] Branch time columns missing or partial (${colCount}/2) → marking migration as ROLLED BACK, then deploy will re-apply idempotent SQL.\n`
      );
      execSync(`npx prisma migrate resolve --rolled-back "${MIGRATION}"`, {
        stdio: "inherit",
        cwd: process.cwd(),
        env: process.env,
      });
    }

    console.log("\n[repair] Running prisma migrate deploy …\n");
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });
    console.log("\n[repair] Done.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
