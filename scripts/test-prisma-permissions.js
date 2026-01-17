import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testPermissions() {
  try {
    // Test basic query
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✓ Basic query works');
    
    // Test table access
    const tables = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM information_schema.tables 
      WHERE table_schema = 'car_hire_mw'
    `;
    console.log('✓ Can access information_schema');
    
    // Test migration table
    const migrations = await prisma.$queryRaw`
      SELECT COUNT(*) as count FROM _prisma_migrations
    `;
    console.log('✓ Can access _prisma_migrations table');
    
    // Test write to migration table
    const testId = 'test-' + Date.now();
    await prisma.$executeRaw`
      INSERT INTO _prisma_migrations 
      (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
      VALUES 
      (${testId}, 'test', NOW(), 'test_migration', NULL, NULL, NOW(), 0)
    `;
    console.log('✓ Can write to _prisma_migrations');
    
    // Clean up
    await prisma.$executeRaw`DELETE FROM _prisma_migrations WHERE id = ${testId}`;
    console.log('✓ Can delete from _prisma_migrations');
    
  } catch (error) {
    console.error('✗ Permission error:', error.message);
    console.error('Error code:', error.code);
  } finally {
    await prisma.$disconnect();
  }
}

testPermissions();
