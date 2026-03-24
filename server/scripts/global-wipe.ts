import 'dotenv/config';
import { db } from '../db';
import { sql } from 'drizzle-orm';

async function extinguish() {
  console.log('⚠️ INITIATING GLOBAL DATABASE ERADICATION ⚠️');
  console.log('Dropping entire public schema and cascading all tables, constraints, and rows...');
  try {
    await db.execute(sql.raw(`DROP SCHEMA public CASCADE;`));
    console.log('💥 SCHEMA DROPPED.');
    await db.execute(sql.raw(`CREATE SCHEMA public;`));
    console.log('✅ SCHEMA RECREATED.');
    // Grant standard permissions so the app can use it again
    await db.execute(sql.raw(`GRANT ALL ON SCHEMA public TO public;`));
    console.log('✅ PERMISSIONS RESTORED.');
    console.log('GLOBAL ERADICATION COMPLETE.');
    process.exit(0);
  } catch (err) {
    console.error('Failed to wipe schema:', err);
    process.exit(1);
  }
}

extinguish();
