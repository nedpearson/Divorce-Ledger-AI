import { db } from './server/db';
import { documents } from './shared/schema';

db.select()
  .from(documents)
  .then(res => {
     console.log(res.find(d => d.id === '513c0f44-0708-45a9-a525-9c8b77e4347f'));
  })
  .catch(console.error)
  .finally(() => process.exit(0));
