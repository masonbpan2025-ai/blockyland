// Playable redstone machines, built from the real components so each one actually
// runs on the simulator rather than miming the movement.
//
// Each builder returns the cells it placed plus a small `probe` describing how to
// demonstrate it, so the tests (and the agent) can show it working.

import { BLOCKS as B } from './blocks.js';

const put = (world, p, id, dir) => {
  world.setVoxel(p[0], p[1], p[2], id);
  if (dir !== undefined) world.redstone.configure(p, dir);
  return p;
};

/**
 * A piston vault door.
 *
 * Two sticky pistons face into a doorway; each holds an oak plank plug. Throwing
 * the lever powers both, pulling the plugs back so the way is clear.
 */
export function buildVaultDoor(world, origin) {
  const [ox, oy, oz] = origin;
  const cells = [];
  const place = (p, id, dir) => { cells.push(put(world, p, id, dir)); return p; };

  // Surround: solid wall with a 3 wide, 2 tall doorway.
  for (let x = -1; x <= 3; x++) {
    place([ox + x, oy - 1, oz], B.STONE_BRICKS);
    place([ox + x, oy + 2, oz], B.STONE_BRICKS);
  }
  place([ox - 1, oy, oz], B.STONE_BRICKS);
  place([ox - 1, oy + 1, oz], B.STONE_BRICKS);
  place([ox + 3, oy, oz], B.STONE_BRICKS);
  place([ox + 3, oy + 1, oz], B.STONE_BRICKS);

  // Wiring goes down FIRST, then the pistons are placed over their drop wires.
  // Order matters: a wire placed after a piston would replace it, which is how the
  // second piston kept vanishing.
  //
  // The wire bus runs in its own row behind the door and drops beside each piston.
  // A signal only reaches an adjacent cell, so the drops must touch the pistons, and
  // the run must be continuous from the lever. Strength falls off along it — the far
  // piston sees 12 rather than 15 — but any signal extends a piston.
  const lever = place([ox - 2, oy, oz - 2], B.LEVER);
  place([ox - 1, oy, oz - 2], B.REDSTONE_WIRE);
  place([ox, oy, oz - 2], B.REDSTONE_WIRE);
  place([ox + 1, oy, oz - 2], B.REDSTONE_WIRE);
  place([ox + 2, oy, oz - 2], B.REDSTONE_WIRE);
  place([ox, oy, oz - 1], B.REDSTONE_WIRE);
  place([ox + 1, oy, oz - 1], B.REDSTONE_WIRE);
  place([ox - 1, oy, oz - 1], B.REDSTONE_WIRE);

  // The plugs sit one block in front of pistons that face +Z (direction 4).
  const pistonA = place([ox, oy, oz - 1], B.STICKY_PISTON, 4);
  const pistonB = place([ox + 1, oy, oz - 1], B.STICKY_PISTON, 4);
  const plugA = place([ox, oy, oz], B.OAK_PLANKS);
  const plugB = place([ox + 1, oy, oz], B.OAK_PLANKS);
  // Wire beside piston A, which the piston did not claim.
  place([ox - 1, oy, oz - 1], B.REDSTONE_WIRE);

  // Upper half of the door is fixed wall.
  place([ox, oy + 1, oz], B.OAK_PLANKS);
  place([ox + 1, oy + 1, oz], B.OAK_PLANKS);

  return {
    name: 'Piston Vault Door',
    cells,
    lever,
    pistons: [pistonA, pistonB],
    plugs: [plugA, plugB],
    probe: 'Pull the lever and both pistons retract, clearing the doorway.'
  };
}

/**
 * A pressure-plate trapdoor in the floor.
 *
 * A stone platform with a 2x1 hole closed by two trapdoors. Standing on either
 * plate opens them, which is the classic hidden entrance or pit.
 */
export function buildFloorTrap(world, origin) {
  const [ox, oy, oz] = origin;
  const cells = [];
  const place = (p, id, dir) => { cells.push(put(world, p, id, dir)); return p; };

  // Platform with the hole left open.
  for (let x = -3; x <= 4; x++) {
    for (let z = -2; z <= 3; z++) {
      const isHole = z === 0 && (x === 0 || x === 1);
      if (!isHole) place([ox + x, oy, oz + z], B.STONE_BRICKS);
    }
  }

  // Trapdoors plug the hole.
  const trapA = place([ox, oy, oz], B.OAK_TRAPDOOR);
  const trapB = place([ox + 1, oy, oz], B.OAK_TRAPDOOR);

  // Plates on the platform beside the hole, each wired to the trapdoors. Every
  // wire step is an adjacent block, and no wire is placed on a trapdoor.
  const plateNear = place([ox, oy, oz - 1], B.PRESSURE_PLATE);
  place([ox + 1, oy, oz - 1], B.REDSTONE_WIRE);
  const plateFar = place([ox + 1, oy, oz + 1], B.PRESSURE_PLATE);
  place([ox, oy, oz + 1], B.REDSTONE_WIRE);

  return {
    name: 'Floor Trapdoor',
    cells,
    plates: [plateNear, plateFar],
    trapdoors: [trapA, trapB],
    probe: 'Stand on either plate and the floor opens under you.'
  };
}

/**
 * A two-lever lamp puzzle.
 *
 * Two levers feed one shared redstone line, so the lamp lights as soon as either
 * lever is thrown. Simple, but it demonstrates the part that trips people up:
 * signal strength falls off with distance along the wire (the rail reads 14 by the
 * time it reaches the lamp, not 15).
 */
export function buildLampPuzzle(world, origin) {
  const [ox, oy, oz] = origin;
  const cells = [];
  const place = (p, id, dir) => { cells.push(put(world, p, id, dir)); return p; };

  place([ox + 2, oy - 1, oz], B.STONE_BRICKS);
  const leverA = place([ox, oy, oz], B.LEVER);
  const rail = [
    place([ox + 1, oy, oz], B.REDSTONE_WIRE),
    place([ox + 2, oy, oz], B.REDSTONE_WIRE),
    place([ox + 3, oy, oz], B.REDSTONE_WIRE)
  ];
  const leverB = place([ox + 4, oy, oz], B.LEVER);
  const lamp = place([ox + 2, oy, oz + 1], B.REDSTONE_LAMP);

  return {
    name: 'Two-Lever Lamp',
    cells,
    levers: [leverA, leverB],
    rail,
    lamp,
    probe: 'Throw either lever and the lamp lights; throw both and it stays lit.'
  };
}

/**
 * A rail station.
 *
 * Powered rails along a platform, gated by a lever: off, the cart sits still; on,
 * it launches down the line and coasts to a buffer stop.
 */
export function buildRailStation(world, origin) {
  const [ox, oy, oz] = origin;
  const cells = [];
  const place = (p, id, dir) => { cells.push(put(world, p, id, dir)); return p; };

  const length = 12;
  // Platform floor one level below the track, either side of it.
  for (let x = -1; x <= length + 2; x++) {
    place([ox + x, oy - 1, oz - 1], B.STONE_BRICKS);
    place([ox + x, oy - 1, oz], B.STONE_BRICKS);
    place([ox + x, oy - 1, oz + 1], B.STONE_BRICKS);
  }

  // The track itself: powered rails to launch, plain rail to coast along.
  const railCells = [];
  for (let x = 0; x <= length; x++) {
    railCells.push(place([ox + x, oy, oz], x <= 3 ? B.POWERED_RAIL : B.RAIL, 0));
  }
  place([ox, oy, oz], B.POWERED_RAIL, 0);
  world.redstone.configure([ox, oy, oz], 0);

  // Buffer stop at the far end, two blocks so the cart cannot ride over it.
  place([ox + length + 1, oy, oz], B.STONE_BRICKS);
  place([ox + length + 1, oy + 1, oz], B.STONE_BRICKS);

  // Lever and its wire on the far side of the track (z + 1), so no wire is ever
  // placed on a rail — that was overwriting the track and leaving the cart stuck.
  for (let x = 0; x <= 3; x++) place([ox + x, oy, oz + 1], B.REDSTONE_WIRE);
  const lever = place([ox + 1, oy, oz + 2], B.LEVER);
  place([ox + 1, oy, oz + 1], B.REDSTONE_WIRE);

  return {
    name: 'Rail Station',
    cells,
    rails: railCells,
    lever,
    platform: [ox, oy, oz],
    probe: 'Throw the lever to launch the cart; it coasts down the line to the buffer.'
  };
}

/**
 * A TNT trap.
 *
 * A pressure plate wired to a dispenser loaded with TNT.
 */
export function buildTntTrap(world, origin) {
  const [ox, oy, oz] = origin;
  const cells = [];
  const place = (p, id, dir) => { cells.push(put(world, p, id, dir)); return p; };

  place([ox, oy - 1, oz], B.STONE_BRICKS);
  place([ox + 1, oy - 1, oz], B.STONE_BRICKS);
  place([ox + 2, oy - 1, oz], B.STONE_BRICKS);
  const plate = place([ox, oy, oz], B.PRESSURE_PLATE);
  place([ox + 1, oy, oz], B.REDSTONE_WIRE);
  const dispenser = place([ox + 2, oy, oz], B.DISPENSER, 0);

  const state = world.redstone.state(dispenser);
  if (state) state.inventory = [{ id: B.TNT, isBlock: true, count: 3 }];

  return {
    name: 'Pressure Plate TNT Trap',
    cells,
    plate,
    dispenser,
    probe: 'Step on the plate and the dispenser fires TNT.'
  };
}

export const REDSTONE_GAMES = {
  vault: buildVaultDoor,
  trap: buildFloorTrap,
  andgate: buildLampPuzzle,
  station: buildRailStation,
  tnt: buildTntTrap
};

export function listRedstoneGames() {
  return [
    { key: 'vault', name: 'Piston Vault Door', blurb: 'Two sticky pistons seal a doorway until a lever is thrown.' },
    { key: 'trap', name: 'Floor Trapdoor', blurb: 'Pressure plates open the floor beneath whoever steps on them.' },
    { key: 'andgate', name: 'Two-Lever Lamp', blurb: 'Two levers sharing one wire, with signal falloff along it.' },
    { key: 'station', name: 'Rail Station', blurb: 'A lever-launched minecart line with a buffer stop.' },
    { key: 'tnt', name: 'TNT Trap', blurb: 'A plate that fires TNT from a dispenser.' }
  ];
}

export function buildRedstoneGame(world, key, origin) {
  const builder = REDSTONE_GAMES[key];
  if (!builder) {
    throw new Error(`Unknown redstone game "${key}". Try one of: ${Object.keys(REDSTONE_GAMES).join(', ')}`);
  }
  return builder(world, origin);
}
