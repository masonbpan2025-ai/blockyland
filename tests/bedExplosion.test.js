// A bed used in the Nether or the End explodes "with power 5 ... the explosion also creates fire" (wiki: Bed).
// It was a hand-made 3-block sphere; it is now the explosion creepers and TNT use, with fire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS } from '../src/blocks.js';
import { BED_EXPLOSION_POWER } from '../src/bed.js';
import { useBedIn } from '../src/resourceGameplayScenarios.js';
import { sleepingAllowedIn } from '../src/deathAndRespawn.js';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

for (const dimension of ['nether', 'the_end']) {
  test(`sleeping in ${dimension} explodes the bed: power 5, blocks broken, fire, the sleeper hurt`, () => {
    assert.equal(sleepingAllowedIn(dimension), false);
    const r = useBedIn(dimension);
    assert.equal(r.result.exploded, true);
    assert.equal(r.explosion.power, BED_EXPLOSION_POWER);
    assert.equal(BED_EXPLOSION_POWER, 5);
    assert.ok(r.explosion.broken > 50, `${r.explosion.broken} blocks broken`);
    assert.ok(r.fire > 0, `${r.fire} fires`);
    assert.ok(r.health < 20, 'three blocks away, it hurts');
    assert.equal(r.bedLeft, BLOCKS.AIR, 'the bed is gone');
  });
}

test('in the Overworld the same bed is slept in, not blown up', () => {
  const r = useBedIn('overworld');
  assert.notEqual(r.result.exploded, true);
  assert.equal(r.explosion, null);
});

test('it uses the shared explosion rules and effect; a charged respawn anchor outside the Nether comes here too', () => {
  const bed = read('src/bed.js');
  assert.match(bed, /const broken = explosionBlocks\(world, pos, power, random\);/);
  assert.match(bed, /const damage = explosionDamage\(power, d, difficulty\);/);
  assert.match(bed, /this\.game\.entities\?\.spawnExplosion\?\.\(pos, power\);/);
  assert.match(read('src/respawnAnchor.js'), /game\.bedManager\?\.explode\?\.\(x,y,z\)/);
});
