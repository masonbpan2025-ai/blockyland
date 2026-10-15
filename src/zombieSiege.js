// Zombie sieges (Java Edition).
//
// Wiki (Zombie siege): "At midnight each night (tick 18000) ... a zombie siege is determined to occur somewhere in the
// Overworld that night with a 10% probability"; attempts then run until "the sky light level reaches 12 due to sunrise".
// A player "in an area that is considered part of a logical village" -- a 3x3x3 cube of chunk sections around a claimed
// bed, bell or job site -- starts it: ten tries for a point on a 32-block circle around the player that has a valid zombie
// spawn. Then "the game tries to spawn a zombie every 3 ticks 20 times", each within 8 blocks of the point, on the surface,
// dark enough, on a block that allows spawning, inside the village. Never on Peaceful. Found by the wiki-tutorial
// play-test (Zombie siege defense): sieges did not exist.
import { BLOCKS } from './blocks.js';
import { isValidSpawnFloor } from './spawning/spawnValidation.js';

const JOB_SITES = new Set(['COMPOSTER', 'SMOKER', 'BLAST_FURNACE', 'BARREL', 'CARTOGRAPHY_TABLE', 'BREWING_STAND', 'FLETCHING_TABLE', 'LECTERN', 'CAULDRON', 'GRINDSTONE', 'SMITHING_TABLE', 'STONECUTTER', 'LOOM', 'BELL'].map((n) => BLOCKS[n]).filter((v) => v !== undefined));
const TICK = 1 / 20;

export class ZombieSiege {
  constructor(game, random = Math.random) {
    this.game = game; this.random = random;
    this.decided = false; this.active = null; this.lastTime = null; this.acc = 0; this.log = [];
  }

  /** The village points (beds and job sites the villagers hold) that make a place "part of a logical village". */
  villagePoints() {
    const pts = [];
    for (const bed of this.game.bedManager?.beds?.values?.() ?? []) if (bed?.footPos) pts.push({ x: bed.footPos[0], y: bed.footPos[1], z: bed.footPos[2] });
    for (const m of this.game.mobs?.mobs ?? []) {
      const w = m.type === 'villager' ? (m.workstationPos ?? m.workstation) : null;
      if (w && Number.isFinite(w.x ?? w[0])) pts.push({ x: w.x ?? w[0], y: w.y ?? w[1], z: w.z ?? w[2] });
    }
    return pts;
  }

  /** Inside the 3x3x3 chunk sections centred on a village point's section. */
  inVillage(x, y, z, pts = this.villagePoints()) {
    const sx = Math.floor(x / 16), sy = Math.floor(y / 16), sz = Math.floor(z / 16);
    return pts.some((p) => Math.abs(Math.floor(p.x / 16) - sx) <= 1 && Math.abs(Math.floor(p.y / 16) - sy) <= 1 && Math.abs(Math.floor(p.z / 16) - sz) <= 1);
  }

  /** A zombie spawn spot on the surface at x, z, if the rules allow one. */
  spawnSpot(x, z, pts) {
    const world = this.game.world;
    let y = 63;
    while (y > 0 && world.getVoxel(x, y - 1, z) === BLOCKS.AIR) y--;
    if (y <= 0) return null;
    const floor = world.getVoxel(x, y - 1, z);
    if (!isValidSpawnFloor(world, x, y - 1, z, floor, 'zombie')) return null;
    if (world.getVoxel(x, y, z) !== BLOCKS.AIR || world.getVoxel(x, y + 1, z) !== BLOCKS.AIR) return null;
    if (!this.inVillage(x, y, z, pts)) return null;
    // Dark enough for a zombie: no block light, and the sky darkened to 7 or less.
    const block = world.getBlockLight?.(x, y, z) ?? 0;
    const sky = world.getSkyLight?.(x, y, z) ?? 15;
    if (block > 0 || sky - (world.light?.skyDarken ?? 11) > 7) return null;
    return { x: x + 0.5, y, z: z + 0.5 };
  }

  update(dt) {
    const g = this.game;
    if (String(g.difficulty) === 'peaceful') { this.decided = false; this.active = null; return; }
    if ((g.currentDimension ?? 'overworld') !== 'overworld') return;
    const time = ((g.worldTime ?? 0) % 24000 + 24000) % 24000;
    if (this.lastTime !== null && this.lastTime < 18000 && time >= 18000) {
      this.decided = this.random() < 0.1;
      if (this.decided) this.log.push({ event: 'decided', time });
    }
    this.lastTime = time;
    this.acc += dt;
    while (this.acc >= TICK) { this.acc -= TICK; this.tick(); }
  }

  tick() {
    const g = this.game, world = g.world;
    if (this.active) {
      this.active.timer++;
      if (this.active.timer % 3 !== 0) return;
      const pts = this.villagePoints();
      for (let attempt = 0; attempt < 10; attempt++) {
        const x = Math.floor(this.active.x + this.random() * 16 - 8), z = Math.floor(this.active.z + this.random() * 16 - 8);
        const spot = this.spawnSpot(x, z, pts);
        if (spot) { g.mobs?.spawnMob?.('zombie', spot.x, spot.y, spot.z); this.active.spawned++; break; }
      }
      if (--this.active.left <= 0) { this.log.push({ event: 'ended', spawned: this.active.spawned }); this.active = null; }
      return;
    }
    if (!this.decided) return;
    const p = g.player;
    if (!p || p.gamemode === 'spectator') return;
    // Sunrise ends the night's chance: sky light reaching 12.
    const skyNow = 15 - (world.light?.skyDarken ?? 11);
    if (skyNow >= 12) { this.decided = false; return; }
    const pts = this.villagePoints();
    if (!this.inVillage(p.position.x, p.position.y, p.position.z, pts)) return;
    for (let attempt = 0; attempt < 10; attempt++) {
      const a = this.random() * Math.PI * 2;
      const x = Math.floor(p.position.x + Math.cos(a) * 32), z = Math.floor(p.position.z + Math.sin(a) * 32);
      if (this.spawnSpot(x, z, pts)) {
        this.decided = false;
        this.active = { x, z, left: 20, timer: 0, spawned: 0 };
        this.log.push({ event: 'started', x, z });
        return;
      }
    }
  }
}
