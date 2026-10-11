// Classify the ui.js hunks from a patch file, so I can commit only the cheats-toggle work.
import { readFileSync } from 'node:fs';
const lines = readFileSync('scripts/_ui.patch', 'utf8').split(/\r?\n/);
const MINE = new RegExp(['cheat', 'refreshPauseMenuLabels', 'btnOpenMap', 'Load / Manage Maps'].join('|'), 'i');

let hunk = null;
const hunks = [];
for (const line of lines) {
  if (line.startsWith('@@')) {
    if (hunk) hunks.push(hunk);
    hunk = { header: line, body: [] };
  } else if (hunk) hunk.body.push(line);
}
if (hunk) hunks.push(hunk);

let mineCount = 0;
hunks.forEach((h, i) => {
  const mine = MINE.test(h.body.join('\n'));
  if (mine) mineCount++;
  console.log(`  hunk ${i + 1} ${h.header.slice(0, 30)}  mine=${mine}`);
  if (!mine) for (const b of h.body) if (b.startsWith('+') || b.startsWith('-')) console.log('      ' + b.slice(0, 90));
});
console.log(`  total ${hunks.length} hunks, ${mineCount} mine, ${hunks.length - mineCount} someone else's`);
