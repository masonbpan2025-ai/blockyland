import fs from 'fs';
import path from 'path';

const PUBLIC_ITEMS_DIR = path.resolve('public/assets/items');
const DIST_ITEMS_DIR = path.resolve('dist/assets/items');
const PUBLIC_BLOCKS_DIR = path.resolve('public/assets/blocks');

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Node-Audit' } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return await res.json();
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Node-Audit' } });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  console.log('=== Minecraft Item Look & Wiki Parity Audit ===\n');

  console.log('1. Fetching authentic asset manifests from PrismarineJS (1.21.4 & 1.20.2)...');
  const [items21, items20, blocks21] = await Promise.all([
    fetchJSON('https://api.github.com/repos/PrismarineJS/minecraft-assets/contents/data/1.21.4/items'),
    fetchJSON('https://api.github.com/repos/PrismarineJS/minecraft-assets/contents/data/1.20.2/items'),
    fetchJSON('https://api.github.com/repos/PrismarineJS/minecraft-assets/contents/data/1.21.4/blocks'),
  ]);

  const itemMap = new Map();
  // 1.20.2 first, then 1.21.4 overwrites with newer/canonical textures
  for (const f of items20) itemMap.set(f.name, f.download_url);
  for (const f of items21) itemMap.set(f.name, f.download_url);

  const blockMap = new Map();
  for (const f of blocks21) blockMap.set(f.name, f.download_url);

  console.log(`Found ${itemMap.size} unique authentic item textures and ${blockMap.size} block textures.\n`);

  console.log('2. Auditing and updating items in public/assets/items/...');
  let updatedCount = 0;
  let skippedIdentical = 0;
  const updatedList = [];

  // Update in concurrent batches of 20
  const itemNames = Array.from(itemMap.keys());
  for (let i = 0; i < itemNames.length; i += 20) {
    const chunk = itemNames.slice(i, i + 20);
    await Promise.all(chunk.map(async (filename) => {
      const url = itemMap.get(filename);
      const localPath = path.join(PUBLIC_ITEMS_DIR, filename);
      const exists = fs.existsSync(localPath);
      let localBuf = exists ? fs.readFileSync(localPath) : null;

      try {
        const remoteBuf = await fetchBuffer(url);
        if (!localBuf || !localBuf.equals(remoteBuf)) {
          fs.writeFileSync(localPath, remoteBuf);
          if (fs.existsSync(DIST_ITEMS_DIR)) {
            fs.writeFileSync(path.join(DIST_ITEMS_DIR, filename), remoteBuf);
          }
          updatedCount++;
          updatedList.push({ filename, oldSize: localBuf ? localBuf.length : 0, newSize: remoteBuf.length });
        } else {
          skippedIdentical++;
        }
      } catch (err) {
        console.warn(`Warning: failed to update ${filename}:`, err.message);
      }
    }));
  }

  console.log(`Updated ${updatedCount} items with authentic vanilla wiki textures (${skippedIdentical} already matched).`);

  // Specific alias / composite fixes
  console.log('\n3. Applying composite and legacy alias mappings...');
  const aliases = [
    // generic chest_boat uses oak_chest_boat
    { target: 'chest_boat.png', source: 'oak_chest_boat.png' },
    // generic bed uses red_bed
    { target: 'bed.png', source: 'red_bed.png' },
    // scute alias for turtle_scute
    { target: 'scute.png', source: 'turtle_scute.png' },
  ];

  for (const { target, source } of aliases) {
    const srcPath = path.join(PUBLIC_ITEMS_DIR, source);
    if (fs.existsSync(srcPath)) {
      const buf = fs.readFileSync(srcPath);
      fs.writeFileSync(path.join(PUBLIC_ITEMS_DIR, target), buf);
      if (fs.existsSync(DIST_ITEMS_DIR)) {
        fs.writeFileSync(path.join(DIST_ITEMS_DIR, target), buf);
      }
      console.log(`Copied authentic ${source} -> ${target}`);
    }
  }

  console.log('\n=== Item Audit & Update Completed Successfully ===');
}

main().catch(console.error);
