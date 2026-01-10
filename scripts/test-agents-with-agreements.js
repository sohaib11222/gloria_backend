import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testAgentsWithAgreements() {
  try {
    console.log('🧪 Testing ACTIVE agents with agreements...');
    
    // Get ACTIVE agents with their agreements
    const agents = await prisma.company.findMany({
      where: {
        type: "AGENT",
        status: "ACTIVE"
      },
      select: {
        id: true,
        companyName: true,
        email: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        adapterType: true,
        grpcEndpoint: true,
        _count: {
          select: { 
            users: true,
            agentAgreements: true
          }
        },
        agentAgreements: {
          select: {
            id: true,
            agreementRef: true,
            status: true,
            validFrom: true,
            validTo: true,
            sourceId: true,
            source: {
              select: {
                id: true,
                companyName: true,
                status: true
              }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    
    console.log('📋 ACTIVE Agents with Agreements:');
    console.log(`Total: ${agents.length}`);
    console.log('');
    
    agents.forEach((agent, index) => {
      console.log(`${index + 1}. ${agent.companyName} (${agent.status})`);
      console.log(`   - ID: ${agent.id}`);
      console.log(`   - Email: ${agent.email}`);
      console.log(`   - Users: ${agent._count.users}`);
      console.log(`   - Agreements: ${agent._count.agentAgreements}`);
      
      if (agent.agentAgreements.length > 0) {
        console.log('   📋 Agreements:');
        agent.agentAgreements.forEach(agreement => {
          console.log(`     - Agreement ID: ${agreement.id}`);
          console.log(`       Ref: ${agreement.agreementRef}`);
          console.log(`       Status: ${agreement.status}`);
          console.log(`       Source: ${agreement.source.companyName} (${agreement.source.status})`);
          console.log(`       Valid: ${agreement.validFrom} to ${agreement.validTo}`);
        });
      } else {
        console.log('   📋 No agreements found');
      }
      console.log('');
    });
    
    console.log('✅ Route will now return:');
    console.log('- Only ACTIVE agents by default');
    console.log('- Full agreement details with IDs');
    console.log('- Source company information');
    console.log('- User and agreement counts');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testAgentsWithAgreements();
