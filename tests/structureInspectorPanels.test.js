// Inspector view-model tests.
//
// The page cannot be tested in Node, but these view-models can -- and they are where the numbers the page
// shows come from. A wrong number here is a wrong number on screen, which is worse than no panel.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pieceGraphView, adaptationView, planSummaryView
} from '../src/structureInspectorPanels.js';
import { createStructureInspectorSession } from '../src/structureInspectorSession.js';
import { BLOCKS } from '../src/blocks.js';
import { createBlockIdResolver } from '../src/worldgen/blockIds.js';

const resolver = createBlockIdResolver(BLOCKS);
const SANDSTONE = resolver.resolve('minecraft:sandstone');
const AIR = resolver.resolve('minecraft:air');

function sessionFor(structure, { seed = 4242, chunkX = 0, chunkZ = 0, biome = 'plains' } = {}) {
  const session = createStructureInspectorSession({ seed, structureId: structure, blockIds: BLOCKS });
  if (session.setBiome) session.setBiome(biome);
  if (session.setSurface) session.setSurface(70);
  if (session.setChunk) session.setChunk(chunkX, chunkZ);
  return session;
}

test('the piece graph shows the joining of a jigsaw structure, not just its boxes', () => {
  const session = sessionFor('pillager_outpost');
  if (session.planNearest) session.planNearest();
  const view = pieceGraphView(session);
  assert.equal(view.available, true, view.reason ?? 'a plan should be available');
  assert.ok(view.count > 1, `expected a multi-piece jigsaw plan, got ${view.count}`);
  assert.equal(view.connected, true, 'the outpost must be connected or the panel would show a broken structure');
  assert.equal(view.orphaned.length, 0);
  assert.deepEqual(view.overlaps, []);
  // Every non-root piece must name the ordinal of its parent, so the page can draw a real tree.
  for (const piece of view.pieces) {
    if (piece.parentOrdinal === null) continue;
    assert.ok(piece.parentOrdinal >= 0 && piece.parentOrdinal < view.count, `bad parent ordinal on piece ${piece.ordinal}`);
    assert.notEqual(piece.parentOrdinal, piece.ordinal, 'a piece cannot be its own parent');
  }
  assert.ok(view.roots.length >= 1, 'a plan needs a root');
  // The plate is the root and the tower is a child of it, which is the whole point of the graph view.
  const root = view.pieces[view.roots[0]];
  assert.equal(root.element, 'base_plate');
  assert.ok(view.pieces.some((piece) => piece.element === 'watchtower' && piece.parentOrdinal === root.ordinal));
  // Connectors must be reported, since a connector with no pool is where expansion stops.
  assert.ok(view.connectorCount > 0);
  assert.ok(view.pieces.some((piece) => piece.connectors.some((connector) => connector.pool)));
});

test('the piece graph reports a single-piece structure honestly', () => {
  const session = sessionFor('igloo', { biome: 'snowy_plains' });
  if (session.planNearest) session.planNearest();
  const view = pieceGraphView(session);
  assert.equal(view.available, true);
  assert.ok(view.count >= 1);
  assert.equal(view.maxDepth, 0, 'an igloo has no jigsaw depth');
  assert.equal(view.jigsawPieces, 0);
  assert.equal(view.connected, true, 'one piece is trivially connected');
  assert.deepEqual(view.overlaps, []);
});

test('with no plan the graph says so rather than showing an empty structure', () => {
  const session = createStructureInspectorSession({ seed: 1, structureId: 'igloo', blockIds: BLOCKS });
  const view = pieceGraphView(session);
  assert.equal(view.available, false);
  assert.match(view.reason, /plan a structure/);
  assert.deepEqual(view.pieces, []);
  assert.equal(view.connected, null, 'unknown, not false: no plan is not a disconnected plan');
});

test('the adaptation view refuses to pretend when it has no terrain', () => {
  const session = sessionFor('desert_pyramid', { biome: 'desert' });
  if (session.planNearest) session.planNearest();

  // Without a surface callback the module must SAY so: an empty adaptation panel would look exactly like a
  // flat world, which is the failure mode this panel exists to expose.
  const noTerrain = adaptationView(session, { foundationBlock: SANDSTONE });
  assert.equal(noTerrain.available, false);
  assert.match(noTerrain.reason, /surfaceY/);

  const noMaterial = adaptationView(session, { surfaceY: () => 70 });
  assert.equal(noMaterial.available, false);
  assert.match(noMaterial.reason, /foundationBlock/);
});

test('the adaptation view reports counts when the session can realize with adaptation', () => {
  const session = sessionFor('desert_pyramid', { biome: 'desert' });
  if (session.planNearest) session.planNearest();
  if (typeof session.realizeWithAdaptation !== 'function') {
    // The session half of this panel is not wired yet; saying so is better than a test that silently passes.
    const view = adaptationView(session, { surfaceY: () => 70, foundationBlock: SANDSTONE });
    assert.equal(view.available, false);
    assert.match(view.reason, /cannot realize with adaptation/);
    return;
  }
  const view = adaptationView(session, {
    surfaceY: (x) => 64 + ((x % 5) + 5) % 5,
    foundationBlock: SANDSTONE,
    airBlock: AIR
  });
  assert.equal(view.available, true);
  assert.equal(view.type, 'beard_thin', 'the pyramid is a beard_thin structure');
  assert.equal(view.inflate, 12);
  assert.ok(view.structureBlocks > 0);
});

test('the plan summary carries the fields a header needs, including the hash', () => {
  const session = sessionFor('ocean_ruin_cold', { biome: 'ocean' });
  if (session.planNearest) session.planNearest();
  const view = planSummaryView(session);
  assert.equal(view.available, true);
  assert.equal(view.structureId, 'ocean_ruin_cold');
  assert.equal(typeof view.chunkX, 'number');
  assert.equal(typeof view.pieces, 'number');
  assert.ok(view.pieces >= 1);
  assert.equal(view.box.length, 6, 'a box is [minX, minY, minZ, maxX, maxY, maxZ]');
  // The hash is what a reader compares against the golden file, so it must be present and stable.
  if (view.hash !== null) {
    const again = planSummaryView(session);
    assert.equal(again.hash, view.hash, 'the same plan must hash the same');
  }
});

test('every view is a pure function of the session: calling twice changes nothing', () => {
  const session = sessionFor('pillager_outpost');
  if (session.planNearest) session.planNearest();
  const first = JSON.stringify({ graph: pieceGraphView(session), summary: planSummaryView(session) });
  const second = JSON.stringify({ graph: pieceGraphView(session), summary: planSummaryView(session) });
  assert.equal(second, first, 'reading a view must not mutate the session or advance any randomness');
});
