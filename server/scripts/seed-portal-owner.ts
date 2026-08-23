/**
 * Seeds the owner row for the settlement portal.
 *
 *   npx tsx server/scripts/seed-portal-owner.ts <owner-email>
 *
 * Idempotent: re-running just re-activates the existing row.
 * Without an owner row, loadPortalContext cannot resolve anyone as owner and
 * every portal route returns 403.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import * as schema from '@shared/schema';

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: tsx server/scripts/seed-portal-owner.ts <owner-email>');
    process.exit(1);
  }

  const [user] = await db
    .select({ id: schema.users.id, email: schema.users.email, environment: schema.users.environment })
    .from(schema.users)
    .where(eq(schema.users.email, email));

  if (!user) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const [existing] = await db
    .select()
    .from(schema.portalMembers)
    .where(
      and(
        eq(schema.portalMembers.ownerUserId, user.id),
        eq(schema.portalMembers.email, user.email)
      )
    );

  if (existing) {
    await db
      .update(schema.portalMembers)
      .set({ role: 'owner', status: 'active', memberUserId: user.id, acceptedAt: new Date() })
      .where(eq(schema.portalMembers.id, existing.id));
    console.log(`Updated existing portal owner row for ${email} (${user.id})`);
  } else {
    await db.insert(schema.portalMembers).values({
      ownerUserId: user.id,
      memberUserId: user.id,
      email: user.email,
      role: 'owner',
      status: 'active',
      acceptedAt: new Date(),
      environment: user.environment,
    });
    console.log(`Created portal owner row for ${email} (${user.id})`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
