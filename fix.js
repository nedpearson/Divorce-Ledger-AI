import fs from 'fs';
let c = fs.readFileSync('server/routes.ts', 'utf-8');
c = c.replace(/const userId = \(?req\.headers\["x-user-id"\] as string\)? \|\| "demo-user";/g, 'const userId = req.user?.id || (req.headers["x-user-id"] as string) || "demo-user";');
fs.writeFileSync('server/routes.ts', c);
console.log('done');
