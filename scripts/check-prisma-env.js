import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

console.log('🔍 Checking Prisma environment...\n');

const dbUrl = process.env.DATABASE_URL;
console.log('DATABASE_URL:', dbUrl ? `${dbUrl.split('@')[0]}@****` : 'NOT SET');

if (!dbUrl) {
  console.error('❌ DATABASE_URL is not set!');
  process.exit(1);
}

const prisma = new PrismaClient();

async function test() {
  try {
    await prisma.$connect();
    console.log('✅ Prisma can connect to database');
    
    const count = await prisma.company.count();
    console.log(`✅ Found ${count} companies in database`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Prisma connection failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

test();

