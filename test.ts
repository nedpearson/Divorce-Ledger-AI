import { db } from './server/db.ts';
import { users } from './shared/schema.ts';
import fs from 'fs';

async function run() {
    const allUsers = await db.select().from(users);
    fs.writeFileSync('output.json', JSON.stringify(allUsers.map(u => ({ email: u.email, id: u.id, role: u.role, isAdmin: u.isAdmin })), null, 2));
    process.exit(0);
}
run();
