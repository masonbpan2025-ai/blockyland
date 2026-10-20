// 1500 Players · the key frames, one per story beat. Each entry builds a scene and a camera, and may paint
// overlays (name tags, captions, subtitles, day cards, map pins, banners) in the documentary style.
import * as T from 'three';
import { blockTex } from './claudeStage.js';
import { nameTag, bigName, caption, subtitle, counters, dayCard, mapPin, recording, hud, banner, broadcast, fontsReady } from './civOverlay.js';
import { makeCharacter, posePlayer, cube } from './civCast.js';
import { buildWorld, SITES, ISLANDS, SEA } from './civWorld.js';
import { crowd, gather } from './civCrowd.js';
import { aura, energyBall, lightDome, nimbus, borderWall, snowfall, fairyLights, toyHammer, bread, cookies, ocelot, mailbox, thrusterTrain, railBridge, platform, sparkles, glowMat } from './civFx.js';

// ------------------------------------------------------------------ scene helpers
export const LOOKS = {
  golden: { top: 0x7fa8d8, horizon: 0xf6d9b0, glow: 0xffd9a0, sunColor: 0xffd7a8, sunI: 2.7, hemiSky: 0xdfe8ff, hemiGround: 0x8a6f52, hemiI: 1.15, fog: 0xf0d6b4 },
  day: { top: 0x6fa6e0, horizon: 0xdbeaf3, glow: 0xfff3d6, sunColor: 0xfff2dc, sunI: 2.4, hemiSky: 0xdcecff, hemiGround: 0x7d7a52, hemiI: 1.25, fog: 0xd8e6ef },
  blizzard: { top: 0xaab8c6, horizon: 0xdfe6ec, glow: 0xe8eef2, sunColor: 0xe7eef6, sunI: 1.0, hemiSky: 0xe6eef6, hemiGround: 0x8f9cab, hemiI: 1.7, fog: 0xd9e1e8 },
  cave: { top: 0x10141c, horizon: 0x10141c, glow: 0x000000, sunColor: 0x9fb4ff, sunI: .05, hemiSky: 0x4a5a8a, hemiGround: 0x1a1a24, hemiI: .45, fog: 0x0c1018 },
  doom: { top: 0x2c1640, horizon: 0x8a4f88, glow: 0xe07ad0, sunColor: 0xe0a8f0, sunI: 2.0, hemiSky: 0x9a7ab8, hemiGround: 0x3a2a40, hemiI: 1.1, fog: 0x6e4a78 },
  void: { top: 0x070a1a, horizon: 0x1c2140, glow: 0xffb070, sunColor: 0xffc890, sunI: 2.4, hemiSky: 0x8090c0, hemiGround: 0x20203a, hemiI: .9, fog: 0x141830 },
};
export const cam = (fov, pos, look) => { const c = new T.PerspectiveCamera(fov, 16 / 9, .1, 3000); c.position.set(...pos); c.lookAt(...look); return c; };
export function lights(scene, { sun = [30, 50, -40], target = [0, 0, 0], sunColor = 0xfff0d8, sunI = 3, hemiSky = 0xdcecff, hemiGround = 0x7d7a52, hemiI = 1.6, area = 20 } = {}) {
  const hemi = new T.HemisphereLight(hemiSky, hemiGround, hemiI), s = new T.DirectionalLight(sunColor, sunI);
  s.position.set(...sun); s.target.position.set(...target); s.castShadow = true; s.shadow.mapSize.set(4096, 4096); s.shadow.bias = -.0006; s.shadow.normalBias = area > 40 ? .3 : .06;
  Object.assign(s.shadow.camera, { left: -area, right: area, top: area, bottom: -area, near: 1, far: 600 }); s.shadow.camera.updateProjectionMatrix();
  scene.add(hemi, s, s.target); return { hemi, sun: s };
}
export function skyDome(scene, top, horizon, glow, sunDir, { stars = false } = {}) {
  const sky = new T.Mesh(new T.SphereGeometry(1400, 32, 16), new T.ShaderMaterial({
    side: T.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new T.Color(top) }, horizon: { value: new T.Color(horizon) }, glow: { value: new T.Color(glow) }, sunDir: { value: new T.Vector3(...sunDir).normalize() }, stars: { value: stars ? 1 : 0 } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position + cameraPosition, 1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sunDir; uniform float stars; varying vec3 vDir; float h(vec3 p){ return fract(sin(dot(floor(p * 260.), vec3(12.9898, 78.233, 37.719))) * 43758.5453); } void main(){ float y = clamp(vDir.y * 1.6 + .08, 0., 1.); vec3 c = mix(horizon, top, pow(y, .7)); float s = max(dot(vDir, sunDir), 0.); c += glow * (pow(s, 8.) * .45 + pow(s, 300.) * 1.4); if (stars > .5) { float st = h(vDir); c += vec3(step(.9965, st)) * .9 * smoothstep(-.1, .3, vDir.y); } gl_FragColor = vec4(c, 1.); }',
  })); sky.frustumCulled = false; scene.add(sky); return sky;
}
/** The island world with a named look; the sun comes from `sun` (a direction) and shadows cover `area` around `focus`. */
export async function islandScene(look = 'golden', { sun = [-.6, .45, .55], focus = [0, 20, 0], area = 60, fogNear = 90, fogFar = 600, stars } = {}) {
  const L = LOOKS[look], W = await buildWorld(), scene = new T.Scene();
  scene.add(W.group); skyDome(scene, L.top, L.horizon, L.glow, sun, { stars });
  scene.fog = new T.Fog(L.fog, fogNear, fogFar);
  const s = new T.Vector3(...sun).normalize();
  const { sun: light, hemi } = lights(scene, { sun: [focus[0] + s.x * 250, focus[1] + s.y * 250, focus[2] + s.z * 250], target: focus, sunColor: L.sunColor, sunI: L.sunI, hemiSky: L.hemiSky, hemiGround: L.hemiGround, hemiI: L.hemiI, area });
  return { scene, W, L, light, hemi };
}
export const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
/** Place a cast member on the terrain (or at q.y). */
export function actor(scene, W, id, x, z, q = {}) {
  const c = makeCharacter(id); scene.add(c.root);
  posePlayer(c, { x, z, y: q.y ?? (W ? W.groundAt(x, z) : 0), yaw: q.face ? yawTo([x, z], q.face) : q.yaw ?? 0, ...q }); return c;
}
export const topOf = (c, k = .3) => { const b = new T.Box3().setFromObject(c.root); return [(b.min.x + b.max.x) / 2, b.max.y + k, (b.min.z + b.max.z) / 2]; };
export const site = (W, name, dx = 0, dz = 0, dy = 0) => { const [x, z] = SITES[name]; return [x + dx, W.groundAt(x + dx, z + dz) + dy, z + dz]; };
export const tags = (ctx, project, list, size = 16) => list.forEach(([c, label]) => nameTag(ctx, project(topOf(c)), label ?? c.label, { size }));

/** A head-and-shoulders render of a cast member, for map pins (drawn onto a small canvas). */
const portraits = new Map();
export async function portrait(renderer, id) {
  if (portraits.has(id)) return portraits.get(id);
  const scene = new T.Scene(); scene.background = new T.Color(0x9fc7e8);
  scene.add(new T.HemisphereLight(0xffffff, 0x88aacc, 2.2)); const d = new T.DirectionalLight(0xffffff, 1.6); d.position.set(-2, 3, -4); scene.add(d);
  const c = makeCharacter(id); scene.add(c.root); posePlayer(c, { yaw: 0 });
  const b = new T.Box3().setFromObject(c.root), top = b.max.y, hy = top - Math.min(.55, (top - b.min.y) * .35);
  const camera = cam(30, [0, hy, -(top - hy) * 4.2 - .8], [0, hy, 0]);
  renderer.setRenderTarget(null); renderer.render(scene, camera);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128; const p = canvas.getContext('2d');
  p.drawImage(renderer.domElement, 640 - 230, 360 - 230, 460, 460, 0, 0, 128, 128);
  portraits.set(id, canvas); return canvas;
}
export const face = canvas => (ctx, x, y, s) => ctx.drawImage(canvas, x, y, s, s);
/** A map table prop: a wooden table with a parchment map of the islands and little coloured flags. */
export function mapTable(scene, at, yaw = 0) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; scene.add(g);
  cube(g, [2.6, .12, 1.6], [0, .9, 0], { all: '#6b4a2c' }); for (const [x, z] of [[-1.15, -.65], [1.15, -.65], [-1.15, .65], [1.15, .65]]) cube(g, [.12, .9, .12], [x, .45, z], { all: '#5a3c22' });
  cube(g, [2.3, .02, 1.36], [0, .97, 0], { all: (p, w, h) => { p.fillStyle = '#e8d6a8'; p.fillRect(0, 0, w, h); p.fillStyle = '#7fb0d8'; p.fillRect(0, 0, w, h); p.fillStyle = '#c96a3c'; p.beginPath(); p.arc(w * .3, h * .62, h * .26, 0, 7); p.fill(); p.fillStyle = '#e8f2f8'; p.beginPath(); p.arc(w * .72, h * .62, h * .24, 0, 7); p.fill(); p.fillStyle = '#6fae4a'; p.beginPath(); p.arc(w * .5, h * .26, h * .22, 0, 7); p.fill(); } }, { d: 48 });
  for (const [x, z, c] of [[-.5, .2, '#22336f'], [-.3, .3, '#22336f'], [.4, .3, '#7b3fa0'], [0, -.3, '#e8323a']]) { cube(g, [.02, .2, .02], [x, 1.07, z], { all: '#333' }); cube(g, [.1, .06, .01], [x + .05, 1.15, z], { all: c }); }
  return g;
}
/** Pocoyo's block tower: little coloured blocks stacked on the table. */
export function blockTower(scene, at, n = 5) { const g = new T.Group(); g.position.set(...at); scene.add(g); const cs = ['#e8323a', '#ffd23a', '#3d8fe0', '#5cc45a', '#f27fb7', '#ff8a1f']; for (let i = 0; i < n; i++) { const m = cube(g, [.16, .16, .16], [(i % 2) * .02, .08 + i * .16, 0], { all: cs[i % cs.length] }); m.rotation.y = i * .25; } return g; }
/** A Saiyan armour on a stand (the one Pato refuses to wear). */
export function armourStand(scene, at, yaw = 0) { const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; scene.add(g); cube(g, [.08, 1.3, .08], [0, .65, 0], { all: '#6b4a2c' }); cube(g, [.5, .02, .3], [0, .02, 0], { all: '#6b4a2c' }); cube(g, [.5, .5, .3], [0, 1.15, 0], { all: '#f4f2ea' }); for (const s of [-1, 1]) cube(g, [.18, .08, .32], [s * .3, 1.42, 0], { all: '#e8c04a' }); return g; }
/** Frieza's hover pod: a white bowl with a purple-tinted dome edge. */
export function hoverPod(scene, at, yaw = 0) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; scene.add(g);
  const bowl = new T.Mesh(new T.SphereGeometry(.85, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new T.MeshPhongMaterial({ color: 0xf2f0f4, shininess: 60, side: T.DoubleSide })); bowl.position.y = .85; bowl.castShadow = true; g.add(bowl);
  const rim = new T.Mesh(new T.TorusGeometry(.85, .06, 8, 32), new T.MeshLambertMaterial({ color: 0x7b3fa0 })); rim.rotation.x = Math.PI / 2; rim.position.y = .85; g.add(rim);
  return g;
}
/** A minecart (for the park's run down the hill). */
export function minecart(scene, at, yaw = 0) { const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; scene.add(g); cube(g, [.9, .1, 1.1], [0, .2, 0], { all: '#8a8a8a' }); for (const [x, z, w, d] of [[-.45, 0, .06, 1.1], [.45, 0, .06, 1.1], [0, -.55, .9, .06], [0, .55, .9, .06]]) cube(g, [w, .5, d], [x, .45, z], { all: '#6e6e6e' }); return g; }
/** Gabby's fortress: rings of pink and purple walls with towers and banners. */
export function fortress(scene, center, y) {
  const g = new T.Group(); g.position.set(center[0], y, center[1]); scene.add(g);
  const wall = (r, h, c1, c2) => { for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .18) continue; const m = cube(g, [r * .14, h, .8], [Math.cos(a) * r, h / 2, Math.sin(a) * r], { all: i % 2 ? c1 : c2 }); m.rotation.y = -a + Math.PI / 2; if (i % 2 === 0) cube(g, [.6, .6, .6], [Math.cos(a) * r, h + .3, Math.sin(a) * r], { all: c1 }); } };
  wall(9, 3.2, '#f27fb7', '#e05aa0'); wall(5.4, 5.2, '#a254e8', '#8a3fd0');
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3, x = Math.cos(a) * 9, z = Math.sin(a) * 9; cube(g, [1.4, 6, 1.4], [x, 3, z], { all: '#f6c3dc' }); const roof = new T.Mesh(new T.ConeGeometry(1.1, 1.8, 4), new T.MeshLambertMaterial({ color: 0xa254e8 })); roof.position.set(x, 6.9, z); roof.rotation.y = Math.PI / 4; g.add(roof); cube(g, [.05, 1.4, .05], [x, 8.4, z], { all: '#fff' }); cube(g, [.6, .4, .03], [x + .3, 8.9, z], { all: '#ffd23a' }); }
  return g;
}

export const ALL = ['gi', 'saiyan', 'purpleGi', 'pocoyo', 'elly', 'pato', 'nina', 'gabby', 'panda', 'cat', 'cakey', 'bulma', 'buu', 'soldier', 'frieza'];

// ------------------------------------------------------------------ cast sheets
export async function grassFloor(scene, w = 40, d = 30) {
  const top = await blockTex('grass_block_top.png'), side = await blockTex('grass_block_side.png');
  const mTop = new T.MeshLambertMaterial({ map: top, color: 0x7fbf55 }), mSide = new T.MeshLambertMaterial({ map: side });
  const geo = new T.BoxGeometry(1, 1, 1), g = new T.InstancedMesh(geo, [mSide, mSide, mTop, mSide, mSide, mSide], w * d); g.receiveShadow = true;
  let i = 0; const M = new T.Matrix4(); for (let x = -w / 2; x < w / 2; x++) for (let z = -d / 2; z < d / 2; z++) g.setMatrixAt(i++, M.makeTranslation(x + .5, -.5, z + .5));
  scene.add(g); return g;
}
export function castFrame(ids, title, { spacing = 1.35, fov = 34, camY = 1.5 } = {}) {
  return {
    title,
    async build() {
      await fontsReady;
      const scene = new T.Scene(); skyDome(scene, 0x86b9e3, 0xf6e6cf, 0xfff2c8, [.4, .35, -1]);
      lights(scene, { sun: [-14, 22, -20], area: 12, hemiI: 1.4, sunI: 2.6 }); await grassFloor(scene, 40, 24);
      const n = ids.length, chars = ids.map((id, i) => actor(scene, null, id, -(-(n - 1) * spacing / 2 + i * spacing), 0, { y: 0, yaw: 0, headYaw: (i - (n - 1) / 2) * .04 }));
      const half = (n - 1) * spacing / 2 + .9, hfov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 16 / 9), dist = half / Math.tan(hfov / 2);
      const camera = cam(fov, [0, camY + dist * .06, -dist], [0, .8, 0]);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, chars.map(c => [c]), 15); caption(ctx, title, { size: 30, y: 700 }); } };
    },
  };
}

// ------------------------------------------------------------------ the beats
export const FRAMES = {
  'cast-saiyans': castFrame(['goku', 'goku_ssj', 'vegeta', 'gohan', 'goten', 'trunks', 'krillin', 'yamcha'], 'Cast · Dragon Ball: the fighters', { spacing: 1.2 }),
  'cast-db': castFrame(['bulma', 'drbriefs', 'videl', 'buu', 'frieza', 'soldier', 'polarbear'], 'Cast · Dragon Ball: friends & foes', { spacing: 1.45 }),
  'cast-pocoyo': castFrame(['pocoyo', 'elly', 'pato', 'loula', 'nina'], 'Cast · Pocoyo', { spacing: 1.4, camY: 1.1 }),
  'cast-gabby': castFrame(['gabby', 'pandy', 'cakey', 'mercat', 'babybox', 'djcatnip', 'carlita'], "Cast · Gabby's Dollhouse", { spacing: 1.2, camY: 1.1 }),

  '01-lobby': {
    title: 'Cold open · The server clock strikes zero', time: '0:00',
    async build() {
      await fontsReady; const scene = new T.Scene(); scene.background = new T.Color(0xe9edf3); scene.fog = new T.Fog(0xe9edf3, 30, 120);
      lights(scene, { sun: [-20, 40, -30], area: 30, hemiSky: 0xffffff, hemiGround: 0xc9d0da, hemiI: 1.5, sunI: 1.4 });
      const top = await blockTex('white_concrete.png').catch(() => null), floorMat = new T.MeshLambertMaterial({ color: 0xf2f4f7, map: top });
      if (top) { top.repeat.set(300, 300); }
      const floor = new T.Mesh(new T.PlaneGeometry(300, 300), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
      scene.add(crowd(gather(1500, { center: [0, 52], radius: 42, inner: 4, face: [0, -30], seed: 3, mix: ALL })));
      sparkles(scene, [0, 0, 40], { n: 400, radius: 34, height: 5 });
      const heroes = [['pocoyo', 1.8, -3.6], ['goku', 0, -2.6], ['gabby', -1.8, -3.4], ['vegeta', 3.6, -1.6], ['pato', -3.6, -2.4], ['frieza', -5.6, -.4], ['pandy', 5.6, -.6], ['buu', 7.6, 1.6], ['elly', -7.6, 1.4]];
      const chars = heroes.map(([id, x, z]) => actor(scene, null, id, x, z, { y: 0, face: [0, -14] }));
      const camera = cam(46, [0, 1.7, -11], [0, 2.1, 8]);
      return { scene, camera, bloom: [.25, .5, .92], overlay: (ctx, { project }) => { tags(ctx, project, chars.map(c => [c]), 17); subtitle(ctx, '服务器时钟归零。1500 名玩家同时出现在一片白色虚空中。', 'The server clock struck zero. 1,500 players appeared at once.'); } };
    },
  },

  '02-map': {
    title: 'The map · Three islands, 500 players each', time: '0:20',
    async build({ renderer }) {
      await fontsReady; const { scene } = await islandScene('day', { sun: [.3, .9, .4], focus: [0, 12, -10], area: 200, fogNear: 700, fogFar: 1600 });
      const heads = { hot: await portrait(renderer, 'vegeta'), cold: await portrait(renderer, 'frieza'), temperate: await portrait(renderer, 'pocoyo') };
      const camera = cam(38, [0, 470, 70], [0, 0, -12]);
      return { scene, camera, bloom: [.2, .5, .97], overlay: (ctx, { project }) => {
        for (const [name, label] of [['hot', 'HOT ISLAND'], ['cold', 'COLD ISLAND'], ['temperate', 'TEMPERATE ISLAND']]) { const I = ISLANDS[name]; mapPin(ctx, project([I.c[0], 20, I.c[1] - 8]), '500 Players', face(heads[name]), { size: 64, sub: label }); }
        subtitle(ctx, '三座岛：炎热、寒冷、温和。三部动画的角色被精心打散分配。', 'Three islands. Three cartoons. Mixed with ruthless political calculation.');
      } };
    },
  },

  '03-day1': {
    title: 'DAY 1 card', time: '0:40',
    async build() {
      await fontsReady; const { scene } = await islandScene('golden', { sun: [-.7, .32, .35], focus: [-90, 20, 55], area: 70 });
      const camera = cam(42, [-30, 62, 120], [-92, 18, 52]);
      return { scene, camera, grade: 'blur(5px) saturate(1.1) brightness(1.05)', overlay: ctx => { dayCard(ctx, 'DAY 1'); counters(ctx, [500, 500, 500]); } };
    },
  },

  '04-outpost': {
    title: 'Hot Island · The Capsule Corp desert outpost', time: '1:00',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [-.75, .38, -.2], focus: [-82, 16, 84], area: 30 });
      const [ox, oz] = SITES.outpost, c0 = [ox + 1, oz + 14];
      const chars = [actor(scene, W, 'bulma', c0[0] - 2.2, c0[1] - .6, { face: [c0[0] - 2, c0[1] - 4], armR: [-1.2, .1], headYaw: .5 }), actor(scene, W, 'drbriefs', c0[0] - 3.8, c0[1] + .4, { face: [c0[0] - 2, c0[1] - 4], headYaw: .4 }),
        actor(scene, W, 'gabby', c0[0] + .2, c0[1] + .6, { face: [c0[0] + 8, c0[1] + 8], armL: [-1.6, -.3] }), actor(scene, W, 'pandy', c0[0] + 1.6, c0[1] + 1.4, { face: [c0[0] + 8, c0[1] + 8] }), actor(scene, W, 'cakey', c0[0] + 2.8, c0[1] - .2, { face: [c0[0] + 8, c0[1] + 8] })];
      scene.add(crowd(gather(24, { center: [ox - 6, oz + 4], radius: 7, inner: 6, groundAt: W.groundAt, face: [ox, oz], seed: 8, mix: ['gi', 'gabby', 'bulma', 'cat', 'panda'] })));
      mailbox(scene, [c0[0] + 1.6, W.groundAt(c0[0] + 1.6, c0[1] - 1.2), c0[1] - 1.2], yawTo([c0[0] + 1.6, c0[1] - 1.2], [c0[0] + 6, c0[1] + 7]));
      const cp = [c0[0] + 4.5, c0[1] + 7.5], camera = cam(46, [cp[0], W.groundAt(...c0) + 3.6, cp[1]], [c0[0] - 1.5, W.groundAt(...c0) + 1.2, c0[1] - 2]);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, chars.map(c => [c])); nameTag(ctx, project([c0[0] + 1.6, W.groundAt(...c0) + 2, c0[1] - 1.2]), 'Meow Meow Mailbox', { size: 14 }); caption(ctx, 'Solar-powered water condensers'); } };
    },
  },

  '05-war-room': {
    title: "Hot Island · Vegeta's war room, invaded by toddlers", time: '1:30',
    async build() {
      await fontsReady; const [vx, vz] = SITES.vegetaMesa; const { scene, W } = await islandScene('golden', { sun: [-.6, .45, -.6], focus: [vx, 40, vz - 8], area: 18 });
      const tz = vz - 8, g = W.groundAt(vx, tz);
      mapTable(scene, [vx, g, tz]); blockTower(scene, [vx - .4, g + .98, tz - .1], 6);
      armourStand(scene, [vx + 3.3, g, tz - .4], -.5);
      const cam0 = [vx - 2.6, tz - 5.6];
      const veg = actor(scene, W, 'vegeta', vx + .6, tz + 1.5, { y: g, face: [vx - .4, tz], armL: [-.5, -.7], armR: [-1.2, .3], lean: .15 });
      const poc = actor(scene, W, 'pocoyo', vx - 1.6, tz - .7, { y: g, face: [vx - .4, tz], armR: [-1.5, .2], armL: [-1.3, -.2] });
      const pato = actor(scene, W, 'pato', vx + 2.4, tz - 1.4, { y: g, face: cam0, armL: [-1.1, -.95], armR: [-1.1, .95] });
      const elly = actor(scene, W, 'elly', vx - 2.6, tz + .8, { y: g, face: [vx - .4, tz], armR: [-2.6, .3] });
      const grunts = gather(30, { center: [vx + .5, tz + 6], radius: 4, groundAt: () => g, face: [vx - 1.6, tz - .7], seed: 5, mix: ['saiyan', 'gi', 'purpleGi'] }).map((p, i) => ({ ...p, armUp: i % 3 === 0 ? 1 : i % 3 === 1 ? 2 : 0 }));
      scene.add(crowd(grunts));
      const camera = cam(44, [cam0[0], g + 2.1, cam0[1]], [vx + .2, g + 1.2, tz + .8]);
      return { scene, camera, overlay: (ctx, { project }) => { bigName(ctx, project(topOf(veg, .6)), 'Vegeta', 38); tags(ctx, project, [[poc], [pato], [elly]]); caption(ctx, '"I am the Prince of All Hot Island Wastes!"', { size: 34 }); } };
    },
  },

  '06-ice-palace': {
    title: "Cold Island · Frieza's Ice Sanctuary in the blizzard", time: '2:10',
    async build() {
      await fontsReady; const [px, pz] = SITES.palace; const { scene, W } = await islandScene('blizzard', { sun: [-.3, .6, .5], focus: [px, 30, pz], area: 40, fogNear: 20, fogFar: 230 });
      const g = W.groundAt(px, pz);
      const camera = cam(44, [px - 30, g + 18, pz + 42], [px, g + 14, pz]);
      scene.add(crowd(gather(14, { center: [px, pz + 16], radius: 3, groundAt: W.groundAt, face: [px, pz + 30], seed: 4, costume: 'soldier' })));
      snowfall(scene, camera, { n: 5000, depth: 60, spread: 60, size: .16 });
      return { scene, camera, grade: 'saturate(.9) contrast(1.02) brightness(1.02)', overlay: (ctx, { project }) => { nameTag(ctx, project([px, g + 44, pz - 2]), "Frieza's Ice Sanctuary", { size: 18 }); caption(ctx, 'He hoarded every scrap of wheat and mutton.'); } };
    },
  },

  '07-grotto': {
    title: "Cold Island · MerCat's glowing spa grotto", time: '2:40',
    async build() {
      await fontsReady; const W = await buildWorld(); const [gx, gz] = SITES.grotto, F0 = SITES.grottoFloor;
      const { scene } = await islandScene('cave', { sun: [.2, .9, .1], focus: [gx, F0, gz], area: 12, fogNear: 8, fogFar: 50 });
      const mer = actor(scene, W, 'mercat', gx - 3, gz + 1, { y: F0 - 1.2, face: [gx - 6, gz + 2], armR: [-2.4, .4] });
      const box = actor(scene, W, 'babybox', gx + 1.8, gz - 2.4, { y: F0, face: [gx - 6, gz + 2], armR: [-2.8, .2], armL: [-2.8, -.2] });
      const dj = actor(scene, W, 'djcatnip', gx + 3.2, gz + 2, { y: F0, face: [gx - 6, gz + 1], armL: [-1.2, -.3], armR: [-1.2, .3] });
      cube(scene, [1.2, .7, .6], [gx + 3.2, F0 + .35, gz + 1.2], { all: '#2b2b33', top: (p, w, h) => { p.fillStyle = '#2b2b33'; p.fillRect(0, 0, w, h); p.fillStyle = '#a254e8'; p.fillRect(w * .1, h * .2, w * .35, h * .6); p.fillRect(w * .55, h * .2, w * .35, h * .6); } });
      actor(scene, W, 'soldier', gx + 3, gz - 1.6, { y: F0 - 1, face: [gx, gz] }); actor(scene, W, 'krillin_leather', gx + .8, gz + 3.2, { y: F0 - 1, face: [gx - 2, gz] });
      for (const [a, b] of [[[gx - 6, F0 + 5.2, gz - 3.5], [gx + 6, F0 + 5.4, gz - 3]], [[gx - 6, F0 + 5, gz + 3.5], [gx + 6, F0 + 5.2, gz + 3]], [[gx - 4, F0 + 5.8, gz - 4], [gx - 2, F0 + 5.8, gz + 4]], [[gx + 2, F0 + 5.8, gz - 4], [gx + 4, F0 + 5.8, gz + 4]]]) fairyLights(scene, a, b, { n: 20, sag: 1 });
      for (const [dx, dz] of [[-3, 1], [3, -2], [1, 3]]) { const l = new T.PointLight(0x5ff0ff, 12, 8); l.position.set(gx + dx, F0 - .2, gz + dz); scene.add(l); }
      const amb = new T.PointLight(0xffb070, 16, 18); amb.position.set(gx - 2, F0 + 4, gz); scene.add(amb);
      const camera = cam(58, [gx - 5.6, F0 + 2.4, gz + 2.2], [gx + 2.5, F0 + 1.1, gz - .4]);
      return { scene, camera, bloom: [.8, .6, .6], overlay: (ctx, { project }) => { tags(ctx, project, [[mer], [box], [dj]]); caption(ctx, 'Spa grottos to keep morale afloat'); } };
    },
  },

  '08-goku-cold': {
    title: 'Cold Island · The Z-Fighter Resistance (and the Narrator)', time: '3:10',
    async build() {
      await fontsReady; const [kx, kz] = SITES.goku; const { scene, W } = await islandScene('blizzard', { sun: [-.4, .5, -.6], focus: [kx, 25, kz], area: 20, fogNear: 10, fogFar: 140 });
      const camP = [kx - 1.6, kz - 6.6], shiver = { armL: [-.9, .55], armR: [-.9, -.55], headPitch: .15 };
      const goku = actor(scene, W, 'goku_leather', kx, kz, { face: camP, ...shiver, headYaw: .35 });
      const kri = actor(scene, W, 'krillin_leather', kx - 1.6, kz + .9, { face: camP, ...shiver });
      const yam = actor(scene, W, 'yamcha_leather', kx + 1.5, kz + 1.2, { face: [kx + 3, kz + 9], ...shiver });
      actor(scene, W, 'polarbear', kx + 4.5, kz + 9, { face: [kx, kz] });
      const camera = cam(40, [camP[0], W.groundAt(...camP) + 1.6, camP[1]], [kx + .6, W.groundAt(kx, kz) + 1.25, kz + 1]);
      snowfall(scene, camera, { n: 2500, depth: 34, spread: 26, size: .06 });
      return { scene, camera, grade: 'saturate(.9) brightness(1.02)', overlay: (ctx, { project }) => { tags(ctx, project, [[goku], [kri], [yam]]); subtitle(ctx, '旁白：悟空饿了。悟空非常非常冷。悟空会找到土豆吗？不，悟空找到了一只僵尸。', 'NARRATOR: Goku is hungry. Goku is very, very cold. Will Goku find a potato?'); } };
    },
  },

  '09-temperate': {
    title: "Temperate Island · Buu's Bakery: free pastries for every faction", time: '3:50',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('day', { sun: [.5, .55, .7], focus: [-28, 20, -60], area: 24 });
      const [bx, bz] = SITES.bakery, door = [bx, bz + 6.6];
      const buu = actor(scene, W, 'buu', door[0] - .4, door[1] + .2, { face: [bx + 3, bz + 14], armR: [-1.5, .25] }); cookies(scene, [door[0] - .8, W.groundAt(...door) + 1.32, door[1] - .4]);
      const line = Array.from({ length: 14 }, (_, i) => ({ x: bx + 1.4 + i * .85, z: bz + 8.2 + i * .45 + Math.sin(i * .9) * .3 })).map(p => ({ ...p, yaw: yawTo([p.x, p.z], door), y: W.groundAt(p.x, p.z) }));
      scene.add(crowd(line, { mix: ['gi', 'pocoyo', 'gabby', 'soldier', 'cat', 'saiyan', 'elly', 'frieza'], seed: 12 }));
      const goten = actor(scene, W, 'goten', bx + .6, bz + 8, { face: [door[0] - .4, door[1]], armR: [-1.6, .2] });
      const cp = [bx - 4, bz + 14], camera = cam(46, [cp[0], W.groundAt(...door) + 2.8, cp[1]], [bx + 1.5, W.groundAt(...door) + 2, bz + 7]);
      return { scene, camera, overlay: (ctx, { project }) => { bigName(ctx, project(topOf(buu, .5)), 'Majin Buu', 34); tags(ctx, project, [[goten]]); nameTag(ctx, project([bx, W.groundAt(bx, bz) + 18.5, bz + 6]), "Buu's Bakery · free cookies", { size: 16 }); caption(ctx, 'Free pastries for anyone, from any faction'); } };
    },
  },

  '10-cafe': {
    title: 'Temperate Island · Caffeine Paws cat café', time: '4:20',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [.6, .4, .7], focus: [24, 20, -62], area: 16 });
      const [cx, cz] = SITES.cafe, ty = W.groundAt(cx, cz + 7.5), tbl = [cx - 1.5, cz + 7.6];
      cube(scene, [1.4, .08, 1.1], [tbl[0], ty + .8, tbl[1]], { all: '#f1e4c8' }); cube(scene, [.12, .8, .12], [tbl[0], ty + .4, tbl[1]], { all: '#5a3c22' });
      for (const s of [-1, 1]) cube(scene, [.5, .45, .5], [tbl[0] + s * 1.15, ty + .22, tbl[1]], { all: '#a8743c' });
      const gohan = actor(scene, W, 'gohan', tbl[0] - 1.15, tbl[1], { y: ty, face: [tbl[0] + 5, tbl[1]], sit: true, seat: ty + .5, armL: [-1.25, -.1], armR: [-1.25, .1], headPitch: .35 });
      const videl = actor(scene, W, 'videl', tbl[0] + 1.15, tbl[1], { y: ty, face: [tbl[0] - 5, tbl[1]], sit: true, seat: ty + .5, armR: [-1.2, .2] });
      cube(scene, [.5, .04, .36], [tbl[0] - .3, ty + .86, tbl[1]], { all: '#ffffff', top: (p, w, h) => { p.fillStyle = '#fff'; p.fillRect(0, 0, w, h); p.fillStyle = '#666'; for (let i = 1; i < 6; i++) p.fillRect(2, i * h / 6, w - 4, 1); } });
      const gab = actor(scene, W, 'gabby', tbl[0] + .2, tbl[1] - 1.6, { y: ty, face: [tbl[0] + 1, tbl[1] + 6], armR: [-1.4, .2] }); cookies(scene, [tbl[0] + .4, ty + .9, tbl[1] + .2], 3);
      const cak = actor(scene, W, 'cakey', tbl[0] + 2.6, tbl[1] - 1.2, { y: ty, face: [tbl[0] + 2, tbl[1] + 6] });
      ocelot(scene, [tbl[0] + .5, ty + .84, tbl[1] - .3], 2.2); ocelot(scene, [tbl[0] + 3.6, ty, tbl[1] + 1.2], -2); ocelot(scene, [tbl[0] - 2.8, ty, tbl[1] + 1.4], .6);
      const cp = [tbl[0] + 3.4, tbl[1] + 8.4], camera = cam(44, [cp[0], ty + 2.8, cp[1]], [tbl[0] - .4, ty + 1.8, tbl[1] - 2]);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[gohan], [videl], [gab], [cak]]); nameTag(ctx, project([cx, ty + 9.5, cz]), 'Caffeine Paws', { size: 18 }); caption(ctx, 'Real ocelots. Magical cat-ears for every visitor.'); } };
    },
  },

  '11-borders-locked': {
    title: 'DAY 7 · The factions map, borders still locked', time: '4:50',
    async build({ renderer }) {
      await fontsReady; const { scene } = await islandScene('day', { sun: [.3, .9, .4], focus: [0, 12, -10], area: 200, fogNear: 700, fogFar: 1600 });
      const pins = [['bulma', SITES.outpost, 'Capsule Corp Outpost', [0, 0]], ['vegeta', SITES.vegetaMesa, 'Saiyan-Pocoyo Accord', [0, 0]], ['frieza', SITES.palace, 'Ice Sanctuary', [0, -6]], ['goku', SITES.goku, 'Z-Fighters', [-6, 6]], ['mercat', SITES.grotto, 'Spa Grotto', [10, 8]],
        ['buu', SITES.bakery, 'Buu Bakery', [-8, 0]], ['gabby', SITES.cafe, 'Caffeine Paws', [8, 4]], ['pocoyo', SITES.park, 'Pocoyo Park', [0, 10]], ['gohan', SITES.plateau, 'Central Plateau', [0, -14]]];
      const heads = {}; for (const [id] of pins) heads[id] = await portrait(renderer, id);
      const camera = cam(38, [0, 470, 70], [0, 0, -12]);
      return { scene, camera, bloom: [.2, .5, .97], overlay: (ctx, { project }) => {
        ctx.save(); ctx.strokeStyle = 'rgba(255,60,60,.9)'; ctx.lineWidth = 3; ctx.setLineDash([12, 8]);
        for (const I of Object.values(ISLANDS)) { const r = I.r + 8, pts = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([dx, dz]) => project([I.c[0] + dx, SEA, I.c[1] + dz])); ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(...p) : ctx.moveTo(...p)); ctx.closePath(); ctx.stroke(); }
        ctx.restore();
        for (const [id, [x, z], label, [dx, dz]] of pins) mapPin(ctx, project([x + dx, 20, z + dz]), label, face(heads[id]), { size: 38 });
        counters(ctx, [488, 497, 431]); caption(ctx, 'DAY 7 · the borders are still locked', { size: 30 });
      } };
    },
  },

  '12-borders-down': {
    title: 'DAY 8 · Borders down: Goku crosses the ocean on the Flying Nimbus', time: '5:20',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [-.5, .35, .8], focus: [40, 30, 20], area: 20 });
      const p = [40, SEA + 14, 16], heading = -2.2; // flying north-west, toward the Cold Island's palace
      const cloud = nimbus(scene, [p[0], p[1], p[2]], 1.2); cloud.rotation.y = heading;
      const goku = actor(scene, W, 'goku', p[0], p[2], { y: p[1] + .12, yaw: heading + Math.PI, legL: -.25, legR: .25, armR: [-2.7, .4], armL: [-.4, -.3] });
      actor(scene, W, 'gohan', p[0] - 10, p[2] + 12, { y: p[1] + 5, yaw: heading + Math.PI, fly: true, flyLean: .9, armL: [-3, -.2], armR: [.3, .2] }); aura(scene, [p[0] - 10, p[1] + 4.6, p[2] + 12], { color: 0xffffff, h: 2.2, r: .7 });
      for (let i = 0; i < 70; i++) { const m = new T.Mesh(new T.PlaneGeometry(2 + Math.random() * 2, 2 + Math.random() * 3), glowMat(0xff5050, .25)); m.position.set(18 + Math.random() * 3, SEA + 5 + Math.random() * 50, -30 + Math.random() * 120); m.rotation.y = Math.PI / 2; scene.add(m); }
      const f = [-Math.sin(heading + Math.PI), -Math.cos(heading + Math.PI)]; // Goku's facing direction
      const camera = cam(40, [p[0] + f[0] * 6 + 2, p[1] + 2.2, p[2] + f[1] * 6 - 1], [p[0], p[1] + 1.1, p[2]]);
      return { scene, camera, overlay: (ctx, { project }) => { bigName(ctx, project(topOf(goku, .7)), 'Goku', 44); banner(ctx, 'WORLD BORDER DISABLED', 'Day 8 · anything is possible', { color: '#7dff9a' }); } };
    },
  },

  '13-crash': {
    title: "Cold Island · Goku crash-lands in Frieza's throne hall", time: '5:40',
    async build() {
      await fontsReady; const [px, pz] = SITES.palace; const { scene, W } = await islandScene('blizzard', { sun: [-.2, .8, -.5], focus: [px, 30, pz], area: 20, fogNear: 30, fogFar: 200 });
      const K = SITES.keep, g = W.groundAt(px, pz - 3) + 1, hole = [px, K.z0];
      hoverPod(scene, [px + .6, g, pz - 1], 0);
      const frieza = actor(scene, W, 'frieza', px + .6, pz - 1, { y: g + .25, yaw: 0, headYaw: 1.0, headPitch: -.15, armL: [-1.6, -.7], armR: [-1.2, .5] });
      actor(scene, W, 'soldier', px - 3.2, pz - .4, { y: g, face: hole, armR: [-1.7, .3] }); actor(scene, W, 'soldier', px + 4, pz - 2.6, { y: g, face: hole, armL: [-1.8, -.3] });
      const goku = actor(scene, W, 'goku_leather', px - .4, K.z0 + 2.2, { y: g + 2.6, yaw: Math.PI, fly: true, flyLean: .6, armL: [-2.9, -.2], armR: [-2.9, .2] }); aura(scene, [px - .4, g + 1.8, K.z0 + 2.2], { color: 0xffffff, r: .9 });
      const ice = new T.MeshLambertMaterial({ color: 0x9fd6ff, emissive: 0x1a3550 });
      for (let i = 0; i < 60; i++) { const s = .2 + Math.random() * .6, side = i % 2 ? 1 : -1, m = new T.Mesh(new T.BoxGeometry(s, s, s), ice); m.position.set(px - .4 + side * (1.6 + Math.random() * 4), g + .3 + Math.random() * 7, K.z0 + Math.random() * 6); m.rotation.set(Math.random() * 3, Math.random() * 3, 0); m.castShadow = true; scene.add(m); }
      const flash = new T.Mesh(new T.SphereGeometry(3.5, 24, 12), glowMat(0xdff2ff, .3)); flash.position.set(px, g + 4, K.z0); scene.add(flash);
      const l = new T.PointLight(0xdff2ff, 50, 30); l.position.set(px, g + 4, K.z0 + 2); scene.add(l);
      const camera = cam(52, [px + 5, g + 1.9, K.z1 - 1.4], [px - .4, g + 2.6, K.z0 + 1]);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[frieza]]); bigName(ctx, project(topOf(goku, .4)), 'Goku', 34); caption(ctx, 'The north wall did not survive.'); } };
    },
  },

  '14-trade': {
    title: "Trade routes · Vegeta's thruster train to Buu's Bakery; the Meow Meow Mailbox", time: '6:10',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [-.8, .35, .3], focus: [-52, 20, -4], area: 30 });
      const a = [-58, 10], b = [-36, -40], y = SEA + 5;
      railBridge(scene, a, b, y);
      const k = .3, tx = a[0] + (b[0] - a[0]) * k, tz = a[1] + (b[1] - a[1]) * k, yaw = Math.atan2(a[0] - b[0], a[1] - b[1]);
      thrusterTrain(scene, [tx, y + .2, tz], yaw, 4);
      const fwd = [-Math.sin(yaw), -Math.cos(yaw)];
      const veg = actor(scene, W, 'vegeta', tx, tz, { y: y + 1.75, yaw: yaw + Math.PI, armL: [-.4, -.6], armR: [-.4, .6] });
      const elly = actor(scene, W, 'elly', tx - fwd[0] * 3.4 - .4, tz - fwd[1] * 3.4, { y: y + 2.3, yaw: yaw + Math.PI, armR: [-2.8, .3] });
      const pato = actor(scene, W, 'pato', tx - fwd[0] * 3.4 + .5, tz - fwd[1] * 3.4, { y: y + 2.3, yaw: yaw + Math.PI, armL: [-2.8, -.3] });
      const cp = [tx - 13, tz + 1.5], camera = cam(44, [cp[0], y + 3.2, cp[1]], [tx + 1, y + 1.6, tz - 1]);
      return { scene, camera, overlay: (ctx, { project }) => { bigName(ctx, project(topOf(veg, .6)), 'Vegeta', 34); tags(ctx, project, [[elly], [pato]]); caption(ctx, 'A freight line powered by Saiyan thrusters'); } };
    },
  },

  '15-photobomb': {
    title: "Espionage · Frieza's secret meeting, photobombed on world broadcast", time: '6:40',
    async build() {
      await fontsReady; const [mx, mz] = SITES.meetingHall; const { scene, W } = await islandScene('golden', { sun: [-.6, .5, -.5], focus: [mx, 30, mz], area: 14 });
      const g = W.groundAt(mx, mz);
      cube(scene, [1.4, .5, .9], [mx, g + .25, mz + 2.2], { all: '#5a2d82' }); cube(scene, [1.4, 2, .2], [mx, g + 1, mz + 2.75], { all: '#7b3fa0' }); // the throne
      const frieza = actor(scene, W, 'frieza', mx, mz + 2.1, { y: g, yaw: 0, sit: true, seat: g + .55, armR: [-1.1, .3], headYaw: .2 });
      actor(scene, W, 'soldier', mx - 1.6, mz - 1.4, { y: g, face: [mx, mz + 2] }); actor(scene, W, 'yamcha', mx + 1.7, mz - 1.2, { y: g, face: [mx, mz + 2] });
      cube(scene, [1, .6, .6], [mx + 1.8, g + .3, mz + .6], { all: '#6b4a2c' }); for (let i = 0; i < 3; i++) { const b = cube(scene, [.5, .12, .12], [mx + 1.6 + i * .12, g + .66, mz + .5], { all: '#3a3a44' }); b.rotation.y = .3; }
      const poc = actor(scene, W, 'pocoyo', mx - .9, mz + 3.3, { y: g + .25, yaw: .25, armR: [-2.9, .2], headYaw: -.2 }); toyHammer(poc.armR, [0, -.4, 0], [Math.PI, 0, 0]);
      const camera = cam(40, [mx + .2, g + 1.6, mz - 3.4], [mx - .2, g + 1.5, mz + 2]);
      return { scene, camera, grade: 'saturate(1.12) contrast(1.06)', overlay: (ctx, { project }) => { broadcast(ctx, "WORLD BROADCAST · Frieza's (secret) meeting"); tags(ctx, project, [[frieza], [poc]]); caption(ctx, '*squeak*', { size: 46 }); } };
    },
  },

  '16-doomsday': {
    title: 'DAY 15 · Doomsday: the world border starts to close', time: '7:10',
    async build() {
      await fontsReady; const { scene } = await islandScene('doom', { sun: [.2, .5, -.8], focus: [0, 12, -10], area: 200, fogNear: 300, fogFar: 1300 });
      borderWall(scene, -120, -150, 120, 90, { y0: 0, height: 140, opacity: .32, color: '#ff4f7e' });
      const camera = cam(46, [190, 170, 210], [0, 10, -20]);
      return { scene, camera, bloom: [.45, .6, .75], grade: 'saturate(1.15) contrast(1.06)', overlay: ctx => { banner(ctx, 'DOOMSDAY ACTIVATED', 'WORLD BORDER IS CLOSING · 500 BLOCKS A DAY'); counters(ctx, [48, 71, 31]); subtitle(ctx, '第十五天。天空变成了瘀青般的紫色。', 'Day 15. The sky turned a bruised, metallic purple.'); } };
    },
  },

  '17-final-stand': {
    title: 'DAY 19 · The final stand at the Central Plateau', time: '7:50',
    async build() {
      await fontsReady; const [cx, cz] = SITES.plateau; const { scene, W } = await islandScene('doom', { sun: [-.3, .6, -.7], focus: [cx, 30, cz + 10], area: 30, fogNear: 60, fogFar: 400 });
      const g = W.groundAt(cx, cz); fortress(scene, [cx, cz - 4], g);
      borderWall(scene, cx - 40, cz - 40, cx + 40, cz + 40, { y0: 0, height: 100, opacity: .14, color: '#ff4f7e' });
      const front = cz + 9, enemy = [cx, cz + 40];
      const goku = actor(scene, W, 'goku_ssj', cx + 1.2, front, { face: enemy }); aura(scene, [cx + 1.2, W.groundAt(cx + 1.2, front), front], { color: 0xffe066 });
      const gohan = actor(scene, W, 'gohan_scarred', cx - 1.4, front + .4, { face: enemy, armL: [-.3, -.4] });
      const vegeta = actor(scene, W, 'vegeta', cx + 3.8, front - .4, { face: enemy, armL: [-.4, -.6], armR: [-.4, .6] });
      const poc = actor(scene, W, 'pocoyo', cx - 4.4, front - 1.2, { face: enemy }), pato = actor(scene, W, 'pato', cx - 5.4, front - 1.8, { face: enemy });
      cube(scene, [1.6, 1.4, .2], [cx - 7, W.groundAt(cx - 7, front - 2.4) + .7, front - 2.4], { all: '#111111' }); // a tunnel mouth
      const fz = cz + 21, fy = g + 8;
      const frieza = actor(scene, W, 'frieza', cx + 4, fz, { y: fy, face: [cx, cz], armR: [-3, .1], armL: [-3, -.1] });
      energyBall(scene, [cx + 4, fy + 4.6, fz], 2.2, { core: 0xffc080, glow: 0xff4a2a, light: 30, range: 60 });
      scene.add(crowd(gather(70, { center: [cx + 2, cz + 26], radius: 8, groundAt: W.groundAt, face: [cx, cz], seed: 17, mix: ['soldier', 'frieza'] })));
      const camera = cam(52, [cx - 4.5, W.groundAt(cx - 4.5, front - 3.5) + 1.7, front - 3.5], [cx + 2.5, g + 6, cz + 20]);
      return { scene, camera, bloom: [.6, .6, .72], overlay: (ctx, { project }) => { tags(ctx, project, [[goku, 'Goku'], [gohan, 'Gohan'], [vegeta], [poc], [pato]]); bigName(ctx, project(topOf(frieza, 2.4)), 'Frieza', 32); caption(ctx, 'Death Balls that vaporised whole chunks'); } };
    },
  },

  '18-spirit-dome': {
    title: 'The climax · A Spirit Bomb turned into a dome of joyful light', time: '8:30',
    async build() {
      await fontsReady; const [cx, cz] = SITES.plateau; const { scene, W } = await islandScene('doom', { sun: [-.3, .6, -.7], focus: [cx, 30, cz], area: 30, fogNear: 60, fogFar: 400 });
      const g = W.groundAt(cx, cz);
      borderWall(scene, cx - 25, cz - 25, cx + 25, cz + 25, { y0: 0, height: 100, opacity: .16, color: '#ff4f7e' });
      const goku = actor(scene, W, 'goku_ssj', cx, cz, { face: [cx, cz - 20], armL: [-3.05, -.2], armR: [-3.05, .2], headPitch: -.4 }); aura(scene, [cx, g, cz], { color: 0xffe066, h: 2.3, r: 1 });
      energyBall(scene, [cx, g + 17, cz], 5, { core: 0x9fdcff, glow: 0x4aa8ff, light: 20, range: 60 });
      lightDome(scene, [cx, g - .5, cz], 14);
      const gab = actor(scene, W, 'gabby', cx - 2.2, cz - 1.6, { face: [cx, cz - 20], armR: [-2.9, .3], armL: [-2.9, -.3] }), poc = actor(scene, W, 'pocoyo', cx + 2.2, cz - 1.6, { face: [cx, cz - 20], armR: [-2.9, .3], armL: [-2.9, -.3] });
      const ring = []; for (let i = 0; i < 46; i++) { const a = i / 46 * Math.PI * 2, r = 6.5 + (i % 3) * 1.6; ring.push({ x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, y: W.groundAt(cx + Math.cos(a) * r, cz + Math.sin(a) * r), yaw: Math.atan2(Math.cos(a), Math.sin(a)) }); }
      scene.add(crowd(ring, { mix: ['gi', 'saiyan', 'pocoyo', 'elly', 'pato', 'gabby', 'panda', 'cat', 'cakey', 'buu', 'bulma'], seed: 21 }));
      for (const [id, dx, dz] of [['vegeta', 3.8, .4], ['gohan_scarred', -3.9, .4], ['pandy', -1.3, -3.4], ['pato', 1.4, -3.6], ['buu', 5.6, 2.4], ['elly', -5.4, 2.4]]) actor(scene, W, id, cx + dx, cz + dz, { face: [cx, cz - 20], headPitch: -.5, armL: [-.6, -.9], armR: [-.6, .9] });
      const camera = cam(50, [cx + 15, g + 5, cz - 21], [cx, g + 9, cz]);
      return { scene, camera, bloom: [.3, .5, .85], grade: 'saturate(1.1)', overlay: (ctx, { project }) => { tags(ctx, project, [[gab], [poc]]); bigName(ctx, project(topOf(goku, .5)), 'Goku', 34); subtitle(ctx, '盖比用玩偶屋的手工魔法，加上波可佑的喇叭声，把元气弹化成了一座快乐之光的穹顶。', "Gabby's craft-magic and Pocoyo's horn turned the Spirit Bomb into a dome of joyful light."); } };
    },
  },

  '19-epilogue': {
    title: 'Epilogue · 42 players on the last floating platform', time: '9:10',
    async build() {
      await fontsReady; const scene = new T.Scene(); const L = LOOKS.void;
      skyDome(scene, L.top, L.horizon, L.glow, [.6, .08, .8], { stars: true }); scene.fog = new T.Fog(L.fog, 40, 300);
      lights(scene, { sun: [-30, 22, -50], area: 14, sunColor: L.sunColor, sunI: L.sunI, hemiSky: L.hemiSky, hemiGround: L.hemiGround, hemiI: 1.3 });
      const grassTop = await blockTex('grass_block_top.png'), grassSide = await blockTex('grass_block_side.png'), dirt = await blockTex('dirt.png');
      platform(scene, [0, 0, 0], 8, { top: new T.MeshLambertMaterial({ map: grassTop, color: 0x7fbf55 }), side: new T.MeshLambertMaterial({ map: grassSide }), dirt: new T.MeshLambertMaterial({ map: dirt }) });
      const veg = actor(scene, null, 'vegeta', -.4, -2.8, { y: 0, face: [1, -2.8], armR: [-1.5, .2], lean: -.05 }), pato = actor(scene, null, 'pato', 1, -2.8, { y: 0, face: [-.4, -2.8], armL: [-1.7, -.3], armR: [-1.6, .3] }); bread(scene, [.3, 1.08, -2.8], [0, .3, 0]);
      const gab = actor(scene, null, 'gabby', 3.4, -1, { y: 0, yaw: -Math.PI / 2, lie: true }), pandy = actor(scene, null, 'pandy', 3.4, -.1, { y: 0, yaw: -Math.PI / 2, lie: true });
      cube(scene, [1.5, .06, 1.8], [3.9, .52, -.5], { all: '#f4f1e8' }); // Gohan's training cape as a blanket
      const poc = actor(scene, null, 'pocoyo', -3.2, -6.4, { y: 0, yaw: Math.PI * .75, sit: true, armR: [-2.8, .4] });
      const people = gather(37, { center: [0, 3.2], radius: 5, inner: 1.5, face: [0, -10], seed: 42, mix: ['gi', 'saiyan', 'pocoyo', 'gabby', 'panda', 'cat', 'buu', 'elly', 'pato', 'bulma'] });
      scene.add(crowd(people.map(p => ({ ...p, y: 0 }))));
      const camera = cam(48, [3, 2.3, -11.5], [-.6, .9, -2.4]);
      return { scene, camera, bloom: [.45, .6, .8], grade: 'brightness(1.25) saturate(1.1)', overlay: (ctx, { project }) => { tags(ctx, project, [[veg], [pato], [gab], [pandy], [poc]]); caption(ctx, '42 players remained.'); } };
    },
  },

};
