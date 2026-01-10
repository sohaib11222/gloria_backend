import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function reactivateAgreement() {
  try {
    console.log('🔄 Reactivating existing agreement...');
    
    const updated = await prisma.agreement.update({
      where: {
        sourceId_agreementRef: {
          sourceId: 'cmgiehgn40003f9406p17qxbl',
          agreementRef: 'AG-2025-001'
        }
      },
      data: {
        status: 'ACTIVE',
        validFrom: new Date('2025-01-01T00:00:00Z'),
        validTo: new Date('2025-12-31T23:59:59Z')
      },
      include: {
        agent: { select: { companyName: true } },
        source: { select: { companyName: true } }
      }
    });
    
    console.log('✅ Agreement reactivated:');
    console.log(`- ID: ${updated.id}`);
    console.log(`- Status: ${updated.status}`);
    console.log(`- Agent: ${updated.agent.companyName}`);
    console.log(`- Source: ${updated.source.companyName}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

reactivateAgreement();
