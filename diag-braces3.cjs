const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split('\n');
let open = 0;
let routeOpenLine = -1;
for(let i=0; i<lines.length; i++) {
  const l = lines[i].replace(/\/\/.*$/, '').replace(/['\`\"].*?['\`\"]/g, '');
  open += (l.match(/\{/g) || []).length;
  open -= (l.match(/\}/g) || []).length;
  if(lines[i].includes('export function registerRoutes')) {
    routeOpenLine = i+1;
  }
  if(routeOpenLine !== -1 && open === 0 && i > routeOpenLine + 10) {
    console.log('registerRoutes implicitly closed at line ' + (i+1));
    console.log(lines[i-2]);
    console.log(lines[i-1]);
    console.log(lines[i]);
    console.log(lines[i+1]);
    return;
  }
}
