// SkyWars, houseBotDs's brain as a playbook over the general view and the skills only. Decision for decision the old
// brainSkyWars: the same priorities in the same order, with the same distances and the same skills called.
//
// 1. A fight I am in -- or one walking up to me -- comes first.
// 2. A foe on narrow ground within a throw's range: one clean hit there is a fall.
// 3. An apple down before a melee I can see coming.
// 4. From 3:20 on the clock, go to the other player: a round not won scores nothing.
// 5. Home chests only while they still buy something the middle cannot: work, blocks, armour.
// 6. The middle's chests, when no foe is within 9 and I have 4 blocks or more to bridge with.
// 7. Nobody seen: hunt where the other player started, else hold the middle.
import {
  objectivesOf, placeOf,
} from '../../skills/view.mjs';

const flat = (me, x, z) => Math.hypot((x ?? 0) - me.at.x, (z ?? 0) - me.at.z);

/** Where another player started (their island): where a hidden foe has to be, nearest first. */
function enemyPlace(view) {
  const me = view.me;
  let best = null, bestD = Infinity;
  for (const q of view.players) {
    if (q.id === me.id || q.slot === me.slot || q.alive === false) continue;
    if (q.slot === null || q.slot === undefined) continue;
    const sp = placeOf(view, 'spawn', { slot: q.slot });
    if (!sp) continue;
    const d = flat(me, sp.at[0], sp.at[2]);
    if (d < bestD) { bestD = d; best = { x: sp.at[0], y: sp.at[1], z: sp.at[2], name: q.name || q.id }; }
  }
  return best;
}

export async function playSkyWars({ view, skills }) {
  if (view.phase !== 'playing') { skills.resetClock('skywars'); return; }
  if (!view.me.canAct) return;
  const me = view.me;

  skills.heal();

  const elapsed = skills.clock('skywars');
  const enemies = skills.enemies();
  const foe = enemies[0] ?? null;
  const foeDist = foe ? flat(me, foe.x, foe.z) : Infinity;

  // 1. A fight I am in -- or one walking up to me -- comes first.
  if (foe && foeDist <= 8) { await skills.fight(foe); return; }
  // 1b. The closing zone: inside it before anything else, or the void takes me.
  const zoneWalk = skills.keepInZone();
  if (zoneWalk) { await zoneWalk; return; }
  // A foe on narrow ground within a throw's range: one clean hit there is a fall (normal and hard).
  if (foe && foeDist <= 18 && skills.setting('throwables') && skills.throwAtFoe(foe, foeDist)) {
    skills.equipBattleGear();
    return;
  }

  // An apple down before a melee I can see coming, with the foe 9-12 blocks out and closing.
  if (foe && foeDist <= 12 && !skills.isEating() && skills.absorption() < 1 && skills.health() > 14
    && me.carrying.count('golden_apple') > 0) {
    if (skills.startEating('golden_apple')) {
      skills.say('eating a golden apple before the fight');
      await skills.pauseStep();
      return;
    }
  }

  // 2. The clock: take the refill wave, then from 3:20 go to the other player.
  if (foe && elapsed >= 200) { await skills.fight(foe); return; }

  // My island's chests: those of my slot, or (a chest with no slot, or I have none) within 10 of my spawn.
  const mySlot = me.slot;
  const spawn = mySlot !== null && mySlot !== undefined ? placeOf(view, 'spawn', { slot: mySlot }) : null;
  const home = spawn ? { x: spawn.at[0], z: spawn.at[2] } : { x: me.spawnPoint.x ?? 0, z: me.spawnPoint.z ?? 0 };
  const spawnChests = objectivesOf(view, 'chest').filter((c) => {
    if (c.looted) return false;
    if (c.slot !== null && c.slot !== undefined && mySlot !== null && mySlot !== undefined) return c.slot === mySlot;
    return Math.hypot(c.at[0] + 0.5 - home.x, c.at[2] + 0.5 - home.z) <= 10;
  });
  const centerChests = objectivesOf(view, 'chest').filter((c) => {
    if (c.looted) return false;
    if (c.ring === 'center' || c.ring === 'mid') return true;
    return Math.hypot(c.at[0], c.at[2]) <= 14 && c.seenItems;
  });
  const nearest = (list) => [...list].sort((a, b) =>
    Math.hypot(a.at[0] + 0.5 - me.at.x, a.at[2] + 0.5 - me.at.z) -
    Math.hypot(b.at[0] + 0.5 - me.at.x, b.at[2] + 0.5 - me.at.z))[0];
  const label = (c) => `[${c.at[0]}, ${c.at[1]}, ${c.at[2]}]`;

  const blocks = me.carrying.blocks;
  const midNeed = skills.voidCellsToward(0.5, 0.5) + 4;
  // Geared enough to cross and fight: a real sword, enough blocks for the void to the middle and back, an armour piece.
  const geared = skills.bestWeaponDamage() >= 5 && blocks >= Math.min(midNeed, 24) && skills.armorPieces() >= 1;

  // 3. Home chests only while they still buy something the middle cannot: work, blocks, armour.
  const goMid = centerChests.length > 0 && blocks >= 4 && (geared || spawnChests.length === 0);
  if (!goMid && spawnChests.length > 0) {
    const chest = nearest(spawnChests);
    await skills.loot(chest.at, { bridge: false, summary: `looting spawn chest at ${label(chest)}` });
    return;
  }

  // 4. The middle, when no foe is within 9.
  if (centerChests.length > 0 && blocks >= 4 && foeDist > 9) {
    const chest = nearest(centerChests);
    await skills.loot(chest.at, { bridge: true, summary: `looting the middle chest at ${label(chest)}` });
    return;
  }

  // 5. Looted everywhere: hunt the other player down.
  if (foe) { await skills.fight(foe); return; }
  const place = enemyPlace(view);
  if (place) {
    await skills.goTo([place.x, place.y, place.z], {
      bridge: blocks > 0 || skills.creative(), stopWithin: 2.0, summary: `hunting from ${place.name}'s island`,
    });
    return;
  }
  // Nothing left to do but hold the middle.
  if (Math.hypot(me.at.x - 0.5, me.at.z - 0.5) > 4) {
    await skills.goTo([0.5, 31, 0.5], { bridge: blocks > 0, stopWithin: 2.0, summary: 'controlling the middle' });
  }
}
