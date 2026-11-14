// The Bed Wars map layouts: where the bases, the generator islands, the middle and any other islands go. Each layout is a
// template -- a recipe, not a fixed map -- and the seed decides the rest: the distances, the angles, the sizes and
// shapes and heights of the islands, where the generators sit, and which way round the whole map turns. Two rounds on
// the same template are never laid out alike; the host and every guest plan the same map from { teams, layout, seed }.
//
// The templates follow Hypixel's maps (the Hypixel Wiki's map pages, hypixel.fandom.com):
// - Classic Cross: Lighthouse / Meso -- "Diamond Generator islands connecting bases diagonally", a 32-block rush.
// - Offset Ring: Archway -- "The offset island positioning and a tight middle".
// - Flanking Diamonds: Ashore -- "Diamond generators are located to either side of the team bases, and are also
//   approximately 48 blocks away"; middle about 48 blocks away.
// - High Middle: Waterfall -- "a high middle island that stands above the Diamond Generator islands"; Aquarium -- the
//   diamond generators "at a slightly lower y-level than the team bases", the emeralds "on a higher platform in middle".
// - Stepping Stones: Dreamgrove -- "small islands in between different generator islands"; Orchestra -- a rush "via
//   Outer Mid".
// - Compact Middle: Picnic, whose 4v4 version moved the Diamond Generators "adjacent to the middle island".
// - Archipelago: the islands-between of Dreamgrove and Orchestra with Waterfall's high middle, all at once.
// Five teams (the "fives" mode) stand evenly on a ring, with whatever stood between them (diamond islands, stones)
// between each pair.
// Rush distances on Hypixel's maps run from 16 to 96 blocks, most 32 to 48; these keep within that.
//
// Every base is the same 17 x 17 island at ARENA.surfaceY facing the middle along a compass direction (arena.js builds
// it). Whatever the seed, every island keeps at least MIN_GAP blocks of void from every other, so each must be bridged.
import { seededRandom } from '../skywars/generator.js';

/** The surface of the bases; other islands rise or sink a few blocks from it. */
export const SURFACE_Y = 30;
/** Void between any two islands, at the least: every island must be bridged to. */
export const MIN_GAP = 6;
/** A base island's reach from its centre (its 17 x 17 square's corner). */
export const BASE_REACH = 12;

/** Practice (agentArena/practice.mjs): fixed, so practice positions mean the same every game. */
export const PRACTICE = Object.freeze({ baseDistance: 30, middleRadius: 7, diamond: { x: -3, z: 0 }, emerald: { x: 3, z: 0 } });

const TAU = Math.PI * 2;
const polar = (angle, r) => ({ x: Math.round(Math.sin(angle) * r), z: Math.round(-Math.cos(angle) * r) });
/** A base's facing: toward the middle along the stronger axis, so its blocks stay square. */
const facing = (x, z) => (Math.abs(x) > Math.abs(z) ? { fx: -Math.sign(x), fz: 0 } : { fx: 0, fz: -Math.sign(z) || 1 });

class Planner {
  constructor(seed) {
    this.random = seededRandom((seed ^ 0x5bd1e995) >>> 0);
    this.bases = [];
    this.diamonds = [];
    this.emeralds = [];
    this.islands = []; // { x, z, y, r, role }: the generator islands and any others; bases and the middle aside
    this.middle = { x: 0, z: 0, y: SURFACE_Y, r: 10 };
  }

  between(a, b) { return a + this.random() * (b - a); }
  int(a, b) { return Math.floor(this.between(a, b + 1)); }
  pick(list) { return list[Math.floor(this.random() * list.length)]; }

  base(x, z) { this.bases.push({ x: Math.round(x), z: Math.round(z), ...facing(Math.round(x), Math.round(z)) }); }
  island(x, z, r, { y = SURFACE_Y, role = 'diamond', generator = null } = {}) {
    const island = { x: Math.round(x), z: Math.round(z), y, r, role };
    this.islands.push(island);
    if (generator === 'diamond') this.diamonds.push({ x: island.x, z: island.z, y: y + 1, island: this.islands.length - 1 });
    return island;
  }
  /** Emerald generators on the middle island: `count` of them, `radius` from its centre, from a random angle. */
  emeraldsOnMiddle(count, radius) {
    const start = this.random() * TAU;
    for (let i = 0; i < count; i++) {
      const p = polar(start + (i / count) * TAU, radius);
      this.emeralds.push({ x: p.x, z: p.z, y: this.middle.y + 1 });
    }
  }
}

/**
 * The base positions of the cross most layouts share: two opposite, four on the sides, or eight two to a side. Five
 * (or any other count) stand evenly on a ring, the first due north.
 */
function crossBases(p, teams, { distance, pairSpread = 19 }) {
  if (teams === 2) { p.base(0, -distance); p.base(0, distance); return; }
  if (teams !== 8) { for (let i = 0; i < teams; i++) { const q = polar((i / teams) * TAU, distance); p.base(q.x, q.z); } return; }
  // Eight: two to each side, either side of its middle.
  for (const [sx, sz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
    const rx = -sz, rz = sx;
    for (const along of [-1, 1]) p.base(sx * distance + rx * along * pairSpread, sz * distance + rz * along * pairSpread);
  }
}

/** The angles halfway between neighbouring bases on the ring (four diagonals for the cross of four or eight). */
const betweenAngles = (teams) => (teams === 2 ? [TAU / 4, (3 * TAU) / 4] : teams === 4 || teams === 8
  ? [TAU / 8, (3 * TAU) / 8, (5 * TAU) / 8, (7 * TAU) / 8]
  : Array.from({ length: teams }, (_, i) => ((i + 0.5) / teams) * TAU));

/** Diamond islands between the bases: on the cross's diagonals (or its sides with two teams; between each pair of five). */
function crossDiamonds(p, teams, { distance, radius, y = SURFACE_Y, jitter = 3 }) {
  const angles = betweenAngles(teams);
  for (const a of angles) {
    const q = polar(a + p.between(-0.08, 0.08), distance + p.between(-jitter, jitter));
    p.island(q.x, q.z, radius(), { y: typeof y === 'function' ? y() : y, generator: 'diamond' });
  }
}

export const LAYOUT_TEMPLATES = Object.freeze({
  standard: {
    id: 'standard', name: 'Classic Cross', teams: [2, 4, 5, 8],
    description: 'Bases round a middle with the emeralds, diamond islands between neighbouring bases.',
    source: "Hypixel Wiki: Lighthouse, Meso ('Diamond Generator islands connecting bases diagonally')",
    plan(p, teams) {
      p.middle.r = teams === 8 ? p.int(11, 13) : p.int(9, 11);
      crossBases(p, teams, { distance: teams === 8 ? p.int(48, 56) : teams === 5 ? p.int(42, 48) : p.int(38, 48), pairSpread: p.int(17, 21) });
      crossDiamonds(p, teams, { distance: teams === 8 ? p.int(34, 40) : teams === 5 ? p.int(28, 33) : p.int(24, 32), radius: () => p.between(3.5, 5) });
      p.emeraldsOnMiddle(teams === 8 ? 4 : 2, p.int(3, 5));
    },
  },
  offset: {
    id: 'offset', name: 'Offset Ring', teams: [2, 4, 5, 8],
    description: 'Bases on a ring turned off the compass, diamond islands between them, and a small, tight middle.',
    source: "Hypixel Wiki: Archway ('The offset island positioning and a tight middle')",
    plan(p, teams) {
      p.middle.r = p.int(6, 8);
      const turn = p.between(0.25, 0.5) * (p.random() < 0.5 ? 1 : -1);
      const ring = teams === 8 ? p.int(54, 60) : teams === 5 ? p.int(44, 50) : p.int(40, 48);
      for (let i = 0; i < teams; i++) { const q = polar(turn + (i / teams) * TAU, ring); p.base(q.x, q.z); }
      const dRing = teams === 8 ? p.int(34, 40) : teams === 5 ? p.int(28, 32) : p.int(24, 30);
      const n = teams === 2 ? 2 : teams === 5 ? 5 : 4;
      for (let i = 0; i < n; i++) {
        const q = polar(turn + ((i + 0.5) / n) * TAU + p.between(-0.15, 0.15), dRing);
        p.island(q.x, q.z, p.between(3.5, 4.5), { generator: 'diamond' });
      }
      p.emeraldsOnMiddle(teams === 8 ? 4 : 2, p.int(2, 3));
    },
  },
  flanks: {
    id: 'flanks', name: 'Flanking Diamonds', teams: [2, 4, 5],
    description: 'A diamond island beside every base, as far from it as the middle is; a big middle with the emeralds.',
    source: "Hypixel Wiki: Ashore ('Diamond generators are located to either side of the team bases')",
    plan(p, teams) {
      p.middle.r = p.int(10, 13);
      const distance = teams === 5 ? p.int(50, 56) : p.int(44, 52);
      crossBases(p, teams, { distance });
      const side = p.random() < 0.5 ? 1 : -1;
      if (teams === 5) {
        // On a ring of five the bases do not face along the compass: each diamond island stands off to the same side
        // of its base, a third of the way to the next, a little nearer the middle.
        p.bases.forEach((b, i) => {
          const q = polar((i / teams) * TAU + side * p.between(0.5, 0.6), distance * p.between(0.78, 0.84));
          p.island(q.x, q.z, p.between(3.5, 4.5), { generator: 'diamond' });
        });
        p.emeraldsOnMiddle(2, p.int(3, 5));
        return;
      }
      for (const b of p.bases) {
        // To the base's side (across its facing), a little toward the middle.
        const rx = -b.fz * side, rz = b.fx * side, lateral = p.int(24, 30), forward = p.int(6, 12);
        p.island(b.x + rx * lateral + b.fx * forward, b.z + rz * lateral + b.fz * forward, p.between(3.5, 4.5), { generator: 'diamond' });
      }
      p.emeraldsOnMiddle(2, p.int(3, 5));
    },
  },
  highmid: {
    id: 'highmid', name: 'High Middle', teams: [2, 4, 5, 8],
    description: 'The middle stands high above the bases, the diamond islands sit low between them: every crossing climbs or drops.',
    source: "Hypixel Wiki: Waterfall ('a high middle island that stands above the Diamond Generator islands'); Aquarium",
    plan(p, teams) {
      p.middle.r = teams === 8 ? p.int(10, 12) : p.int(8, 10);
      p.middle.y = SURFACE_Y + p.int(3, 6);
      crossBases(p, teams, { distance: teams === 8 ? p.int(50, 56) : teams === 5 ? p.int(44, 50) : p.int(40, 46), pairSpread: p.int(17, 21) });
      crossDiamonds(p, teams, { distance: teams === 8 ? p.int(34, 40) : teams === 5 ? p.int(28, 33) : p.int(24, 30), radius: () => p.between(3.5, 5), y: () => SURFACE_Y - p.int(2, 4) });
      p.emeraldsOnMiddle(teams === 8 ? 4 : 2, p.int(3, 5));
    },
  },
  stepping: {
    id: 'stepping', name: 'Stepping Stones', teams: [2, 4, 5],
    description: 'Bases far out, with small islands on the way to the middle and to the diamonds: shorter bridges, more of them.',
    source: "Hypixel Wiki: Dreamgrove ('small islands in between different generator islands'); Orchestra ('via Outer Mid')",
    plan(p, teams) {
      p.middle.r = p.int(8, 10);
      crossBases(p, teams, { distance: p.int(50, 58) });
      crossDiamonds(p, teams, { distance: p.int(30, 36), radius: () => p.between(3.5, 4.5) });
      // One stone halfway on each base's way to the middle, off the straight line.
      for (const b of p.bases) {
        const t = p.between(0.45, 0.6), off = p.int(-5, 5);
        p.island(b.x * t + -b.fz * off, b.z * t + b.fx * off, p.between(2, 3), { role: 'stone', y: SURFACE_Y + p.int(-1, 1) });
      }
      p.emeraldsOnMiddle(2, p.int(3, 4));
    },
  },
  compact: {
    id: 'compact', name: 'Compact Middle', teams: [2, 4, 5, 8],
    description: 'No diamond islands: the diamond generators sit at the rim of a wide middle, with the emeralds in its heart.',
    source: "Hypixel Wiki: Picnic (its 4v4 version: Diamond Generators moved 'adjacent to the middle island')",
    plan(p, teams) {
      p.middle.r = teams === 8 ? p.int(14, 16) : p.int(11, 14);
      crossBases(p, teams, { distance: teams === 8 ? p.int(44, 50) : p.int(32, 40), pairSpread: p.int(17, 21) });
      const angles = teams === 8 ? betweenAngles(4) : betweenAngles(teams);
      for (const a of angles) {
        const q = polar(a + p.between(-0.1, 0.1), p.middle.r - 3);
        p.diamonds.push({ x: q.x, z: q.z, y: p.middle.y + 1, island: null });
      }
      p.emeraldsOnMiddle(teams === 8 ? 4 : 2, p.int(2, 3));
    },
  },
  archipelago: {
    id: 'archipelago', name: 'Archipelago', teams: [2, 4, 5],
    description: 'Bases far out on a ring; a high middle, low diamond islands, stepping stones that climb and drop, and outer stones from base to base.',
    source: "Hypixel Wiki: Dreamgrove and Orchestra (the islands between, the outer rush), Waterfall (the high middle), together",
    plan(p, teams) {
      p.middle.r = p.int(8, 10);
      p.middle.y = SURFACE_Y + p.int(4, 6);
      const distance = teams === 5 ? p.int(58, 64) : p.int(54, 60);
      crossBases(p, teams, { distance });
      crossDiamonds(p, teams, { distance: Math.round(distance * p.between(0.5, 0.56)), radius: () => p.between(3.5, 4.5), y: () => SURFACE_Y - p.int(3, 5) });
      // Two stones on each base's way in, the first a little low and the second high, off the straight line.
      for (const b of p.bases) {
        const len = Math.hypot(b.x, b.z) || 1, ux = b.x / len, uz = b.z / len;
        [[0.66, -p.int(1, 2)], [0.36, p.int(2, 4)]].forEach(([t, dy]) => {
          const off = p.int(-4, 4);
          p.island(b.x * t - uz * off, b.z * t + ux * off, p.between(2, 3), { role: 'stone', y: SURFACE_Y + dy });
        });
      }
      // The outer ring: a stone between each pair of neighbouring bases, past the diamond islands.
      for (const a of betweenAngles(teams)) {
        const q = polar(a + p.between(-0.06, 0.06), distance * p.between(0.86, 0.92));
        p.island(q.x, q.z, p.between(2.5, 3.5), { role: 'stone', y: SURFACE_Y + p.int(-2, 2) });
      }
      p.emeraldsOnMiddle(2, p.int(3, 4));
    },
  },
  practice: {
    id: 'practice', name: 'Practice (3 islands)', teams: [2], practice: true,
    description: 'Two bases and a middle with a diamond and an emerald generator: the duel in miniature, for practice games.',
    source: 'Agent Arena practice',
    plan(p) {
      p.middle.r = PRACTICE.middleRadius;
      p.base(0, -PRACTICE.baseDistance);
      p.base(0, PRACTICE.baseDistance);
      p.diamonds.push({ ...PRACTICE.diamond, y: SURFACE_Y + 1, island: null });
      p.emeralds.push({ ...PRACTICE.emerald, y: SURFACE_Y + 1 });
    },
  },
});
/**
 * Five layouts from the simplest to the most complex, for a series that gets harder each round (the Agent Arena's
 * five-team Bed Wars): no generator islands; diamond islands between the bases; diamonds far off to the side; every
 * crossing climbing or dropping; and many small islands at many heights.
 */
export const PROGRESSION = Object.freeze(['compact', 'standard', 'flanks', 'highmid', 'archipelago']);

/** The layouts a lobby offers (the practice map is the arena's). */
export const LAYOUT_IDS = Object.freeze(Object.keys(LAYOUT_TEMPLATES).filter((id) => !LAYOUT_TEMPLATES[id].practice));

/** The four quarter turns and a mirror, applied to a whole plan so the same template can face any way. */
function transform(plan, turns, mirror) {
  const t = (x, z) => {
    let [a, b] = mirror ? [-x, z] : [x, z];
    for (let i = 0; i < turns; i++) [a, b] = [-b, a];
    return [a, b];
  };
  for (const list of [plan.bases, plan.diamonds, plan.emeralds, plan.islands]) {
    for (const o of list) {
      [o.x, o.z] = t(o.x, o.z);
      if ('fx' in o) [o.fx, o.fz] = t(o.fx, o.fz);
    }
  }
}

/** Push islands apart, outward from the middle, until every gap is at least MIN_GAP (a seed can bring two close). */
function spread(plan) {
  const reach = (o) => (o.kind === 'base' ? BASE_REACH : o.r);
  const things = () => [
    ...plan.bases.map((b) => ({ o: b, kind: 'base', x: b.x, z: b.z })),
    ...plan.islands.map((i) => ({ o: i, kind: 'island', x: i.x, z: i.z, r: i.r })),
  ];
  for (let round = 0; round < 40; round++) {
    let moved = false;
    const all = [{ o: null, kind: 'middle', x: 0, z: 0, r: plan.middle.r }, ...things()];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z), need = reach(a) + reach(b) + MIN_GAP;
      if (d >= need) continue;
      // Move the one farther out (never the middle) away from the middle.
      const m = a.o === null ? b : b.o === null ? a : Math.hypot(a.x, a.z) >= Math.hypot(b.x, b.z) ? a : b;
      const len = Math.hypot(m.x, m.z) || 1, step = Math.ceil(need - d) + 1;
      m.o.x = Math.round(m.o.x + (m.x / len) * step); m.o.z = Math.round(m.o.z + (m.z / len) * step);
      moved = true;
      break;
    }
    if (!moved) return;
  }
}

/**
 * The plan of a map: the template's layout from the seed, turned and mirrored by the seed, spread so every island is
 * apart. Pure: the same { teams, layout, seed } always plans the same map.
 * @returns {{ template: string, teams: number, bases: {x,z,fx,fz}[], diamonds: {x,y,z,island}[], emeralds: {x,y,z}[],
 *   islands: {x,z,y,r,role}[], middle: {x,z,y,r} }}
 */
export function planLayout({ teams, layout, seed }) {
  const spec = LAYOUT_TEMPLATES[layout] ?? LAYOUT_TEMPLATES.standard;
  const p = new Planner(seed);
  spec.plan(p, teams);
  const plan = { template: spec.id, teams, bases: p.bases, diamonds: p.diamonds, emeralds: p.emeralds, islands: p.islands, middle: p.middle };
  if (!spec.practice) {
    transform(plan, p.int(0, 3), p.random() < 0.5);
    spread(plan);
    // Diamond generators follow their islands.
    for (const d of plan.diamonds) if (d.island !== null) { const i = plan.islands[d.island]; d.x = i.x; d.z = i.z; }
    // A base faces the middle from wherever it ended up.
    for (const b of plan.bases) Object.assign(b, facing(b.x, b.z));
  }
  return plan;
}
