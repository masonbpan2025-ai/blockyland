// node scripts/export-structure-evidence.mjs <structure_id> [seed ...]
//
// Writes the same evidence JSON the Inspector's "Export evidence" button downloads (blocks, loot, entities and the
// real-world audit) into docs/structure-audit/evidence/<structure_id>/, without a browser. Screenshots still come
// from the Inspector.
import { mkdirSync, writeFileSync } from 'node:fs';
import { buildStructureWorld } from '../src/structureInspectorWorld.js';
import { auditStructure } from '../src/structureAudit.js';
import { buildEvidence, evidenceName } from '../src/structureInspectorEvidence.js';

const [id, ...seeds] = process.argv.slice(2);
if (!id) { console.error('usage: node scripts/export-structure-evidence.mjs <structure_id> [seed ...]'); process.exit(2); }
const dir = `docs/structure-audit/evidence/${id}`;
mkdirSync(dir, { recursive: true });
for (const seed of seeds.length ? seeds : ['20250401']) {
  const built = await buildStructureWorld({ structureId: id, seed });
  const audit = await auditStructure(id, { mode: 'world', seed });
  const evidence = buildEvidence(built, audit, { view: 'node export' });
  const file = `${dir}/${evidenceName(built)}.json`;
  writeFileSync(file, JSON.stringify(evidence, null, 2) + '\n');
  console.log(file, `audit ${audit.summary.pass} pass / ${audit.summary.fail} fail`, `${evidence.pieces} pieces`);
}
