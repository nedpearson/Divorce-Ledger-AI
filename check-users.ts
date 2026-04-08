import { db } from './server/db';
import { users } from './shared/schema';

db.select()
  .from(users)
  .then(res => {
     console.log(res);
  })
  .catch(console.error)
  .finally(() => process.exit(0));
