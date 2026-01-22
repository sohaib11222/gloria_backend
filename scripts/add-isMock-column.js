import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';

// Load environment variables
config();

const prisma = new PrismaClient();

async function addIsMockColumn() {
  try {
    console.log('Adding isMock column to SourceLocation table...');
    console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
    
    // Use raw SQL to add the column if it doesn't exist
    // MySQL doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN, so we'll try-catch
    await prisma.$executeRawUnsafe(`
      ALTER TABLE SourceLocation 
      ADD COLUMN isMock BOOLEAN DEFAULT FALSE;
    `);
    
    console.log('✅ Column added successfully!');
  } catch (error) {
    // If column already exists, that's fine
    if (error.message?.includes('Duplicate column name') || 
        error.message?.includes('already exists') ||
        error.code === 'P2010' ||
        error.code === 'ER_DUP_FIELDNAME' ||
        error.message?.includes('Duplicate column')) {
      console.log('✅ Column already exists, skipping...');
    } else {
      console.error('❌ Error adding column:', error.message);
      console.error('Error code:', error.code);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addIsMockColumn().catch(console.error);
