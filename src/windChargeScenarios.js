// Item Inspector scenarios for the wind charge (windCharge.js), one or more for every property the Minecraft Wiki's
// "Wind Charge" page gives it (with the "Explosion" page's knockback rule and "Blast Protection"'s 15% a level).
// Each runs the game's own WindChargeSystem against small stand-ins (a map of voxels, a player, mobs) and says what
// happened in its detail line; the first one also throws a charge across the preview, to be watched.
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, stackLimitFor } from './blocks.js';
import { WIND_CHARGE, WindChargeSystem, burstImpulse, exposure, windBurstBlocks } from './windCharge.js';
import { EXTRA_RECIPES } from './extraRecipes.js';


/** A stand-in world: voxels in a map, with a stone floor at y 30 (standing on 31) unless `floor` is false. */
export function standInWorld(floor = true) {
  const v = new Map();
  const world = { getVoxel: (x, y, z) => v.get(`${x},${y},${z}`) ?? BLOCKS.AIR, setVoxel: (x, y, z, id) => { v.set(`${x},${y},${z}`, id); } };
  if (floor) for (let x = -12; x <= 12; x++) for (let z = -12; z <= 12; z++) world.setVoxel(x, 30, z, BLOCKS.STONE);
  return world;
}

/** A stand-in player at `at` (feet), looking along -z, with a wind charge stack in hand. */
export function standInGame({ at = { x: 0.5, y: 31, z: 0.5 }, floor = true, count = 16, gamemode = 'survival', armor = {}, mobs = [] } = {}) {
  const player = {
    position: new THREE.Vector3(at.x, at.y, at.z), velocity: new THREE.Vector3(), onGround: true, eyeHeight: 1.62, height: 1.8,
    yaw: 0, pitch: 0, gamemode, fallDistance: 0, hurt: [], takeDamage(n, from, type) { this.hurt.push({ n, type }); },
  };
  const inventory = { active: { id: 'wind_charge', isBlock: false, count }, armor, getActiveItem() { return this.active.count > 0 ? this.active : null; }, consumeActiveItem(n = 1) { this.active.count -= n; } };
  const damaged = [];
  const mobManager = { mobs, getMobDimensions: (type) => (type === 'iron_golem' ? { width: 1.4, height: 2.7 } : { width: 0.6, height: 1.95 }), damageMob: (m, n) => { damaged.push({ type: m.type, n }); m.health -= n; } };
  const game = { world: standInWorld(floor), player, inventory, mobs: mobManager, damaged };
  game.charges = new WindChargeSystem(game, { random: () => 0.5 });
  return game;
}

const mob = (type, x, z, y = 31) => ({ type, health: 20, mesh: { position: new THREE.Vector3(x, y, z) }, velocity: new THREE.Vector3() });
const f2 = (n) => (Math.round(n * 100) / 100).toFixed(2);

/** The peak height of a player launched straight up at `vy` blocks a tick (Java: move, then (v - 0.08) x 0.98). */
export function launchPeak(vy) {
  let v = vy, y = 0, peak = 0;
  for (let t = 0; t < 80 && (v > 0 || y > 0); t++) { y += v; v = (v - 0.08) * 0.98; peak = Math.max(peak, y); }
  return peak;
}

/**
 * A charge thrown across the inspection world, drawn as the game draws it: from 5 blocks off the spot on show, along
 * +x, into a stone wall put 4 blocks past it. Its mesh is in a group placed as the inspector places the world's mesh.
 */
export function throwInPreview(session) {
  session.reset(BLOCKS.AIR);
  for (let y = 2; y <= 5; y++) for (let z = 6; z <= 10; z++) session.world.setVoxel(12, y, z, BLOCKS.STONE);
  const layer = new THREE.Group();
  layer.position.set(-8.5, -2, -8.5);
  session.game.scene.add(layer);
  const game = { world: session.world, scene: layer, player: null, mobs: { mobs: [] } };
  const system = new WindChargeSystem(game, { random: () => 0.5 });
  const shown = { system, bursts: [], startedAt: null, dispose() { system.clear?.(); layer.removeFromParent(); } };
  const burst = system.burst.bind(system);
  system.burst = (center, c) => { shown.bursts.push(center.clone()); return burst(center, c); };
  // Slower than the real 30 blocks a second for the eye to follow: the flight is the same line.
  shown.throw = () => system.launch({ origin: new THREE.Vector3(3.5, 3.5, 8.5), direction: new THREE.Vector3(1, 0, 0) });
  shown.charge = shown.throw();
  shown.charge.velocity.multiplyScalar(0.2);
  shown.startedAt = shown.charge.position.clone();
  return shown;
}

/** One verify-only step: `check()` returns { ok, detail }. */
const step = (id, label, check, duration = 0.6) => ({
  id, label, duration,
  verify() { const r = check(); this.detail = r.detail; return r.ok; },
});

export function windChargeScenarios(entry, session = null) {
  if (String(entry?.id ?? '') !== 'wind_charge') return [];
  const steps = [];

  if (session?.world && session.game?.scene) {
    let shown = null;
    steps.push({
      id: 'wind-charge-flight-01',
      label: 'WIND-CHARGE-01: Thrown, it flies in a straight line (no gravity) until it strikes a block, and bursts there',
      duration: 2.4,
      camera: { position: [0, 4, 9], target: [1.5, 1.5, 0] },
      enter() { shown = throwInPreview(session); },
      update: (dt) => shown.system.update(dt),
      verify() {
        const b = shown.bursts[0];
        this.detail = b ? `left at y ${f2(shown.startedAt.y)}, burst at x ${f2(b.x)} y ${f2(b.y)} (the wall at x 12)` : 'still flying';
        return !!b && Math.abs(b.y - shown.startedAt.y) < 1e-6 && b.x < 12 && b.x > 11;
      },
      exit() { shown.dispose(); session.reset(BLOCKS.AIR); },
    });
  }

  steps.push(
    step('wind-charge-stack-01', 'WIND-CHARGE-02: Stacks to 64; one breeze rod crafts into four', () => {
      const recipe = EXTRA_RECIPES.find((r) => r.result?.id === 'wind_charge');
      const limit = stackLimitFor('wind_charge');
      return { ok: limit === 64 && recipe?.result?.count === 4 && recipe.ingredients?.join() === 'breeze_rod', detail: `stack ${limit}, recipe ${recipe?.ingredients?.join(' + ')} -> ${recipe?.result?.count}` };
    }),
    step('wind-charge-flight-02', 'WIND-CHARGE-03: It flies at 1.5 blocks a tick (30 a second), level, with no gravity', () => {
      const g = standInGame({ floor: false });
      g.charges.use();
      const c = g.charges.charges[0], y0 = c.position.y, z0 = c.position.z;
      g.charges.update(1);
      return { ok: Math.abs(c.position.y - y0) < 1e-9 && Math.abs(z0 - c.position.z - 30) < 0.01, detail: `after 1 s: ${f2(z0 - c.position.z)} blocks on, ${f2(c.position.y - y0)} up or down` };
    }),
    step('wind-charge-use-01', 'WIND-CHARGE-04: Each throw uses one charge; in Creative none is used', () => {
      const s = standInGame(); s.charges.use();
      const c = standInGame({ gamemode: 'creative' }); c.charges.use();
      return { ok: s.inventory.active.count === 15 && c.inventory.active.count === 16, detail: `Survival 16 -> ${s.inventory.active.count}, Creative 16 -> ${c.inventory.active.count}` };
    }),
    step('wind-charge-cooldown-01', 'WIND-CHARGE-05: A 0.5 s (10-tick) cooldown after each throw; no second throw inside it', () => {
      const g = standInGame({ floor: false });
      g.charges.use(); g.charges.update(0.25);
      const during = g.charges.cooldownFraction(); g.charges.use();
      const heldBack = g.inventory.active.count === 15;
      g.charges.update(0.25); g.charges.use();
      return { ok: heldBack && Math.abs(during - 0.5) < 1e-9 && g.inventory.active.count === 14, detail: `at 0.25 s the overlay is ${f2(during * 100)}% full and nothing is thrown; at 0.5 s the next one goes` };
    }),
    step('wind-charge-hit-01', 'WIND-CHARGE-06: A direct hit does 1 damage, then bursts', () => {
      const zombie = mob('zombie', 0.5, -5.5);
      const g = standInGame({ mobs: [zombie] });
      g.charges.use();
      for (let i = 0; i < 20 && g.charges.charges.length; i++) g.charges.update(0.05);
      return { ok: g.damaged.length === 1 && g.damaged[0].n === WIND_CHARGE.directDamage && zombie.knockback?.length() > 0, detail: `damage ${g.damaged.map((d) => d.n).join(', ') || 'none'}, pushed ${f2(zombie.knockback?.length() ?? 0)} b/s` };
    }),
    step('wind-charge-burst-01', 'WIND-CHARGE-07: The burst pushes everyone near it and hurts no one', () => {
      const zombie = mob('zombie', 1.5, 0.5);
      const g = standInGame({ at: { x: -0.5, y: 31, z: 0.5 }, mobs: [zombie] });
      g.charges.burst(new THREE.Vector3(0.5, 31, 0.5));
      return { ok: g.damaged.length === 0 && g.player.hurt.length === 0 && zombie.knockback?.length() > 0 && g.player.velocity.length() > 0, detail: `zombie pushed ${f2(zombie.knockback?.length() ?? 0)} b/s, player ${f2(g.player.velocity.length())} b/s, damage dealt: ${g.damaged.length + g.player.hurt.length}` };
    }),
    step('wind-charge-burst-02', 'WIND-CHARGE-08: Its reach is 2.4 blocks (power 1.2): 2.39 away is pushed, 2.41 away is not', () => {
      const center = { x: 0, y: 31, z: 0 };
      const near = burstImpulse({ center, feet: { x: 2.39, y: 31, z: 0 } }), far = burstImpulse({ center, feet: { x: 2.41, y: 31, z: 0 } });
      return { ok: !!near && far === null, detail: `2.39: ${near ? f2(near.magnitude) : 'none'}, 2.41: ${far ? f2(far.magnitude) : 'none'} blocks a tick` };
    }),
    step('wind-charge-burst-03', 'WIND-CHARGE-09: The push is (1 - distance / 2.4) x 1.22 blocks a tick: 1.22 at the feet, 0.61 at 1.2 blocks', () => {
      const center = { x: 0, y: 31, z: 0 };
      const a = burstImpulse({ center, feet: { x: 0, y: 31, z: 0 } }).magnitude, b = burstImpulse({ center, feet: { x: 1.2, y: 31, z: 0 } }).magnitude;
      return { ok: Math.abs(a - 1.22) < 1e-9 && Math.abs(b - 0.61) < 1e-9, detail: `at the feet ${f2(a)}, 1.2 away ${f2(b)}` };
    }),
    step('wind-charge-jump-01', 'WIND-CHARGE-10: Thrown at your own feet, it launches you about 8 blocks up ("Who Needs Rockets?")', () => {
      const g = standInGame();
      g.charges.burst(new THREE.Vector3(0.5, 31, 0.5), { source: 'player', owner: g.player });
      const peak = launchPeak(g.player.velocity.y / 20);
      return { ok: peak >= 8 && peak < 9, detail: `launched at ${f2(g.player.velocity.y / 20)} blocks a tick: a peak of ${f2(peak)} blocks` };
    }),
    step('wind-charge-fall-01', 'WIND-CHARGE-11: After a launch, fall damage counts only from below the height of the burst', () => {
      const g = standInGame();
      g.player.fallDistance = 12;
      g.charges.burst(new THREE.Vector3(0.5, 31, 0.5), { source: 'player', owner: g.player });
      return { ok: g.player.windChargeFloorY === 31 && g.player.fallDistance === 0, detail: `fall distance reset to ${g.player.fallDistance}, counted from below y ${g.player.windChargeFloorY}` };
    }),
    step('wind-charge-exposure-01', 'WIND-CHARGE-12: A wall between the burst and a player shields them (exposure 0)', () => {
      const w = standInWorld();
      const open = exposure(w, { x: 0.5, y: 31.2, z: 0.5 }, { x: 2.5, y: 31, z: 0.5, width: 0.6, height: 1.8 });
      for (let y = 31; y <= 33; y++) for (let z = -2; z <= 3; z++) w.setVoxel(1, y, z, BLOCKS.STONE);
      const shut = exposure(w, { x: 0.5, y: 31.2, z: 0.5 }, { x: 2.5, y: 31, z: 0.5, width: 0.6, height: 1.8 });
      return { ok: open === 1 && shut === 0, detail: `in the open ${f2(open)}, behind the wall ${f2(shut)}` };
    }),
    step('wind-charge-resist-01', 'WIND-CHARGE-13: A mob that resists knockback (the iron golem) is not moved', () => {
      const golem = mob('iron_golem', 1.5, 0.5);
      const g = standInGame({ at: { x: 20.5, y: 31, z: 0.5 }, mobs: [golem] });
      g.charges.burst(new THREE.Vector3(0.5, 31, 0.5));
      return { ok: !golem.knockback || golem.knockback.length() === 0, detail: `iron golem pushed ${f2(golem.knockback?.length() ?? 0)} b/s` };
    }),
    step('wind-charge-blast-01', 'WIND-CHARGE-14: Blast Protection IV takes 60% off the push (15% a level, summed over the armour)', () => {
      const armor = { chest: { id: 'iron_chestplate', enchantments: [{ id: 'blast_protection', level: 4 }] } };
      const plain = standInGame(), worn = standInGame({ armor });
      plain.charges.burst(new THREE.Vector3(0.5, 31, 0.5)); worn.charges.burst(new THREE.Vector3(0.5, 31, 0.5));
      const ratio = worn.player.velocity.length() / plain.player.velocity.length();
      return { ok: Math.abs(ratio - 0.4) < 1e-6, detail: `with Blast Protection IV: ${f2(ratio * 100)}% of the push` };
    }),
    step('wind-charge-fly-01', 'WIND-CHARGE-15: A Creative player who is flying is not pushed', () => {
      const g = standInGame({ gamemode: 'creative' });
      g.player.isFlying = true;
      g.charges.burst(new THREE.Vector3(0.5, 31, 0.5));
      return { ok: g.player.velocity.length() === 0, detail: `pushed ${f2(g.player.velocity.length())} b/s` };
    }),
    step('wind-charge-liquid-01', 'WIND-CHARGE-16: Water slows it down', () => {
      const g = standInGame({ floor: false, gamemode: 'creative' });
      for (let z = -40; z <= 0; z++) g.world.setVoxel(0, 32, z, BLOCKS.WATER);
      g.charges.use(); g.charges.update(0.1);
      const v = g.charges.charges[0].velocity.length();
      return { ok: v < WIND_CHARGE.speed * 0.9, detail: `${f2(v)} blocks a second after 0.1 s in water (thrown at ${WIND_CHARGE.speed})` };
    }),
    step('wind-charge-deflect-01', 'WIND-CHARGE-17: Hit with a melee attack, it flies off where the hitter looks', () => {
      const g = standInGame({ floor: false });
      const c = g.charges.launch({ origin: new THREE.Vector3(0.5, 32.5, -1.5), direction: new THREE.Vector3(0, 0, 1), source: 'dispenser' });
      const ok = g.charges.deflect(new THREE.Vector3(0.5, 32.6, 0.5), new THREE.Vector3(0, 0, -1));
      return { ok: ok && c.velocity.z < 0 && c.owner === g.player, detail: `now ${f2(c.velocity.z)} b/s along z, owned by the hitter` };
    }),
  );

  // The blocks a burst acts on, each on its own.
  const blockStep = (id, label, block, expect, extra = {}) => step(id, label, () => {
    const w = standInWorld();
    w.setVoxel(1, 31, 0, block);
    const calls = { toggled: 0, pressed: 0, rung: 0, dropped: 0 };
    const out = windBurstBlocks({
      world: w, center: { x: 0.5, y: 31.2, z: 0.5 },
      doors: { toggleDoor: () => { calls.toggled++; return { success: true }; }, toggleTrapdoor: () => { calls.toggled++; return { success: true }; } },
      redstone: { interact: () => { calls.pressed++; } },
      sounds: { playBell: () => { calls.rung++; } },
      entities: { spawnDroppedItem: () => { calls.dropped++; } },
      ...extra,
    });
    const left = w.getVoxel(1, 31, 0);
    return { ok: expect(calls, out, left), detail: `${BLOCK_DEFS[block]?.name ?? block}: flipped ${calls.toggled}, pressed ${calls.pressed}, rung ${calls.rung}, dropped ${calls.dropped}, now ${BLOCK_DEFS[left]?.name ?? 'air'}` };
  });
  const B = (name) => BLOCKS[name];
  const door = Object.keys(BLOCKS).find((k) => BLOCK_DEFS[BLOCKS[k]]?.door && !/IRON/.test(k));
  const ironDoor = Object.keys(BLOCKS).find((k) => BLOCK_DEFS[BLOCKS[k]]?.door && /IRON/.test(k));
  const button = Object.keys(BLOCKS).find((k) => /BUTTON/.test(k));
  if (door) steps.push(blockStep('wind-charge-block-01', 'WIND-CHARGE-18: Wooden doors open or shut', B(door), (c) => c.toggled === 1));
  if (ironDoor) steps.push(blockStep('wind-charge-block-02', 'WIND-CHARGE-19: Iron doors and trapdoors stay as they are', B(ironDoor), (c) => c.toggled === 0));
  if (B('OAK_TRAPDOOR')) steps.push(blockStep('wind-charge-block-03', 'WIND-CHARGE-20: Wooden trapdoors flip', B('OAK_TRAPDOOR'), (c) => c.toggled === 1));
  if (B('LEVER')) steps.push(blockStep('wind-charge-block-04', 'WIND-CHARGE-21: Levers flip', B('LEVER'), (c) => c.pressed === 1));
  if (button) steps.push(blockStep('wind-charge-block-05', 'WIND-CHARGE-22: Buttons are pressed', B(button), (c) => c.pressed === 1));
  if (B('BELL')) steps.push(blockStep('wind-charge-block-06', 'WIND-CHARGE-23: Bells ring', B('BELL'), (c) => c.rung === 1));
  if (B('CHORUS_FLOWER')) steps.push(blockStep('wind-charge-block-07', 'WIND-CHARGE-24: Chorus flowers break and drop', B('CHORUS_FLOWER'), (c, o, left) => c.dropped === 1 && left === BLOCKS.AIR));
  if (B('DECORATED_POT')) steps.push(blockStep('wind-charge-block-08', 'WIND-CHARGE-25: Decorated pots shatter', B('DECORATED_POT'), (c, o, left) => c.dropped === 1 && left === BLOCKS.AIR));
  steps.push(step('wind-charge-block-09', 'WIND-CHARGE-26: Solid blocks are not broken (it is not an explosion that destroys)', () => {
    const w = standInWorld();
    windBurstBlocks({ world: w, center: { x: 0.5, y: 31.2, z: 0.5 } });
    return { ok: w.getVoxel(0, 30, 0) === BLOCKS.STONE, detail: `the stone under the burst: ${BLOCK_DEFS[w.getVoxel(0, 30, 0)]?.name ?? 'gone'}` };
  }));
  // Fence gates and lit candles (blockStateVariants.js).
  const gateStep = (id, label, from, to) => step(id, label, () => {
    const w = standInWorld();
    w.setVoxel(1, 31, 0, from);
    windBurstBlocks({ world: w, center: { x: 0.5, y: 31.2, z: 0.5 } });
    const now = w.getVoxel(1, 31, 0);
    return { ok: now === to, detail: `${BLOCK_DEFS[from]?.name} -> ${BLOCK_DEFS[now]?.name}` };
  });
  steps.push(
    gateStep('wind-charge-block-10', 'WIND-CHARGE-27: A closed fence gate opens ("When hit, it opens if closed and vice versa")', BLOCKS.OAK_FENCE_GATE, BLOCKS.OAK_FENCE_GATE_OPEN),
    gateStep('wind-charge-block-11', 'WIND-CHARGE-28: An open fence gate closes', BLOCKS.OAK_FENCE_GATE_OPEN, BLOCKS.OAK_FENCE_GATE),
    gateStep('wind-charge-block-12', 'WIND-CHARGE-29: A lit candle goes out', BLOCKS.WHITE_CANDLE_LIT, BLOCKS.WHITE_CANDLE),
    gateStep('wind-charge-block-13', 'WIND-CHARGE-30: A lit candle on a cake goes out too', BLOCKS.CANDLE_CAKE_LIT, BLOCKS.CANDLE_CAKE),
  );

  // The breeze's own charge (Wind Charge, Breeze).
  const breezeBurst = (feet) => {
    const g = standInGame({ at: feet });
    const breeze = mob('breeze', 30.5, 30.5);
    g.mobs.mobs.push(breeze);
    g.player.fallDistance = 9;
    g.charges.burst(new THREE.Vector3(0.5, 31, 0.5), { source: 'breeze', owner: breeze });
    return g;
  };
  steps.push(
    step('wind-charge-breeze-01', "WIND-CHARGE-31: A breeze's burst reaches 6 blocks ('a 6-block sphere'): 5.9 away is pushed, 6.1 is not", () => {
      const a = breezeBurst({ x: 6.4, y: 31, z: 0.5 }).player.velocity.length(), b = breezeBurst({ x: 6.6, y: 31, z: 0.5 }).player.velocity.length();
      return { ok: a > 0 && b === 0, detail: `5.9 away: ${f2(a)} b/s, 6.1 away: ${f2(b)} b/s` };
    }),
    step('wind-charge-breeze-02', 'WIND-CHARGE-32: It pushes with 40% less knockback than an explosion: 0.6 blocks a tick at the feet', () => {
      const g = breezeBurst({ x: 0.5, y: 31, z: 0.5 });
      return { ok: Math.abs(g.player.velocity.y / 20 - 0.6) < 1e-6, detail: `${f2(g.player.velocity.y / 20)} blocks a tick straight up` };
    }),
    step('wind-charge-breeze-03', "WIND-CHARGE-33: A breeze's launch counts the whole fall: no floor at the burst", () => {
      const g = breezeBurst({ x: 0.5, y: 31, z: 0.5 });
      return { ok: g.player.windChargeFloorY == null && g.player.fallDistance === 9, detail: `fall distance kept at ${g.player.fallDistance}, floor ${g.player.windChargeFloorY ?? 'none'}` };
    }),
    step('wind-charge-breeze-04', 'WIND-CHARGE-34: Its direct hit deals 1 on Easy and Normal, 1.5 on Hard (Breeze)', () => {
      const hits = {};
      for (const [difficulty, damage] of [['easy', 1], ['normal', 1], ['hard', 1.5]]) {
        const g = standInGame({ floor: false });
        g.charges.launch({ origin: new THREE.Vector3(0.5, 32, -3.5), direction: new THREE.Vector3(0, 0, 1), owner: mob('breeze', 0.5, -6), source: 'breeze', damage });
        for (let i = 0; i < 10 && g.charges.charges.length; i++) g.charges.update(0.05);
        hits[difficulty] = g.player.hurt.map((h) => h.n).join(',');
      }
      return { ok: hits.easy === '1' && hits.normal === '1' && hits.hard === '1.5', detail: Object.entries(hits).map(([d, n]) => `${d} ${n}`).join(', ') };
    }),
  );
  return steps;
}
