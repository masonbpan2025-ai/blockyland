import { advancementEvent } from './advancements.js';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
// The 16 dye colours, shared with the wool and concrete families so a bed's blanket cannot drift
// from a wool block of the same colour.
import { timeAfterSleep, sleepingAllowedIn } from './deathAndRespawn.js';
import { DYE_COLOURS } from './colourPalette.js';

/** Hex tints for a bed blanket, keyed by colour name. */
const BED_TINTS = DYE_COLOURS;

// Direction vector mapping: [dx, dy, dz]
// 0: East (+X), 1: West (-X), 2: South (+Z), 3: North (-Z)
export const BED_DIRECTIONS = [
  [1, 0, 0],   // 0: East
  [-1, 0, 0],  // 1: West
  [0, 0, 1],   // 2: South
  [0, 0, -1]   // 3: North
];

export const BED_ROTATIONS = [
  -Math.PI / 2, // 0: East (+X)
  Math.PI / 2,  // 1: West (-X)
  Math.PI,      // 2: South (+Z)
  0             // 3: North (-Z)
];

/**
 * Creates 3D Box geometry for bed components with texture UVs from texture manager
 */
function createBoxPart(size, pos, textureId, tm, colorHex = 0xffffff) {
  const geo = new THREE.BoxGeometry(...size);
  geo.translate(...pos);

  const uv = geo.attributes.uv;
  const tile = tm ? tm.getFaceUVs(textureId, 'all') : { u0: 0, v0: 0, u1: 1, v1: 1 };
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(
      i,
      THREE.MathUtils.lerp(tile.u0, tile.u1, uv.getX(i)),
      THREE.MathUtils.lerp(tile.v0, tile.v1, uv.getY(i))
    );
  }

  const c = new THREE.Color(colorHex);
  const colors = [];
  for (let i = 0; i < geo.attributes.position.count; i++) {
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(0), 1));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count).fill(0), 1));
  return geo;
}

/**
 * Procedural 3D Minecraft Bed geometry (9/16 = 0.5625 height, wood legs & frame, red wool blanket, white pillow)
 */
export function createBedGeometry(isHead, dir = 3, tm = null, colour = null) {
  // A bed's blanket is its dye colour; the pillow stays white in vanilla for every colour. The colour
  // defaults to red, which is what this function did before it took a parameter -- the game only had
  // red beds, so both the wool block and the tint were hard-coded.
  const woolBlock = (colour && BLOCKS[colour.toUpperCase() + '_WOOL'] !== undefined)
    ? BLOCKS[colour.toUpperCase() + '_WOOL']
    : BLOCKS.RED_WOOL;
  const blanketTint = (colour && BED_TINTS[colour]) ? BED_TINTS[colour] : BED_TINTS.red;
  const parts = [];

  // 1. Legs (3/16 = 0.1875 height and width)
  const legSize = [3 / 16, 3 / 16, 3 / 16];
  const legY = 1.5 / 16;

  if (!isHead) {
    // Foot part: two legs at outer foot corners
    parts.push(createBoxPart(legSize, [2 / 16, legY, 14 / 16], BLOCKS.OAK_PLANKS, tm, 0x8b653e));
    parts.push(createBoxPart(legSize, [14 / 16, legY, 14 / 16], BLOCKS.OAK_PLANKS, tm, 0x8b653e));
  } else {
    // Head part: two legs at outer head corners
    parts.push(createBoxPart(legSize, [2 / 16, legY, 2 / 16], BLOCKS.OAK_PLANKS, tm, 0x8b653e));
    parts.push(createBoxPart(legSize, [14 / 16, legY, 2 / 16], BLOCKS.OAK_PLANKS, tm, 0x8b653e));
  }

  // 2. Wooden Frame Base (y = 3/16 to 6/16 -> height 3/16, centered at y = 4.5/16)
  const frameGeo = createBoxPart([1.0, 3 / 16, 1.0], [0.5, 4.5 / 16, 0.5], BLOCKS.OAK_PLANKS, tm, 0xa07548);
  parts.push(frameGeo);

  // 3. Mattress & Blanket (y = 6/16 to 9/16 -> height 3/16, centered at y = 7.5/16)
  if (!isHead) {
    // Foot: the full blanket, in this bed's colour
    const blanketGeo = createBoxPart([1.0, 3 / 16, 1.0], [0.5, 7.5 / 16, 0.5], woolBlock, tm, blanketTint);
    parts.push(blanketGeo);
  } else {
    // Head: white pillow at north (z = 0..0.4) and the coloured blanket for the remainder
    // Pillow (slightly raised for authentic puffy Minecraft pillow feel: height 3.5/16, centered at y = 7.75/16)
    const pillowGeo = createBoxPart([0.88, 3.5 / 16, 0.42], [0.5, 7.75 / 16, 0.28], BLOCKS.WHITE_WOOL, tm, 0xf4f4f4);
    parts.push(pillowGeo);

    // Remaining blanket under and behind pillow
    const blanketGeo = createBoxPart([1.0, 3 / 16, 0.58], [0.5, 7.5 / 16, 0.71], woolBlock, tm, blanketTint);
    parts.push(blanketGeo);
  }

  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();

  // Rotate around center [0.5, 0, 0.5] according to direction
  const rotAngle = BED_ROTATIONS[dir] || 0;
  if (rotAngle !== 0) {
    merged.translate(-0.5, 0, -0.5);
    merged.rotateY(rotAngle);
    merged.translate(0.5, 0, 0.5);
  }

  return merged;
}

export class BedManager {
  constructor(game) {
    this.game = game;
    // Map of coordinate key `x,y,z` -> bed object
    this.beds = new Map();
    // Sleeping state
    this.sleepingBed = null;
    this.sleepTimer = 0;
    this.sleepDuration = 3.5; // seconds
    this.isSleeping = false;
    this.savedCameraPos = null;
  }

  getKey(x, y, z) {
    return `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  }

  getBed(x, y, z) {
    return this.beds.get(this.getKey(x, y, z)) || null;
  }

  registerBed(footPos, headPos, dir) {
    const footKey = this.getKey(...footPos);
    const headKey = this.getKey(...headPos);
    const bed = {
      footPos: [Math.floor(footPos[0]), Math.floor(footPos[1]), Math.floor(footPos[2])],
      headPos: [Math.floor(headPos[0]), Math.floor(headPos[1]), Math.floor(headPos[2])],
      dir: dir || 0
    };
    this.beds.set(footKey, bed);
    this.beds.set(headKey, bed);
    return bed;
  }

  canPlaceBed(world, footPos, headPos) {
    const [fx, fy, fz] = footPos;
    const [hx, hy, hz] = headPos;

    // Both positions must be within world bounds
    if (fy <= 0 || hy <= 0) return false;

    // Foot voxel must be AIR or replaceable (tall grass, flowers, water)
    const footVoxel = world.getVoxel(fx, fy, fz);
    const footDef = BLOCK_DEFS[footVoxel];
    if (footVoxel !== BLOCKS.AIR && (!footDef || (!footDef.plant && footVoxel !== BLOCKS.WATER))) {
      return false;
    }

    // Head voxel must be AIR or replaceable
    const headVoxel = world.getVoxel(hx, hy, hz);
    const headDef = BLOCK_DEFS[headVoxel];
    if (headVoxel !== BLOCKS.AIR && (!headDef || (!headDef.plant && headVoxel !== BLOCKS.WATER))) {
      return false;
    }

    // Both must have solid ground underneath them
    const footBelow = world.getVoxel(fx, fy - 1, fz);
    const headBelow = world.getVoxel(hx, hy - 1, hz);
    const footBelowDef = BLOCK_DEFS[footBelow];
    const headBelowDef = BLOCK_DEFS[headBelow];

    const footSolid = footBelow !== BLOCKS.AIR && footBelowDef && footBelowDef.solid !== false && !footBelowDef.plant;
    const headSolid = headBelow !== BLOCKS.AIR && headBelowDef && headBelowDef.solid !== false && !headBelowDef.plant;

    return footSolid && headSolid;
  }

  placeBed(world, footPos, dir) {
    const offset = BED_DIRECTIONS[dir] || [0, 0, -1];
    const headPos = [footPos[0] + offset[0], footPos[1], footPos[2] + offset[2]];

    if (!this.canPlaceBed(world, footPos, headPos)) {
      return { success: false, reason: 'Bed cannot be placed here' };
    }

    // Set world voxels
    world.setVoxel(footPos[0], footPos[1], footPos[2], BLOCKS.RED_BED_FOOT);
    world.setVoxel(headPos[0], headPos[1], headPos[2], BLOCKS.RED_BED_HEAD);

    const bed = this.registerBed(footPos, headPos, dir);

    // Rebuild chunk meshes
    this.rebuildBlockChunk(footPos[0], footPos[2]);
    this.rebuildBlockChunk(headPos[0], headPos[2]);

    return { success: true, bed };
  }

  onBlockBroken(x, y, z) {
    const key = this.getKey(x, y, z);
    const bed = this.beds.get(key);
    if (!bed) return false;

    // Identify companion position
    const isFoot = (bed.footPos[0] === Math.floor(x) && bed.footPos[1] === Math.floor(y) && bed.footPos[2] === Math.floor(z));
    const companion = isFoot ? bed.headPos : bed.footPos;

    // Remove both registrations
    this.beds.delete(this.getKey(...bed.footPos));
    this.beds.delete(this.getKey(...bed.headPos));

    // Clear broken block and companion in world
    if (this.game.world) {
      this.game.world.setVoxel(x, y, z, BLOCKS.AIR);
      const compVoxel = this.game.world.getVoxel(...companion);
      if (compVoxel === BLOCKS.RED_BED_FOOT || compVoxel === BLOCKS.RED_BED_HEAD) {
        this.game.world.setVoxel(...companion, BLOCKS.AIR);
        this.rebuildBlockChunk(companion[0], companion[2]);
      }
    }

    // If player is currently sleeping in this bed, wake them up
    if (this.isSleeping && this.sleepingBed === bed) {
      this.leaveBed();
    }

    // Spawn 1 red bed item drop
    if (this.game.entities && typeof this.game.entities.spawnDroppedItem === 'function') {
      const dropPos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);
      this.game.entities.spawnDroppedItem(dropPos, 'red_bed', false, 1);
    }

    return true;
  }

  rebuildBlockChunk(x, z) {
    if (!this.game) return;
    const cx = Math.floor(x / 16);
    const cz = Math.floor(z / 16);
    const chunk = this.game.world?.getChunk(cx, cz);
    if (chunk && typeof this.game.rebuildChunkMesh === 'function') {
      this.game.rebuildChunkMesh(chunk);
    }
  }

  explode(x, y, z) {
    const world = this.game.world;
    const pos = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);

    // 1. Play explosion sound
    if (this.game.sounds?.playExplosion) {
      this.game.sounds.playExplosion();
    }

    // 2. Remove bed blocks
    const bed = this.getBed(x, y, z);
    if (bed) {
      world.setVoxel(...bed.footPos, BLOCKS.AIR);
      world.setVoxel(...bed.headPos, BLOCKS.AIR);
      this.beds.delete(this.getKey(...bed.footPos));
      this.beds.delete(this.getKey(...bed.headPos));
    } else {
      world.setVoxel(x, y, z, BLOCKS.AIR);
    }

    // 3. Destroy blocks in 3-block sphere
    const radius = 3;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dz = -radius; dz <= radius; dz++) {
          const distSq = dx * dx + dy * dy + dz * dz;
          if (distSq <= radius * radius) {
            const bx = Math.floor(x) + dx;
            const by = Math.floor(y) + dy;
            const bz = Math.floor(z) + dz;
            const v = world.getVoxel(bx, by, bz);
            if (v !== BLOCKS.AIR && v !== BLOCKS.BEDROCK && v !== BLOCKS.OBSIDIAN) {
              world.setVoxel(bx, by, bz, BLOCKS.AIR);
              // Small chance to place fire around explosion center
              if (Math.random() < 0.25 && world.getVoxel(bx, by - 1, bz) !== BLOCKS.AIR) {
                world.setVoxel(bx, by, bz, BLOCKS.FIRE);
              }
            }
          }
        }
      }
    }

    // 4. Damage player & knockback
    const player = this.game.player;
    if (player) {
      const pDist = player.position.distanceTo(pos);
      if (pDist < 6) {
        const damage = Math.round(Math.max(4, 20 * (1 - pDist / 6)));
        player.takeDamage?.(damage);
        const knock = player.position.clone().sub(pos).normalize().multiplyScalar(15);
        if (player.velocity) {
          player.velocity.x += knock.x;
          player.velocity.y += Math.max(8, knock.y);
          player.velocity.z += knock.z;
        }
      }
    }

    // 5. Spawn explosion particles
    if (this.game.entities?.spawnBlockParticles) {
      this.game.entities.spawnBlockParticles(pos, BLOCKS.FIRE);
    }

    // 6. Reload chunks
    this.game.loadChunksAroundPlayer?.();
    this.game.refreshDirtyChunks?.();
  }

  isHostileMobNearby(bedPos) {
    const mobs = this.game.mobs?.mobs || [];
    const hostileTypes = [
      'zombie', 'skeleton', 'pillager', 'creeper', 'enderman',
      'warden', 'blaze', 'piglin', 'ghast', 'magma_cube', 'shulker'
    ];

    for (const mob of mobs) {
      const mobPos = mob.mesh?.position || mob.position;
      if (!mobPos) continue;

      const isHostile = hostileTypes.includes(mob.type) || mob.behaviorType === 'hostile';
      if (!isHostile) continue;

      const dx = mobPos.x - (bedPos[0] + 0.5);
      const dy = mobPos.y - (bedPos[1] + 0.5);
      const dz = mobPos.z - (bedPos[2] + 0.5);

      // Minecraft hostile mob detection range: 8 horizontal, 5 vertical
      const horizDist = Math.sqrt(dx * dx + dz * dz);
      if (horizDist <= 8.0 && Math.abs(dy) <= 5.0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Where the player stands when they get up.
   *
   * @returns {THREE.Vector3|null} null when there is nowhere safe. The old version fell back to
   *   `bed.position + 0.6 up`, which is *inside* the bed block, so an obstructed bed put the player in a
   *   solid block rather than reporting that it could not be used.
   */
  getSafeBedSpawn(bed) {
    const world = this.game.world;
    if (!world?.getVoxel || !bed?.footPos) return null;
    const [fx, fy, fz] = bed.footPos;

    // Check adjacent blocks around the bed for safe standing space (grounded and 2 AIR blocks tall)
    const offsets = [
      [1, 0], [-1, 0], [0, 1], [0, -1],
      [1, 1], [-1, 1], [1, -1], [-1, -1]
    ];

    for (const [dx, dz] of offsets) {
      const sx = fx + dx;
      const sz = fz + dz;
      const below = world.getVoxel(sx, fy - 1, sz);
      const atFeet = world.getVoxel(sx, fy, sz);
      const atHead = world.getVoxel(sx, fy + 1, sz);

      const belowDef = BLOCK_DEFS[below];
      const isSolidGround = below !== BLOCKS.AIR && belowDef && belowDef.solid !== false && !belowDef.plant;
      const isFree = atFeet === BLOCKS.AIR && atHead === BLOCKS.AIR;

      if (isSolidGround && isFree) {
        return new THREE.Vector3(sx + 0.5, fy, sz + 0.5);
      }
    }

    // Nowhere to stand. Reported, not guessed at.
    return null;
  }

  interact(x, y, z, player) {
    const key = this.getKey(x, y, z);
    let bed = this.beds.get(key);

    // If bed was placed before manager registration, synthesize bed info
    if (!bed) {
      const voxel = this.game.world?.getVoxel(x, y, z);
      const isHead = voxel === BLOCKS.RED_BED_HEAD;
      bed = {
        footPos: isHead ? [x, y, z] : [x, y, z],
        headPos: isHead ? [x, y, z] : [x, y, z],
        dir: 0
      };
      this.beds.set(key, bed);
    }

    // 1. Dimension Check: Nether Explosion!
    //
    // By dimension CAPABILITY rather than a biome-name string. The old test was
    // `isNether || selectedBiome.includes('nether')`, which never covered the End and would have detonated a
    // bed in any biome whose name merely contained "nether".
    const dimension = this.game.currentDimension || this.game.world?.dimension || 'overworld';
    if (!sleepingAllowedIn(dimension)) {
      this.explode(x, y, z);
      return { success: false, exploded: true, reason: `Sleeping is not possible in ${dimension}` };
    }

    // 2. Distance Check -- BEFORE binding the respawn point.
    //
    // Reach used to be checked AFTER `player.spawnPosition.copy(safeSpawn)`, so a bed on the far side of the
    // world still became your respawn point as long as you managed to right-click it.
    const bedCenter = new THREE.Vector3(
      (bed.footPos[0] + bed.headPos[0]) / 2 + 0.5,
      bed.footPos[1] + 0.5,
      (bed.footPos[2] + bed.headPos[2]) / 2 + 0.5
    );
    if (player.position.distanceTo(bedCenter) > 4.5) {
      this.game.ui?.addChatMessage?.('Bed is too far away', 'system');
      return { success: false, reason: 'Bed is too far away' };
    }

    // 3. Set the BED respawn point.
    //
    // `player.spawnPosition` is the WORLD spawn and must not move. The old code copied the bed position over
    // it, so sleeping permanently relocated the world's spawn point for the rest of the session.
    const safeSpawn = this.getSafeBedSpawn(bed);
    if (!safeSpawn) {
      // Reported rather than falling back to a position inside the bed, which is what the old default did.
      this.game.ui?.addChatMessage?.('The bed is obstructed', 'system');
      return { success: false, reason: 'The bed is obstructed' };
    }
    player.bedSpawnPosition = safeSpawn.clone();
    // The bed itself, which respawn checks is still there. Only the stand spot beside it was kept, and respawn looked
    // for a bed AT that spot -- air -- so every bed was "missing" and sleeping never set a respawn point.
    player.bedBlockPosition = { x: bed.footPos[0], y: bed.footPos[1], z: bed.footPos[2] };
    player.anchorSpawn = null;
    player.bedDimension = dimension;
    this.game.sounds?.playClick?.();
    this.game.ui?.addChatMessage?.('Respawn point set', 'system');

    // 4. Time & Weather Check
    const time = this.game.worldTime ?? 6000;
    const isNight = (time >= 12542 && time <= 23458);
    const isThunder = (this.game.weather?.weatherType === 'thunder');

    if (!isNight && !isThunder) {
      this.game.ui?.addChatMessage?.('You can sleep only at night or during thunderstorms', 'system');
      return { success: false, reason: 'You can sleep only at night or during thunderstorms' };
    }

    // 5. Hostile Mob Check
    if (this.isHostileMobNearby(bed.footPos) || this.isHostileMobNearby(bed.headPos)) {
      this.game.ui?.addChatMessage?.('You may not rest now; there are monsters nearby', 'system');
      return { success: false, reason: 'You may not rest now; there are monsters nearby' };
    }

    // 6. Enter Bed & Start Sleep
    this.startSleeping(bed, player);
    return { success: true };
  }

  startSleeping(bed, player) {
    this.isSleeping = true;
    // Phantom: they come to a player whose "time since rest" is three days or more, and lying in a bed resets it.
    // Nothing reset either insomnia timer, so sleeping every night still brought phantoms after the third day.
    resetInsomnia(this.game);
    advancementEvent('sleep');
    this.sleepingBed = bed;
    this.sleepTimer = 0;
    player.isSleeping = true;

    // Position player lying on the bed
    const [hx, hy, hz] = bed.headPos;
    const [fx, fy, fz] = bed.footPos;
    const centerX = (hx + fx) / 2 + 0.5;
    const centerY = fy + 0.5625;
    const centerZ = (hz + fz) / 2 + 0.5;

    this.savedCameraPos = player.position.clone();
    player.position.set(centerX, centerY, centerZ);
    if (player.velocity) player.velocity.set(0, 0, 0);

    // Show sleeping UI overlay
    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('sleeping-overlay');
      if (overlay) {
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
      }
    }
  }

  leaveBed() {
    if (!this.isSleeping) return;
    this.isSleeping = false;
    const player = this.game.player;
    if (player) {
      player.isSleeping = false;
      if (this.sleepingBed) {
        const safe = this.getSafeBedSpawn(this.sleepingBed);
        player.position.copy(safe);
      }
    }

    this.sleepingBed = null;
    this.sleepTimer = 0;

    // Hide sleeping UI overlay
    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('sleeping-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
      }
    }
  }

  wakeUp() {
    this.isSleeping = false;
    const player = this.game.player;

    // 1. Advance to the next morning.
    //
    // This set the time to 1000, which is mid-morning and skipped the sunrise; Java advances to dawn of the
    // following day. The day counter is separate from the time of day, so it is advanced too.
    if (this.game) {
      const morning = timeAfterSleep();
      this.game.worldTime = morning;
      this.game.dayCount = (this.game.dayCount ?? 0) + 1;
      this.game.sky?.setTime?.(morning);

      // 2. Clear weather
      if (this.game.weather?.resetAfterSleep) {
        this.game.weather.resetAfterSleep();
      } else if (this.game.weather?.setWeather && this.game.gamerules?.doWeatherCycle !== false) {
        this.game.weather.setWeather('clear');
      }
    }

    // 3. NO heal and NO meal.
    //
    // This is the line that made a bed a free full restore: it set health to maximum and hunger to 20. Sleep
    // skips the night; natural regeneration may happen during the skipped time under its own rules, but
    // waking up is not a heal and has never been one.
    if (player) {
      player.isSleeping = false;
      // Stand next to the bed.
      if (this.sleepingBed) {
        const safe = this.getSafeBedSpawn(this.sleepingBed);
        if (safe) player.position.copy(safe);
      }
    }

    this.sleepingBed = null;
    this.sleepTimer = 0;

    // Hide sleeping overlay
    if (typeof document !== 'undefined') {
      const overlay = document.getElementById('sleeping-overlay');
      if (overlay) {
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
      }
    }

    this.game.ui?.addChatMessage?.('Good morning.', 'system');
  }

  update(dt) {
    if (!this.isSleeping) return;

    this.sleepTimer += dt;
    const player = this.game.player;

    // Keep player in sleeping position
    if (this.sleepingBed && player) {
      const [hx, hy, hz] = this.sleepingBed.headPos;
      const [fx, fy, fz] = this.sleepingBed.footPos;
      player.position.set((hx + fx) / 2 + 0.5, fy + 0.5625, (hz + fz) / 2 + 0.5);
      if (player.velocity) player.velocity.set(0, 0, 0);
    }

    // If user presses movement keys, wake up early (leave bed)
    if (player?.keys) {
      if (player.keys['KeyW'] || player.keys['KeyS'] || player.keys['KeyA'] || player.keys['KeyD'] ||
          player.keys['Space'] || player.keys['ShiftLeft'] || player.keys['Escape']) {
        this.leaveBed();
        return;
      }
    }

    // When sleep duration finishes, complete sleep cycle
    if (this.sleepTimer >= this.sleepDuration) {
      this.wakeUp();
    }
  }

  handleBedBounce(player, blockBelow) {
    if (blockBelow !== BLOCKS.RED_BED_FOOT && blockBelow !== BLOCKS.RED_BED_HEAD) return false;

    // Bed bounce: 66% velocity reflection, negates fall damage
    if (player.velocity && player.velocity.y < -1.5) {
      player.velocity.y = -player.velocity.y * 0.66;
      player.fallDistance = 0;
      this.game.sounds?.playBedBounce?.();
      return true;
    }
    return false;
  }
}

/** Reset the player's "time since rest" (the phantom insomnia timers): on lying down in a bed, and on death. */
export function resetInsomnia(game) {
  game?.mobs?.hostileBehaviors?.resetSleep?.();
  game?.spawnManager?.specialSpawners?.phantom?.reset?.();
}
