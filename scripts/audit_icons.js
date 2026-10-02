import fs from 'fs';
import path from 'path';
import { ITEMS, BLOCK_DEFS } from '../src/blocks.js';
import { ALL_CREATIVE_ITEMS } from '../src/creativeCatalog.js';

const issues = [];

function checkIcon(source, id, name, icon) {
  if (!icon) {
    issues.push({ source, id, name, error: 'No icon defined' });
    return;
  }
  const rel = icon.startsWith('/') ? icon.slice(1) : icon;
  const full = path.join('public', rel);
  if (!fs.existsSync(full)) {
    issues.push({ source, id, name, icon, error: 'File does not exist: ' + full });
  }
}

for (const [id, def] of Object.entries(ITEMS)) {
  checkIcon('ITEMS', id, def.name, def.icon);
}

for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (def.icon) {
    checkIcon('BLOCK_DEFS', id, def.name, def.icon);
  }
}

for (const item of ALL_CREATIVE_ITEMS) {
  checkIcon('ALL_CREATIVE_ITEMS', item.id, item.name, item.icon);
}

console.log('Total issues found:', issues.length);
const bySource = {};
for (const issue of issues) {
  bySource[issue.id] = issue;
}
console.log('Unique ids with issues:', Object.keys(bySource).length);
for (const [id, iss] of Object.entries(bySource)) {
  console.log(`- ${iss.source} [${id}] "${iss.name}": ${iss.icon}`);
}
