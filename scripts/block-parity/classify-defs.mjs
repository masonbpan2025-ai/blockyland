// Classify every block definition by the shape/behaviour flags it carries, so the
// "implemented as a plain cube" share can be stated precisely.
import { BLOCKS, BLOCK_DEFS } from '../../src/blocks.js';

const FLAGS = [
  'stair', 'slab', 'fence', 'wall', 'pressurePlate', 'button', 'fenceGate', 'banner',
  'sign', 'hangingSign', 'rod', 'rail', 'flowerPot', 'pane', 'carpet', 'candle', 'chain',
  'bed', 'door', 'trapdoor', 'plant', 'shape', 'torch', 'cube',
];

const counts = Object.fromEntries(FLAGS.map((f) => [f, 0]));
const shaped = [];
const plain = [];
for (const [id, def] of Object.entries(BLOCK_DEFS)) {
  if (!def) continue;
  const present = FLAGS.filter((f) => def[f] !== undefined && def[f] !== false);
  for (const f of present) counts[f]++;
  const label = def.name || id;
  if (present.length) shaped.push(`${label} [${present.join(',')}]`);
  else plain.push(label);
}

console.log('total defs:', Object.keys(BLOCK_DEFS).length);
console.log('defs carrying a shape/behaviour flag:', shaped.length);
console.log('defs that are plain full cubes (no flag):', plain.length);
console.log('\nflag counts:');
for (const [f, n] of Object.entries(counts)) if (n) console.log('  ' + f.padEnd(14) + n);
console.log('\nsample plain-cube defs:', plain.slice(0, 40).join(', '));
