// Resolve the batch-4 merge conflicts.
//
// Decisions, each made from the content rather than from the marker order:
//
//   scripts/test.mjs        union of the survival test lists.
//   generate-content-...     conflict 1: the branch's stone_cubes pattern is a superset (it adds the
//                            resin blocks). conflict 2: a pure addition on the branch (the plural
//                            texture fallback) with nothing on HEAD.
//   src/main.js             conflict 1 and 2 are both additions on the branch, but one of them is
//                            STALE: it imports `drinkPotion` from './potions.js', which does not exist
//                            in this tree, and calls it with the old two-argument signature. Master
//                            already routes potions through './potionUse.js' with a four-argument
//                            signature, and a commit on this line records fixing exactly the
//                            "two potion drinkers imported under the same name" problem. So the
//                            potion half is dropped and the firework half kept, since
//                            src/fireworks.js exists and nothing else launches a rocket item.
import { readFileSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const W = 'C:/Users/pope1/AppData/Local/Temp/m4wt/';

function conflictsOf(file) {
  const lines = readFileSync(W + file, 'utf8').split(/\r?\n/);
  const found = [];
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith('<<<<<<<')) { i++; continue; }
    const head = [];
    const branch = [];
    const start = i;
    i++;
    while (i < lines.length && !lines[i].startsWith('=======')) head.push(lines[i++]);
    i++;
    while (i < lines.length && !lines[i].startsWith('>>>>>>>')) branch.push(lines[i++]);
    i++;
    found.push({ start, end: i, head, branch });
  }
  return { lines, found };
}

function rewrite(file, choose) {
  const { lines, found } = conflictsOf(file);
  // Idempotent: a file resolved by an earlier pass has no markers left, which is a success, not a
  // failure. That matters because this script is re-run after a partial failure.
  if (!found.length) { console.log(`${file}: already resolved`); return; }
  const out = [];
  let cursor = 0;
  found.forEach((c, index) => {
    out.push(...lines.slice(cursor, c.start));
    out.push(...choose(c.head, c.branch, index).split('\n'));
    cursor = c.end;
  });
  out.push(...lines.slice(cursor));
  const text = out.join('\n');
  if (/^(<{7}|={7}|>{7})/m.test(text)) throw new Error(`${file}: markers remain`);
  writeFileSync(W + file, text, 'utf8');
  console.log(`${file}: resolved ${found.length} conflict(s)`);
}

// --- scripts/test.mjs --------------------------------------------------------
rewrite('scripts/test.mjs', (head, branch) => {
  const names = (ls) => ls.join('\n').trim()
    .slice(ls.join('\n').trim().indexOf('[') + 1, ls.join('\n').trim().lastIndexOf(']'))
    .split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
  const union = [...new Set([...names(branch), ...names(head)])];
  return `  survival: [${union.map((n) => `'${n}'`).join(', ')}],`;
});

// --- scripts/generate-content-expansion.mjs ---------------------------------
rewrite('scripts/generate-content-expansion.mjs', (head, branch, index) => {
  if (index === 0) {
    // The pattern: take whichever side mentions resin, which is the superset.
    if (!branch.join('\n').includes('resin_bricks')) throw new Error('expected resin in the branch pattern');
    return branch.join('\n');
  }
  // The plural fallback: a pure branch addition.
  if (!branch.join('\n').includes('s.png')) throw new Error('expected the plural fallback on the branch');
  if (head.join('\n').trim()) throw new Error('expected no HEAD content in the fallback conflict');
  return branch.join('\n');
});

// --- src/main.js ------------------------------------------------------------
rewrite('src/main.js', (head, branch, index) => {
  if (branch.join('\n').includes('potions.js')) {
    // Import lines. Keep only the firework import; potions.js does not exist here.
    if (existsSync(W + 'src/potions.js')) throw new Error('potions.js exists after all; revisit this resolution');
    return "import { launchFirework } from './fireworks.js';";
  }
  // The usage block: drop the stale potion call and the comment that introduces it, keep the firework
  // launch. The filter targets the CALL and its own two comment lines, not any mention of the name --
  // prose that mentions it is fine, an unreachable import is not.
  const dropCall = (l) => /drinkPotion\(this, activeItem/.test(l)
    || /Potions are drunk, not eaten/.test(l)
    || /`type: 'potion'` was consumed by nothing/.test(l)
    || /brewing stand produced could not be used/.test(l)
    || /reads the effect from POTION_DATA/.test(l);
  const keep = branch.join('\n').split('\n').filter((l) => !dropCall(l));
  const text = keep.join('\n').replace(/\n{3,}/g, '\n\n');
  if (/drinkPotion\(this, activeItem/.test(text)) throw new Error('stale potion call survived');
  if (!text.includes('launchFirework')) throw new Error('the firework launch was lost');
  return text;
});

// --- verification -----------------------------------------------------------
const main = readFileSync(W + 'src/main.js', 'utf8');
const potionImports = [...main.matchAll(/^import \{[^}]*drinkPotion[^}]*\} from '([^']+)'/gm)].map((m) => m[1]);
console.log('\nverification');
console.log('  drinkPotion imported from:', potionImports.join(', ') || '(none)');
if (potionImports.length !== 1 || potionImports[0] !== './potionUse.js') {
  throw new Error(`expected exactly one drinkPotion import, from ./potionUse.js, got ${JSON.stringify(potionImports)}`);
}
const launches = (main.match(/launchFirework\(/g) ?? []).length;
console.log('  launchFirework call sites:', launches);
if (launches !== 1) throw new Error('expected exactly one launchFirework call site');

for (const file of ['scripts/test.mjs', 'scripts/generate-content-expansion.mjs', 'src/main.js']) {
  try {
    execFileSync(process.execPath, ['--check', W + file], { stdio: ['ignore', 'pipe', 'pipe'] });
    console.log(`  syntax ok  ${file}`);
  } catch (err) {
    console.error(`  SYNTAX ERROR ${file}\n${err.stderr?.toString() ?? err.message}`);
    process.exitCode = 1;
  }
}
