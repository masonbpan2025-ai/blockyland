// Zombies and skeletons burn in sunlight unless something is over them (wiki: Zombie, Skeleton). Light level alone
// was not enough: sky light leaks in sideways, so a zombie under a small roof still caught fire. The sun needs open
// sky now (Java's canSeeSky): any block overhead is shelter.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { canSeeSky } from '../src/mobEnvironment.js';
import { createMobDebugSession } from '../src/mobDebugSession.js';
import { universalScenarios } from '../src/mobBehaviorScenarios.js';
import { BLOCKS } from '../src/blocks.js';
import { readFileSync } from 'node:fs';

test('canSeeSky: open air yes, any block above no', () => {
  const blocks = new Map();
  const world = { maxHeight: 64, getVoxel: (x, y, z) => blocks.get(`${x},${y},${z}`) ?? 0 };
  assert.equal(canSeeSky(world, 0.5, 2, 0.5), true);
  blocks.set('0,40,0', BLOCKS.GLASS);
  assert.equal(canSeeSky(world, 0.5, 2, 0.5), false, 'glass is a roof too');
  assert.equal(canSeeSky(world, 1.5, 2, 0.5), true, 'the next column is open');
});

function burnFor(type, { roof }) {
  const session = createMobDebugSession(new THREE.Scene());
  session.world.dimension = 'overworld';
  const mob = session.reset(type);
  session.manager.game.worldTime = 6000;
  session.manager.game.isDaytime = true;
  session.world.dimension = 'overworld';
  if (roof) for (let x = -8; x <= 8; x++) for (let z = -8; z <= 8; z++) session.world.setVoxel(x, 4, z, BLOCKS.OAK_PLANKS);
  for (let t = 0; t < 3; t += 0.1) session.tick(0.1);
  return { burning: !!mob.isBurning, hurt: mob.health < mob.maxHealth };
}

for (const type of ['zombie', 'skeleton']) {
  test(`a ${type} in the noon sun catches fire; under a roof it does not`, () => {
    const open = burnFor(type, { roof: false });
    assert.ok(open.burning && open.hurt, `in the open: ${JSON.stringify(open)}`);
    const sheltered = burnFor(type, { roof: true });
    assert.deepEqual(sheltered, { burning: false, hurt: false });
  });
}

test('the Mob Inspector showcase checks the roof too', () => {
  for (const type of ['zombie', 'skeleton', 'zombie_villager', 'stray', 'drowned']) {
    assert.ok(universalScenarios(type, new Set()).some((c) => c.id === 'daylight_shaded'), `${type} has the shaded scenario`);
  }
  assert.ok(!universalScenarios('husk', new Set()).some((c) => c.id === 'daylight_shaded'), 'the husk never burns');
  // Named for what they show, and they can be watched: the mob holds still in view, the roof is small enough to draw.
  const [sun, shade] = ['daylight_burn', 'daylight_shaded'].map((id) => universalScenarios('zombie', new Set()).find((c) => c.id === id));
  assert.match(sun.label, /^Sun: catches fire/);
  assert.match(shade.label, /^Shade: protected from the sun under a roof/);
  assert.equal(typeof sun.update, 'function', 'it holds the mob where the camera looks');
  const session = createMobDebugSession(new THREE.Scene());
  session.reset('zombie');
  shade.setup(session);
  assert.ok(session.world.edits.size <= 256, 'the Inspector draws up to 256 blocks');
  const page = readFileSync(new URL('../src/mobDebug.js', import.meta.url), 'utf8');
  assert.match(page, /function syncSky\(\)/, 'the sky turns to day or night with the scenario\'s clock');
  assert.match(page, /else if\(report\.id&&session\.world\.edits\.size\)\{syncArena\(\);frameWithArena\(\);\}/, 'the roof is framed with the mob');
  assert.match(page, /'·  🔥 burning'|' · 🔥 burning'/);
});
