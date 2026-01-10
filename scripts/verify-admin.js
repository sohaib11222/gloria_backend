import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function verifyAdmin() {
  try {
    console.log('🔍 Verifying admin user credentials...\n');
    
    const email = 'admin@gmail.com';
    const password = '11221122';
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: { company: true }
    });
    
    if (!user) {
      console.log('❌ User not found!');
      console.log('   Run: npm run prisma:seed');
      return;
    }
    
    console.log('✅ User found:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   Company ID: ${user.companyId}`);
    console.log(`   Company Name: ${user.company?.companyName || 'N/A'}`);
    console.log(`   Company Type: ${user.company?.type || 'N/A'}`);
    console.log(`   Email Verified: ${user.company?.emailVerified || false}`);
    console.log(`   Company Status: ${user.company?.status || 'N/A'}`);
    
    // Test password
    console.log('\n🔐 Testing password...');
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    
    if (passwordMatch) {
      console.log('✅ Password is correct!');
    } else {
      console.log('❌ Password does NOT match!');
      console.log('\n🔧 Fix: Re-run the seeder');
      console.log('   npm run prisma:seed');
    }
    
    // Check if email is verified
    if (!user.company?.emailVerified) {
      console.log('\n⚠️  Email is NOT verified!');
      console.log('   This will block login.');
      console.log('\n🔧 Fix: Update company emailVerified status');
      
      await prisma.company.update({
        where: { id: user.companyId },
        data: { emailVerified: true }
      });
      
      console.log('✅ Fixed: Email verified status updated');
    }
    
    console.log('\n✅ Admin user is ready for login!');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyAdmin();

