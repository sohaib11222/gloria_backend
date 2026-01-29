/**
 * One-time Stripe env setup. Writes STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * to backend .env and VITE_STRIPE_PUBLISHABLE_KEY to admin/source .env.
 * Never commit real keys. Run from backend directory: node scripts/setup-stripe-env.cjs
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_... [VITE_STRIPE_PUBLISHABLE_KEY=pk_...] node scripts/setup-stripe-env.cjs
 *   Or (avoid in shared shells): node scripts/setup-stripe-env.cjs --stripe-secret-key=sk_... --stripe-webhook-secret=whsec_... --stripe-publishable-key=pk_...
 */
const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const repoRoot = path.resolve(backendDir, '..');
const adminDir = path.join(repoRoot, 'gloriaconnect_admin');
const sourceDir = path.join(repoRoot, 'gloriaconnect_source');

function parseArgs() {
  const out = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith('--stripe-secret-key=')) out.STRIPE_SECRET_KEY = arg.slice(20);
    else if (arg.startsWith('--stripe-webhook-secret=')) out.STRIPE_WEBHOOK_SECRET = arg.slice(25);
    else if (arg.startsWith('--stripe-publishable-key=')) out.VITE_STRIPE_PUBLISHABLE_KEY = arg.slice(26);
  }
  return out;
}

function setOrAppendEnv(filePath, key, value) {
  if (!value) return;
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf8');
  }
  const lines = content.split('\n');
  const keyEq = key + '=';
  let found = false;
  const newLines = lines.map((line) => {
    if (line.trim().startsWith(keyEq) || line.trim().startsWith(key + '=')) {
      found = true;
      return keyEq + (value.includes(' ') || value.includes('#') ? JSON.stringify(value) : value);
    }
    return line;
  });
  if (!found) {
    newLines.push(keyEq + (value.includes(' ') || value.includes('#') ? JSON.stringify(value) : value));
  }
  const result = newLines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  fs.writeFileSync(filePath, result + (result.endsWith('\n') ? '' : '\n'), 'utf8');
}

const args = parseArgs();
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || args.STRIPE_SECRET_KEY;
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || args.STRIPE_WEBHOOK_SECRET;
const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY || args.VITE_STRIPE_PUBLISHABLE_KEY;

if (process.argv.some((a) => a.includes('--stripe-secret-key') || a.includes('--stripe-webhook-secret'))) {
  console.warn('Warning: Avoid passing secret keys on the command line in shared shells.');
}

const backendEnv = path.join(backendDir, '.env');
if (stripeSecretKey) {
  setOrAppendEnv(backendEnv, 'STRIPE_SECRET_KEY', stripeSecretKey);
  console.log('Wrote STRIPE_SECRET_KEY to backend .env');
}
if (stripeWebhookSecret) {
  setOrAppendEnv(backendEnv, 'STRIPE_WEBHOOK_SECRET', stripeWebhookSecret);
  console.log('Wrote STRIPE_WEBHOOK_SECRET to backend .env');
}

if (publishableKey) {
  const adminEnv = path.join(adminDir, '.env');
  const sourceEnv = path.join(sourceDir, '.env');
  if (fs.existsSync(path.dirname(adminEnv))) {
    setOrAppendEnv(adminEnv, 'VITE_STRIPE_PUBLISHABLE_KEY', publishableKey);
    console.log('Wrote VITE_STRIPE_PUBLISHABLE_KEY to admin .env');
  }
  if (fs.existsSync(path.dirname(sourceEnv))) {
    setOrAppendEnv(sourceEnv, 'VITE_STRIPE_PUBLISHABLE_KEY', publishableKey);
    console.log('Wrote VITE_STRIPE_PUBLISHABLE_KEY to source .env');
  }
}

if (!stripeSecretKey && !stripeWebhookSecret && !publishableKey) {
  console.log('No Stripe keys provided. Set env vars or pass --stripe-secret-key=..., --stripe-webhook-secret=..., --stripe-publishable-key=...');
  console.log('Example: STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_... node scripts/setup-stripe-env.cjs');
}
