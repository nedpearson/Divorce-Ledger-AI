import 'dotenv/config';
import { db } from './server/db';
import * as schema from '@shared/schema';

async function check() {
  const users = await db.query.users.findMany();
  console.log('Total users:', users.length);
  users.forEach(u => console.log(u.email, '-', u.password, '-', u.createdAt));
  process.exit(0);
}
check();
