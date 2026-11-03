// The beacon's beam: when it shows, what stops it, how stained glass colours it, and that the game finds and draws it.
//
// Wiki (https://minecraft.wiki/w/Beacon § Beam): "A vertical beam appears from a beacon if the beacon is activated,
// extending up 2048 blocks from the beacon block. Beacon beams deactivate if they ever intersect any fully opaque
// block excluding bedrock". Colours: "The first or bottom most glass block sets the beam color, while each additional
// block sets the color by averaging the red, green, and blue components of the current beam color and the block's
// color. The color values are the same as those for the corresponding dye" -- red #b02e26, blue #3c44a0, and so on.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS } from '../src/blocks.js';
import { World } from '../src/world.js';
import { beaconBeam, beaconColumn } from '../src/beaconConduit.js';
import { BeaconBeamRenderer, BeaconFinder } from '../src/beaconBeamRenderer.js';
import { ResourceInspectionWorld } from '../src/resourceBehaviorShowcase.js';
import { beaconScenarios } from '../src/resourceGameplayScenarios.js';

/** A small world: a beacon at (0, 10, 0) on a 3x3 iron layer (unless `pyramid` is false), and `above` over it. */
function beaconWorld({ pyramid = true, above = {} } = {}) {
  const voxels = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  const world = { getVoxel: (x, y, z) => voxels.get(key(x, y, z)) ?? BLOCKS.AIR, setVoxel: (x, y, z, id) => voxels.set(key(x, y, z), id) };
  world.setVoxel(0, 10, 0, BLOCKS.BEACON);
  if (pyramid) for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) world.setVoxel(x, 9, z, BLOCKS.IRON_BLOCK);
  for (const [dy, id] of Object.entries(above)) world.setVoxel(0, 10 + Number(dy), 0, id);
  return world;
}
const beam = (options) => beaconBeam(beaconWorld(options), 0, 10, 0);
const RED = [0xb0, 0x2e, 0x26], BLUE = [0x3c, 0x44, 0xa0], YELLOW = [0xfe, 0xd8, 0x3d], WHITE = [255, 255, 255];

test('an activated beacon shows one white beam, 2048 blocks up from the beacon', () => {
  const b = beam();
  assert.ok(b, 'a beam');
  assert.deepEqual(b.segments, [{ from: 10, to: 10 + 2048, color: WHITE }]);
});

test('no pyramid, no beam; and choosing a power is not needed for one', () => {
  assert.equal(beam({ pyramid: false }), null);
  // The beacon here was never given a power: the beam is what makes choosing one possible.
  assert.ok(beam());
  // A beam needs a beacon.
  const world = beaconWorld(); world.setVoxel(0, 10, 0, BLOCKS.IRON_BLOCK);
  assert.equal(beaconBeam(world, 0, 10, 0), null);
});

test('a fully opaque block anywhere above stops it; bedrock, glass, leaves and other see-through blocks do not', () => {
  for (const id of [BLOCKS.STONE, BLOCKS.DIRT, BLOCKS.OAK_PLANKS]) assert.equal(beam({ above: { 20: id } }), null, `blocked by ${id}`);
  for (const id of [BLOCKS.BEDROCK, BLOCKS.GLASS, BLOCKS.OAK_LEAVES, BLOCKS.ICE, BLOCKS.BEACON]) assert.ok(beam({ above: { 20: id } }), `not blocked by ${id}`);
  assert.equal(beaconColumn(beaconWorld({ above: { 7: BLOCKS.STONE } }), 0, 10, 0).blockedAt, 17);
});

test('the first stained glass sets the colour from that block up; each one after averages with it', () => {
  // One red glass, 3 up: white to it, red from it.
  assert.deepEqual(beam({ above: { 3: BLOCKS.RED_STAINED_GLASS } }).segments, [{ from: 10, to: 13, color: WHITE }, { from: 13, to: 2058, color: RED }]);
  // Then blue: the average of the two.
  const s = beam({ above: { 3: BLOCKS.RED_STAINED_GLASS, 6: BLOCKS.BLUE_STAINED_GLASS } }).segments;
  assert.deepEqual(s.at(-1), { from: 16, to: 2058, color: [(0xb0 + 0x3c) / 2, (0x2e + 0x44) / 2, (0x26 + 0xa0) / 2] });
  // The wiki's formula, C = (c0 + c1 + 2 c2) / 4 for three, a pane counting as glass: the latest weighs most.
  const three = beam({ above: { 1: BLOCKS.RED_STAINED_GLASS, 2: BLOCKS.BLUE_STAINED_GLASS_PANE, 3: BLOCKS.YELLOW_STAINED_GLASS } }).segments.at(-1).color;
  assert.deepEqual(three, RED.map((c, i) => (c + BLUE[i] + 2 * YELLOW[i]) / 4));
  // Another of the same colour changes nothing, so no new segment; plain glass does not tint.
  assert.equal(beam({ above: { 2: BLOCKS.RED_STAINED_GLASS, 4: BLOCKS.RED_STAINED_GLASS, 6: BLOCKS.GLASS } }).segments.length, 2);
});

test('the game finds beacons by looking in its chunks, wherever they came from, and forgets broken ones', () => {
  const world = new World(7);
  const finder = new BeaconFinder();
  world.setVoxel(5, 30, -20, BLOCKS.BEACON);
  world.setVoxel(-17, 12, 3, BLOCKS.BEACON);
  const found = finder.scan(world).map(({ x, y, z }) => `${x},${y},${z}`).sort();
  assert.deepEqual(found, ['-17,12,3', '5,30,-20']);
  world.setVoxel(5, 30, -20, BLOCKS.AIR);
  assert.deepEqual(finder.scan(world), [{ x: -17, y: 12, z: 3 }]);
});

test('the renderer draws a beam over a lit beacon, recolours it with the glass, and takes it away when blocked', () => {
  const world = beaconWorld();
  const scene = new THREE.Scene(), beams = new BeaconBeamRenderer(scene), at = [{ x: 0, y: 10, z: 0 }];
  beams.update(0.016, world, at);
  assert.equal(beams.drawn.length, 1);
  const meshes = []; beams.group.traverse((o) => { if (o.userData.beaconBeam) meshes.push(o); });
  assert.equal(meshes.length, 2, 'a core and its glow');
  const box = new THREE.Box3().setFromObject(beams.group);
  assert.ok(box.min.y <= 10.01 && box.max.y >= 10 + 2047, 'from the beacon up 2048 blocks');
  assert.ok(Math.abs((box.min.x + box.max.x) / 2 - 0.5) < 0.01 && box.max.x - box.min.x < 0.75, 'a narrow column over the middle of the block');

  world.setVoxel(0, 13, 0, BLOCKS.RED_STAINED_GLASS);
  beams.update(0, world, at, { force: true });
  assert.equal(beams.drawn[0].segments.length, 2, 'redrawn in two colours');
  world.setVoxel(0, 20, 0, BLOCKS.STONE);
  beams.update(0, world, at, { force: true });
  assert.equal(beams.drawn.length, 0);
  assert.equal(beams.group.children.length, 0, 'and its meshes gone');
  beams.dispose();
});

test('the Block Inspector\'s beacon scenarios all hold in its own preview world', () => {
  const session = new ResourceInspectionWorld(BLOCKS.BEACON);
  const steps = beaconScenarios({ blockId: BLOCKS.BEACON }, session);
  assert.equal(steps.length, 7);
  for (const step of steps) {
    step.enter();
    step.update(0.1);
    const ok = step.verify.call(step);
    assert.ok(ok, `${step.label} -- ${step.detail}`);
    step.exit();
  }
  assert.equal(session.game.scene.children.length, 0, 'every scenario takes its beam away again');
  assert.deepEqual(beaconScenarios({ blockId: BLOCKS.STONE }, session), [], 'only the beacon has them');
});

test('the core of the beam is solid and the sheath faint, neither added to what is behind them', () => {
  // Wiki (Beacon, History, 12w38a): the beam "has been changed from a semi-transparent smooth beam (which conflicted
  // with water transparency), to a pattern with 0% transparency". A beam blended onto the background changed colour
  // with it (white on sky, cyan on water) and, out of the depth buffer, let the land behind be drawn over it.
  const beams = new BeaconBeamRenderer(new THREE.Scene());
  beams.update(0, beaconWorld(), [{ x: 0, y: 10, z: 0 }], { force: true });
  const meshes = []; beams.group.traverse((o) => { if (o.userData.beaconBeam) meshes.push(o); });
  const [core, sheath] = [...meshes].sort((a, b) => a.geometry.parameters.radiusTop - b.geometry.parameters.radiusTop);
  assert.equal(core.material.transparent, false, 'the core is opaque');
  assert.equal(core.material.depthWrite, true, 'and hides what is behind it');
  for (const m of [core.material, sheath.material]) assert.equal(m.blending, THREE.NormalBlending, 'nothing is added to the background');
  assert.ok(sheath.material.transparent && sheath.material.opacity < 0.2, 'the sheath is a faint glow');
  beams.dispose();
});

test('far off, the beam is drawn wider so it stays visible; close by, it is its own width', () => {
  // Wiki (Beacon, History, 1.21.5): "Beacon beams now appear thicker when further away so that they remain visible."
  const beams = new BeaconBeamRenderer(new THREE.Scene()), world = beaconWorld(), at = [{ x: 0, y: 10, z: 0 }];
  const width = (x) => { const camera = { position: { x, y: 10, z: 0.5 } }; beams.update(0.016, world, at, { camera, force: true }); return new THREE.Box3().setFromObject(beams.group).getSize(new THREE.Vector3()).x; };
  const near = width(10), far = width(500);
  assert.ok(near < 0.75, `close by, under a block wide: ${near}`);
  assert.ok(far > near * 4, `500 blocks off, several times wider: ${far}`);
  beams.dispose();
});
