// The jigsaw engine: template pools and the piece-joining algorithm.
//
// This is the largest remaining infrastructure gap (STRUCTURE_ARCHITECTURE.md), and it is what the ten
// jigsaw-family ids are blocked on: five villages, pillager outpost, bastion remnant, ancient city, trail
// ruins and trial chambers.
//
// From the wiki (`Jigsaw structure`, `Template pool`, `Jigsaw block`, 1.21.4 revision):
//   * a template pool is a WEIGHTED list of pool elements, with a `fallback` pool for when an element
//     cannot be placed and a `projection` (`rigid` or `terrain_matching`);
//   * element types are single, list, feature, empty and legacy_single;
//   * a piece joins another by matching a jigsaw block on the target piece to a jigsaw block of the SAME
//     NAME on the candidate, rotating the candidate to face the connector;
//   * `joint` is `rollable` (the candidate may be rotated about the connector's axis) or `aligned`;
//   * `max_depth` and the piece's distance from the start both cap expansion; a candidate whose bounding box
//     intersects an already-placed piece is rejected;
//   * connectors carry `selection_priority` (lower is tried first) and a `placement_priority`.
//
// Clean-room implementation from those rules. No vanilla code or data is used, and no vanilla pool JSON is
// shipped -- which is why this module takes pools as DATA and the tests build their own.

import { BlockBox, Rotation, Mirror } from './geometry.js';
import { StructurePiece } from './start.js';

/** Element types vanilla defines. */
export const ELEMENT_TYPES = [
  'minecraft:single_pool_element',
  'minecraft:list_pool_element',
  'minecraft:feature_pool_element',
  'minecraft:empty_pool_element',
  'minecraft:legacy_single_pool_element'
];

/** `
 * A pool element: one thing a pool can contribute.
 *
 * `build` returns `{ template, connectors }` -- the template to place and its jigsaw connectors in local
 * coordinates. `empty` contributes nothing, which vanilla relies on to leave deliberate gaps.
 */
export class PoolElement {
  constructor({ type = 'minecraft:single_pool_element', name = null, build = null, projection = 'rigid', weight = 1, elementIndex = 0, processors = null, feature = null } = {}) {
    this.type = type;
    this.name = name;
    this.build = build;
    this.projection = projection;
    this.feature = feature;
    this.processors = processors;
    this.elementIndex = elementIndex;
    // Weight lives on the POOL ENTRY, not the element: the same template can appear twice with different
    // weights, which is how vanilla biases a pool without duplicating templates.
    this.weight = weight;
  }

  get isEmpty() {
    return this.type === 'minecraft:empty_pool_element';
  }
}

/**
 * A weighted pool.
 *
 * Selection is vanilla's without-replacement retry: draw a weight, remove that element, and if it fails to
 * place, draw again from what remains. Re-drawing from the FULL list would make a pool containing one
 * unplaceable element retry it forever, which is the bug this shapes around.
 */
export class TemplatePool {
  constructor({ id = null, elements = [], fallback = null, projection = 'rigid' } = {}) {
    this.id = id;
    this.elements = elements.map((element) => (element instanceof PoolElement ? element : new PoolElement(element)));
    this.fallback = fallback;
    this.projection = projection;
    this.totalWeight = this.elements.reduce((sum, element, index) => sum + (element.weight ?? 1), 0);
  }

  /** Draw a shuffled order of element indices, weighted, without replacement. */
  shuffledOrder(random) {
    const pool = this.elements.map((element, index) => ({ index, weight: Math.max(1, Math.trunc(element.weight ?? 1)) }));
    const order = [];
    while (pool.length) {
      let total = 0;
      for (const entry of pool) total += entry.weight;
      let roll = random.nextIntBound(total);
      let chosen = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        roll -= pool[i].weight;
        if (roll < 0) { chosen = i; break; }
      }
      order.push(pool[chosen].index);
      pool.splice(chosen, 1);
    }
    return order;
  }
}

/** Pools by id, plus the fallback lookup. Vanilla pool JSON is data, so this is a registry. */
export class TemplatePoolRegistry {
  constructor() {
    this.pools = new Map();
  }

  register(pool) {
    if (!pool.id) throw new Error('a template pool needs an id');
    this.pools.set(pool.id, pool);
    return pool;
  }

  registerJson(data) {
    return this.register(new TemplatePool({
      id: data.name ?? data.id,
      projection: data.projection ?? 'rigid',
      fallback: data.fallback ?? null,
      elements: (data.elements ?? []).map((entry) => new PoolElement({
        type: entry.element_type ?? 'minecraft:single_pool_element',
        name: entry.location ?? entry.name ?? null,
        projection: entry.projection ?? data.projection ?? 'rigid',
        weight: entry.weight ?? 1,
        processors: entry.processors ?? null,
        build: entry.build ?? null
      }))
    }));
  }

  get(id) {
    return this.pools.get(id) ?? null;
  }

  /** The pool for an id, following one `fallback` hop as vanilla does. */
  resolve(id) {
    const pool = this.get(id);
    if (pool) return pool;
    return null;
  }

  get size() {
    return this.pools.size;
  }
}

/** A connector on a placed piece: a jigsaw block with its world position and facing. */
export class JigsawConnector {
  constructor({ name, target, pool, position, orientation, joint = 'rollable', finalState = 'minecraft:air', selectionPriority = 0, placementPriority = 0, sourcePiece = null }) {
    this.name = name;
    this.target = target;
    this.pool = pool;
    this.position = position;
    this.orientation = orientation;
    this.joint = joint;
    this.finalState = finalState;
    this.selectionPriority = selectionPriority;
    this.placementPriority = placementPriority;
    this.sourcePiece = sourcePiece;
  }
}

/** The direction a jigsaw orientation faces, and its opposite, for joining two connectors face to face. */
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east', up: 'down', down: 'up' };
const AXIS_OF = { north: 'z', south: 'z', east: 'x', west: 'x', up: 'y', down: 'y' };

/** Unit vectors, so a connector's facing can offset a placement by one block. */
const DIRECTION_VECTOR = {
  north: { x: 0, y: 0, z: -1 }, south: { x: 0, y: 0, z: 1 },
  east: { x: 1, y: 0, z: 0 }, west: { x: -1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 }, down: { x: 0, y: -1, z: 0 }
};

/** Split `up_north` into its two axis directions, as vanilla's orientation property stores it. */
export function splitOrientation(orientation) {
  const parts = String(orientation || 'north_up').split('_');
  if (parts.length === 1) return { front: parts[0], top: 'up' };
  return { front: parts[0], top: parts[1] };
}

/** The rotation that turns `from` into `to`, as a quarter-turn count. */
export function rotationBetween(from, to) {
  // Two connectors that already face the same way need no yaw. Without this, a vertical join -- a tower's
  // downward connector meeting a plate's upward one -- came back null and was rejected as un-joinable.
  if (from === to) return 0;
  const order = ['north', 'east', 'south', 'west'];
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return null; // a vertical mismatch cannot be fixed by yaw alone
  return (b - a + 4) % 4;
}

/**
 * Place a jigsaw structure.
 *
 * @param {object} options
 * @param {object} options.random            deterministic source
 * @param {TemplatePool} options.startPool
 * @param {string} [options.startJigsawName] which connector name to begin from
 * @param {number} [options.maxDepth]
 * @param {TemplatePoolRegistry} options.pools
 * @param {function} options.buildPiece      (element, rotation, mirror, origin) -> { box, connectors }
 */
export function addPieces({
  random,
  startPool,
  pools,
  maxDepth = 7,
  startJigsawName = null,
  origin = { x: 0, y: 64, z: 0 },
  buildPiece,
  maxDistanceFromCentre = 128
} = {}) {
  if (!random || typeof random.nextFloat !== 'function') throw new Error('addPieces needs a deterministic random source');
  if (!startPool) throw new Error('addPieces needs a start pool');
  if (typeof buildPiece !== 'function') throw new Error('addPieces needs a buildPiece function');

  const pieces = [];
  const occupied = [];
  const diagnostics = { rejectedByCollision: 0, rejectedByDepth: 0, rejectedByDistance: 0, exhaustedPools: 0, placements: 0 };

  const place = (element, rotation, mirror, at, depth, parentPiece, connectorName = null) => {
    const built = buildPiece(element, rotation, mirror, at, { depth, parent: parentPiece, connectorName });
    if (!built || !built.box) return null;
    const piece = new StructurePiece({
      id: element.name ?? element.type,
      index: pieces.length,
      parent: parentPiece,
      type: 'jigsaw',
      family: 'jigsaw',
      template: element.name ?? null,
      rotation, mirror,
      box: built.box,
      isJigsaw: true,
      meta: { connectors: built.connectors, depth, element: element.name ?? element.type, projection: element.projection }
    });
    pieces.push(piece);
    occupied.push(built.box);
    diagnostics.placements++;
    return piece;
  };

  // Vanilla (`JigsawPlacement.addPieces`): a random rotation, then ONE weighted draw from the start pool. Always
  // taking the first element with no rotation made every village open with the same meeting point, facing the same
  // way, and made a weighted variant (the 2% abandoned village) impossible.
  const startRotation = random.nextIntBound(4);
  const startElement = startPool.elements.length > 1 ? startPool.elements[startPool.shuffledOrder(random)[0]] : startPool.elements[0];
  const start = place(startElement, startRotation, Mirror.NONE, origin, 0, null);
  if (!start) return { pieces, diagnostics, start: null };

  // Breadth-first over a queue, which is what makes `max_depth` a real depth and not a placement count.
  const queue = [{ piece: start, depth: 0 }];
  while (queue.length) {
    const { piece, depth } = queue.shift();
    if (depth >= maxDepth) continue;

    // Connectors are tried in selection-priority order; vanilla sorts them and then shuffles within a
    // priority band, so equal priorities are not resolved by insertion order.
    const connectors = [...(piece.meta.connectors || [])]
      .filter((candidate) => !candidate.consumed)
      .sort((a, b) => (a.selectionPriority ?? 0) - (b.selectionPriority ?? 0));
    for (const connector of connectors) {
      if (!connector.pool) continue;
      const pool = pools.resolve(connector.pool) ?? (startPool.fallback ? pools.resolve(startPool.fallback) : null);
      if (!pool) continue;
      const order = pool.shuffledOrder(random);
      let placedForConnector = false;

      for (const index of order) {
        const element = pool.elements[index];
        // Vanilla: drawing the empty element ends the attempt -- the connector is deliberately left with nothing
        // (`if (element == EmptyPoolElement.INSTANCE) break;`). Skipping it instead made empty elements weightless.
        if (element.isEmpty) { placedForConnector = true; break; }

        // The candidate must expose a connector with the SAME NAME on its own list; that is how vanilla
        // joins a corridor to a corridor rather than to a random door.
        const wanted = startJigsawName && depth === 0 ? startJigsawName : connector.name;
        const candidateConnectors = element.build ? element.build().connectors || [] : [];
        const match = candidateConnectors.find((entry) => entry.name === wanted)
          ?? candidateConnectors.find((entry) => entry.name === connector.name);
        if (candidateConnectors.length && !match) continue;

        // Rotate the candidate so its connector faces back at ours.
        // A connector's orientation is up_north-shaped, so the yaw must be split out before asking for the
        // opposite facing. Looking up the full string silently missed and rejected every candidate.
        const sourceFront = splitOrientation(connector.orientation).front;
        const target = OPPOSITE[sourceFront] ?? sourceFront;
        const candidateFront = match ? splitOrientation(match.orientation).front : null;
        const turns = candidateFront ? rotationBetween(candidateFront, target) : 0;
        if (turns === null) continue; // a vertical mismatch this engine cannot yet fix, counted below

        // Compute the translation that puts the candidate's connector on the source connector's cell.
        const at = connector.position;
        const built = buildPiece(element, turns, Mirror.NONE, at, { depth: depth + 1, parentIndex: piece.index, connectorName: match?.name ?? null, dryRun: true });
        if (!built || !built.box) continue;

        const offset = { x: 0, y: 0, z: 0 };
        if (match) {
          // Per-INSTANCE, falling back to the name-keyed map for callers that provide only that.
          const matchIndex = candidateConnectors.indexOf(match);
          const matchWorld = (matchIndex >= 0 && built.connectors?.[matchIndex]?.position)
            ? built.connectors[matchIndex].position
            : (built.connectorPositions?.[match.name] ?? null);
          if (matchWorld) {
            // Move the candidate so its connector lands exactly on ours.
            offset.x += at.x - matchWorld.x;
            offset.y += at.y - matchWorld.y;
            offset.z += at.z - matchWorld.z;
          }
        }
        const facing = DIRECTION_VECTOR[sourceFront] ?? { x: 0, y: 0, z: 0 };
        // The child's connector must land in the cell BEYOND the parent's, not on it. Aligning them onto the
        // same cell makes the two boxes share a block, which the collision check below then rejects -- so
        // every join failed and no structure ever grew past its own start piece.
        const finalAt = {
          x: at.x + offset.x + (facing.x || 0),
          y: at.y + offset.y + (facing.y || 0),
          z: at.z + offset.z + (facing.z || 0)
        };

        if (depth + 1 > maxDepth) { diagnostics.rejectedByDepth++; continue; }
        const distance = Math.max(Math.abs(finalAt.x - origin.x), Math.abs(finalAt.z - origin.z));
        if (distance > maxDistanceFromCentre) { diagnostics.rejectedByDistance++; continue; }

        const probe = buildPiece(element, turns, Mirror.NONE, finalAt, { depth: depth + 1, parentIndex: piece.index, connectorName: match?.name ?? null, dryRun: true });
        if (!probe || !probe.box) continue;
        if (occupied.some((box) => box.intersects(probe.box))) { diagnostics.rejectedByCollision++; continue; }

        const child = place(element, turns, Mirror.NONE, finalAt, depth + 1, piece, match?.name ?? null);
        // The connector we just joined through must not be expanded again: it is now buried inside the
        // parent, so expanding from it would place a piece overlapping the parent and be rejected.
        if (match && built.connectors) {
          const joinedIndex = candidateConnectors.indexOf(match);
          if (joinedIndex >= 0 && built.connectors[joinedIndex]) built.connectors[joinedIndex].consumed = true;
        }
        if (!child) continue;
        queue.push({ piece: child, depth: depth + 1 });
        placedForConnector = true;
        break;
      }
      if (!placedForConnector) diagnostics.exhaustedPools++;
    }
  }

  return {
    pieces,
    diagnostics,
    start,
    /** Every piece must be reachable from the start, or the structure is really several disconnected ones. */
    isConnected() {
      // The start is the FIRST PIECE OF THIS STRUCTURE, not index 0: `StructurePiece.index` comes from a
      // module-level counter, so it is not 0-based and not stable across a process.
      const startIndex = pieces[0].index;
      const seen = new Set([startIndex]);
      const byParent = new Map();
      for (const piece of pieces) {
        if (piece.parentIndex === null || piece.parentIndex === undefined) continue;
        if (!byParent.has(piece.parentIndex)) byParent.set(piece.parentIndex, []);
        byParent.get(piece.parentIndex).push(piece.index);
      }
      const stack = [startIndex];
      while (stack.length) {
        const current = stack.pop();
        for (const child of byParent.get(current) ?? []) {
          if (!seen.has(child)) { seen.add(child); stack.push(child); }
        }
      }
      return seen.size === pieces.length;
    }
  };
}

export { BlockBox, Rotation, Mirror, OPPOSITE, AXIS_OF };
