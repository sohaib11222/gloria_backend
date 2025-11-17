import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAgentAgreements() {
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
    });
    
    // Check specific agent from your JWT token
    const agentId = 'cmgidywub0000f940tz0u99hh'; // From your agreement
    console.log(`\n🔍 Agreements for Agent ${agentId}:`);
    
    const agentAgreements = await prisma.agreement.findMany({
      where: { agentId },
      include: {
        agent: { select: { companyName: true } },
        source: { select: { companyName: true } }
      }
    });
    
    console.log(`Found ${agentAgreements.length} agreements for this agent:`);
    agentAgreements.forEach(ag => {
      console.log(`- ${ag.id}: ${ag.status} (Source: ${ag.source.companyName})`);
    });
    
    // Check what your JWT token company ID is
    console.log('\n🎯 To debug:');
    console.log('1. Check your JWT token - what is your companyId?');
    console.log('2. Make sure you are logged in as the AGENT company');
    console.log('3. The agent ID in the agreement should match your JWT companyId');
    
  } catch (error) {
    console.error('❌ Error checking agreements:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAgentAgreements();
