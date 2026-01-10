import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDuplicateAgreement() {
  try {
    console.log('🧪 Testing duplicate agreement creation...');
    
    // First, let's see what agreements exist
    const existing = await prisma.agreement.findMany({
      where: {
        sourceId: 'cmgiehgn40003f9406p17qxbl'
      },
      select: {
        id: true,
        agreementRef: true,
        status: true,
        agentId: true,
        sourceId: true
      }
    });
    
    console.log('📋 Existing agreements for this source:');
    existing.forEach(ag => {
      console.log(`- ${ag.agreementRef} (${ag.status}) - Agent: ${ag.agentId}`);
    });
    
    console.log('\n🎯 Now try creating an agreement with the same reference...');
    console.log('Expected error: "Agreement with reference \'AG-2025-001\' already exists for this source"');
    
    // Try to create a duplicate
    try {
      const duplicate = await prisma.agreement.create({
        data: {
          agentId: 'cmgig269r0000ed094a5007ar',
          sourceId: 'cmgiehgn40003f9406p17qxbl',
          agreementRef: 'AG-2025-001',
          status: 'DRAFT',
          validFrom: new Date('2025-01-01T00:00:00Z'),
          validTo: new Date('2025-12-31T23:59:59Z'),
        },
      });
      console.log('❌ Unexpected: Created duplicate agreement:', duplicate.id);
    } catch (error) {
      console.log('✅ Expected error caught:');
      console.log(`- Code: ${error.code}`);
      console.log(`- Message: ${error.message}`);
      console.log(`- Meta: ${JSON.stringify(error.meta)}`);
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDuplicateAgreement();
