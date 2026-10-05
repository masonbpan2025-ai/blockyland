import { BLOCKS } from './blocks.js';

// Mineral blocks that can form a valid beacon pyramid
export const BEACON_BASE_BLOCKS = new Set([
  BLOCKS.IRON_BLOCK,
  BLOCKS.GOLD_BLOCK,
  BLOCKS.DIAMOND_BLOCK,
  BLOCKS.EMERALD_BLOCK,
  BLOCKS.NETHERITE_BLOCK
]);

// Beacon Powers by Tier
export const BEACON_POWERS = {
  tier1: ['speed', 'haste'],
  tier2: ['speed', 'haste', 'resistance', 'jump_boost'],
  tier3: ['speed', 'haste', 'resistance', 'jump_boost', 'strength'],
  tier4: ['regeneration']
};

/**
 * Calculates the tier of a beacon pyramid beneath (bx, by, bz)
 * Reference: https://minecraft.wiki/w/Beacon
 */
export function calculateBeaconPyramid(world, bx, by, bz) {
  let tier = 0;

  for (let l = 1; l <= 4; l++) {
    const layerY = by - l;
    if (layerY < 0) break;
    const r = l; // 1 -> 3x3, 2 -> 5x5, 3 -> 7x7, 4 -> 9x9
    let layerValid = true;

    for (let x = bx - r; x <= bx + r; x++) {
      for (let z = bz - r; z <= bz + r; z++) {
        const block = world.getVoxel(x, layerY, z);
        if (!BEACON_BASE_BLOCKS.has(block)) {
          layerValid = false;
          break;
        }
      }
      if (!layerValid) break;
    }

    if (layerValid) {
      tier = l;
    } else {
      break;
    }
  }

  // Beacon must have unobstructed sky view above it (only air or transparent blocks)
  let skyClear = true;
  for (let y = by + 1; y < 64; y++) {
    const b = world.getVoxel(bx, y, bz);
    if (b !== BLOCKS.AIR && b !== BLOCKS.GLASS) {
      skyClear = false;
      break;
    }
  }

  const range = tier > 0 ? (tier * 10 + 10) : 0; // 20, 30, 40, 50

  return {
    tier,
    active: tier > 0 && skyClear,
    skyClear,
    range,
    availablePrimaries: tier >= 3 ? BEACON_POWERS.tier3 : (tier === 2 ? BEACON_POWERS.tier2 : (tier === 1 ? BEACON_POWERS.tier1 : [])),
    hasSecondary: tier >= 4
  };
}

/**
 * Applies Beacon status effects to players within range
 */
export function applyBeaconBuffs(beaconState, player, beaconPos) {
  if (!beaconState || !beaconState.active || !player) return;

  const dx = player.position.x - beaconPos.x;
  const dy = player.position.y - beaconPos.y;
  const dz = player.position.z - beaconPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq <= beaconState.range * beaconState.range) {
    const duration = 16.0; // 16s buffer
    // Vanilla gives the primary power at level I, and at level II once the pyramid is a full four tiers.
    //
    // `applyStatusEffect` is the only way an effect is meant to be put on a player, because it writes into
    // `player.statusEffects`, which is a Map. This used to assign `player.statusEffects[name] = duration`,
    // which sets a plain property on the Map object -- `has`, `get` and `hasStatusEffect` all ignore it, so
    // every beacon power did nothing while looking applied.
    const primaryLevel = beaconState.tier >= 4 ? 2 : 1;

    if (beaconState.primary) {
      player.applyStatusEffect?.(beaconState.primary, duration, primaryLevel);
    }

    if (beaconState.secondary === 'regeneration') {
      player.applyStatusEffect?.('regeneration', duration, 1);
    }
  }
}

// Blocks that can form a valid Conduit frame
export const CONDUIT_FRAME_BLOCKS = new Set([
  BLOCKS.PRISMARINE,
  BLOCKS.PRISMARINE_BRICKS,
  BLOCKS.DARK_PRISMARINE,
  BLOCKS.SEA_LANTERN
]);

/**
 * Calculates Conduit frame completeness
 * Reference: https://minecraft.wiki/w/Conduit
 */
export function calculateConduitFrame(world, cx, cy, cz) {
  // Conduit must be submerged in water
  const conduitBlock = world.getVoxel(cx, cy, cz);
  // Scan 5x5x5 box surrounding conduit for qualifying frame blocks
  let frameCount = 0;

  for (let x = cx - 2; x <= cx + 2; x++) {
    for (let y = cy - 2; y <= cy + 2; y++) {
      for (let z = cz - 2; z <= cz + 2; z++) {
        const dx = Math.abs(x - cx);
        const dy = Math.abs(y - cy);
        const dz = Math.abs(z - cz);

        // Blocks on any of the 3 orthogonal 5x5 rings (radius 2)
        const isRing = (
          (dz === 0 && Math.max(dx, dy) === 2) ||
          (dx === 0 && Math.max(dy, dz) === 2) ||
          (dy === 0 && Math.max(dx, dz) === 2)
        );

        if (isRing) {
          const b = world.getVoxel(x, y, z);
          if (CONDUIT_FRAME_BLOCKS.has(b)) {
            frameCount++;
          }
        }
      }
    }
  }

  // Minimum 16 blocks to activate (range 32), max 42 blocks (range 96)
  const active = frameCount >= 16;
  const range = active ? Math.min(96, Math.floor(16 + (frameCount / 42) * 80)) : 0;
  const complete = frameCount >= 42;

  return {
    active,
    frameCount,
    range,
    complete
  };
}

/**
 * Applies Conduit Power to submerged players and damages hostile mobs
 */
export function applyConduitPower(conduitState, player, conduitPos, mobs = []) {
  if (!conduitState || !conduitState.active || !player) return;

  const dx = player.position.x - conduitPos.x;
  const dy = player.position.y - conduitPos.y;
  const dz = player.position.z - conduitPos.z;
  const distSq = dx * dx + dy * dy + dz * dz;

  if (distSq <= conduitState.range * conduitState.range && player.inWater) {
    // Conduit Power is its own status in vanilla and carries water breathing, night vision and haste, so
    // applying all four is what leaves the player with what a conduit grants. These were written as plain
    // properties on the `statusEffects` Map, which nothing reads -- and `conduit_power` was not even an
    // effect this game knew about.
    const duration = 16.0;
    player.applyStatusEffect?.('conduit_power', duration, 1);
    player.applyStatusEffect?.('water_breathing', duration, 1);
    player.applyStatusEffect?.('night_vision', duration, 1);
    player.applyStatusEffect?.('haste', duration, 1);
  }

  // Complete conduit (42 blocks) attacks hostile underwater mobs within 8 blocks
  if (conduitState.complete && mobs.length > 0) {
    for (const m of mobs) {
      if (m.health > 0 && (m.type === 'drowned' || m.type === 'guardian' || m.type === 'elder_guardian')) {
        const md = m.mesh?.position?.distanceTo(conduitPos) || 999;
        if (md <= 8) {
          m.health = Math.max(0, m.health - 4); // 4 damage every attack cycle
        }
      }
    }
  }
}
