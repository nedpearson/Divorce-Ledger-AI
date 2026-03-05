import { db } from './server/db.ts';
import { users, documents, cases, violations } from './shared/schema.ts';
import fs from 'fs';

async function run() {
    const allUsers = await db.select().from(users);
    const docs = await db.select().from(documents);
    const allCases = await db.select().from(cases);
    const allViolations = await db.select().from(violations);

    fs.writeFileSync('output.json', JSON.stringify({
        users: allUsers.map(u => ({ id: u.id, email: u.email })),
        docs: docs.map(d => ({ id: d.id, userId: d.userId, title: d.title })),
        cases: allCases.map(c => ({ id: c.id, userId: c.userId, title: c.title })),
        violations: allViolations.map(v => ({ id: v.id, userId: v.userId, title: v.title }))
    }, null, 2));
    process.exit(0);
}
run();
