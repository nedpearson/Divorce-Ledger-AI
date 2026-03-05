import fs from 'fs';
let c = fs.readFileSync('server/routes.ts', 'utf-8');

// Fix string literals inside function calls like getAlerts("demo-user", ...)
c = c.replace(/storage\.(\w+)\("demo-user"/g, 'storage.$1(req.user?.id || "demo-user"');
c = c.replace(/storage\.(\w+)\(req\.params\.id, "demo-user"/g, 'storage.$1(req.params.id, req.user?.id || "demo-user"');

// Fix object property assignments
c = c.replace(/userId: "demo-user"/g, 'userId: req.user?.id || "demo-user"');

// Fix the header extraction pattern
c = c.replace(/userId = \(\(req as any\)\.session\?.userId\) \|\| \(req\.headers\["x-user-id"\] as string\) \|\| "demo-user"/g, 'userId = req.user?.id || ((req as any).session?.userId) || (req.headers["x-user-id"] as string) || "demo-user"');

c = c.replace(/userId = \(headerUserId && headerUserId\.trim\(\)\) \|\| "demo-user"/g, 'userId = req.user?.id || (headerUserId && headerUserId.trim()) || "demo-user"');

c = c.replace(/const stats = await storage\.getDashboardStats\("demo-user"/g, 'const stats = await storage.getDashboardStats(req.user?.id || "demo-user"');

fs.writeFileSync('server/routes.ts', c);
console.log('Done replacement');
