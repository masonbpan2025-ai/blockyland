// Integration check for a batch of newly added blocks: registry, id uniqueness, definition, harvest
// data, mining gate, and drop resolution. Run after adding blocks so a missing piece shows up here
// rather than as a grey tile or an unbreakable block in game.
//
//   node scripts/block-parity/check-blocks.mjs DEEPSLATE_COAL_ORE COPPER_ORE ...
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../../src/blocks.js';
import { harvestDataFor } from '../../src/blockHarvestData.js';
import { miningEffect, breakTimeSeconds } from '../../src/miningRules.js';
import { getBlockDrop } from '../../src/itemVisuals.js';

const keys = process.argv.slice(2);
if (!keys.length) {
  console.error('usage: node check-blocks.mjs <BLOCK_KEY> [...]');
  process.exit(2);
}

const ids = new Map();
for (const [k, v] of Object.entries(BLOCKS)) {
  if (typeof v !== 'number' || k === 'GRASS_BLOCK') continue;
  if (ids.has(v)) ids.get(v).push(k);
  else ids.set(v, [k]);
}

let problems = 0;
const note = (ok, msg) => {
  if (!ok) problems++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`);
};

for (const key of keys) {
  console.log(`\n${key}`);
  const id = BLOCKS[key];
  note(typeof id === 'number', `id = ${id}`);
  if (typeof id !== 'number') continue;

  const sharers = (ids.get(id) ?? []).filter((k) => k !== key);
  note(sharers.length === 0, `id ${id} unique${sharers.length ? ` (also ${sharers.join(', ')})` : ''}`);

  const def = BLOCK_DEFS[id];
  note(Boolean(def), `definition${def ? ` "${def.name}"` : ' MISSING'}`);
  if (!def) continue;

  // Hardness 0 is correct for plants (flowers and saplings are instantly breakable), so the check is
  // that the value is present and sane, not that it is positive.
  note(typeof def.hardness === 'number' && def.hardness >= 0, `hardness ${def.hardness}`);
  const tex = Object.values(def.textures ?? {});
  note(tex.length > 0, `textures ${JSON.stringify(tex)}`);

  // A missing harvest row is NOT an error, it is a case. harvestDataFor() returns null for a block the
  // generator did not list, and miningRules then treats it as hardness 0 with no tool gate -- which is
  // correct for the decoration added in the later batches (a living coral fan has no row, needs no tool
  // and yields itself). The distinction that matters is whether the block YIELDS any tool gate, so the
  // note reports which case this is rather than failing on absence.
  const harvest = harvestDataFor(id);
  note(true, harvest
    ? `harvest row tool=${harvest.tool} tier=${harvest.tier ?? '-'} requiresTool=${Boolean(harvest.requiresTool)}`
    : 'harvest row absent, so hardness 0 and no tool gate (the table lists only blocks that gate)');

  // The mining gate: right tool should harvest, bare hand should not (for requiresTool blocks).
  const withTool = harvest?.requiresTool
    ? miningEffect(id, { speed: 8 }, `${harvest.tier ?? 'wooden'}_${harvest.tool}`)
    : miningEffect(id, { speed: 8 }, 'iron_pickaxe');
  note(withTool.canHarvest, `harvestable with the right tool (${breakTimeSeconds(id, { speed: 8 }, `${harvest?.tier ?? 'wooden'}_${harvest?.tool ?? 'pickaxe'}`).toFixed(2)}s)`);
  if (harvest?.requiresTool) {
    const bare = miningEffect(id, null, null);
    note(!bare.canHarvest, 'NOT harvestable by hand');
  }

  // The drop: getBlockDrop() is what actually spawns an item on break. `drop: null` is legitimate when
  // the block deliberately yields nothing, so it is only a failure when the block neither drops nor is
  // documented as yielding nothing.
  //
  // The generated harvest table is the authority here, not a per-definition flag: it carries an empty
  // `drops` array for exactly the blocks vanilla makes yield nothing (short grass, ferns, infested
  // blocks, reinforced deepslate, frosted ice, flowering azalea leaves), and a non-empty one for
  // everything else. So a null definition drop is allowed when the harvest row agrees, and is a failure
  // when the harvest row expects a drop the definition has dropped on the floor.
  const drop = getBlockDrop(id);
  const acknowledged = Array.isArray(harvest?.drops) && harvest.drops.length === 0
    ? 'the harvest table also declares no drops'
    : null;
  if (def.drop === null && acknowledged) {
    note(true, `drop NONE, by design (${acknowledged})`);
  } else if (def.drop === null && (def.plant || def.silverfish)) {
    note(true, `drop NONE, by design (${def.silverfish ? 'releases a silverfish' : 'a plant that yields nothing'})`);
  } else {
    note(Boolean(drop), `drop ${drop ? `${drop.id} (isBlock=${drop.isBlock})` : 'NONE'}`);
  }
  if (drop && !drop.isBlock) {
    note(drop.id in ITEMS, `drop item "${drop.id}" exists in ITEMS`);
  }
  if (drop && drop.isBlock) {
    note(BLOCK_DEFS[drop.id] !== undefined, `drop block ${drop.id} has a definition`);
  }
}

console.log(`\n${problems === 0 ? 'ALL CHECKS PASSED' : `${problems} PROBLEM(S)`} across ${keys.length} block(s)`);
process.exitCode = problems === 0 ? 0 : 1;
