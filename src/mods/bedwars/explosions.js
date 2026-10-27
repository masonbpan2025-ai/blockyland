// TNT and fireballs in Bed Wars. They break only what players placed -- never the map, nor a bed -- and not the blocks
// sold to stop them: Blast-Proof Glass, End Stone (vanilla blast resistance 9) and Obsidian. They hurt enemies, push
// everyone (a fireball's push is what "fireball jumping" rides), hurt their thrower less, and do not hurt teammates.
// Pure, so tests can blow things up without a world.
import { BLOCKS, BLOCK_DEFS } from '../../blocks.js';

export const EXPLOSIONS = Object.freeze({
  // A TNT block lights itself when placed (Hypixel) and goes off a few seconds later.
  tnt: { radius: 4, damage: 7, push: 12, lift: 5, fuseSeconds: 3 },
  // A fireball breaks less, hurts little and pushes hard.
  fireball: { radius: 3, damage: 3, push: 14, lift: 9, speed: 14, lifeSeconds: 4 },
});

/** Blocks no explosion breaks here: the ones sold to stand up to them. */
export function blastProof(id) {
  if (id === BLOCKS.END_STONE || id === BLOCKS.OBSIDIAN || id === BLOCKS.GLASS) return true;
  return /Stained Glass$/.test(BLOCK_DEFS[id]?.name ?? '');
}

/**
 * The cells an explosion at `center` breaks: within its radius, not air, placed by a player (`isPlaced`), not a bed and
 * not blast-proof.
 */
export function explosionCells(center, kind, getVoxel, isPlaced) {
  const { radius } = EXPLOSIONS[kind];
  const out = [];
  const cx = Math.floor(center.x), cy = Math.floor(center.y), cz = Math.floor(center.z);
  const r = Math.ceil(radius);
  for (let x = cx - r; x <= cx + r; x++) for (let y = cy - r; y <= cy + r; y++) for (let z = cz - r; z <= cz + r; z++) {
    const d = Math.hypot(x + 0.5 - center.x, y + 0.5 - center.y, z + 0.5 - center.z);
    if (d > radius) continue;
    const id = getVoxel(x, y, z);
    if (!id || id === BLOCKS.AIR || id === BLOCKS.WATER || BLOCK_DEFS[id]?.bed || blastProof(id) || !isPlaced(x, y, z)) continue;
    out.push([x, y, z]);
  }
  return out;
}

/**
 * What an explosion does to one player standing at `feet`: damage falling off with distance (none to a teammate, half to
 * the thrower), and a push away from it, lifted.
 * @param {'enemy'|'self'|'teammate'} relation
 * @returns {{damage:number, velocity:{x:number,y:number,z:number}}|null} null when out of reach
 */
export function explosionOn(center, feet, kind, relation = 'enemy') {
  const def = EXPLOSIONS[kind];
  const body = { x: feet.x, y: feet.y + 0.9, z: feet.z };
  const dx = body.x - center.x, dy = body.y - center.y, dz = body.z - center.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > def.radius + 1) return null;
  const strength = Math.max(0, 1 - d / (def.radius + 1));
  const flat = Math.hypot(dx, dz) || 1;
  const damage = relation === 'teammate' ? 0 : Math.round(def.damage * strength * (relation === 'self' ? 0.5 : 1) * 2) / 2;
  return {
    damage,
    velocity: { x: (dx / flat) * def.push * strength, y: def.lift * (0.4 + strength * 0.6), z: (dz / flat) * def.push * strength },
  };
}
