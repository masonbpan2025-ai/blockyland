import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { targetedBlockLabel } from '../src/ui.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';

/**
 * The debug screen (F3) shows the block under the crosshair by name, next to the coordinates. While the
 * pointer is locked the crosshair is wherever the mouse is, so the game's raycast target is the hovered
 * block; `updateDebug` writes the line and returns early unless debug mode is on.
 */
test('the targeted-block label names the block under the crosshair', () => {
  const label = targetedBlockLabel({ x: 19, y: 44, z: -28, blockId: BLOCKS.GRASS });
  assert.equal(label, 'Targeted: Grass Block (19 44 -28)');
});

test('the name comes from the registry, not from the id', () => {
  // A block whose display name differs from its constant is the case that would catch a shortcut.
  const named = Object.entries(BLOCK_DEFS).find(([, def]) => def?.name && def.name.includes(' '));
  assert.ok(named, 'the registry has at least one multi-word block name');
  const [id, def] = named;
  assert.equal(targetedBlockLabel({ x: 0, y: 0, z: 0, blockId: Number(id) }), `Targeted: ${def.name} (0 0 0)`);
});

test('an unknown id still reports something usable rather than undefined', () => {
  assert.equal(targetedBlockLabel({ x: 1, y: 2, z: 3, blockId: 9999 }), 'Targeted: block 9999 (1 2 3)');
});

test('nothing targeted reads as a dash, not as a crash', () => {
  assert.equal(targetedBlockLabel(null), 'Targeted: -');
  assert.equal(targetedBlockLabel(undefined), 'Targeted: -');
});

test('the line cannot take the debug screen down when the markup is older than the code', () => {
  // A tab still running an index.html from before this line existed has no #dbg-target. Writing to it
  // unguarded threw inside updateDebug every frame, which cost the whole debug screen (fps, XYZ, block
  // and all), so the write is guarded and stays that way.
  const ui = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');
  assert.match(ui, /const targetLine = document\.getElementById\('dbg-target'\);/, 'the element is looked up once');
  assert.match(ui, /if \(targetLine\) targetLine\.textContent/, 'and written only when it exists');
  assert.ok(!/document\.getElementById\('dbg-target'\)\.textContent/.test(ui), 'never written unguarded');
});
