import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Load .env file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '../.env');
dotenv.config({ path: envPath });

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugAgentAgreements() {
  try {
    console.log('🔍 Debugging agent agreements for agent@gmail.com\n');
    
    // 1. Find the agent user and company
    const agentUser = await prisma.user.findUnique({
      where: { email: 'agent@gmail.com' },
      include: { company: true }
    });
    
    if (!agentUser) {
      console.log('❌ User agent@gmail.com not found!');
      return;
    }
    
    console.log('📋 User Info:');
    console.log(`   - User ID: ${agentUser.id}`);
    console.log(`   - Email: ${agentUser.email}`);
    console.log(`   - Company ID: ${agentUser.companyId}`);
    console.log(`   - Role: ${agentUser.role}`);
    console.log(`   - Company Name: ${agentUser.company?.companyName}`);
    console.log(`   - Company Type: ${agentUser.company?.type}`);
    console.log(`   - Company Status: ${agentUser.company?.status}\n`);
    
    // 2. Find all agreements in the database
    console.log('📊 All Agreements in Database:');
    const allAgreements = await prisma.agreement.findMany({
      include: {
        agent: { select: { id: true, companyName: true, email: true, type: true } },
        source: { select: { id: true, companyName: true, email: true, type: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`   Total agreements: ${allAgreements.length}\n`);
    
    allAgreements.forEach((ag, index) => {
      console.log(`   ${index + 1}. Agreement ID: ${ag.id}`);
      console.log(`      - Status: ${ag.status}`);
      console.log(`      - Agent ID: ${ag.agentId}`);
      console.log(`      - Agent Email: ${ag.agent.email}`);
      console.log(`      - Agent Company: ${ag.agent.companyName}`);
      console.log(`      - Source ID: ${ag.sourceId}`);
      console.log(`      - Source Email: ${ag.source.email}`);
      console.log(`      - Agreement Ref: ${ag.agreementRef}`);
      console.log(`      - Created: ${ag.createdAt}`);
      console.log('');
    });
    
    // 3. Find agreements specifically for this agent's companyId
    console.log(`\n🎯 Agreements for Agent Company ID: ${agentUser.companyId}`);
    const agentAgreements = await prisma.agreement.findMany({
      where: { agentId: agentUser.companyId },
      include: {
        agent: { select: { companyName: true, email: true } },
        source: { select: { companyName: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`   Found ${agentAgreements.length} agreements\n`);
    
    if (agentAgreements.length === 0) {
      console.log('   ⚠️  NO AGREEMENTS FOUND for this agent!');
      console.log('\n   Possible issues:');
      console.log('   1. Agreements exist but with different agentId');
      console.log('   2. The agentId in agreements does not match the companyId');
      console.log('   3. No agreements have been created yet');
    } else {
      agentAgreements.forEach((ag, index) => {
        console.log(`   ${index + 1}. ${ag.id}: ${ag.status}`);
        console.log(`      - Source: ${ag.source.companyName} (${ag.source.email})`);
        console.log(`      - Ref: ${ag.agreementRef}`);
      });
    }
    
    // 4. Check agreements with ACTIVE status
    console.log(`\n✅ ACTIVE Agreements for Agent: ${agentUser.companyId}`);
    const activeAgreements = await prisma.agreement.findMany({
      where: { 
        agentId: agentUser.companyId,
        status: 'ACTIVE'
      },
      include: {
        agent: { select: { companyName: true } },
        source: { select: { companyName: true } }
      }
    });
    
    console.log(`   Found ${activeAgreements.length} ACTIVE agreements\n`);
    
    // 5. Check if there are any agreements with agentId that doesn't match
    console.log('🔍 Checking for mismatched agentIds...');
    const mismatched = allAgreements.filter(ag => {
      // Check if agent email matches but agentId doesn't
      return ag.agent.email === 'agent@gmail.com' && ag.agentId !== agentUser.companyId;
    });
    
    if (mismatched.length > 0) {
      console.log(`   ⚠️  Found ${mismatched.length} agreements with mismatched agentId!`);
      mismatched.forEach(ag => {
        console.log(`   - Agreement ${ag.id}: agentId=${ag.agentId}, but agent email is agent@gmail.com`);
        console.log(`     Expected agentId: ${agentUser.companyId}`);
      });
    } else {
      console.log('   ✅ No mismatched agentIds found');
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugAgentAgreements();

