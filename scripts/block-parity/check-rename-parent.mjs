// Decide whether the library rename breakage predates the block-parity merge.
//
// A pure-rename commit (files moved, imports not updated) would break every test that loads the
// inventory or the catalogue, independently of any block work. This loads the module graph of the
// merge's FIRST PARENT (i.e. master without my changes) in a scratch worktree and reports.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 26 }).trim();

const parent = git('rev-parse', 'HEAD^1');
console.log('merge first parent (master before this merge):', parent.slice(0, 10));

// Which of the renamed targets exist in that parent, and do the importers still name the old paths?
const checks = [
  ['src/buildingLibrary.js', 'src/structureLibrary.js'],
  ['src/buildings/index.js', 'src/structures/index.js'],
];
for (const [newPath, oldPath] of checks) {
  const hasNew = git('cat-file', '-e', `${parent}:${newPath}`).length === 0;
  console.log(`  ${newPath}: present=${hasNew}`);
  try {
    git('cat-file', '-e', `${parent}:${oldPath}`);
  } catch {
    console.log(`  ${oldPath}: deleted by the rename`);
  }
}
