// The set for 守株待兔 · Waiting by the Stump — Claude, built from real game blocks plus prop meshes:
//   the farmer's field   x −9..−1, z −6..3, with his one-room cottage to the west (a lone farmer)
//   Auntie Li's field    x 3..12, z −6..3, with her cottage to the east (she lives with her grandson)
//   the stump            at the woods' edge, (−4.5, −9.2); oak woods to the north, a road to the south
// Crops and weeds are textured cross-planes so they can grow, ripen and be cut through the seasons.
import * as T from 'three';
import { BLOCKS as B } from '../blocks.js';
import { box } from './claudeActors.js';
import { createStage, meshWorld, addSkyAndHorizon, texBox, decal, rand, blockTex } from './claudeStage.js';

export const STUMP = [-4.5, -9.2], STUMP_TOP = 3.55;
export const MY_FIELD = { x0: -9, x1: -1, z0: -6, z1: 3 }, LI_FIELD = { x0: 3, x1: 12, z0: -6, z1: 3 };

export async function buildFarm() {
  const stage = await createStage({ seed: 731, chunks: 3, extraTextures: ['oak_log_top.png', 'short_grass.png', 'tall_grass_top.png', ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `wheat_stage_${i}.png`)] });
  const { scene, tex, M, put, fill } = stage;

  // ---------------------------------------------------------------- terrain
  const height = (x, z) => {
    let h = 2;
    if (z < -24) h += Math.floor(Math.max(0, (-z - 24) * .3 + Math.sin(x * .14) * 1.5 + Math.sin(x * .05 + 2) * 1.8));
    if (z > 22) h += Math.floor(Math.max(0, (z - 22) * .3 + Math.sin(x * .11 + 1) * 1.6));
    if (Math.abs(x) > 34) h += Math.floor(Math.max(0, (Math.abs(x) - 34) * .3 + Math.sin(z * .2) * 1.2));
    return Math.min(h, 30);
  };
  const keepClear = (x, z) => x >= -22 && x <= 24 && z >= -11 && z <= 10;
  for (let x = -48; x < 64; x++) for (let z = -48; z < 64; z++) {
    const h = height(x, z);
    for (let y = 0; y <= h; y++) put(x, y, z, y === h ? B.GRASS : B.DIRT);
    const r = rand(x, z, 1); // flowers only: grass tufts render untinted in authored worlds
    if (r < .03 && !keepClear(x, z)) put(x, h + 1, z, r < .017 ? B.POPPY : B.DANDELION);
  }
  for (const F of [MY_FIELD, LI_FIELD]) for (let x = F.x0; x <= F.x1; x++) for (let z = F.z0; z <= F.z1; z++) put(x, 2, z, B.FARMLAND);
  // the farmer's one-room cottage (x −19..−14, z −5..0), door facing his field
  const cottage = (x0, x1, z0, z1, doorX, doorZ, wall) => {
    fill(x0, 3, z0, x1, 3, z1, B.OAK_PLANKS);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 3; y <= 5; y++) {
      if (!(x === x0 || x === x1 || z === z0 || z === z1)) continue;
      let id = (x === x0 || x === x1) && (z === z0 || z === z1) ? B.OAK_LOG : wall;
      if (x === doorX && z === doorZ && y <= 4) id = B.AIR;
      if (y === 4 && ((z === z1 || z === z0) && x === Math.round((x0 + x1) / 2))) id = B.GLASS;
      put(x, y, z, id);
    }
    fill(x0 + 1, 4, z0 + 1, x1 - 1, 5, z1 - 1, B.AIR);
  };
  cottage(-19, -14, -5, 0, -14, -3, B.OAK_PLANKS);
  cottage(16, 21, -6, -1, 16, -4, B.SPRUCE_PLANKS);
  // woods to the north, trees to the south and around the cottages
  const tree = (x, z) => {
    const h = height(x, z), top = h + 5 + Math.floor(rand(x, z, 9) * 3), log = rand(x, z, 4) < .25 ? B.BIRCH_LOG : B.OAK_LOG;
    for (let y = h + 1; y <= top; y++) put(x, y, z, log);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = -2; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) * 1.5 <= 3.2 && (dx || dz || dy > 0) && rand(x + dx, z + dz, dy + 5) > .08) put(x + dx, top + dy, z + dz, B.OAK_LEAVES);
  };
  for (let i = 0; i < 60; i++) { const x = -26 + Math.floor(rand(i, 3) * 52), z = -13 - Math.floor(rand(i, 7) * 16); if (Math.abs(x - STUMP[0]) < 2.5 && z > -14) continue; tree(x, z); }
  for (const [x, z] of [[-22, -7], [-23, 3], [24, -8], [25, 2], [-12, 15], [-4, 17], [3, 21], [18, 22], [-20, 18], [22, 15], [30, 12], [-30, 9], [0, 24], [-15, 26], [17, 25]]) tree(x, z);
  meshWorld(stage);
  const groundAt = (x, z) => height(Math.floor(x), Math.floor(z)) + 1;

  const sky = addSkyAndHorizon(stage, [[0, -150, 0, 1, 16, 0x8aa0a2, 1], [10, -210, 0, 1, 14, 0xa8b8bc, 2], [170, 0, 1, 0, 14, 0x8fa39a, 3], [-170, 0, 1, 0, 14, 0x8fa39a, 7], [0, 175, 0, -1, 16, 0x9fae98, 5], [-10, 235, 0, -1, 14, 0xb8c2b4, 6]]);

  // ---------------------------------------------------------------- dressing
  const set = new T.Group(); scene.add(set);
  const pathMat = new T.MeshLambertMaterial({ map: tex.dirt_path_top, color: 0xf0d6a4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  decal(set, -40, 6, 40, 8.2, pathMat); decal(set, -14, -3.6, -9.6, -2.4, pathMat, 3.011); decal(set, 12.4, -4.6, 16, -3.4, pathMat, 3.011); decal(set, -.6, -6, .6, 6, pathMat, 3.011);
  const fence = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 2), ang = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= n; i++) texBox(set, [.22, 1.0, .22], [ax + (bx - ax) * i / n, 3.5, az + (bz - az) * i / n], M.oak);
    for (const y of [3.42, 3.8]) for (let i = 0; i < n; i++) texBox(set, [len / n, .11, .09], [ax + (bx - ax) * (i + .5) / n, y, az + (bz - az) * (i + .5) / n], M.oak, [0, -ang, 0]);
  };
  fence(1.6, -7.2, 1.6, -2.4); fence(1.6, -.6, 1.6, 4.2); // gate gap at z ≈ −1.5
  fence(-10, 4.6, -1.4, 4.6); fence(2.6, 4.6, 13, 4.6);
  // thatched roofs
  const thatch = (x0, x1, z0, z1) => {
    const cx = (x0 + x1 + 1) / 2, cz = (z0 + z1 + 1) / 2, w = x1 - x0 + 2.2, d = z1 - z0 + 1;
    for (let r = 0; r < 3; r++) for (const side of [-1, 1]) texBox(set, [w, .5, d / 2 - r * .6 + .3], [cx, 6.2 + r * .5, cz + side * (d / 4 + .3 - r * .3)], M.hay, [side * .32, 0, 0]);
    texBox(set, [w, .4, 1.1], [cx, 7.75, cz], M.hay);
  };
  thatch(-19, -14, -5, 0); thatch(16, 21, -6, -1);
  // the stump
  const stump = new T.Group(); stump.position.set(STUMP[0], 3, STUMP[1]); set.add(stump);
  texBox(stump, [.8, .55, .8], [0, .275, 0], M.log);
  const top = new T.Mesh(new T.PlaneGeometry(.8, .8), new T.MeshLambertMaterial({ map: tex.oak_log_top })); top.rotation.x = -Math.PI / 2; top.position.y = .551; top.receiveShadow = true; stump.add(top);
  for (const [dx, dz, ry] of [[.45, .1, 0], [-.42, -.2, .4], [.05, .45, 1.6], [-.1, -.46, 1.3]]) texBox(stump, [.32, .16, .16], [dx, .08, dz], M.log, [0, ry, 0]);
  // props
  const wicker = new T.MeshLambertMaterial({ map: tex.hay_block_side, color: 0xb08a55 });
  const basket = (at, full = false) => {
    const g = new T.Group(); g.position.set(...at); set.add(g);
    texBox(g, [.62, .42, .62], [0, .21, 0], wicker); box(g, [.5, .02, .5], [0, .425, 0], 0x4a3a28);
    const grain = texBox(g, [.54, .2, .54], [0, .48, 0], M.hay); grain.visible = full; g.grain = grain; return g;
  };
  const makeHoe = () => { const g = new T.Group(); box(g, [.06, 1.4, .06], [0, 0, 0], 0x7a5a38); box(g, [.08, .1, .08], [0, .68, 0], 0x55595d); box(g, [.08, .06, .34], [0, .72, -.15], 0x8d9296); return g; };
  const makeSickle = () => { const g = new T.Group(); box(g, [.05, .32, .05], [0, 0, 0], 0x7a5a38); box(g, [.04, .05, .3], [0, .18, -.12], 0x9aa0a4); box(g, [.04, .14, .05], [0, .12, -.27], 0x9aa0a4); return g; };
  const makeSack = () => { const g = new T.Group(); box(g, [.34, .36, .28], [0, .18, 0], new T.MeshLambertMaterial({ map: tex.white_wool, color: 0xd8c8a2 })); box(g, [.14, .1, .14], [0, .4, 0], 0x9e8a62); return g; };
  const makeCan = () => { const g = new T.Group(); box(g, [.28, .3, .22], [0, .15, 0], 0x7d8a8f); box(g, [.05, .05, .3], [0, .24, -.24], 0x7d8a8f).rotation.x = .6; box(g, [.04, .2, .2], [0, .36, .02], 0x5e686c); return g; };
  const bundle = () => { const g = new T.Group(); texBox(g, [.18, .62, .18], [0, .31, 0], M.hay); box(g, [.2, .05, .2], [0, .32, 0], 0x8a6a3a); set.add(g); return g; };
  for (let i = 0; i < 9; i++) { const m = texBox(set, [1.4, .28, .28], [-13.0, 3.14 + Math.floor(i / 3) * .28, -6.2 + (i % 3) * .3], M.log); m.rotation.set(0, Math.PI / 2, Math.PI / 2); }
  texBox(set, [.9, .9, .9], [15.2, 3.45, 0.4], M.hay); texBox(set, [.9, .9, .9], [15.0, 3.45, 1.4], M.hay); texBox(set, [.9, .8, .9], [15.1, 4.3, .9], M.hay, [0, .4, 0]);

  // ---------------------------------------------------------------- crops and weeds
  const cross = (mat, w = 1, h = 1) => { const g = new T.Group(); for (const r of [Math.PI / 4, -Math.PI / 4]) { const p = new T.Mesh(new T.PlaneGeometry(w, h), mat); p.rotation.y = r; p.position.y = h / 2; p.castShadow = true; p.receiveShadow = true; g.add(p); } return g; };
  const plantMat = (map, color = 0xffffff) => new T.MeshLambertMaterial({ map, color, alphaTest: .5, side: T.DoubleSide });
  const wheatMats = [0, 1, 2, 3, 4, 5, 6, 7].map(i => plantMat(tex[`wheat_stage_${i}`]));
  const weedMats = [plantMat(tex.short_grass, 0x7aa547), plantMat(tex.tall_grass_top, 0x6f9b40), plantMat(tex.short_grass, 0x8aa84e)];
  const crops = { mine: [], li: [] };
  const plant = (list, x, z, weedy) => {
    const jx = (rand(x, z, 11) - .5) * .2, jz = (rand(x, z, 12) - .5) * .2;
    const wheat = cross(wheatMats[0]); wheat.position.set(x + .5 + jx, 3, z + .5 + jz); wheat.rotation.y = rand(x, z, 13) * .6; set.add(wheat);
    const cell = { x: x + .5, z: z + .5, wheat, seed: rand(x, z, 14) };
    if (weedy) { const weed = cross(weedMats[Math.floor(rand(x, z, 15) * 3)], 1, 1); weed.position.set(x + .5 - jx * 2, 3, z + .5 - jz * 2); weed.rotation.y = rand(x, z, 16) * 1.5; set.add(weed); cell.weed = weed; }
    list.push(cell);
  };
  for (let x = MY_FIELD.x0; x <= MY_FIELD.x1; x++) for (let z = MY_FIELD.z0; z <= MY_FIELD.z1; z++) plant(crops.mine, x, z, true);
  for (let x = LI_FIELD.x0; x <= LI_FIELD.x1; x++) for (let z = LI_FIELD.z0; z <= LI_FIELD.z1; z++) plant(crops.li, x, z, false);
  /** Grow a cell's wheat to a stage (0..7, fractional = height between textures). */
  const setWheat = (cell, stage, scale = 1) => { const s = Math.max(0, Math.min(7, Math.round(stage))); cell.wheat.children.forEach(p => { p.material = wheatMats[s]; }); cell.wheat.scale.set(1, scale, 1); cell.wheat.visible = scale > .02; };
  const setWeed = (cell, k) => { if (!cell.weed) return; const s = Math.max(0, k); cell.weed.visible = s > .03; cell.weed.scale.set(.6 + s * .6, .2 + s * .72 * (.8 + cell.seed * .5), .6 + s * .6); };

  // dizzy stars over the rabbit, dust pool
  const stars = new T.Group(); set.add(stars);
  { const m = new T.MeshBasicMaterial({ color: 0xffe066, fog: false }); for (let i = 0; i < 5; i++) { const s = new T.Mesh(new T.BoxGeometry(.07, .07, .07), m); stars.add(s); } }
  const fireflies = []; { const m = new T.MeshBasicMaterial({ color: 0xfff1a0, fog: false }); for (let i = 0; i < 24; i++) { const f = new T.Mesh(new T.BoxGeometry(.05, .05, .05), m); scene.add(f); fireflies.push(f); } }

  return { ...stage, ...sky, groundAt, set, crops, setWheat, setWeed, basket, makeHoe, makeSickle, makeSack, makeCan, bundle, stars, fireflies };
}
