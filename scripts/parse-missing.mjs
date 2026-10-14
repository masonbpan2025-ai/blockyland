import fs from 'node:fs';

const content = fs.readFileSync('docs/missing-content.md', 'utf8');
const lines = content.split('\n');
let mode = '';
const blocks = [];
const items = [];

for (const line of lines) {
  if (line.startsWith('## Missing blocks')) {
    mode = 'blocks';
  } else if (line.startsWith('## Missing items')) {
    mode = 'items';
  } else if (line.startsWith('| `')) {
    const parts = line.split('|').map((s) => s.trim());
    const id = parts[1].replace(/`/g, '');
    const name = parts[2];
    const note = parts[5] || '';
    if (mode === 'blocks') {
      blocks.push({ id, name, note });
    } else if (mode === 'items') {
      items.push({ id, name, note });
    }
  }
}

console.log(`Parsed ${blocks.length} blocks and ${items.length} items.`);
fs.writeFileSync('.cache-missing.json', JSON.stringify({ blocks, items }, null, 2));
