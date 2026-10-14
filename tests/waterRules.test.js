// The water rules from https://minecraft.wiki/w/Water and https://minecraft.wiki/w/Swimming, pinned to the
// wiki's own figures. Each test names the sentence it checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UNDERWATER_FOG_COLOR, UNDERWATER_FOG, underwaterVisibility, underwaterFogColor,
  SWIM_SPEED, CURRENT_PUSH, sprintSwimSpeed, canSprintSwim, SWIMMING_HEIGHT,
  underwaterMiningMultiplier, waterEvaporates,
} from '../src/waterRules.js';
import { BLOCKS, BLOCK_DEFS } from '../src/blocks.js';
import { CRITICAL_ANGLE_DEGREES, WATER_ABSORPTION, WATER_IOR } from '../src/water.js';

const close = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// --- the view under water --------------------------------------------------------

test('the underwater fog colour is the wiki\'s Java default, #050533', () => {
  assert.equal(UNDERWATER_FOG_COLOR, 0x050533);
});

test('"Very dense at first, then transitions to a static distance over 30 seconds"', () => {
  const start = underwaterVisibility(0);
  const half = underwaterVisibility(15);
  const settled = underwaterVisibility(30);
  const later = underwaterVisibility(120);
  assert.equal(UNDERWATER_FOG.transitionSeconds, 30);
  assert.equal(start.clarity, 0, 'dense on entering');
  assert.equal(start.far, UNDERWATER_FOG.denseFar);
  assert.ok(half.far > start.far && half.far < settled.far, 'clearing in between');
  assert.equal(settled.clarity, 1, 'settled at thirty seconds');
  assert.equal(settled.far, UNDERWATER_FOG.settledFar);
  assert.deepEqual(later, settled, 'and static afterwards');
  for (let t = 0; t < 30; t += 1.5) {
    assert.ok(underwaterVisibility(t + 1.5).far >= underwaterVisibility(t).far, `never gets denser, at ${t}s`);
  }
});

test('Night Vision and Conduit Power improve visibility, at once', () => {
  for (const effect of [{ nightVision: true }, { conduitPower: true }]) {
    const view = underwaterVisibility(0, effect);
    assert.equal(view.clarity, 1, 'no dense phase');
    assert.ok(view.far > underwaterVisibility(30).far, 'and further than the plain settled view');
  }
});

test('the fog colour is #050533 at night and in the depths, lifted only by daylight near the surface', () => {
  const night = underwaterFogColor(0, 0);
  assert.deepEqual(night.map((c) => Math.round(c * 255)), [0x05, 0x05, 0x33], 'night: the wiki colour exactly');
  const deep = underwaterFogColor(1, 200);
  assert.deepEqual(deep.map((c) => Math.round(c * 255)), [0x05, 0x05, 0x33], 'deep water: the wiki colour');
  const shallowNoon = underwaterFogColor(1, 0);
  assert.ok(shallowNoon[2] > night[2] && shallowNoon[1] > night[1], 'brighter near the surface at noon');
  assert.ok(shallowNoon[2] > shallowNoon[0], 'still blue');
});

// --- moving through water -------------------------------------------------------

test('the swimming speeds are the Swimming article\'s', () => {
  assert.equal(SWIM_SPEED.surface, 2.2, '"Surface of still water: 2.20"');
  assert.equal(SWIM_SPEED.submerged, 1.97, '"Partially submerged: 1.97"');
  assert.equal(SWIM_SPEED.sprint, 3.918, '"Sprint-swimming: about 3.918 m/s"');
  assert.equal(SWIM_SPEED.sprintDepthStriderIII, 5.305, '"with Depth Strider III: 5.305 m/s"');
  assert.ok(close(SWIM_SPEED.sprint, 4.317 * 0.9076, 0.01), '"10% slower than walking"');
});

test('Depth Strider raises sprint-swimming from 3.918 to 5.305, in proportion, capped at III', () => {
  assert.equal(sprintSwimSpeed(0), 3.918);
  assert.ok(close(sprintSwimSpeed(3), 5.305));
  assert.ok(sprintSwimSpeed(1) > sprintSwimSpeed(0) && sprintSwimSpeed(2) > sprintSwimSpeed(1));
  assert.equal(sprintSwimSpeed(9), sprintSwimSpeed(3), 'capped');
  assert.equal(sprintSwimSpeed(-1), 3.918, 'a negative level is none');
  assert.equal(sprintSwimSpeed('nonsense'), 3.918);
  assert.ok(close(sprintSwimSpeed(3) / sprintSwimSpeed(0), 1.354, 0.001), '"35% faster than regular sprint-swimming"');
});

test('a current pushes at about 1.39 m/s: 25 blocks every 18 seconds', () => {
  assert.ok(close(CURRENT_PUSH, 25 / 18));
  assert.ok(close(CURRENT_PUSH, 1.39, 0.005));
});

test('sprint-swimming needs the sprint key and forward movement, more than 6 hunger and no Blindness', () => {
  const ok = { wantsSprint: true, movingForward: true, hunger: 20 };
  assert.equal(canSprintSwim(ok), true);
  assert.equal(canSprintSwim({ ...ok, wantsSprint: false }), false, 'no sprint key');
  assert.equal(canSprintSwim({ ...ok, movingForward: false }), false, 'not moving');
  assert.equal(canSprintSwim({ ...ok, hunger: 6 }), false, '"not possible at 6 hunger ... or below"');
  assert.equal(canSprintSwim({ ...ok, hunger: 7 }), true, 'possible at seven');
  assert.equal(canSprintSwim({ ...ok, blind: true }), false, '"or while Blindness is active"');
  assert.equal(canSprintSwim({ ...ok, hunger: 0, creative: true }), true, 'creative has no hunger to run out of');
});

test('a swimmer is one block tall, so a one-block gap fits them', () => {
  assert.ok(SWIMMING_HEIGHT < 1, 'shorter than a block');
  assert.ok(SWIMMING_HEIGHT > 0.5);
});

// --- mining under water ---------------------------------------------------------

test('mining is 5x slower with the head under water, 25x slower off the ground, and Aqua Affinity lifts the first', () => {
  assert.equal(underwaterMiningMultiplier({ headInWater: true, onGround: true }), 1 / 5, '"5x slower ... on the ground"');
  assert.equal(underwaterMiningMultiplier({ headInWater: true, onGround: false }), 1 / 25, '"25x slower when not on the ground"');
  assert.equal(underwaterMiningMultiplier({ headInWater: true, onGround: true, aquaAffinity: true }), 1, '"negating the penalty on the ground"');
  assert.equal(underwaterMiningMultiplier({ headInWater: true, onGround: false, aquaAffinity: true }), 1 / 5, '"still 5x slower off the ground"');
  assert.equal(underwaterMiningMultiplier({ headInWater: false, onGround: true }), 1, 'feet in water, head dry: no penalty');
});

// --- where water exists ----------------------------------------------------------

test('water poured in the Nether evaporates, and works normally in the End and the Overworld', () => {
  assert.equal(waterEvaporates('nether'), true);
  assert.equal(waterEvaporates('the_nether'), true);
  assert.equal(waterEvaporates('end'), false, '"it works normally in the End"');
  assert.equal(waterEvaporates('overworld'), false);
  assert.equal(waterEvaporates(null), false);
});

// --- the water block itself ------------------------------------------------------

test('the water block is a non-solid, see-through liquid that drops nothing', () => {
  const water = BLOCK_DEFS[BLOCKS.WATER];
  assert.equal(water.liquid, true);
  assert.equal(water.solid, false, 'nothing stands on it');
  assert.equal(water.transparent, true, 'Transparent: Partial');
  assert.equal(water.drop, null, 'breaking it gives nothing');
  assert.equal(water.hardness, 100, 'the wiki\'s 100, which also keeps it from being mined like a block');
});

test('water has the wiki\'s blast resistance of 100, so an explosion leaves it standing', async () => {
  const { blastResistanceFor, isDestroyedByExplosion } = await import('../src/blockHarvestData.js');
  assert.equal(blastResistanceFor(BLOCKS.WATER), 100);
  for (const roll of [0, 0.5, 0.999]) {
    assert.equal(isDestroyedByExplosion(BLOCKS.WATER, undefined, () => roll), false, `TNT roll ${roll}`);
  }
});

// --- the optics the shader is built on -------------------------------------------

test('the surface bends light with water\'s index, which puts the edge of Snell\'s window at 48.6 degrees', () => {
  assert.equal(WATER_IOR, 1.333);
  assert.ok(close(CRITICAL_ANGLE_DEGREES, 48.6, 0.05));
});

test('water absorbs red first and blue last, which is what turns the depths navy', () => {
  assert.ok(WATER_ABSORPTION.x > WATER_ABSORPTION.y && WATER_ABSORPTION.y > WATER_ABSORPTION.z);
  const kept = (k, blocks) => Math.exp(-k * blocks);
  assert.ok(kept(WATER_ABSORPTION.z, 8) > 0.5, 'more than half the blue survives eight blocks');
  assert.ok(kept(WATER_ABSORPTION.x, 8) < 0.1, 'almost no red does');
});
