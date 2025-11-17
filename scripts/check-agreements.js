import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAgreements() {
  try {
    console.log('🔍 Checking all agreements...');
    
    const agreements = await prisma.agreement.findMany({
      include: {
        agent: { select: { id: true, companyName: true, type: true } },
        source: { select: { id: true, companyName: true, type: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`📊 Total agreements: ${agreements.length}`);
    
    agreements.forEach((ag, index) => {
      console.log(`\n${index + 1}. Agreement: ${ag.id}`);
      console.log(`   - Status: ${ag.status}`);
      console.log(`   - Agent: ${ag.agent.companyName} (${ag.agent.id})`);
      console.log(`   - Source: ${ag.source.companyName} (${ag.source.id})`);
      console.log(`   - Ref: ${ag.agreementRef}`);
      console.log(`   - Created: ${ag.createdAt}`);
    });
    
    // Check specific company agreements
    const sourceId = 'cmgi101800003ld5lpz4jaqjk';
    const agentId = 'cmgi06j8o0000liup01eoqsf1';
    
    console.log(`\n🔍 Agreements for Source ${sourceId}:`);
    const sourceAgreements = await prisma.agreement.findMany({
      where: { sourceId },
      include: {
        agent: { select: { companyName: true } },
        source: { select: { companyName: true } }
      }
    });
    
    sourceAgreements.forEach(ag => {
      console.log(`- ${ag.id}: ${ag.status} (Agent: ${ag.agent.companyName})`);
    });
    
    console.log(`\n🔍 Agreements for Agent ${agentId}:`);
    const agentAgreements = await prisma.agreement.findMany({
      where: { agentId },
      include: {
        agent: { select: { companyName: true } },
        source: { select: { companyName: true } }
      }
    });
    
    agentAgreements.forEach(ag => {
      console.log(`- ${ag.id}: ${ag.status} (Source: ${ag.source.companyName})`);
    });
    
  } catch (error) {
    console.error('❌ Error checking agreements:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAgreements();
