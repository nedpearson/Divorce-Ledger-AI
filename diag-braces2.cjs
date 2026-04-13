const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split('\n');
let open = 0;
for(let i=0; i<lines.length; i++) {
  const l = lines[i].replace(/\/\/.*$/, '').replace(/['"`].*?['"`]/g, '');
  open += (l.match(/\{/g) || []).length;
  open -= (l.match(/\}/g) || []).length;
  if (lines[i].includes('app.get(') || lines[i].includes('app.post(') || lines[i].includes('app.put(') || lines[i].includes('app.delete(')) {
    console.log(`Open: ${open} at line ${i+1}: ${lines[i]}`);
  }
}
console.log('Final open count: ' + open);
