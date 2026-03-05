import fs from 'fs';
let c = fs.readFileSync('server/routes.ts', 'utf-8');
c = c.replace(/req\.user\?\.id/g, '(req as any).session?.userId');
fs.writeFileSync('server/routes.ts', c);
console.log('Fixed session access');
