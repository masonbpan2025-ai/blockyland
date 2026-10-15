// Dimension tutorials (Nether portals, Nether hub, Advancement guide Nether and End tabs, Indestructible End crystals),
// played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W, remove } from './_shared.js';

const dim = (game) => game.currentDimension ?? game.world.dimension ?? 'overworld';
const has = (game, id) => game.player.advancements?.has(id) === true;

/** The minimum portal: "10 obsidian at minimum (without filling corners)", along x, its bottom row at y0. */
async function buildPortal(t, x0, y0, z) {
  const cells = [[x0 + 1, y0], [x0 + 2, y0], [x0, y0 + 1], [x0, y0 + 2], [x0, y0 + 3], [x0 + 3, y0 + 1], [x0 + 3, y0 + 2], [x0 + 3, y0 + 3], [x0 + 1, y0 + 4], [x0 + 2, y0 + 4]];
  // Dirt in the four corners holds the frame up while it is built, and comes out afterwards.
  const corners = [[x0, y0], [x0 + 3, y0], [x0, y0 + 4], [x0 + 3, y0 + 4]];
  t.give(BLOCKS.DIRT, 4); t.give(BLOCKS.OBSIDIAN, cells.length);
  if (t.world.getVoxel(x0, y0 - 1, z) === BLOCKS.AIR) t.set(x0, y0 - 1, z, BLOCKS.NETHERRACK);
  if (t.world.getVoxel(x0 + 3, y0 - 1, z) === BLOCKS.AIR) t.set(x0 + 3, y0 - 1, z, BLOCKS.NETHERRACK);
  await t.run(`place dirt at ${x0} ${y0} ${z}`); await t.run(`place dirt at ${x0 + 3} ${y0} ${z}`);
  for (const [x, y] of cells.slice(0, 3)) await t.run(`place obsidian at ${x} ${y} ${z}`);
  await t.run(`place obsidian at ${x0 + 3} ${y0 + 1} ${z}`);
  // The top of the frame is above eye height: the player stands on a three-block scaffold beside it, as players do.
  const ground = { x: t.player.position.x, y: t.player.position.y, z: t.player.position.z };
  t.fill(x0 + 1, y0, z - 2, x0 + 2, y0 + 2, z - 2, BLOCKS.DIRT);
  t.player.position.set(x0 + 1.5, y0 + 3, z - 1.5); t.player.velocity.set(0, 0, 0); await t.wait(0.3);
  for (const [x, y] of [[x0, y0 + 2], [x0, y0 + 3], [x0 + 3, y0 + 2], [x0 + 3, y0 + 3]]) await t.run(`place obsidian at ${x} ${y} ${z}`);
  await t.run(`place dirt at ${x0} ${y0 + 4} ${z}`); await t.run(`place dirt at ${x0 + 3} ${y0 + 4} ${z}`);
  for (const [x, y] of cells.slice(8)) await t.run(`place obsidian at ${x} ${y} ${z}`);
  t.give('diamond_shovel', 1); await t.run('equip diamond shovel');
  for (const [x, y] of corners.slice(2)) await t.breakBlock(x, y, z, { maxTicks: 120 });
  t.fill(x0 + 1, y0, z - 2, x0 + 2, y0 + 2, z - 2, BLOCKS.AIR);
  t.player.position.set(x0 + 1.5, y0, z - 1.5); t.player.velocity.set(0, 0, 0); await t.wait(0.5);
  for (const [x, y] of corners.slice(0, 2)) await t.breakBlock(x, y, z, { maxTicks: 120 });
  void ground;
  t.give('flint_and_steel', 1);
  await t.run(`use flint_and_steel at ${x0 + 1} ${y0} ${z}`); // on the top of the bottom row, as a player clicks it
  return t.world.getVoxel(x0 + 1, y0 + 1, z) === BLOCKS.NETHER_PORTAL;
}

/** Stand in a portal until the dimension changes; seconds taken. */
async function travel(t, x, y, z) {
  const { game, player } = t; const from = dim(game);
  player.position.set(x + 0.5, y, z + 0.5); player.velocity.set(0, 0, 0);
  let s = 0;
  for (; s < 8 && dim(game) === from; s += t.dt) { t.step(); if (Math.round(s / t.dt) % 20 === 0) await Promise.resolve(); }
  await t.wait(0.5);
  return +s.toFixed(2);
}

/** Open a room in whatever terrain is around a point: netherrack floor, air above. */
function room(t, cx, y, cz, r = 6, h = 6, floor = BLOCKS.NETHERRACK) {
  t.fill(cx - r, y - 1, cz - r, cx + r, y - 1, cz + r, floor);
  t.fill(cx - r, y, cz - r, cx + r, y + h, cz + r, BLOCKS.AIR);
}

export const SCENARIOS = [
  {
    id: 'dimensions.portals',
    tutorial: 'Nether portals; Nether hub',
    wiki: W('Nether portals'),
    async run(t) {
      const { game, player } = t;
      // A tamed wolf and a cow wait at home while the player is away.
      const wolf = t.spawn('wolf', -4.5, 5, -4.5); wolf.isTamed = true; wolf.owner = player; wolf.isSitting = true; wolf.sitting = true;
      const cow = t.spawn('cow', -6.5, 5, 3.5);
      const lit = await buildPortal(t, 0, 5, 3);
      t.check('ten obsidian and a flint and steel make a working portal', lit, lit, true);
      // "Walk into a Nether portal and stand there for 4 seconds: you will appear in the Nether."
      const secs = await travel(t, 1, 6, 3);
      t.check('standing in the portal for 4 seconds goes to the Nether', dim(game) === 'nether' && Math.abs(secs - 4) < 0.3, { dimension: dim(game), seconds: secs }, { dimension: 'nether', seconds: 4 });
      t.check('entering the Nether earns "We Need to Go Deeper" and "Nether"', has(game, 'story/enter_the_nether') && has(game, 'nether/root'), [...player.advancements].filter((a) => /nether/.test(a)), ['story/enter_the_nether', 'nether/root']);
      // "Portals try to link up at their equivalent location ... Nether (X/8, Y, Z/8)": the new portal is within 16.
      const arrive = { x: +player.position.x.toFixed(1), z: +player.position.z.toFixed(1) };
      t.check('the Nether portal is made within 16 blocks of (X/8, Z/8)', Math.abs(arrive.x - 0) <= 17 && Math.abs(arrive.z - 0) <= 17 && t.world.getVoxel(Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z)) === BLOCKS.NETHER_PORTAL,
        arrive, 'within 16 of (0, 0), standing in a portal');
      // Back through the same portal: the Overworld one is found again (no second portal is built).
      player.position.x += 0; await t.wait(4.5);
      const back = await travel(t, Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z));
      const home = { dimension: dim(game), x: Math.floor(player.position.x), z: Math.floor(player.position.z) };
      t.check('going back arrives in the portal that was built', home.dimension === 'overworld' && [1, 2].includes(home.x) && home.z === 3, { ...home, seconds: back }, { dimension: 'overworld', x: '1-2', z: 3 });
      // The mobs left at home are still there.
      const alive = (m) => game.mobs.mobs.includes(m) && m.health > 0;
      t.check('the tamed wolf and the cow left behind are still there', alive(wolf) && alive(cow) && wolf.isTamed, { wolf: alive(wolf), cow: alive(cow) }, { wolf: true, cow: true });
      // Nether hub: "Divide the X and Z of the village coordinates by 8": a portal at (25, -15) in the Nether leads to
      // about (200, -120) in the Overworld.
      await t.wait(4.5);
      await travel(t, Math.floor(player.position.x), Math.floor(player.position.y), Math.floor(player.position.z));
      const ny = Math.floor(player.position.y);
      room(t, 25, ny, -15);
      player.position.set(23.5, ny, -14.5); await t.wait(0.5);
      const lit2 = await buildPortal(t, 25, ny, -15);
      await t.wait(0.5);
      await travel(t, 26, ny + 1, -15);
      const exit = { dimension: dim(game), x: Math.round(player.position.x), z: Math.round(player.position.z) };
      t.check('a hub portal at Nether (25, -15) comes out near Overworld (200, -120)', lit2 && exit.dimension === 'overworld' && Math.abs(exit.x - 208) <= 16 && Math.abs(exit.z + 120) <= 16,
        exit, { dimension: 'overworld', x: '~200', z: '~-120' });
      t.notes.push('The Nether hub walk between portals is replaced by stepping onto the spot; the portal search radii (16 in the Nether, 128 in the Overworld) and the site rules are pinned in tests/netherPortal.test.js.');
    },
  },
  {
    id: 'dimensions.nether_tab',
    tutorial: 'Advancement guide/Nether tab',
    wiki: W('Advancement guide/Nether tab'),
    async run(t) {
      const { game, player } = t;
      // Into the Nether through a portal, as the tab starts.
      await buildPortal(t, 0, 5, 3); await travel(t, 1, 6, 3);
      const y = Math.floor(player.position.y) + 1;
      room(t, 0, y, 20, 12, 10);
      player.position.set(0.5, y, 14.5); await t.wait(1);
      // Who is Cutting Onions? "Have crying obsidian in your inventory": mined with a diamond pickaxe.
      t.set(3, y, 14, BLOCKS.CRYING_OBSIDIAN); t.give('diamond_pickaxe', 1); await t.run('equip diamond pickaxe');
      await t.breakBlock(3, y, 14, { maxTicks: 900 }); await t.wait(1); await t.run(`goto 3 ${y} 14`); await t.wait(1);
      t.check('mining crying obsidian earns "Who is Cutting Onions?"', has(game, 'nether/obtain_crying_obsidian'), t.count(BLOCKS.CRYING_OBSIDIAN), '>= 1');
      // Not Quite "Nine" Lives: four glowstone into a respawn anchor.
      t.give(BLOCKS.RESPAWN_ANCHOR, 1); await t.run(`place respawn anchor at 2 ${y} 17`);
      t.give(BLOCKS.GLOWSTONE, 4); await t.run('equip glowstone');
      for (let i = 0; i < 4; i++) await t.run(`use glowstone at 2 ${y} 17`);
      t.check('four glowstone charge an anchor to the maximum: "Not Quite Nine Lives"', has(game, 'nether/charge_respawn_anchor'), game.player.advancements.has('nether/charge_respawn_anchor'), true);
      // Oh Shiny: "Throw a gold-related item at a piglin while not wearing golden armor."
      const piglin = t.spawn('piglin', 0.5, y, 19.5); piglin.frozen = true;
      t.give('gold_ingot', 1); await t.run('equip gold ingot');
      game.playerBot.lookAt({ x: 0.5, y: y + 0.5, z: 19.5 }); await t.wait(0.2);
      game.dropHeldItem(); piglin.frozen = false; await t.wait(4);
      t.check('a piglin picks up thrown gold: "Oh Shiny"', has(game, 'nether/distract_piglin') && (piglin.isBartering || piglin.admiredItem || piglin.barterTimer !== undefined), { advancement: has(game, 'nether/distract_piglin'), bartering: !!piglin.isBartering }, 'earned, bartering');
      remove(game, piglin);
      // Return to Sender: "Kill a ghast with a ghast fireball" -- punch its fireball back.
      const ghast = t.spawn('ghast', 0.5, y + 4, 31.5); ghast.health = 1;
      let deflected = false;
      for (let i = 0; i < 30 * 20 && ghast.health > 0; i++) {
        const fb = (game.mobs.customProjectiles ?? []).find((p) => (p.isGhastFireball || p.type === 'ghast_fireball') && !p.deflected && p.position.distanceTo(player.position) < 3);
        if (fb) { game.playerBot.lookAt({ x: ghast.mesh.position.x, y: ghast.mesh.position.y + 2, z: ghast.mesh.position.z }); t.step(); game.handleLeftClick(); deflected = deflected || fb.deflected; }
        t.step(); if (i % 20 === 0) await Promise.resolve();
      }
      await t.wait(2);
      t.check('a fireball sent back kills the ghast: "Return to Sender"', deflected && ghast.health <= 0 && has(game, 'nether/return_to_sender'), { deflected, ghastHealth: ghast.health, advancement: has(game, 'nether/return_to_sender') }, 'deflected, dead, earned');
      if (ghast.health > 0) remove(game, ghast);
      player.health = 20;
      // This Boat Has Legs: saddle a strider on lava, ride it, boost it with a warped fungus on a stick.
      t.fill(-8, y - 1, 24, -4, y - 1, 28, BLOCKS.LAVA);
      const strider = t.spawn('strider', -5.5, y - 0.5, 25.5);
      t.give('saddle', 1); await t.run('equip saddle'); await t.run(`goto -3 ${y} 25`);
      game.playerBot.lookAt({ x: strider.mesh.position.x, y: strider.mesh.position.y + 0.8, z: strider.mesh.position.z }); await t.wait(0.3); game.handleRightClick(); await t.wait(0.2);
      t.give('warped_fungus_on_a_stick', 1); await t.run('equip warped fungus on a stick');
      game.playerBot.lookAt({ x: strider.mesh.position.x, y: strider.mesh.position.y + 0.8, z: strider.mesh.position.z }); await t.wait(0.3);
      game.handleRightClick(); await t.wait(0.5); // mounts
      game.handleRightClick(); await t.wait(0.5); // boosts
      t.check('riding a strider and boosting it: "This Boat Has Legs"', !!strider.isSaddled && player.ridingMob === strider && has(game, 'nether/ride_strider'),
        { saddled: !!strider.isSaddled, riding: player.ridingMob === strider, advancement: has(game, 'nether/ride_strider') }, 'saddled, ridden, earned');
      game.mobs.animalBehaviors?.dismount?.(player); player.ridingMob = null; player.position.set(0.5, y, 14.5);
      // A Terrible Fortress: walk into a Nether fortress (found the way /locate would).
      const structures = game.world.structures;
      let fortress = null;
      for (let r = 0; r <= 40 && !fortress; r++) for (let cx = -r; cx <= r && !fortress; cx++) for (const cz of [-r, r]) {
        for (const s of structures?.plansAt?.(cx, cz, 'nether') ?? []) if (s.structureId === 'fortress' && s.pieces?.length) { fortress = s.pieces[0].box; break; }
        if (fortress) break;
      }
      if (fortress) {
        const fx = Math.floor((fortress.minX + fortress.maxX) / 2), fz = Math.floor((fortress.minZ + fortress.maxZ) / 2), fy = fortress.minY + 2;
        for (let cx = Math.floor((fx - 32) / 16); cx <= Math.floor((fx + 32) / 16); cx++) for (let cz = Math.floor((fz - 32) / 16); cz <= Math.floor((fz + 32) / 16); cz++) game.world.getOrCreateChunk?.(cx, cz);
        player.position.set(fx + 0.5, fy, fz + 0.5); await t.wait(2);
      }
      t.check('stepping inside a Nether fortress earns "A Terrible Fortress"', !!fortress && has(game, 'nether/find_fortress'), { found: !!fortress, here: fortress ? game.structureIdAt?.(player.position.x, player.position.y, player.position.z) : null }, 'fortress');
      // Subspace Bubble: travel 875 blocks in the Nether, build a portal and go through.
      await t.wait(4.5);
      player.position.set(700.5, y, 700.5); room(t, 700, y, 700);
      player.position.set(697.5, y, 700.5); await t.wait(0.5);
      await buildPortal(t, 700, y, 702); await t.wait(0.5);
      await travel(t, 701, y + 1, 702);
      t.check('a Nether trip from (0, 0) to (700, 700) is "roughly 7,920" Overworld blocks: "Subspace Bubble"', dim(game) === 'overworld' && has(game, 'nether/fast_travel'),
        { dimension: dim(game), x: Math.round(player.position.x), z: Math.round(player.position.z), advancement: has(game, 'nether/fast_travel') }, 'overworld near (5600, 5600), earned');
      t.notes.push('The 700-block Nether walk is replaced by stepping to its end; the 7000-block rule itself is pinned in tests/advancements.test.js.');
    },
  },
  {
    id: 'dimensions.end_tab',
    tutorial: 'Advancement guide/The End tab; Indestructible End crystals',
    wiki: W('Advancement guide/The End tab'),
    async run(t) {
      const { game, player } = t;
      // "Enter the End dimension" through an end portal.
      t.set(3, 4, 3, BLOCKS.END_PORTAL); player.position.set(3.5, 4.2, 3.5);
      for (let i = 0; i < 120 && dim(game) !== 'the_end'; i++) { t.step(); if (i % 20 === 0) await Promise.resolve(); }
      await t.wait(1);
      t.check('stepping into an end portal: "The End?"', dim(game) === 'the_end' && has(game, 'story/enter_the_end') && has(game, 'end/root'), dim(game), 'the_end');
      const boss = game.bossManager;
      // Free the End: the last hit on the dragon.
      const dragon = game.mobs.mobs.find((m) => m.type === 'ender_dragon');
      if (dragon) { dragon.hitCooldown = 0; game.mobs.damageMob(dragon, 999, dragon.mesh.position, false, player); }
      await t.wait(15);
      t.check('killing the dragon: "Free the End"', !!dragon && has(game, 'end/kill_dragon'), { dragon: !!dragon, advancement: has(game, 'end/kill_dragon') }, 'earned');
      // "A dragon egg spawns on top of the exit portal after defeating the ender dragon for the first time."
      const top = boss.podiumY() + 4;
      let eggAt = null;
      for (let dy = -2; dy <= 3 && !eggAt; dy++) if (t.world.getVoxel(0, top + dy, 0) === BLOCKS.DRAGON_EGG) eggAt = top + dy;
      t.check('the dragon egg sits on top of the exit portal', eggAt !== null, eggAt, 'an egg at (0, ~top, 0)');
      // "Trying to mine the egg causes it to teleport to another location in a 15 block radius."
      if (eggAt !== null) {
        player.position.set(1.5, eggAt, 2.5); t.give('diamond_pickaxe', 1); await t.run('equip diamond pickaxe');
        game.playerBot.lookAt({ x: 0.5, y: eggAt + 0.5, z: 0.5 }); await t.wait(0.3);
        game.handleLeftClick?.(); await t.breakBlock(0, eggAt, 0, { maxTicks: 60 }).catch(() => null); await t.wait(1);
      }
      t.check('hitting the egg makes it teleport, not drop', eggAt !== null && t.world.getVoxel(0, eggAt, 0) !== BLOCKS.DRAGON_EGG && t.count(BLOCKS.DRAGON_EGG) === 0, { left: t.world.getVoxel(0, eggAt ?? 0, 0), inInventory: t.count(BLOCKS.DRAGON_EGG) }, 'gone from the portal, not collected');
      // "The dragon egg will fall on the torch, then drop as an item": an egg over a torch, its support broken.
      const ey = top + 10;
      t.fill(6, ey - 1, 6, 8, ey - 1, 8, BLOCKS.END_STONE);
      t.set(7, ey, 7, BLOCKS.TORCH); t.set(7, ey + 1, 7, BLOCKS.END_STONE); t.set(7, ey + 2, 7, BLOCKS.DRAGON_EGG);
      player.position.set(6.5, ey, 8.5); await t.run('equip diamond pickaxe');
      await t.breakBlock(7, ey + 1, 7, { maxTicks: 300 }); await t.wait(3); await t.run(`goto 7 ${ey} 8`); await t.wait(1.5);
      t.check('the egg falls onto a torch and drops; holding it is "The Next Generation"', t.count(BLOCKS.DRAGON_EGG) === 1 && has(game, 'end/dragon_egg'), { eggs: t.count(BLOCKS.DRAGON_EGG), advancement: has(game, 'end/dragon_egg') }, { eggs: 1 });
      // Remote Getaway: an end gateway appears after the fight; entering it goes to the outer islands.
      const gate = (game.world.endState?.gateways ?? [])[0];
      if (gate) { player.position.set(gate.x + 0.5, gate.y, gate.z + 0.5); for (let i = 0; i < 30; i++) { t.step(); await Promise.resolve(); } await t.wait(1); }
      const far = Math.hypot(player.position.x, player.position.z);
      t.check('entering the gateway teleports to the outer islands: "Remote Getaway"', !!gate && far > 700 && has(game, 'end/enter_end_gateway'), { gateway: !!gate, distance: Math.round(far), advancement: has(game, 'end/enter_end_gateway') }, 'distance > 700, earned');
      // The End... Again...: four end crystals on the exit portal's sides.
      player.position.set(0.5, boss.podiumY() + 1, 5.5); await t.wait(1);
      const py = boss.podiumY() + 1;
      t.give('end_crystal', 4);
      for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) boss.placeEndCrystal(dx, py, dz);
      await t.wait(5);
      const state = game.world.endState;
      const regenerating = boss.endCrystals.filter((c) => c.alive && c.invulnerable);
      // "the newly-generated crystals are indestructible until the dragon respawns".
      const tried = regenerating[0]; if (tried) boss.destroyEndCrystal(tried);
      t.check('the respawn regenerates tower crystals one by one, and they cannot be destroyed', state?.respawning && regenerating.length >= 1 && regenerating.length < 10 && tried?.alive === true,
        { respawning: !!state?.respawning, regenerated: regenerating.length, survivedHit: tried?.alive }, 'respawning, 1-9 so far, survives');
      await t.wait(30);
      const again = game.mobs.mobs.find((m) => m.type === 'ender_dragon' && m.health > 0);
      t.check('the dragon comes back: "The End... Again..."', !!again && has(game, 'end/respawn_dragon') && boss.endCrystals.filter((c) => c.alive && c.invulnerable).length === 0,
        { dragon: !!again, advancement: has(game, 'end/respawn_dragon') }, 'dragon back, earned, crystals destructible');
      t.notes.push('Indestructible End crystals: the trick needs a log-out during the respawn, which a single-page game cannot do; the indestructible window it relies on is checked above.');
    },
  },
];
