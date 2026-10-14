// Evidence for the audit tracker: what a structure looked like at a seed, as a file that can be committed under
// docs/structure-audit/evidence/<structure>/ next to a screenshot.
//
// DOM-free. The page downloads the JSON this builds (and the canvas screenshot beside it); a human moves both into
// the repository and the tracker row points at them.
import { lootView, blockEntitiesView, boxBlockCounts } from './structureInspectorWorld.js';

export const EVIDENCE_VERSION = 1;

/**
 * @param {object} built   from `buildStructureWorld`
 * @param {object} [audit] an audit result (`auditStructure`), included as a summary and the failing facts
 * @param {object} [extra] e.g. `{ view: 'textured', note: '...' }`
 */
export function buildEvidence(built, audit = null, extra = {}) {
  const loot = lootView(built);
  const entities = blockEntitiesView(built);
  return {
    version: EVIDENCE_VERSION,
    structure: built.structureId,
    seed: built.seed,
    chunk: built.found.chunk,
    biome: built.found.biome,
    box: built.box,
    pieces: built.pieces.length,
    blocks: boxBlockCounts(built),
    loot: { chests: loot.chests.length, empty: loot.empty, totals: loot.totals },
    entities: entities.counts,
    audit: audit
      ? {
        mode: audit.mode,
        summary: audit.summary,
        failing: audit.rows.filter((row) => row.status === 'fail').map((row) => row.id),
        waived: audit.rows.filter((row) => row.status === 'waived').map((row) => row.id)
      }
      : null,
    ...extra
  };
}

/** A stable file stem for the evidence files: `<structure>-seed-<seed>`. */
export function evidenceName(built) {
  return `${built.structureId}-seed-${String(built.seed).replace(/[^0-9A-Za-z_-]/g, '_')}`;
}
