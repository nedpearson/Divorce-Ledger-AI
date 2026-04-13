const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split('\n');
let open = 0;
for(let i=0; i<lines.length; i++) {
  const l = lines[i].replace(/\/\/.*$/, '').replace(/['"`].*?['"`]/g, '');
  open += (l.match(/\{/g) || []).length;
  open -= (l.match(/\}/g) || []).length;
  if (open < 0) {
    console.log('Negative block at line: ' + (i+1));
    console.log(lines[i-1]);
    console.log(lines[i]);
    console.log(lines[i+1]);
    break;
  }
}
console.log('Final open count: ' + open);
