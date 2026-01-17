import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

async function applyMigrationSafely() {
  try {
    // Check if migration is already applied
    const migration = await prisma.$queryRaw`
      SELECT * FROM _prisma_migrations 
      WHERE migration_name = '20260113112145_new_missig'
    `;
    
    if (migration && migration.length > 0) {
      console.log('✓ Migration already applied');
      return;
    }
    
    // Check which columns exist
    const columns = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM information_schema.COLUMNS 
      WHERE TABLE_SCHEMA = 'car_hire_mw' 
      AND TABLE_NAME = 'Booking' 
      AND COLUMN_NAME IN (
        'availabilityRequestId', 'customerInfoJson', 'driverAge',
        'dropoffDateTime', 'dropoffUnlocode', 'paymentInfoJson',
        'pickupDateTime', 'pickupUnlocode', 'ratePlanCode',
        'residencyCountry', 'vehicleClass', 'vehicleMakeModel'
      )
    `;
    
    const existingColumns = columns.map(c => c.COLUMN_NAME);
    const allColumns = [
      'availabilityRequestId', 'customerInfoJson', 'driverAge',
      'dropoffDateTime', 'dropoffUnlocode', 'paymentInfoJson',
      'pickupDateTime', 'pickupUnlocode', 'ratePlanCode',
      'residencyCountry', 'vehicleClass', 'vehicleMakeModel'
    ];
    
    const missingColumns = allColumns.filter(c => !existingColumns.includes(c));
    
    if (missingColumns.length === 0) {
      console.log('✓ All columns already exist, marking migration as applied');
      // Mark migration as applied
      await prisma.$executeRaw`
        INSERT INTO _prisma_migrations 
        (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES 
        (UUID(), '20260113112145_new_missig', NOW(), '20260113112145_new_missig', NULL, NULL, NOW(), 1)
      `;
      console.log('✓ Migration marked as applied');
    } else {
      console.log('Missing columns:', missingColumns);
      console.log('Please apply migration manually or fix permissions');
    }
  } catch (error) {
    console.error('Error:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyMigrationSafely();
