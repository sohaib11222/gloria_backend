import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function markMigrationsApplied() {
  const migrations = [
    '$(date +%Y%m%d%H%M%S)_add_booking_history',
    '20250120000000_add_strike_fields_to_source_health',
    '20260114040200_add_booking_history'
  ];
  
  for (const migrationName of migrations) {
    try {
      // Check if already applied
      const existing = await prisma.$queryRaw`
        SELECT * FROM _prisma_migrations 
        WHERE migration_name = ${migrationName}
      `;
      
      if (existing && existing.length > 0) {
        console.log(`✓ ${migrationName} already marked as applied`);
        continue;
      }
      
      // Mark as applied
      await prisma.$executeRaw`
        INSERT INTO _prisma_migrations 
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES 
        (UUID(), ${migrationName}, NOW(), ${migrationName}, NULL, NULL, NOW(), 1)
      `;
      console.log(`✓ Marked ${migrationName} as applied`);
    } catch (error) {
      console.error(`Error marking ${migrationName}:`, error.message);
    }
  }
  
  await prisma.$disconnect();
}

markMigrationsApplied();
