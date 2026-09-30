// Geometry context for an open Structure Studio structure.
//
// Why this exists: the agent's system prompt only described structures the agent
// itself had built. In Structure Studio the open structure lives in the studio's
// own state, so the model had no idea where it was, how big it was, or which way
// its door faced. Asked to "add a bridge to the entrance of the castle" it built a
// perfectly good bridge in the wrong place.
//
// This module turns the studio's current structure into a compact, factual
// description: its local coordinate frame, size, and — most importantly — the
// base-level openings that are its entrances, with the direction each one faces.

import { BLOCKS } from './blocks.js';

/** Which of the 8 compass directions a local offset from the centre points to. */
export function describeDirection(dx, dz) {
  if (dx === 0 && dz === 0) return 'the centre';
  const northSouth = dz < 0 ? 'north (-Z)' : dz > 0 ? 'south (+Z)' : '';
  const eastWest = dx < 0 ? 'west (-X)' : dx > 0 ? 'east (+X)' : '';
  if (northSouth && eastWest) {
    // Diagonals read better as the dominant axis plus a lean.
    return Math.abs(dx) >= Math.abs(dz)
      ? `${eastWest}-${northSouth} corner`
      : `${northSouth}-${eastWest} corner`;
  }
  return northSouth || eastWest;
}

/**
 * Find ground-floor openings — doorways, gates and archways — on the perimeter
 * walls of the base layer.
 *
 * An opening is a perimeter column that has a block underfoot but no wall at
 * walking height. That is what a door, gate or archway looks like from the
 * outside, and it is how the castle in this library actually builds its entrance.
 * Reading the floor instead (the first attempt) reported the whole interior of a
 * hollow house as an "entrance" and missed the castle gate entirely.
 */
function findWallOpenings(voxels, bounds) {
  const { minX, maxX, minZ, maxZ, minY, maxY } = bounds;
  const at = (x, y, z) => voxels.get(`${x},${y},${z}`) || 0;

  // How tall the gap has to be to count.
  const GAP_HEIGHT = 2;
  // Never scan above the structure: everything up there is air, and treating that
  // as an opening made every sealed building look like it had doorways.
  const SCAN_HEIGHT = Math.max(1, maxY - minY);

  const gaps = [];
  const consider = (x, z, axis, edge) => {
    for (let dy = 1; dy <= SCAN_HEIGHT; dy++) {
      if (at(x, minY + dy, z) !== 0) continue;
      // Require a run of clear blocks, so a single missing stone is not a door.
      let clear = 0;
      for (let step = 0; step < GAP_HEIGHT; step++) {
        if (at(x, minY + dy + step, z) === 0) clear++;
        else break;
      }
      if (clear < GAP_HEIGHT) continue;
      // Solid underfoot: a hole in the floor is not an entrance.
      if (at(x, minY, z) === 0) continue;
      gaps.push({ x, z, dy, axis, edge });
      return;
    }
  };

  for (let x = minX; x <= maxX; x++) {
    consider(x, minZ, 'x', 'min');
    if (maxZ !== minZ) consider(x, maxZ, 'x', 'max');
  }
  for (let z = minZ; z <= maxZ; z++) {
    consider(minX, z, 'z', 'min');
    if (maxX !== minX) consider(maxX, z, 'z', 'max');
  }

  // Group neighbouring gaps on the same wall into one opening.
  const groups = [];
  const used = new Set();
  for (const gap of gaps) {
    const key = `${gap.axis}${gap.edge}:${gap.axis === 'x' ? gap.x : gap.z}`;
    if (used.has(key)) continue;
    const group = [gap];
    used.add(key);
    for (const other of gaps) {
      if (other.axis !== gap.axis || other.edge !== gap.edge) continue;
      const otherKey = `${other.axis}${other.edge}:${other.axis === 'x' ? other.x : other.z}`;
      if (used.has(otherKey)) continue;
      const along = gap.axis === 'x' ? other.x : other.z;
      const mine = gap.axis === 'x' ? gap.x : gap.z;
      if (Math.abs(along - mine) === 1) {
        used.add(otherKey);
        group.push(other);
      }
    }
    groups.push(group);
  }

  return groups.map(group => {
    const xs = group.map(g => g.x);
    const zs = group.map(g => g.z);
    const sizes = group.map(g => g.dy);
    return {
      axis: group[0].axis,
      edge: group[0].edge,
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minZ: Math.min(...zs),
      maxZ: Math.max(...zs),
      baseDy: Math.min(...sizes)
    };
  }).sort((a, b) => a.baseDy - b.baseDy);
}

/**
 * Describe the structure currently open in Structure Studio.
 *
 * @param {object} studio the StructureStudioManager instance
 * @returns {object|null} null when no structure is open or it cannot be measured
 */
export function describeOpenStructure(studio) {
  if (!studio || !studio.currentStructure || typeof studio.currentStructure.generate !== 'function') return null;

  const origin = studio.buildOrigin;
  if (!origin || !Number.isFinite(origin.x) || !Number.isFinite(origin.y) || !Number.isFinite(origin.z)) return null;

  const params = studio.currentParameters || {};
  let blocks;
  try {
    blocks = studio.currentStructure.generate(
      { x: origin.x, y: origin.y, z: origin.z },
      params,
      BLOCKS
    ) || [];
  } catch {
    // A structure whose generator throws has no trustworthy geometry.
    return null;
  }
  if (!Array.isArray(blocks) || blocks.length === 0) return null;

  const local = blocks.filter(b => b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.z));

  // Local frame: the origin is local (0,0,0), so the model can reason in either
  // space without doing arithmetic itself.
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const b of local) {
    const lx = Math.round(b.x - origin.x);
    const ly = Math.round(b.y - origin.y);
    const lz = Math.round(b.z - origin.z);
    if (lx < minX) minX = lx;
    if (lx > maxX) maxX = lx;
    if (lz < minZ) minZ = lz;
    if (lz > maxZ) maxZ = lz;
    if (ly < minY) minY = ly;
    if (ly > maxY) maxY = ly;
  }

  const sizeX = maxX - minX + 1;
  const sizeZ = maxZ - minZ + 1;
  const height = maxY - minY + 1;
  const centreX = (minX + maxX) / 2;
  const centreZ = (minZ + maxZ) / 2;

  // Voxel lookup in local coordinates, for the wall-gap scan.
  const voxels = new Map();
  for (const b of local) {
    const lx = Math.round(b.x - origin.x);
    const ly = Math.round(b.y - origin.y);
    const lz = Math.round(b.z - origin.z);
    voxels.set(`${lx},${ly},${lz}`, b.id);
  }

  const bounds = { minX, maxX, minY, maxY, minZ, maxZ };
  const entrances = findWallOpenings(voxels, bounds).map(opening => {
    const localCentreX = (opening.minX + opening.maxX) / 2;
    const localCentreZ = (opening.minZ + opening.maxZ) / 2;
    const localCentreY = minY + opening.baseDy;
    return {
      local: { x: localCentreX, y: localCentreY, z: localCentreZ },
      world: { x: origin.x + localCentreX, y: origin.y + localCentreY, z: origin.z + localCentreZ },
      width: Math.max(opening.maxX - opening.minX, opening.maxZ - opening.minZ) + 1,
      faces: describeDirection(localCentreX - centreX, localCentreZ - centreZ)
    };
  });

  // A doorway at ground level is what "the entrance" means. Above that, gaps are
  // arrow slits or tower openings, so they are listed after the ground-level ones.
  entrances.sort((a, b) => (a.local.y - minY) - (b.local.y - minY));

  return {
    id: studio.currentStructure.id,
    name: studio.currentStructure.name,
    description: studio.currentStructure.description || '',
    parameters: { ...params },
    origin: { x: origin.x, y: origin.y, z: origin.z },
    // Inclusive local bounds, so outside-the-structure coordinates are obvious.
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    size: { width: sizeX, height, depth: sizeZ },
    blockCount: local.length,
    entrances,
    buildOrigin: { x: origin.x, y: origin.y, z: origin.z }
  };
}

/** Render the description as the prompt section the model reads. */
export function formatStructureContext(info) {
  if (!info) return 'STRUCTURE STUDIO: no structure is currently open.';

  const paramText = Object.entries(info.parameters)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || 'none';

  const entranceText = info.entrances.length
    ? info.entrances.map((entrance, index) => {
      const label = info.entrances.length > 1 ? `entrance ${index + 1}` : 'entrance';
      return `  - ${label}: centred at local (${entrance.local.x}, ${entrance.local.y}, ${entrance.local.z}) = world (${entrance.world.x.toFixed(1)}, ${entrance.world.y.toFixed(1)}, ${entrance.world.z.toFixed(1)}), about ${entrance.width} block(s) wide, faces ${entrance.faces}`;
    }).join('\n')
    : '  - no opening was detected at ground level; the structure is enclosed.';

  return `STRUCTURE STUDIO — the structure currently open for editing:
"${info.name}" (id: ${info.id})${info.description ? ` — ${info.description}` : ''}
Blocks: ${info.blockCount}. Size: ${info.size.width} wide (X) x ${info.size.height} tall (Y) x ${info.size.depth} deep (Z).
Local coordinate frame: local (0,0,0) is world (${info.origin.x}, ${info.origin.y}, ${info.origin.z}).
Local bounds: X ${info.bounds.minX}..${info.bounds.maxX}, Y ${info.bounds.minY}..${info.bounds.maxY}, Z ${info.bounds.minZ}..${info.bounds.maxZ}. Anything outside those bounds is beside the structure.
Current parameters: ${paramText}.
Ground-level openings (use these when the player says "the entrance", "the door" or "the gate"):
${entranceText}
When the player asks to attach something to this structure, place it against the relevant opening: outside the local bounds on the side that opening faces, aligned to the opening's local X/Z. Do NOT guess a side — use the coordinates above.`;
}
