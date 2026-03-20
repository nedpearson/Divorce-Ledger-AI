const fs = require('fs');
const path = require('path');

const directoryPath = path.join(__dirname, 'client/src/pages');

function removeDemoBanner(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      removeDemoBanner(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.jsx')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      // Regex to match the demo banner block
      // {environment === "demo" && (\s*<div.*?DEMO MODE - Data resets nightly.*?</div>\s*)}
      const regex =
        /\{environment === "demo" && \(\s*<div[^>]*>\s*DEMO MODE - Data resets nightly\s*<\/div>\s*\)\}/g;
      if (regex.test(content)) {
        console.log(`Matched banner in ${fullPath}`);
        content = content.replace(regex, '');
        fs.writeFileSync(fullPath, content, 'utf8');
      }
    }
  }
}

removeDemoBanner(directoryPath);
console.log('Finished removing inline demo banners.');
