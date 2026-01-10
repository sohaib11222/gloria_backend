import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function activateCompanies() {
  try {
    console.log('🔧 Activating companies...');
    
    // Activate the source company
    const sourceCompany = await prisma.company.update({
      where: { id: 'cmgi101800003ld5lpz4jaqjk' },
      data: { status: 'ACTIVE' }
    });
    console.log('✅ Source company activated:', sourceCompany.companyName);
    
    // Activate the agent company
    const agentCompany = await prisma.company.update({
      where: { id: 'cmgi0zups0000ld5l45xt841r' },
      data: { status: 'ACTIVE' }
    });
    console.log('✅ Agent company activated:', agentCompany.companyName);
    
    console.log('\n🎉 All companies are now ACTIVE!');
    console.log('You can now use these IDs for agreements:');
    console.log('- Agent ID:', 'cmgi0zups0000ld5l45xt841r');
    console.log('- Source ID:', 'cmgi101800003ld5lpz4jaqjk');
    
  } catch (error) {
    console.error('❌ Error activating companies:', error);
  } finally {
    await prisma.$disconnect();
  }
}

activateCompanies();
