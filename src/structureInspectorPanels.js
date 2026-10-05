// Inspector view-models for the subsystems added after the page was built.
//
// The Inspector was written before processors, the jigsaw engine and terrain adaptation existed, so it can
// plan and realize a structure but cannot SHOW the things that most often go wrong: which piece joined to
// which, where the connectors are, what the processors changed, and what terrain adaptation did. The mission
// asks for generation and properties to be testable in the Inspector, so this module produces the view data
// the page renders.
//
// These are PURE functions of a session's own state, deliberately separate from the DOM: a view-model can be
// tested in Node, and the page's rendering cannot. That split is why the numbers below are trustworthy even
// though the panels are not drawn yet.

import { TERRAIN_ADAPTATION_INFLATE } from './worldgen/terrainAdaptation.js';

/**
 * The piece graph of a planned start, as a tree the page can render.
 *
 * A jigsaw structure's most common failure is not a wrong block but a piece that joins to nothing, so the
 * view states connectivity and the parent of every piece rather than leaving it to be inferred from boxes.
 */
export function pieceGraphView(session) {
  const snapshot = session.snapshot();
  const plan = session.currentPlan ? session.currentPlan() : null;
  if (!plan || !plan.start) {
    return { available: false, reason: snapshot.plan?.structureId ? 'the current plan has no start' : 'plan a structure first', pieces: [], connected: null };
  }
  const start = plan.start;
  const byIndex = new Map(start.pieces.map((piece) => [piece.index, piece]));
  const depthOf = (piece) => (piece.parentIndex === null || piece.parentIndex === undefined ? 0 : piece.depth ?? 0);

  const pieces = start.pieces.map((piece, ordinal) => {
    const parent = piece.parentIndex === null || piece.parentIndex === undefined ? null : byIndex.get(piece.parentIndex);
    return {
      ordinal,
      index: piece.index,
      id: piece.id,
      family: piece.family,
      type: piece.type,
      element: piece.meta?.element ?? null,
      template: piece.template ?? null,
      depth: depthOf(piece),
      rotation: piece.rotation,
      mirror: piece.mirror,
      parentIndex: piece.parentIndex ?? null,
      parentOrdinal: parent ? start.pieces.indexOf(parent) : null,
      isJigsaw: Boolean(piece.isJigsaw),
      // A root with no children and a structure with one piece are both legal; what is NOT legal is a piece
      // whose parent is missing from the plan.
      orphaned: (piece.parentIndex ?? null) !== null && !parent,
      box: piece.box.toArray(),
      volume: (piece.box.maxX - piece.box.minX + 1) * (piece.box.maxY - piece.box.minY + 1) * (piece.box.maxZ - piece.box.minZ + 1),
      connectors: (piece.meta?.connectors ?? []).map((connector) => ({
        name: connector.name,
        pool: connector.pool,
        orientation: connector.orientation,
        joint: connector.joint,
        selectionPriority: connector.selectionPriority ?? 0,
        position: connector.position ?? null
      }))
    };
  });

  // Overlaps are reported because the joining maths is what keeps pieces apart, and a viewer cannot see a
  // one-block intersection inside a rendered structure.
  const overlaps = [];
  for (let a = 0; a < start.pieces.length; a++) {
    for (let b = a + 1; b < start.pieces.length; b++) {
      if (start.pieces[a].box.intersects(start.pieces[b].box)) {
        overlaps.push({ a, b, ids: [start.pieces[a].id, start.pieces[b].id] });
      }
    }
  }

  return {
    available: true,
    structureId: plan.structureId ?? plan.start.structureId,
    set: plan.set ?? null,
    count: pieces.length,
    maxDepth: pieces.reduce((max, piece) => Math.max(max, piece.depth), 0),
    jigsawPieces: pieces.filter((piece) => piece.isJigsaw).length,
    orphaned: pieces.filter((piece) => piece.orphaned).map((piece) => piece.ordinal),
    connectorCount: pieces.reduce((sum, piece) => sum + piece.connectors.length, 0),
    roots: pieces.filter((piece) => piece.parentOrdinal === null).map((piece) => piece.ordinal),
    overlaps,
    connected: pieces.length === 0 ? null : pieces.every((piece) => !piece.orphaned) && overlaps.length === 0,
    startBox: start.box.toArray(),
    tightBox: start.tightBox ? start.tightBox.toArray() : null,
    pieces
  };
}

/**
 * What terrain adaptation does to the current plan, as counts and example writes.
 *
 * It needs terrain, so it takes the same callbacks the engine does and reports the sampling honestly: with no
 * `surfaceY` it says so instead of showing an empty adaptation that looks like flat ground.
 */
export function adaptationView(session, { surfaceY = null, foundationBlock = null, adaptation = null, airBlock = null, limit = 50 } = {}) {
  const plan = session.currentPlan ? session.currentPlan() : null;
  if (!plan || !plan.start) return { available: false, reason: 'plan a structure first' };
  if (typeof surfaceY !== 'function') {
    return { available: false, reason: 'supply a surfaceY callback: without terrain, adaptation is a no-op by design' };
  }
  if (foundationBlock === null || foundationBlock === undefined) {
    return { available: false, reason: 'supply a foundationBlock id: adaptation has nothing to fill with' };
  }
  const report = session.realizeWithAdaptation
    ? session.realizeWithAdaptation({ surfaceY, foundationBlock, adaptation, airBlock })
    : null;
  if (!report) return { available: false, reason: 'this session cannot realize with adaptation' };
  const adaptationReport = report.adaptation ?? { type: adaptation ?? 'none', applied: false, counts: null };

  return {
    available: true,
    type: adaptationReport.type,
    applied: adaptationReport.applied,
    counts: adaptationReport.counts,
    total: adaptationReport.total ?? 0,
    inflate: TERRAIN_ADAPTATION_INFLATE,
    // The written count is shown next to the adaptation count so a reader can see that adaptation adds blocks
    // AROUND the structure without changing how many the structure itself writes.
    structureBlocks: report.written ?? 0,
    samples: (report.adaptationWrites ?? []).slice(0, limit),
    note: report.note ?? null
  };
}

/** A compact summary of what a plan is, for the page's header. */
export function planSummaryView(session) {
  const snapshot = session.snapshot();
  const plan = session.currentPlan ? session.currentPlan() : null;
  if (!plan || !plan.start) return { available: false, structureId: snapshot.plan?.structureId ?? null };
  const start = plan.start;
  return {
    available: true,
    structureId: plan.structureId ?? start.structureId,
    set: plan.set ?? start.set ?? null,
    chunkX: start.chunkX,
    chunkZ: start.chunkZ,
    pieces: start.pieces.length,
    hash: session.hashStart ? session.hashStart(start) : null,
    box: start.box.toArray(),
    terrainAdaptation: start.terrainAdaptation ?? 'none',
    generationStep: start.generationStep ?? null,
    chunksCovered: session.chunksForStart ? session.chunksForStart(start).length : null
  };
}

/**
 * What changed between two plans of the SAME structure at different seeds.
 *
 * This is the question the Inspector exists to answer: change the seed and see how generation differs. The
 * answer has distinct parts, and conflating them would hide the most interesting cases:
 *
 *   * the LOCATED CHUNK moving means PLACEMENT changed -- the structure lands somewhere else in the world;
 *   * the HASH changing while the chunk stays put means the PLAN changed -- a different variant, layout or
 *     decay roll at the same site, which is the structure's own randomness;
 *   * neither changing is a legitimate outcome for a deterministic algorithm, and must not be reported as
 *     "no change" without saying why it happened.
 *
 * @param {object|null} previous  a `planSummaryView` result, or null when there is nothing to compare
 * @param {object} current        a `planSummaryView` result
 */
export function seedDiffView(previous, current) {
  if (!current || !current.available) return { comparable: false, reason: 'nothing planned yet' };
  if (!previous || !previous.available) return { comparable: false, reason: 'first plan for this selection' };
  // Two plans of DIFFERENT structures are not a seed comparison, and saying they were would mislead.
  if (previous.structureId !== current.structureId) {
    return { comparable: false, reason: 'the structure changed, so there is nothing comparable' };
  }
  const chunkMoved = previous.chunkX !== current.chunkX || previous.chunkZ !== current.chunkZ;
  const hashChanged = previous.hash !== current.hash;
  const piecesChanged = previous.pieces !== current.pieces;
  const boxChanged = Array.isArray(previous.box) && Array.isArray(current.box)
    ? previous.box.join(',') !== current.box.join(',')
    : false;

  if (!chunkMoved && !hashChanged && !piecesChanged && !boxChanged) {
    return {
      comparable: true,
      changed: false,
      chunkMoved: false,
      hashChanged: false,
      piecesChanged: false,
      boxChanged: false,
      summary: 'same result as the previous seed: placement and plan both identical'
    };
  }
  const parts = [];
  if (chunkMoved) parts.push('moved to chunk ' + current.chunkX + ',' + current.chunkZ + ' (was ' + previous.chunkX + ',' + previous.chunkZ + ')');
  if (hashChanged && !chunkMoved) parts.push('plan changed at the same chunk');
  if (piecesChanged) parts.push('pieces ' + previous.pieces + ' to ' + current.pieces);
  if (boxChanged && !chunkMoved) parts.push('box changed');
  return {
    comparable: true,
    changed: true,
    chunkMoved,
    hashChanged,
    piecesChanged,
    boxChanged,
    previousHash: previous.hash,
    summary: parts.join('; ')
  };
}
