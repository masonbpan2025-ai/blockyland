// Check which of a list of block texture names exist in the PrismarineJS asset mirror the project
// already downloads from, so a missing texture is discovered here rather than as a grey tile in game.
//
//   node scripts/block-parity/check-assets.mjs deepslate_coal_ore.png copper_ore.png ...
const BASE = 'https://raw.githubusercontent.com/PrismarineJS/minecraft-assets/master/data/1.20.2';

const names = process.argv.slice(2);
if (!names.length) {
  console.error('usage: node check-assets.mjs <texture.png> [...]');
  process.exit(2);
}

for (const name of names) {
  const url = `${BASE}/blocks/${name}`;
  try {
    const res = await fetch(url, { method: 'HEAD' });
    console.log(`${res.ok ? 'OK    ' : 'MISS  '} ${name}${res.ok ? ` (${res.headers.get('content-length')} bytes)` : ` -> ${res.status}`}`);
  } catch (err) {
    console.log(`ERROR  ${name} -> ${err.message}`);
  }
}
