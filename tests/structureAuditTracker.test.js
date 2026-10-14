// The tracker validator: it accepts the real tracker and rejects each kind of dishonest row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { parseTracker, validateTracker, cardsForRow, structureSlug } from '../src/structureAuditTracker.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';
import { auditStructure } from '../src/structureAudit.js';

const doc = readFileSync('docs/STRUCTURE_AUDIT_PLAN.md', 'utf8');
const cardIds = new Set(Object.keys(STRUCTURE_AUDIT_CARDS));
const evidenceFiles = (slug) => (existsSync(`docs/structure-audit/evidence/${slug}`) ? readdirSync(`docs/structure-audit/evidence/${slug}`) : []);

const table = (...lines) => `## 7. Progress tracker\n\n| # | Structure | Phase | Spec | Gen | Cont | Game | Vis | Save | Status | Notes |\n|---|---|---|---|---|---|---|---|---|---|---|\n${lines.join('\n')}\n\n## 8. Next\n`;

test('slugs match registry ids', () => {
  assert.equal(structureSlug('Swamp Hut'), 'swamp_hut');
  assert.equal(structureSlug('Village (plains)'), 'village_plains');
  assert.equal(structureSlug('Shipwreck x2'), 'shipwreck');
});

test('the real tracker is valid, and every GAME-VERIFIED structure really passes its real-world audit', async () => {
  const rows = parseTracker(doc);
  assert.ok(rows.length >= 30, `${rows.length} rows`);
  const { problems } = validateTracker(rows, { cardIds, evidenceFiles });
  assert.deepEqual(problems, []);
  for (const row of rows.filter((r) => r.status === 'GAME-VERIFIED' || r.status === 'AUDITED')) {
    for (const id of cardsForRow(row)) {
      const result = await auditStructure(id, { mode: 'world', seed: 20250401 });
      assert.equal(result.rows.filter((fact) => fact.status === 'fail').length, 0, `${row.name} (${id}) fails its audit`);
    }
  }
});

test('SENSITIVITY: dishonest rows are rejected', () => {
  const check = (line, options = { cardIds, evidenceFiles }) => validateTracker(parseTracker(table(line)), options).problems;
  assert.match(check('| 1 | Swamp Hut | 1 | ok | ok | ~ | ok | - | - | `GAME-VERIFIED` | x |').join('\n'), /cont = ok/);
  assert.match(check('| 1 | Swamp Hut | 1 | ok | ok | ok | ok | - | - | `AUDITED` | x |').join('\n'), /vis = ok/);
  assert.match(check('| 1 | Imaginary Tower | 1 | ok | ok | ok | ok | ok | ok | `AUDITED` | x |').join('\n'), /spec card/);
  assert.match(check('| 1 | Swamp Hut | 1 | ok | ok | ok | ok | ok | ok | `AUDITED` | x |', { cardIds, evidenceFiles: () => [] }).join('\n'), /evidence/);
  assert.match(check('| 1 | Swamp Hut | 1 | ok | ok | ok | ok | ok | ok | `DONE` | x |').join('\n'), /unknown status/);
  assert.match(check('| 1 | Swamp Hut | 1 | great | ok | ok | ok | ok | ok | `IN PROGRESS` | x |').join('\n'), /spec cell/);
  assert.match(check('| 1 | Swamp Hut | 1 | ok | - | - | - | - | - | `NOT AUDITED` | x |').join('\n'), /CARD WRITTEN/);
  const dup = validateTracker(parseTracker(table('| 1 | A | 1 | - | - | - | - | - | - | `NOT AUDITED` | x |', '| 1 | B | 1 | - | - | - | - | - | - | `NOT AUDITED` | x |')), { cardIds, evidenceFiles });
  assert.match(dup.problems.join('\n'), /duplicate/);
});
