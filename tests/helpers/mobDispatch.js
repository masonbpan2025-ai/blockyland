// Which mob types can the engine actually build?
//
// `MobManager.spawnMob` is one large switch. A biome spawn table can name a mob the switch does not
// handle, and the result is a spawn attempt that always fails -- a mob present in the data that can
// never appear. That is worth a test, and the honest way to write it is to read the dispatcher rather
// than to keep a second hand-written list that can drift from it.
//
// This parses the switch's `case '<type>':` labels out of src/mobs.js. Reading source text in a test
// is usually a smell; here it is the point, because the alternative is a duplicated list which is
// exactly the thing that goes stale.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MOBS_JS = join(HERE, '..', '..', 'src', 'mobs.js');

/**
 * The set of mob type strings `spawnMob` can construct.
 *
 * Extracted from the `case` labels of the dispatch switch. Entries that share a case body via
 * fallthrough (`case 'zombie_pigman': case 'zombified_piglin':`) each contribute their own label,
 * which is what is wanted.
 */
export function parseMobTypeSupport() {
  const source = readFileSync(MOBS_JS, 'utf8');
  const start = source.indexOf('spawnMob(type, x, y, z, options = {}) {');
  if (start === -1) throw new Error('could not find spawnMob in src/mobs.js');
  // The switch ends at the first `default:` after the start.
  const end = source.indexOf('default:', start);
  if (end === -1) throw new Error('could not find the spawnMob switch default');
  const body = source.slice(start, end);

  const types = new Set();
  const casePattern = /case\s+'([^']+)'\s*:/g;
  let match;
  while ((match = casePattern.exec(body)) !== null) {
    types.add(match[1]);
  }
  if (types.size < 40) {
    throw new Error(`only ${types.size} mob types parsed from spawnMob; the parse is probably wrong`);
  }
  return types;
}
