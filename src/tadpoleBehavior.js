import * as THREE from 'three';
import { buildModel } from './mobVisuals/modelBuilder.js';

/**
 * Tadpole rules and model.
 *
 * Reference: https://minecraft.wiki/w/Tadpole
 *
 * The tadpole is unusual: the wiki is explicit that "the tadpole is treated by the game as a
 * completely different mob from the frog", not a baby variant. It is a bucketable aquatic passive
 * mob that hatches from frogspawn, drowns on land after a short time, is hunted by axolotls, and
 * matures into whichever frog variant its *current biome* dictates — regardless of its parents.
 */

/** Wiki: 6 HP (raised from 4 in Bedrock 1.18.20.24). */
export const TADPOLE_HEALTH = 6;

/** Wiki: 0.4 wide x 0.3 tall (reduced from 0.5 x 0.4 in 22w19a). */
export const TADPOLE_DIMENSIONS = { width: 0.4, height: 0.3 };

/**
 * Wiki: "They die in less than 20 seconds after being out of water."
 *
 * The grace period is deliberately just under the wiki's figure, so a tadpole that has been dry for
 * the full time is already dead rather than one tick short.
 */
export const TADPOLE_DRY_SECONDS = 19;

/** Wiki: tadpoles swim aimlessly in water. */
export const TADPOLE_SPEED = { water: 1.4, land: 0.6 };

/** Wiki: it flops on land and seeks the nearest water. */
export const TADPOLE_WATER_SEARCH = { radius: 12, giveUpSeconds: 30 };

/** Wiki: tadpoles follow a player holding a slimeball. */
export const TADPOLE_FOLLOW_RANGE = 6;

/** Wiki: they hatch from frogspawn in groups of 2-5. */
export const TADPOLE_HATCH_GROUP = { min: 2, max: 5 };

/** Wiki: one Minecraft day, 20 minutes, and 10% faster per slimeball. */
export const TADPOLE_GROWTH_SECONDS = 1200;
export const TADPOLE_FEED_ACCELERATION = 0.1;

/**
 * The biome tables that decide the frog variant a tadpole matures into.
 *
 * Wiki gives a separate table for tadpoles, which is close to but *not* the same as the frog's
 * natural-spawn table: for example a river is temperate for a tadpole, and the wiki's tadpole table
 * lists Stony Peaks as temperate in Java while the frog's other-biome table lists it as cold in
 * Bedrock. The tadpole table is implemented here as written, and the two are kept separate so one
 * cannot silently drift into the other.
 */
export const TADPOLE_TEMPERATE_BIOMES = [
  'river', 'beach', 'taiga', 'old_growth_pine_taiga', 'old_growth_spruce_taiga', 'birch_forest',
  'old_growth_birch_forest', 'dark_forest', 'forest', 'flower_forest', 'mushroom_fields', 'meadow',
  'cherry_grove', 'plains', 'sunflower_plains', 'swamp', 'windswept_hills',
  'windswept_gravelly_hills', 'windswept_forest', 'ocean', 'dripstone_caves', 'lush_caves',
  'stony_shore', 'stony_peaks', 'cold_ocean', 'deep_cold_ocean', 'lukewarm_ocean',
  'deep_lukewarm_ocean', 'the_void'
];

export const TADPOLE_COLD_BIOMES = [
  'frozen_river', 'snowy_beach', 'grove', 'frozen_peaks', 'jagged_peaks', 'snowy_plains',
  'ice_spikes', 'snowy_slopes', 'snowy_taiga', 'frozen_ocean', 'deep_frozen_ocean', 'the_end',
  'deep_dark', 'end_barrens', 'end_highlands', 'end_midlands', 'small_end_islands'
];

export const TADPOLE_WARM_BIOMES = [
  'jungle', 'bamboo_jungle', 'sparse_jungle', 'badlands', 'eroded_badlands', 'wooded_badlands',
  'desert', 'savanna', 'savanna_plateau', 'windswept_savanna', 'warm_ocean', 'mangrove_swamp',
  'basalt_deltas', 'crimson_forest', 'nether_wastes', 'soul_sand_valley', 'warped_forest'
];

/** Body colours: a tadpole is a dark rounded blob with a pale underside. */
export const TADPOLE_COLORS = { body: 0x3f3f2e, belly: 0x6b6b52, eye: 0x111827 };

/** True when the mob is a tadpole. */
export function isTadpole(mob) {
  return mob?.type === 'tadpole';
}

/**
 * The frog variant a tadpole matures into, decided by where it is.
 *
 * Wiki: "A tadpole grows up into one of the variants of a frog depending on the tadpole's location",
 * and this is the game's one case of a baby's adult form being set by the environment rather than
 * its parents. Anything unlisted is temperate, which is the table's largest column.
 */
export function tadpoleVariantForBiome(biome) {
  const name = String(biome ?? '').toLowerCase();
  if (TADPOLE_COLD_BIOMES.includes(name)) return 'cold';
  if (TADPOLE_WARM_BIOMES.includes(name)) return 'warm';
  if (TADPOLE_TEMPERATE_BIOMES.includes(name)) return 'temperate';
  return 'temperate';
}

/**
 * How many tadpoles a frogspawn cluster hatches.
 *
 * Wiki: "Tadpoles hatch from frogspawn in groups of 2-5."
 */
export function rollTadpoleHatchCount(random = Math.random) {
  const { min, max } = TADPOLE_HATCH_GROUP;
  return min + Math.floor(random() * (max - min + 1));
}

/**
 * Whether a tadpole has been out of water long enough to die.
 *
 * Wiki: "They die in less than 20 seconds after being out of water."
 *
 * Returns the remaining grace, or 0 when it should die.
 */
export function updateTadpoleDryness(mob, dt, inWater) {
  if (!isTadpole(mob)) return null;
  if (inWater) {
    mob.drySeconds = 0;
    return TADPOLE_DRY_SECONDS;
  }
  mob.drySeconds = (mob.drySeconds || 0) + dt;
  return Math.max(0, TADPOLE_DRY_SECONDS - mob.drySeconds);
}

/**
 * Advance a tadpole's growth.
 *
 * Wiki: one Minecraft day, accelerated 10% per slimeball. Returns true on the step it matures.
 *
 * This does not spawn the frog; the caller does, because the replacement needs the mob manager and
 * the current biome. `tadpoleVariantForBiome` is what it uses.
 */
export function updateTadpoleGrowth(mob, dt) {
  if (!isTadpole(mob)) return false;
  if (mob.ageLocked) return false;
  mob.growthTimer = (mob.growthTimer ?? TADPOLE_GROWTH_SECONDS) - dt;
  if (mob.growthTimer > 0) return false;
  mob.growthTimer = 0;
  mob.readyToMature = true;
  return true;
}

/** Wiki: a slimeball speeds a tadpole's growth by 10%. A golden dandelion stops it aging entirely. */
export function accelerateTadpoleGrowth(mob, fraction = TADPOLE_FEED_ACCELERATION) {
  // An age-locked tadpole is not growing, so there is no remaining time to reduce. Feeding it would
  // otherwise quietly burn the fraction while having no visible effect.
  if (!isTadpole(mob) || mob.readyToMature || mob.ageLocked) return 0;
  const remaining = mob.growthTimer ?? TADPOLE_GROWTH_SECONDS;
  const reduction = remaining * fraction;
  mob.growthTimer = Math.max(0, remaining - reduction);
  return reduction;
}

/**
 * Tadpole model: a small rounded head and body with a thin tail.
 *
 * The tail is a separate mesh so it can wave, which is the whole motion of the mob.
 */
/** The real 16x16 tadpole sheet. The model lives in this module, so its path does too. */
const TADPOLE_SKIN_PATH = '/assets/entity/tadpole/tadpole.png';
/**
 * The tadpole's real model, decompiled from `TadpoleEntityModel`. Texture 16x16.
 *
 * Its tail has no width (0x2x7), so it is a flat plane -- the fifth mob in this project where that is the case.
 */
const TADPOLE_MODEL = {
  texture: TADPOLE_SKIN_PATH,
  textureSize: [16, 16],
  units: 16,
  transparent: true,
  alphaTest: 0.1,
  parts: [
    { name: 'body', box: [3, 2, 3], uv: { u: 0, v: 0, tw: 3, th: 2, td: 3 }, at: [0, 22, -3] },
    // Vanilla models the tail as a vertical fin (0x2x7). In vanilla's 16x16 tadpole texture, the tail
    // is at u: 0, v: 7 with width 7 and height 2. Both side faces (-X and +X) map this 7x2 texture.
    {
      name: 'tail',
      parent: 'body',
      box: [0.35, 2, 7],
      uv: {
        faces: [
          { x: 0, y: 7, w: 7, h: 2 }, // +X Right
          { x: 0, y: 7, w: 7, h: 2 }, // -X Left
          { x: 0, y: 7, w: 7, h: 1 }, // +Y Top
          { x: 0, y: 7, w: 7, h: 1 }, // -Y Bottom
          { x: 0, y: 7, w: 1, h: 2 }, // +Z Front
          { x: 6, y: 7, w: 1, h: 2 }  // -Z Back
        ]
      },
      at: [0, 0, 3]
    }
  ]
};

export function createTadpoleModel(bodyMat, bellyMat, eyeMat, options = {}) {
  if (options.loadTexture) {
    const built = buildModel(TADPOLE_MODEL, {
      materials: { belly: bellyMat, eye: eyeMat },
      textureContext: { texW: 16, texH: 16 },
      loadTexture: options.loadTexture,
      onTextureReady: options.onTextureReady
    });

    // GROUND BY MEASUREMENT. Vanilla's frame sits 22 units up; this project's origin is the mob's feet, so a
    // direct transcription would float. The pattern is now used on three mobs without a guessed offset.
    const inner = new THREE.Group();
    while (built.group.children.length) inner.add(built.group.children[0]);
    inner.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(inner);
    inner.position.set(0, -bounds.min.y, 0);
    built.group.add(inner);

    // Eyes are modelled marks; the real model paints them onto the 3x2x3 body patch.
    const headMesh = built.parts.body;
    const eyeGeo = new THREE.BoxGeometry(0.04, 0.04, 0.03);
    const eyes = [-1, 1].map((side) => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(side * 0.06, 0.02, 0.1);
      if (headMesh) headMesh.add(eye);
      return eye;
    });

    return {
      group: built.group,
      body: built.parts.body,
      belly: built.parts.body,
      head: built.parts.body,
      eyes,
      tail: built.parts.tail,
      parts: built.parts
    };
  }

  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.24), bodyMat);
  body.position.set(0, 0.16, 0.04);
  group.add(body);

  const belly = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.2), bellyMat);
  belly.position.set(0, 0.1, 0.04);
  group.add(belly);

  // A blunt head, which is what makes a tadpole read as a head-with-a-tail.
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), bodyMat);
  head.position.set(0, 0.17, 0.22);
  group.add(head);

  const eyeGeo = new THREE.BoxGeometry(0.05, 0.05, 0.03);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.07, 0.03, 0.11);
    head.add(eye);
    return eye;
  });

  // A flat tail that waves side to side.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.28), bellyMat);
  tail.position.set(0, 0.15, -0.2);
  group.add(tail);

  return { group, body, belly, head, eyes, tail };
}

/**
 * Tail wave, and the flat pose it takes while flopping on land.
 *
 * Wiki: "On land, they flop around like fish", which is why the land pose is a roll rather than a
 * walk.
 */
export function poseTadpole(tadpole, phase) {
  if (!tadpole?.tail) return;
  const swimming = !!tadpole.inWater;
  if (swimming) {
    tadpole.tail.rotation.y = Math.sin(phase) * 0.5;
    if (tadpole.mesh) tadpole.mesh.rotation.z = THREE.MathUtils.lerp(tadpole.mesh.rotation.z, 0, 0.2);
  } else {
    // Beached: it lies on its side and the tail barely moves.
    tadpole.tail.rotation.y = Math.sin(phase * 0.5) * 0.15;
    if (tadpole.mesh) tadpole.mesh.rotation.z = THREE.MathUtils.lerp(tadpole.mesh.rotation.z, Math.PI / 2.4, 0.15);
  }
}

/** Wiki: a tadpole drops nothing at all, and awards no experience. */
export function tadpoleDrops() {
  return [];
}

/** Wiki: as with other baby animals, no experience either. */
export function tadpoleXp() {
  return 0;
}