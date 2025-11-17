import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function activateSpecificCompany() {
  try {
    console.log('🔧 Activating specific company...');
    
    // Activate the company that matches your JWT token
    const result = await prisma.company.update({
      where: { id: 'cmgi101800003ld5lpz4jaqjk' },
      data: { status: 'ACTIVE' }
    });
    
    console.log('✅ Company activated:');
    console.log(`- ID: ${result.id}`);
    console.log(`- Name: ${result.companyName}`);
    console.log(`- Type: ${result.type}`);
    console.log(`- Status: ${result.status}`);
    
    console.log('\n🎉 Now you can create agreements with:');
    console.log('- Agent ID: cmgi06j8o0000liup01eoqsf1 (ACTIVE)');
    console.log('- Source ID: cmgi101800003ld5lpz4jaqjk (now ACTIVE)');
    
  } catch (error) {
    console.error('❌ Error activating company:', error);
  } finally {
    await prisma.$disconnect();
  }
}

activateSpecificCompany();
