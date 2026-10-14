// node scripts/wiki-audit.mjs [CASE] [--all] [--json]
//
// The wiki parity audits from the command line -- block and item facts (src/resourceWikiAudit.js), recipes,
// smelting, fuel and Fortune (src/resourceRecipeAudit.js), visuals (src/resourceVisualAudit.js), and the game systems:
// trading, brewing, enchanting, effects, smithing, commands and redstone (src/systemsWikiAudit.js). Totals per case,
// then every FAIL and KNOWN row (or, with --all, every row of the named case). The Resource Inspector's "Run full wiki audit"
// shows the same thing, and tests/resourceWikiAudit.test.js holds the sweep at zero failures.
//
//   node scripts/wiki-audit.mjs              totals and anything that is not a pass
//   node scripts/wiki-audit.mjs B-SILK --all  every Silk Touch row
//   node scripts/wiki-audit.mjs R-PLATE --all every pressure plate row
//   node scripts/wiki-audit.mjs --json        the whole audit as JSON
import { existsSync } from 'node:fs';
import { vanillaItemsMissing } from '../src/resourceWikiAudit.js';
import { parityAuditEverything } from '../src/resourceParityCases.js';

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith('--')) ?? null;
const audit = parityAuditEverything({ assetExists: (path) => existsSync(`public${path}`) });
if (args.includes('--json')) {
  console.log(JSON.stringify({ ...audit, missing: vanillaItemsMissing() }, null, 1));
  process.exit(0);
}
console.log(`${audit.rows.length} cases:`, audit.totals);
for (const [id, t] of Object.entries(audit.byCase)) console.log(`  ${id.padEnd(17)} ${String(t.PASS).padStart(5)} pass ${t.FAIL} fail ${t.KNOWN ?? 0} known ${t.NA} n/a ${t.NO_DATA ?? 0} no data`);
const rows = audit.rows.filter((r) => (!only || r.id === only) && (args.includes('--all') || r.status === 'FAIL' || r.status === 'KNOWN'));
for (const r of rows) console.log(`${r.status.padEnd(7)} ${r.id.padEnd(16)} ${r.subject ?? ''} | ${r.label} | wiki ${r.expected} | game ${r.actual}${r.note ? ` | ${r.note}` : ''}`);
const missing = vanillaItemsMissing();
console.log(`vanilla items this game lacks: ${missing.length}${missing.length ? ` (${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ', ...' : ''})` : ''}`);
process.exitCode = audit.totals.FAIL ? 1 : 0;
