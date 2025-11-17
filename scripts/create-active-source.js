import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createActiveSource() {
  try {
    console.log('🔧 Creating new ACTIVE source company...');
    
    // Create a new SOURCE company with ACTIVE status
    const passwordHash = await bcrypt.hash('password123', 10);
    
    const company = await prisma.company.create({
      data: {
        companyName: 'Active Source Company',
        type: 'SOURCE',
        email: 'source@active.com',
        passwordHash: passwordHash,
        status: 'ACTIVE'
      }
    });
    
    // Create a user for this company
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        email: 'source@active.com',
        passwordHash: passwordHash,
        role: 'SOURCE_USER'
      }
    });
    
    console.log('✅ Created ACTIVE source company:');
    console.log(`- Company ID: ${company.id}`);
    console.log(`- Company Name: ${company.companyName}`);
    console.log(`- Type: ${company.type}`);
    console.log(`- Status: ${company.status}`);
    console.log(`- User ID: ${user.id}`);
    
    console.log('\n🎉 Now you can use these IDs for agreement:');
    console.log(`- Agent ID: cmgi06j8o0000liup01eoqsf1 (existing ACTIVE)`);
    console.log(`- Source ID: ${company.id} (new ACTIVE)`);
    
  } catch (error) {
    console.error('❌ Error creating source company:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createActiveSource();
