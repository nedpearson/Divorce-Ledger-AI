import { db } from './server/db.ts';
import { users } from './shared/schema.ts';
import { matters, matterMembers } from './shared/workspace-schema.ts';
import fs from 'fs';

async function run() {
    const allMatters = await db.select().from(matters);
    const allMatterMembers = await db.select().from(matterMembers);

    fs.writeFileSync('output-matters.json', JSON.stringify({
        matters: allMatters,
        members: allMatterMembers
    }, null, 2));
    process.exit(0);
}
run();
