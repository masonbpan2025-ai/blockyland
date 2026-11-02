// The Item and Block Inspector showcase scenarios for the recipe book, beds in the Nether and the End, and the
// two-block sunflower (src/resourceGameplayScenarios.js), run here as the showcase runs them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOCKS } from '../src/blocks.js';
import { gameplayScenarios, bookEntryFor } from '../src/resourceGameplayScenarios.js';
import { getScenariosForResource } from '../src/resourceShowcaseScenarios.js';

const run = (entry) => gameplayScenarios(entry).map((s) => ({ id: s.id, ok: s.verify.call(s), detail: s.detail }));

test('a craftable item shows its tab, what unlocks it, and that the book fills the grid', () => {
  const results = run({ id: 'wooden_pickaxe', blockId: null });
  assert.deepEqual(results.map((r) => r.id), ['recipe-book-tab-01', 'recipe-book-unlock-01', 'recipe-book-fill-01']);
  assert.ok(results.every((r) => r.ok), JSON.stringify(results));
  assert.ok(run({ id: BLOCKS.STONE_BRICKS, blockId: BLOCKS.STONE_BRICKS }).every((r) => r.ok));
  assert.equal(bookEntryFor({ id: 'ender_pearl', blockId: null }), null, 'an ender pearl has no crafting recipe to show');
});

test('every bed explodes in the Nether and in the End', () => {
  for (const id of ['red_bed', 'white_bed', 'black_bed']) {
    const beds = run({ id, blockId: null }).filter((r) => r.id.startsWith('bed-explodes'));
    assert.equal(beds.length, 2, id);
    assert.ok(beds.every((r) => r.ok), `${id}: ${JSON.stringify(beds)}`);
  }
});

test('the sunflower shows its two halves', () => {
  const results = run({ id: BLOCKS.SUNFLOWER, blockId: BLOCKS.SUNFLOWER }).filter((r) => r.id.startsWith('sunflower'));
  assert.equal(results.length, 2);
  assert.ok(results.every((r) => r.ok));
});

test('the showcase includes them after each resource\'s own scenarios', () => {
  const ids = getScenariosForResource({ entry: { id: 'red_bed', blockId: null, name: 'Red Bed' }, session: {} }).map((s) => s.id);
  assert.ok(ids.includes('bed-explodes-nether') && ids.includes('recipe-book-fill-01'));
});

test('an anvil falls in the inspection world: it lands on the block below, hurts a player 4 for 3 blocks, may wear', async () => {
  const { ResourceInspectionWorld } = await import('../src/resourceBehaviorShowcase.js');
  const { anvilScenarios } = await import('../src/resourceGameplayScenarios.js');
  for (const [name, worn] of [['ANVIL', 'CHIPPED_ANVIL'], ['CHIPPED_ANVIL', 'DAMAGED_ANVIL'], ['DAMAGED_ANVIL', 'AIR']]) {
    const session = new ResourceInspectionWorld(BLOCKS[name]);
    const steps = anvilScenarios({ id: name.toLowerCase(), blockId: BLOCKS[name] }, session);
    assert.deepEqual(steps.map((s) => s.id), ['anvil-fall-01', 'anvil-fall-02', 'anvil-fall-03']);
    let sawItFalling = false;
    for (const step of steps) {
      step.enter();
      assert.equal(session.world.getVoxel(8, 5, 8), BLOCKS[name], `${step.id}: starts 3 blocks up`);
      for (let t = 0; t < step.duration; t += 1 / 30) {
        step.update(1 / 30);
        // Its falling form is drawn while it falls, in the scene the inspector shows.
        session.game.scene.traverse((o) => { if (o.name === 'falling blocks' && o.visible && o.count > 0) sawItFalling = true; });
      }
      assert.ok(step.verify.call(step), `${name} ${step.id}: ${step.detail}`);
      step.exit();
      assert.equal(session.world.getVoxel(8, 2, 8), BLOCKS[name], 'the block on show is put back');
      assert.equal(session.game.scene.children.length, 0, 'the falling-block layer is removed');
    }
    assert.ok(sawItFalling, `${name}: the falling anvil is drawn`);
    assert.match(steps[2].label, new RegExp(worn === 'AIR' ? 'breaks' : worn.split('_').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ')));
  }
  const ids = getScenariosForResource({ entry: { id: 'anvil', blockId: BLOCKS.ANVIL, name: 'Anvil' }, session: new ResourceInspectionWorld(BLOCKS.ANVIL) }).map((s) => s.id);
  assert.ok(ids.includes('anvil-fall-01'), 'the Block Inspector showcase runs it');
  assert.ok(!getScenariosForResource({ entry: { id: 'sand', blockId: BLOCKS.SAND, name: 'Sand' }, session: {} }).some((s) => s.id.startsWith('anvil')));
});
