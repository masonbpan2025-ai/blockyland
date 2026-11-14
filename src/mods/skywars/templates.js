// The SkyWars map templates. Each is a recipe, not a fixed map: given a seed it lays out a fresh arena -- the ring's
// size, each island's outline and depth, where the chests and decorations go -- and a data pack (packs.js) says what it
// is made of and what grows on it. Every template keeps what makes SkyWars fair: one island per player for 8 players,
// each spawn as far from the middle as every other, and at least ARENA.minGap blocks of void between islands, so
// nobody reaches anyone without bridging.
//
// Sources for the layouts:
//   - Classic: minecraft.wiki Tutorial:SkyWars ("each player starts off on a separate island ... a central, larger
//     island that has better loot, an enchanting table, and sometimes several anvils"); Hypixel SkyWars (three chests
//     on each spawn island).
//   - Archipelago: Mineplex's map guidelines ("You need to build connecting islands between the middle island and the
//     spawn islands"), and a 12-player map's "semi middle islands -- 1 chest -- easy to access from spawn island --
//     you can't jump straight to other players' islands -- you can't jump straight to middle island either".
//   - Citadel: Castle Renovah (four towers in the corners of the main island, each holding a chest), and the advice
//     that "the central hub is the highest point on the map, offering a tactical vantage point".
//   - Sectors: Hypixel's Desserted Islands (slices, each with spawn islands and a middle chest of its own, facing away
//     from a centre island with more middle chests).
//   - Twin Peaks, Sky Tiers, Sub-Mid Cross, Rush (2026-11-12): maps that break the one-middle-at-one-height habit.
//     CubeCraft's map threads: team maps "usually include a sub-mid island"; remakes that "combine height and angles";
//     side islands placed far below the rest. Hypixel's Laboratory "Rush" mode: close islands, fast fights.
import { ARENA, ArenaBuilder } from './generator.js';

/** The pack's building blocks for structures: its accent, trim and light, or its terrain's where it has none. */
const blocksOf = (b) => { const p = b.gen.palette; return { accent: p.accent ?? p.core, trim: p.trim ?? p.subsurface ?? p.core, light: p.light ?? p.core }; };

/**
 * A chest on a small island, on the cell of it nearest its middle: an island keeps its distance from its neighbours
 * by losing the cells too close to them, sometimes its middle ones too.
 */
function chestOnIsland(b, island, kind) {
  const cells = island.cells ?? [[island.x, island.z]];
  const [x, z] = [...cells].sort((a, c) => Math.hypot(a[0] - island.x, a[1] - island.z) - Math.hypot(c[0] - island.x, c[1] - island.z))[0];
  return b.chest(island, x, z, kind, { toward: { x: 0, z: 0 } });
}

/** Unit direction of an angle (0 is north, -z; clockwise seen from above). */
const dir = (angle) => [Math.sin(angle), -Math.cos(angle)];
const at = (angle, r) => { const [dx, dz] = dir(angle); return { x: Math.round(dx * r), z: Math.round(dz * r) }; };

/**
 * Ring order: slot 0 north, slot 1 south, then east and west, then the diagonals -- so two players start opposite each
 * other, and four make a cross.
 */
const RING_ORDER = [0, 4, 2, 6, 1, 5, 3, 7];

/** Three chests on a spawn island: to the left and right of the way to the middle, and one behind (Hypixel). */
function spawnChests(b, island, slot, toward = { x: 0, z: 0 }) {
  const len = Math.hypot(toward.x - island.x, toward.z - island.z) || 1;
  const ux = (toward.x - island.x) / len, uz = (toward.z - island.z) / len;
  const sx = -uz, sz = ux;
  for (const [ox, oz] of [[sx * 3, sz * 3], [-sx * 3, -sz * 3], [-ux * 3, -uz * 3]]) {
    const x = island.x + Math.round(ox), z = island.z + Math.round(oz);
    b.chest(island, x, z, 'island', { slot });
  }
}

/** `count` chests around the middle of `island`, at `radius` from its centre, facing in. */
function ringChests(b, island, count, radius, kind, phase = 0) {
  for (let i = 0; i < count; i++) {
    const p = at(phase + (i / count) * Math.PI * 2, radius);
    b.chest(island, island.x + p.x, island.z + p.z, kind);
  }
}

export const TEMPLATES = Object.freeze({
  classic: {
    id: 'classic',
    name: 'Classic Ring',
    description: 'Eight islands in a ring around a big middle island with the best loot. The SkyWars everyone knows.',
    source: 'minecraft.wiki Tutorial:SkyWars; Hypixel SkyWars',
    generate(b) {
      const size = b.gen.terrain.size;
      const ring = b.int(23, 25), spawnR = Math.round(4 * size), centerR = Math.round(b.int(8, 9) * size);
      const center = b.island({ x: 0, z: 0, radius: centerR, role: 'center' });
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const p = at((RING_ORDER[slot] / 8) * Math.PI * 2, ring);
        const island = b.island({ ...p, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
      }
      ringChests(b, center, b.gen.center.chests ?? 4, Math.max(3, Math.round(centerR * 0.45)), 'center', Math.PI / 4);
      b.centerPieces(center);
      return { spectator: { x: 0.5, y: ARENA.surfaceY + 12, z: 0.5 } };
    },
  },

  archipelago: {
    id: 'archipelago',
    name: 'Archipelago',
    description: 'Spawn islands far out, with small connector islands of one chest each on the way to a smaller middle.',
    source: "Mineplex map guidelines ('connecting islands'; 'semi middle islands')",
    generate(b) {
      const size = b.gen.terrain.size;
      const ring = b.int(32, 34), spawnR = Math.round(4 * size), centerR = Math.round(b.int(6, 7) * size);
      const center = b.island({ x: 0, z: 0, radius: centerR, role: 'center' });
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const p = at((RING_ORDER[slot] / 8) * Math.PI * 2, ring);
        const island = b.island({ ...p, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
      }
      // Connector islands between each pair of neighbouring spawns, or between every other pair, at random heights.
      const mids = b.gen.template_options?.mid_islands === 4 ? 4 : 8;
      for (let i = 0; i < mids; i++) {
        const angle = ((i * (8 / mids) + 0.5) / 8) * Math.PI * 2 + (b.random() - 0.5) * 0.12;
        const p = at(angle, b.int(19, 21));
        const island = b.island({ ...p, y: ARENA.surfaceY + b.int(-2, 2), radius: b.int(2, 3), role: 'mid' });
        b.chest(island, island.x, island.z, 'mid', { toward: { x: 0, z: 0 } });
      }
      ringChests(b, center, b.gen.center.chests ?? 4, Math.max(2, Math.round(centerR * 0.5)), 'center', Math.PI / 4);
      b.centerPieces(center);
      return { spectator: { x: 0.5, y: ARENA.surfaceY + 14, z: 0.5 } };
    },
  },

  citadel: {
    id: 'citadel',
    name: 'Citadel',
    description: 'A castle in the middle, higher than every island, with a chest in each of its four corner towers.',
    source: 'Castle Renovah (BuiltByBit); the centre as the highest point',
    generate(b) {
      const size = b.gen.terrain.size;
      const spawnY = ARENA.surfaceY - b.int(1, 3), centerY = ARENA.surfaceY + b.int(1, 2);
      const ring = b.int(26, 28), spawnR = Math.round(4 * size), centerR = b.int(10, 11);
      const center = b.island({ x: 0, z: 0, y: centerY, radius: centerR, role: 'center' });
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const p = at((RING_ORDER[slot] / 8) * Math.PI * 2, ring);
        const island = b.island({ ...p, y: spawnY, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
      }
      const { accent, trim, light } = b.gen.palette;
      const y = centerY + 1;
      // Four towers on the diagonals: 5 x 5 walls, a door toward the middle, a chest inside, battlements and a light.
      const d = Math.round(centerR * 0.5);
      const height = b.int(4, 6);
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const tx = sx * d, tz = sz * d;
        for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
          const wall = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (wall) for (let h = 0; h < height; h++) b.set(tx + dx, y + h, tz + dz, h === 0 ? trim : accent);
          b.set(tx + dx, y + height, tz + dz, accent);
          if (wall && (dx + dz) % 2 === 0) b.set(tx + dx, y + height + 1, tz + dz, accent);
        }
        // The door faces the middle: two cells of the inner corner walls opened.
        b.blocks.delete(`${tx - sx * 2},${y},${tz}`); b.blocks.delete(`${tx - sx * 2},${y + 1},${tz}`);
        b.set(tx, y + height + 1, tz, light);
        b.chest(center, tx, tz, 'center', { y, toward: { x: 0, z: 0 } });
        b.reserve(tx, tz, 3);
      }
      // The keep in the middle: four pillars and a roof over the tables.
      for (const [px, pz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) for (let h = 0; h < 3; h++) b.set(px, y + h, pz, accent);
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) b.set(dx, y + 3, dz, Math.abs(dx) + Math.abs(dz) <= 1 ? light : trim);
      b.centerPieces(center);
      b.reserve(0, 0, 3);
      return { spectator: { x: 0.5, y: centerY + 14, z: 0.5 } };
    },
  },

  sectors: {
    id: 'sectors',
    name: 'Sectors',
    description: 'Four slices of two spawn islands each, sharing a sector island with its own chests, around a small middle.',
    source: "Hypixel 'Desserted Islands' (spawn islands per slice, a middle chest each)",
    generate(b) {
      const size = b.gen.terrain.size;
      const ring = b.int(29, 31), spawnR = Math.round(4 * size), centerR = Math.round(b.int(5, 6) * size);
      const spread = 0.33 + b.random() * 0.03;
      const center = b.island({ x: 0, z: 0, radius: centerR, role: 'center' });
      // Slots 0 and 1 in opposite sectors, as in the ring.
      const order = [[0, -1], [2, -1], [1, -1], [3, -1], [0, 1], [2, 1], [1, 1], [3, 1]];
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const [sector, side] = order[slot];
        const p = at(Math.PI / 4 + sector * Math.PI / 2 + side * spread, ring);
        const island = b.island({ ...p, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
      }
      for (let sector = 0; sector < 4; sector++) {
        const p = at(Math.PI / 4 + sector * Math.PI / 2, b.int(16, 17));
        const island = b.island({ ...p, y: ARENA.surfaceY + b.int(-1, 1), radius: 3, role: 'sector' });
        const [dx, dz] = dir(Math.PI / 4 + sector * Math.PI / 2 + Math.PI / 2);
        for (const s of [-1, 1]) b.chest(island, island.x + Math.round(dx * s), island.z + Math.round(dz * s), 'mid', { toward: { x: 0, z: 0 } });
      }
      ringChests(b, center, b.gen.center.chests ?? 6, Math.max(2, centerR - 2), 'center', 0);
      b.centerPieces(center);
      return { spectator: { x: 0.5, y: ARENA.surfaceY + 14, z: 0.5 } };
    },
  },

  twin_peaks: {
    id: 'twin_peaks',
    name: 'Twin Peaks',
    description: "No island in the middle: a high peak to the east and a low one to the west, each with the middle's loot, and small stepping islands from the north and south.",
    source: "CubeCraft map threads (remakes that 'combine height and angles'); two middles at different heights",
    generate(b) {
      const size = b.gen.terrain.size;
      const ring = b.int(27, 29), spawnR = Math.round(4 * size), peakR = 5, apart = b.int(12, 13);
      const high = ARENA.surfaceY + b.int(4, 6), low = ARENA.surfaceY - b.int(4, 6);
      // The high peak first: it is the map's middle (the one with the enchanting table).
      const east = b.island({ x: apart, z: 0, y: high, radius: peakR, role: 'center' });
      const west = b.island({ x: -apart, z: 0, y: low, radius: peakR, role: 'center' });
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const p = at((RING_ORDER[slot] / 8) * Math.PI * 2, ring);
        const island = b.island({ ...p, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
      }
      // North and south have no peak in front of them: a stepping island each, level with the spawns.
      for (const sz of [-1, 1]) {
        const island = b.island({ x: 0, z: sz * (ring - spawnR - 8), radius: 3, role: 'mid' });
        chestOnIsland(b, island, 'mid');
      }
      ringChests(b, east, 3, 3, 'center', Math.PI / 3);
      ringChests(b, west, 3, 3, 'center', 0);
      b.centerPieces(east);
      return { spectator: { x: 0.5, y: high + 12, z: 0.5 } };
    },
  },

  tiers: {
    id: 'tiers',
    name: 'Sky Tiers',
    description: 'A tower in the middle with a high platform up a staircase -- the best chests are up top -- and stepping islands, high and low by turns, between the spawns.',
    source: 'CubeCraft map threads (height as part of the layout); a tiered middle',
    generate(b) {
      const size = b.gen.terrain.size;
      const ring = b.int(29, 31), spawnR = Math.round(4 * size), centerR = b.int(8, 9);
      const center = b.island({ x: 0, z: 0, radius: centerR, role: 'center' });
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const p = at((RING_ORDER[slot] / 8) * Math.PI * 2, ring);
        const island = b.island({ ...p, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
      }
      // Stepping islands between neighbouring spawns, three blocks up and three down by turns.
      for (let i = 0; i < 8; i++) {
        const p = at(((i + 0.5) / 8) * Math.PI * 2, b.int(17, 18));
        const island = b.island({ ...p, y: ARENA.surfaceY + (i % 2 === 0 ? 3 : -3), radius: 3, role: 'mid' });
        chestOnIsland(b, island, 'mid');
      }
      // The tower: a 3 x 3 pillar from the island up to a 7 x 7 platform six blocks up, and a staircase climbing to it
      // beside the platform's south edge, a block up for each block along.
      const { accent, trim, light } = blocksOf(b);
      const y = center.y + 1, top = y + 6;
      for (let h = 0; h < 6; h++) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) b.set(dx, y + h, dz, accent);
      for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) b.set(dx, top - 1, dz, Math.abs(dx) === 3 || Math.abs(dz) === 3 ? trim : accent);
      for (let i = 0; i < 5; i++) b.set(-3 + i, y + i, 4, trim);
      b.set(3, top, 3, light);
      b.reserve(0, 0, 5);
      for (const [cx, cz] of [[-2, -2], [2, -2]]) b.chest(center, cx, cz, 'center', { y: top, toward: { x: 0, z: 0 } });
      // Two more at the foot of the tower, and the tables beside them.
      for (const [cx, cz] of [[-5, -1], [5, -1]]) b.chest(center, cx, cz, 'center', { toward: { x: 0, z: 0 } });
      b.centerPieces({ ...center, z: center.z - 5 });
      return { spectator: { x: 0.5, y: top + 12, z: 0.5 } };
    },
  },

  sub_mids: {
    id: 'sub_mids',
    name: 'Sub-Mid Cross',
    description: 'A small middle and four sub-middle islands lower down, each with two good chests: the fights happen on the way.',
    source: "CubeCraft map threads (team maps 'usually include a sub-mid island'); Hypixel-style sub-mids",
    generate(b) {
      const size = b.gen.terrain.size;
      const ring = b.int(30, 31), spawnR = Math.round(4 * size), centerR = b.int(6, 7);
      const center = b.island({ x: 0, z: 0, radius: centerR, role: 'center' });
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const p = at((RING_ORDER[slot] / 8) * Math.PI * 2, ring);
        const island = b.island({ ...p, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
      }
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const p = at(angle, centerR + 10);
        const island = b.island({ ...p, y: ARENA.surfaceY - 3, radius: 4, role: 'mid' });
        const [dx, dz] = dir(angle + Math.PI / 2);
        for (const sgn of [-1, 1]) b.chest(island, island.x + Math.round(dx * 2 * sgn), island.z + Math.round(dz * 2 * sgn), 'mid', { toward: { x: 0, z: 0 } });
      }
      ringChests(b, center, 4, Math.max(2, centerR - 3), 'center', Math.PI / 4);
      b.centerPieces(center);
      return { spectator: { x: 0.5, y: ARENA.surfaceY + 14, z: 0.5 } };
    },
  },

  rush: {
    id: 'rush',
    name: 'Rush',
    description: 'Spawn islands close in, each with a narrow ready-made bridge to the middle: the fights start at once.',
    source: "Hypixel SkyWars Laboratory 'Rush' (close islands, fast games)",
    generate(b) {
      const size = b.gen.terrain.size;
      const ring = b.int(21, 22), spawnR = Math.round(4 * size), centerR = b.int(7, 8);
      const center = b.island({ x: 0, z: 0, radius: centerR, role: 'center' });
      const { trim } = blocksOf(b);
      const bridges = [];
      for (let slot = 0; slot < ARENA.maxPlayers; slot++) {
        const angle = (RING_ORDER[slot] / 8) * Math.PI * 2;
        const p = at(angle, ring);
        const island = b.island({ ...p, radius: spawnR, role: 'spawn', slot });
        b.spawn(slot, island);
        spawnChests(b, island, slot);
        bridges.push(angle);
      }
      // A one-wide bridge from each spawn island to the middle, level with both (laid after every island is built).
      for (const angle of bridges) {
        const [dx, dz] = dir(angle);
        let px = 0, pz = 0;
        const lay = (x, z) => { if (!b.blocks.has(`${x},${ARENA.surfaceY},${z}`)) b.set(x, ARENA.surfaceY, z, trim); };
        for (let r = 1; r <= ring; r++) {
          const x = Math.round(dx * r), z = Math.round(dz * r);
          // A diagonal step gets the block beside it too: blocks touching only at a corner cannot be walked.
          if (x !== px && z !== pz) lay(px, z);
          lay(x, z);
          px = x; pz = z;
        }
      }
      ringChests(b, center, 4, Math.max(3, Math.round(centerR * 0.5)), 'center', Math.PI / 8);
      b.centerPieces(center);
      return { spectator: { x: 0.5, y: ARENA.surfaceY + 12, z: 0.5 } };
    },
  },
});

/**
 * The practice map (agentArena/practice.mjs): three islands, two spawns facing each other across a middle, for two
 * players only. Every mechanic of the Classic Ring is here -- cages, three chests on each spawn island, the middle's
 * better chests and its enchanting table, the void between -- and the gap to bridge is the ring's (about eleven blocks),
 * but the map is a fraction of the size, so a practice game loads and runs on far less memory. Not offered in the lobby.
 */
export const PRACTICE_TEMPLATE = Object.freeze({
  id: 'practice',
  name: 'Practice (3 islands - Citadel style)',
  description: 'Two spawn islands facing each other across an elevated castle middle island: Citadel characteristics for practice.',
  source: 'Citadel, two slots',
  practice: true,
  slots: 2,
  generate(b) {
    const size = b.gen.terrain.size;
    const spawnY = ARENA.surfaceY - b.int(1, 2), centerY = ARENA.surfaceY + b.int(1, 2);
    const spawnR = Math.round(4 * size), centerR = Math.round(b.int(6, 7) * size);
    // The void between a spawn island and the middle matches the ring's gap.
    const gap = b.int(10, 12), ring = spawnR + centerR + gap;
    const center = b.island({ x: 0, z: 0, y: centerY, radius: centerR, role: 'center' });
    for (let slot = 0; slot < 2; slot++) {
      const p = at(slot * Math.PI, ring);
      const island = b.island({ ...p, y: spawnY, radius: spawnR, role: 'spawn', slot });
      b.spawn(slot, island);
      spawnChests(b, island, slot);
    }
    const { accent, trim, light } = b.gen.palette;
    const y = centerY + 1;
    // Citadel corner towers with battlements and chests inside
    const d = Math.max(2, Math.round(centerR * 0.5));
    const height = b.int(3, 4);
    for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const tx = sx * d, tz = sz * d;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        const wall = Math.abs(dx) === 1 || Math.abs(dz) === 1;
        if (wall) for (let h = 0; h < height; h++) b.set(tx + dx, y + h, tz + dz, h === 0 ? trim : accent);
        b.set(tx + dx, y + height, tz + dz, accent);
        if (wall && (dx + dz) % 2 === 0) b.set(tx + dx, y + height + 1, tz + dz, accent);
      }
      b.blocks.delete(`${tx - sx},${y},${tz}`); b.blocks.delete(`${tx - sx},${y + 1},${tz}`);
      b.set(tx, y + height + 1, tz, light);
      b.chest(center, tx, tz, 'center', { y, toward: { x: 0, z: 0 } });
      b.reserve(tx, tz, 2);
    }
    // Citadel keep in the middle: pillars and roof over the enchanting table
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (let h = 0; h < 3; h++) b.set(px, y + h, pz, accent);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) b.set(dx, y + 3, dz, Math.abs(dx) + Math.abs(dz) <= 1 ? light : trim);
    b.centerPieces(center);
    b.reserve(0, 0, 2);
    return { spectator: { x: 0.5, y: centerY + 12, z: 0.5 } };
  },
});

/** Every template this build can lay out, the practice map included. */
export const ALL_TEMPLATES = Object.freeze({ ...TEMPLATES, practice: PRACTICE_TEMPLATE });
/** The templates the lobby offers (the practice map is the arena's, not a lobby choice). */
export const TEMPLATE_IDS = Object.freeze(Object.keys(TEMPLATES));
export const DEFAULT_TEMPLATE = 'classic';

/** Lay out `template` with `generation` (a pack's, resolved) from `seed`. */
export function generateArena({ template, pack, generation, seed }) {
  const spec = ALL_TEMPLATES[template] ?? TEMPLATES[DEFAULT_TEMPLATE];
  const b = new ArenaBuilder({ seed, generation });
  const { spectator } = spec.generate(b);
  b.decorate();
  return b.finish({ template: spec.id, pack, spectator });
}
