// Villagers summoning iron golems when they panic (Java Edition).
//
// Wiki (Iron Golem, Villages): villagers summon an iron golem "every 5 seconds while panicking" when: the villager has
// slept in the last 20 minutes; it "has not detected an iron golem in the last 30 seconds" (one within 16 blocks, scanned
// every 10 seconds); it "has not been near a summoning in the last 30 seconds" (within 10 blocks of one); there are
// "3 or more" such participants within 10 blocks, itself included; and a spawn point is found -- "up to 10 attempts ...
// within a 17x13x17 box centered on the villager", the topmost air block in a random column with a solid block under
// it, the block and two above not full blocks. Wiki (Villager, Panicking): a villager panics when it sees a zombie,
// husk, drowned, zombie villager or vex within 8 blocks, a vindicator or zoglin within 10, an evoker, illusioner or
// ravager within 12, a pillager within 15. Tutorial:Iron golem farming builds on exactly this ("Panicking ... only
// requires three villagers"). Villagers here do not sleep in beds, so "slept recently" is read as having a bed within
// 48 blocks (a village's bed search range). Found by the wiki-tutorial play-test: villagers never summoned golems.
import { BLOCKS, BLOCK_DEFS } from './blocks.js';

export const PANIC_RADIUS = { zombie: 8, husk: 8, drowned: 8, zombie_villager: 8, vex: 8, vindicator: 10, zoglin: 10, evoker: 12, illusioner: 12, ravager: 12, pillager: 15 };
const SECONDS = { summonEvery: 5, golemMemory: 30, summonMemory: 30, scanEvery: 10, panicLinger: 5 };

const fullBlock = (id) => { const d = BLOCK_DEFS[id]; return id !== BLOCKS.AIR && !!d && d.solid !== false && !d.transparent && !d.model && !d.liquid; };
const solidBelow = (id) => { const d = BLOCK_DEFS[id]; return id !== BLOCKS.AIR && !!d && d.solid !== false && !d.liquid; };

function hasBedNear(game, p) {
  for (const bed of game.bedManager?.beds?.values?.() ?? []) {
    const f = bed?.footPos; if (f && Math.abs(f[0] - p.x) <= 48 && Math.abs(f[2] - p.z) <= 48 && Math.abs(f[1] - p.y) <= 48) return true;
  }
  return false;
}

/** A spawn point for the golem near `p`, or null (10 attempts). */
export function golemSpawnPoint(world, p, random = Math.random) {
  const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
  for (let attempt = 0; attempt < 10; attempt++) {
    const x = bx + Math.floor(random() * 17) - 8, z = bz + Math.floor(random() * 17) - 8;
    for (let y = by + 6; y >= by - 6; y--) {
      const here = world.getVoxel(x, y, z);
      if (here !== BLOCKS.AIR && !BLOCK_DEFS[here]?.liquid) continue;
      if (!solidBelow(world.getVoxel(x, y - 1, z))) continue;
      if ([0, 1, 2].some((dy) => fullBlock(world.getVoxel(x, y + dy, z)))) break;
      return { x: x + 0.5, y, z: z + 0.5 };
    }
  }
  return null;
}

function canSee(game, a, b) {
  const world = game.world, steps = Math.ceil(a.distanceTo(b) * 3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps, x = a.x + (b.x - a.x) * t, y = a.y + 1.5 + (b.y - a.y) * t, z = a.z + (b.z - a.z) * t;
    if (fullBlock(world.getVoxel(Math.floor(x), Math.floor(y), Math.floor(z)))) return false;
  }
  return true;
}

/** Per-villager update. `now` is game time in seconds. Returns the summoned golem, if any. */
export function updateGolemSummoning(game, mob, dt, now = game.simSeconds ?? 0) {
  if (mob.type !== 'villager' || mob.isBaby || mob.health <= 0 || !mob.mesh) return null;
  const pos = mob.mesh.position, mobs = game.mobs?.mobs ?? [];
  // Golem scan every 10 s.
  if ((mob.golemScanAt ?? 0) <= now) {
    mob.golemScanAt = now + SECONDS.scanEvery;
    if (mobs.some((m) => m.type === 'iron_golem' && m.health > 0 && Math.abs(m.mesh.position.x - pos.x) <= 16 && Math.abs(m.mesh.position.y - pos.y) <= 16 && Math.abs(m.mesh.position.z - pos.z) <= 16)) mob.golemSeenAt = now;
  }
  // Panic: a threat in sight within its radius.
  const threat = mobs.find((m) => PANIC_RADIUS[m.type] && m.health > 0 && m.mesh.position.distanceTo(pos) <= PANIC_RADIUS[m.type] && canSee(game, pos, m.mesh.position));
  if (threat) mob.panicUntil = now + SECONDS.panicLinger;
  mob.isPanicking = (mob.panicUntil ?? -1) > now;
  if (!mob.isPanicking) return null;
  if ((mob.nextSummonTry ?? 0) > now) return null;
  mob.nextSummonTry = now + SECONDS.summonEvery;
  const eligible = (v) => v.type === 'villager' && !v.isBaby && v.health > 0 && hasBedNear(game, v.mesh.position)
    && now - (v.golemSeenAt ?? -1e9) >= SECONDS.golemMemory && now - (v.summonNearAt ?? -1e9) >= SECONDS.summonMemory;
  if (!eligible(mob)) return null;
  const near = mobs.filter((v) => eligible(v) && Math.abs(v.mesh.position.x - pos.x) <= 10 && Math.abs(v.mesh.position.y - pos.y) <= 10 && Math.abs(v.mesh.position.z - pos.z) <= 10);
  if (near.length < 3) return null;
  const at = golemSpawnPoint(game.world, pos, game.random ?? Math.random);
  if (!at) return null;
  const golem = game.mobs.spawnMob('iron_golem', at.x, at.y, at.z);
  if (!golem) return null;
  golem.villageSummoned = true;
  for (const v of mobs) if (v.type === 'villager' && Math.abs(v.mesh.position.x - pos.x) <= 10 && Math.abs(v.mesh.position.y - pos.y) <= 10 && Math.abs(v.mesh.position.z - pos.z) <= 10) { v.summonNearAt = now; v.golemSeenAt = now; }
  return golem;
}
