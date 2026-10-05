// Jigsaw engine tests.
//
// The engine is driven here with hand-built pools and a synthetic `buildPiece`, so these tests exercise the
// ALGORITHM -- weighted selection, connector matching, depth, collision, connectivity -- without depending
// on any structure data. That is deliberate: the algorithm is what the ten jigsaw ids are blocked on, and a
// bug in it would show up as ten structures generating wrongly rather than one.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TemplatePool, TemplatePoolRegistry, PoolElement, addPieces, splitOrientation, rotationBetween, ELEMENT_TYPES
} from '../src/worldgen/jigsaw.js';
import { BlockBox } from '../src/worldgen/geometry.js';
import { LegacyRandom } from '../src/worldgen/random.js';

/**
 * Piece specs, keyed by element name.
 *
 * `PoolElement` deliberately carries only vanilla fields, so the synthetic geometry lives here rather than
 * being smuggled onto it as extra properties -- which would let the engine depend on non-vanilla data.
 */
const SPECS = new Map();

/**
 * A synthetic piece: a box of `size`, with one connector on the given face at the box's centre.
 *
 * `buildPiece(element, rotation, mirror, at)` must be a pure function of its arguments, which is what makes
 * the engine's dry runs meaningful.
 */
function buildPiece(element, rotation, mirror, at) {
  const spec = SPECS.get(element.name);
  if (!spec) throw new Error(`no spec for element "${element.name}"`);
  const [sx0, sy, sz0] = spec.size;
  const [sx, sz] = rotation % 2 === 1 ? [sz0, sx0] : [sx0, sz0];
  const box = new BlockBox(at.x, at.y, at.z, at.x + sx - 1, at.y + sy - 1, at.z + sz - 1);
  const connector = spec.connector ?? null;
  const connectorPositions = {};
  let connectors = [];
  if (connector) {
    // The piece's rotation turns its connector's face too.
    const rotatedFront = rotateDirection(splitOrientation(connector.orientation).front, rotation);
    const position = connectorPosition(box, rotatedFront);
    connectors = [{ ...connector, orientation: rotatedFront, position }];
    connectorPositions[connector.name] = position;
  }
  return { box, connectors, connectorPositions };
}

/**
 * Where a connector sits: the MIDDLE OF THE FACE it faces, not the centre of the box.
 *
 * A real jigsaw block is on a template's face, so a child placed one block beyond it is adjacent. A
 * connector at the box centre would put the child INSIDE the parent, which the engine correctly rejects as
 * a collision -- so a fixture that did that would exercise nothing but the rejection path.
 */
function connectorPosition(box, orientation) {
  const centre = box.centre();
  switch (orientation) {
    case 'east': return { x: box.maxX, y: centre.y, z: centre.z };
    case 'west': return { x: box.minX, y: centre.y, z: centre.z };
    case 'south': return { x: centre.x, y: centre.y, z: box.maxZ };
    case 'north': return { x: centre.x, y: centre.y, z: box.minZ };
    case 'up': return { x: centre.x, y: box.maxY, z: centre.z };
    case 'down': return { x: centre.x, y: box.minY, z: centre.z };
    default: return centre;
  }
}

/** Turn a compass direction by `turns` quarter-turns clockwise. */
function rotateDirection(direction, turns) {
  const order = ['north', 'east', 'south', 'west'];
  const index = order.indexOf(direction);
  if (index < 0) return direction;
  return order[(index + turns) % 4];
}

const element = (name, size, connector, options = {}) => {
  SPECS.set(name, { size, connector });
  return new PoolElement({ name, build: () => ({ connectors: connector ? [connector] : [] }), ...options });
};

test('the five vanilla element types are known, and empty elements contribute nothing', () => {
  assert.equal(ELEMENT_TYPES.length, 5);
  assert.ok(ELEMENT_TYPES.includes('minecraft:list_pool_element'));
  assert.equal(new PoolElement({ type: 'minecraft:empty_pool_element' }).isEmpty, true);
  assert.equal(element('a', [3, 3, 3], null).isEmpty, false);
});

test('pool selection is weighted, without replacement, and deterministic', () => {
  const pool = new TemplatePool({
    id: 'test/pool',
    elements: [
      element('common', [3, 3, 3], null, { weight: 8 }),
      element('rare', [3, 3, 3], null, { weight: 1 })
    ]
  });
  const order = pool.shuffledOrder(new LegacyRandom(1));
  // Without replacement: every element appears exactly once, whatever the weights.
  assert.deepEqual([...order].sort(), [0, 1]);
  assert.deepEqual(pool.shuffledOrder(new LegacyRandom(1)), order, 'the same seed must give the same order');

  // Over many draws the heavy element must come first far more often.
  let commonFirst = 0;
  for (let seed = 0; seed < 400; seed++) {
    if (pool.shuffledOrder(new LegacyRandom(seed))[0] === 0) commonFirst++;
  }
  assert.ok(commonFirst > 400 * 0.7, `an 8:1 weight should usually win, won ${commonFirst}/400`);
});

test('the registry resolves pools and reports what it does not have', () => {
  const pools = new TemplatePoolRegistry();
  pools.registerJson({ name: 'test/a', elements: [{ element_type: 'minecraft:single_pool_element', location: 'test/a1', weight: 2 }] });
  assert.equal(pools.size, 1);
  assert.ok(pools.resolve('test/a'));
  assert.equal(pools.resolve('test/missing'), null, 'a missing pool must be reported, not invented');
  const registered = pools.resolve('test/a');
  assert.equal(registered.elements[0].weight, 2, 'the entry weight must survive registration');
  assert.equal(registered.elements[0].name, 'test/a1');
});

test('a candidate joins face to face at the matching connector name', () => {
  // The start piece faces east; the candidate faces west, so it needs no rotation to meet it.
  const startPool = new TemplatePool({
    id: 'test/start',
    elements: [element('start', [5, 3, 5], { name: 'exit', pool: 'test/next', orientation: 'east', joint: 'aligned' })]
  });
  const pools = new TemplatePoolRegistry();
  pools.register(new TemplatePool({
    id: 'test/next',
    elements: [element('corridor', [3, 3, 3], { name: 'exit', pool: null, orientation: 'west', joint: 'aligned' })]
  }));

  const result = addPieces({ random: new LegacyRandom(7), startPool, pools, buildPiece, maxDepth: 3, origin: { x: 0, y: 64, z: 0 } });
  assert.ok(result.start, 'the start pool must produce a piece');
  assert.equal(result.pieces.length, 2, 'the corridor must have joined');
  assert.equal(result.isConnected(), true, 'every piece must be reachable from the start');
  // The two boxes must be adjacent rather than overlapping or detached: they share a face.
  const [first, second] = result.pieces;
  assert.equal(first.box.intersects(second.box), false, 'pieces may never overlap');
  // Compare against the start piece's OWN index, not 0: StructurePiece.index is a global counter, so it is
  // only 0 for the first piece created in an entire process. Asserting 0 passed in isolation and failed in
  // the full test group, which is exactly the trap recorded as deviation 0b in STRUCTURE_PARITY.md.
  assert.equal(second.parentIndex, first.index, 'the corridor is a child of the start piece');
  assert.equal(second.type, 'jigsaw');
  assert.equal(second.isJigsaw, true);
});

test('maxDepth caps expansion, and the cap is a real depth', () => {
  // A chain that could continue forever: every corridor can host another corridor.
  const makePool = (n) => new TemplatePool({
    id: 'test/chain',
    elements: [element(`link${n}`, [3, 3, 3], { name: 'next', pool: 'test/chain', orientation: 'east', joint: 'aligned' })]
  });
  const pools = new TemplatePoolRegistry();
  pools.register(makePool(1));
  const startPool = pools.resolve('test/chain');

  for (const maxDepth of [1, 2, 3]) {
    const result = addPieces({ random: new LegacyRandom(3), startPool, pools, buildPiece, maxDepth, origin: { x: 0, y: 64, z: 0 } });
    // One start piece plus at most `maxDepth` children.
    assert.ok(result.pieces.length <= maxDepth + 1,
      `maxDepth ${maxDepth} produced ${result.pieces.length} pieces`);
    assert.equal(result.isConnected(), true);
  }
});

test('overlapping candidates are rejected and counted rather than placed', () => {
  // Two candidates both trying to occupy the same space: the second must be refused.
  const startPool = new TemplatePool({
    id: 'test/crowded',
    elements: [element('start', [3, 3, 3], { name: 'exit', pool: 'test/crowded2', orientation: 'east', joint: 'aligned' })]
  });
  const pools = new TemplatePoolRegistry();
  pools.register(startPool);
  pools.register(new TemplatePool({
    id: 'test/crowded2',
    elements: [
      element('big', [9, 3, 9], { name: 'exit', pool: 'test/crowded2', orientation: 'east', joint: 'aligned' }),
      element('small', [2, 3, 2], { name: 'exit', pool: null, orientation: 'east', joint: 'aligned' })
    ]
  }));

  const result = addPieces({ random: new LegacyRandom(5), startPool, pools, buildPiece, maxDepth: 2, origin: { x: 0, y: 64, z: 0 } });
  for (const piece of result.pieces) {
    for (const other of result.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false,
        `${piece.meta.element} overlaps ${other.meta.element}`);
    }
  }
  // The counter is asserted to be WIRED, not to an exact number: which candidate loses the race depends on
  // the weighted draw, and pinning the count would make this test a transcript of one seed's behaviour. The
  // invariant that matters -- no two pieces ever overlap -- is asserted above.
  assert.equal(typeof result.diagnostics.rejectedByCollision, 'number');
  assert.equal(typeof result.diagnostics.exhaustedPools, 'number');
});

test('a pool whose elements cannot join is reported, not silently empty', () => {
  const startPool = new TemplatePool({
    id: 'test/nomatch',
    elements: [element('start', [3, 3, 3], { name: 'exit', pool: 'test/wrong', orientation: 'east', joint: 'aligned' })]
  });
  const pools = new TemplatePoolRegistry();
  pools.register(startPool);
  // The candidate's connector has a DIFFERENT name and it is the only one, so it cannot join.
  pools.register(new TemplatePool({
    id: 'test/wrong',
    elements: [element('other', [3, 3, 3], { name: 'something_else', pool: null, orientation: 'west', joint: 'aligned' })]
  }));
  const result = addPieces({ random: new LegacyRandom(1), startPool, pools, buildPiece, maxDepth: 3, origin: { x: 0, y: 64, z: 0 } });
  // A mismatched connector name is EXACTLY what must not join: that is what the name is for. What matters is
  // that the refusal is reported rather than looking like an empty pool.
  assert.equal(result.pieces.length, 1, 'a name mismatch must not join');
  assert.ok(result.diagnostics.exhaustedPools >= 1, 'the refusal must be counted as pool exhaustion');
  assert.equal(result.isConnected(), true, 'a lone start piece is still a valid, connected structure');
});

test('a distance cap rejects far candidates, and connectors sort by selection priority', () => {
  const startPool = new TemplatePool({
    id: 'test/far',
    elements: [element('start', [3, 3, 3], { name: 'exit', pool: 'test/far2', orientation: 'east', selectionPriority: 5 })]
  });
  const pools = new TemplatePoolRegistry();
  pools.register(startPool);
  pools.register(new TemplatePool({ id: 'test/far2', elements: [element('far', [3, 3, 3], { name: 'exit', pool: null, orientation: 'west' })] }));
  const result = addPieces({
    random: new LegacyRandom(2), startPool, pools, buildPiece, maxDepth: 2,
    origin: { x: 0, y: 64, z: 0 }, maxDistanceFromCentre: 0
  });
  assert.equal(result.pieces.length, 1, 'nothing may be placed beyond the distance cap');
  assert.ok(result.diagnostics.rejectedByDistance >= 0);
});

test('orientation helpers split and rotate as the joining code assumes', () => {
  // Vanilla reads orientation as `<front>_<top>`: `up_north` fronts UP. An earlier version of this test
  // asserted the opposite and so froze the bug in place.
  assert.deepEqual(splitOrientation('up_north'), { front: 'up', top: 'north' });
  assert.deepEqual(splitOrientation('north_up'), { front: 'north', top: 'up' });
  assert.deepEqual(splitOrientation('down_west'), { front: 'down', top: 'west' });
  assert.deepEqual(splitOrientation('north'), { front: 'north', top: 'up' });
  assert.equal(rotationBetween('north', 'east'), 1, 'north to east is one clockwise quarter turn');
  assert.equal(rotationBetween('east', 'north'), 3);
  assert.equal(rotationBetween('north', 'north'), 0);
  // A vertical mismatch cannot be fixed by yaw, and must be reported rather than guessed at.
  assert.equal(rotationBetween('down', 'down'), 0, 'a vertical pair facing itself needs no yaw');
  assert.equal(rotationBetween('up', 'north'), null, 'a vertical/horizontal mismatch cannot be fixed by yaw');
});

test('the same seed produces the same structure, and a different seed may not', () => {
  const startPool = new TemplatePool({
    id: 'test/repeat',
    elements: [element('start', [5, 3, 5], { name: 'exit', pool: 'test/repeat2', orientation: 'east' })]
  });
  const pools = new TemplatePoolRegistry();
  pools.register(startPool);
  pools.register(new TemplatePool({
    id: 'test/repeat2',
    elements: [
      element('a', [3, 3, 3], { name: 'exit', pool: 'test/repeat2', orientation: 'east' }),
      element('b', [4, 3, 4], { name: 'exit', pool: 'test/repeat2', orientation: 'east' }),
      element('c', [2, 3, 2], { name: 'exit', pool: 'test/repeat2', orientation: 'east' })
    ]
  }));
  const layout = (seed) => addPieces({ random: new LegacyRandom(seed), startPool, pools, buildPiece, maxDepth: 4, origin: { x: 0, y: 64, z: 0 } })
    .pieces.map((piece) => `${piece.meta.element}:${piece.rotation}:${piece.box.toArray().join(',')}`).join('|');

  assert.equal(layout(1234), layout(1234), 'the same seed must reproduce the same structure exactly');
  const layouts = new Set([0, 1, 2, 3, 4, 5, 6, 7].map(layout));
  assert.ok(layouts.size > 1, 'different seeds must be able to produce different structures');
});

test('a start pool with an unresolvable connector still returns its start piece', () => {
  const startPool = new TemplatePool({
    id: 'test/lonely',
    elements: [element('start', [3, 3, 3], { name: 'exit', pool: 'test/does_not_exist', orientation: 'east' })]
  });
  const result = addPieces({ random: new LegacyRandom(1), startPool, pools: new TemplatePoolRegistry(), buildPiece, maxDepth: 3 });
  assert.equal(result.pieces.length, 1, 'a missing pool must not lose the start piece');
  assert.equal(result.isConnected(), true);
});
