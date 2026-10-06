// The route to the End.
//
// Before this, there was no route. `END_PORTAL_FRAME` was not a block, `ender_eye` had **zero** references
// anywhere in `src/` outside the registry, and the `endPortal: true` flag on the portal block was read by
// nothing -- so an eye could be brewed, held, and never used. The dragon arena, the End dimension and the
// exit portal already existed; only the way in was missing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BLOCKS, ITEMS, BLOCK_DEFS } from '../src/blocks.js';
import {
  END_PORTAL_FRAMES, frameRingOffsets, interiorOffsets, isFrame, isFilledFrame, isEndPortal,
  insertEye, isRingComplete, eyesInRing, activateEndPortal, tryActivateAround, portalDestination,
  portalArrival, isStandingInEndPortal, buildEndPlatform, buildEndPortalRoom, buildFrameRing,
  enderEyeThrowVelocity, bearingToPortal, bearingName, ENDER_EYE_RISE, ENDER_EYE_SPEED,
} from '../src/endPortal.js';

/** A world backed by a Map, which is all these functions touch. */
function world() {
  const cells = new Map();
  return {
    getVoxel: (x, y, z) => cells.get(`${x},${y},${z}`) ?? 0,
    setVoxel: (x, y, z, id) => cells.set(`${x},${y},${z}`, id),
    cells,
  };
}

// --- the content ------------------------------------------------------------------

test('the frame is a real block in both states, and an item', () => {
  // The first missing link. `END_PORTAL_FRAME` simply was not a block.
  assert.equal(typeof BLOCKS.END_PORTAL_FRAME, 'number');
  assert.equal(typeof BLOCKS.END_PORTAL_FRAME_FILLED, 'number');
  assert.notEqual(BLOCKS.END_PORTAL_FRAME, BLOCKS.END_PORTAL_FRAME_FILLED);
  assert.ok(BLOCK_DEFS[BLOCKS.END_PORTAL_FRAME], 'the empty frame needs a definition');
  assert.ok(BLOCK_DEFS[BLOCKS.END_PORTAL_FRAME_FILLED], 'and so does the filled one');
  assert.equal(BLOCK_DEFS[BLOCKS.END_PORTAL_FRAME_FILLED].filled, true, 'the state has to be readable');
  assert.ok(ITEMS.end_portal_frame, 'and it must be holdable');
  assert.equal(ITEMS.end_portal_frame.blockId, BLOCKS.END_PORTAL_FRAME);
  // The new ids must not collide. Asserted for THESE ids rather than for every id: the registry has four
  // deliberate aliases already (`GRASS`/`GRASS_BLOCK`, `RED_BED`/`RED_BED_FOOT`, `WHEAT`/`WHEAT_STAGE_7`,
  // `CARROTS`/`CARROTS_STAGE_3`), so a blanket uniqueness check fails on correct data. That was the first
  // version of this assertion.
  for (const [name, id] of [['END_PORTAL_FRAME', BLOCKS.END_PORTAL_FRAME],
    ['END_PORTAL_FRAME_FILLED', BLOCKS.END_PORTAL_FRAME_FILLED]]) {
    const collisions = Object.entries(BLOCKS).filter(([k, v]) => v === id && k !== name);
    assert.deepEqual(collisions.map(([k]) => k), [], name + ' collides with ' + collisions.map(([k]) => k));
  }
});

test('the frame reuses art that already exists, which is why it needed no textures', () => {
  // The measurement in section 4.1.1 separates "needs code" from "needs art". This block was the code case:
  // `end_stone.png` is already on disk.
  const texture = BLOCK_DEFS[BLOCKS.END_PORTAL_FRAME].textures.all;
  assert.equal(texture, 'end_stone.png');
  const fs = readFileSync(new URL(`../public/assets/blocks/${texture}`, import.meta.url));
  assert.ok(fs.length > 0, 'and the file it names must be non-empty');
});

test('the eye of ender is craftable from its vanilla ingredients', () => {
  // Without a recipe the route stops one step earlier: no eyes, no portal.
  const recipes = readFileSync(new URL('../src/extraRecipes.js', import.meta.url), 'utf8');
  const i = recipes.indexOf("id:'ender_eye'");
  assert.ok(i > 0, 'an ender_eye recipe should exist');
  const entry = recipes.slice(Math.max(0, i - 200), i + 20);
  assert.ok(entry.includes('ender_pearl'), 'from an ender pearl');
  assert.ok(entry.includes('blaze_powder'), 'and blaze powder');
});

// --- the layout -------------------------------------------------------------------

test('the ring is twelve frames and the interior is nine, in vanilla\'s shape', () => {
  const ring = frameRingOffsets();
  assert.equal(ring.length, END_PORTAL_FRAMES);
  assert.equal(END_PORTAL_FRAMES, 12);
  assert.equal(interiorOffsets().length, 9);
  // The shape itself, drawn out: a 5x5 border with the four corners missing.
  const asSet = new Set(ring.map(o => `${o.dx},${o.dz}`));
  const drawn = [];
  for (let dz = -2; dz <= 2; dz++) {
    let row = '';
    for (let dx = -2; dx <= 2; dx++) row += asSet.has(`${dx},${dz}`) ? 'F' : '.';
    drawn.push(row);
  }
  assert.deepEqual(drawn, ['.FFF.', 'F...F', 'F...F', 'F...F', '.FFF.']);
  // No duplicates, and no frame inside the interior.
  assert.equal(asSet.size, 12);
  for (const o of ring) assert.ok(Math.abs(o.dx) === 2 || Math.abs(o.dz) === 2);
});

test('the interior is exactly the three by three the portal fills', () => {
  const interior = interiorOffsets();
  assert.equal(interior.length, 9);
  for (const o of interior) {
    assert.ok(Math.abs(o.dx) <= 1 && Math.abs(o.dz) <= 1);
  }
});

test('frame classification is by id, and the two states differ', () => {
  assert.equal(isFrame(BLOCKS.END_PORTAL_FRAME), true);
  assert.equal(isFrame(BLOCKS.END_PORTAL_FRAME_FILLED), true);
  assert.equal(isFrame(BLOCKS.END_PORTAL), false);
  assert.equal(isFrame(BLOCKS.AIR), false);
  assert.equal(isFilledFrame(BLOCKS.END_PORTAL_FRAME_FILLED), true);
  assert.equal(isFilledFrame(BLOCKS.END_PORTAL_FRAME), false, 'an empty frame is not filled');
  assert.equal(isEndPortal(BLOCKS.END_PORTAL), true);
  assert.equal(isEndPortal(BLOCKS.END_PORTAL_FRAME), false);
});

// --- filling and lighting -----------------------------------------------------------

test('an eye goes into an empty frame and not into a filled one', () => {
  const w = world();
  w.setVoxel(0, 30, 0, BLOCKS.END_PORTAL_FRAME);
  assert.equal(insertEye(w, 0, 30, 0), true);
  assert.equal(w.getVoxel(0, 30, 0), BLOCKS.END_PORTAL_FRAME_FILLED);
  // A second eye on the same frame is refused, which is what stops a player wasting them.
  assert.equal(insertEye(w, 0, 30, 0), false);
  // And a frame has to be there in the first place.
  assert.equal(insertEye(w, 5, 30, 5), false);
  assert.equal(insertEye(null, 0, 30, 0), false, 'a missing world must not throw');
});

test('the portal needs all twelve eyes, not merely twelve frames', () => {
  const w = world();
  buildFrameRing(w, 0, 30, 0, 0);
  assert.equal(eyesInRing(w, 0, 30, 0), 0);
  assert.equal(isRingComplete(w, 0, 30, 0), false);
  assert.equal(activateEndPortal(w, 0, 30, 0), false, 'no eyes, no portal');
  // Eleven is not enough either.
  const offsets = frameRingOffsets();
  for (let i = 0; i < 11; i++) insertEye(w, offsets[i].dx, 30, offsets[i].dz);
  assert.equal(eyesInRing(w, 0, 30, 0), 11);
  assert.equal(isRingComplete(w, 0, 30, 0), false);
  assert.equal(activateEndPortal(w, 0, 30, 0), false);
  // The twelfth lights it.
  const last = offsets[11];
  insertEye(w, last.dx, 30, last.dz);
  assert.equal(isRingComplete(w, 0, 30, 0), true);
  assert.equal(activateEndPortal(w, 0, 30, 0), true);
  for (const { dx, dz } of interiorOffsets()) {
    assert.equal(w.getVoxel(dx, 30, dz), BLOCKS.END_PORTAL, 'every interior cell becomes portal');
  }
});

test('a ring with a hole in it does not light, however many eyes are present', () => {
  // Eleven frames all filled is not a portal: the shape is part of the requirement.
  const w = world();
  const offsets = frameRingOffsets();
  for (const o of offsets.slice(1)) {
    w.setVoxel(o.dx, 30, o.dz, BLOCKS.END_PORTAL_FRAME_FILLED);
  }
  assert.equal(eyesInRing(w, 0, 30, 0), 11);
  assert.equal(isRingComplete(w, 0, 30, 0), false);
  assert.equal(activateEndPortal(w, 0, 30, 0), false);
});

test('the ring lights from whichever frame the player clicked last', () => {
  // The caller knows the clicked frame, not the ring's centre, so the centre is found rather than assumed.
  const w = world();
  const offsets = frameRingOffsets();
  buildFrameRing(w, 40, 20, 60, 11);
  const last = offsets[11];
  const fx = 40 + last.dx;
  const fz = 60 + last.dz;
  assert.equal(insertEye(w, fx, 20, fz), true);
  assert.deepEqual(tryActivateAround(w, fx, 20, fz), { cx: 40, cy: 20, cz: 60 });
  // An incomplete ring lights nothing, from any frame.
  const w2 = world();
  buildFrameRing(w2, 0, 20, 0, 3);
  assert.equal(tryActivateAround(w2, 2, 20, 0), null);
});

// --- travelling ---------------------------------------------------------------------

test('the portal leads to the End and back, and nowhere else', () => {
  assert.equal(portalDestination('overworld'), 'the_end');
  assert.equal(portalDestination('the_end'), 'overworld');
  // The Nether has its own portal and this is not it; guessing would send the player somewhere wrong.
  assert.equal(portalDestination('nether'), null);
  assert.equal(portalDestination(undefined), null);
  assert.equal(portalDestination('something_else'), null);
  const arrival = portalArrival('the_end');
  assert.ok(Number.isFinite(arrival.x) && Number.isFinite(arrival.y) && Number.isFinite(arrival.z));
});

test('standing in the portal is detected at the feet and at eye level', () => {
  const w = world();
  const player = { position: { x: 0.5, y: 30, z: 0.5 }, eyeHeight: 1.62 };
  assert.equal(isStandingInEndPortal(w, player), false, 'nothing there yet');
  w.setVoxel(0, 30, 0, BLOCKS.END_PORTAL);
  assert.equal(isStandingInEndPortal(w, player), true, 'feet in the portal');
  // Eye level alone, as when the player is partly below it.
  const w2 = world();
  w2.setVoxel(0, 31, 0, BLOCKS.END_PORTAL);
  assert.equal(isStandingInEndPortal(w2, player), true, 'eye level in the portal');
  // A frame is not a portal, and neither is standing beside one.
  const w3 = world();
  w3.setVoxel(0, 30, 0, BLOCKS.END_PORTAL_FRAME);
  assert.equal(isStandingInEndPortal(w3, player), false);
  assert.equal(isStandingInEndPortal(w, { position: { x: 40, y: 30, z: 40 }, eyeHeight: 1.62 }), false);
  assert.equal(isStandingInEndPortal(null, player), false);
  assert.equal(isStandingInEndPortal(w, null), false);
});

// --- the chamber ---------------------------------------------------------------------

test('the chamber holds a ring, a floor, a roof and a way down', () => {
  const w = world();
  const r = buildEndPortalRoom(w, 100, 20, 200, { filledEyes: 2, radius: 7, surfaceY: 36 });
  assert.ok(r.placed > 400, 'a chamber is a substantial build, got ' + r.placed);
  assert.equal(r.filled, 2);
  assert.equal(eyesInRing(w, 100, 20, 200), 2, 'vanilla portals start partly filled');
  assert.equal(isRingComplete(w, 100, 20, 200), false, 'and are never complete on their own');
  // Floor beneath, clear at the frame layer, roof above.
  assert.equal(w.getVoxel(100, 19, 200), BLOCKS.STONE_BRICKS, 'floor under the centre');
  assert.equal(w.getVoxel(100, 20, 200), BLOCKS.AIR, 'the interior is not buried');
  assert.equal(w.getVoxel(100, 24, 200), BLOCKS.STONE_BRICKS, 'roof');
  assert.equal(w.getVoxel(107, 21, 200), BLOCKS.STONE_BRICKS, 'wall');
  // The shaft, which is what makes the chamber findable at all.
  assert.equal(w.getVoxel(100, 30, 200), BLOCKS.AIR, 'shaft above the roof');
  assert.equal(w.getVoxel(100, 35, 200), BLOCKS.AIR, 'and up to the surface');
  assert.equal(r.surfaceY, 36);
});

test('the chamber is walkable: its eyes can be completed and the portal lit', () => {
  // The end-to-end assertion. Everything above tests a part; this walks the route.
  const w = world();
  buildEndPortalRoom(w, 0, 20, 0, { filledEyes: 2, radius: 6, surfaceY: 34 });
  let inserted = 0;
  for (const { dx, dz } of frameRingOffsets()) inserted += insertEye(w, dx, 20, dz) ? 1 : 0;
  assert.equal(inserted, 10, 'the ten empty frames take the eyes the player brought');
  assert.equal(isRingComplete(w, 0, 20, 0), true);
  const lit = tryActivateAround(w, frameRingOffsets()[0].dx, 20, frameRingOffsets()[0].dz);
  assert.ok(lit, 'and the portal lights');
  // And the player can then stand in it.
  assert.equal(isStandingInEndPortal(w, { position: { x: 0.5, y: 20, z: 0.5 }, eyeHeight: 1.62 }), true);
});

test('a chamber with no surface below it still builds, without a shaft', () => {
  const w = world();
  const r = buildEndPortalRoom(w, 0, 20, 0, { filledEyes: 0, radius: 5, surfaceY: null });
  assert.equal(r.surfaceY, null, 'no shaft without a surface height');
  assert.equal(r.filled, 0);
  assert.equal(w.getVoxel(0, 20, -2), BLOCKS.END_PORTAL_FRAME, 'the ring is still there');
  // And a nonsense floor height is clamped rather than writing outside the world.
  assert.doesNotThrow(() => buildEndPortalRoom(w, 0, -100, 0, { radius: 5 }));
  assert.doesNotThrow(() => buildEndPortalRoom(w, 0, 999, 0, { radius: 5 }));
  // A missing world reports that nothing was built. It returns the same shape rather than null, so a caller
  // can read `.placed` unconditionally -- which is what the first version of this assertion got wrong.
  const nothing = buildEndPortalRoom(null, 0, 20, 0);
  assert.deepEqual(nothing, { placed: 0, filled: 0, surfaceY: null });
});

test('the End platform is laid only over air, and it is a disc', () => {
  // The arena builds crystals, pillars and a dragon but no ground, so arriving needs an island.
  const w = world();
  const placed = buildEndPlatform(w, 0, 32, 0, 4);
  assert.ok(placed > 40, 'a disc of end stone, got ' + placed);
  assert.equal(w.getVoxel(0, 32, 0), BLOCKS.END_STONE);
  assert.equal(w.getVoxel(4, 32, 0), BLOCKS.END_STONE, 'radius four is inside');
  assert.equal(w.getVoxel(4, 32, 4), 0, 'but the corner is outside the disc');
  // It must not carve into what is already there.
  w.setVoxel(1, 32, 0, BLOCKS.OBSIDIAN);
  buildEndPlatform(w, 0, 32, 0, 4);
  assert.equal(w.getVoxel(1, 32, 0), BLOCKS.OBSIDIAN, 'existing blocks are left alone');
  assert.equal(buildEndPlatform(null, 0, 32, 0), 0);
});

// --- the locator -----------------------------------------------------------------------

test('the eye is thrown at a fixed speed, along the bearing to the portal', () => {
  // Without this the chamber is a hole in the ground with no way to find it, so the route exists on paper
  // and not in play.
  const from = { x: 0, z: 0 };
  const cases = [
    [{ x: 0, z: -100 }, 'north', 0],
    [{ x: 100, z: 0 }, 'east', 90],
    [{ x: 0, z: 100 }, 'south', 180],
    [{ x: -100, z: 0 }, 'west', 270],
    [{ x: 70, z: -70 }, 'north-east', 45],
  ];
  for (const [target, name, degrees] of cases) {
    const v = enderEyeThrowVelocity(from, target);
    assert.ok(Math.abs(Math.hypot(v.x, v.z) - ENDER_EYE_SPEED) < 1e-9,
      name + ' should travel at the throw speed, got ' + Math.hypot(v.x, v.z));
    assert.equal(v.y, ENDER_EYE_RISE, name + ' should rise by the fixed amount');
    const bearing = bearingToPortal(from, target);
    assert.equal(Math.round(bearing), degrees, name + ' bearing');
    assert.equal(bearingName(bearing), name);
  }
});

test('the bearing is the same whatever the distance', () => {
  // The player reads a direction from the eye, not a range, so a far portal and a near one on the same
  // bearing must throw the same way.
  const from = { x: 12, z: -5 };
  const near = enderEyeThrowVelocity(from, { x: 22, z: -15 });
  const far = enderEyeThrowVelocity(from, { x: 1012, z: -1005 });
  assert.ok(Math.abs(near.x - far.x) < 1e-9 && Math.abs(near.z - far.z) < 1e-9);
});

test('a nonsense target throws straight up, and an absent one means the origin', () => {
  // Straight up is the NaN case: a target whose coordinates are not numbers has no bearing, and the throw
  // must not divide by a NaN length. The first version of this test asserted the same for an ABSENT target,
  // which is wrong -- `target.x ?? 0` reads a missing target as the origin, and that is a real direction.
  for (const target of [{ x: NaN, z: 0 }, { x: 0, z: NaN }, { x: 'east', z: 0 }]) {
    const v = enderEyeThrowVelocity({ x: 4, z: 4 }, target);
    assert.equal(v.x, 0, 'no horizontal direction for ' + JSON.stringify(target));
    assert.equal(v.z, 0);
    assert.equal(v.y, ENDER_EYE_RISE);
  }
  // An absent or empty target is the origin, so it has a bearing like anywhere else.
  for (const target of [null, undefined, {}]) {
    const v = enderEyeThrowVelocity({ x: 4, z: 4 }, target);
    assert.ok(Number.isFinite(v.x) && Number.isFinite(v.z), 'for ' + JSON.stringify(target));
    assert.ok(Math.hypot(v.x, v.z) > 0, 'and it points back toward the origin');
    assert.equal(v.y, ENDER_EYE_RISE);
  }
  // Directly overhead is the genuine no-direction case.
  assert.deepEqual(enderEyeThrowVelocity({ x: 5, z: 5 }, { x: 5, z: 5 }), { x: 0, y: ENDER_EYE_RISE, z: 0 });
});

test('a bearing with nothing to point at is null rather than a made-up direction', () => {
  assert.equal(bearingToPortal({ x: 0, z: 0 }, null), null);
  assert.equal(bearingToPortal({ x: 0, z: 0 }, { x: 0, z: 0 }), null, 'standing on it is not a bearing');
  assert.equal(bearingName(null), null);
  assert.equal(bearingName(NaN), null);
  // Wrapping: 360 and 0 are the same direction, and 350 rounds back to north.
  assert.equal(bearingName(360), 'north');
  assert.equal(bearingName(-10), 'north');
  assert.equal(bearingName(350), 'north');
});

test('the throw is wired into the use chain and the eyes are advanced', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /enderEyeThrowVelocity, bearingToPortal/, 'the helpers should be imported');
  assert.match(source, /this\.throwEnderEye\(\)/, 'and the throw should be called');
  assert.match(source, /this\.updateEnderEyes\(dt\)/, 'and the eyes advanced each frame');
  // The throw must come AFTER the frame branch, or aiming at a frame would throw instead of filling it.
  const frame = source.indexOf('if (isFrame(clickedBlock))');
  const thrown = source.indexOf("this.inventory.getActiveItem()?.id === 'ender_eye' && !this.targetBlock");
  assert.ok(frame > 0 && thrown > frame, 'the frame interaction must be tried first');
});

// --- the wiring ------------------------------------------------------------------------

test('the use chain fills a frame, lights the portal, and carries the player', () => {
  // Checked at the source because `main.js` needs most of an engine to drive. This proves the calls exist and
  // sit in the right branches, not that a specific click fills a specific frame.
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(source, /from '\.\/endPortal\.js'/, 'main should import the route');
  assert.match(source, /if \(isFrame\(clickedBlock\)\)/, 'the frame interaction should be in the use chain');
  assert.match(source, /insertEye\(this\.world, bX, bY, bZ\)/, 'and it should insert an eye');
  assert.match(source, /tryActivateAround\(this\.world, bX, bY, bZ\)/, 'and try to light the portal');
  assert.match(source, /this\.updateEndPortalTravel\(dt\)/, 'and the travel check should run each frame');
  assert.match(source, /buildEndPortalRoom\(this\.world, cx, floorY, cz/, 'and the chamber should be placed');
  assert.match(source, /buildEndPlatform\(this\.world/, 'and the arrival island laid');
  // The arena must be built once: a second call spawns a second dragon.
  assert.match(source, /if \(!this\.endArenaBuilt\)/, 'the arena build should be guarded');
  // A frame interaction must not fall through to placing the frame as a block.
  const interaction = source.slice(source.indexOf('if (isFrame(clickedBlock))'),
    source.indexOf('// Crafting Table interaction'));
  assert.match(interaction, /return;/, 'the frame branch must return');
});

test('the light is guarded so leaving and returning cannot spawn two dragons', () => {
  const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const i = source.indexOf('if (!this.endArenaBuilt)');
  assert.ok(i > 0);
  const after = source.slice(i, i + 200);
  assert.match(after, /this\.endArenaBuilt = true;/, 'the flag is set before the build');
  assert.match(after, /initEndArena\(\)/, 'and the arena is built inside the guard');
});
