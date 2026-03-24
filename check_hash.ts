import { verifyPassword } from './server/auth';
async function test() {
  const hash = '$2b$12$uDZyHpX9tq/sx1/F5Y13RuFc47K9YAlJ175ogB1TQkqMdy/lgil.a';
  const isValid = await verifyPassword('password123', hash);
  console.log('IsValid:', isValid);
  process.exit(0);
}
test();
