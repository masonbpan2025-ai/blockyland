import * as THREE from 'three';

/**
 * Snow golem rules: the snowball volley, the snow trail, heat sensitivity and the pumpkin helmet.
 *
 * Reference: https://minecraft.wiki/w/Snow_Golem
 *
 * The snow golem is a small built mob with three quirks that make it worth implementing properly: it throws
 * harmless snowballs that PROVOKE whatever they hit, it leaves a trail of snow as it walks, and it dies in
 * hot biomes unless it has Fire Resistance.
 */

/** Wiki: 4 HP. */
export const SNOW_GOLEM_HEALTH = 4;

/** Wiki: 0.7 wide x 1.9 tall in Java. */
export const SNOW_GOLEM_DIMENSIONS = { width: 0.7, height: 1.9 };

/** Wiki: speed 0.2. */
export const SNOW_GOLEM_SPEED = 0.2;

/**
 * Wiki: "Snow golems move toward all monsters (except ghasts and undead mounts) and throw snowballs at them
 * up to 10 blocks away ... When captured, they throw snowballs up to 16 blocks away."
 */
export const SNOW_GOLEM_RANGE = { roam: 10, tethered: 16 };

/** Wiki: "They throw one snowball per second." */
export const SNOW_GOLEM_THROW_SECONDS = 1;

/**
 * Wiki: "Thrown snowballs do not deal damage except to blazes, but they still knock back any mobs that they
 * hit." So the damage table is nearly empty, which is the point of the mob.
 */
export const SNOWBALL_DAMAGE = { default: 0, blaze: 3 };

/**
 * Wiki: "Snow golems take 1 damage per tick when in contact with rain or water and in biomes with a
 * temperature greater than 1.0", and "The Fire Resistance effect allows them to survive in these biomes."
 */
export const SNOW_GOLEM_HEAT = { maxTemperature: 1.0, damagePerTick: 1 };

/** Wiki examples of hot biomes: savannas, badlands, deserts, and biomes in the Nether. */
export const SNOW_GOLEM_HOT_BIOMES = ['savanna', 'savanna_plateau', 'windswept_savanna', 'badlands', 'eroded_badlands', 'wooded_badlands', 'desert', 'nether_wastes', 'crimson_forest', 'warped_forest', 'soul_sand_valley', 'basalt_deltas'];

/** Wiki: it is "immune to damage from powder snow" and "also immune to fall damage". */
export const SNOW_GOLEM_TRAITS = { powderSnowImmune: true, fallDamageImmune: true, avoidsWater: true };

/** Wiki: it "leaves a trail of snow on the ground if the blocks can support it", suppressed by mobGriefing. */
export const SNOW_GOLEM_TRAIL = { block: 'snow', requiresSupport: true, suppressedByMobGriefing: true };

/** Wiki: "Shearing a snow golem removes the pumpkin, revealing its derpy face and making it drop the pumpkin." */
export const SNOW_GOLEM_SHEAR_DROP = 'carved_pumpkin';

/**
 * Wiki: it wears its pumpkin "like a helmet", so the head is hidden beneath it. `Pumpkin` is its own tag,
 * which is why shearing is the only way to see the face.
 */
export const SNOW_GOLEM_PUMPKIN = 'carved_pumpkin';

/** Body colours: three snowballs, a pale face and a dark carved-pumpkin helmet. */
export const SNOW_GOLEM_COLORS = { snow: 0xf2f7fb, shadow: 0xd6e2ee, pumpkin: 0xd9761b, face: 0x1b1b1b };

/** True when the mob is a snow golem. */
export function isSnowGolem(mob) {
  return mob?.type === 'snow_golem';
}

/** Wiki: 0.7 x 1.9. */
export function snowGolemDimensions() {
  return { ...SNOW_GOLEM_DIMENSIONS };
}

/**
 * The biomes it cannot survive in.
 *
 * Wiki: it takes damage "in biomes with a temperature greater than 1.0", and names savannas, badlands,
 * deserts and Nether biomes as examples. Biome temperature is not modelled here, so the list is explicit --
 * which also means it can be checked rather than inferred from a number nothing computes.
 */
export function isHotBiome(biome) {
  if (typeof biome !== 'string') return false;
  return SNOW_GOLEM_HOT_BIOMES.includes(biome.toLowerCase());
}

/**
 * Whether the golem takes heat damage right now.
 *
 * Wiki: "when in contact with rain or water AND in biomes with a temperature greater than 1.0", so both
 * conditions are required. Fire Resistance negates it.
 */
export function snowGolemTakesHeatDamage(mob, {
  biome = null, inWater = false, raining = false
} = {}) {
  if (!isSnowGolem(mob)) return false;
  if (!isHotBiome(biome ?? mob.biome)) return false;
  // The wiki requires contact with rain or water, so a dry golem in a hot biome is safe.
  if (!inWater && !raining) return false;
  // Wiki: "The Fire Resistance effect allows them to survive in these biomes."
  if (mob.hasFireResistance || mob.fireResistance) return false;
  return true;
}

/**
 * Advance the heat damage.
 *
 * Wiki: 1 damage PER TICK, which is 20 a second and therefore lethal almost immediately -- that is the
 * intent, so `dt` is scaled to ticks rather than seconds.
 *
 * Returns the damage dealt.
 */
export function updateSnowGolemHeat(mob, dt, options = {}) {
  if (!isSnowGolem(mob)) return 0;
  if (mob.health <= 0) return 0;
  if (!snowGolemTakesHeatDamage(mob, options)) return 0;
  const ticks = Math.max(0, dt) * 20;
  const damage = SNOW_GOLEM_HEAT.damagePerTick * ticks;
  mob.health -= damage;
  mob.heatDamageTaken = (mob.heatDamageTaken ?? 0) + damage;
  return damage;
}

/**
 * Whether a snowball hurts this target.
 *
 * Wiki: snowballs "do not deal damage except to blazes". Everything else is knocked back and provoked, which
 * is why the golem is dangerous out of proportion to its damage.
 */
export function snowballDamageFor(targetType) {
  const key = String(targetType ?? '').toLowerCase();
  return Object.hasOwn(SNOWBALL_DAMAGE, key) ? SNOWBALL_DAMAGE[key] : SNOWBALL_DAMAGE.default;
}

/**
 * The targets it will shoot at.
 *
 * Wiki: it moves toward "all monsters (except ghasts and undead mounts)" and "also attack[s] creepers", and
 * "never intentionally attack[s] the player".
 */
export function snowGolemTargets(type) {
  const key = String(type ?? '').toLowerCase();
  if (!key) return false;
  // Wiki: never the player, and never the excluded monsters.
  if (key === 'player') return false;
  if (SNOW_GOLEM_NEVER_TARGETS.includes(key)) return false;
  // Wiki: the provocation table names exactly which mobs it attacks. The set is explicit rather than
  // "anything with isHostile", because the table includes a creeper but excludes an enderman and a phantom,
  // both of which are hostile -- a flag would get those wrong.
  return SNOW_GOLEM_HOSTILES.includes(key);
}

/**
 * The monsters a snow golem will attack, from the wiki's provocation table.
 *
 * Declared before `snowGolemTargets` reads it. This is the kind of ordering that bites at module load rather
 * than at call time when the value is a `const`, so it is deliberate here.
 */
export const SNOW_GOLEM_HOSTILES = [
  'warden', 'wither', 'zoglin',
  'blaze', 'bogged', 'cave_spider', 'illusioner', 'piglin', 'piglin_brute', 'pillager', 'ravager',
  'shulker', 'skeleton', 'spider', 'stray', 'wither_skeleton', 'zombified_piglin',
  'creeper', 'evoker', 'husk', 'silverfish', 'witch', 'zombie', 'zombie_villager',
  'endermite', 'drowned', 'vex', 'vindicator', 'slime',
  // Wiki: it attacks these, and they never retaliate.
  'breeze', 'creaking', 'elder_guardian', 'ender_dragon', 'guardian', 'magma_cube',
  // Wiki: "Iron golems and snow golems attack giants as they attack other monster mobs."
  'giant'
];

/**
 * The monsters it never shoots at, even though they are hostile.
 *
 * Wiki: "all monsters (except ghasts and undead mounts)". `camel_husk` is an undead mount, so it is excluded
 * alongside the two horse mounts.
 */
export const SNOW_GOLEM_NEVER_TARGETS = ['ghast', 'happy_ghast', 'skeleton_horse', 'zombie_horse', 'camel_husk'];

/**
 * Find the nearest target.
 *
 * Wiki: it throws "up to 10 blocks away", or 16 when tethered or captured.
 */
export function findSnowGolemTarget(manager, mob, { tethered = null } = {}) {
  if (!isSnowGolem(mob) || !manager?.mobs) return null;
  const range = tethered ? SNOW_GOLEM_RANGE.tethered : SNOW_GOLEM_RANGE.roam;
  let best = null;
  let bestDistance = range;
  for (const other of manager.mobs) {
    if (other === mob || other.health <= 0) continue;
    if (!snowGolemTargets(other.type)) continue;
    const distance = mob.mesh.position.distanceTo(other.mesh.position);
    if (distance < bestDistance) { bestDistance = distance; best = other; }
  }
  return best;
}

/**
 * Try to throw a snowball.
 *
 * Wiki: "one snowball per second", and it provokes whatever it hits. Returns the throw, or null when it is
 * not ready or has no target.
 */
export function snowGolemThrow(mob, target, { dt = 0, tethered = null } = {}) {
  if (!isSnowGolem(mob) || !target?.mesh?.position) return null;
  const isTethered = tethered ?? mob.tethered === true;
  const range = isTethered ? SNOW_GOLEM_RANGE.tethered : SNOW_GOLEM_RANGE.roam;
  const toTarget = target.mesh.position.clone().sub(mob.mesh.position);
  const distance = toTarget.length();
  if (distance > range) return null;
  if ((mob.throwCooldown ?? 0) > 0) return null;

  mob.throwCooldown = SNOW_GOLEM_THROW_SECONDS;
  const direction = toTarget.clone().normalize();
  // Snowballs arc, so a level shot at range needs a little lift, as the wiki's screenshots show.
  direction.y += Math.min(0.35, distance * 0.02);
  direction.normalize();
  return {
    direction,
    damage: snowballDamageFor(target.type),
    // Wiki: whatever it hits is provoked, which is the golem's real function.
    provokes: true,
    target
  };
}

/** Advance the throw cooldown. */
export function updateSnowGolemThrow(mob, dt) {
  if (!isSnowGolem(mob)) return false;
  const before = mob.throwCooldown ?? 0;
  mob.throwCooldown = Math.max(0, before - dt);
  return before > 0 && mob.throwCooldown === 0;
}

/**
 * Whether the golem may leave snow at a position.
 *
 * Wiki: "leaves a trail of snow on the ground if the blocks can support it", and "If the mobGriefing game
 * rule is false, the snow trail does not appear."
 *
 * `snow_block` is not a registered block in this build, so `canPlace` is injected and defaults to false
 * rather than writing a block id the world would not recognise.
 */
export function snowGolemTrailAt(mob, { mobGriefing = true, canPlace = false } = {}) {
  if (!isSnowGolem(mob)) return null;
  // Wiki: mobGriefing false suppresses the trail entirely.
  if (mobGriefing === false) return null;
  if (!canPlace) return null;
  return { block: SNOW_GOLEM_TRAIL.block, position: mob.mesh.position.clone().setY(mob.mesh.position.y - 1) };
}

/**
 * Shear the pumpkin off.
 *
 * Wiki: "Shearing a snow golem removes the pumpkin, revealing its derpy face and making it drop the pumpkin."
 * Returns the dropped item id, or null.
 */
export function shearSnowGolem(mob, itemId) {
  if (!isSnowGolem(mob)) return null;
  if (String(itemId ?? '') !== 'shears') return null;
  if (!mob.hasPumpkin) return null;
  mob.hasPumpkin = false;
  if (mob.pumpkinMesh) mob.pumpkinMesh.visible = false;
  if (mob.faceMesh) mob.faceMesh.visible = true;
  return SNOW_GOLEM_SHEAR_DROP;
}

/** Wiki: golems are not worth any experience. */
export function snowGolemXp() {
  return 0;
}

/**
 * Build a snow golem model: three stacked snowballs, stick arms, and a carved pumpkin helmet.
 *
 * Wiki: it "wears its carved pumpkin like a helmet. Its actual head is hidden beneath the pumpkin", so both
 * are built and the face is hidden until sheared.
 */
export function createSnowGolemModel(snowMat, shadowMat, pumpkinMat, faceMat) {
  const group = new THREE.Group();

  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.7), snowMat);
  lower.position.y = 0.28;
  group.add(lower);
  const middle = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), snowMat);
  middle.position.y = 0.8;
  group.add(middle);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), snowMat);
  head.position.y = 1.3;
  group.add(head);

  // The derpy face, hidden under the pumpkin until sheared.
  const face = new THREE.Group();
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.03), faceMat);
    eye.position.set(side * 0.11, 0.06, 0.26);
    face.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.03), faceMat);
  mouth.position.set(0, -0.1, 0.26);
  face.add(mouth);
  face.visible = false;
  head.add(face);

  // The pumpkin helmet, which is what is actually visible.
  const pumpkin = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.5, 0.56), pumpkinMat);
  pumpkin.add(shell);
  const carved = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.24, 0.04), faceMat);
  carved.position.set(0, 0.02, 0.28);
  pumpkin.add(carved);
  head.add(pumpkin);

  // Stick arms.
  const arms = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.62), shadowMat);
    arm.position.set(side * 0.4, 0.95, 0);
    group.add(arm);
    arms.push(arm);
  }

  return { group, lower, middle, head, face, pumpkin, arms };
}

/**
 * Pose the golem.
 *
 * Wiki: it throws one snowball a second, so the arms swing on the throw and the body is otherwise still.
 */
export function poseSnowGolem(mob, phase = 0) {
  if (!isSnowGolem(mob) || !mob.mesh) return;
  // A cooldown greater than zero means the throw just happened, which is the whole window. The previous
  // form compared against `THROW_SECONDS - 0.25` and was assigned exactly `THROW_SECONDS`, so the
  // comparison sat on a float boundary with no margin.
  const throwing = (mob.throwCooldown ?? 0) > 0;
  (mob.arms ?? []).forEach((arm, index) => {
    if (!arm?.rotation) return;
    // Both arms come forward on the throw, then relax.
    arm.rotation.x = throwing ? -1.2 : Math.sin(phase * 2 + index) * 0.1;
  });
  if (mob.head) mob.head.rotation.y = Math.sin(phase * 0.6) * 0.15;
  // The pumpkin is the visible head, so keep the two in step.
  //
  // BUG FIXED HERE: this read `mob.pumpkin` and `mob.face`, but the spawner stores them as `pumpkinMesh` and
  // `faceMesh` -- so the pose silently did nothing and shearing never revealed the face. Two names for one
  // thing is the defect; these are now the only ones, and the spawner uses the same pair.
  if (mob.pumpkinMesh) mob.pumpkinMesh.visible = mob.hasPumpkin !== false;
  if (mob.faceMesh) mob.faceMesh.visible = mob.hasPumpkin === false;
}
