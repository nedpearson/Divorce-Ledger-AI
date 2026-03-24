import 'dotenv/config';
import { db } from './server/db';
import { users, documents, calendarEvents } from './shared/schema';
import { eq } from 'drizzle-orm';

async function run() {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.email, 'demo.client@demo.com')
    });
    console.log('User UUID:', user?.id);
    
    if (user) {
      const docs = await db.select().from(documents).where(eq(documents.userId, user.id));
      console.log('Docs Count for User:', docs.length);
      
      const events = await db.select().from(calendarEvents).where(eq(calendarEvents.userId, user.id));
      console.log('Events Count for User:', events.length);
    } else {
      console.log('User demo.client@demo.com not found!');
    }
  } catch (e) {
    console.error('Error:', e);
  }
  process.exit(0);
}

run();
