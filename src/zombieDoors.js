// Zombies breaking wooden doors (Java Edition).
//
// Wiki (Zombie, Breaking doors): "Up to 10% of zombies (depending on regional difficulty) in pursuit of a target can
// pathfind through closed wooden and copper doors, and on Hard difficulty can succeed in breaking them down"; "The
// zombie can break only the top half of the door"; "It takes approximately 10 seconds for a zombie to break a door".
// Tutorial:Trapdoor uses: "zombies cannot break down wooden trapdoors, despite them being able to break down wooden
// doors". Found by the wiki-tutorial play-test (Mechanisms group): zombies never broke a door.
import { BLOCKS as B } from './blocks.js';

export const DOOR_BREAK_SECONDS = 10;
const BREAKERS = new Set(['zombie', 'husk', 'zombie_villager']);
/** Closed upper halves of wooden and copper doors (iron doors are not broken). */
const BREAKABLE_TOPS = new Set(Object.entries(B).filter(([k]) => /_DOOR_TOP$/.test(k) && !/^IRON_/.test(k)).map(([, v]) => v));
const bottomOf = new Map(Object.entries(B).filter(([k]) => /_DOOR_TOP$/.test(k)).map(([k, v]) => [v, B[k.replace(/_TOP$/, '')]]));

/** Does this zombie get the door-breaking ability when it spawns? Up to 10%, scaled by regional difficulty (0-1). */
export function rollCanBreakDoors(random = Math.random, clampedRegionalDifficulty = 0.5) {
  return random() < 0.1 * Math.max(0, Math.min(1, clampedRegionalDifficulty));
}

/** One update: a door-breaking zombie chasing the player, facing a closed door's top half, hacks at it. */
export function updateDoorBreaking(game, mob, dt) {
  if (!BREAKERS.has(mob.type) || !mob.canBreakDoors || mob.health <= 0) { mob.doorBreak = null; return null; }
  if (String(game.difficulty) !== 'hard') { mob.doorBreak = null; return null; }
  const target = game.player; const pos = mob.mesh?.position;
  if (!pos || !target?.position || target.isDead || pos.distanceTo(target.position) > 16) { mob.doorBreak = null; return null; }
  // A closed door's top half beside it (any side), on the way to the target.
  const hy = Math.floor(pos.y + 0.1) + 1, toTarget = { x: target.position.x - pos.x, z: target.position.z - pos.z };
  let hx = null, hz = null, id = null, best = Infinity;
  // Zombies that can break doors "pathfind through closed wooden doors": one within 3 blocks on the way is walked to.
  for (let x = Math.floor(pos.x) - 3; x <= Math.floor(pos.x) + 3; x++) for (let z = Math.floor(pos.z) - 3; z <= Math.floor(pos.z) + 3; z++) {
    const here = game.world.getVoxel(x, hy, z); if (!BREAKABLE_TOPS.has(here)) continue;
    const ox = x + 0.5 - pos.x, oz = z + 0.5 - pos.z, d = Math.hypot(ox, oz);
    if (d > 3.5 || ox * toTarget.x + oz * toTarget.z <= 0 || d >= best) continue;
    best = d; hx = x; hz = z; id = here;
  }
  if (id === null) { mob.doorBreak = null; return null; }
  // Stand in the open cell in front of the door on this side, then hack at it.
  let stand = null, near = Infinity;
  for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const cx = hx + sx, cz = hz + sz;
    if (game.world.getVoxel(cx, hy - 1, cz) !== B.AIR || game.world.getVoxel(cx, hy, cz) !== B.AIR) continue;
    const d = Math.hypot(cx + 0.5 - pos.x, cz + 0.5 - pos.z);
    if (d < near) { near = d; stand = { x: cx + 0.5, y: hy - 1, z: cz + 0.5 }; }
  }
  if (!stand) { mob.doorBreak = null; return null; }
  if (near > 0.45) { mob.doorBreak = null; mob.doorStand = stand; return 'approaching'; }
  mob.doorStand = null;
  const key = `${hx},${hy},${hz}`;
  if (mob.doorBreak?.key !== key) mob.doorBreak = { key, seconds: 0, knock: 0 };
  mob.doorBreak.seconds += dt; mob.doorBreak.knock -= dt;
  if (mob.doorBreak.knock <= 0) { mob.doorBreak.knock = 1; game.sounds?.playDoorKnock?.() ?? game.sounds?.playHit?.(); }
  if (mob.doorBreak.seconds < DOOR_BREAK_SECONDS) return 'breaking';
  game.world.setVoxel(hx, hy, hz, B.AIR);
  if (game.world.getVoxel(hx, hy - 1, hz) === bottomOf.get(id)) game.world.setVoxel(hx, hy - 1, hz, B.AIR);
  game.doorManager?.removeDoor?.(hx, hy - 1, hz);
  game.sounds?.playBreak?.('wood');
  mob.doorBreak = null;
  return 'broken';
}
