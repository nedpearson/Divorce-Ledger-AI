const fs = require('fs');
const files = [
  'analytics-service.ts',
  'billing-service.ts',
  'dashboard-service.ts',
  'media-service.ts',
  'quota-reset-service.ts',
  'tier-migration-service.ts',
  'websocket-service.ts'
];
for(const f of files) {
  let content = fs.readFileSync('server/services/' + f, 'utf8');
  content = content.replace(/'\.\/db'/g, "'../db'");
  content = content.replace(/'\.\/config'/g, "'../config'");
  content = content.replace(/'\.\/lib/g, "'../lib");
  content = content.replace(/'\.\/tier-enforcement'/g, "'../tier-enforcement'");
  fs.writeFileSync('server/services/' + f, content);
}

let content = fs.readFileSync('server/routes/analytics.routes.ts', 'utf8');
content = content.replace(/'\.\.\/analytics-service'/g, "'../services/analytics-service'");
content = content.replace(/'\.\.\/billing-service'/g, "'../services/billing-service'");
content = content.replace(/'\.\.\/tier-migration-service'/g, "'../services/tier-migration-service'");
content = content.replace(/'\.\.\/quota-reset-service'/g, "'../services/quota-reset-service'");
fs.writeFileSync('server/routes/analytics.routes.ts', content);

console.log('Fixed internal imports');
