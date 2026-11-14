import { BLOCKS, BED_BLOCK_IDS, NAME_BY_BLOCK, chestReach, breakMs } from '../../../../../../packages/blockyland-mcp/guestPeer.js';

const same = (a, b) => a && b && a.every((v, i) => v === b[i]);
const directions = [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
const nameOf = (id) => BED_BLOCK_IDS.has(id) ? 'bed' : NAME_BY_BLOCK.get(id) ?? '';

/** Score real owned tools by the game's own Java break-time function, including Efficiency and Haste. */
export function miningTool(bot, id) {
  const team = bot.me?.()?.team;
  const context = { haste: bot.bedwarsState?.teams?.find((t) => t.id === team)?.upgrades?.haste ?? 0,
    onGround: bot.onGround !== false };
  const held = bot.inventory.getActiveItem?.() ?? null;
  let tool = held, ms = breakMs(nameOf(id), held, context);
  for (const item of bot.inventory.allSlots()) {
    if (!item || !(/_(pickaxe|axe)$/.test(String(item.id)) || item.id === 'shears')) continue;
    const cost = breakMs(nameOf(id), item, context);
    if (cost < ms) { ms = cost; tool = item; }
  }
  return { tool, ms };
}

export function equipMiningTool(bot, at) {
  const best = miningTool(bot, bot.getVoxel(...at));
  if (best.tool && bot.inventory.getActiveItem?.()?.id !== best.tool.id && Array.isArray(bot.inventory.hotbar)) bot.holdItem(best.tool.id);
  return best;
}

/** Choose one reachable face, then keep its covering block until it is gone. Never alternate cover and bed digs. */
export function bedDigPlan(bot, foot, { reachOnly = true } = {}) {
  const base = bot.bedwarsArena?.bases?.find((b) => same(b.bed?.foot, foot) || same(b.bed?.head, foot));
  const halves = base ? [base.bed.foot, base.bed.head] : [foot,
    ...directions.filter((d) => d[1] === 0).map((d) => foot.map((v, i) => v + d[i])).filter((p) => BED_BLOCK_IDS.has(bot.getVoxel(...p)))];
  const reach = (p) => chestReach(bot.position, { x: p[0], y: p[1], z: p[2] });
  const around = (p) => directions.map((d) => p.map((v, i) => v + d[i])).filter((p) => !halves.some((h) => same(h, p)));
  const open = halves.filter((p) => (!reachOnly || reach(p) <= 4.45) && around(p).some((q) => bot.getVoxel(...q) === BLOCKS.AIR))
    .sort((a, b) => reach(a) - reach(b));
  if (open.length) return { at: open[0], bed: true, ms: miningTool(bot, bot.getVoxel(...open[0])).ms };
  const covers = [...new Map(halves.flatMap(around).map((p) => [p.join(','), p])).values()]
    .filter((p) => (!reachOnly || reach(p) <= 4.45) && bot.getVoxel(...p) !== BLOCKS.AIR)
    .map((at) => ({ at, bed: false, ...miningTool(bot, bot.getVoxel(...at)), distance: reach(at) }));
  const continuing = covers.find((p) => same(p.at, bot.digTarget));
  return continuing ?? covers.sort((a, b) => a.ms - b.ms || a.distance - b.distance)[0] ?? null;
}
