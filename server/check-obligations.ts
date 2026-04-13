import { db } from './db.js';
import { obligationRules, obligationInstances } from '../shared/schema.js';

async function main() {
  const rules = await db.select().from(obligationRules);
  console.log('RULES:', rules.length ? JSON.stringify(rules, null, 2) : 'NONE');

  const instances = await db.select().from(obligationInstances);
  console.log('INSTANCES:', instances.length ? JSON.stringify(instances, null, 2) : 'NONE');

  process.exit(0);
}

main().catch(console.error);
