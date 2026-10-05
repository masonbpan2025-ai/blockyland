// DOM rendering for the Inspector's structure panels.
//
// The renderer takes its element lookup as a PARAMETER rather than reaching for `document`, which means it can
// be tested in Node with a fake element factory. That matters here specifically: this repository has a
// documented history of tests installing partial `document` stubs and leaking them (docs/test-determinism.md),
// and a renderer that cannot be called without a document pushes a test straight into that trap.
//
// The panels show what a rendered structure cannot: which piece joined to which, whether any piece is an
// orphan, whether pieces overlap, and how much of the result is the structure versus terrain adaptation.

import { pieceGraphView, adaptationView, planSummaryView } from './structureInspectorPanels.js';
import { BLOCKS } from './blocks.js';

/** A compact one-line summary of a piece's connectors, so a row stays readable. */
function connectorText(connectors) {
  if (!connectors.length) return '—';
  return connectors
    .map((connector) => (connector.pool ? `${connector.name}→${connector.pool.replace('pillager_outpost/', '')}` : connector.name))
    .join(', ');
}

/**
 * Fill the panels from the session.
 *
 * @param {object} session
 * @param {object} options
 * @param {function} options.$       element lookup, `(id) => element|null`
 * @param {number} [options.foundationBlock]
 */
export function renderStructurePanels(session, { $, foundationBlock = BLOCKS.STONE } = {}) {
  if (typeof $ !== 'function') throw new Error('renderStructurePanels needs an element lookup');
  const setText = (id, text) => {
    const element = $(id);
    if (element) element.textContent = text;
  };

  // --- Plan summary -------------------------------------------------------------------------
  const summary = planSummaryView(session);
  const summaryElement = $('plan-summary');
  if (summaryElement) {
    summaryElement.textContent = summary.available
      ? [
        `${summary.structureId} (set ${summary.set ?? '—'})`,
        `chunk ${summary.chunkX},${summary.chunkZ}`,
        `pieces ${summary.pieces}`,
        `chunks covered ${summary.chunksCovered ?? '—'}`,
        `terrain ${summary.terrainAdaptation}`,
        `step ${summary.generationStep ?? '—'}`,
        `box ${summary.box.join(', ')}`,
        `hash ${summary.hash ?? '—'}`
      ].join(' · ')
      : `no plan${summary.structureId ? ` for ${summary.structureId}` : ''}`;
  }

  // --- Piece graph ---------------------------------------------------------------------------
  const graph = pieceGraphView(session);
  const graphElement = $('piece-graph');
  if (graphElement) {
    if (!graph.available) {
      graphElement.textContent = graph.reason;
    } else {
      const header = [
        `${graph.count} piece(s)`,
        `max depth ${graph.maxDepth}`,
        `jigsaw ${graph.jigsawPieces}`,
        `connectors ${graph.connectorCount}`,
        graph.connected ? 'connected' : 'NOT CONNECTED'
      ].join(' · ');
      const problems = [];
      if (graph.orphaned.length) problems.push(`orphaned pieces: ${graph.orphaned.join(', ')}`);
      if (graph.overlaps.length) {
        problems.push(`overlaps: ${graph.overlaps.map((entry) => `${entry.ids[0]}/${entry.ids[1]}`).join(', ')}`);
      }
      const rows = graph.pieces.map((piece) => [
        piece.ordinal,
        piece.element ?? piece.id,
        `d${piece.depth}`,
        piece.parentOrdinal === null ? 'root' : `#${piece.parentOrdinal}`,
        piece.rotation,
        piece.volume,
        connectorText(piece.connectors)
      ].join(' | '));
      graphElement.textContent = [header, ...(problems.length ? [problems.join(' · ')] : []), ...rows].join('\n');
    }
  }

  // --- Terrain adaptation --------------------------------------------------------------------
  const adaptationElement = $('adaptation-info');
  if (adaptationElement) {
    const surface = typeof session.surfaceY === 'function' ? session.surfaceY() : null;
    const view = adaptationView(session, {
      surfaceY: () => (Number.isFinite(surface) ? surface : 70),
      foundationBlock
    });
    if (!view.available) {
      adaptationElement.textContent = `not shown: ${view.reason}`;
    } else if (!view.applied) {
      adaptationElement.textContent = `type ${view.type} · not applied (this structure adapts nothing, or adaptation is switched off)`;
    } else {
      const counts = view.counts ?? {};
      adaptationElement.textContent = [
        `type ${view.type}`,
        `structure blocks ${view.structureBlocks}`,
        `shaved ${counts.shaved ?? 0}`,
        `foundation ${counts.foundation ?? 0}`,
        `buried ${counts.buried ?? 0}`,
        `encapsulated ${counts.encapsulated ?? 0}`,
        `total added ${view.total}`
      ].join(' · ');
    }
  }

  return { summary, graph, rendered: true };
}
