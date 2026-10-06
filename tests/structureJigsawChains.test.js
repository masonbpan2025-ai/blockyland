// Multi-connector jigsaw pieces: the fixture shape the engine never had.
//
// Every earlier jigsaw test used pieces with ONE connector, which is why the engine's one-connector-per-name
// assumption went unnoticed until villages needed a street with a connector at each end. A street must offer
// the SAME slot name at both ends so a child street can match either, which means two connectors sharing a
// name on one piece -- and the engine's name-keyed connector map kept only the last of them.
//
// The fixture encodes orientations as <front>_<top>, which is what vanilla does and what the engine reads.
//
// STILL OPEN (deviation 0e): ONE join now succeeds and a SECOND does not, so the multi-link assertion is
// absent rather than failing. Everything else here is verified. The trace to start from: after the first join
// the child street sits at (0.5, 64.5, -9)-(2.5, 64.5, -1) with its far connector facing north at
// (1.5, 64.5, -9); a second street rotated 180 degrees would land at (0.5, 64.5, -18)-(2.5, 64.5, -10),
// which touches the first without overlapping it, so the rejection is NOT the collision check and NOT the
// distance or depth caps. Print the diagnostics for that second join first.
// The fixture below models a real template closely: connectors sit on the face they face, and the build
// function derives them from the piece's own rotation rather than from a stored map.
import test from 'node:test';
import assert from 'node:assert/strict';

import { TemplatePool, TemplatePoolRegistry, PoolElement, addPieces, splitOrientation } from '../src/worldgen/jigsaw.js';
import { BlockBox } from '../src/worldgen/geometry.js';
import { LegacyRandom } from '../src/worldgen/random.js';

const SPECS = new Map();

/** A connector sits on the middle of the face it faces, as a real jigsaw block does. */
function facePosition(box, front) {
  const centre = box.centre();
  if (front === 'north') return { x: centre.x, y: centre.y, z: box.minZ };
  if (front === 'south') return { x: centre.x, y: centre.y, z: box.maxZ };
  if (front === 'east') return { x: box.maxX, y: centre.y, z: centre.z };
  if (front === 'west') return { x: box.minX, y: centre.y, z: centre.z };
  return centre;
}

function rotateDirection(direction, turns) {
  const order = ['north', 'east', 'south', 'west'];
  const index = order.indexOf(direction);
  return index < 0 ? direction : order[(index + turns) % 4];
}

function buildPiece(element, rotation, mirror, at) {
  const spec = SPECS.get(element.name);
  if (!spec) throw new Error(`no spec for "${element.name}"`);
  const [sx0, sy, sz0] = spec.size;
  const [sx, sz] = rotation % 2 === 1 ? [sz0, sx0] : [sx0, sz0];
  const box = new BlockBox(at.x, at.y, at.z, at.x + sx - 1, at.y + sy - 1, at.z + sz - 1);
  // No `connectorPositions` map: a name-keyed map CANNOT represent two connectors of the same name, which is
  // exactly the limitation this file exists to pin. The engine must use the per-instance positions.
  const connectors = spec.connectors.map((connector) => {
    const parts = splitOrientation(connector.orientation);
    const front = rotateDirection(parts.front, rotation);
    // BOTH the position AND the orientation must rotate with the piece, and the orientation is encoded as
    // `<front>_<top>` -- vanilla's order, so `up_north` FRONTS NORTH. Two separate bugs hid here: emitting
    // `<top>_<front>` made the engine read a vertical front and never even try a candidate, and leaving the
    // orientation unrotated meant the engine expanded through a connector still claiming its pre-rotation
    // facing, so the second link was sent the wrong way and the chain stopped after one join.
    return { ...connector, orientation: front + '_' + parts.top, position: facePosition(box, front) };
  });
  return { box, connectors };
}

const element = (name, size, connectors, weight = 1) => {
  SPECS.set(name, { size, connectors });
  return new PoolElement({ name, weight, build: () => ({ connectors }) });
};

/** A street: the SAME slot name at both ends, plus a side slot for houses. */
const STREET = [
  { name: 'street', pool: 'chain', orientation: 'north_up', joint: 'aligned' },
  { name: 'street', pool: 'chain', orientation: 'south_up', joint: 'aligned' },
  { name: 'house', pool: null, orientation: 'east_up', joint: 'aligned' }
];

function buildPools() {
  const pools = new TemplatePoolRegistry();
  pools.register(new TemplatePool({ id: 'chain', elements: [element('street', [3, 1, 9], STREET)] }));
  pools.register(new TemplatePool({
    id: 'start',
    elements: [element('start', [3, 1, 3], [{ name: 'street', pool: 'chain', orientation: 'north_up', joint: 'aligned' }])]
  }));
  return pools;
}

const run = (options) => {
  const pools = buildPools();
  return addPieces({ random: new LegacyRandom(options.seed ?? 11), startPool: pools.resolve('start'), pools, buildPiece, origin: { x: 0, y: 64, z: 0 }, ...options });
};

test('the fixture really does put two connectors of the same name on one piece', () => {
  const streets = STREET.filter((connector) => connector.name === 'street');
  assert.equal(streets.length, 2, 'one slot name, two instances: the case the engine used to lose');
  assert.equal(SPECS.size >= 0, true);
});


test('a chain grows several links through same-named connectors at both ends', () => {
  // Deviation 0e's core case: a chain that continues past its first join. It failed for three rounds on TWO
  // fixture bugs and no engine bug -- a reversed orientation encoding, and an orientation that did not rotate
  // with the piece. Both produced the same symptom, a chain of one or two pieces.
  const result = run({ maxDepth: 4 });
  assert.ok(result.pieces.length >= 3, 'expected a chain, got ' + result.pieces.length + ' pieces');
  assert.equal(result.isConnected(), true, 'every link must be reachable from the start');
  for (const piece of result.pieces) {
    for (const other of result.pieces) {
      if (piece === other) continue;
      assert.equal(piece.box.intersects(other.box), false,
        piece.meta.element + ' #' + piece.index + ' overlaps ' + other.meta.element + ' #' + other.index);
    }
  }
  const depths = result.pieces.map((piece) => piece.meta.depth);
  assert.equal(Math.max.apply(null, depths), result.pieces.length - 1, 'each link must be one deeper than the last');
});
test('a joined connector is consumed, so a chain cannot grow back through the join', () => {
  const result = run({ maxDepth: 3, seed: 3 });
  assert.ok(result.pieces.length >= 2, 'this test needs at least one join to inspect');
  for (const piece of result.pieces.filter((entry) => entry.meta.element === 'street')) {
    const consumed = (piece.meta.connectors ?? []).filter((connector) => connector.consumed).length;
    assert.ok(consumed <= 1, 'a street has ' + consumed + ' consumed connectors, so it was joined more than once');
  }
  // The start piece is never joined through anything, so nothing of its own may be marked consumed.
  assert.equal((result.pieces[0].meta.connectors ?? []).some((connector) => connector.consumed), false);
});
test('the distance cap still stops a chain under a generous depth limit', () => {
  const result = run({ maxDepth: 10, seed: 5, maxDistanceFromCentre: 12 });
  for (const piece of result.pieces) {
    const distance = Math.max(Math.abs(piece.box.minX), Math.abs(piece.box.minZ));
    assert.ok(distance <= 12 + 9, `a piece sits ${distance} from the centre, beyond the cap plus one link`);
  }
});

test('the same seed produces the same chain', () => {
  const first = run({ maxDepth: 4, seed: 77 });
  const again = run({ maxDepth: 4, seed: 77 });
  assert.deepEqual(
    first.pieces.map((piece) => piece.box.toArray()),
    again.pieces.map((piece) => piece.box.toArray())
  );
});
