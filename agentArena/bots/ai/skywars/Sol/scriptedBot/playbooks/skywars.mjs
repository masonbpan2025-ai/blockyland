import { objectivesOf, placeOf } from '../../skills/view.mjs';

const flat = (me, q) => Math.hypot(q.x - me.at.x, q.z - me.at.z);
const at = (q) => ({ x: q.at[0] + 0.5, y: q.at[1], z: q.at[2] + 0.5 });

export function chooseTarget(me, enemies) {
  return [...enemies].sort((a, b) => {
    const score = (q) => {
      const d = flat(me, q), height = Math.abs((q.y ?? me.at.y) - me.at.y);
      const crowd = enemies.filter((e) => e.id !== q.id && Math.hypot(e.x - q.x, e.z - q.z) < 7).length;
      return d + height * 1.3 + (q.health ?? 20) * 0.13 + crowd * 2.8 - (d <= 3.4 && height < 3 ? 30 : 0);
    };
    return score(a) - score(b);
  })[0] ?? null;
}

export async function playSkyWars({ view, skills }) {
  if (view.phase !== 'playing') { skills.resetClock('skywars'); skills.setFlag('solPath', null); return; }
  if (!view.me.canAct) return;
  const me = view.me, elapsed = skills.clock('skywars');
  const enemies = skills.enemies().filter((q) => !q.dead && (q.y ?? 31) > -3
    && ((q.y ?? me.at.y) >= me.at.y - 4 || skills.groundAt([q.x, q.y, q.z])));
  const closest = [...enemies].sort((a, b) => flat(me, a) - flat(me, b))[0];
  const distance = closest ? flat(me, closest) : Infinity;
  const foe = chooseTarget(me, enemies), foeD = foe ? flat(me, foe) : Infinity;
  const alive = view.players.filter((q) => q.alive !== false && q.id !== me.id).length;
  const hp = skills.health() + skills.absorption(), blocks = me.carrying.blocks;
  skills.heal();
  if (distance > 6) {
    const middle = [...view.places].filter((q) => q.kind === 'middle').sort((a, b) => Math.hypot(a.at[0] - me.at.x, a.at[2] - me.at.z) - Math.hypot(b.at[0] - me.at.x, b.at[2] - me.at.z))[0];
    if (await skills.escapeEnclosure(middle?.at)) return;
  }

  // A reachable upgrade takes priority over voluntarily walking into a fight without middle gear.
  const readyChest = objectivesOf(view, 'chest').find((q) => !q.looted && (q.ring === 'center' || q.ring === 'mid') && skills.chestInReach(q));
  if (readyChest && distance > 5.5 && !skills.isEating()) { await skills.lootObjective(readyChest, view.places); return; }
  if (distance < 11 && await skills.bridgeCover(enemies)) return;

  const nearby = enemies.filter((q) => flat(me, q) < 10 && Math.abs(q.y - me.at.y) < 4);
  const crowded = nearby.length >= 2 && alive > 1;
  if ((crowded && (hp < 16 || nearby.length >= 3)) || (skills.isEating() && distance < 7) || (hp < 12 && distance < 9 && alive > 1)) {
    const safe = skills.refuge(nearby.length ? nearby : enemies);
    if (safe) { skills.strikeNearby(); await skills.navigate(safe, { bridge: false, stopWithin: 0.4, summary: 'opening room from the group to recover' }); return; }
  }
  if (foe && foeD <= 5.5 && Math.abs(foe.y - me.at.y) < 3.5) { await skills.fight(foe); return; }

  // Prepare absorption before contact; projectiles must not starve this window.
  if (distance < 15 && distance > 6 && !skills.isEating() && skills.absorption() < 1 && me.carrying.count('golden_apple') > 0) {
    if (skills.startEating('golden_apple')) { skills.say('preparing a golden apple before contact'); await skills.pauseStep(); return; }
  }
  if (skills.isEating()) { await skills.pauseStep(); return; }
  for (const q of enemies) {
    const d = flat(me, q);
    if (d <= 18 && skills.setting('throwables') && skills.throwAtFoe(q, d)) return;
  }

  const chests = objectivesOf(view, 'chest').filter((q) => !q.looted && !skills.skipped(q));
  const spawn = placeOf(view, 'spawn', { slot: me.slot });
  const home = spawn ? { x: spawn.at[0], z: spawn.at[2] } : me.spawnPoint;
  const own = chests.filter((q) => q.slot != null ? q.slot === me.slot : q.ring === 'island' && Math.hypot(q.at[0] - home.x, q.at[2] - home.z) < 8);
  const good = chests.filter((q) => q.ring === 'center' || q.ring === 'mid');
  const scoreChest = (c) => {
    const p = at(c), travel = skills.travelCost(p);
    const enemyD = enemies.length ? Math.min(...enemies.map((q) => Math.hypot(q.x - p.x, q.z - p.z))) : 99;
    const crowd = enemies.filter((q) => Math.hypot(q.x - p.x, q.z - p.z) < 11).length;
    return travel.cost + Math.max(0, 13 - enemyD) * (alive > 1 ? 3 : 1.5) + crowd * (alive > 1 ? 8 : 3)
      + (travel.gaps + 3 > blocks ? 45 : 0) + (c.ring === 'center' ? -4 : 0);
  };
  const nearest = (xs) => [...xs].sort((a, b) => scoreChest(a) - scoreChest(b))[0];
  const weapon = skills.bestWeaponDamage(), armor = skills.armorPoints();
  const homeChest = nearest(own), goodChest = nearest(good);
  const closeToHome = Math.hypot(me.at.x - home.x, me.at.z - home.z) < 11;
  if (homeChest && (weapon < 5 || blocks < 14 || armor < 3 || !goodChest)
    && (closeToHome || !goodChest) && (distance > 7 || weapon < 4)) { await skills.lootObjective(homeChest, view.places); return; }

  // The guest claims drops on approach. Divert only for useful items on uncontested ground.
  const drops = skills.drops().filter((q) => Math.abs(q.y - me.at.y) < 2.5 && flat(me, q) < 10
    && skills.groundAt([q.x, q.y, q.z]) && enemies.every((e) => Math.hypot(e.x - q.x, e.z - q.z) > 9)
    && (/sword|apple|helmet|chestplate|leggings|boots|pearl/.test(String(q.item.id))));
  if (drops.length && distance > 10) {
    const d = drops.sort((a, b) => flat(me, a) - flat(me, b))[0];
    await skills.navigate([d.x, d.y, d.z], { bridge: false, stopWithin: 0.8, summary: 'recovering equipment from safe ground' }); return;
  }

  const urgency = (view.timeLeft != null && view.timeLeft < 65) || elapsed > 410;
  if (goodChest && (blocks >= 3 || skills.travelCost(at(goodChest)).gaps === 0) && distance > 5.5 && !urgency
    && (armor < 16 || weapon < 7 || me.carrying.count('golden_apple') < 2 || alive > 1)) {
    await skills.lootObjective(goodChest, view.places); return;
  }
  if (foe) {
    if (distance > 10 && hp < 16 && !urgency) {
      skills.heal();
      if (!skills.isEating() && skills.absorption() < 1 && me.carrying.count('golden_apple') > 0) skills.startEating('golden_apple');
      if (skills.hasFood()) skills.startEating(skills.bestFood());
      if (skills.isEating()) { await skills.pauseStep(); return; }
    }
    const dy = Math.abs(foe.y - me.at.y);
    if (foeD < 10 && dy < 2.5) { await skills.fight(foe); return; }
    if (!skills.blocked([me.at.x, me.at.y + 1.52, me.at.z], [foe.x, foe.y + 1, foe.z]) && skills.shoot(foe)) { await skills.pauseStep(); return; }
    await skills.navigate([foe.x, foe.y, foe.z], { bridge: blocks > 0, stopWithin: 3, places: view.places, summary: `approaching isolated ${foe.name ?? foe.id}` }); return;
  }
  const visits = skills.flag('solVisits') ?? {};
  const targets = view.players.filter((q) => q.id !== me.id && q.alive !== false).map((q) => placeOf(view, 'spawn', { slot: q.slot })).filter(Boolean);
  targets.sort((a, b) => (visits[a.id] ?? -1000) - (visits[b.id] ?? -1000) || skills.travelCost(at(a)).cost - skills.travelCost(at(b)).cost);
  const search = targets[0] ?? view.places.find((q) => q.kind === 'middle');
  if (search) {
    if (Math.hypot(search.at[0] - me.at.x, search.at[2] - me.at.z) < 4) { visits[search.id] = elapsed; skills.setFlag('solVisits', visits); }
    await skills.navigate(search.at, { bridge: blocks > 0, stopWithin: 2, places: view.places, summary: 'searching survivor landmarks' });
  }
}
