// Sets for Claude's cut, built from real game blocks plus textured prop meshes:
//   home      — the Lin family's raised farmhouse, porch steps, yard, road and wagon (around 0,0)
//   workshop  — the village wheelwright's open workshop (around 35,−3)
//   frontier  — Grandpa's story: the old man's hut, corral and the frontier wall (around 0,40)
// Paths are flat texture decals laid on the grass so they sit flush with the ground.
import * as T from 'three';
import { BLOCKS as B } from '../blocks.js';
import { box } from './claudeActors.js';
import { createStage, meshWorld, addSkyAndHorizon, texBox, rand } from './claudeStage.js';
export { texBox, rand };

export async function buildStage() {
  const stage = await createStage({ seed: 1907, chunks: 4 });
  const { renderer, scene, camera, hemi, sun, tex, M, textures, world, put, fill } = stage;
  const height = (x, z) => {
    let h = 2;
    if (z < -20) h += Math.floor(Math.max(0, (-z - 20) * .32 + Math.sin(x * .13) * 1.6 + Math.sin(x * .05 + 1) * 2));
    if (x > 50) h += Math.floor(Math.max(0, (x - 50) * .35 + Math.sin(z * .2) * 1.5));
    if (z > 54) h += Math.floor(Math.max(0, (z - 54) * .45 + Math.sin(x * .17) * 1.4 + Math.cos(x * .06) * 1.5));
    return Math.min(h, 40);
  };
  const keepClear = (x, z) => (x >= -26 && x <= 22 && z >= -16 && z <= 14) || (x >= 20 && x <= 44 && z >= -12 && z <= 9) || (x >= -24 && x <= 30 && z >= 26 && z <= 52);
  for (let x = -64; x < 80; x++) for (let z = -64; z < 80; z++) {
    const h = height(x, z), frontier = z > 22;
    for (let y = 0; y <= h; y++) put(x, y, z, y === h ? B.GRASS : B.DIRT);
    const r = rand(x, z, 1); // flowers only: grass tufts and ferns render untinted (grey) in authored worlds
    if (r < (frontier ? .012 : .03) && !keepClear(x, z)) put(x, h + 1, z, r < (frontier ? .006 : .017) ? B.POPPY : B.DANDELION);
  }

  // HOME — a raised farmhouse for three generations: x −9..4, z −14..−6, porch z −5..−3.
  fill(-9, 3, -14, 4, 3, -6, B.COBBLESTONE); fill(-8, 3, -13, 3, 3, -7, B.OAK_PLANKS);
  for (let x = -9; x <= 4; x++) for (let z = -14; z <= -6; z++) for (let y = 4; y <= 7; y++) {
    const edge = x === -9 || x === 4 || z === -14 || z === -6; if (!edge) continue;
    let id = B.OAK_PLANKS;
    if ([-9, -5, 0, 4].includes(x) && (z === -14 || z === -6) || (x === -9 || x === 4) && (z === -10)) id = B.OAK_LOG;
    if (y === 7) id = B.SPRUCE_PLANKS;
    if (z === -6 && (x === -2 || x === -1) && y <= 5) id = B.AIR; // double door
    if (z === -6 && (x === -7 || x === -6 || x === 2 || x === 3) && (y === 5 || y === 6)) id = B.GLASS;
    if ((x === -9 || x === 4) && (z === -8 || z === -12) && (y === 5 || y === 6)) id = B.GLASS;
    put(x, y, z, id);
  }
  for (let r = 0; r <= 5; r++) for (let x = -10; x <= 5; x++) { put(x, 8 + r, -15 + r, B.DARK_OAK_PLANKS); put(x, 8 + r, -5 - r, B.DARK_OAK_PLANKS); }
  for (let r = 0; r < 5; r++) for (let z = -14 + r; z <= -6 - r; z++) for (const x of [-9, 4]) put(x, 8 + r, z, r === 2 && z === -10 ? B.GLASS : B.SPRUCE_PLANKS);
  fill(2, 4, -12, 2, 15, -12, B.COBBLESTONE); fill(2, 14, -12, 2, 15, -12, B.STONE_BRICKS);
  fill(-8, 4, -13, 3, 7, -7, B.AIR); fill(-8, 3, -13, 3, 3, -7, B.OAK_PLANKS); fill(-8, 7, -13, 3, 7, -7, B.SPRUCE_PLANKS);
  fill(-9, 3, -5, 4, 3, -3, B.OAK_PLANKS); for (let x = -9; x <= 4; x++) put(x, 3, -3, B.SPRUCE_PLANKS);
  for (const x of [-9, -5, 0, 4]) fill(x, 4, -3, x, 6, -3, B.OAK_LOG);
  fill(-10, 7, -5, 5, 7, -3, B.SPRUCE_PLANKS); fill(-10, 7, -2, 5, 7, -2, B.DARK_OAK_PLANKS);
  put(-8, 4, -5, B.BARREL); put(3, 4, -5, B.BARREL); put(3, 5, -5, B.BARREL);
  // garden, well, woodshed
  for (let x = -17; x <= -12; x++) for (let z = -13; z <= -7; z++) { put(x, 2, z, z % 3 === 0 ? B.DIRT : B.FARMLAND); if (z % 3) put(x, 3, z, B.WHEAT); }
  fill(-15, 3, -2, -13, 3, 0, B.COBBLESTONE); put(-14, 3, -1, B.AIR); put(-14, 2, -1, B.AIR);
  fill(7, 3, -12, 10, 3, -9, B.SPRUCE_PLANKS); for (const [x, z] of [[7, -12], [10, -12], [7, -9], [10, -9]]) fill(x, 4, z, x, 6, z, B.SPRUCE_LOG); fill(6, 7, -13, 11, 7, -8, B.SPRUCE_PLANKS);
  // WORKSHOP — open-fronted, facing west down the lane: x 31..39, z −7..1.
  fill(31, 2, -7, 39, 2, 1, B.SMOOTH_STONE);
  for (let x = 31; x <= 39; x++) for (let z = -7; z <= 1; z++) for (let y = 3; y <= 6; y++) {
    const wall = x === 39 || z === -7 || z === 1; const post = (x === 31 || x === 35 || x === 39) && (z === -7 || z === 1) || x === 39 && z === -3; // open front: no centre post
    if (post) put(x, y, z, B.SPRUCE_LOG); else if (wall) put(x, y, z, y === 5 && x === 39 && (z === -5 || z === -1) ? B.GLASS : B.SPRUCE_PLANKS);
  }
  for (let r = 0; r <= 5; r++) for (let x = 30; x <= 40; x++) { put(x, 7 + r, -8 + r, B.RED_TERRACOTTA); put(x, 7 + r, 2 - r, B.RED_TERRACOTTA); }
  for (let r = 0; r < 5; r++) for (let z = -7 + r; z <= 1 - r; z++) put(39, 7 + r, z, B.SPRUCE_PLANKS);
  fill(31, 7, -7, 31, 7, 1, B.SPRUCE_LOG);
  put(38, 3, -6, B.FURNACE); put(37, 3, -6, B.CRAFTING_TABLE); put(38, 3, 0, B.BARREL); put(38, 4, 0, B.BARREL); put(37, 3, 0, B.BARREL);
  // FRONTIER — the old man's hut (x −9..−3, z 38..44), sandstone walls, log corners.
  for (let x = -9; x <= -3; x++) for (let z = 38; z <= 44; z++) {
    put(x, 2, z, B.DIRT);
    for (let y = 3; y <= 5; y++) {
      if (!(x === -9 || x === -3 || z === 38 || z === 44)) continue;
      let id = (x === -9 || x === -3) && (z === 38 || z === 44) ? B.OAK_LOG : B.SANDSTONE;
      if (z === 38 && x === -6 && y <= 4) id = B.AIR; if (z === 38 && x === -4 && y === 4) id = B.GLASS;
      put(x, y, z, id);
    }
  }
  // the frontier wall on the southern ridge, with watchtowers
  for (let x = -60; x < 80; x++) {
    const z = 66 + Math.round(Math.sin(x * .08) * 2), h = height(x, z);
    for (let y = h + 1; y <= h + 3; y++) for (let dz = 0; dz < 2; dz++) put(x, y, z + dz, B.STONE_BRICKS);
    if (x % 2 === 0) put(x, h + 4, z, B.STONE_BRICKS);
    if (x === -22 || x === 18) { const top = h + 8; fill(x - 2, h + 1, z - 1, x + 2, top, z + 3, B.STONE_BRICKS); fill(x - 1, top - 2, z, x + 1, top, z + 2, B.AIR); for (let k = -2; k <= 2; k += 2) { put(x + k, top + 1, z - 1, B.STONE_BRICKS); put(x + k, top + 1, z + 3, B.STONE_BRICKS); } }
  }
  // neighbour's hut
  for (let x = 15; x <= 19; x++) for (let z = 46; z <= 50; z++) for (let y = 3; y <= 4; y++) if (x === 15 || x === 19 || z === 46 || z === 50) put(x, y, z, (x === 15 || x === 19) && (z === 46 || z === 50) ? B.OAK_LOG : B.SANDSTONE);

  // trees: oaks and birch at home, spruce on the frontier
  const tree = (x, z, kind) => {
    const h = height(x, z), top = h + (kind === 'spruce' ? 7 : 5) + Math.floor(rand(x, z, 9) * 2);
    const log = kind === 'spruce' ? B.SPRUCE_LOG : kind === 'birch' ? B.BIRCH_LOG : B.OAK_LOG, leaves = B.OAK_LEAVES; // the only leaves the mesher tints green
    for (let y = h + 1; y <= top; y++) put(x, y, z, log);
    if (kind === 'spruce') { for (let y = h + 3; y <= top + 1; y++) { const rad = Math.max(0, Math.round((top + 1 - y) * .45)) + (y % 2 ? 0 : 1) - 1; for (let dx = -rad; dx <= rad; dx++) for (let dz = -rad; dz <= rad; dz++) if (Math.abs(dx) + Math.abs(dz) <= rad + 1 && (dx || dz || y > top)) put(x + dx, y, z + dz, leaves); } return; }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) * 1.5 <= 3.2 && (dx || dz || dy > 0) && rand(x + dx, z + dz, dy + 5) > .08) put(x + dx, top + dy, z + dz, leaves);
  };
  for (const [x, z, k] of [[-21, -9, 'oak'], [-23, -1, 'oak'], [-19, 5, 'birch'], [11, -17, 'oak'], [16, -6, 'oak'], [-4, -21, 'oak'], [5, -24, 'birch'], [-13, -22, 'oak'], [20, 2, 'birch'], [-28, 10, 'oak'], [24, 13, 'oak'], [-15, -18, 'birch'], [14, -26, 'oak'], [-30, -14, 'oak'],
    [27, -11, 'oak'], [44, -12, 'oak'], [45, 6, 'birch'], [27, 8, 'oak'],
    [-16, 17, 'oak'], [-12, 18, 'oak'], [-8, 16, 'oak'], [-4, 18, 'oak'], [0, 17, 'oak'], [3, 19, 'birch'], [-20, 15, 'oak'], [-25, 18, 'oak'], [7, 21, 'oak'],
    [-18, 47, 'spruce'], [-14, 56, 'spruce'], [24, 40, 'spruce'], [9, 58, 'spruce'], [-26, 41, 'spruce'], [30, 55, 'spruce'], [-5, 60, 'spruce']]) tree(x, z, k);
  // cloud-free sky over the frontier ridge, rows of wheat behind the neighbour's hut
  for (let x = 21; x <= 27; x++) for (let z = 44; z <= 50; z++) { put(x, 2, z, z % 3 === 0 ? B.DIRT : B.FARMLAND); if (z % 3) put(x, 3, z, B.WHEAT); }

  meshWorld(stage);
  const groundAt = (x, z) => {
    if (x >= -9 && x < 5 && z >= -14 && z < -2) return 4;
    if (x >= -2.5 && x <= .5 && z >= -2 && z < -1.6) return 3 + 2 / 3;
    if (x >= -2.5 && x <= .5 && z >= -1.6 && z < -1.2) return 3 + 1 / 3;
    return height(Math.floor(x), Math.floor(z)) + 1;
  };

  // ---------------------------------------------------------------- sky, horizon, mountains, clouds
  const { sky, groundPlane, mountains, clouds, setHills } = addSkyAndHorizon(stage, [[0, -150, 0, 1, 16, 0x8aa0a2, 1], [10, -210, 0, 1, 14, 0xa8b8bc, 2], [170, 0, 1, 0, 14, 0x8fa39a, 3], [230, 10, 1, 0, 12, 0xadbcbb, 4], [0, 175, 0, -1, 16, 0xb4a283, 5], [-10, 235, 0, -1, 14, 0xc7b89c, 6]]);

  // ---------------------------------------------------------------- props
  const home = new T.Group(), workshop = new T.Group(), frontier = new T.Group(); scene.add(home, workshop, frontier);
  const decal = (parent, x0, z0, x1, z1, mat, y = 3.012) => {
    const w = x1 - x0, d = z1 - z0, g = new T.PlaneGeometry(w, d), uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w + x0, uv.getY(i) * d + z0);
    const m = new T.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true; parent.add(m); return m;
  };
  const pathMat = new T.MeshLambertMaterial({ map: tex.dirt_path_top, color: 0xf0d6a4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const gravelMat = new T.MeshLambertMaterial({ map: tex.coarse_dirt, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  decal(home, -2.4, -1.2, .4, 4, pathMat); decal(home, -60, 4, 30, 7.2, pathMat); decal(home, -14.6, -2.8, -2.4, -1.4, pathMat, 3.011);
  decal(workshop, 30, 4, 46, 7.2, pathMat); decal(workshop, 22, -4.5, 31, 4.2, pathMat, 3.011);
  decal(frontier, -40, 33, 60, 35.6, gravelMat); decal(frontier, -7, 35.6, -5, 38, gravelMat, 3.011);

  // porch steps
  for (const [z0, top] of [[-2, 3 + 2 / 3], [-1.6, 3 + 1 / 3]]) texBox(home, [3.0, top - 3, .4], [-1, 3 + (top - 3) / 2, z0 + .2], M.spruce);
  // fences: yard front (gap for the path) and west side
  const fence = (parent, ax, az, bx, bz, mat = M.oak, skipAt) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 2), ang = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n; texBox(parent, [.25, 1.1, .25], [x, 3.55, z], mat); }
    for (const y of [3.45, 3.85]) for (let i = 0; i < n; i++) {
      const x = ax + (bx - ax) * (i + .5) / n, z = az + (bz - az) * (i + .5) / n;
      if (skipAt?.(x, z)) continue;
      texBox(parent, [len / n, .12, .1], [x, y, z], mat, [0, -ang, 0]);
    }
  };
  fence(home, -18, 3.4, -2.8, 3.4); fence(home, .8, 3.4, 14, 3.4); fence(home, -18, 3.4, -18, -15);
  // well roof
  for (const x of [-15, -13]) texBox(home, [.2, 2, .2], [x + .5 - (x === -15 ? 0 : 0), 5, -.5], M.log);
  texBox(home, [3, .2, 2], [-13.5, 6.1, -.5], M.dark); texBox(home, [2.4, .12, .12], [-13.5, 5.5, -.5], M.log);
  // porch furniture: bench, crates, sacks, a potted plant, lantern hooks
  const bench = (parent, x, z, len = 2.2, back = -1) => { const g = new T.Group(); g.position.set(x, 0, z); parent.add(g); texBox(g, [len, .1, .45], [0, 4.45, 0], M.spruce); for (const dx of [-len / 2 + .15, len / 2 - .15]) texBox(g, [.1, .45, .4], [dx, 4.22, 0], M.spruce); texBox(g, [len, .35, .08], [0, 4.75, back * .22], M.spruce); return g; };
  bench(home, -6.5, -4.6); bench(home, 2.2, -4.6, 1.6);
  const crate = (parent, at, s = [.8, .7, .7], mat = M.oak) => {
    const g = new T.Group(); g.position.set(...at); parent.add(g);
    texBox(g, s, [0, s[1] / 2, 0], mat);
    for (const sx of [-1, 1]) texBox(g, [.08, s[1] + .02, s[2] + .02], [sx * (s[0] / 2 - .04), s[1] / 2, 0], M.dark);
    return g;
  };
  const sack = (parent, at, color = 0xd9c9a3) => { const g = new T.Group(); g.position.set(...at); parent.add(g); box(g, [.5, .55, .4], [0, .27, 0], new T.MeshLambertMaterial({ map: tex.white_wool, color })); box(g, [.2, .12, .2], [0, .6, 0], 0x9e8a62); return g; };
  const lantern = (parent, at) => {
    const g = new T.Group(); g.position.set(...at); parent.add(g);
    box(g, [.26, .04, .26], [0, .16, 0], 0x2f2c29); box(g, [.26, .04, .26], [0, -.16, 0], 0x2f2c29);
    const glass = new T.Mesh(new T.BoxGeometry(.2, .28, .2), new T.MeshStandardMaterial({ color: 0xffd28a, emissive: 0xffb54a, emissiveIntensity: .25 })); g.add(glass); g.glass = glass;
    box(g, [.04, .2, .04], [0, .28, 0], 0x2f2c29); return g;
  };
  const lanterns = [lantern(home, [-5, 6.3, -3.35]), lantern(home, [0, 6.3, -3.35]), lantern(workshop, [33, 5.6, -3])];
  const porchCrates = [crate(home, [-4.6, 4, -4.4]), crate(home, [-4.2, 4, -3.6], [.6, .5, .6]), sack(home, [-3.0, 4, -4.55])];
  // woodpile by the shed, hay
  for (let i = 0; i < 9; i++) { const m = texBox(home, [1.6, .3, .3], [8.5, 3.15 + Math.floor(i / 3) * .3, -10.6 + (i % 3) * .32 + (Math.floor(i / 3) % 2) * .15], M.log, [0, 0, Math.PI / 2]); m.rotation.set(0, Math.PI / 2, Math.PI / 2); }
  // warm windows (lit at dusk)
  const glowMat = new T.MeshBasicMaterial({ color: 0xffc777, transparent: true, opacity: 0, fog: false });
  const windows = new T.Group(); home.add(windows);
  for (const x of [-6.5, 2.5]) { const m = new T.Mesh(new T.PlaneGeometry(2, 2), glowMat); m.position.set(x + .5 - .5, 6, -6.45); windows.add(m); }
  { const m = new T.Mesh(new T.PlaneGeometry(2, 2.2), glowMat); m.position.set(-1, 5.1, -6.6); windows.add(m); }

  // ---------------------------------------------------------------- the family wagon
  const wagon = new T.Group(); wagon.position.set(4, 3, 5.6); home.add(wagon);
  const front = new T.Group(); wagon.add(front); // front axle, shafts: do not tilt
  const bed = new T.Group(); wagon.add(bed); // tilts when the wheel breaks
  texBox(bed, [2.7, .12, 1.5], [0, .95, 0], M.oak);
  for (const z of [-.72, .72]) { texBox(bed, [2.7, .38, .08], [0, 1.2, z], M.spruce); texBox(bed, [2.7, .07, .1], [0, 1.4, z], M.dark); }
  for (const x of [-1.32, 1.32]) texBox(bed, [.08, .38, 1.5], [x, 1.2, 0], M.spruce);
  texBox(bed, [2.5, .12, .12], [0, .82, 0], M.dark); texBox(bed, [.12, .12, 1.7], [-.82, .5, 0], M.dark);
  texBox(front, [.12, .12, 1.7], [.82, .5, 0], M.dark); texBox(front, [.5, .35, .5], [.82, .7, 0], M.dark);
  for (const z of [-.42, .42]) texBox(front, [2.6, .09, .09], [2.5, .8, z], M.stripped, [0, 0, -.06]);
  texBox(front, [.09, .09, .9], [3.7, .74, 0], M.stripped);
  const makeWheel = () => {
    const g = new T.Group(), rimMat = M.wheelWood, R = .45;
    for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, m = texBox(g, [.26, .09, .09], [Math.cos(a) * R, Math.sin(a) * R, 0], rimMat); m.rotation.z = a + Math.PI / 2; }
    texBox(g, [.16, .16, .16], [0, 0, 0], M.dark);
    const spokes = []; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI, m = texBox(g, [.06, R * 2 - .08, .05], [0, 0, 0], M.oak); m.rotation.z = a; spokes.push(m); }
    g.spokes = spokes; return g;
  };
  const wheels = {};
  for (const [key, x, z, parent] of [['fl', .82, -.85, front], ['fr', .82, .85, front], ['rl', -.82, -.85, bed], ['rr', -.82, .85, bed]]) { const w = makeWheel(); w.position.set(x, .45, z); parent.add(w); wheels[key] = w; }
  const brokenWheel = makeWheel(); home.add(brokenWheel); brokenWheel.visible = false;
  const cargo = [crate(bed, [-.6, 1.01, -.3]), crate(bed, [.5, 1.01, .25], [.7, .6, .6]), sack(bed, [.6, 1.01, -.35], 0xcdb98e), crate(bed, [-.55, 1.71, -.3], [.55, .45, .55], M.spruce)];
  const trunk = new T.Group(); home.add(trunk);
  texBox(trunk, [.9, .5, .55], [0, .25, 0], M.dark); texBox(trunk, [.92, .14, .57], [0, .55, 0], M.spruce);
  for (const x of [-.3, .3]) box(trunk, [.06, .66, .59], [x, .33, 0], 0x6d6a66); box(trunk, [.12, .12, .04], [0, .42, -.29], 0xc8a24e);
  const prop = { log: (parent, at) => { const g = new T.Group(); g.position.set(...at); parent.add(g); texBox(g, [.55, .45, .55], [0, .22, 0], M.log); return g; } };
  const chock = prop.log(home, [3.18, 3, 6.45]); chock.visible = false;
  // splinters and dust pool
  const splinterMat = M.oak, splinters = []; for (let i = 0; i < 14; i++) { const m = texBox(home, [.22, .05, .06], [0, -10, 0], splinterMat); splinters.push(m); }
  const dustMat = new T.MeshLambertMaterial({ color: 0xc9b48e, transparent: true, opacity: .6, depthWrite: false });
  const dust = []; for (let i = 0; i < 70; i++) { const m = new T.Mesh(new T.BoxGeometry(.2, .2, .2), dustMat.clone()); m.visible = false; scene.add(m); dust.push(m); }

  // ---------------------------------------------------------------- workshop dressing
  const bench2 = new T.Group(); bench2.position.set(34.5, 3, -.6); workshop.add(bench2);
  texBox(bench2, [2.8, .14, .9], [0, .92, 0], M.spruce); for (const x of [-1.25, 1.25]) for (const z of [-.35, .35]) texBox(bench2, [.12, .9, .12], [x, .45, z], M.dark);
  texBox(bench2, [1.2, .1, .3], [-.4, 1.04, .05], M.oak); box(bench2, [.3, .08, .08], [.7, 1.04, -.2], 0x777777);
  const anvil = new T.Group(); anvil.position.set(36.6, 3, -4.6); workshop.add(anvil);
  texBox(anvil, [.5, .4, .5], [0, .2, 0], M.log); box(anvil, [.35, .15, .3], [0, .47, 0], 0x3f4447); box(anvil, [.8, .22, .32], [0, .65, 0], 0x4a5054);
  for (const [z, y] of [[-2, 5.4], [0, 5.4], [-5.2, 5.2]]) { const w = makeWheel(); w.position.set(38.85, y, z); w.rotation.y = Math.PI / 2; workshop.add(w); }
  { const w = makeWheel(); w.position.set(37.8, 3.45, -1.8); w.rotation.set(0, Math.PI / 2, .2); workshop.add(w); }
  for (let i = 0; i < 8; i++) texBox(workshop, [2.6, .22, .22], [29.6, 3.11 + Math.floor(i / 4) * .22, -9 + (i % 4) * .24], M.stripped);
  const repairWheel = makeWheel(); workshop.add(repairWheel); repairWheel.visible = false;
  const signCanvas = document.createElement('canvas'); signCanvas.width = 512; signCanvas.height = 128;
  { const p = signCanvas.getContext('2d'); p.fillStyle = '#6b4a2b'; p.fillRect(0, 0, 512, 128); p.fillStyle = '#8a6239'; p.fillRect(8, 8, 496, 112); p.fillStyle = '#f3e3bf'; p.font = 'bold 54px "Microsoft YaHei", serif'; p.textAlign = 'center'; p.fillText('车轮 · 木工', 256, 70); p.font = '24px Georgia'; p.fillText('WHEELWRIGHT', 256, 106); }
  const signTex = new T.CanvasTexture(signCanvas); signTex.colorSpace = T.SRGBColorSpace;
  const sign = new T.Mesh(new T.PlaneGeometry(3, .75), new T.MeshLambertMaterial({ map: signTex })); sign.position.set(30.86, 6.3, -3); sign.rotation.y = -Math.PI / 2; workshop.add(sign);

  // ---------------------------------------------------------------- frontier dressing
  const thatch = new T.Group(); frontier.add(thatch);
  for (let r = 0; r < 4; r++) for (const side of [-1, 1]) texBox(thatch, [8.2, .5, 1.15], [-6, 6.1 + r * .5, 41 + side * (3.5 - r * 1)], M.hay, [side * .25, 0, 0]);
  texBox(thatch, [8.2, .4, 1], [-6, 8.1, 41], M.hay);
  for (const x of [-9.3, -2.7]) for (let r = 0; r < 3; r++) texBox(thatch, [.4, .5, 6 - r * 2], [x, 6.05 + r * .5, 41], M.hay);
  // corral: x 0..8, z 37..45 with a gate on the north side
  const corralRails = [];
  const post = (x, z) => texBox(frontier, [.25, 1.2, .25], [x, 3.6, z], M.spruceLog);
  const rail = (ax, az, bx, bz, y) => { const m = texBox(frontier, [Math.hypot(bx - ax, bz - az), .12, .1], [(ax + bx) / 2, y, (az + bz) / 2], M.spruce, [0, -Math.atan2(bz - az, bx - ax), 0]); corralRails.push(m); return m; };
  for (let x = 0; x <= 8; x += 2) { post(x, 37); post(x, 45); }
  for (let z = 39; z <= 43; z += 2) { post(0, z); post(8, z); }
  for (const y of [3.5, 3.95]) { for (let x = 0; x < 8; x += 2) { if (!(x === 2)) rail(x, 37, x + 2, 37, y); rail(x, 45, x + 2, 45, y); } for (let z = 37; z < 45; z += 2) { rail(0, z, 0, z + 2, y); rail(8, z, 8, z + 2, y); } }
  const brokenRails = corralRails.filter(m => Math.abs(m.position.z - 45) < .01 && Math.abs(m.position.x - 5) < .01);
  const hayPile = new T.Group(); hayPile.position.set(-1.6, 3, 40); frontier.add(hayPile); texBox(hayPile, [1, 1, 1], [0, .5, 0], M.hay); texBox(hayPile, [1, .8, 1], [.2, .4, 1.05], M.hay); texBox(hayPile, [1, 1, 1], [.1, 1.4, .5], M.hay, [0, .3, 0]);
  const trough = texBox(frontier, [1.6, .4, .5], [4, 3.2, 38], M.spruce);
  const choppingBlock = prop.log(frontier, [-8, 3, 35.6]);
  const frontierBench = bench(frontier, -4.6, 37.2, 1.8, 1); frontierBench.position.y = -1;
  const banner = new T.Group(); frontier.add(banner);
  { box(banner, [.06, 2.6, .06], [0, 1.3, 0], 0x5b4128); const c = document.createElement('canvas'); c.width = 64; c.height = 96; const p = c.getContext('2d'); p.fillStyle = '#9b2d22'; p.fillRect(0, 0, 64, 96); p.fillStyle = '#e8c766'; p.font = 'bold 44px "Microsoft YaHei"'; p.textAlign = 'center'; p.fillText('兵', 32, 60); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; const f = new T.Mesh(new T.PlaneGeometry(.6, .9), new T.MeshLambertMaterial({ map: t, side: T.DoubleSide })); f.position.set(.32, 2.1, 0); banner.add(f); banner.flag = f; }

  return {
    renderer, scene, camera, sun, hemi, sky, clouds, mountains, groundPlane, world, groundAt, M, tex,
    sets: { home, workshop, frontier }, lanterns, windows, glowMat,
    wagon: { root: wagon, bed, front, wheels, brokenWheel, cargo, trunk, chock, splinters, makeWheel },
    porchCrates, dust, repairWheel, brokenRails, banner, crate,
    setHills,
  };
}
