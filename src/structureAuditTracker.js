// The audit tracker, checked by machine.
//
// docs/STRUCTURE_AUDIT_PLAN.md Section 7 is a hand-edited table. A table that claims "GAME-VERIFIED" for a structure
// whose audit fails, or "AUDITED" with no evidence, is worse than no table, so this parses it and applies the rules
// the plan's status definitions state:
//
//   * every row has a unique number, a known status and well-formed layer cells;
//   * GAME-VERIFIED and AUDITED need Gen, Cont and Game = ok, a spec card, and a passing real-world audit;
//   * AUDITED also needs Vis and Save = ok and at least one evidence file under docs/structure-audit/evidence/<id>/.
//
// Pure: the caller supplies the markdown, the cards and a function that lists evidence files, so tests can use
// fixtures and the CLI uses the real repository.

export const STATUSES = ['NOT AUDITED', 'CARD WRITTEN', 'IN PROGRESS', 'GAME-VERIFIED', 'AUDITED', 'BLOCKED'];
export const LAYER_VALUES = ['-', '~', 'ok', 'ok?', '?'];
const LAYER_COLUMNS = ['spec', 'gen', 'cont', 'game', 'vis', 'save'];

/** "Swamp Hut" -> "swamp_hut"; "Village (plains)" -> "village_plains"; "Shipwreck x2" -> "shipwreck". */
export function structureSlug(name) {
  return name
    .replace(/\s+x\d+$/i, '')
    .replace(/\(([^)]*)\)/g, ' $1 ')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** The rows of the Section 7 table. */
export function parseTracker(markdown) {
  const start = markdown.indexOf('## 7. Progress tracker');
  if (start < 0) throw new Error('Section "## 7. Progress tracker" not found');
  const next = markdown.indexOf('\n## ', start + 5);
  const section = markdown.slice(start, next < 0 ? undefined : next);
  const rows = [];
  for (const line of section.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length < 11 || /^-+$/.test(cells[0]) || cells[0] === '#') continue;
    const [number, name, phase, ...rest] = cells;
    const layers = Object.fromEntries(LAYER_COLUMNS.map((column, i) => [column, rest[i]]));
    rows.push({ number, name, slug: structureSlug(name), phase, ...layers, status: rest[6].replace(/`/g, ''), notes: rest.slice(7).join('|') });
  }
  return rows;
}

/**
 * @param {Array} rows from `parseTracker`
 * @param {{cardIds:Set<string>, evidenceFiles:(slug:string)=>string[]}} context
 * @returns {{problems:string[], counts:Object<string,number>}}
 */
export function validateTracker(rows, { cardIds = new Set(), evidenceFiles = () => [] } = {}) {
  const problems = [];
  const seen = new Set();
  const counts = {};
  for (const row of rows) {
    const where = `row ${row.number} (${row.name})`;
    counts[row.status] = (counts[row.status] ?? 0) + 1;
    if (seen.has(row.number)) problems.push(`${where}: duplicate number`);
    seen.add(row.number);
    if (!STATUSES.includes(row.status)) problems.push(`${where}: unknown status "${row.status}"`);
    for (const column of LAYER_COLUMNS) {
      if (!LAYER_VALUES.includes(row[column])) problems.push(`${where}: ${column} cell "${row[column]}" is not one of ${LAYER_VALUES.join(' ')}`);
    }
    if (row.status === 'GAME-VERIFIED' || row.status === 'AUDITED') {
      for (const column of ['gen', 'cont', 'game']) {
        if (row[column] !== 'ok') problems.push(`${where}: ${row.status} needs ${column} = ok, found "${row[column]}"`);
      }
      if (!cardIds.has(row.slug)) problems.push(`${where}: ${row.status} needs a spec card for "${row.slug}"`);
      if (evidenceFiles(row.slug).length === 0) problems.push(`${where}: ${row.status} needs evidence under docs/structure-audit/evidence/${row.slug}/`);
    }
    if (row.status === 'AUDITED') {
      for (const column of ['vis', 'save']) {
        if (row[column] !== 'ok') problems.push(`${where}: AUDITED needs ${column} = ok, found "${row[column]}"`);
      }
    }
    if (row.status === 'NOT AUDITED' && cardIds.has(row.slug)) problems.push(`${where}: has a spec card, so it is at least CARD WRITTEN`);
  }
  return { problems, counts };
}
