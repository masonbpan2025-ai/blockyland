/**
 * Panda rules: personalities, the two-gene inheritance system, and their effects.
 *
 * Reference: https://minecraft.wiki/w/Panda
 *
 * The panda is the most behaviourally rich passive mob in the game, and almost all of that richness
 * comes from one place: **seven personalities driven by two hidden genes**. A panda has a `MainGene`
 * and a `HiddenGene`; five of the seven traits are dominant, and the two recessive ones only present
 * when both genes agree. Getting that wrong would make every personality equally common, which is
 * visibly wrong at 63.7% normal against 1.6% brown.
 */

/** Wiki: 20 HP, and 10 for a weak panda. */
export const PANDA_HEALTH = { normal: 20, weak: 10 };

/** Wiki: adult 1.3 wide x 1.25 tall; baby 0.65 x 0.625. */
export const PANDA_DIMENSIONS = { width: 1.3, height: 1.25 };
export const PANDA_BABY_DIMENSIONS = { width: 0.65, height: 0.625 };
export const PANDA_BABY_SCALE = 0.5;

/** Wiki: normal 2/2/3, aggressive 4/6/9. */
export const PANDA_DAMAGE = {
  normal: { peaceful: 0, easy: 2, normal: 2, hard: 3 },
  aggressive: { peaceful: 0, easy: 4, normal: 6, hard: 9 }
};

/** Wiki: 0.15 speed normally, and 0.07 for a lazy panda — the slowest land mob in the game. */
export const PANDA_SPEED = { normal: 0.15, lazy: 0.07 };

/** Wiki: pandas follow a player carrying bamboo, and stop beyond about 16 blocks. */
export const PANDA_FOLLOW_RANGE = 16;

/** Wiki: a bamboo plant must be within a 7x7x3 area for Java pandas to breed. */
export const PANDA_BREEDING_BAMBOO = { halfX: 3, halfY: 1, halfZ: 3 };

/** Wiki: the seven genes, with the data value the entity format uses. */
export const PANDA_GENES = ['normal', 'lazy', 'worried', 'playful', 'aggressive', 'weak', 'brown'];

/**
 * Wiki: the dominant and recessive traits.
 *
 * Normal, aggressive, lazy, worried and playful are dominant: if the main gene is one of them it
 * presents regardless of the hidden gene. Weak and brown are recessive, and only present when both
 * genes are the same trait.
 */
export const PANDA_DOMINANT_GENES = ['normal', 'lazy', 'worried', 'playful', 'aggressive'];
export const PANDA_RECESSIVE_GENES = ['weak', 'brown'];

/**
 * Wiki: the spawn probability of each personality, which follows from the gene distribution.
 *
 * Normal 163/256 (63.7%), aggressive/lazy/worried/playful 1/16 (6.3%) each, weak 25/256 (9.8%), and
 * brown 1/64 (1.6%).
 */
export const PANDA_PERSONALITY_CHANCE = {
  normal: 163 / 256,
  aggressive: 1 / 16,
  lazy: 1 / 16,
  worried: 1 / 16,
  playful: 1 / 16,
  weak: 25 / 256,
  brown: 1 / 64
};

/**
 * Wiki: the mutation table, which is what a gene becomes on the 1/32 mutation chance.
 *
 * Normal 5/16, aggressive/lazy/worried/playful 1/16 each, weak 5/16, brown 2/16. Note this is *not*
 * the same distribution as the resulting personality: normal and weak are both far more likely to
 * result from a mutation than the rarer dominant traits are.
 */
export const PANDA_MUTATION_WEIGHTS = [
  { gene: 'normal', weight: 5 },
  { gene: 'aggressive', weight: 1 },
  { gene: 'lazy', weight: 1 },
  { gene: 'worried', weight: 1 },
  { gene: 'playful', weight: 1 },
  { gene: 'weak', weight: 5 },
  { gene: 'brown', weight: 2 }
];

/** Wiki: each gene has a 1/32 chance to mutate when a baby is created. */
export const PANDA_MUTATION_CHANCE = 1 / 32;

/** Wiki: a baby panda has a 1/700 chance to drop a slimeball on a sneeze. */
export const PANDA_SNEEZE_SLIMEBALL_CHANCE = 1 / 700;

/** Wiki: a baby sneezes with a 1/6000 chance per tick, and a weak baby with 1/500. */
export const PANDA_SNEEZE_CHANCE = { normal: 1 / 6000, weak: 1 / 500 };

/** Wiki: sneezing makes all adult pandas within 10 blocks jump. */
export const PANDA_SNEEZE_ALERT_RANGE = 10;

/** Wiki: bamboo is 1 on Java, 0-2 with Looting on Bedrock; this targets Java. */
export const PANDA_BAMBOO_DROP = 1;

/** Body colours. A brown panda is brown and white instead of black and white. */
export const PANDA_COLORS = {
  normal: { dark: 0x18181b, light: 0xf1f5f9 },
  brown: { dark: 0x6b4423, light: 0xf1f5f9 }
};

/** True when the mob is a panda. */
export function isPanda(mob) {
  return mob?.type === 'panda';
}

/**
 * The personality a pair of genes produces.
 *
 * Wiki: "If the main gene is a dominant gene, then it presents as the personality regardless of the
 * hidden gene. If the main gene is recessive and the hidden gene is not the same trait, then a normal
 * personality results." So `weak/weak` is weak, `weak/normal` is normal, and `lazy/anything` is lazy.
 */
export function pandaPersonality(mainGene, hiddenGene) {
  if (PANDA_DOMINANT_GENES.includes(mainGene)) return mainGene;
  // A recessive main gene presents only when the hidden gene agrees.
  if (mainGene === hiddenGene && PANDA_RECESSIVE_GENES.includes(mainGene)) return mainGene;
  return 'normal';
}

/** Pick a gene from the mutation table. */
export function rollMutatedGene(random = Math.random) {
  const total = PANDA_MUTATION_WEIGHTS.reduce((n, e) => n + e.weight, 0);
  let roll = random() * total;
  for (const entry of PANDA_MUTATION_WEIGHTS) {
    roll -= entry.weight;
    if (roll < 0) return entry.gene;
  }
  return PANDA_MUTATION_WEIGHTS[PANDA_MUTATION_WEIGHTS.length - 1].gene;
}

/**
 * Roll the two genes a naturally spawned panda gets.
 *
 * Wiki: the mutation probabilities "also apply to naturally spawned pandas for their main and hidden
 * genes", so a wild panda rolls both genes off the same table.
 */
export function rollPandaGenes(random = Math.random) {
  return { mainGene: rollMutatedGene(random), hiddenGene: rollMutatedGene(random) };
}

/**
 * Breed two pandas into a baby's genes.
 *
 * Wiki: "each one passes one of their genes to their children, who then randomly mix both obtained
 * genes as their respective main and hidden genes. There is also a 1/32 chance for each gene of the
 * baby to mutate into another gene."
 *
 * Returns `{ mainGene, hiddenGene }`.
 */
export function breedPandaGenes(parentA, parentB, random = Math.random) {
  // Each parent contributes one of its two genes, chosen at random.
  const fromA = random() < 0.5 ? parentA.mainGene : parentA.hiddenGene;
  const fromB = random() < 0.5 ? parentB.mainGene : parentB.hiddenGene;
  // The two are then randomly ordered into main and hidden.
  let mainGene = random() < 0.5 ? fromA : fromB;
  let hiddenGene = mainGene === fromA ? fromB : fromA;

  // And each has an independent 1/32 mutation chance.
  if (random() < PANDA_MUTATION_CHANCE) mainGene = rollMutatedGene(random);
  if (random() < PANDA_MUTATION_CHANCE) hiddenGene = rollMutatedGene(random);

  return { mainGene, hiddenGene };
}

/**
 * Apply the personality to a panda's derived stats.
 *
 * Wiki: a weak panda has half the health, and an aggressive panda hits harder. A lazy panda is the
 * slowest land mob in the game. Brown only changes the colour.
 */
export function applyPandaPersonality(mob) {
  if (!isPanda(mob)) return mob;
  const personality = mob.personality ?? pandaPersonality(mob.mainGene, mob.hiddenGene);
  mob.personality = personality;
  mob.maxHealth = personality === 'weak' ? PANDA_HEALTH.weak : PANDA_HEALTH.normal;
  if (mob.health === undefined || mob.health > mob.maxHealth) mob.health = mob.maxHealth;
  mob.speed = personality === 'lazy' ? PANDA_SPEED.lazy : PANDA_SPEED.normal;
  // Only the two visible traits are flagged, because they are the only ones that change behaviour
  // outside the branch.
  mob.isWeak = personality === 'weak';
  mob.isAggressive = personality === 'aggressive';
  mob.isLazy = personality === 'lazy';
  mob.isWorried = personality === 'worried';
  mob.isPlayful = personality === 'playful';
  mob.isBrown = personality === 'brown';
  return mob;
}

/**
 * Apply the palette for a panda's visible variant to its materials.
 *
 * Wiki: a brown panda is brown and white rather than black and white. The other six personalities
 * share the normal palette, so this is the ONLY personality that changes the model -- the rest differ
 * only in behaviour. Without this a brown panda rendered identically to a normal one.
 *
 * The dark parts are the eye patches, ears and legs, and `light` is the body and face.
 */
export function applyPandaColors(mob) {
  if (!isPanda(mob)) return mob;
  const palette = pandaColors(mob.personality);
  // A normal panda wears the model's own colours -- near-black patches on white. `PANDA_COLORS.normal.light`
  // is the grey the old flat model tinted its body with, so restoring the normal palette has to put the
  // model's own white back instead of writing that grey: otherwise the recolour is not reversible.
  const dark = palette.dark;
  const light = palette === PANDA_COLORS.normal ? 0xffffff : palette.light;
  // The spawner records the two materials it built the model from, so the recolour is a two-line
  // operation rather than a traversal that could recolour an unrelated mesh.
  mob.darkMat?.color?.setHex?.(dark);
  mob.lightMat?.color?.setHex?.(light);
  if (mob.mesh) {
    // Fall back to a traversal for a model built without the material handles. It remaps either palette in
    // both directions, so a brown panda can be turned back into a normal one.
    mob.mesh.traverse?.((obj) => {
      if (!obj.isMesh || !obj.material?.color) return;
      const hex = obj.material.color.getHex();
      // Only remap colours that are one of the two palettes, so eyes and snout keep their own colour.
      if (hex === PANDA_COLORS.normal.dark || hex === PANDA_COLORS.brown.dark) obj.material.color.setHex(dark);
      else if (hex === PANDA_COLORS.normal.light || hex === PANDA_COLORS.brown.light) obj.material.color.setHex(light);
    });
  }
  return mob;
}

/** Melee damage for a panda given its personality and the difficulty. */
export function pandaDamageFor(mob, difficulty) {  const table = (mob?.isAggressive || mob?.personality === 'aggressive')
    ? PANDA_DAMAGE.aggressive
    : PANDA_DAMAGE.normal;
  const key = Object.hasOwn(table, difficulty ?? '') ? difficulty : 'normal';
  return table[key];
}

/** The hitbox for a panda, which halves for a baby. */
export function pandaDimensions(mob) {
  return mob?.isBaby ? { ...PANDA_BABY_DIMENSIONS } : { ...PANDA_DIMENSIONS };
}

/**
 * Whether a panda should be hostile.
 *
 * Wiki: "Pandas act similarly to other neutral mobs and attack when hurt but only once (similar to
 * llamas and bees) except on Peaceful difficulty, in which pandas are passive." An aggressive panda
 * is the exception: it "attacks continuously until the target dies or goes beyond detection range".
 */
export function pandaStance(mob, { difficulty = 'normal', provoked = false } = {}) {
  if (!isPanda(mob)) return null;
  if (mob.isBaby) return 'passive';
  if (difficulty === 'peaceful') return 'passive';
  if (mob.isAggressive) return provoked || mob.isHostile ? 'hostile' : 'neutral';
  return provoked || mob.isHostile ? 'hostile' : 'neutral';
}

/**
 * Whether an aggressive panda keeps attacking.
 *
 * Wiki: an aggressive panda attacks "continuously until the target dies or goes beyond detection
 * range, instead of only once", and "also doesn't panic when harmed".
 */
export function aggressivePandaKeepsHunting(mob) {
  return isPanda(mob) && mob.isAggressive;
}

/**
 * Make aggressive pandas nearby hostile when a panda is attacked.
 *
 * Wiki: "When nearby pandas are attacked, unless killed in one hit, aggressive pandas become hostile
 * toward the attacker."
 */
export function alertAggressivePandas(manager, victim, attacker = null, { lethal = false, range = 16 } = {}) {
  const alerted = [];
  if (!isPanda(victim) || !manager?.mobs || lethal) return alerted;
  for (const other of manager.mobs) {
    if (other === victim || !isPanda(other) || other.health <= 0) continue;
    if (!other.isAggressive) continue;
    if (other.mesh.position.distanceTo(victim.mesh.position) > range) continue;
    other.isHostile = true;
    other.angryAt = attacker ?? null;
    alerted.push(other);
  }
  return alerted;
}

/**
 * A baby panda's sneeze.
 *
 * Wiki: a baby has a 1/6000 chance per tick and a weak baby 1/500; a sneeze makes every adult panda
 * within 10 blocks jump, and has a 1/700 chance to drop a slimeball.
 *
 * Returns 'sneezed' or null.
 */
export function updatePandaSneeze(manager, mob, dt, random = Math.random) {
  if (!isPanda(mob) || !mob.isBaby) return null;
  const perTick = mob.isWeak ? PANDA_SNEEZE_CHANCE.weak : PANDA_SNEEZE_CHANCE.normal;
  // dt is in seconds and the chance is per tick, so scale to the 20 ticks a second the wiki means.
  if (random() >= perTick * dt * 20) return null;

  mob.sneezeTimer = 0.6;
  // Wiki: every adult panda within 10 blocks jumps.
  for (const other of manager?.mobs ?? []) {
    if (!isPanda(other) || other.isBaby || other.health <= 0) continue;
    if (other.mesh.position.distanceTo(mob.mesh.position) > PANDA_SNEEZE_ALERT_RANGE) continue;
    other.velocity.y = 4;
    other.onGround = false;
  }
  // Wiki: and it rarely drops a slimeball.
  if (random() < PANDA_SNEEZE_SLIMEBALL_CHANCE) {
    manager?.entities?.spawnDroppedItem?.(mob.mesh.position.clone(), 'slime_ball', false, 1);
    mob.droppedSlimeball = true;
  }
  return 'sneezed';
}

/**
 * Whether a panda may breed where it stands.
 *
 * Wiki: Java pandas "breed only if there is at least one bamboo plant (not including shoots) within a
 * 7x7x3 area", and otherwise "briefly shake their heads and do not breed".
 */
export function pandaCanBreed(manager, mob) {
  if (!isPanda(mob) || !manager?.blockNameAt) return true;
  const pos = mob.mesh.position;
  const { halfX, halfY, halfZ } = PANDA_BREEDING_BAMBOO;
  for (let dx = -halfX; dx <= halfX; dx++) {
    for (let dy = -halfY; dy <= halfY; dy++) {
      for (let dz = -halfZ; dz <= halfZ; dz++) {
        const name = manager.blockNameAt(pos.x + dx, pos.y + dy, pos.z + dz);
        // Wiki: bamboo shoots do not count, only full plants.
        if (name === 'bamboo') return true;
      }
    }
  }
  return false;
}

/** Wiki: bamboo is 1 on Java; a baby drops nothing. */
export function pandaDrops(mob) {
  if (!isPanda(mob) || mob.isBaby) return [];
  return [['bamboo', true, PANDA_BAMBOO_DROP, PANDA_BAMBOO_DROP]];
}

/** Wiki: 1-3 XP with credit, and none for a baby. */
export function pandaXp(mob) {
  if (!isPanda(mob) || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/**
 * Whether a panda follows this player.
 *
 * Wiki: they follow any player carrying bamboo, and stop beyond about 16 blocks. A lazy panda does not
 * follow while lying on its back.
 */
export function pandaFollowsBamboo(mob, player, itemId) {
  if (!isPanda(mob) || !player?.position || mob.isBaby) return false;
  if ((itemId ?? '').toLowerCase() !== 'bamboo') return false;
  if (mob.isLazy && mob.isLyingDown) return false;
  return mob.mesh.position.distanceTo(player.position) <= PANDA_FOLLOW_RANGE;
}

/** The colours for a panda's personality. Brown is brown and white; the rest share black and white. */
export function pandaColors(personality) {
  return personality === 'brown' ? PANDA_COLORS.brown : PANDA_COLORS.normal;
}

/**
 * Personality-specific idle poses.
 *
 * Wiki: lazy pandas "lie on their backs", playful ones "roll over and jump around", worried ones
 * "shake and hide their faces during thunderstorms", and aggressive ones have visible eyebrows.
 */
export function posePanda(panda, phase = 0) {
  if (!panda) return;
  if (!panda.mesh) return;
  if (panda.isLazy && panda.isLyingDown) {
    // On its back: rolled over and rocking gently.
    panda.mesh.rotation.x = Math.PI * 0.42;
    panda.mesh.rotation.z = Math.sin(phase * 0.7) * 0.08;
    return;
  }
  if (panda.isPlayful && panda.isRolling) {
    // A full roll, which the wiki notes can carry it off a cliff.
    panda.mesh.rotation.z = (phase % (Math.PI * 2));
    panda.mesh.rotation.x = 0;
    return;
  }
  if (panda.isWorried && panda.isThundering) {
    // Shaking, hiding its face.
    panda.mesh.rotation.z = Math.sin(phase * 30) * 0.06;
    panda.mesh.rotation.x = 0;
    if (panda.head) panda.head.rotation.x = 0.5;
    return;
  }
  panda.mesh.rotation.z = 0;
  panda.mesh.rotation.x = 0;
  if (panda.head) panda.head.rotation.x = 0;
  if (panda.sneezeTimer > 0) {
    // A sneeze is a quick forward dip of the head.
    if (panda.head) panda.head.rotation.x = 0.4;
    panda.sneezeTimer -= 0.016;
  }
}
