import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const prisma = new PrismaClient();

async function testConnection() {
  console.log('🔍 Testing database connection...\n');
  
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set in .env file');
    console.log('\n📝 Creating .env file...');
    
    const envPath = path.join(__dirname, '..', '.env');
    const envTemplate = `# Database Configuration
DATABASE_URL="mysql://root@localhost:3306/car_hire_mw"

# JWT Secret
JWT_SECRET=your-secret-key-here-change-this

# Server Port
PORT=8080
NODE_ENV=development
`;
    
    if (!fs.existsSync(envPath)) {
      fs.writeFileSync(envPath, envTemplate);
      console.log('✅ Created .env file with default DATABASE_URL');
      console.log('⚠️  Please update DATABASE_URL with your MySQL credentials');
    }
    return false;
  }
  
  // Hide password in output
  const safeUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
  console.log(`📋 DATABASE_URL: ${safeUrl}\n`);
  
  try {
    await prisma.$connect();
    console.log('✅ Database connection successful!');
    
    // Test a simple query
    try {
      const count = await prisma.company.count();
      console.log(`✅ Database is accessible. Found ${count} companies.`);
    } catch (queryError) {
      console.log('⚠️  Connection works but tables might not exist yet.');
      console.log('   Run: npm run prisma:migrate');
    }
    
    return true;
  } catch (error) {
    console.error('\n❌ Database connection failed!');
    console.error(`Error: ${error.message}\n`);
    
    if (error.message.includes('Access denied')) {
      console.log('🔧 SOLUTION: Fix MySQL Authentication\n');
      console.log('Option 1: Use root with no password (if MySQL allows it)');
      console.log('   Update .env: DATABASE_URL="mysql://root@localhost:3306/car_hire_mw"\n');
      
      console.log('Option 2: Use root with password');
      console.log('   Update .env: DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/car_hire_mw"\n');
      
      console.log('Option 3: Create new MySQL user (RECOMMENDED)');
      console.log('   1. Run: mysql -u root -p');
      console.log('   2. Execute SQL from: scripts/fix-mysql-auth.sql');
      console.log('   3. Update .env: DATABASE_URL="mysql://carhire_user:carhire_pass_123@localhost:3306/car_hire_mw"\n');
      
      console.log('Option 4: Fix MySQL 8.0 authentication plugin');
      console.log('   Run in MySQL:');
      console.log('   ALTER USER \'root\'@\'localhost\' IDENTIFIED WITH mysql_native_password BY \'your_password\';');
      console.log('   FLUSH PRIVILEGES;\n');
    } else if (error.message.includes('ECONNREFUSED')) {
      console.log('🔧 SOLUTION: MySQL server is not running');
      console.log('   Start MySQL service and try again\n');
    } else if (error.message.includes('Unknown database')) {
      console.log('🔧 SOLUTION: Database does not exist');
      console.log('   Run: mysql -u root -p');
      console.log('   Then: CREATE DATABASE car_hire_mw;\n');
    }
    
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

testConnection().then(success => {
  if (!success) {
    console.log('\n💡 Quick fix commands:');
    console.log('   npm run check:env    # Check .env configuration');
    console.log('   npm run test:db      # Test database connection');
    console.log('   npm run prisma:migrate # Create database tables');
  }
  process.exit(success ? 0 : 1);
});

