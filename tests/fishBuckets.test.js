// Fish buckets: the six bucketable mobs, and the two interactions that make them.
//
// They were the largest cluster in the "vanilla item name(s) absent" report -- seven of the seventy-six, the
// other six being engine work (a map, a spyglass, a bundle) or block art (the creeper head, the corals). The
// game already had every piece: a bucket, water, and cod, salmon, pufferfish, tropical fish, axolotl and
// tadpole as mobs. What it did not have was the item, so the interaction had nowhere to land.
//
// Vanilla's rule is asymmetric and that is all of it: a **water bucket** on a fish catches it, and the **fish
// bucket** on a water block releases it. So the two halves are separate functions, and this file checks both
// directions plus the round trip between them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { ITEMS, stackLimitFor } from '../src/blocks.js';
import {
  FISH_BUCKETS, WATER_BUCKET_CATCHES, BUCKET_STACK_SIZE, catchFish, fishBucketFor, isFishBucket, releaseFish,
} from '../src/fishBuckets.js';
import { INTERACTION_ITEMS } from '../src/interactionSources.js';

const BUCKETS = Object.keys(FISH_BUCKETS);

test('every fish bucket is an item that holds one thing', () => {
  assert.equal(BUCKETS.length, 6, 'vanilla has six bucketable mobs');
  for (const bucket of BUCKETS) {
    const def = ITEMS[bucket];
    assert.ok(def, `${bucket} should be an item`);
    assert.equal(def.stackSize, BUCKET_STACK_SIZE, 'a bucket holds one thing, so it does not stack');
    assert.equal(stackLimitFor(bucket), 1, 'and the stack limit agrees');
    assert.equal(def.isBlock, undefined, 'a bucket is not placed');
    assert.equal(existsSync(`public/assets/items/${bucket}.png`), true, `${bucket} has no icon`);
  }
  // The empty bucket and the liquid buckets are unchanged: this batch adds mob buckets, not buckets.
  for (const old of ['bucket', 'water_bucket', 'lava_bucket', 'milk_bucket']) {
    assert.ok(ITEMS[old], `${old} should still be an item`);
  }
});

test('a water bucket catches a fish, and nothing else does', () => {
  for (const [bucket, mob] of Object.entries(FISH_BUCKETS)) {
    assert.equal(catchFish({ id: 'water_bucket' }, mob), bucket, `${mob} should be caught into ${bucket}`);
  }
  // The negatives, which are the point of an explicit function rather than a lookup at the call site.
  assert.equal(catchFish({ id: 'bucket' }, 'cod'), null, 'an empty bucket catches nothing');
  assert.equal(catchFish({ id: 'lava_bucket' }, 'cod'), null, 'nor does lava');
  assert.equal(catchFish({ id: 'cod_bucket' }, 'cod'), null, 'nor a bucket that is already full');
  assert.equal(catchFish({ id: 'water_bucket' }, 'cow'), null, 'and a cow is not bucketable');
  assert.equal(catchFish(null, 'cod'), null, 'nothing in hand catches nothing');
  assert.equal(fishBucketFor('cow'), null);
});

test('a fish bucket releases its mob into water, and gives back an empty bucket', () => {
  for (const [bucket, mob] of Object.entries(FISH_BUCKETS)) {
    const released = releaseFish({ id: bucket });
    assert.deepEqual(released, { mob, replacement: 'bucket' }, `${bucket} should release a ${mob}`);
  }
  assert.equal(releaseFish({ id: 'bucket' }), null, 'an empty bucket holds no mob');
  assert.equal(releaseFish({ id: 'milk_bucket' }), null, 'and neither does milk');
  assert.equal(releaseFish(null), null);
});

test('the two directions agree, so a bucket can always be refilled', () => {
  // The invariant that makes the pair coherent: whatever a bucket releases, a water bucket catches again.
  for (const bucket of BUCKETS) {
    const { mob } = releaseFish({ id: bucket });
    assert.equal(catchFish({ id: 'water_bucket' }, mob), bucket, `${bucket} should round-trip`);
    assert.equal(isFishBucket({ id: bucket }), true);
  }
  assert.equal(WATER_BUCKET_CATCHES.cod, 'cod_bucket', 'and the reverse map is the same map');
  assert.equal(isFishBucket({ id: 'water_bucket' }), false);
  assert.equal(isFishBucket({ id: 'cod' }), false);
});

test('the Inspector is told where each bucket comes from', () => {
  // Every bucket is in the interaction table, so `has-source` counts it and the report can say how. That
  // table's own test calls the named source and checks the item comes out, which is what stops this being a
  // comment about behaviour that does not exist.
  for (const bucket of BUCKETS) {
    assert.ok(INTERACTION_ITEMS.includes(bucket), `${bucket} is not in INTERACTION_ITEMS`);
  }
});

test('the rules are wired in, not merely written', () => {
  // A deliberate wiring check. These two functions are only real if something calls them: an item with a rule
  // in a module nobody imports is an item that does nothing, which is the failure mode this whole series has
  // been trying to avoid. Source text is the right thing to measure here.
  const main = readFileSync('src/main.js', 'utf8');
  assert.match(main, /catchFish\(/, 'the catch rule is never called');
  assert.match(main, /releaseFish\(/, 'the release rule is never called');
  assert.match(main, /spawnMob\(release\.mob/, 'and the release spawns the mob it names');
  // Every mob a bucket names is one the mob manager can spawn.
  const mobs = readFileSync('src/mobs.js', 'utf8');
  for (const mob of Object.values(FISH_BUCKETS)) {
    assert.match(mobs, new RegExp(`case '${mob}':`), `${mob} is not a spawnable mob type`);
  }
});
