import { objectivesOf } from '../../skills/view.mjs';
import { crossingBudget } from '../navigation.mjs';
import { BLOCKS } from '../../../../../../../packages/blockyland-mcp/guestPeer.js';
import { upgradeCost } from '../../../../../../../src/mods/bedwars/shop.js';

const near = (me, x, z) => Math.hypot(x - me.at.x, z - me.at.z);
const active = (view) => (view.players ?? []).filter((p) => p.id === view.me.id
  || (p.team === view.me.team && (p.alive || p.respawnIn != null)))
  .sort((a, b) => String(a.name).localeCompare(String(b.name)) || a.id.localeCompare(b.id));
export function teamRole(view) {
  const mates = active(view), rank = Math.max(0, mates.findIndex((p) => p.id === view.me.id));
  if (mates.length <= 1) return 'solo';
  if (rank === 0) return 'defender';
  if (mates.length >= 3 && rank === 1) return 'collector';
  return 'rusher';
}
export function rushPartners(view) {
  const mates = active(view);
  return mates.slice(mates.length >= 3 ? 2 : 1).filter((p) => p.id !== view.me.id).map((p) => p.id);
}
export function flankVia(gens, from, to, { detour = 1.4, middle = 13 } = {}) {
  const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  return gens.map((g) => ({ id: g.id, x: g.at[0], y: g.at[1], z: g.at[2] }))
    .map((g) => ({ ...g, way: d(from, g) + d(g, to) }))
    .filter((g) => Math.hypot(g.x, g.z) >= middle && g.way <= d(from, to) * detour)
    .sort((a, b) => a.way - b.way)[0] ?? null;
}
export function bedCover(foot, head) {
  const halves = [foot, head], out = [];
  for (const [x, y, z] of halves) for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const c = [x + dx, y + dy, z + dz];
    if (!halves.some((h) => h.every((v, i) => v === c[i])) && !out.some((h) => h.every((v, i) => v === c[i]))) out.push(c);
  }
  return out;
}
/** Eight hard inner faces, four hard roof cells, and an attached wool outer shell. */
export function bedDefence(foot, head) {
  const inner = bedCover(foot, head), halves = [foot, head], outer = [];
  for (const h of halves) for (let dy = 0; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    const at = [h[0] + dx, h[1] + dy, h[2] + dz];
    const d = Math.min(...halves.map((p) => Math.abs(at[0] - p[0]) + Math.abs(at[1] - p[1]) + Math.abs(at[2] - p[2])));
    if (d === 2 && !outer.some((p) => p.every((v, i) => v === at[i]))) outer.push(at);
  }
  const roof = [...outer].sort((a, b) => b[1] - a[1] || a[0] - b[0] || a[2] - b[2]).slice(0, 4);
  return [...inner.map((at) => ({ at, material: 'end_stone', layer: 1 })), ...outer.map((at) => ({ at,
    material: roof.some((p) => p.every((v, i) => v === at[i])) ? 'end_stone' : 'wool', layer: 2 }))];
}
export function matchStage(elapsed, limit, bedStanding) {
  const end = limit > 0 ? limit : 600;
  return { limit: end, rally: elapsed >= end * 0.45 || !bedStanding, closing: elapsed >= end * 0.6,
    lastShop: elapsed < end * 0.53, raid: bedStanding && elapsed < end * 0.4 };
}
const UPGRADES = [['protection', 1], ['sharpness', 1], ['protection', 2], ['protection', 3], ['protection', 4]];
const nextUpgrade = (skills, team) => UPGRADES.find(([key, level]) => skills.teamUpgrade(team, key) < level);
export function chooseRaid(beds, foes, mates, origin, team) {
  return beds.filter((b) => b.team !== team && b.state === 'standing')
    .map((b) => {
      const defenders = foes.filter((f) => Math.hypot(f.x - b.at[0], f.z - b.at[2]) < 16).length;
      const d = Math.hypot(origin.x - b.at[0], origin.z - b.at[2]);
      return { bed: b, defenders, d, score: d + defenders * 18 };
    }).filter((b) => b.d < 55 && b.defenders < 2)
    .sort((a, b) => a.score - b.score || a.bed.team.localeCompare(b.bed.team))[0]?.bed ?? null;
}

export async function playBedWars({ view, skills }) {
  const me = view.me;
  if (view.phase !== 'playing') {
    skills.resetClock('bedwars');
    skills.setFlag('solGen', null);
    skills.setFlag('solRaid', null);
    skills.setFlag('solOuterSince', null);
    if (view.phase === 'lobby' && !me.team) {
      const counts = new Map((view.teams ?? []).map((t) => [t.id, 0]));
      for (const p of view.players) if (counts.has(p.team)) counts.set(p.team, counts.get(p.team) + 1);
      skills.chooseTeam([...counts].sort((a, b) => a[1] - b[1])[0]?.[0] ?? 'blue');
    }
    return;
  }
  if (!me.canAct) return;
  const team = me.team, role = teamRole(view), beds = objectivesOf(view, 'bed');
  const bed = beds.find((b) => b.team === team), forge = objectivesOf(view, 'generator', { team })[0];
  if (!bed || !forge) return;
  const elapsed = Math.max(view.elapsed ?? 0, skills.clock('bedwars'));
  const standing = bed.state === 'standing';
  const stage = matchStage(elapsed, skills.timeLimit(), standing);
  const deployAt = Math.min(135, stage.limit * 0.375);
  const deployed = elapsed >= deployAt;
  const mid = skills.middle(), c = me.carrying;
  const homeDist = near(me, forge.at[0], forge.at[2]), midDist = near(me, mid.x, mid.z);
  const atHome = homeDist < 17;
  const mates = skills.teammates();
  const foes = skills.enemies(), nearest = foes[0] ?? null;
  const foeDist = nearest ? near(me, nearest.x, nearest.z) : Infinity;
  const zone = skills.zone(), exposure = skills.inVoid();
  const distanceFromZone = zone ? near(me, zone.x, zone.z) : 0;
  const emergency = zone && (exposure > 0 || distanceFromZone > zone.radius - 7 || me.at.y < zone.floor + 2);
  const travel = (at, options = {}) => skills.travel(at, { bridge: c.blocks > 0, ...options });
  const forgeStep = (summary = 'splitting the forge with my squad') => skills.collectIfReached(forge.id, forge.at, { bridge: c.blocks > 0, stopWithin: 0.65, summary });
  const rallyStep = () => travel([mid.x + 0.5, mid.y, mid.z + 0.5], { stopWithin: 2, summary: 'rallying on the middle before the closing void' });
  const sword = skills.bestWeaponDamage(), armor = me.kit?.armor ?? 0;
  const shop = me.ability.shop;
  const head = bed.head ? String(bed.head).split(',').map(Number) : (() => {
    const f = skills.baseFacing(team); return [bed.at[0] + f.x, bed.at[1], bed.at[2] + f.z];
  })();
  const defending = role === 'defender' && !deployed && standing;
  const defence = defending && shop === 'full' ? bedDefence(bed.at, head) : [];
  const hardGaps = defence.filter((p) => p.material === 'end_stone' && skills.isAir(p.at)).length;
  const stone = c.count(BLOCKS.END_STONE) + c.count('end_stone');
  const canShop = atHome && (!stage.closing || distanceFromZone < (zone?.radius ?? 0) - 20);
  skills.heal();
  // Host-counted exposure always outranks a tempting opponent.
  if (emergency) { if (nearest && foeDist < 3) skills.strike(nearest); await rallyStep(); return; }
  if (skills.isEating() && foeDist > 4.5) { await skills.pauseStep(); return; }
  if (!skills.isEating() && c.count('golden_apple') && skills.absorption() < 1
    && ((foeDist > 6 && foeDist < 16) || skills.health() < 16 && foeDist > 5)) {
    if (skills.startEating('golden_apple')) { await skills.pauseStep(); return; }
  }
  if (!stage.rally) {
    const reachable = beds.find((b) => b.team !== team && b.state === 'standing'
      && near(me, b.at[0] + 0.5, b.at[2] + 0.5) < 4 && Math.abs(me.at.y - b.at[1]) < 2);
    if (reachable && !(foeDist < 3.5 && skills.health() < 12)) {
      await (skills.attackBed ?? skills.breakBed)(reachable.at, { summary: `digging the ${reachable.team} bed with the right tool` }); return;
    }
  }
  // Close enemies that teammates can hit are the best targets.
  const close = foes.filter((f) => near(me, f.x, f.z) <= 7 && Math.abs((f.y ?? me.at.y) - me.at.y) < 4);
  let focus = close.map((f) => ({ f, score: near(me, f.x, f.z) + (f.health ?? 20) * 0.1
    - mates.filter((m) => Math.hypot(m.x - f.x, m.z - f.z) < 5).length * 1.5 }))
    .sort((a, b) => a.score - b.score)[0]?.f;
  if (stage.rally && skills.focusEnemy) focus = skills.focusEnemy(foes, mid, Math.max(0, active(view).findIndex((p) => p.id === me.id)) % 2) ?? null;
  const safeCenter = midDist < 6 && me.at.y >= mid.y - 0.25;
  const focusInMiddle = focus && Math.hypot(focus.x - mid.x, focus.z - mid.z) <= 4.75;
  if (focus && (!stage.rally || safeCenter && focusInMiddle && near(me, focus.x, focus.z) <= 7)) {
    await skills.fight(focus); return;
  }
  if (stage.rally && nearest && foeDist < 3) skills.strike(nearest);
  if ((!stage.rally || safeCenter) && nearest && foeDist >= 8 && foeDist <= 30 && c.has('bow')
    && skills.wideAt(me.at.x, me.at.y, me.at.z) && skills.shoot(nearest)) { await skills.pauseStep(); return; }
  const buy = (key) => skills.buy(key, 1).ok;
  const budget = Math.min(160, Math.max(64, crossingBudget(me.at, mid, skills.voidCellsToward(mid.x, mid.z))));
  if (canShop) {
    const wantBlocks = c.blocks < (role === 'defender' && !stage.rally ? 48 : budget);
    let wanted = null;
    if (hardGaps > stone && c.iron >= 24) wanted = 'end_stone';
    else if (hardGaps > 0 && stone === 0) wanted = null; // save the first 24 iron for a complete hard layer
    else if (c.blocks < 16 && c.iron >= 4) wanted = 'wool';
    else if (shop !== 'wool' && sword < 5 && c.iron >= 10) wanted = 'stone_sword';
    else if (wantBlocks && c.iron >= 4) wanted = 'wool';
    else if (shop === 'full' && c.emerald >= 3 && sword < 7) wanted = 'diamond_sword';
    else if (shop !== 'wool' && c.gold >= 7 && sword < 6 && (role !== 'defender' || shop !== 'full' || c.has('bow'))) wanted = 'iron_sword';
    else if (shop === 'full' && c.gold >= 12 && armor < 2 && (role !== 'defender' || c.has('bow'))) wanted = 'iron_armor';
    else if (shop !== 'wool' && c.iron >= 24 && armor < 1) wanted = 'chain_armor';
    else if (shop === 'full' && c.gold >= 14 && !c.has('bow') && role === 'defender' && armor >= 1) wanted = 'bow';
    else if (shop === 'full' && c.has('bow') && c.count('arrow') < 24 && c.gold >= 2) wanted = 'arrows';
    else if (shop === 'full' && role === 'rusher' && standing && stage.raid && armor >= 1 && (me.kit?.pickaxe ?? 0) < 1 && c.iron >= 10) wanted = 'pickaxe';
    else if (shop === 'full' && role === 'rusher' && me.id === active(view)[2]?.id && standing && stage.raid && armor >= 1 && !me.kit?.shears && c.iron >= 20) wanted = 'shears';
    else if (shop === 'full' && role === 'rusher' && me.id === active(view)[2]?.id && standing && stage.raid && armor >= 1 && me.kit?.shears && (me.kit?.pickaxe ?? 0) < 2 && c.iron >= 10) wanted = 'pickaxe';
    else if (shop === 'full' && (armor >= 2 || role === 'defender' && armor >= 1 && c.has('bow')) && (role !== 'defender' || c.has('bow')) && c.gold >= 3 && c.count('golden_apple') < (stage.rally ? 4 : 1)) wanted = 'gapple';
    else if (shop === 'full' && c.emerald >= 6 && armor < 3) wanted = 'diamond_armor';
    const upgrade = nextUpgrade(skills, team);
    if (shop === 'full' && upgrade && c.diamond >= upgradeCost(upgrade[0], upgrade[1], 'large')) wanted = upgrade[0];
    if (wanted) {
      if (buy(wanted)) { skills.say(`equipping the squad: ${wanted}`); return; }
      const keeper = skills.baseKeepers(team)?.[wanted === upgrade?.[0] ? 'upgrades' : 'shop'];
      if (keeper) { await travel([keeper.x, keeper.y, keeper.z], { stopWithin: 3, summary: `at our keeper for ${wanted}` }); return; }
    }
  }
  // No respawn leaves home without new blocks. All four converge before beds vanish.
  const ready = c.blocks >= budget && (shop === 'wool' || sword >= 5);
  if (stage.rally) {
    const mustRestock = !ready && stage.lastShop || c.blocks < 16 && elapsed < stage.limit * 0.66;
    if (atHome && mustRestock && foeDist > 10) { await forgeStep('final supplies for the middle'); return; }
    if (!safeCenter) { await rallyStep(); return; }
    const finalFoe = foes.find((f) => Math.hypot(f.x - mid.x, f.z - mid.z) < Math.min(4.75, zone ? zone.radius - 2 : 4.75)
      && Math.abs((f.y ?? mid.y) - mid.y) < 4);
    if (nearest && foeDist >= 8 && foeDist <= 30 && c.has('bow') && skills.shoot(nearest)) { await skills.pauseStep(); return; }
    if (finalFoe && near(me, finalFoe.x, finalFoe.z) < 9) { await skills.fight(finalFoe); return; }
    await travel([mid.x + 0.5, mid.y, mid.z + 0.5], { bridge: false, stopWithin: 1.5, summary: 'holding the inner middle with the squad' });
    return;
  }
  // Completely close the two bed halves before spending more on defence.
  if ((role === 'defender' || role === 'solo') && !deployed && standing && c.blocks > 0) {
    const cells = defence.length ? defence : bedCover(bed.at, head).map((at) => ({ at, material: null, layer: 1 }));
    const innerPending = cells.filter((p) => p.layer === 1 && skills.isAir(p.at)).length;
    const outerSince = skills.flag('solOuterSince');
    const gaps = cells.filter((p) => skills.isAir(p.at) && (p.material !== 'end_stone' || stone > 0)
      && (p.layer === 1 || innerPending === 0) && (p.material !== 'wool' || c.blocks > stone)
      && (p.layer === 1 || p.material !== 'wool' || outerSince == null || elapsed - outerSince < 12))
      .sort((a, b) => a.layer - b.layer || a.at[1] - b.at[1]
        || near(me, a.at[0] + 0.5, a.at[2] + 0.5) - near(me, b.at[0] + 0.5, b.at[2] + 0.5));
    if (gaps.length) {
      const { at: p, material } = gaps[0];
      if (material === 'wool' && outerSince == null) skills.setFlag('solOuterSince', elapsed);
      if (near(me, p[0] + 0.5, p[2] + 0.5) > 3) {
        await travel([p[0] + 0.5, bed.at[1], p[2] + 0.5], { bridge: false, direct: true, stopWithin: 2, summary: 'covering our bed' }); return;
      }
      if (skills.place(p, material)?.ok) { skills.say(`closing the ${material ?? 'wool'} bed cover (${gaps.length - 1} gaps)`); return; }
    }
  }
  const intruder = foes.find((f) => Math.hypot(f.x - bed.at[0], f.z - bed.at[2]) < 15);
  if (intruder && near(me, bed.at[0], bed.at[2]) < 19) {
    await skills.fight(intruder, { summary: 'intercepting the attack on our bed' }); return;
  }
  if (role === 'collector') {
    const upgrade = nextUpgrade(skills, team), cost = upgrade ? upgradeCost(upgrade[0], upgrade[1], 'large') : Infinity;
    if ((c.diamond >= cost || c.emerald >= 3) && stage.lastShop) { await forgeStep('bringing diamonds and emeralds home'); return; }
    if (!deployed || c.diamond > 0 && c.diamond < cost && elapsed < stage.limit * 0.4) {
    if (c.blocks < 24 || sword < 5 || atHome && (!ready || elapsed < 75 || armor < 1 && elapsed < 110)) { await forgeStep('equipping for the diamond route'); return; }
    const gens = objectivesOf(view, 'generator', { team: null }).filter((g) => !g.id.startsWith('f-'));
    let gen = gens.find((g) => g.id === skills.flag('solGen'));
    if (!gen || near(me, gen.at[0], gen.at[2]) < 1.3) {
      const score = (g) => near(me, g.at[0], g.at[2]) + (g.stock?.diamond ? -12 : g.stock?.emerald ? -8 : 18)
        + (g.resource === 'emerald' && c.diamond < cost ? 8 : 0);
      gen = gens.filter((g) => (g.stock?.diamond ?? 0) + (g.stock?.emerald ?? 0) > 0 || g.resource === 'diamond')
        .sort((a, b) => score(a) - score(b))[0];
      skills.setFlag('solGen', gen?.id);
    }
    if (gen) { await skills.collectIfReached(gen.id, gen.at, { bridge: true, stopWithin: 0.6, summary: `diamond economy: ${gen.id}` }); return; }
    }
  }
  if (role === 'defender' && !deployed || role === 'solo' && elapsed < deployAt) { await forgeStep(); return; }
  if (role === 'defender' && shop === 'full' && atHome && (!c.has('bow') || c.count('arrow') < 6) && elapsed < deployAt + 30) {
    await forgeStep('stocking the squad archer before joining the middle'); return;
  }
  const armourGoal = role === 'defender' && shop === 'full' && c.has('bow') ? 1 : 2;
  if (atHome && (!ready || elapsed < deployAt || armor < armourGoal && elapsed < deployAt + 25)) { await forgeStep(); return; }
  if (c.blocks < 12 && midDist > 14 && elapsed < stage.limit * 0.38) { await forgeStep('replenishing the bridge blocks'); return; }
  const partnerIds = new Set(rushPartners(view));
  const partner = mates.find((m) => partnerIds.has(m.id));
  if (partner && near(me, partner.x, partner.z) > 9 && midDist < 10 && foeDist > 12) {
    const since = skills.flag('solWait') ?? elapsed;
    skills.setFlag('solWait', since);
    if (elapsed - since < 12) { await travel([mid.x + 0.5, mid.y, mid.z + 0.5], { stopWithin: 2.5, summary: 'rallying the fighter pair' }); return; }
  } else skills.setFlag('solWait', null);
  if (!stage.raid || atHome || skills.health() < 12) skills.setFlag('solRaid', null);
  let raid = stage.raid ? beds.find((b) => b.team === skills.flag('solRaid') && b.state === 'standing') : null;
  // A raid goes as a pair; a team of one or two has no rush partner, so its player raids alone (agentArena/bots/ai/CHANGES.md).
  const paired = partner ? near(me, partner.x, partner.z) < 10 : active(view).length < 3;
  if (!raid && stage.raid && midDist < 12 && paired && c.blocks >= 80 && skills.health() > 17) {
    const candidate = chooseRaid(beds, foes, mates, { x: mid.x, z: mid.z }, team);
    const digTime = candidate ? (skills.bedDigInfo?.(candidate.at)?.ms ?? 1200) / 1000 : 0;
    const raidTime = candidate ? 40 + Math.hypot(candidate.at[0] - mid.x, candidate.at[2] - mid.z) * 0.8 + digTime : Infinity;
    if (candidate && digTime <= 12 && elapsed + raidTime < stage.limit * 0.4) {
      raid = candidate;
      skills.setFlag('solRaid', raid.team);
    }
  }
  if (raid && c.blocks >= 16 && skills.health() > 12) {
    await travel([raid.at[0] + 0.5, raid.at[1], raid.at[2] + 0.5], { stopWithin: 2.5, summary: `paired raid on exposed ${raid.team} bed` }); return;
  }
  const emeraldGen = objectivesOf(view, 'generator', { team: null }).filter((g) => (g.stock?.emerald ?? 0) > 0 && near(me, g.at[0], g.at[2]) < 12)
    .sort((a, b) => near(me, a.at[0], a.at[2]) - near(me, b.at[0], b.at[2]))[0];
  if (emeraldGen) { await skills.collectIfReached(emeraldGen.id, emeraldGen.at, { bridge: true, stopWithin: 0.65, summary: 'securing the middle emeralds' }); return; }
  if (c.emerald >= 3 && elapsed < stage.limit * 0.33 && foeDist > 15) { await forgeStep('turning emeralds into a diamond sword'); return; }
  await rallyStep();
}
