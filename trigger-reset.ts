import { resetDemoEnvironment } from './server/demo-reset.ts';

async function main() {
  process.env.APP_MODE = 'demo';
  process.env.DEMO_MODE = 'true';
  process.env.DEMO_EMAIL = 'demo@example.com';
  process.env.DEMO_PASSWORD = 'demo1234';
  console.log('Triggering explicit demo environment reset...');
  try {
    await resetDemoEnvironment();
    console.log('Reset and Re-seed completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to reset:', err);
    process.exit(1);
  }
}

main();
