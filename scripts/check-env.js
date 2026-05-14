import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

console.log('🔍 Checking environment configuration...\n');

// Check if .env file exists
if (fs.existsSync(envPath)) {
  console.log('✅ .env file found');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const hasDatabaseUrl = envContent.includes('DATABASE_URL');
  
  if (hasDatabaseUrl) {
    const dbUrlMatch = envContent.match(/DATABASE_URL=["']?([^"'\n]+)["']?/);
    if (dbUrlMatch) {
      const dbUrl = dbUrlMatch[1];
      // Hide password in output
      const safeUrl = dbUrl.replace(/:([^:@]+)@/, ':****@');
      console.log(`✅ DATABASE_URL is set: ${safeUrl}`);
      
      // Parse the URL
      try {
        const url = new URL(dbUrl.replace('mysql://', 'http://'));
        const username = url.username || 'root';
        const password = url.password ? '****' : '(no password)';
        const host = url.hostname || 'localhost';
        const port = url.port || '3306';
        const database = url.pathname.replace('/', '') || 'car_hire_mw';
        
        console.log(`   Username: ${username}`);
        console.log(`   Password: ${password}`);
        console.log(`   Host: ${host}:${port}`);
        console.log(`   Database: ${database}`);
      } catch (e) {
        console.log('   ⚠️  Could not parse DATABASE_URL');
      }
    } else {
      console.log('⚠️  DATABASE_URL found but format might be incorrect');
    }
  } else {
    console.log('❌ DATABASE_URL not found in .env file');
  }
} else {
  console.log('❌ .env file NOT found');
  console.log('\n📝 Creating .env file template...');
  
  const envTemplate = `# Database Configuration
# Format: mysql://username:password@host:port/database_name
# If no password: mysql://root@localhost:3306/car_hire_mw
DATABASE_URL="mysql://root@localhost:3306/car_hire_mw"

# JWT Secret
JWT_SECRET=your-secret-key-here-change-this

# Server Port
PORT=8080
NODE_ENV=development
`;

  fs.writeFileSync(envPath, envTemplate);
  console.log('✅ Created .env file template');
  console.log('⚠️  Please update DATABASE_URL with your MySQL credentials');
}

console.log('\n💡 Next steps:');
console.log('1. If MySQL root has no password, use: DATABASE_URL="mysql://root@localhost:3306/car_hire_mw"');
console.log('2. If MySQL root has password, use: DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/car_hire_mw"');
console.log('3. Or create a new MySQL user (see scripts/setup-mysql.sql)');
console.log('4. Then run: npm run test:db');

// Mail (OTP / verification) — read .env without printing secrets
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  const lineVal = (name) => {
    const m = raw.match(new RegExp(`^${name}=(.*)$`, 'm'));
    if (!m) return null;
    return m[1].replace(/^["']|["']$/g, '').trim();
  };
  const sg = lineVal('SENDGRID_API_KEY');
  const rs = lineVal('RESEND_API_KEY');
  const brevo = lineVal('BREVO_API_KEY');
  const host = lineVal('EMAIL_HOST');
  const user = lineVal('EMAIL_USER');
  const pass = lineVal('EMAIL_PASS');
  const from = lineVal('EMAIL_FROM');
  const brevoHttp =
    (brevo && brevo.startsWith('xkeysib')) ||
    (pass && pass.startsWith('xkeysib'));
  console.log('\n📧 Mail (registration / OTP):');
  if ((sg && sg.length > 8) || (rs && rs.length > 8) || brevoHttp) {
    console.log('   ✅ HTTPS mail API key is set — sending should use port 443.');
    if (sg && sg.length > 8) console.log('      SENDGRID_API_KEY: set');
    if (rs && rs.length > 8) console.log('      RESEND_API_KEY: set');
    if (brevoHttp) {
      if (brevo && brevo.startsWith('xkeysib')) console.log('      BREVO_API_KEY: set (Brevo v3)');
      else if (pass && pass.startsWith('xkeysib')) console.log('      Brevo v3 key: in EMAIL_PASS (prefer BREVO_API_KEY)');
    }
  } else {
    console.log('   ⚠️  No HTTPS API key for mail (SendGrid / Resend / Brevo xkeysib).');
    if (brevo && brevo.length > 8 && !brevo.startsWith('xkeysib')) {
      console.log('      BREVO_API_KEY is set but does not look like a v3 API key (expected xkeysib-…).');
      console.log('      SMTP passwords (xsmtpsib-…) do not work for the Brevo HTTPS API — create a v3 key in Brevo.');
    }
    if (host && user && pass) {
      console.log(`   SMTP: ${user} @ ${host} (from: ${from || '(not set)'})`);
      console.log('   If registration emails time out, this server may block outbound SMTP (587/465).');
      console.log('   Fix: add BREVO_API_KEY=xkeysib-… from https://app.brevo.com/settings/keys/api (or Resend/SendGrid).');
    } else {
      console.log('   SMTP env vars incomplete (need EMAIL_HOST, EMAIL_USER, EMAIL_PASS).');
    }
  }
}

