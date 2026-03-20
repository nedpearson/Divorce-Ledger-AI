const fs = require('fs');
const filesToUpdateDotSlash = [
  './server/routes.ts',
  './server/live-scheduler.ts',
  './server/index.ts',
  './server/cron-scheduler.ts'
];
const filesToUpdateDotDotSlash = [
  './server/routes/analytics.routes.ts'
];
const services = [
  'analytics-service',
  'billing-service',
  'dashboard-service',
  'media-service',
  'quota-reset-service',
  'tier-migration-service',
  'websocket-service'
];

for (const file of filesToUpdateDotSlash) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    for (const s of services) {
      content = content.replace(new RegExp(`'./${s}'`, 'g'), `'./services/${s}'`);
      content = content.replace(new RegExp(`"./${s}"`, 'g'), `"./services/${s}"`);
    }
    fs.writeFileSync(file, content);
  }
}

for (const file of filesToUpdateDotDotSlash) {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    for (const s of services) {
      content = content.replace(new RegExp(`'\\\\.\\\\./${s}'`, 'g'), `'../services/${s}'`);
      content = content.replace(new RegExp(`"\\\\.\\\\./${s}"`, 'g'), `"../services/${s}"`);
    }
    fs.writeFileSync(file, content);
  }
}
console.log('Imports updated successfully');
