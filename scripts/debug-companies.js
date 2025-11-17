import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugCompanies() {
  try {
    console.log('🔍 Debugging company data...');
    
    // Check the specific companies
    const companies = await prisma.company.findMany({
      where: { 
        id: { in: ['cmgi06j8o0000liup01eoqsf1', 'cmgi101800003ld5lpz4jaqjk'] 
      }
    });
    
    console.log('\n📋 Company Data:');
    companies.forEach(c => {
      console.log(`- ID: ${c.id}`);
      console.log(`  Name: ${c.companyName}`);
      console.log(`  Type: ${c.type}`);
      console.log(`  Status: ${c.status}`);
      console.log('');
    });
    
    if (companies.length === 2) {
      console.log('✅ Both companies found!');
    } else {
      console.log(`❌ Only ${companies.length} companies found!`);
    }
    
  } catch (error) {
    console.error('❌ Error debugging companies:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugCompanies();