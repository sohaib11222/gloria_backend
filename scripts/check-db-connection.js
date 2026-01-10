import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkDatabase() {
  try {
    console.log('🔍 Checking database connection...');
    
    // Test basic connection
    await prisma.$connect();
    console.log('✅ Database connected');
    
    // Check if companies table exists and has data
    const companyCount = await prisma.company.count();
    console.log(`📊 Total companies in database: ${companyCount}`);
    
    // Check specific companies
    const agent = await prisma.company.findFirst({
      where: { id: 'cmgi06j8o0000liup01eoqsf1' }
    });
    
    const source = await prisma.company.findFirst({
      where: { id: 'cmgi101800003ld5lpz4jaqjk' }
    });
    
    console.log('\n🔍 Specific Company Lookup:');
    console.log(`Agent (cmgi06j8o0000liup01eoqsf1): ${agent ? 'FOUND' : 'NOT FOUND'}`);
    console.log(`Source (cmgi101800003ld5lpz4jaqjk): ${source ? 'FOUND' : 'NOT FOUND'}`);
    
    if (agent) {
      console.log(`  - Agent: ${agent.companyName} (${agent.type}) - ${agent.status}`);
    }
    if (source) {
      console.log(`  - Source: ${source.companyName} (${source.type}) - ${source.status}`);
    }
    
    // List all companies
    const allCompanies = await prisma.company.findMany({
      select: { id: true, companyName: true, type: true, status: true }
    });
    
    console.log('\n📋 All Companies:');
    allCompanies.forEach(c => {
      console.log(`- ${c.id}: ${c.companyName} (${c.type}) - ${c.status}`);
    });
    
  } catch (error) {
    console.error('❌ Database error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkDatabase();
