// Item parity batch 5: nothing declared a stack size, and the inventory merged to a hardcoded 64.
//
// `stackSize` existed only on the generated items, so 93 hand-written ones fell to a literal 64 in
// `inventory.js` and `ui.js`: two diamond pickaxes merged into one stack of two, and a stack of signs
// could hold sixty-four. The Inspector measured it from the start -- 47 items whose applied limit
// disagreed with vanilla and 93 that declared nothing -- which is what made the batch pickable.
//
// The assertions below are of two kinds, and the distinction matters. The first kind states the
// invariant over every item against the pinned vanilla data, so a new item with a limit that is not
// declared fails here. The second drives the real inventory and the real container paths, because a
// declared limit that nothing honours is exactly the state this batch started from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS, stackLimitFor } from '../src/blocks.js';
import { Inventory } from '../src/inventory.js';
import { registry } from '../src/resourceRegistry.js';
import { ResourceShowcase, buildVanillaIndex } from '../src/resourceShowcase.js';

const CACHE = '.cache/mc-data/items.json';
const hasCache = existsSync(CACHE);
const vanilla = hasCache ? JSON.parse(readFileSync(CACHE, 'utf8')) : [];

// --- the rule, and the one place it lives ------------------------------------

test('stackLimitFor answers for items and for blocks alike', () => {
  assert.equal(stackLimitFor('diamond_pickaxe'), 1, 'a tool with durability');
  assert.equal(stackLimitFor('bucket'), 16, 'vanilla stacks an empty bucket to sixteen');
  assert.equal(stackLimitFor('snowball'), 16);
  assert.equal(stackLimitFor('oak_planks'), 64, 'a full block');
  assert.equal(stackLimitFor('apple'), 64, 'food with no durability');
  assert.equal(stackLimitFor(3), 64, 'a block addressed by numeric id has no item definition');
  assert.equal(stackLimitFor('not_an_item_at_all'), 64);
});

test('a stackable item typed as a tool is declared rather than left to the rule', () => {
  // The rule treats an undeclared tool as unstackable, which is right for a pickaxe and wrong for a
  // compass. These four are the exceptions, and they were found by the Inspector rather than by hand:
  // aligning the two copies of the rule made a compass stop stacking.
  for (const id of ['compass', 'clock', 'lead', 'name_tag']) {
    assert.equal(ITEMS[id].type, 'tool', `${id} is typed as a tool`);
    assert.equal(stackLimitFor(id), 64, `${id} stacks to 64 in vanilla`);
  }
});

test('every declared stack size matches the pinned vanilla data', () => {
  // The Inspector's own check, stated as an assertion: this is the invariant, not a list of ids, so a
  // newly added item with an undeclared limit fails here.
  if (!hasCache) return;
  const showcase = new ResourceShowcase({ registry: registry(), vanilla: buildVanillaIndex({ items: vanilla }) });
  const wrong = [];
  for (const id of Object.keys(ITEMS)) {
    for (const check of ['stack-size', 'stack-size-declared']) {
      const result = showcase.run(id).find((r) => r.id === check);
      if (result.status === 'not observed') wrong.push(`${check} ${id}: ${result.detail}`);
    }
  }
  assert.deepEqual(wrong, []);
});

// --- the inventory honours it ------------------------------------------------

test('addItem does not merge two unstackable items into one stack', () => {
  const inv = new Inventory({ playClick() {} });
  inv.hotbar = new Array(9).fill(null);
  inv.storage = new Array(27).fill(null);
  assert.equal(inv.addItem('diamond_pickaxe', false, 1), true);
  assert.equal(inv.addItem('diamond_pickaxe', false, 1), true);
  const stacks = [...inv.hotbar, ...inv.storage].filter(Boolean);
  assert.equal(stacks.length, 2, 'two pickaxes are two stacks');
  assert.deepEqual(stacks.map((s) => s.count), [1, 1]);
});

test('addItem stops a sixteen-stack item at sixteen and opens a second stack', () => {
  const inv = new Inventory({ playClick() {} });
  inv.hotbar = new Array(9).fill(null);
  inv.storage = new Array(27).fill(null);
  assert.equal(inv.addItem('snowball', false, 20), true);
  const counts = [...inv.hotbar, ...inv.storage].filter(Boolean).map((s) => s.count).sort((a, b) => b - a);
  assert.deepEqual(counts, [16, 4], 'sixteen in the first stack and four in the next');
});

test('addItem still fills a sixty-four stack in one go', () => {
  const inv = new Inventory({ playClick() {} });
  inv.hotbar = new Array(9).fill(null);
  inv.storage = new Array(27).fill(null);
  assert.equal(inv.addItem('oak_planks', true, 64), true);
  assert.deepEqual([...inv.hotbar].filter(Boolean).map((s) => s.count), [64]);
  // The sixty-fifth needs a second slot rather than being refused or overfilling.
  assert.equal(inv.addItem('oak_planks', true, 1), true);
  assert.deepEqual([...inv.hotbar].filter(Boolean).map((s) => s.count), [64, 1]);
});

test('the slot-merge path respects the limit too', () => {
  // `handleSlotClick` had its own literal 64, so a drag could still build a stack of two pickaxes after
  // `addItem` was fixed. Driving it here covers the path a player actually uses.
  const inv = new Inventory({ playClick() {} });
  inv.hotbar = new Array(9).fill(null);
  inv.storage = new Array(27).fill(null);
  inv.hotbar[0] = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
  inv.cursorItem = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
  inv.handleSlotClick(inv.hotbar, 0, false, false);
  assert.equal(inv.hotbar[0].count, 1, 'the destination must not absorb a second pickaxe');
  assert.equal(inv.cursorItem?.count, 1, 'and the cursor keeps it');
});

test('a stackable item still merges on the slot path', () => {
  const inv = new Inventory({ playClick() {} });
  inv.hotbar = new Array(9).fill(null);
  inv.storage = new Array(27).fill(null);
  inv.hotbar[0] = { id: 'oak_planks', isBlock: true, count: 10 };
  inv.cursorItem = { id: 'oak_planks', isBlock: true, count: 5 };
  inv.handleSlotClick(inv.hotbar, 0, false, false);
  assert.equal(inv.hotbar[0].count, 15);
  assert.equal(inv.cursorItem, null);
});

test('the craft-result path respects the limit', () => {
  const inv = new Inventory({ playClick() {} });
  inv.craft2x2 = [{ id: 'oak_planks', isBlock: true, count: 1 }, null, null, null];
  inv.craft2x2Result = { id: 'oak_planks', isBlock: true, count: 4 };
  // 60 + 4 is exactly the limit, so this pickup fits; 63 + 4 would not, and is the next assertion.
  inv.cursorItem = { id: 'oak_planks', isBlock: true, count: 60 };
  inv.takeCraftResult(false);
  assert.equal(inv.cursorItem.count, 64, 'it fills exactly to the limit');

  // Now the cursor is full, so the next pickup must be refused rather than overflow.
  inv.craft2x2 = [{ id: 'oak_planks', isBlock: true, count: 1 }, null, null, null];
  inv.craft2x2Result = { id: 'oak_planks', isBlock: true, count: 4 };
  inv.takeCraftResult(false);
  assert.equal(inv.cursorItem.count, 64, 'a full cursor is left alone');

  // An unstackable result is refused into a cursor that already holds one.
  inv.cursorItem = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
  inv.craft2x2Result = { id: 'diamond_pickaxe', isBlock: false, count: 1 };
  inv.takeCraftResult(false);
  assert.equal(inv.cursorItem.count, 1, 'two pickaxes must not merge on the craft path either');
});

// --- no path may keep its own copy of the rule -------------------------------

test('no source file merges stacks to a literal 64 any more', () => {
  // The defect was never the rule; it was that five files each had their own copy of it. This is the
  // assertion that keeps a sixth from appearing, and it is deliberately a source scan: a merge site
  // that compiles and behaves almost correctly is what the whole batch was about.
  const offenders = [];
  for (const file of readdirSync(join(process.cwd(), 'src')).filter((n) => n.endsWith('.js'))) {
    const lines = readFileSync(join(process.cwd(), 'src', file), 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/count\s*<\s*64/.test(line) || /64\s*-\s*\w+\.count/.test(line) || /Math\.min\(\s*count\s*,\s*64\s*\)/.test(line)) {
        offenders.push(`${file}:${i + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, []);
});

test('the Inspector and the inventory agree, because they call the same function', () => {
  // Two copies of the rule drifted once already: the inventory merged to 64 while the Inspector
  // reported 1 for a tool. The Inspector's applied value now comes from stackLimitFor, so this checks
  // that the wiring exists rather than re-testing the arithmetic.
  const source = readFileSync(join(process.cwd(), 'src', 'resourceRegistry.js'), 'utf8');
  assert.match(source, /import \{[^}]*stackLimitFor[^}]*\} from '\.\/blocks\.js'/, 'the registry imports it');
  assert.match(source, /const applied = .*stackLimitFor\(entry\.id\)/s, 'and uses it for the applied value');
});
