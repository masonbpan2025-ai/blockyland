// Landmarks describe this round, including the heights of the small stepping stones.
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function middleLandmark(arena, plan = null) {
  const middle = plan?.middle ?? arena?.middle ?? { x: 0, z: 0, y: arena?.midY ?? 30, r: 9 };
  return { ...middle, y: middle.y + 1 };
}

export function routeLandmarks(arena, plan = null) {
  if (!arena) return [];
  return [middleLandmark(arena, plan),
    ...(arena.islands ?? []).map((p) => ({ ...p, y: p.y + 1 }))].filter(Boolean);
}

/** A small graph over islands. Penalise time spent building, height changes, and long void spans. */
export function islandRoute(from, target, islands) {
  const points = [{ ...from, r: 0 }, ...islands.filter((p) => distance(p, from) > 3 && distance(p, target) > 3), { ...target, r: 0 }];
  const end = points.length - 1, costs = points.map(() => Infinity), prev = points.map(() => -1), used = new Set();
  costs[0] = 0;
  for (let n = 0; n < points.length; n++) {
    let u = -1;
    for (let i = 0; i < points.length; i++) if (!used.has(i) && (u < 0 || costs[i] < costs[u])) u = i;
    if (u < 0 || u === end) break;
    used.add(u);
    for (let v = 1; v < points.length; v++) {
      if (used.has(v)) continue;
      const a = points[u], b = points[v], d = distance(a, b);
      const gap = Math.max(0, d - (a.r ?? 0) * 0.8 - (b.r ?? 0) * 0.8);
      // Every stop has a cost; a stone must save a real amount of bridge to be useful.
      const cost = costs[u] + d + gap * 1.3 + Math.abs(a.y - b.y) * 2 + (v === end ? 0 : 5);
      if (cost < costs[v]) { costs[v] = cost; prev[v] = u; }
    }
  }
  const out = [];
  for (let at = end; at > 0; at = prev[at]) {
    if (at < 0) break;
    out.unshift(points[at]);
  }
  return out.length ? out : [target];
}

/** Conservative wool budget: a diagonal crossing needs connecting corner blocks as well. */
export function crossingBudget(from, to, missing = 0) {
  const dx = Math.abs(from.x - to.x), dz = Math.abs(from.z - to.z);
  return Math.ceil(Math.max(missing * 1.5, (dx + dz) * 0.85) + Math.max(0, to.y - from.y) * 2 + 20);
}
