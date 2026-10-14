// Every structure with a wiki fact card passes all of it: in the flat preview and in a real World, on several seeds.
// Structure-specific tests (blueprint counts, sensitivity) live in their own files; this is the sweep that keeps every
// card honest as the code changes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditStructure } from '../src/structureAudit.js';
import { STRUCTURE_AUDIT_CARDS } from '../src/structureAuditCards.js';

const RUNS = [['flat', 20250401], ['world', 2024], ['world', 7]];

for (const id of Object.keys(STRUCTURE_AUDIT_CARDS)) {
  test(`${id}: every wiki fact passes`, async () => {
    for (const [mode, seed] of RUNS) {
      const result = await auditStructure(id, { mode, seed });
      assert.ok(result.observation.found, `${id} ${mode} ${seed}: not located`);
      assert.deepEqual(result.rows.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.detail}`), [], `${id} ${mode} seed ${seed}`);
    }
  });
}
