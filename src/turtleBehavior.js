import * as THREE from 'three';
import { applyQuadUvs } from './mobVisuals/entityBox.js';

/**
 * Turtle rules and model.
 *
 * Reference: https://minecraft.wiki/w/Turtle and https://minecraft.wiki/w/Turtle_Egg
 *
 * The turtle is a passive aquatic animal defined by four things: it is slow on land but fast in
 * water, it remembers the block it spawned on and returns there to lay eggs, a baby drops a scute
 * when it matures, and it can be bred and led with seagrass.
 */

/** Wiki: 30 HP. */
export const TURTLE_HEALTH = 30;

/** Wiki: adult 1.2 wide x 0.4 tall; baby 0.36 x 0.12. */
export const TURTLE_DIMENSIONS = { width: 1.2, height: 0.4 };
export const TURTLE_BABY_DIMENSIONS = { width: 0.36, height: 0.12 };
export const TURTLE_BABY_SCALE = 0.3;

/** Wiki: a pregnant turtle is about 0.2 blocks taller. */
export const TURTLE_PREGNANT_HEIGHT_BONUS = 0.2;

/** Wiki: turtles move slowly on land but swim fast. */
export const TURTLE_SPEED = { land: 0.9, water: 2.6 };

/**
 * Wiki: "when a turtle is on land, it usually searches for water ... inside a 47x1x47 region
 * centered two blocks below the turtle", and gives up after about a minute if unreachable.
 */
export const TURTLE_WATER_SEARCH = { radius: 23, yOffset: -2, giveUpSeconds: 60 };

/** Wiki: a turtle leads on seagrass within 10 blocks. */
export const TURTLE_FOLLOW_RANGE = 10;

/**
 * Wiki: the turtle travels home after breeding and "does not stop traveling until it is within a
 * 9-block distance from its home position".
 */
export const TURTLE_HOME_RADIUS = 9;

/** Wiki: it lays "a cluster of 1-4 turtle eggs". */
export const TURTLE_EGG_CLUSTER = { min: 1, max: 4 };

/** Wiki: a pregnant turtle digs "for a few seconds to a few minutes" before laying. */
export const TURTLE_DIG_SECONDS = { min: 3, max: 8 };

/** Wiki: breeding cooldown is 5 minutes in Java. */
export const TURTLE_BREED_COOLDOWN_SECONDS = 300;

/** Wiki: a baby takes one Minecraft day (20 minutes) to grow, sped up 10% per seagrass. */
export const TURTLE_BABY_FEED_ACCELERATION = 0.1;

/** Wiki: turtle eggs crack 3 times before hatching, and take 4-5 in-game days. */
export const TURTLE_EGG = { maxCracks: 3, maxCluster: 4 };

/** Wiki: turtles drop 0-2 seagrass on death and nothing for a baby. */
export function turtleDrops(mob) {
  if (mob?.type !== 'turtle') return [];
  if (mob.isBaby) return [];
  return [['seagrass', false, 0, 2]];
}

/** Wiki: 1-3 XP, and none for a baby. */
export function turtleXp(mob) {
  if (mob?.type !== 'turtle' || mob.isBaby) return 0;
  return 1 + Math.floor(Math.random() * 3);
}

/** True when the mob is a turtle. */
export function isTurtle(mob) {
  return mob?.type === 'turtle';
}

/** The hitbox for a turtle, which grows while it carries eggs. */
export function turtleDimensions(mob) {
  if (mob?.isBaby) return { ...TURTLE_BABY_DIMENSIONS };
  if (mob?.hasEgg) return { width: TURTLE_DIMENSIONS.width, height: TURTLE_DIMENSIONS.height + TURTLE_PREGNANT_HEIGHT_BONUS };
  return { ...TURTLE_DIMENSIONS };
}

/**
 * Wiki: an expanding square search inside a 47x1x47 region two blocks below the turtle, looking for
 * any water block. Returns a reachable-ish target position, or null.
 *
 * The search is a spiral of increasing radius rather than a full scan, which is what keeps it cheap
 * on a large world and mirrors the wiki's "expanding square" description.
 */
export function findWaterNear(manager, mob, maxRadius = TURTLE_WATER_SEARCH.radius) {
  const pos = mob?.mesh?.position;
  if (!pos || !manager?.world?.getVoxel) return null;
  const baseX = Math.floor(pos.x);
  const baseY = Math.floor(pos.y) + TURTLE_WATER_SEARCH.yOffset;
  const baseZ = Math.floor(pos.z);
  const isWater = (x, y, z) => {
    const name = manager.blockNameAt?.(x, y, z);
    if (name) return name === 'water';
    return manager.world.getVoxel(x, y, z) === manager.waterBlockId;
  };
  for (let radius = 1; radius <= maxRadius; radius++) {
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        // Only the ring at this radius, so the search expands outward rather than rescanning.
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        if (isWater(baseX + dx, baseY, baseZ + dz)) {
          return new THREE.Vector3(baseX + dx + 0.5, pos.y, baseZ + dz + 0.5);
        }
      }
    }
  }
  return null;
}

/**
 * True when the block under a turtle is sand.
 *
 * Wiki: eggs "only hatch on sand, red sand or suspicious sand", and a turtle "seeks a nearby sand
 * block on which to lay its eggs".
 */
export function isSandBlock(name) {
  if (!name) return false;
  return ['sand', 'red_sand', 'suspicious_sand'].includes(String(name).toLowerCase());
}

/**
 * Advance a turtle's land and water movement.
 *
 * Wiki: slow on land, fast in water; and while on land it usually heads for the nearest water.
 *
 * @returns {'swimming'|'seeking-water'|'wandering'|'returning-home'|null}
 */
export function updateTurtleMovement(manager, mob, dt, player, { wander = null } = {}) {
  if (!isTurtle(mob)) return null;
  if (!mob.velocity) return null;

  const pos = mob.mesh.position;
  const inWater = manager.blockNameAt?.(Math.floor(pos.x), Math.floor(pos.y), Math.floor(pos.z)) === 'water'
    || manager.isWaterAt?.(pos.x, pos.y + 0.1, pos.z);
  mob.inWater = !!inWater;

  // 1. A pregnant turtle travels home to lay, and does not divert to water on the way.
  if (mob.hasEgg) {
    const home = mob.homePosition;
    if (home) {
      const dist = Math.hypot(pos.x - home.x, pos.z - home.z);
      if (dist > TURTLE_HOME_RADIUS) {
        const dir = new THREE.Vector3(home.x - pos.x, 0, home.z - pos.z).normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        const speed = inWater ? TURTLE_SPEED.water : TURTLE_SPEED.land;
        mob.velocity.x = dir.x * speed;
        mob.velocity.z = dir.z * speed;
        mob.state = 'returning home';
        return 'returning-home';
      }
      // Close enough: look for sand to dig into.
      mob.state = 'digging';
      mob.velocity.x = 0;
      mob.velocity.z = 0;
      return 'returning-home';
    }
  }

  // 2. In water, swim.
  if (inWater) {
    mob.swimCycle = (mob.swimCycle || 0) + dt * 2.5;
    if (!mob.swimTarget || mob.mesh.position.distanceTo(mob.swimTarget) < 1.2) {
      mob.swimTarget = new THREE.Vector3(
        pos.x + (Math.random() - 0.5) * 8,
        pos.y + (Math.random() - 0.5) * 2,
        pos.z + (Math.random() - 0.5) * 8
      );
    }
    const dir = mob.swimTarget.clone().sub(pos);
    if (dir.lengthSq() > 1e-6) {
      dir.normalize();
      mob.yaw = Math.atan2(dir.x, dir.z);
      mob.velocity.x = dir.x * TURTLE_SPEED.water;
      mob.velocity.y = dir.y * TURTLE_SPEED.water * 0.5;
      mob.velocity.z = dir.z * TURTLE_SPEED.water;
    }
    mob.state = 'swimming';
    return 'swimming';
  }

  // 3. On land: head for water, but give up after about a minute.
  mob.waterSearchTimer = (mob.waterSearchTimer ?? 0) + dt;
  if (mob.waterSearchTimer < TURTLE_WATER_SEARCH.giveUpSeconds) {
    if (!mob.waterTarget || mob.mesh.position.distanceTo(mob.waterTarget) < 1.5) {
      mob.waterTarget = findWaterNear(manager, mob);
      if (!mob.waterTarget) mob.waterSearchTimer = TURTLE_WATER_SEARCH.giveUpSeconds;
    }
    if (mob.waterTarget) {
      const dir = mob.waterTarget.clone().sub(pos);
      dir.y = 0;
      if (dir.lengthSq() > 1e-6) {
        dir.normalize();
        mob.yaw = Math.atan2(dir.x, dir.z);
        mob.velocity.x = dir.x * TURTLE_SPEED.land;
        mob.velocity.z = dir.z * TURTLE_SPEED.land;
        mob.state = 'seeking water';
        return 'seeking-water';
      }
    }
  }

  // 4. Otherwise wander slowly.
  wander?.(manager, mob, dt, TURTLE_SPEED.land);
  mob.state = 'idle';
  return 'wandering';
}

/**
 * Attempt to lay a cluster of eggs.
 *
 * Wiki: on reaching home the turtle "seeks a nearby sand block", digs "for a few seconds to a few
 * minutes", then lays "a cluster of 1-4 turtle eggs, as a single block". Returns the cluster size
 * laid, or 0.
 */
export function tryLayTurtleEggs(manager, mob, dt, random = Math.random) {
  if (!isTurtle(mob) || !mob.hasEgg || mob.isBaby) return 0;
  const pos = mob.mesh.position;
  const home = mob.homePosition;
  if (home && Math.hypot(pos.x - home.x, pos.z - home.z) > TURTLE_HOME_RADIUS) return 0;

  // Find sand under or beside the turtle.
  let sand = null;
  for (let dx = -1; dx <= 1 && !sand; dx++) {
    for (let dz = -1; dz <= 1 && !sand; dz++) {
      const x = Math.floor(pos.x) + dx;
      const z = Math.floor(pos.z) + dz;
      const y = Math.floor(pos.y) - 1;
      if (isSandBlock(manager.blockNameAt?.(x, y, z))) sand = { x, y: y + 1, z };
    }
  }
  if (!sand) {
    mob.digTimer = 0;
    return 0;
  }

  mob.digTimer = (mob.digTimer || 0) + dt;
  if (mob.digTimer < TURTLE_DIG_SECONDS.min) return 0;

  const count = TURTLE_EGG_CLUSTER.min + Math.floor(random() * (TURTLE_EGG_CLUSTER.max - TURTLE_EGG_CLUSTER.min + 1));
  manager.placeTurtleEggs?.(sand.x, sand.y, sand.z, count);
  mob.hasEgg = false;
  mob.digTimer = 0;
  const dims = turtleDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
  return count;
}

/**
 * A turtle's home position, remembered as a plain vector so it survives a save.
 *
 * Wiki: "A turtle remembers the block on which it spawned as its home position. No matter how far
 * away the turtle is, it always attempts to return to its home position to lay its eggs."
 */
export function setTurtleHome(mob, x, y, z) {
  if (!isTurtle(mob)) return null;
  mob.homePosition = new THREE.Vector3(Math.floor(x) + 0.5, Math.floor(y), Math.floor(z) + 0.5);
  return mob.homePosition;
}

/**
 * The scute a maturing baby drops.
 *
 * Wiki: "When a baby turtle matures into an adult, it drops 1 turtle scute."
 *
 * Note the age check: this is called *after* the shared growth code has already cleared `isBaby`,
 * so requiring `isBaby` here would always return nothing. The caller is the maturation hook itself,
 * which only runs for a turtle that was a baby a moment ago — that is what the parameter is for.
 */
export function turtleMaturationDrops(mob, { matured = false } = {}) {
  if (!isTurtle(mob)) return [];
  // Either still a baby, or explicitly being called at the moment of maturation.
  if (!mob.isBaby && !matured) return [];
  return [['turtle_scute', false, 1, 1]];
}

/** Wiki: a pregnant turtle is taller, which the hitbox reflects. */
export function applyTurtlePregnancy(mob) {
  if (!isTurtle(mob) || mob.isBaby) return;
  const dims = turtleDimensions(mob);
  mob.width = dims.width;
  mob.height = dims.height;
}

/**
 * Turtle model: a flat shell, a small head on a short neck, and four stubby flippers.
 *
 * Authored at the wiki's 1.2 x 0.4 adult hitbox, which is much wider than it is tall. The head is
 * separate so it can extend while swimming.
 */
export function createTurtleModel(shellMat, skinMat, darkMat) {
  const group = new THREE.Group();

  // The shell, the dominant feature: wide and flat.
  const shell = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.22, 1.1), shellMat);
  applyQuadUvs(shell, 64, 0, 16, 4, 18, 128, 64);
  shell.position.set(0, 0.22, 0);
  group.add(shell);

  // A slightly darker rim, which is what gives the shell a readable edge.
  const rim = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.1, 1.16), darkMat);
  applyQuadUvs(rim, 64, 0, 16, 4, 18, 128, 64);
  rim.position.set(0, 0.15, 0);
  group.add(rim);

  // The head on a short neck, at the front.
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.24), skinMat);
  applyQuadUvs(neck, 0, 0, 3, 3, 4, 128, 64);
  neck.position.set(0, 0.24, 0.6);
  group.add(neck);

  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.3), skinMat);
  applyQuadUvs(head, 0, 8, 4, 3, 5, 128, 64);
  head.position.set(0, 0.25, 0.78);
  group.add(head);

  const eyeGeo = new THREE.BoxGeometry(0.06, 0.06, 0.03);
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, darkMat);
    eye.position.set(side * 0.09, 0.03, 0.16);
    head.add(eye);
    return eye;
  });

  // Four stubby flippers rather than legs, which is what makes it read as a sea turtle.
  const flipperGeo = new THREE.BoxGeometry(0.3, 0.09, 0.24);
  const flippers = [];
  for (const side of [-1, 1]) {
    for (const [name, z] of [['front', 0.42], ['back', -0.42]]) {
      const flipper = new THREE.Mesh(flipperGeo, skinMat);
      flipper.position.set(side * 0.52, 0.12, z);
      flipper.rotation.z = side * 0.15;
      group.add(flipper);
      flippers.push({ mesh: flipper, side, front: name === 'front', rotation: flipper.rotation });
    }
  }

  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.2), skinMat);
  tail.position.set(0, 0.2, -0.6);
  group.add(tail);

  return { group, shell, rim, neck, head, eyes, flippers, tail };
}

/**
 * Swim and shamble animation.
 *
 * Wiki: on land a turtle shambles, and in water its flippers row. The two are distinct in the game,
 * so they are distinct here.
 */
export function poseTurtle(turtle, phase) {
  if (!turtle?.flippers) return;
  const swimming = !!turtle.inWater;
  turtle.flippers.forEach((flipper, index) => {
    if (swimming) {
      // Front flippers row together, back ones steer.
      const row = Math.sin(phase + (flipper.front ? 0 : 0.6));
      flipper.mesh.rotation.x = flipper.front ? row * 0.7 : row * 0.25;
      flipper.mesh.rotation.z = flipper.side * (0.15 + (flipper.front ? 0.5 : 0.2));
    } else {
      // On land it drags itself forward, so the flippers barely lift.
      const step = Math.sin(phase + index * Math.PI * 0.5);
      flipper.mesh.rotation.x = step * 0.28;
      flipper.mesh.rotation.z = flipper.side * 0.15;
    }
  });
  // The head comes forward while swimming.
  if (turtle.head) turtle.head.position.z = swimming ? 0.82 : 0.78;
}
