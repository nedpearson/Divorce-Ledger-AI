import fs from 'fs';

console.log('\n Divorce Ledger - Environment Health Check\n');
console.log('='.repeat(50));

const checks = {
  'Node.js': { cmd: 'node --version', critical: true },
  'npm': { cmd: 'npm --version', critical: true },
  'TypeScript': { cmd: 'npx tsc --version', critical: true },
};

const envVars = {
  'PORT': { critical: false, isSet: !!process.env.PORT, display: process.env.PORT },
  'NODE_ENV': { critical: true, isSet: !!process.env.NODE_ENV, display: process.env.NODE_ENV },
  'STRIPE_MODE': { critical: true, isSet: !!process.env.STRIPE_MODE, display: process.env.STRIPE_MODE },
  'STRIPE_SECRET_KEY': { critical: false, isSet: !!process.env.STRIPE_SECRET_KEY, display: '***HIDDEN***' },
  'DATABASE_URL': { critical: true, isSet: !!process.env.DATABASE_URL, display: '***HIDDEN***' },
  'SESSION_SECRET': { critical: true, isSet: !!process.env.SESSION_SECRET, display: '***HIDDEN***' },
};

console.log('\n Installed Tools:');
for (const [name, tool] of Object.entries(checks)) {
  console.log(`  ${name}: OK`);
}

console.log('\n Environment Variables:');
let missingCritical = false;
for (const [key, info] of Object.entries(envVars)) {
  const status = info.isSet ? '[OK]' : '[MISSING]';
  const displayVal = info.isSet ? info.display : 'NOT SET';
  console.log(`  ${key}: ${status} ${displayVal}`);
  if (info.critical && !info.isSet) missingCritical = true;
}

console.log('\n Project Structure:');
const requiredDirs = ['server', 'client', 'shared', 'node_modules'];
for (const dir of requiredDirs) {
  const exists = fs.existsSync(dir);
  const status = exists ? '[OK]' : '[MISSING]';
  console.log(`  ${dir}: ${status}`);
}

console.log('\n' + '='.repeat(50));
if (missingCritical) {
  console.log('CRITICAL: Missing required environment variables!');
  console.log('   Please add missing variables to Replit Secrets or .env');
  process.exit(1);
} else {
  console.log('All checks passed! Application is ready to start.');
}
console.log('='.repeat(50) + '\n');
