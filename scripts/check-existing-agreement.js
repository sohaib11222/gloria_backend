import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAgreement() {
  try {
    console.log('🔍 Checking existing agreements...');
    
    const existing = await prisma.agreement.findMany({
      where: {
        sourceId: 'cmgiehgn40003f9406p17qxbl',
        agreementRef: 'AG-2025-001'
      },
      include: {
        agent: { select: { companyName: true, type: true, status: true } },
        source: { select: { companyName: true, type: true, status: true } }
      }
    });
    
    console.log('📋 Found agreements:', existing.length);
    existing.forEach(ag => {
      console.log(`- ID: ${ag.id}`);
      console.log(`  Agent: ${ag.agent.companyName} (${ag.agent.type}) - ${ag.agent.status}`);
      console.log(`  Source: ${ag.source.companyName} (${ag.source.type}) - ${ag.source.status}`);
      console.log(`  Status: ${ag.status}`);
      console.log(`  Ref: ${ag.agreementRef}`);
      console.log('');
    });
    
    // Check if we can create with a different ref
    const newRef = 'AG-2025-002';
    console.log(`💡 Try using a different agreement_ref: ${newRef}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAgreement();
