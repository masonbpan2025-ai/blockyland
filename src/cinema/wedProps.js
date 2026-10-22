// Three Islands, Three Weddings · the set pieces, shared by the key frames (weddingFrames.js) and the film (wedFilm.js):
// Chi-Chi's carrot farm, the festival lanterns, Bulma's gravity machine and its smoke, the tournament sign and ring, the
// cherry-blossom wedding arch, Buu's cake and the proposal fireworks. Every piece is built from the game's own block
// textures or small cubes, and adds itself to the `parent` it is given (a scene, or a film prop group).
import * as T from 'three';
import { blockTex, texBox } from './claudeStage.js';
import { cube } from './civCast.js';
import { glowMat } from './civFx.js';

export const mat = async (name, opts = {}) => new T.MeshLambertMaterial({ map: await blockTex(name), ...opts });
/** A carrot in the ground: an orange shoulder and a tuft of green leaves (this repo's crop textures are opaque squares). */
export function carrot(parent, at) {
  const g = new T.Group(); g.position.set(...at); parent.add(g);
  cube(g, [.16, .1, .16], [0, .05, 0], { all: '#f08a24' });
  for (const [dx, dz, h] of [[-.05, 0, .26], [.05, .03, .32], [0, -.05, .22]]) cube(g, [.07, h, .07], [dx, .1 + h / 2, dz], { all: '#4fa83a' });
  return g;
}
/** Chi-Chi's carrot farm: rows of farmland with carrots, n × m blocks from corner (x0, z0). Returns the carrots. */
export async function farm(parent, groundAt, x0, z0, n, m, { skip = () => false } = {}) {
  const soil = await mat('farmland_moist.png'), carrots = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const x = Math.floor(x0) + i + .5, z = Math.floor(z0) + j + .5, g = groundAt(x, z);
    texBox(parent, [1, .06, 1], [x, g + .03, z], soil);
    if (!skip(i, j)) for (const dx of [-.25, .25]) carrots.push(carrot(parent, [x + dx, g + .06, z + (i % 2 ? .1 : -.1)]));
  }
  return carrots;
}
/** A paper lantern on a short pole. `setLit(on)` switches its glow and light (the last lantern goes out). */
export function lantern(parent, at, lit = true) {
  const g = new T.Group(); g.position.set(...at); parent.add(g);
  cube(g, [.05, .5, .05], [0, .25, 0], { all: '#5a3c22' });
  const on = new T.MeshLambertMaterial({ color: 0xffb05a, emissive: 0xc8601a }), off = new T.MeshLambertMaterial({ color: 0x9a8a70 });
  const shade = new T.Mesh(new T.BoxGeometry(.24, .3, .24), lit ? on : off); shade.position.y = .65; shade.castShadow = true; g.add(shade);
  const light = new T.PointLight(0xffb070, lit ? 3 : 0, 6); light.position.set(0, .7, -.3); g.add(light);
  g.setLit = k => { shade.material = k > 0 ? on : off; on.emissive.setRGB(.78 * k, .38 * k, .1 * k); light.intensity = 3 * k; };
  return g;
}
/** Bulma's gravity machine: a steel box with a dial, a hatch and a status light (`setBroken` turns it red). */
export async function gravityMachine(parent, at, yaw = 0, { broken = false } = {}) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; parent.add(g);
  texBox(g, [2.2, 2, 2.2], [0, 1, 0], await mat('iron_block.png'));
  cube(g, [.9, 1.3, .04], [0, .75, -1.12], { all: '#3a3f4a' });
  const dial = new T.Mesh(new T.CircleGeometry(.22, 20), new T.MeshLambertMaterial({ color: 0xf2f0e6 })); dial.position.set(0, 1.6, -1.13); dial.rotation.y = Math.PI; g.add(dial);
  const red = glowMat(0xff3030, 1), green = glowMat(0x50ff80, 1);
  const lamp = new T.Mesh(new T.BoxGeometry(.2, .2, .2), broken ? red : green); lamp.position.set(0, 2.15, 0); g.add(lamp);
  g.setBroken = b => { lamp.material = b ? red : green; };
  return g;
}
/** Smoke: opaque grey puffs rising from a point (opaque, so they never re-sort and flicker as the lens moves).
 *  `g.at(t)` drifts them upward over time; scaled to 0 hides the column. */
export function smoke(parent, at, { n = 22, seed = 3 } = {}) {
  const g = new T.Group(); g.position.set(...at); parent.add(g);
  const r = i => Math.abs(Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1, m = new T.MeshLambertMaterial({ color: 0x77777e });
  const puffs = Array.from({ length: n }, (_, i) => { const p = new T.Mesh(new T.SphereGeometry(.4 + r(i) * .5, 10, 8), m); g.add(p); return { p, i, dx: (r(i + 5) - .5) * 1.2, dz: (r(i + 9) - .5) * 1.2 }; });
  g.at = t => { for (const { p, i, dx, dz } of puffs) { const k = ((t * .25 + i / n) % 1); p.position.set(dx * (1 + k), k * 4.5, dz * (1 + k) - k * .6); p.scale.setScalar(Math.sin(k * Math.PI) * (.8 + k)); } };
  g.at(0); return g;
}
/** A sign on two posts with painted letters on its +z face. */
export function sign(parent, at, yaw, text, { w = 3.2, h = .9, bg = '#e8d6a8', ink = '#7a2a1a' } = {}) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; parent.add(g);
  for (const s of [-1, 1]) cube(g, [.1, 1.6, .1], [s * (w / 2 - .2), .8, .1], { all: '#5a3c22' });
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w); const p = c.getContext('2d');
  p.fillStyle = bg; p.fillRect(0, 0, c.width, c.height); p.fillStyle = ink; p.font = `bold ${Math.round(Math.min(c.height * .42, c.width * 1.6 / text.length))}px "Arial Rounded MT Bold", Arial, sans-serif`; p.textAlign = 'center'; p.textBaseline = 'middle'; p.fillText(text, c.width / 2, c.height / 2);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
  const plain = new T.MeshLambertMaterial({ color: bg }), board = new T.Mesh(new T.BoxGeometry(w, h, .08), [plain, plain, plain, plain, new T.MeshLambertMaterial({ map: t }), plain]);
  board.position.y = 1.6; board.castShadow = true; g.add(board); return g;
}
/** A cherry-blossom wedding arch from the game's cherry log and leaves. */
export async function arch(parent, at, yaw = 0, span = 4.4, h = 3.6) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; parent.add(g);
  const log = await mat('cherry_log.png'), leaves = await mat('cherry_leaves.png', { color: 0xffd6ea, alphaTest: .4 });
  for (const s of [-1, 1]) texBox(g, [.4, h, .4], [s * span / 2, h / 2, 0], log);
  texBox(g, [span + 1.4, .9, 1.1], [0, h + .3, 0], leaves); texBox(g, [span - .6, .7, .9], [0, h + 1, 0], leaves);
  for (const s of [-1, 1]) texBox(g, [1, 1.4, 1], [s * span / 2, h - .3, 0], leaves);
  return g;
}
/** Buu's wedding cake: tiers of the game's cake, as tall as a house. Returns the height of the top. */
export async function weddingCake(parent, at, tiers = 4) {
  const side = await mat('cake_side.png'), top = await mat('cake_top.png'), bottom = await mat('cake_bottom.png');
  let y = at[1];
  for (let i = 0; i < tiers; i++) { const s = 2.6 - i * .55, h = .9; const m = texBox(parent, [s, h, s], [at[0], y + h / 2, at[2]], side); m.material = [side, side, top, bottom, side, side]; y += h; }
  cube(parent, [.3, .5, .3], [at[0], y + .25, at[2]], { all: '#ff9ad5' }); return y;
}
/** A stone tournament ring, raised a little, with red corner posts. Returns the height of its floor. */
export async function ring(parent, at, size = 12) {
  const stone = await mat('smooth_stone.png'), edge = await mat('stone_bricks.png');
  texBox(parent, [size, .6, size], [at[0], at[1] + .3, at[2]], edge); texBox(parent, [size - .4, .02, size - .4], [at[0], at[1] + .61, at[2]], stone);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) cube(parent, [.4, 1.4, .4], [at[0] + sx * size / 2, at[1] + .7, at[2] + sz * size / 2], { all: '#d6383f' });
  return at[1] + .62;
}
/** Fireworks: bursts of coloured sparks in the sky. Returns the bursts ({ points, light }) so a film can time them. */
export function fireworks(parent, bursts) {
  return bursts.map(([p, color, r = 6, n = 140]) => {
    const pos = [], rnd = (i, k) => Math.abs(Math.sin(i * 91.7 + k * 13.1 + p[0]) * 4375.5) % 1;
    for (let i = 0; i < n; i++) { const a = rnd(i, 1) * Math.PI * 2, b = Math.acos(rnd(i, 2) * 2 - 1), d = r * (.8 + rnd(i, 3) * .2); pos.push(Math.sin(b) * Math.cos(a) * d, Math.cos(b) * d, Math.sin(b) * Math.sin(a) * d); }
    const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    const points = new T.Points(geo, new T.PointsMaterial({ color, size: .5, transparent: true, opacity: .95, depthWrite: false, blending: T.AdditiveBlending })); points.position.set(...p); parent.add(points);
    const light = new T.PointLight(color, 40, r * 6); light.position.set(...p); parent.add(light);
    return { points, light };
  });
}
