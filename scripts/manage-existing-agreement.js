import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function manageAgreement() {
  try {
    console.log('🔍 Current Agreement Status:');
    
    const existing = await prisma.agreement.findFirst({
      where: {
        sourceId: 'cmgiehgn40003f9406p17qxbl',
        agreementRef: 'AG-2025-001'
      },
      include: {
        agent: { select: { companyName: true, type: true, status: true } },
        source: { select: { companyName: true, type: true, status: true } }
      }
    });
    
    if (existing) {
      console.log(`📋 Found existing agreement:`);
      console.log(`- ID: ${existing.id}`);
      console.log(`- Status: ${existing.status}`);
      console.log(`- Agent: ${existing.agent.companyName} (${existing.agent.status})`);
      console.log(`- Source: ${existing.source.companyName} (${existing.source.status})`);
      console.log(`- Valid From: ${existing.validFrom}`);
      console.log(`- Valid To: ${existing.validTo}`);
      console.log('');
      
      console.log('🎯 Options:');
      console.log('1. Use a different agreement_ref (e.g., AG-2025-002)');
      console.log('2. Update the existing agreement status to ACTIVE');
      console.log('3. Delete the existing agreement and create new one');
      console.log('');
      
      console.log('💡 Recommended: Use AG-2025-002 as agreement_ref');
    } else {
      console.log('✅ No existing agreement found - you can create with AG-2025-001');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

manageAgreement();
