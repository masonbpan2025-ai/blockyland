// The fights in a recording, for the film to draw: arrows in flight, hits on players and hits on mobs.
//
// The recording is a frame every 0.5 s with each player's and each mob's health and position, and every arrow entity
// while it exists. That is enough to place each blow within half a second, not to see it: an arrow crosses 15 blocks in
// half a second, and one that hits a player is gone the same tick. So the blows are inferred, each from what the
// recording does show:
//   - a player's health drops: a hit. A zombie (or another melee mob) within 3 blocks struck it; else a skeleton (or
//     another archer) within 24 blocks shot it, and the arrow is drawn from the archer's bow to the player; else it
//     was not a mob (a fall, hunger, lava) and only the hurt flash is drawn.
//   - a mob's health drops with a player within 4.5 blocks: that player hit it (the nearest one).
//   - an arrow appears in the world (stuck in a block, or still flying): an archer within 24 blocks shot it just
//     before; the flight is drawn from the archer to where it was first seen, then on to where it came to rest.
// Arrows fly at about 30 blocks a second (a skeleton's arrow: 1.6 blocks a tick).
export const MELEE = new Set(['phantom', 'vex', 'ravager', 'zombie', 'husk', 'drowned', 'zombie_villager', 'spider', 'cave_spider', 'enderman', 'silverfish', 'endermite', 'vindicator', 'piglin_brute', 'zombified_piglin', 'hoglin', 'zoglin', 'wither_skeleton', 'warden', 'slime', 'magma_cube']);
export const ARCHERS = new Set(['skeleton', 'stray', 'bogged', 'pillager', 'piglin', 'witch']);
const BURNS = new Set(['zombie', 'zombie_villager', 'skeleton', 'stray', 'phantom', 'drowned']);
const ARROW_SPEED = 30;
const RELOAD = .9; // seconds between one archer's shots (a skeleton draws for 1-2 s): two arrows at once came from two archers
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const r2 = (v) => Math.round(v * 100) / 100;

/**
 * @param frames raw frames ({t: tick, p: [[name, dim, x, y, z, yaw, pitch, hp, ...]], e: [[id, dim, type, x, y, z, yaw, hp]]})
 * @param sec    tick -> film seconds
 * @returns {{shots: object[], hurts: object[], hits: object[]}} on the film's clock
 */
export function combatEvents(frames, sec) {
  const shots = [], hurts = [], hits = [];
  const mobsIn = (f, dim) => f.e.filter(e => e[1] === dim && (MELEE.has(e[2]) || ARCHERS.has(e[2]) || e[2] === 'creeper'));
  // --- hits on players ---
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1], b = frames[k];
    for (const p of b.p) {
      const q = a.p.find(x => x[0] === p[0]);
      if (!q || q[1] !== p[1] || !(q[7] - p[7] >= .9) || Math.hypot(p[2] - q[2], p[4] - q[4]) > 8) continue; // a respawn is not a hit
      const at = [p[2], p[3], p[4]], t = sec(b.t) - .15;
      const near = mobsIn(a, p[1]).map(e => ({ e, d: dist([e[3], e[4], e[5]], at) })).sort((x, y) => x.d - y.d);
      const melee = near.find(n => MELEE.has(n.e[2]) && n.d < 3.2), boom = near.find(n => n.e[2] === 'creeper' && n.d < 5 && !b.e.some(e => e[0] === n.e[0]));
      const archer = near.find(n => ARCHERS.has(n.e[2]) && n.d < 24);
      const by = melee ?? boom ?? archer ?? null;
      const hurt = { t: r2(t), player: p[0], amount: r2(q[7] - p[7]), hp: r2(p[7]), at: at.map(r2) };
      if (by) Object.assign(hurt, { by: by.e[2], mob: by.e[0], from: [by.e[3], by.e[4], by.e[5]].map(r2), how: by === melee ? 'melee' : by === boom ? 'explosion' : 'arrow' });
      hurts.push(hurt);
      if (hurt.how === 'arrow') {
        const from = [by.e[3], by.e[4] + 1.5, by.e[5]], to = [p[2], p[3] + 1.2, p[4]], fly = dist(from, to) / ARROW_SPEED;
        shots.push({ t0: r2(t - fly), t1: r2(t), from: from.map(r2), to: to.map(r2), mob: by.e[0], hit: p[0] });
      }
    }
  }
  // --- hits on mobs ---
  const lastHp = new Map();
  for (const f of frames) {
    for (const e of f.e) {
      if (!(MELEE.has(e[2]) || ARCHERS.has(e[2]) || e[2] === 'creeper')) continue;
      const before = lastHp.get(e[0]); lastHp.set(e[0], e[7]);
      if (before == null || !(before - e[7] > .5)) continue;
      const at = [e[3], e[4], e[5]];
      const by = f.p.filter(p => p[1] === e[1]).map(p => ({ p, d: dist([p[2], p[3], p[4]], at) })).sort((x, y) => x.d - y.d)[0];
      if (!by || by.d > 4.5) continue; // the sun, a fall, another mob: not a player's blow
      // A creeper that goes from full to nothing at once exploded (dry10-haiku 6:27: the blast took 5 from Basil).
      if (e[2] === 'creeper' && before - e[7] >= 15) continue;
      // A 1-point loss beside a player holding a sword or axe is not their blow (those hit for 4 or more): a zombie,
      // skeleton or phantom burning in the sun (dry10-haiku: phantoms burning at dawn beside the whole team). With a
      // block or bare hands in hand, 1 point is a blow (dry8: Delphi's dirt block).
      if (before - e[7] <= 1.1 && /sword|_axe$/.test(String(by.p[9] ?? ''))) continue;
      // Nor is it in daylight on a mob that burns, out in the open (the frames hold no sky, so: at the surface height
      // of these worlds, y 24 and up). dry10-haiku: phantoms over the base at sunrise, the players walled in with dirt
      // in hand; dry8's dirt-block blows were in a cave at y 13.
      const tod = ((f.time % 24000) + 24000) % 24000;
      if (before - e[7] <= 1.1 && BURNS.has(e[2]) && (tod < 12500 || tod > 23460) && e[4] >= 24) continue;
      hits.push({ t: r2(sec(f.t) - .15), player: by.p[0], mob: e[0], type: e[2], amount: r2(before - e[7]), hp: r2(e[7]), at: at.map(r2), from: [by.p[2], by.p[3], by.p[4]].map(r2), killed: e[7] <= 0 });
    }
  }
  // A mob that vanished right after a player's blow died of it.
  for (const h of hits) if (!h.killed) { const k = frames.findIndex(f => sec(f.t) > h.t + .2); if (k > 0 && frames[k] && !frames[k].e.some(e => e[0] === h.mob) && h.hp <= 6) h.killed = true; }
  // --- arrows seen in the world ---
  const seen = new Map();
  for (let k = 0; k < frames.length; k++) for (const e of frames[k].e) if (e[2] === 'arrow') { const s = seen.get(e[0]); if (!s) seen.set(e[0], { k, path: [[sec(frames[k].t), e[3], e[4], e[5]]] }); else if (s.path.length < 4) s.path.push([sec(frames[k].t), e[3], e[4], e[5]]); }
  // each archer's shots so far (the hits on players first: those are certain), to keep one archer to one arrow a reload
  const loosed = new Map();
  for (const s of shots) { if (!loosed.has(s.mob)) loosed.set(s.mob, []); loosed.get(s.mob).push(s.t1); }
  const free = (mob, t) => !(loosed.get(mob) ?? []).some(u => Math.abs(u - t) < RELOAD);
  for (const [id, { k, path }] of [...seen].sort((a, b) => a[1].path[0][0] - b[1].path[0][0])) {
    const f = frames[Math.max(0, k - 1)], first = path[0], dim = frames[k].e.find(e => e[0] === id)?.[1];
    const archer = mobsIn(f, dim).filter(e => ARCHERS.has(e[2])).map(e => ({ e, d: dist([e[3], e[4], e[5]], first.slice(1)) })).filter(n => n.d < 24 && free(n.e[0], first[0])).sort((x, y) => x.d - y.d)[0];
    if (!archer || k === 0) continue; // an arrow there from the start, or no archer near and ready: no flight drawn (it is still drawn where it lands)
    if (!loosed.has(archer.e[0])) loosed.set(archer.e[0], []); loosed.get(archer.e[0]).push(first[0]);
    const from = [archer.e[3], archer.e[4] + 1.5, archer.e[5]];
    // where it came to rest: the first point it stopped moving at
    let rest = path[0];
    for (let i = 1; i < path.length; i++) { if (dist(path[i].slice(1), path[i - 1].slice(1)) < .2) break; rest = path[i]; }
    const d1 = dist(from, first.slice(1)), d2 = dist(first.slice(1), rest.slice(1));
    const t1 = rest === path[0] ? first[0] - .1 : rest[0] - .1, t0 = t1 - (d1 + d2) / ARROW_SPEED;
    shots.push({ t0: r2(t0), t1: r2(t1), from: from.map(r2), to: rest.slice(1).map(r2), mob: archer.e[0], arrow: id });
  }
  shots.sort((a, b) => a.t0 - b.t0); hurts.sort((a, b) => a.t - b.t); hits.sort((a, b) => a.t - b.t);
  return { shots, hurts, hits };
}
