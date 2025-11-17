import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteAndRecreate() {
  try {
    console.log('🗑️ Deleting existing agreement...');
    
    const deleted = await prisma.agreement.delete({
      where: {
        sourceId_agreementRef: {
          sourceId: 'cmgiehgn40003f9406p17qxbl',
          agreementRef: 'AG-2025-001'
        }
      }
    });
    
    console.log('✅ Agreement deleted:');
    console.log(`- ID: ${deleted.id}`);
    console.log(`- Ref: ${deleted.agreementRef}`);
    console.log('');
    console.log('🎉 Now you can create a new agreement with AG-2025-001');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

deleteAndRecreate();
