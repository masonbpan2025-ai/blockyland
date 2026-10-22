// Three Islands, Three Weddings · the key frames, one per story beat (see WEDDINGS_STORY.md). Same world and helpers as
// the 1500 Players key frames: each entry builds a scene and a camera and paints its overlays.
import * as T from 'three';
import { texBox } from './claudeStage.js';
import { nameTag, bigName, caption, subtitle, dayCard, mapPin, banner, broadcast, fontsReady } from './civOverlay.js';
import { makeCharacter, posePlayer, cube, bowTie } from './civCast.js';
import { buildWorld, SITES, ISLANDS, SEA } from './civWorld.js';
import { crowd, gather } from './civCrowd.js';
import { aura, snowfall, fairyLights, cookies, sparkles, glowMat } from './civFx.js';
import { mat, farm, lantern, gravityMachine, smoke, sign, arch, weddingCake, ring, fireworks } from './wedProps.js';
import { LOOKS, cam, lights, skyDome, islandScene, yawTo, mapTable, hoverPod, grassFloor, portrait, face } from './civFrames.js';

Object.assign(LOOKS, {
  dusk: { top: 0x2c3a6e, horizon: 0xf2a066, glow: 0xffb070, sunColor: 0xffb080, sunI: 1.3, hemiSky: 0x7080b0, hemiGround: 0x3a3040, hemiI: .9, fog: 0x8a7090 },
  night: { top: 0x0c1430, horizon: 0x2c3a5e, glow: 0x6a7cc0, sunColor: 0x8fa2d8, sunI: .6, hemiSky: 0x52608e, hemiGround: 0x1c2032, hemiI: .8, fog: 0x2a3550 },
  freeze: { top: 0x7f98b8, horizon: 0xd8e6f2, glow: 0xe8f4ff, sunColor: 0xd8e8ff, sunI: 1.4, hemiSky: 0xe6eef6, hemiGround: 0x8f9cab, hemiI: 1.5, fog: 0xc8d8e8 },
});

// ------------------------------------------------------------------ helpers
/** A cast member on the terrain (or at q.y), facing q.face; grooms get a bow tie. */
function actor(scene, W, id, x, z, q = {}) {
  const c = makeCharacter(id); scene.add(c.root); if (q.groom) bowTie(c);
  const y = q.y ?? (W ? W.groundAt(x, z) : 0), yaw = q.face ? yawTo([x, z], q.face) : q.yaw ?? 0;
  posePlayer(c, { x, z, y, yaw, ...q, lie: false });
  // flat on the back, face to the sky, head toward `yaw`'s back (posePlayer's `lie` puts the face in the dirt)
  if (q.lie) { c.root.rotation.set(Math.PI / 2, yaw, 0, 'YXZ'); c.root.position.y = y + .16 * c.root.scale.x; }
  return c;
}
/** A point k of the way from a to b: actors face their partner "cheated" toward the lens, so both faces read. */
/** Arms folded across the chest (a negative z swings a left arm outward, so folding is the opposite sign). */
const CROSS = { armL: [-1.25, .75], armR: [-1.25, -.75] };
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
/** A camera at C (x, z) looking at L (x, z), heights above the ground g. */
const lens = (fov, C, h, L, lift, g) => cam(fov, [C[0], g + h, C[1]], [L[0], g + lift, L[1]]);
/** The top of a character's head (hair, ears and hats included): name tags hang a few pixels above it on screen. */
const headTop = c => { const b = new T.Box3().setFromObject(c.head); return [(b.min.x + b.max.x) / 2, b.max.y, (b.min.z + b.max.z) / 2]; };
const tags = (ctx, project, list, size = 16) => list.forEach(([c, text]) => { const p = project(headTop(c)); if (p) nameTag(ctx, [p[0], p[1] - 6], text ?? c.label, { size }); });
const big = (ctx, project, c, text, size = 38) => { const p = project(headTop(c)); if (p) bigName(ctx, [p[0], Math.max(80, p[1] - 14)], text ?? c.label, size); };
const ground = (W, x, z) => W.groundAt(x, z);
/** Something held in a hand: a small box at the end of an arm. */
const inHand = (c, side, size, color, at = [0, -.62, -.04]) => cube(side === 'L' ? c.armL : c.armR, size, at, { all: color });
/** A CCTV picture: a second little scene rendered into a canvas, tinted green with scanlines and a timestamp. */
function cctv(renderer, scene, camera, stamp) {
  renderer.setRenderTarget(null); renderer.render(scene, camera);
  const c = document.createElement('canvas'); c.width = 480; c.height = 270; const p = c.getContext('2d');
  p.filter = 'grayscale(1) sepia(1) hue-rotate(60deg) saturate(2.2) brightness(1.15) contrast(1.15)'; p.drawImage(renderer.domElement, 0, 0, 480, 270); p.filter = 'none';
  p.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < 270; y += 3) p.fillRect(0, y, 480, 1);
  p.font = 'bold 20px monospace'; p.fillStyle = '#ff4040'; p.fillText('● REC', 14, 30); p.fillStyle = '#e8ffe8'; p.fillText(stamp, 300, 256);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
/** A cast sheet: characters in a row on grass, tagged (grooms get bow ties). */
function castSheet(ids, title, { spacing = 1.35, fov = 34, camY = 1.5, grooms = [] } = {}) {
  return {
    title,
    async build() {
      await fontsReady;
      const scene = new T.Scene(); skyDome(scene, 0x86b9e3, 0xf6e6cf, 0xfff2c8, [.4, .35, -1]);
      lights(scene, { sun: [-14, 22, -20], area: 12, hemiI: 1.4, sunI: 2.6 }); await grassFloor(scene, 40, 24);
      const n = ids.length, chars = ids.map((id, i) => actor(scene, null, id, -(-(n - 1) * spacing / 2 + i * spacing), 0, { y: 0, yaw: 0, headYaw: (i - (n - 1) / 2) * .04, groom: grooms.includes(id) }));
      const half = (n - 1) * spacing / 2 + .9, hfov = 2 * Math.atan(Math.tan(fov * Math.PI / 360) * 16 / 9), dist = half / Math.tan(hfov / 2);
      const camera = cam(fov, [0, camY + dist * .06, -dist], [0, .8, 0]);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, chars.map(c => [c]), 15); caption(ctx, title, { size: 30, y: 700 }); } };
    },
  };
}

// ------------------------------------------------------------------ the beats
// Blocking: two people talking face each other "cheated" toward the lens (mix(partner, lens, k)), the lens sits in front
// of whoever speaks, and the sun comes from behind the lens so the faces are lit.
const [bx, bz] = SITES.bakery, FARM = [bx + 11, bz + 8]; // Chi-Chi's farm: on the bakery's plaza, south-east of the shop
const P = SITES.plateau; // the Central Plateau: the hill of the lantern night, the wedding and the tournament
const OUT = () => { const [ox, oz] = SITES.outpost; return [ox + 1, oz + 14]; }; // the yard in front of Bulma's dome
export const FRAMES = {
  'cast-couples': castSheet(['goku', 'chichi', 'vegeta', 'bulma', 'krillin', 'android18'], 'Cast · The three couples', { spacing: 1.3 }),
  'cast-kids': castSheet(['gohan', 'videl', 'goten', 'trunks', 'bulla', 'marron'], 'Cast · The next generation (Server Year 15)', { spacing: 1.2, camY: 1.1, fov: 32 }),
  'cast-fourth-wedding': castSheet(['gohan', 'videl_bride'], 'Cast · The fourth wedding (Server Year 22)', { spacing: 1.6, grooms: ['gohan'], fov: 40, camY: 1.3 }),
  'cast-friends': castSheet(['yamcha', 'frieza', 'buu', 'drbriefs', 'pocoyo', 'pato', 'elly', 'loula', 'gabby', 'babybox'], 'Cast · Friends (and one villain)', { spacing: 1.25, camY: 1.2 }),
  'cast-wedding': castSheet(['goku', 'chichi_bride', 'vegeta', 'bulma_bride', 'krillin', 'android18_bride'], 'Cast · Wedding day', { spacing: 1.3, grooms: ['goku', 'vegeta', 'krillin'] }),

  '01-lobby': {
    title: 'Cold open · "This is a story about... love!" "Ewww!"', time: '0:00',
    async build() {
      await fontsReady; const scene = new T.Scene(); scene.background = new T.Color(0xe9edf3); scene.fog = new T.Fog(0xe9edf3, 30, 120);
      lights(scene, { sun: [-20, 40, -30], area: 30, hemiSky: 0xffffff, hemiGround: 0xc9d0da, hemiI: 1.5, sunI: 1.4 });
      const floor = new T.Mesh(new T.PlaneGeometry(300, 300), new T.MeshLambertMaterial({ color: 0xf2f4f7 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
      const kids = gather(900, { center: [0, 40], radius: 34, inner: 4, face: [0, -30], seed: 3, mix: ['gi', 'saiyan', 'pocoyo', 'elly', 'pato', 'nina', 'gabby', 'panda', 'cat', 'cakey', 'bulma'] }).map((p, i) => ({ ...p, armUp: i % 4 === 0 ? 1 : 0 }));
      scene.add(crowd(kids)); sparkles(scene, [0, 0, 30], { n: 300, radius: 30, height: 5 });
      const heroes = [['goku', -1.2, -2.6, [-1.3, .4], [-.3, -.2]], ['chichi', .4, -2.8], ['vegeta', 2.4, -2, [-.6, .6], [-.6, -.6]], ['bulma', 3.8, -1.4], ['krillin', -2.8, -2.2], ['android18', -4.2, -1.4, [-.6, .6], [-.6, -.6]]];
      const chars = heroes.map(([id, x, z, armR, armL]) => actor(scene, null, id, x, z, { y: 0, face: [0, -14], armR, armL }));
      chars[0].root.rotation.y += .5; chars[1].root.rotation.y -= .5; // Goku and Chi-Chi glance at each other
      const camera = cam(46, [0, 1.7, -10.5], [0, 2.2, 8]);
      return { scene, camera, bloom: [.25, .5, .92], overlay: (ctx, { project }) => { tags(ctx, project, chars.map(c => [c]), 16); caption(ctx, '"Ewwwww!"', { y: 120, size: 52 }); subtitle(ctx, '旁白：这是一个关于……爱情的故事！', 'NARRATOR: This is a story about... love!'); } };
    },
  },

  '02-map': {
    title: 'The map · Three islands, three couples who have never met', time: '0:25',
    async build({ renderer }) {
      await fontsReady; const { scene } = await islandScene('day', { sun: [.3, .9, .4], focus: [0, 12, -10], area: 200, fogNear: 700, fogFar: 1600 });
      const pins = [['vegeta', 'hot', 'Vegeta & Bulma', [-10, 0]], ['bulma', 'hot', '', [10, 0]], ['goku', 'temperate', 'Goku & Chi-Chi', [-10, 0]], ['chichi', 'temperate', '', [10, 0]], ['krillin', 'cold', 'Krillin & 18', [-10, 0]], ['android18', 'cold', '', [10, 0]]];
      const heads = {}; for (const [id] of pins) heads[id] = await portrait(renderer, id);
      const camera = cam(38, [0, 470, 70], [0, 0, -12]);
      return { scene, camera, bloom: [.2, .5, .97], overlay: (ctx, { project }) => {
        for (const [id, isl, label, [dx, dz]] of pins) { const I = ISLANDS[isl]; mapPin(ctx, project([I.c[0] + dx, 20, I.c[1] - 8 + dz]), label, face(heads[id]), { size: 56, sub: label ? isl.toUpperCase() + ' ISLAND' : '' }); }
        subtitle(ctx, '旁白：三座岛，六个还没见过面的人。不过……马上就要见面啦！', "NARRATOR: Three islands. Six people who have never met. That's about to change!");
      } };
    },
  },

  '03-carrot-field': {
    title: 'Temperate Island · The carrot thief: Chi-Chi flips Goku', time: '0:45',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('day', { sun: [-.6, .55, .45], focus: [FARM[0], 20, FARM[1]], area: 16 });
      await farm(scene, W.groundAt, FARM[0], FARM[1], 7, 6, { skip: (i, j) => i === 0 && j === 3 });
      const A = [FARM[0] - 1.4, FARM[1] + 2.8], B = [FARM[0] - 2.2, FARM[1] + 4.2], C = [FARM[0] - 6.4, FARM[1] + 6.8], g = ground(W, ...A);
      const goku = actor(scene, W, 'goku', B[0], B[1], { lie: true, yaw: .55, armR: [-1.5, .2], armL: [-.3, -.5], legL: -.3 });
      cube(goku.armR, [.08, .3, .08], [0, -.82, 0], { all: '#f08a24' }); cube(goku.armR, [.1, .12, .1], [0, -1.02, 0], { all: '#4fa83a' }); // the stolen carrot
      const chi = actor(scene, W, 'chichi', A[0], A[1], { face: mix(B, C, .55), armR: [-.5, .5], armL: [-.5, -.5], headPitch: .35 }); // hands on hips
      const camera = lens(42, C, 1.5, [A[0] + .2, A[1] + .6], .7, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[goku], [chi]], 17); subtitle(ctx, '悟空：哇！你好厉害！明天再跟我打一场好吗？', "GOKU: Wow! You're strong! Fight me again tomorrow?"); } };
    },
  },

  '04-say-please': {
    title: 'Hot Island · Bulma\'s lab: "Say please."', time: '1:30',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [.35, .45, .8], focus: [-82, 16, 84], area: 24 });
      const c0 = OUT(), A = [c0[0] - 1, c0[1] + .2], B = [c0[0] + 1, c0[1]], C = [c0[0] - .4, c0[1] + 5.2], g = ground(W, ...c0);
      const bench = [c0[0] - .6, c0[1] - 2.4];
      cube(scene, [2.2, .1, 1], [bench[0], g + .95, bench[1]], { all: '#c9ccd2' }); for (const s of [-1, 1]) cube(scene, [.1, .95, .9], [bench[0] + s, g + .47, bench[1]], { all: '#8a8f99' });
      cube(scene, [.5, .3, .4], [bench[0] - .5, g + 1.15, bench[1]], { all: '#3a8fd1' }); cube(scene, [.3, .4, .3], [bench[0] + .4, g + 1.2, bench[1]], { all: '#ffd23a' });
      const bulma = actor(scene, W, 'bulma', A[0], A[1], { face: mix(B, C, .4), armR: [-1.5, .1], armL: [-.5, -.5] }); inHand(bulma, 'R', [.07, .38, .07], '#9aa0aa');
      const veg = actor(scene, W, 'vegeta', B[0], B[1], { face: mix(A, C, .3), ...CROSS, headPitch: -.15 });
      const yam = actor(scene, W, 'yamcha', c0[0] - 2.8, c0[1] - 2, { face: mix(B, C, .3), ...CROSS });
      const bri = actor(scene, W, 'drbriefs', c0[0] + 2.6, c0[1] - 2.4, { face: mix(A, C, .5) });
      const camera = lens(42, C, 1.7, [c0[0], c0[1] - .4], 1.3, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[bulma], [veg], [yam], [bri]], 16); subtitle(ctx, '布尔玛：说"请"。　贝吉塔：王子从来不说"请"。', 'BULMA: Say please.   VEGETA: A prince does not say please.'); } };
    },
  },

  '05-cocoa': {
    title: 'Cold Island · Cocoa at the Ice Palace gate', time: '2:10',
    async build() {
      await fontsReady; const [px, pz] = SITES.palace; const { scene, W } = await islandScene('blizzard', { sun: [.3, .6, .8], focus: [px, 30, pz + 16], area: 20, fogNear: 14, fogFar: 160 });
      const m = [px + 1, pz + 17], A = [m[0] - .8, m[1]], B = [m[0] + .8, m[1] + .2], C = [m[0] + .5, m[1] + 4.4], g = ground(W, ...m);
      const a18 = actor(scene, W, 'android18', A[0], A[1], { face: mix(B, C, .35), ...CROSS, headYaw: .25 });
      const kri = actor(scene, W, 'krillin', B[0], B[1], { face: mix(A, C, .3), armR: [-1.45, .1], armL: [-1.45, -.1] });
      for (const side of ['L', 'R']) { const mug = inHand(kri, side, [.13, .16, .13], '#f4f1e8', [0, -.62, -.08]); cube(mug, [.11, .02, .11], [0, .08, 0], { all: '#6b3a1e' }); }
      const camera = lens(40, C, 1.45, m, 1.05, g);
      snowfall(scene, camera, { n: 2500, depth: 30, spread: 24, size: .06 });
      return { scene, camera, grade: 'saturate(.95) brightness(1.03)', overlay: (ctx, { project }) => { tags(ctx, project, [[a18], [kri]], 17); subtitle(ctx, '18号：我是人造人，不需要可可。　克林：每个人都需要可可。', "18: I'm an android. I don't need cocoa.   KRILLIN: Everyone needs cocoa."); } };
    },
  },

  '06-fair': {
    title: 'DAY 8 · The Three-Island Fair: the six finally meet', time: '2:50',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [.4, .5, .8], focus: [bx, 20, bz + 10], area: 20 });
      const c = [bx + 1.6, bz + 10], C = [bx + 1.6, bz + 16.4], g = ground(W, ...c);
      const buu = actor(scene, W, 'buu', bx - .4, bz + 6.4, { face: C, armR: [-1.5, .25] }); cookies(scene, [bx - .8, ground(W, bx, bz + 6.4) + 1.32, bz + 6]);
      const at = (dx, dz) => [c[0] + dx, c[1] + dz];
      const G = at(.7, .4), V = at(1.9, 0), Bu = at(-2.6, .6), Ch = at(-1.4, .3), K = at(4.2, -.4), E = at(5.2, -1);
      const goku = actor(scene, W, 'goku', ...G, { face: mix(V, C, .25), armR: [-1.4, .2], armL: [-.9, -.3], lean: .12 });
      const veg = actor(scene, W, 'vegeta', ...V, { face: mix(G, C, .25), ...CROSS, lean: .1 });
      const bul = actor(scene, W, 'bulma', ...Bu, { face: mix(Ch, C, .4), armR: [-1.6, .3] });
      const chi = actor(scene, W, 'chichi', ...Ch, { face: mix(Bu, C, .4), armL: [-2.2, -.3] });
      const kri = actor(scene, W, 'krillin', ...K, { face: C, armR: [-1.3, .1] }); cookies(kri.armR, [0, -.66, -.12], 2);
      const a18 = actor(scene, W, 'android18', ...E, { face: mix(G, C, .2), ...CROSS });
      const fair = gather(70, { center: c, radius: 9, inner: 6.5, groundAt: W.groundAt, face: c, seed: 31, mix: ['gi', 'saiyan', 'pocoyo', 'gabby', 'cat', 'panda', 'elly', 'pato', 'bulma'] }).filter(p => p.z < c[1] + 2 && p.z > bz + 6.2);
      scene.add(crowd(fair));
      fairyLights(scene, [bx - 6, g + 4.6, bz + 7.4], [bx + 9, g + 4.6, bz + 7.4], { n: 26, sag: 1.2, light: false });
      const camera = lens(46, C, 1.8, [c[0] + .6, c[1] - .6], 1.5, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[goku], [veg], [bul], [chi], [kri], [a18], [buu]], 15); banner(ctx, 'THREE-ISLAND FAIR', 'Day 8 · the borders are open', { color: '#7dff9a' }); subtitle(ctx, '琪琪：你发明了会飞的车？！　布尔玛：你摔倒了一个赛亚人？！', 'CHI-CHI: You invented a FLYING car?!   BULMA: You flipped a SAIYAN?!'); } };
    },
  },

  '07-empty-lantern': {
    title: 'Twist 1 · The Lantern Festival: Chi-Chi waits on the hill, Goku forgets', time: '3:30',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('dusk', { sun: [-.35, .14, .9], focus: [P[0], 20, P[1]], area: 20, fogNear: 60, fogFar: 500 });
      const m = [P[0] + 4, P[1] + 6], C = [m[0] + .9, m[1] + 3.6], g = ground(W, ...m);
      const chi = actor(scene, W, 'chichi', m[0], m[1], { face: C, sit: true, seat: g + .12, armL: [-.9, -.1], armR: [-.9, .1], headPitch: .3 });
      lantern(scene, [m[0] - 1, g, m[1] + .2], true); lantern(scene, [m[0] + 1, g, m[1] + .2], false);
      const far = [m[0] - 10, m[1] - 70], fg = g + 16; // Goku and Vegeta, sparring over the far hills
      aura(scene, [far[0], fg, far[1]], { color: 0xffe066, h: 2, r: .8 }); aura(scene, [far[0] + 2.4, fg + 1, far[1] + .5], { color: 0x7fb0ff, h: 2, r: .8 });
      const flash = new T.Mesh(new T.SphereGeometry(1.4, 16, 10), glowMat(0xfff2c0, .6)); flash.position.set(far[0] + 1.2, fg + 1.6, far[1] + .2); scene.add(flash);
      const camera = lens(40, C, 1.05, m, 1.0, g);
      return { scene, camera, bloom: [.55, .5, .75], overlay: (ctx, { project }) => { tags(ctx, project, [[chi]], 17); const p = project([far[0] + 1.2, fg + 4.4, far[1]]); if (p) nameTag(ctx, p, '"Just one more round!"', { size: 14 }); subtitle(ctx, '旁白："再打最后一局"……打了三十一局。', 'NARRATOR: "Just one more round"... thirty-one rounds.'); } };
    },
  },

  '08-knot': {
    title: 'A real apology · Goku ties a knot in his belt', time: '4:05',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('day', { sun: [-.5, .55, .6], focus: [FARM[0], 20, FARM[1]], area: 16 });
      await farm(scene, W.groundAt, FARM[0], FARM[1], 7, 6);
      const A = [FARM[0] - 1.3, FARM[1] + 3.2], B = [FARM[0] - 2.5, FARM[1] + 2.9], C = [FARM[0] - 3.4, FARM[1] + 7.2], g = ground(W, ...A);
      const goku = actor(scene, W, 'goku', A[0], A[1], { face: mix(B, C, .4), armL: [-.9, .3], armR: [-.9, -.3], headPitch: .1 });
      cube(goku.torso, [.12, .12, .08], [-.1, .14, -.18], { all: '#1f4fa8' }); cube(goku.torso, [.05, .18, .03], [-.07, .02, -.19], { all: '#1f4fa8' }); // the knot
      const chi = actor(scene, W, 'chichi', B[0], B[1], { face: mix(A, C, .4), armR: [-.7, .35], armL: [-.4, -.2] });
      const hoe = new T.Group(); scene.add(hoe); hoe.position.set(B[0] - .9, g, B[1] - .5); cube(hoe, [.06, 1.6, .06], [0, .8, 0], { all: '#8a6a44' }); cube(hoe, [.36, .08, .08], [.12, 1.58, 0], { all: '#9aa0aa' }); hoe.rotation.z = .2;
      const camera = lens(38, C, 1.55, mix(A, B, .5), 1.2, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[goku], [chi]], 17); subtitle(ctx, '悟空：我忘了，因为打架太好玩了。可是你比好玩更重要。对不起。', "GOKU: I forgot because fighting is fun. But you're more important than fun. I'm sorry."); } };
    },
  },

  '09-smoke': {
    title: 'Twist 2 · The gravity machine bursts; Yamcha blames Vegeta', time: '4:30',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('night', { sun: [.3, .6, .7], focus: [-82, 16, 90], area: 24, stars: true });
      const c0 = OUT(), g = ground(W, ...c0), mach = [c0[0] - 1, c0[1] - 3.4], C = [c0[0] + .2, c0[1] + 5.4];
      await gravityMachine(scene, [mach[0], ground(W, ...mach), mach[1]], 0, { broken: true }); smoke(scene, [mach[0], ground(W, ...mach) + 2.2, mach[1]]);
      const red = new T.PointLight(0xff5040, 18, 12); red.position.set(mach[0], g + 2.6, mach[1] - 1.4); scene.add(red);
      const Y = [c0[0] - 2, c0[1] + .4], V = [c0[0] + 1.6, c0[1] + .6], Bu = [c0[0] - .2, c0[1] - .7];
      const yam = actor(scene, W, 'yamcha', ...Y, { face: mix(V, C, .2), armR: [-1.55, .1] });
      const veg = actor(scene, W, 'vegeta', ...V, { face: [V[0] + 2, V[1] + 3], ...CROSS, headYaw: -.3 }); // too proud to answer: turned half away
      const bul = actor(scene, W, 'bulma', ...Bu, { face: mix(V, C, .35), armL: [-.5, -.6], armR: [-.5, .6] });
      const key = new T.PointLight(0xfff0dc, 10, 12); key.position.set(C[0] + .6, g + 2.6, C[1] - .6); scene.add(key);
      const camera = lens(44, C, 1.8, [c0[0] - .2, c0[1] - .8], 1.5, g);
      return { scene, camera, bloom: [.5, .5, .75], overlay: (ctx, { project }) => { tags(ctx, project, [[yam], [veg], [bul]], 17); subtitle(ctx, '亚姆查：昨晚我看见贝吉塔偷偷溜进来了！', 'YAMCHA: I saw Vegeta sneaking in last night!'); } };
    },
  },

  '10-camera': {
    title: 'The camera never lies · Vegeta was fixing it all night', time: '5:00',
    async build({ renderer }) {
      await fontsReady; const c0 = OUT(), mach = [c0[0] - 1, c0[1] - 3.4];
      // the recording first: the island world can sit in one scene at a time, so the lab yard is built after it
      const rec = await islandScene('night', { sun: [.3, .6, .7], focus: [-82, 16, 90], area: 14 }), mg = rec.W.groundAt(...mach);
      await gravityMachine(rec.scene, [mach[0], mg, mach[1]], 0);
      const rv = actor(rec.scene, rec.W, 'vegeta', mach[0] + .3, mach[1] - 1.5, { face: [mach[0] + .3, mach[1]], armR: [-1.4, .1], armL: [-1.2, -.2], lean: .5, headPitch: .2 }); inHand(rv, 'R', [.07, .36, .07], '#9aa0aa');
      const torch = new T.PointLight(0xfff0d0, 14, 8); torch.position.set(mach[0] - 1.2, mg + 1.8, mach[1] - 2.6); rec.scene.add(torch);
      const tex = cctv(renderer, rec.scene, cam(50, [mach[0] - 3.2, mg + 3, mach[1] - 4.4], [mach[0] + .2, mg + .9, mach[1] - 1]), 'LAB CAM 2 · 03:12 AM');
      const { scene, W } = await islandScene('golden', { sun: [.35, .45, .8], focus: [-82, 16, 84], area: 24 });
      const g = ground(W, ...c0), C = [c0[0] - .2, c0[1] + 5.8], tv = [c0[0] - .2, c0[1] - 2], tg = ground(W, ...tv);
      cube(scene, [1.2, .9, .6], [tv[0], tg + .45, tv[1]], { all: '#6b4a2c' });
      const screen = new T.Mesh(new T.BoxGeometry(1.7, 1, .12), [0, 0, 0, 0, 1, 0].map(i => i ? new T.MeshBasicMaterial({ map: tex, toneMapped: false }) : new T.MeshLambertMaterial({ color: 0x2b2b33 })));
      screen.position.set(tv[0], tg + 1.45, tv[1]); scene.add(screen); // the picture is on the +z face, toward the lens
      const box = actor(scene, W, 'babybox', tv[0] + 1.4, tv[1] + .2, { face: C, armL: [-1.4, -.2] });
      const V = [c0[0] + 1.2, c0[1] + .9], Bu = [c0[0] - 1, c0[1] + 1.1];
      const veg = actor(scene, W, 'vegeta', ...V, { face: mix(Bu, C, .4), headPitch: .25, armL: [-.2, -.2], armR: [-.2, .2] });
      const bul = actor(scene, W, 'bulma', ...Bu, { face: mix(V, C, .4), armR: [-.9, .3] });
      const yam = actor(scene, W, 'yamcha', c0[0] - 2.8, c0[1] - .4, { face: mix(V, C, .3), armR: [-.6, .2], headPitch: .15 });
      const camera = lens(44, C, 1.9, [c0[0] - .2, c0[1] - .2], 1.4, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[veg], [bul], [yam], [box]], 16); subtitle(ctx, '布尔玛：机器我会修，可是秘密我修不好。下次，直接告诉我。', "BULMA: I can fix machines, Vegeta. I can't fix secrets. Next time, just tell me."); } };
    },
  },

  '11-spy': {
    title: 'Twist 3 · 18 takes the blueprints; Krillin asks "Are you okay?"', time: '5:25',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('night', { sun: [.3, .6, .7], focus: [-82, 16, 90], area: 24, stars: true });
      const c0 = OUT(), g = ground(W, ...c0), K = [c0[0] - 1.2, c0[1] + 1.6], E = [c0[0] + 1.6, c0[1] + .2], C = [c0[0] - .4, c0[1] + 6.2];
      const a18 = actor(scene, W, 'android18', ...E, { y: g + 1.8, face: mix(K, C, .5), fly: true, flyLean: .12, armR: [-.9, .25], armL: [-.2, -.3], legL: .25, legR: -.05 });
      const plans = inHand(a18, 'R', [.12, .5, .12], '#3d6fd1'); plans.rotation.x = Math.PI / 2;
      const kri = actor(scene, W, 'krillin', ...K, { face: mix(E, C, .45), armR: [-1.2, .2], headPitch: -.35 });
      const moon = new T.PointLight(0xc8d4ff, 12, 14); moon.position.set(C[0] + 1, g + 3.4, C[1] - 1); scene.add(moon);
      const camera = lens(42, C, 1.5, [c0[0] + .2, c0[1] + .8], 1.7, g);
      return { scene, camera, bloom: [.4, .5, .8], overlay: (ctx, { project }) => { tags(ctx, project, [[a18], [kri]], 17); subtitle(ctx, '克林：18号……你还好吗？', 'KRILLIN: 18... are you okay?'); } };
    },
  },

  '12-big-freeze': {
    title: 'DAY 15 · The Big Freeze: the sea between the islands turns to ice', time: '5:50',
    async build() {
      await fontsReady; const { scene } = await islandScene('freeze', { sun: [.2, .6, -.6], focus: [0, 12, -10], area: 200, fogNear: 300, fogFar: 1300 });
      const ice = await mat('packed_ice.png'); ice.map = ice.map.clone(); ice.map.repeat.set(60, 60); ice.map.needsUpdate = true;
      const sheet = new T.Mesh(new T.CircleGeometry(150, 48), ice); sheet.rotation.x = -Math.PI / 2; sheet.position.set(20, SEA + .95, 10); sheet.receiveShadow = true; scene.add(sheet);
      const [px, pz] = SITES.palace, blue = await mat('blue_ice.png'), base = [px + 20, pz - 14];
      for (let i = 0; i < 9; i++) texBox(scene, [5 - i * .35, 5, 5 - i * .35], [base[0], 30 + i * 5, base[1]], blue);
      const orb = new T.Mesh(new T.SphereGeometry(3.4, 20, 12), glowMat(0xbfe8ff, .85)); orb.position.set(base[0], 78, base[1]); scene.add(orb);
      const camera = cam(44, [-80, 190, 230], [30, 10, 0]);
      return { scene, camera, bloom: [.3, .5, .85], grade: 'saturate(.95) contrast(1.05)', overlay: ctx => { banner(ctx, 'THE BIG FREEZE', 'Day 15 · the sea is turning to ice', { color: '#9fdcff' }); broadcast(ctx, 'FRIEZA: From now on, there is ONE island. Mine.'); } };
    },
  },

  '13-one-table': {
    title: 'Teamwork · Five heroes round one table (18 is missing)', time: '6:15',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('freeze', { sun: [.3, .5, .8], focus: [-82, 16, 84], area: 24 });
      const c0 = OUT(), t = [c0[0], c0[1] - 1], g = ground(W, ...t), C = [t[0] - .6, t[1] + 5.6];
      mapTable(scene, [t[0], g, t[1]]);
      const bul = actor(scene, W, 'bulma', t[0] - .2, t[1] - 1.3, { face: C, armR: [-1.3, .2], lean: .2 });
      const kri = actor(scene, W, 'krillin', t[0] + 1, t[1] - 1.1, { face: mix(t, C, .6), armR: [-1.2, .1] });
      const chi = actor(scene, W, 'chichi', t[0] - 1.9, t[1] - .1, { face: mix(t, C, .45), armL: [-1.2, -.1], armR: [-1.2, .1] });
      const G = [t[0] + 1.6, t[1] + 1.4], V = [t[0] + 2.6, t[1] + .9];
      const goku = actor(scene, W, 'goku', ...G, { face: C, armL: [-.3, -1.45], lean: -.08 }); // "With HIM?!": pointing at each other
      const veg = actor(scene, W, 'vegeta', ...V, { face: C, armR: [-.3, 1.45], lean: -.08 });
      const camera = lens(44, C, 2.4, [t[0] + .4, t[1]], 1.1, g);
      snowfall(scene, camera, { n: 1200, depth: 20, spread: 16, size: .05 });
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[bul], [chi], [goku], [veg], [kri]], 16); subtitle(ctx, '悟空、贝吉塔：跟他一起？！', 'GOKU & VEGETA: With HIM?!'); } };
    },
  },

  '14-remote': {
    title: 'Love is not control · Krillin snaps the remote', time: '6:45',
    async build() {
      await fontsReady; const [px, pz] = SITES.palace; const { scene, W } = await islandScene('blizzard', { sun: [-.4, .8, .4], focus: [px, 30, pz - 3], area: 20, fogNear: 30, fogFar: 200 });
      const g = ground(W, px, pz - 3), K = [px - 1.5, pz - 3.2], E = [px + .7, pz - 3.4], F = [px + 3.4, pz - 6.4], C = [px - .6, pz + 1.6]; // inside the keep (z up to pz + 2)
      hoverPod(scene, [F[0], g, F[1]], 0);
      const fri = actor(scene, W, 'frieza', ...F, { y: g + .25, face: mix(K, C, .3), armR: [-1.4, .3], headPitch: -.1 });
      const kri = actor(scene, W, 'krillin', ...K, { y: g, face: mix(E, C, .35), armL: [-1.2, -.35], armR: [-1.2, .35] });
      inHand(kri, 'L', [.12, .14, .06], '#2b2b33'); inHand(kri, 'R', [.12, .14, .06], '#d6383f'); // the two halves
      const a18 = actor(scene, W, 'android18', ...E, { y: g, face: mix(K, C, .4), armL: [-.2, -.15], armR: [-.2, .15] });
      const camera = lens(44, C, 1.6, [px - .2, pz - 4], 1.3, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[fri], [kri], [a18]], 17); subtitle(ctx, '克林：没有人应该拿着控制自己在乎的人的遥控器。你自己选。', 'KRILLIN: Nobody should have a remote for someone they care about. You choose.'); } };
    },
  },

  '15-thaw': {
    title: 'Teamwork beats the freeze · the tower bursts into snowflakes', time: '7:05',
    async build() {
      await fontsReady; const [px, pz] = SITES.palace; const { scene, W } = await islandScene('golden', { sun: [.3, .5, .8], focus: [px, 30, pz + 16], area: 20, fogNear: 40, fogFar: 400 });
      // the heroes turn to the lens as the freeze tower bursts above the palace behind them (a wide lens tilted up)
      const m = [px + 1, pz + 18], g = ground(W, ...m), C = [px + 1.4, pz + 21.4], top = [px + 1, pz - 2]; // the open ground of the cocoa scene
      const burst = new T.Mesh(new T.SphereGeometry(6, 24, 14), glowMat(0xe8f8ff, .5)); burst.position.set(top[0], g + 27, top[1]); scene.add(burst);
      sparkles(scene, [top[0], g + 8, top[1] + 10], { n: 1600, radius: 26, height: 26 });
      const row = [['chichi', -3.4, 0, { armR: [-2.9, .3], armL: [-2.9, -.3] }], ['bulma', -2.2, -.4, { armR: [-2.6, .3] }], ['goku', -.6, .2, { armR: [-2.9, .2], groom: false }], ['vegeta', .6, .2, { ...CROSS }], ['krillin', 2, -.3, { armL: [-2.9, -.3], armR: [-2.9, .3] }], ['android18', 3.1, -.5, { armR: [-1.2, .2] }]];
      const heroes = row.map(([id, dx, dz, q]) => actor(scene, W, id, m[0] + dx, m[1] + dz, { face: C, ...q }));
      const camera = lens(68, C, 1.2, top, 11, g);
      return { scene, camera, bloom: [.5, .55, .75], overlay: (ctx, { project }) => { tags(ctx, project, heroes.map(c => [c]), 15); caption(ctx, 'Six heroes. One very surprised Frieza.', { y: 100, size: 34 }); } };
    },
  },

  '16-please': {
    title: 'Three proposals · Vegeta finally says it: "...PLEASE."', time: '7:40',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('night', { sun: [.2, .6, -.7], focus: [-82, 16, 90], area: 16, stars: true });
      const c0 = OUT(), m = [c0[0], c0[1] + 2], g = ground(W, ...m), V = [m[0] + .7, m[1]], Bu = [m[0] - .7, m[1] + .2], C = [m[0] - .6, m[1] - 4.6];
      const veg = actor(scene, W, 'vegeta', ...V, { face: [C[0] + 2.4, C[1]], armR: [-1.5, -.2], armL: [-.2, -.2] }); // the ring held out, his face turned away
      const boxR = inHand(veg, 'R', [.14, .12, .14], '#d6383f'); cube(boxR, [.05, .05, .05], [0, .09, 0], { all: '#ffe9a8' });
      const bul = actor(scene, W, 'bulma', ...Bu, { face: mix(V, C, .45), armL: [-2.3, .2], armR: [-2.3, -.2] });
      fireworks(scene, [[[m[0] + 16, g + 24, m[1] + 40], 0xff6fa8, 7], [[m[0] - 10, g + 28, m[1] + 46], 0x7fd0ff, 6], [[m[0] + 2, g + 34, m[1] + 54], 0xffe066, 8]]);
      const key = new T.PointLight(0xffd6e8, 8, 9); key.position.set(C[0] + .6, g + 2.4, C[1] + 1); scene.add(key);
      const camera = lens(42, C, 1.5, [m[0] + .6, m[1] + 4], 2.6, g);
      return { scene, camera, bloom: [.7, .5, .7], overlay: (ctx, { project }) => {
        const p = project([m[0] + 3, g + 22, m[1] + 48]); if (p) { ctx.save(); ctx.font = '900 64px "Arial Rounded MT Bold", Arial, sans-serif'; ctx.textAlign = 'center'; ctx.shadowColor = '#ff9ad5'; ctx.shadowBlur = 24; ctx.fillStyle = '#fff4fb'; ctx.fillText('MARRY ME', p[0], Math.max(90, p[1])); ctx.restore(); }
        tags(ctx, project, [[veg], [bul]], 17); subtitle(ctx, '贝吉塔：布尔玛……嫁给我。……请。', 'VEGETA: Bulma... marry me. ...PLEASE.');
      } };
    },
  },

  '17-wedding': {
    title: 'The triple wedding on the Central Plateau', time: '8:05',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [.3, .5, .8], focus: [P[0], 20, P[1]], area: 18 });
      // the couples stand under the arch facing their guests; the lens looks over the guests' heads
      const a = [P[0], P[1] - 3], g = ground(W, ...a), C = [P[0] + .3, P[1] + 7.6]; // in the aisle, above the back row
      await arch(scene, [a[0], g, a[1] - .8], 0, 7.4, 3.8);
      const pato = actor(scene, W, 'pato', a[0], a[1] - .6, { y: g + .5, face: C, armL: [-1.3, -.1], armR: [-1.3, .1] }); cube(scene, [.9, .5, .7], [a[0], g + .25, a[1] - .6], { all: '#f4f1e8' });
      const row = [['goku', -3.1, true], ['chichi_bride', -2.3], ['vegeta', -.45, true], ['bulma_bride', .45], ['krillin', 2.3, true], ['android18_bride', 3.1]];
      const couple = row.map(([id, dx, groom], i) => { const partner = [a[0] + row[i ^ 1][1], a[1] + .8]; return actor(scene, W, id, a[0] + dx, a[1] + .8, { face: mix(partner, C, .7), groom, [i % 2 ? 'armR' : 'armL']: [-.4, i % 2 ? .35 : -.35] }); }); // holding hands: facing the lens, the partner is on the groom's left
      const poc = actor(scene, W, 'pocoyo', a[0] - 1.1, a[1] + 2.2, { face: C, armL: [-1.3, -.1], armR: [-1.3, .1] }); cube(poc.armR, [.4, .08, .3], [-.15, -.42, -.12], { all: '#e05aa0' }); // the ring cushion
      const elly = actor(scene, W, 'elly', a[0] + 1.2, a[1] + 2.3, { face: C, armR: [-2.4, .4] });
      await weddingCake(scene, [a[0] + 6.4, ground(W, a[0] + 6.4, a[1] + .6), a[1] + .6]);
      const guests = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) { if (i === 5 || i === 6) continue; const x = a[0] - 5.5 + i, z = a[1] + 5.2 + r * 1.3; guests.push({ x, z, y: ground(W, x, z), yaw: Math.sin(i * 7 + r) * .15 }); }
      scene.add(crowd(guests, { mix: ['gi', 'saiyan', 'pocoyo', 'elly', 'pato', 'gabby', 'panda', 'cat', 'cakey', 'buu', 'bulma'], seed: 44 }));
      const fri = actor(scene, W, 'frieza', a[0] - 3.2, a[1] + 4, { face: mix(a, C, .6), armR: [-2.5, .4], headPitch: .2 }); // wiping a tear
      const pet = new T.MeshLambertMaterial({ color: 0xffc0dc, side: T.DoubleSide });
      for (let i = 0; i < 50; i++) { const p = new T.Mesh(new T.PlaneGeometry(.12, .12), pet); p.position.set(a[0] - 4 + Math.abs(Math.sin(i * 3.1)) * 8, g + .5 + Math.abs(Math.sin(i * 1.7)) * 4, a[1] + Math.abs(Math.sin(i * 2.3)) * 4); p.rotation.set(i, i * 2, 0); scene.add(p); }
      const camera = lens(42, C, 4.4, [a[0], a[1] + .6], 1.4, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [...couple.map(c => [c]), [pato], [poc], [elly], [fri, 'Frieza (crying)']], 14); subtitle(ctx, '琪琪：我保证会倾听。　悟空：我保证每天都在。', 'CHI-CHI: I promise to listen.   GOKU: I promise to show up.'); } };
    },
  },

  '18-ring-chase': {
    title: 'Twist · Loula runs off with the rings', time: '8:30',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [.5, .5, .7], focus: [P[0], 20, P[1]], area: 18 });
      const C = [P[0] + 3, P[1] + 4.6], g = ground(W, ...P), toward = (x, z) => mix([x, z], C, 1.4);
      const run = (id, x, z, q = {}) => actor(scene, W, id, P[0] + x, P[1] + z, { face: toward(P[0] + x, P[1] + z), walk: 1.2, stride: 1.1, ...q });
      const lou = run('loula', 2, 2.4); cube(lou.head, [.34, .08, .26], [0, .1, -.3], { all: '#e05aa0' });
      const poc = run('pocoyo', .2, .6, { armR: [-1.6, .2], armL: [-1.6, -.2] }), goku = run('goku', -1.6, -.6, { groom: true, armR: [-1.5, .2], walk: 2.4 });
      const chi = run('chichi_bride', -3.2, -1.4, { walk: .4 }), elly = run('elly', -4.6, -2.6, { walk: 2.8 });
      const veg = actor(scene, W, 'vegeta', P[0] - 1.6, P[1] - 4, { face: C, groom: true, ...CROSS });
      const bul = actor(scene, W, 'bulma_bride', P[0] - .6, P[1] - 4.4, { face: C, armR: [-2.3, .2], armL: [-.4, -.4] });
      const camera = lens(48, C, 1.3, [P[0] - 1.2, P[1] - 1.2], .8, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[lou], [poc], [goku], [chi], [elly], [veg], [bul]], 15); caption(ctx, 'The rings: last seen in a dog.', { y: 110, size: 36 }); } };
    },
  },

  '19-kids': {
    title: 'SERVER YEAR 15 · The kids plan their own tournament; Gohan writes the rules', time: '8:40',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('day', { sun: [.3, .6, .8], focus: [P[0], 30, P[1]], area: 16 });
      const m = [P[0], P[1] + 2], g = ground(W, ...m), C = [m[0] + .2, m[1] + 6.2];
      sign(scene, [m[0], g, m[1] - 1.8], 0, 'TENKAICHI BUDOKAI', { w: 4.4, h: 1 });
      const Gt = [m[0] - .5, m[1] + .6], Tr = [m[0] + .5, m[1] + .6];
      const gt = actor(scene, W, 'goten', ...Gt, { face: mix(Tr, C, .3), armR: [-1.4, .2], lean: .12 });
      const tr = actor(scene, W, 'trunks', ...Tr, { face: mix(Gt, C, .3), armL: [-1.4, -.2], lean: .12 });
      const mar = actor(scene, W, 'marron', m[0] - 1.6, m[1] + 1.4, { face: C, armL: [-.5, -.5], armR: [-.5, .5] });
      const bul = actor(scene, W, 'bulla', m[0] + 1.6, m[1] + 1.3, { face: mix([m[0], m[1] - 1.8], C, .5), armR: [-2.2, .3] }); cube(bul.armR, [.06, .3, .06], [0, -.7, -.05], { all: '#e05aa0' }); // a paintbrush
      const goh = actor(scene, W, 'gohan', m[0] - 2.9, m[1] + .2, { face: mix(Gt, C, .5), armL: [-1.3, -.1], armR: [-1.1, .2], headPitch: .2 });
      cube(goh.armL, [.34, .44, .04], [.1, -.66, -.14], { all: '#f4f1e8' }); // the rule book
      const camera = lens(42, C, 1.3, [m[0] - .5, m[1]], 1.1, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[gt], [tr], [mar], [bul], [goh]], 16); caption(ctx, 'SERVER YEAR 15', { y: 64, size: 40, color: '#ffd23a' }); subtitle(ctx, '悟饭：比赛要有规则：不许飞出擂台，比完要握手。', 'GOHAN: A tournament needs rules. No flying out of the ring, and shake hands after.'); } };
    },
  },

  '20-saiyaman': {
    title: "Gohan meets Videl · the Great Saiyaman's helmet falls out of his bag", time: '8:55',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [.4, .5, .8], focus: [bx, 20, bz + 10], area: 16 });
      const c = [bx + 2, bz + 10], g = ground(W, ...c), C = [c[0] + .3, c[1] + 5], Gh = [c[0] - .8, c[1]], Vi = [c[0] + .8, c[1] + .1];
      const goh = actor(scene, W, 'gohan', ...Gh, { face: mix(Vi, C, .4), armR: [-2.7, .1], armL: [-.3, -.2], headPitch: .1 }); // scratching his head
      const vid = actor(scene, W, 'videl', ...Vi, { face: mix(Gh, C, .4), armL: [-1.1, -.55], armR: [-.5, .5] });
      const helm = new T.Group(); vid.armL.add(helm); helm.position.set(-.05, -.78, -.12); // the Great Saiyaman's helmet, held out to the side as evidence (clear of her face)
      cube(helm, [.34, .3, .34], [0, 0, 0], { all: '#141414' }); cube(helm, [.3, .1, .02], [0, .02, -.18], { all: '#f08a24' });
      const bag = new T.Group(); scene.add(bag); bag.position.set(Gh[0] - .5, g, Gh[1] + .4); cube(bag, [.4, .3, .2], [0, .15, 0], { all: '#3a5aa8' }); cube(bag, [.3, .02, .16], [0, .31, 0], { all: '#2a4080' });
      const camera = lens(40, C, 1.6, c, 1.35, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[goh], [vid]], 17); subtitle(ctx, '维黛尔：教我飞，我就替你保密。　悟饭：不用交换，我也会教你。', "VIDEL: Teach me to fly, and I'll keep your secret.   GOHAN: I'll teach you anyway. Friends don't need deals."); } };
    },
  },

  '21-flying': {
    title: 'The flying lesson · "Gohan has a GIRLFRIEND!" "She\'s my friend." "...For now."', time: '9:10',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [-.4, .45, .8], focus: [P[0], 30, P[1]], area: 18 });
      const m = [P[0] - 2, P[1] + 1], g = ground(W, ...m), C = [m[0] + 1, m[1] + 6.4], Gh = [m[0] - 1, m[1]], Vi = [m[0] + .8, m[1] - .2];
      const goh = actor(scene, W, 'gohan', ...Gh, { face: mix(Vi, C, .35), armR: [-1.6, .2], armL: [-1.6, -.2] }); // hands ready, in case she wobbles
      const vid = actor(scene, W, 'videl', ...Vi, { y: g + .7, face: mix(Gh, C, .45), fly: true, flyLean: .1, armL: [-.3, -1.3], armR: [-.3, 1.3], legL: .15, legR: -.1 }); // arms out, wobbling
      const glow = new T.Mesh(new T.CircleGeometry(.6, 20), glowMat(0xffffff, .35)); glow.rotation.x = -Math.PI / 2; glow.position.set(Vi[0], g + .03, Vi[1]); scene.add(glow);
      const rock = [m[0] + 3.4, m[1] + 1.2]; cube(scene, [2.2, .5, 1.2], [rock[0], g + .25, rock[1]], { all: '#8a8a8a' });
      const peek = [['goten', -.6], ['trunks', .1], ['marron', .8]].map(([id, dx]) => actor(scene, W, id, rock[0] + dx, rock[1] - .9, { face: mix(Gh, C, .7), armL: [-2.6, -.1], armR: [-1.4, .2] }));
      const camera = lens(46, C, 1.5, [m[0] + 1.6, m[1]], 1.1, g);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[goh], [vid], ...peek.map(c => [c])], 15); subtitle(ctx, '悟天、特兰克斯："悟饭有女朋友啦！"　悟饭：她是我的朋友。　维黛尔：……暂时是。', "GOTEN & TRUNKS: Gohan has a GIRLFRIEND!   GOHAN: She's my friend.   VIDEL: ...For now."); } };
    },
  },

  '22-budokai': {
    title: 'The Tenkaichi Budokai · Marron wins the Junior final; Gohan referees', time: '9:25',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('day', { sun: [-.2, .6, -.75], focus: [P[0], 30, P[1]], area: 20 });
      const g0 = ground(W, ...P), top = await ring(scene, [P[0], g0, P[1]], 10), C = [P[0] + .4, P[1] - 5.6];
      const mar = actor(scene, W, 'marron', P[0] - .5, P[1] - .6, { y: top, face: C, armL: [-2.9, -.3], armR: [-.4, .3] });
      const goh = actor(scene, W, 'gohan', P[0] + .8, P[1] - .2, { y: top, face: C, armL: [-2.9, -.4] }); // raising the winner's hand
      const gt = actor(scene, W, 'goten', P[0] - 5.8, P[1] + 1, { face: [P[0], P[1]], sit: true, seat: g0 + .05, armR: [-1, .2] });
      const tr = actor(scene, W, 'trunks', P[0] + 5.8, P[1] + 1.4, { face: [P[0], P[1]], sit: true, seat: g0 + .05, armL: [-.9, -.4] });
      const fri = actor(scene, W, 'frieza', P[0] - 7.4, P[1] - 2.6, { face: mix([P[0], P[1]], C, .5), armR: [-1.6, .2] }); cube(fri.armR, [.08, .2, .08], [0, -.66, -.06], { all: '#2b2b33' }); // the microphone
      const fam = [['chichi', -4.4, 6.2], ['goku', -3.4, 6.4], ['videl', -2.4, 6.2], ['android18', -1.2, 6.4], ['krillin', -.4, 6.2], ['vegeta', 1.4, 6.4], ['bulma', 2.4, 6.4], ['bulla', 3.2, 6]].map(([id, dx, dz]) => actor(scene, W, id, P[0] + dx, P[1] + dz, { face: [P[0], P[1] - 4], armR: ['krillin', 'android18', 'videl'].includes(id) ? [-2.8, .3] : undefined, armL: id === 'krillin' ? [-2.8, -.3] : undefined }));
      scene.add(crowd(gather(140, { center: P, radius: 12, inner: 7, groundAt: W.groundAt, face: P, seed: 51, mix: ['gi', 'saiyan', 'pocoyo', 'gabby', 'cat', 'panda', 'elly', 'pato', 'bulma', 'buu', 'soldier'] }).filter(p => p.z > P[1] - 5 && !(p.z < P[1] + 7.2 && Math.abs(p.x - P[0]) < 5.2))));
      const camera = cam(50, [C[0], top + 1.2, C[1]], [P[0], top + 1.3, P[1] + 1.8]);
      return { scene, camera, overlay: (ctx, { project }) => { big(ctx, project, mar, 'Marron', 34); tags(ctx, project, [[goh], [gt], [tr], [fri], ...fam.map(c => [c])], 14); banner(ctx, 'TENKAICHI BUDOKAI', 'Junior final · winner: MARRON!', { color: '#ffd23a' }); subtitle(ctx, '悟天：打得好！明天再来一场？', 'GOTEN: Good match! Again tomorrow?'); } };
    },
  },

  '23-flip': {
    title: 'The exhibition match · Chi-Chi flips Goku again, just like the day they met', time: '9:35',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('golden', { sun: [-.3, .35, -.9], focus: [P[0], 30, P[1]], area: 20, fogNear: 80, fogFar: 500 });
      const g0 = ground(W, ...P), top = await ring(scene, [P[0], g0, P[1]], 10), C = [P[0] + .4, P[1] - 5.8];
      const goku = actor(scene, W, 'goku', P[0] + .6, P[1] + .4, { y: top, lie: true, yaw: 1.9, armR: [-2.9, .6], armL: [-2.9, -.6] });
      const chi = actor(scene, W, 'chichi', P[0] - .9, P[1] - .4, { y: top, face: C, armR: [-2.9, .3], armL: [-.5, -.5] });
      const fam = [['goten', -2.6, 4.6], ['trunks', -1.6, 4.8], ['bulla', 1.2, 4.8], ['marron', 2.2, 4.6], ['vegeta', 3.6, 5.6], ['bulma', 4.6, 5.4], ['gohan', -3.8, 5.6], ['videl', -4.8, 5.4]].map(([id, dx, dz]) => actor(scene, W, id, P[0] + dx, P[1] + dz, { y: dz < 5 ? top : undefined, face: C, armL: [-2.8, -.3], armR: [-2.8, .3] }));
      const camera = cam(48, [C[0], top + 2.2, C[1]], [P[0], top + .6, P[1] + 1.6]);
      return { scene, camera, overlay: (ctx, { project }) => { tags(ctx, project, [[goku], [chi], ...fam.map(c => [c])], 14); subtitle(ctx, '悟空：这是最棒的一场！', 'GOKU: Best. Fight. Ever.'); } };
    },
  },

  '24-fourth-wedding': {
    title: 'SERVER YEAR 22 · The fourth wedding: Gohan and Videl, under the same arch', time: '9:45',
    async build() {
      await fontsReady; const { scene, W } = await islandScene('dusk', { sun: [.3, .25, .9], focus: [P[0], 20, P[1]], area: 18, fogNear: 80, fogFar: 500 });
      const a = [P[0], P[1] - 3], g = ground(W, ...a), C = [P[0] + .3, P[1] + 5.4];
      await arch(scene, [a[0], g, a[1] - .8], 0, 7.4, 3.8);
      const Gh = [a[0] - .45, a[1] + .8], Vi = [a[0] + .45, a[1] + .8];
      const goh = actor(scene, W, 'gohan', ...Gh, { face: mix(Vi, C, .7), groom: true, armL: [-.4, -.35] });
      const vid = actor(scene, W, 'videl_bride', ...Vi, { face: mix(Gh, C, .7), armR: [-.4, .35] });
      const front = [['goten', -1.8, 2.2, { armR: [-2.8, .3] }], ['chichi', -2.6, 2.6, { armR: [-2.4, .4], headPitch: .2 }], ['goku', -3.4, 2.9, {}], ['marron', -4.1, 2.4, {}], ['krillin', 1.9, 2.3, { armR: [-2.8, .3] }], ['bulma', 2.6, 2.6, {}], ['vegeta', 3.4, 2.9, CROSS], ['android18', 4.2, 2.7, {}], ['bulla', 3.4, 1.9, {}], ['trunks', -3.4, 1.9, {}]];
      const guests = front.map(([id, dx, dz, q]) => actor(scene, W, id, a[0] + dx, a[1] + dz, { face: mix(a, C, .6), ...q }));
      const pet = new T.MeshLambertMaterial({ color: 0xffc0dc, side: T.DoubleSide });
      for (let i = 0; i < 50; i++) { const p = new T.Mesh(new T.PlaneGeometry(.12, .12), pet); p.position.set(a[0] - 4 + Math.abs(Math.sin(i * 3.1)) * 8, g + .5 + Math.abs(Math.sin(i * 1.7)) * 4, a[1] + Math.abs(Math.sin(i * 2.3)) * 4); p.rotation.set(i, i * 2, 0); scene.add(p); }
      const key = new T.PointLight(0xffe0c0, 8, 12); key.position.set(C[0], g + 2.6, C[1] - 1); scene.add(key);
      const camera = lens(48, C, 2.2, [a[0], a[1] + 1.4], 1.4, g);
      return { scene, camera, bloom: [.4, .5, .8], overlay: (ctx, { project }) => { tags(ctx, project, [[goh], [vid], ...guests.map(c => [c])], 13); subtitle(ctx, '爱不是赢，是每天都出现、说真话，让你爱的人自由地选择你。', "Love isn't winning. It's showing up, telling the truth, and letting the people you love choose you."); } };
    },
  },
};
