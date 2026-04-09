/**
 * fix-user-env.ts
 * One-time migration: set admin user's environment column to canonical 'live'
 */
import { db } from './server/db';
import { sql } from 'drizzle-orm';

(async () => {
  const r = await db.execute(sql`
    UPDATE users
    SET environment = 'live'
    WHERE email = 'nedpearson@gmail.com'
      AND (environment = 'live-prod' OR environment IS NULL)
    RETURNING id, email, environment
  `);
  const rows = (r as any).rows;
  if (rows.length > 0) {
    console.log('✅ User updated:');
    rows.forEach((u: any) => console.log(`   ${u.email} -> environment=${u.environment}`));
  } else {
    console.log('ℹ️  User already has environment=live (or not found)');
  }

  // Verify
  const check = await db.execute(sql`
    SELECT id, email, environment FROM users WHERE email = 'nedpearson@gmail.com'
  `);
  console.log('\nCurrent user record:');
  (check as any).rows.forEach((u: any) =>
    console.log(`  ${u.email} | environment=${u.environment} | id=${u.id}`)
  );
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
