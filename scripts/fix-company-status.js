import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixCompanyStatus() {
  try {
    console.log('🔧 Fixing company statuses...');
    
    // Update the specific companies
    const result = await prisma.company.updateMany({
      where: { 
        id: { in: ['cmgi0zups0000ld5l45xt841r', 'cmgi101800003ld5lpz4jaqjk'] 
      },
      data: { status: 'ACTIVE' }
    });
    
    console.log(`✅ Updated ${result.count} companies to ACTIVE`);
    
    // Verify the changes
    const companies = await prisma.company.findMany({
      where: { 
        id: { in: ['cmgi0zups0000ld5l45xt841r', 'cmgi101800003ld5lpz4jaqjk'] 
      },
      select: { id: true, companyName: true, type: true, status: true }
    });
    
    console.log('\n📋 Updated Company Status:');
    companies.forEach(c => {
      console.log(`- ${c.id}: ${c.type} - ${c.status}`);
    });
    
    console.log('\n🎉 Now you can use these IDs:');
    console.log('- Agent ID: cmgi0zups0000ld5l45xt841r');
    console.log('- Source ID: cmgi101800003ld5lpz4jaqjk');
    
  } catch (error) {
    console.error('❌ Error fixing company status:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixCompanyStatus();