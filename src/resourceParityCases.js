// Every parity case for a resource, from the audits: the wiki's block and item facts (resourceWikiAudit.js),
// its recipes, smelting, fuel and Fortune (resourceRecipeAudit.js), how it looks (resourceVisualAudit.js), and the
// game-systems cases about it -- the potion's brewing, the smithing result, the redstone component's behaviour
// (systemsWikiAudit.js). The Resource Inspector's Wiki parity panel and its showcase read this, so they show what
// the tests check.
import { wikiCasesForEntry, auditEverythingAgainstWiki, WIKI_CASE_LABELS } from './resourceWikiAudit.js';
import { recipeCasesForEntry, recipeAudit } from './resourceRecipeAudit.js';
import { blockVisualCases, itemVisualCases, visualAudit, formProbes } from './resourceVisualAudit.js';
import { systemsAudit, SYSTEMS_CASE_LABELS } from './systemsWikiAudit.js';
import { cellForName } from './wikiNames.js';

export const CASE_LABELS = {
  ...WIKI_CASE_LABELS,
  'C-CRAFT': 'Crafting recipe', 'S-SMELT': 'Smelting', 'F-FUEL': 'Fuel', 'F-FORTUNE': 'Fortune',
  'V-SHAPE': 'Drawn shape', 'V-TEXTURE': 'Textures', 'V-ICON': 'Inventory icon', 'V-HELD': 'Held form', 'V-DROPPED': 'Dropped form',
  ...SYSTEMS_CASE_LABELS,
};

/** The visual cases for a Resource Inspector entry (the block's, and the item's icon when the page can check files). */
function visualCasesForEntry(entry, assetExists = null) {
  const out = [];
  if (entry.blockId !== null && entry.blockId !== undefined) out.push(...blockVisualCases(entry.blockId, { assetExists, ...formProbes() }));
  if (entry.kind === 'item') out.push(...itemVisualCases(entry.id, { assetExists, ...formProbes() }));
  return out;
}

// The systems audit runs once per page: its redstone cases build and tick small circuits.
let systemsRows = null;
const RESOURCE_SYSTEMS = new Set(['brewing', 'smithing', 'redstone']);
function systemsByResource() {
  if (systemsRows) return systemsRows;
  systemsRows = new Map();
  for (const row of systemsAudit().rows) {
    if (!RESOURCE_SYSTEMS.has(row.system)) continue;
    const cell = cellForName(String(row.subject));
    if (!cell) continue;
    const key = `${cell.isBlock ? 'b' : 'i'}:${cell.id}`;
    if (!systemsRows.has(key)) systemsRows.set(key, []);
    systemsRows.get(key).push(row);
  }
  return systemsRows;
}
/** The brewing, smithing and redstone cases whose subject is this resource. */
function systemsCasesForEntry(entry) {
  const rows = systemsByResource();
  return [
    ...(entry.blockId !== null && entry.blockId !== undefined ? rows.get(`b:${entry.blockId}`) ?? [] : []),
    ...(entry.kind === 'item' ? rows.get(`i:${entry.id}`) ?? [] : []),
  ];
}

/** Every case for one resource. */
export function parityCasesForEntry(entry, { assetExists = null } = {}) {
  if (!entry) return [];
  return [...wikiCasesForEntry(entry), ...recipeCasesForEntry(entry), ...visualCasesForEntry(entry, assetExists), ...systemsCasesForEntry(entry)];
}

/** All the audits over everything -- blocks, items and the game systems -- with combined totals. */
export function parityAuditEverything({ assetExists = null } = {}) {
  const parts = [auditEverythingAgainstWiki(), recipeAudit(), visualAudit({ assetExists, ...formProbes() }), systemsAudit()];
  const rows = parts.flatMap((p) => p.rows);
  const totals = { PASS: 0, FAIL: 0, KNOWN: 0, NA: 0, NO_DATA: 0 };
  for (const r of rows) totals[r.status] = (totals[r.status] ?? 0) + 1;
  const byCase = Object.assign({}, ...parts.map((p) => p.byCase));
  return { rows, totals, byCase, failures: rows.filter((r) => r.status === 'FAIL') };
}
