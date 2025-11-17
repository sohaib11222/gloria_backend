import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCompanies() {
  try {
    const companies = await prisma.company.findMany({
      where: { 
        id: { in: ['cmgi0zups0000ld5l45xt841r', 'cmgi101800003ld5lpz4jaqjk'] 
      },
      select: { id: true, companyName: true, type: true, status: true }
    });
    
    console.log('📋 Company Status Check:');
    console.log('========================');
    
    companies.forEach(c => {
      console.log(`- ${c.id}: ${c.type} - ${c.status}`);
    });
    
    // Check if both are ACTIVE
    const agent = companies.find(c => c.id === 'cmgi0zups0000ld5l45xt841r');
    const source = companies.find(c => c.id === 'cmgi101800003ld5lpz4jaqjk');
    
    console.log('\n🔍 Validation:');
    console.log(`Agent (${agent?.id}): ${agent?.status} - ${agent?.status === 'ACTIVE' ? '✅' : '❌'}`);
    console.log(`Source (${source?.id}): ${source?.status} - ${source?.status === 'ACTIVE' ? '✅' : '❌'}`);
    
    if (agent?.status === 'ACTIVE' && source?.status === 'ACTIVE') {
      console.log('\n🎉 Both companies are ACTIVE! Agreement should work.');
    } else {
      console.log('\n⚠️  One or both companies are not ACTIVE. Need to activate them.');
    }
    
  } catch (error) {
    console.error('❌ Error checking companies:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkCompanies();