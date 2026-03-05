import 'dotenv/config';
import { resetDemoEnvironment } from './server/demo-reset.ts';

async function run() {
    console.log('Resetting demo environment...');
    console.log('DATABASE_URL is:', process.env.DATABASE_URL);
    await resetDemoEnvironment();
    console.log('Done!');
    process.exit(0);
}
run().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
