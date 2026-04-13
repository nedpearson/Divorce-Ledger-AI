const fs = require('fs');
const lines = fs.readFileSync('server/routes.ts', 'utf8').split('\n');
let open = 0;
for(let i=0; i<lines.length; i++) {
  const row = lines[i];
  let inString = false;
  let inTemplate = false;
  let stringChar = '';
  for(let j=0; j<row.length; j++) {
     if(row.slice(j, j+2) === '//' && !inString && !inTemplate) break; // comment
     if(!inString && !inTemplate && (row[j] === '"' || row[j] === '\'')) { inString = true; stringChar = row[j]; continue; }
     if(inString && row[j] === stringChar && row[j-1] !== '\\') { inString = false; continue; }
     if(!inString && !inTemplate && row[j] === '`') { inTemplate = true; continue; }
     if(inTemplate && row[j] === '`' && row[j-1] !== '\\') { inTemplate = false; continue; }
     if(!inString && !inTemplate) {
        if(row[j] === '{') open++;
        if(row[j] === '}') open--;
     }
  }
  if (open === 0 && i > 568) {
     console.log('Open count hits 0 at line ' + (i+1));
     console.log(lines[i-2]);
     console.log(lines[i-1]);
     console.log(lines[i]);
     return;
  }
}
console.log('never hits 0');
