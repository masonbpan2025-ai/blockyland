// Build a mesher fixture for tests/mesherPerformance.test.js, importable from tests/fixtures/:
//   - mesherBefore.js (the default): the pre-optimisation mesher, which the speed and allocation checks measure
//     the current one against;
//   - mesherReference.js (MESHER_OUT=reference): the mesher as last committed, which the geometry checks compare
//     the current one against. Regenerate it when the mesher's output is changed on purpose.
//
// Kept as a script rather than a hand-edited copy so it can be regenerated from git at any commit.
//
// The raw file is read from $MESHER_SOURCE rather than fetched here: this sandbox denies a Node
// process spawning git, so the extraction is done by the caller and handed over as a path.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const source = process.env.MESHER_SOURCE;
if (!source) {
  console.error('Set MESHER_SOURCE to a file containing the pre-change mesher (e.g. from `git cat-file blob <rev>:src/mesher.js`).');
  process.exit(2);
}
mkdirSync('tests/fixtures', { recursive: true });

let text = readFileSync(source, 'utf8');
if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

// Imports resolve relative to the fixture's new location.
text = text.replace(/from '\.\//g, "from '../../src/");

const reference = process.env.MESHER_OUT === 'reference';
const out = reference ? 'tests/fixtures/mesherReference.js' : 'tests/fixtures/mesherBefore.js';
const rev = process.env.MESHER_REV || 'a previous revision';
const purpose = reference
  ? `kept so a change to the
// mesher that alters its geometry by accident is caught. Regenerate it when the geometry is changed on purpose:`
  : `kept so a performance change to the
// mesher can be measured against what it replaced. Regenerate with:`;
const header = `// GENERATED -- do not edit. The mesher as it was at ${rev}, ${purpose}
//   cmd /c "git cat-file blob <rev>:src/mesher.js > %TEMP%\\mesher_src.js"
//   $env:MESHER_SOURCE="$env:TEMP\\mesher_src.js"; ${reference ? '$env:MESHER_OUT="reference"; ' : ''}node scripts/make-mesher-fixture.mjs
// Imported only by tests/mesherPerformance.test.js.
`;
writeFileSync(out, header + text, 'utf8');
console.log(`wrote ${out} (${text.length} bytes)`);
