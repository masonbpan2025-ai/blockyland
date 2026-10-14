// The End's features: the ten spikes, the exit podium, the twenty gateways and the arrival platform. Cards ES/EP/EL
// run in tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  endSpikes, spikeColumns, buildPodium, buildGateway, gatewayOrder, regenerateEndPlatform, remapY,
  SPIKE_CENTRES, GATEWAY_SPOTS, GATEWAY_Y, PLATFORM
} from '../src/worldgen/generators/endFeatures.js';
import { CellCanvas } from '../src/worldgen/cellStructure.js';
import { portalArrival } from '../src/endPortal.js';
import { BLOCKS } from '../src/blocks.js';

test('spike cross-sections reproduce the wiki\'s obsidian totals', () => {
  const totals = { 3: [[76, 1596], [79, 1659], [82, 1722]], 4: [[85, 3145], [88, 3256], [91, 3367]], 5: [[94, 5358], [97, 5529], [100, 5700]], 6: [[103, 9167]] };
  for (const [r, list] of Object.entries(totals)) for (const [top, n] of list) assert.equal(spikeColumns(Number(r)).length * top, n, `radius ${r} to ${top}`);
});

test('the spike heights are shuffled per world over the fixed centres; two are caged; tops fit this End', () => {
  const orders = new Set();
  for (let s = 1; s <= 20; s++) {
    const spikes = endSpikes(s);
    orders.add(spikes.map((x) => x.vanillaTop).join());
    assert.deepEqual(spikes.map((x) => [x.x, x.z]), SPIKE_CENTRES);
    assert.equal(spikes.filter((x) => x.caged).length, 2);
    for (const x of spikes) assert.ok(x.top + (x.caged ? 4 : 1) <= 63);
  }
  assert.ok(orders.size > 10);
});

test('the gateways: twenty fixed spots 96 out, opened in a per-world order; each 12 bedrock and a gateway', () => {
  for (const [x, z] of GATEWAY_SPOTS) assert.ok(Math.abs(Math.hypot(x, z) - 96) < 1.5);
  const order = gatewayOrder(5);
  assert.equal(new Set(order.map((g) => `${g.x},${g.z}`)).size, 20);
  assert.equal(order[0].y, GATEWAY_Y);
  const c = new CellCanvas();
  buildGateway(c, 0, 40, 0);
  const cells = [...c.cells.values()];
  assert.equal(cells.filter((x) => x.name === 'bedrock').length, 12);
  assert.equal(cells.filter((x) => x.name === 'end_gateway').length, 1);
});

test('the podium: 16 rim bedrock over 16 End stone, a pillar with four torches; active with portal and egg', () => {
  const idle = new CellCanvas(); buildPodium(idle, 33);
  const cells = [...idle.cells.values()];
  assert.equal(cells.filter((x) => x.name === 'end_stone').length, 16);
  assert.equal(cells.filter((x) => x.name === 'end_portal').length, 0);
  const live = new CellCanvas(); buildPodium(live, 33, { active: true, egg: true });
  const lit = [...live.cells.values()];
  assert.equal(lit.filter((x) => x.name === 'end_portal').length, 20);
  assert.ok(lit.some((x) => x.name === 'dragon_egg' && x.x === 0 && x.z === 0));
});

test('arrival: on the platform at x 100, facing west; entering regenerates it and clears three layers', () => {
  const a = portalArrival('the_end');
  assert.deepEqual([a.x, a.y, a.z], [100.5, PLATFORM.y + 1, 0.5]);
  const voxels = new Map();
  const world = { setVoxel: (x, y, z, id) => voxels.set(`${x},${y},${z}`, id) };
  regenerateEndPlatform(world, BLOCKS);
  assert.equal(voxels.get(`100,${PLATFORM.y},0`), BLOCKS.OBSIDIAN);
  assert.equal(voxels.get(`100,${PLATFORM.y + 3},0`), BLOCKS.AIR);
  assert.equal(remapY(48), PLATFORM.y);
});
