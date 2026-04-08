import { db } from './server/db';
import { documentRepository } from './server/services/storage/documentRepository';

async function run() {
  try {
    const res = await documentRepository.updateDocument('513c0f44-0708-45a9-a525-9c8b77e4347f', {
      status: 'error',
      errorMessage: 'Testing error update'
    });
    console.log("Success:", res);
  } catch (e) {
    console.error("Failed to update:", e);
  }
  process.exit(0);
}

run();
