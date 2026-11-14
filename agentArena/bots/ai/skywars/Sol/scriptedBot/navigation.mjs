// Navigation uses only the guest's observed voxels. It never moves the player itself.
const key = (x, y, z) => `${x},${y},${z}`;
const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

class Heap {
  constructor() { this.a = []; }
  push(n) {
    const a = this.a; a.push(n); let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= n.f) break; a[i] = a[p]; i = p; } a[i] = n;
  }
  pop() {
    const a = this.a, out = a[0], n = a.pop();
    if (a.length) { let i = 0; while (i * 2 + 1 < a.length) { let j = i * 2 + 1; if (j + 1 < a.length && a[j + 1].f < a[j].f) j++; if (a[j].f >= n.f) break; a[i] = a[j]; i = j; } a[i] = n; }
    return out;
  }
}

/** Bounded A*: walk around walls, use stairs, bridge gaps and pillar only near a higher destination. */
export function terrainPath(bot, goal, { bridge = true, radius = 2.5, limit = 5000 } = {}) {
  const p = bot.position, start = { x: Math.floor(p.x), y: Math.floor(p.y), z: Math.floor(p.z), g: 0, used: 0, prev: null };
  const target = { x: goal.x - 0.5, y: goal.y, z: goal.z - 0.5 };
  const available = bridge ? bot.inventory.countPlaceableBlocks() : 0;
  const clear = (x, y, z) => !bot.isSolid(x, y, z) && !bot.isSolid(x, y + 1, z);
  const heuristic = (n) => Math.max(0, flat(n, target) - radius) + Math.abs(n.y - goal.y) * 0.5;
  start.f = heuristic(start);
  const heap = new Heap(), best = new Map([[key(start.x, start.y, start.z), 0]]); heap.push(start);
  let closest = start, count = 0;
  while (heap.a.length && count++ < limit) {
    const n = heap.pop();
    if (n.g !== best.get(key(n.x, n.y, n.z))) continue;
    if (heuristic(n) < heuristic(closest)) closest = n;
    if (flat(n, target) <= radius && Math.abs(n.y - goal.y) <= 2) { closest = n; break; }
    const offer = (x, y, z, cost, used, mode) => {
      if (used > available || Math.abs(x - start.x) > 65 || Math.abs(z - start.z) > 65 || y < Math.min(start.y, goal.y) - 3 || y > Math.max(start.y, goal.y) + 1) return;
      const g = n.g + cost, k = key(x, y, z);
      if (g >= (best.get(k) ?? Infinity)) return;
      best.set(k, g); const q = { x, y, z, g, used, mode, prev: n }; q.f = g + heuristic(q) * 1.15; heap.push(q);
    };
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = n.x + dx, z = n.z + dz;
      let land = false;
      for (const dy of [0, 1, -1, -2]) {
        const y = n.y + dy;
        if (!clear(x, y, z) || !bot.isSolid(x, y - 1, z)) continue;
        if (dy > 0 && bot.isSolid(n.x, n.y + 2, n.z)) continue;
        land = true;
        offer(x, y, z, 1 + Math.abs(dy) * 0.55, n.used, 'walk');
      }
      if (!land && available && clear(x, n.y, z) && !bot.isSolid(x, n.y - 1, z)) offer(x, n.y, z, 3.3, n.used + 1, 'bridge');
    }
    // A deliberate pillar is allowed by the difficulty and pays the ordinary placement pause.
    if (available && bot.skills.pillar && goal.y > n.y + 1 && flat(n, target) < 7 && clear(n.x, n.y + 1, n.z)) {
      offer(n.x, n.y + 1, n.z, 5, n.used + 1, 'pillar');
    }
  }
  if (closest === start) return [];
  const path = [];
  for (let n = closest; n.prev; n = n.prev) path.push({ x: n.x + 0.5, y: n.y, z: n.z + 0.5, mode: n.mode });
  return path.reverse();
}

/** Travel estimate for choosing destinations and connectors, without presuming the middle is the origin. */
export function crossingCost(bot, a, b) {
  const d = flat(a, b), n = Math.ceil(d), seen = new Set(); let gaps = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n, x = Math.floor(a.x + (b.x - a.x) * t), z = Math.floor(a.z + (b.z - a.z) * t), k = `${x},${z}`;
    if (seen.has(k)) continue; seen.add(k);
    // Count existing footing at either end's height; descending to a real island is cheaper than building over it.
    let ground = false;
    for (const y of [a.y, a.y - 1, b.y, b.y - 1]) if (bot.isSolid(x, Math.floor(y) - 1, z)) ground = true;
    if (!ground) gaps++;
  }
  return { cost: d + gaps * 1.9 + Math.abs(a.y - b.y) * 2, gaps };
}

export function routeViaPlaces(bot, goal, places) {
  const start = bot.position;
  const nodes = [start, ...places.filter((q) => ['middle', 'island'].includes(q.kind)
    && (Math.hypot(q.at[0] - start.x, q.at[2] - start.z) > 4 || Math.abs(q.at[1] - start.y) > 3))
    .map((q) => ({ x: q.at[0], y: q.at[1], z: q.at[2] })), goal];
  const end = nodes.length - 1, costs = nodes.map(() => Infinity), prev = [], done = new Set(); costs[0] = 0;
  while (done.size < nodes.length) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done.has(i) && (u < 0 || costs[i] < costs[u])) u = i;
    if (u < 0 || u === end) break; done.add(u);
    for (let v = 1; v < nodes.length; v++) if (!done.has(v)) {
      const c = crossingCost(bot, nodes[u], nodes[v]).cost + (v === end ? 0 : 1.5);
      if (costs[u] + c < costs[v]) { costs[v] = costs[u] + c; prev[v] = u; }
    }
  }
  let v = end;
  while (prev[v] > 0) v = prev[v];
  return nodes[v] ?? goal;
}
