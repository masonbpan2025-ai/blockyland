// node scripts/validate-structure-tracker.mjs
// Checks docs/STRUCTURE_AUDIT_PLAN.md Section 7 against the spec cards, the evidence folder and a real-world audit
// of every structure marked GAME-VERIFIED or AUDITED. Exits 1 on any problem.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTracker, validateTracker, cardsForRow } from '../src/structureAuditTracker.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { auditStructure } from '../src/structureAudit.js';

const rows = parseTracker(readFileSync('docs/STRUCTURE_AUDIT_PLAN.md', 'utf8'));
const evidenceFiles = (slug) => {
  const dir = `docs/structure-audit/evidence/${slug}`;
  return existsSync(dir) ? readdirSync(dir) : [];
};
const { problems, counts } = validateTracker(rows, { cardIds: new Set(Object.keys(STRUCTURE_AUDIT_CARDS)), evidenceFiles });

for (const row of rows.filter((r) => r.status === 'GAME-VERIFIED' || r.status === 'AUDITED')) {
  for (const id of cardsForRow(row)) {
    if (!STRUCTURE_AUDIT_CARDS[id]) continue;
    const result = await auditStructure(id, { mode: 'world', seed: 20250401 });
    const failing = result.rows.filter((fact) => fact.status === 'fail').map((fact) => fact.id);
    if (failing.length) problems.push(`${row.name} (${id}): marked ${row.status} but the real-world audit fails ${failing.join(', ')}`);
  }
}

console.log(`${rows.length} tracker rows:`, counts);
if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('tracker ok');
