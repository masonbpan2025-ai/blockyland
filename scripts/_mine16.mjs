// Build a patch containing ONLY the cheats-toggle hunks of src/ui.js, so another agent's in-flight work is not
// swept into my commit. `git commit --only <path>` takes the whole working-tree file, which is exactly the trap.
import { readFileSync, writeFileSync } from 'node:fs';
const raw = readFileSync('scripts/_ui.patch', 'utf8').split(/\r?\n/);
const MINE = new RegExp(['cheat', 'refreshPauseMenuLabels', 'btnOpenMap', 'Load / Manage Maps'].join('|'), 'i');

const header = [];
const hunks = [];
let hunk = null;
for (const line of raw) {
  if (line.startsWith('@@')) {
    if (hunk) hunks.push(hunk);
    hunk = { header: line, body: [] };
  } else if (hunk) hunk.body.push(line);
  else header.push(line);
}
if (hunk) hunks.push(hunk);

const keep = hunks.filter(h => MINE.test(h.body.join('\n')));
if (keep.length === 0) throw new Error('no hunks matched: the patch format must have changed');
const out = [...header, ...keep.flatMap(h => [h.header, ...h.body])];
writeFileSync('scripts/_ui.mine.patch', out.join('\n') + '\n', 'utf8');
console.log(`  kept ${keep.length} of ${hunks.length} hunks`);
console.log(`  dropped ${hunks.length - keep.length} that belong to another agent`);
