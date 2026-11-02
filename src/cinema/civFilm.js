// 1500 Cartoon Players Simulate Civilization · 1500名卡通玩家模拟文明. Direction: the cast, the sets that change over the
// twenty days (and the Grumbler invasion that ends them in a wedding), every scene's action, cameras, light and the documentary overlays (name tags, day cards, island counters,
// map pins, banners, the live broadcast and the credits). Built on the shared stage (createStage, meshWorld) and director
// (createDirector), so exports render at 1080p from a 2x supersampled picture with a mipmapped block atlas.
import * as T from 'three';
import { CIV_STORY as story, SCENE } from './civStory.js';
import { buildWorld, SITES, ISLANDS, SEA, RAIL } from './civWorld.js';
import { makeCharacter, posePlayer, cube, separateCoplanar, coplanarFaces, checkRig, bowTie } from './civCast.js';
import { crowd, gather } from './civCrowd.js';
import { aura, energyBall, nimbus, borderWall, fairyLights, toyHammer, bread, cookies, ocelot, mailbox, thrusterTrain, railBridge, sparkles, glowMat } from './civFx.js';
import { skyDome, mapTable, blockTower, armourStand, hoverPod, minecart } from './civFrames.js';
import { saucer, saucerSwarm, mothership, tractorBeam, gooRay, gooJelly, wreck } from './invasionProps.js';
import { arch, weddingCake, fireworks } from './wedProps.js';
import { nameTag, bigName, caption, counters, dayCard, mapPin, banner, broadcast, fontsReady } from './civOverlay.js';
import { blockTex, rand } from './claudeStage.js';
import { BLOCK_DEFS } from '../blocks.js';
import { at as walkPath } from './claudeDirector.js';
import { createDirector, v } from './claudeDirector.js';
import { clamp, ease, lerp } from './claudeActors.js';
import { buildCivSoundtrack, wavBase64 } from './civScore.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const W = await buildWorld();
const stage = { ...W.stage, groundAt: W.groundAt };
const { scene, camera, sun, hemi, renderer } = W.stage;
camera.far = 3200; camera.updateProjectionMatrix();
scene.add(W.group);
const G = (x, z) => W.groundAt(x, z);
const span = (t, a, b) => ease((t - a) / (b - a));
const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
const SC = name => SCENE[name];

// ------------------------------------------------------------------ sky, sun and looks
const sky = skyDome(scene, 0x7fa8d8, 0xf6d9b0, 0xffd9a0, [-.6, .45, .55], { stars: false });
scene.fog = new T.Fog(0xf0d6b4, 90, 700);
sun.shadow.camera.far = 900; sun.shadow.mapSize.set(4096, 4096);
const LOOKS = {
  golden: { top: 0x7fa8d8, horizon: 0xf6d9b0, glow: 0xffd9a0, sunColor: 0xffd7a8, sunI: 2.7, hemiSky: 0xdfe8ff, hemiGround: 0x8a6f52, hemiI: 1.15, fog: 0xf0d6b4, exposure: 1.0, stars: 0 },
  day: { top: 0x6fa6e0, horizon: 0xdbeaf3, glow: 0xfff3d6, sunColor: 0xfff2dc, sunI: 2.5, hemiSky: 0xdcecff, hemiGround: 0x7d7a52, hemiI: 1.3, fog: 0xd8e6ef, exposure: 1.02, stars: 0 },
  blizzard: { top: 0xaab8c6, horizon: 0xdfe6ec, glow: 0xe8eef2, sunColor: 0xe7eef6, sunI: 1.0, hemiSky: 0xe6eef6, hemiGround: 0x8f9cab, hemiI: 1.7, fog: 0xd9e1e8, exposure: 1.0, stars: 0 },
  night: { top: 0x0c1430, horizon: 0x2c3a5e, glow: 0x6a7cc0, sunColor: 0x8fa2d8, sunI: .55, hemiSky: 0x52608e, hemiGround: 0x1c2032, hemiI: .75, fog: 0x2a3550, exposure: 1.05, stars: 1 },
  cave: { top: 0x10141c, horizon: 0x10141c, glow: 0x000000, sunColor: 0x9fb4ff, sunI: .05, hemiSky: 0x4a5a8a, hemiGround: 0x1a1a24, hemiI: .5, fog: 0x0c1018, exposure: 1.1, stars: 0 },
  // the invasion: "Not grass green. Alien green."
  invasion: { top: 0x123a26, horizon: 0x9fe07a, glow: 0xd8ff9a, sunColor: 0xeaffd0, sunI: 2.1, hemiSky: 0xb0e8a0, hemiGround: 0x2f3a2a, hemiI: 1.15, fog: 0x7aa872, exposure: 1.0, stars: 0 },
  sunset: { top: 0x34407a, horizon: 0xff9a5c, glow: 0xffc070, sunColor: 0xffb070, sunI: 2.2, hemiSky: 0xb090c0, hemiGround: 0x4a3a40, hemiI: 1.0, fog: 0xd89070, exposure: 1.02, stars: 0 },
  dusk: { top: 0x2c3a6e, horizon: 0xf2a066, glow: 0xffb070, sunColor: 0xffb080, sunI: 1.3, hemiSky: 0x7080b0, hemiGround: 0x3a3040, hemiI: 1.0, fog: 0x8a7090, exposure: 1.05, stars: 0 },
  lobby: { top: 0xf2f4f8, horizon: 0xe9edf3, glow: 0xffffff, sunColor: 0xffffff, sunI: 1.4, hemiSky: 0xffffff, hemiGround: 0xc9d0da, hemiI: 1.5, fog: 0xe9edf3, exposure: 1.0, stars: 0 },
};
const mixLook = (A, B, k) => { const o = {}; for (const key in A) o[key] = typeof A[key] === 'number' && key.match(/top|horizon|glow|sunColor|hemiSky|hemiGround|fog/) ? new T.Color(A[key]).lerp(new T.Color(B[key]), k).getHex() : lerp(A[key], B[key], k); return o; };
function applyLook(L, { focus = [0, 20, 0], sunDir = [-.6, .45, .55], area = 40, near = 90, far = 700 } = {}) {
  const u = sky.material.uniforms, d = new T.Vector3(...sunDir).normalize();
  u.top.value.setHex(L.top); u.horizon.value.setHex(L.horizon); u.glow.value.setHex(L.glow); u.sunDir.value.copy(d); u.stars.value = L.stars > .5 ? 1 : 0;
  scene.fog.color.setHex(L.fog); scene.fog.near = near; scene.fog.far = far;
  sun.color.setHex(L.sunColor); sun.intensity = L.sunI; hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiI;
  sun.position.set(focus[0] + d.x * 300, focus[1] + d.y * 300, focus[2] + d.z * 300); sun.target.position.set(...focus); sun.target.updateMatrixWorld();
  const c = sun.shadow.camera; c.left = c.bottom = -area; c.right = c.top = area; c.updateProjectionMatrix();
  sun.shadow.normalBias = area > 50 ? .3 : .05;
  renderer.toneMappingExposure = L.exposure;
}

// ------------------------------------------------------------------ cast
const C = {}, cast = [];
function make(key, id, name = id) { const R = makeCharacter(id); Object.assign(R.root, { head: R.head, face: R.face, name }); C[key] = R; cast.push(R.root); return R; }
for (const [k, id, name] of [['goku', 'goku'], ['gokuL', 'goku_leather', 'goku'], ['gokuS', 'goku_ssj', 'goku'], ['vegeta', 'vegeta'], ['frieza', 'frieza'], ['bulma', 'bulma'], ['briefs', 'drbriefs'],
  ['krillin', 'krillin_leather', 'krillin'], ['yamchaL', 'yamcha_leather', 'yamcha'], ['yamcha', 'yamcha'], ['gohan', 'gohan'], ['gohanS', 'gohan_scarred', 'gohan'], ['videl', 'videl'], ['buu', 'buu'],
  ['trunks', 'trunks'], ['goten', 'goten'], ['pocoyo', 'pocoyo'], ['elly', 'elly'], ['pato', 'pato'], ['loula', 'loula'], ['nina', 'nina'], ['gabby', 'gabby'], ['pandy', 'pandy'], ['cakey', 'cakey'],
  ['mercat', 'mercat'], ['babybox', 'babybox'], ['djcatnip', 'djcatnip'], ['carlita', 'carlita'], ['soldier1', 'soldier', 'soldier1'], ['soldier2', 'soldier', 'soldier2'], ['soldier3', 'soldier', 'soldier3'],
  ['bear', 'polarbear', 'bear'], ['zombie', 'zombie'], ['krillin2', 'krillin', 'krillin'], ['gohanG', 'gohan', 'gohan'], ['videlB', 'videl_bride', 'videl'], ['commander', 'alien_boss', 'commander'], ['zib', 'alien_kid', 'zib'],
  ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => [`a${i}`, 'alien', `grumbler${i}`])]) make(k, id, name);
bowTie(C.gohanG); // the groom
for (let i = 1; i <= 8; i++) { const b = cube(C[`a${i}`].armR, [.1, .1, .3], [0, -.42, -.12], { all: '#5a5f6e' }); cube(b, [.06, .06, .12], [0, 0, -.2], { all: '#7dff6a' }); } // goo blasters
// every limb must move the way the poses below are written: a reach forward ends in front of the face, seated knees point
// ahead. A sign error here once sent every arm in the film backward, so it stops the film instead of rendering
{ const bad = Object.entries(C).flatMap(([k, R]) => checkRig(R, k)); if (bad.length) throw new Error('Rig check failed:\n' + bad.join('\n')); }
const LABEL = { goku: 'Goku', gokuL: 'Goku', gokuS: 'Goku', gohanS: 'Gohan', krillin: 'Krillin', yamchaL: 'Yamcha', briefs: 'Dr. Briefs', soldier1: 'Frieza soldier', soldier2: 'Frieza soldier', soldier3: 'Frieza soldier', bear: 'Polar bear', krillin2: 'Krillin', gohanG: 'Gohan', videlB: 'Videl', commander: 'Commander Grumbleflux', zib: 'Zib', ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => [`a${i}`, 'Grumbler'])) };
/** Pose a character for this frame and make it visible. q: posePlayer options; y defaults to the ground. */
function show(key, q) {
  const R = C[key]; R.root.visible = true;
  posePlayer(R, { ...q, y: q.y ?? G(q.x, q.z), t: q.t ?? 0 }); R.root.updateMatrixWorld(true); visibleNow.push(key); return R;
}
/** A walker: keys [[t, x, z, yaw?]]; returns options for show() (position, facing, walk phase). */
const walker = keys => { const w = walkPath(keys); return (t, q = {}) => { const s = w(t); return { x: s.x, z: s.z, yaw: s.yaw, walk: s.phase, stride: s.stride * .9, ...q }; }; };
/** Arm gesture: during [a, b] the arm eases to `to`, otherwise it hangs. */
const reach = (t, windows, rest) => { for (const [a, b, to] of windows) if (t > a - .4 && t < b + .4) { const k = Math.min(span(t, a - .4, a), 1 - span(t, b, b + .4)); return [lerp(rest?.[0] ?? 0, to[0], k), lerp(rest?.[1] ?? 0, to[1], k)]; } return rest; };
const WAVE = t => [-2.6 + Math.sin(t * 9) * .25, .35];
let visibleNow = [];

const D = await createDirector({ story, stage, cast, audioDir: 'cinema-civ', voiceScript: 'node scripts/narrate-claude.mjs civ-1500' });
const LINE = Object.fromEntries(story.lines.map(l => [l.id, l]));
const L = id => LINE[id].start, E = id => LINE[id].start + LINE[id].duration;
const { single: single0, front: front0 } = D.cams;
// block heads are big: keep singles and fronts a little wider than the human films do
const front = (a, o = {}) => front0(a, { ...o, dist: (o.dist ?? 1.4) * 1.6 }), single = (a, b, o = {}) => single0(a, b, { ...o, dist: (o.dist ?? 1.5) * 1.45 });

// ------------------------------------------------------------------ expressions
const X = D.expressions;
X('goku', [[0, 'happy'], [L('goku-wow'), 'excited'], [L('goku-hello'), 'joy'], [L('n-hungry'), 'sad'], [L('n-cold'), 'pained'], [L('n-zombie'), 'surprised'], [L('goku-hithere'), 'happy'], [E('yamcha-run'), 'shock'], [L('n-idea'), 'thinking'], [L('goku-breathe'), 'warm'],
  [SC('nimbus')[0], 'joy'], [L('goku-oops'), 'sheepish'], [SC('rally')[0], 'determined'], [L('goku-spirit'), 'joy'], [SC('battle')[0], 'determined'], [L('goku-gohan'), 'shock'], [L('goku-ride'), 'joy'], [L('goku-energy'), 'determined'], [SC('victory')[0], 'joy']]);
X('vegeta', [[0, 'stern'], [L('veg-prince'), 'proud'], [L('veg-map'), 'stern'], [L('veg-off'), 'shock'], [E('veg-off'), 'stern'], [L('veg-unbelievable'), 'bored'], [L('veg-train'), 'proud'], [SC('rally')[0], 'stern'], [L('veg-once'), 'determined'], [L('veg-train2'), 'excited']]);
X('frieza', [[0, 'knowing'], [L('frieza-mine'), 'greedy'], [L('frieza-know'), 'joy'], [SC('crash')[0], 'calm'], [L('frieza-palace'), 'shock'], [E('goku-oops'), 'stern'], [L('frieza-deal'), 'knowing'], [L('poc-peekaboo') + .8, 'pained'], [L('frieza-baby'), 'stern'],
  [L('frieza-king'), 'greedy'], [L('cmd-thanks') + 1, 'shock'], [L('n-lesson'), 'pained'], [SC('rally')[0], 'sulk'], [L('frieza-mine2'), 'stern'], [SC('wedding')[0], 'cry']]);
X('pocoyo', [[0, 'happy'], [L('poc-hello'), 'joy'], [L('poc-tower'), 'excited'], [L('poc-peekaboo'), 'joy'], [L('poc-aliens'), 'excited'], [SC('rally')[0], 'determined'], [SC('victory')[0], 'happy'], [L('poc-party'), 'joy'], [SC('wedding')[0], 'joy']]);
X('gabby', [[0, 'happy'], [L('gabby-panels'), 'excited'], [L('gabby-mailbox'), 'excited'], [SC('rally')[0], 'determined'], [L('gabby-walls'), 'excited']]);
X('pato', [[0, 'bored'], [L('pato-beak'), 'sulk'], [L('pato-quack'), 'joy'], [L('pato-armour'), 'proud']]);
X('krillin', [[0, 'pained'], [L('krillin-teeth'), 'cry'], [L('goku-breathe'), 'relieved'], [SC('fights')[0], 'determined']]);
X('yamcha', [[0, 'worried'], [L('yamcha-run'), 'shock'], [L('goku-breathe'), 'relieved'], [SC('photobomb')[0], 'greedy']]);
X('buu', [[0, 'joy'], [L('buu-yes'), 'excited'], [L('buu-customers'), 'joy'], [L('buu-candy'), 'excited']]);
X('bulma', [[0, 'determined'], [L('bulma-sand'), 'excited'], [E('briefs-cat'), 'bored'], [SC('rally')[0], 'determined']]);
X('drbriefs', [[0, 'calm'], [L('briefs-cat'), 'surprised']]);
X('goten', [[0, 'excited'], [L('goten-two'), 'hopeful'], [L('buu-yes'), 'joy'], [L('goten-noway'), 'determined']]);
X('trunks', [[0, 'determined']]);
X('gohan', [[0, 'curious'], [L('gohan-ocelots'), 'knowing'], [L('gohan-sure'), 'happy'], [SC('nimbus')[0], 'excited'], [SC('rally')[0], 'determined'], [L('gohan-never'), 'determined'], [L('gohan-partner'), 'warm'], [SC('backtoback')[0], 'determined'], [SC('proposal')[0], 'warm'], [SC('wedding')[0], 'happy']]);
X('videl', [[0, 'curious'], [L('videl-eco'), 'thinking'], [E('videl-eco'), 'happy'], [L('videl-fly'), 'hopeful'], [SC('rally')[0], 'determined'], [L('videl-gohan'), 'worried'], [L('videl-caught'), 'warm'], [SC('backtoback')[0], 'determined'], [SC('proposal')[0], 'warm'], [L('videl-yes'), 'joy'], [SC('wedding')[0], 'happy']]);
X('commander', [[0, 'stern'], [L('cmd-thanks'), 'greedy'], [SC('rally')[0], 'stern'], [SC('victory')[0], 'shock']]);
X('zib', [[0, 'worried'], [L('zib-hello'), 'hopeful'], [L('poc-party'), 'joy']]);
for (let i = 1; i <= 8; i++) X(`grumbler${i}`, [[0, 'stern']]);
X('mercat', [[0, 'warm']]); X('djcatnip', [[0, 'excited']]); X('babybox', [[0, 'curious'], [L('box-tada'), 'joy']]);
X('nina', [[0, 'excited']]); X('cakey', [[0, 'joy']]); X('elly', [[0, 'happy'], [L('elly-choo'), 'joy'], [SC('wedding')[0], 'warm']]); X('pandy', [[0, 'happy']]);
X('soldier1', [[0, 'stern'], [SC('grotto')[0], 'relieved']]); X('zombie', [[0, 'bored']]);

// ------------------------------------------------------------------ props (hidden every frame, shown by the scene that needs them)
const props = [];
const prop = o => { props.push(o); o.visible = false; return o; };
const group = () => { const g = new T.Group(); scene.add(g); return prop(g); };
// world borders: one around each island (phase I)
const islandBorders = group(); for (const I of Object.values(ISLANDS)) islandBorders.add(borderWall(new T.Group(), I.c[0] - I.r - 8, I.c[1] - I.r - 8, I.c[0] + I.r + 8, I.c[1] + I.r + 8, { y0: SEA - 4, height: 70, opacity: .42 }));
// clouds for the aerials
// opaque, and each puff a little taller and higher than the last: see-through puffs re-sort as the camera moves, and
// puffs with shared top faces z-fight, and both read as flicker
const clouds = group(); { const m = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8f99 }); for (let i = 0; i < 40; i++) { const g = new T.Group(); g.position.set((rand(i, 1) - .5) * 700, 95 + rand(i, 3) * 25, (rand(i, 2) - .5) * 700); for (let k = 0; k < 4; k++) { const b = new T.Mesh(new T.BoxGeometry(12 + rand(i, k) * 20, 4 + k * .45, 10 + rand(k, i) * 14), m); b.position.set((rand(k, i, 4) - .5) * 18, k * .3, (rand(i, k, 5) - .5) * 12); g.add(b); } clouds.add(g); } }
// snow: two stacked boxes of flakes that fall forever around the focus
const snow = group(); { const mk = () => { const g = new T.BufferGeometry(), n = 6000, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([(rand(i, 7) - .5) * 70, rand(i, 8) * 30, (rand(i, 9) - .5) * 70], i * 3); g.setAttribute('position', new T.BufferAttribute(a, 3)); return new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: .13, transparent: true, opacity: .9, depthWrite: false })); }; const a = mk(), b = new T.Points(a.geometry, a.material); b.position.y = 30; snow.add(a, b); } // b repeats a, so the fall tiles seamlessly
const snowAt = (p, t) => { snow.visible = true; snow.position.set(p[0] + Math.sin(t * .3) * 2.5, p[1] - 12 - (t * 3.2) % 30, p[2] + Math.cos(t * .23) * 2); };

// lobby: a white void floor high above the world
const LOBBY_Y = 420;
const lobby = group(); { const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({ color: 0xf3f5f8 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; lobby.add(floor); lobby.position.y = LOBBY_Y; }
const ALL = ['gi', 'saiyan', 'purpleGi', 'pocoyo', 'elly', 'pato', 'nina', 'gabby', 'panda', 'cat', 'cakey', 'bulma', 'buu', 'soldier', 'frieza'];
lobby.add(crowd(gather(1490, { center: [0, 52], radius: 42, inner: 4, face: [0, -30], seed: 3, mix: ALL })));
const lobbySpark = sparkles(lobby, [0, 0, 40], { n: 500, radius: 36, height: 6 });
// Hot Island: outpost dressing, war room, meeting tent
const [ox, oz] = SITES.outpost, OC = [ox + 1, oz + 14];
const outpost = group(); outpost.add(crowd(gather(24, { center: [ox - 6, oz + 4], radius: 7, inner: 6, groundAt: G, face: [ox, oz], seed: 8, mix: ['gi', 'gabby', 'bulma', 'cat', 'panda'] })));
const mbox = mailbox(outpost, [OC[0] + 1.6, G(OC[0] + 1.6, OC[1] - 1.2), OC[1] - 1.2], yawTo([OC[0] + 1.6, OC[1] - 1.2], [OC[0] + 6, OC[1] + 7]));
const panel = cube(outpost, [.9, .06, .6], [0, 0, 0], { all: '#3a5a8c', top: (p, w, h) => { p.fillStyle = '#21365a'; p.fillRect(0, 0, w, h); p.fillStyle = '#6f9ad6'; for (let i = 0; i < 4; i++) p.fillRect(1 + i * (w / 4), 1, w / 4 - 2, h - 2); } });
const parcels = [0, 1, 2].map(() => cube(outpost, [.4, .4, .4], [0, 0, 0], { all: '#c9a26a' }));
const [vx, vz] = SITES.vegetaMesa, TZ = vz - 8, VG = G(vx, TZ);
const warroom = group(); mapTable(warroom, [vx, VG, TZ]); armourStand(warroom, [vx + 3.3, VG, TZ - .4], -.5);
const towers = [1, 2, 3, 4, 5, 6, 7].map(n => { const g = blockTower(warroom, [vx - .4, VG + .98, TZ - .1], n); g.visible = false; return g; });
const gruntsDown = crowd(gather(30, { center: [vx + .5, TZ + 6], radius: 4, groundAt: () => VG, face: [vx - 1.6, TZ - .7], seed: 5, mix: ['saiyan', 'gi', 'purpleGi'] })); warroom.add(gruntsDown);
const gruntsUp = crowd(gather(30, { center: [vx + .5, TZ + 6], radius: 4, groundAt: () => VG, face: [vx - 1.6, TZ - .7], seed: 5, mix: ['saiyan', 'gi', 'purpleGi'] }).map((p, i) => ({ ...p, armUp: i % 2 ? 1 : 2 }))); warroom.add(gruntsUp);
const [mx, mz] = SITES.meetingHall, MG = G(mx, mz);
const meeting = group();
{ // Frieza's throne, from the game's purpur, purple wool and gold textures: a seat, a tall back, armrests and posts
  const [purpur, pillar, wool, gold] = await Promise.all(['purpur_block.png', 'purpur_pillar.png', 'purple_wool.png', 'gold_block.png'].map(blockTex));
  cube(meeting, [1.1, .5, .9], [mx, MG + .25, mz + 2.2], { all: purpur, top: wool });
  cube(meeting, [1.1, 1.7, .25], [mx, MG + .85, mz + 2.78], { all: purpur, front: wool });
  for (const s of [-1, 1]) { cube(meeting, [.18, .75, .9], [mx + s * .64, MG + .375, mz + 2.2], { all: pillar, top: gold }); cube(meeting, [.24, 2, .3], [mx + s * .67, MG + 1, mz + 2.78], { all: pillar, top: gold }); }
  cube(meeting, [1.58, .2, .36], [mx, MG + 2.1, mz + 2.78], { all: gold });
}
cube(meeting, [1, .6, .6], [mx + 1.8, MG + .3, mz + .6], { all: '#6b4a2c' }); for (let i = 0; i < 3; i++) { const b = cube(meeting, [.5, .12, .12], [mx + 1.6 + i * .12, MG + .66, mz + .5], { all: '#3a3a44' }); b.rotation.y = .3; }
const hammer = toyHammer(C.pocoyo.armR, [0, -.4, 0], [Math.PI, 0, 0]); prop(hammer);
// Cold Island: the palace keep (food hoard), the crash, the grotto, the Z-fighters' camp
const [px, pz] = SITES.palace, K = SITES.keep, KG = G(px, pz - 3); // groundAt includes the palace's ice floor
const palace = group(); hoverPod(palace, [px, KG, pz - 1], Math.PI);
for (let i = 0; i < 14; i++) cube(palace, [.9, .9, .9], [px - 5 + (i % 4) * 1, KG + .45 + Math.floor(i / 4) * .9, pz - 6.4 + (i % 3) * .3], { all: i % 3 ? '#c9a23a' : '#e9e2c8', top: i % 3 ? '#b38d2c' : '#f2ecd8' }); // hay and wool bales
for (let i = 0; i < 9; i++) bread(palace, [px + 3.4 + (i % 3) * .55, KG + .1 + Math.floor(i / 3) * .22, pz - 6 + (i % 2) * .3], [0, i * .4, 0]);
const palaceGuards = crowd(gather(14, { center: [px, pz + 16], radius: 3, groundAt: G, face: [px, pz + 30], seed: 4, costume: 'soldier' })); palace.add(palaceGuards);
const crashFx = group(); const iceMat = new T.MeshLambertMaterial({ color: 0x9fd6ff, emissive: 0x1a3550 });
const debris = Array.from({ length: 70 }, (_, i) => { const s = .2 + rand(i, 1) * .6, m = new T.Mesh(new T.BoxGeometry(s, s, s), iceMat); m.castShadow = true; crashFx.add(m); return { m, dir: new T.Vector3((rand(i, 2) - .5) * 9, 2 + rand(i, 3) * 6, 2 + rand(i, 4) * 8), spin: rand(i, 5) * 6 }; });
const flash = new T.Mesh(new T.SphereGeometry(3.5, 24, 12), glowMat(0xdff2ff, .35)); crashFx.add(flash);
const nimbusCloud = prop(nimbus(scene, [0, 0, 0], 1.2));
const [gx, gz] = SITES.grotto, F0 = SITES.grottoFloor;
const grotto = group(); cube(grotto, [1.2, .7, .6], [gx + 3.2, F0 + .35, gz + 1.2], { all: '#2b2b33', top: (p, w, h) => { p.fillStyle = '#2b2b33'; p.fillRect(0, 0, w, h); p.fillStyle = '#a254e8'; p.fillRect(w * .1, h * .2, w * .35, h * .6); p.fillRect(w * .55, h * .2, w * .35, h * .6); } });
const lightStrings = [[[gx - 6, F0 + 5.2, gz - 3.5], [gx + 6, F0 + 5.4, gz - 3]], [[gx - 6, F0 + 5, gz + 3.5], [gx + 6, F0 + 5.2, gz + 3]], [[gx - 4, F0 + 5.8, gz - 4], [gx - 2, F0 + 5.8, gz + 4]], [[gx + 2, F0 + 5.8, gz - 4], [gx + 4, F0 + 5.8, gz + 4]]].map(([a, b], i) => fairyLights(grotto, a, b, { n: 20, sag: 1, light: i < 2 }));
for (const [dx, dz] of [[-3, 1], [3, -2], [1, 3]]) { const l = new T.PointLight(0x5ff0ff, 12, 8); l.position.set(gx + dx, F0 - .2, gz + dz); grotto.add(l); }
{ const l = new T.PointLight(0xffb070, 14, 18); l.position.set(gx - 2, F0 + 4, gz); grotto.add(l); }
const [kx, kz] = SITES.goku;
const camp = group(); const campfire = new T.Group(); camp.add(campfire); campfire.position.set(kx + .5, G(kx + .5, kz + 2.5), kz + 2.5);
// the game's campfire: crossed campfire logs and two crossed planes of the fire texture (scaled per frame to flicker)
const fire = new T.Group(); campfire.add(fire);
{ const log = await blockTex('campfire_log.png'), flame = await blockTex('fire.png'), flameMat = new T.MeshBasicMaterial({ map: flame, transparent: true, alphaTest: .1, side: T.DoubleSide, depthWrite: false, toneMapped: false });
  for (const r of [.4, .4 + Math.PI / 2]) cube(campfire, [.9, .2, .22], [0, .1, 0], { all: log }, { rot: [0, r, 0] });
  for (const r of [Math.PI / 4, -Math.PI / 4]) { const q = new T.Mesh(new T.PlaneGeometry(.8, .8), flameMat); q.rotation.y = r; q.position.y = .55; fire.add(q); } } const fireLight = new T.PointLight(0xff9a40, 18, 14); fireLight.position.y = 1; campfire.add(fireLight);
// the ring leaves a gap where Goku stands to teach, so the lens in front of him sees him and the fire
const listeners = crowd(gather(26, { center: [kx + .5, kz + 2.5], radius: 5, inner: 3, groundAt: G, face: [kx + .5, kz + 2.5], seed: 11, mix: ['cat', 'panda', 'cakey', 'soldier', 'gabby', 'pocoyo'] }).filter(p => Math.abs(p.x - kx - .5) > 1.8 || p.z < kz + 2.5)); camp.add(listeners);
const auras = group(); for (let i = 0; i < 6; i++) { const a = new T.Mesh(new T.CylinderGeometry(4 + i * .6, 4 + i * .6, .1, 32, 1, true), glowMat(0xfff0a0, .12)); auras.add(a); }
// Temperate Island: bakery queue, park minecarts, café
const [bx, bz] = SITES.bakery, door = [bx, bz + 6.6], DY = G(...door);
const bakery = group(); cookies(bakery, [door[0] - .8, DY + 1.32, door[1] - .4]);
bakery.add(crowd(Array.from({ length: 14 }, (_, i) => ({ x: bx + 1.4 + i * .85, z: bz + 8.2 + i * .45 + Math.sin(i * .9) * .3 })).map(p => ({ ...p, yaw: yawTo([p.x, p.z], door), y: G(p.x, p.z) })), { mix: ['gi', 'pocoyo', 'gabby', 'soldier', 'cat', 'saiyan', 'elly', 'frieza'], seed: 12 }));
const [qx, qz] = SITES.park, railAt = (i, lane = 0) => { const x = qx + 8 + i, z = qz - 10 + Math.round(i * .3) + lane; return [x + .5, G(x, z) + .1, z + .5]; }; // two parallel rails, one per cart
const rail = (i, lane) => { const a = railAt(Math.floor(i), lane), b = railAt(Math.floor(i) + 1, lane), k = i - Math.floor(i); return [lerp(a[0], b[0], k), lerp(a[1], b[1], b[1] > a[1] ? clamp(k / .45) : clamp((k - .55) / .45)), lerp(a[2], b[2], k)]; }; // carts climb onto a higher step before its edge, and roll off a lower one after it
const park = group(); const carts = [minecart(park, [0, 0, 0]), minecart(park, [0, 0, 0])];
const [cx, cz] = SITES.cafe, TY = G(cx, cz + 7.5), tbl = [cx - 1.5, cz + 7.6];
const cafe = group(); cube(cafe, [1.4, .08, 1.1], [tbl[0], TY + .8, tbl[1]], { all: '#f1e4c8' }); cube(cafe, [.12, .8, .12], [tbl[0], TY + .4, tbl[1]], { all: '#5a3c22' });
for (const s of [-1, 1]) cube(cafe, [.5, .45, .5], [tbl[0] + s * 1.15, TY + .22, tbl[1]], { all: '#a8743c' });
cube(cafe, [.5, .04, .36], [tbl[0] - .3, TY + .86, tbl[1]], { all: '#ffffff', top: (p, w, h) => { p.fillStyle = '#fff'; p.fillRect(0, 0, w, h); p.fillStyle = '#666'; for (let i = 1; i < 6; i++) p.fillRect(2, i * h / 6, w - 4, 1); } });
cookies(cafe, [tbl[0] + .4, TY + .9, tbl[1] + .2], 3);
const cats = [ocelot(cafe, [tbl[0] + .5, TY + .84, tbl[1] - .3], 2.2), ocelot(cafe, [tbl[0] + 3.6, TY, tbl[1] + 1.2], -2), ocelot(cafe, [tbl[0] - 2.8, TY, tbl[1] + 1.4], .6)];
cafe.add(crowd(gather(10, { center: [cx + 7, cz + 10], radius: 2.5, groundAt: G, face: [tbl[0], tbl[1]], seed: 13, mix: ['gabby', 'cat', 'gi', 'pocoyo'] }))); // beside the terrace, out of the cameras' line to the table
// trade: the rail bridge, the train, the land line to the bakery, the parcels from the mailbox
const BR = RAIL, BY = SEA + 5;
const trade = group(); railBridge(trade, BR[0], BR[1], BY);
{ const len = Math.hypot(BR[2][0] - BR[1][0], BR[2][1] - BR[1][1]), steps = Math.ceil(len); for (let i = 0; i <= steps; i++) { const k = i / steps, x = lerp(BR[1][0], BR[2][0], k), z = lerp(BR[1][1], BR[2][1], k); const sl = cube(trade, [1.6, .12, .4], [x, Math.max(G(x, z), BY - 1.5 + 0) + .06, z], { all: '#6b4a2c' }); sl.rotation.y = Math.atan2(BR[2][0] - BR[1][0], BR[2][1] - BR[1][1]); } }
const train = prop(thrusterTrain(scene, [0, 0, 0], 0, 4));
const trainAt = u => { // u in 0..1 along bridge then land; returns [x, y, z, yaw]
  const l1 = Math.hypot(BR[1][0] - BR[0][0], BR[1][1] - BR[0][1]), l2 = Math.hypot(BR[2][0] - BR[1][0], BR[2][1] - BR[1][1]), d = u * (l1 + l2);
  const [a, b, k] = d < l1 ? [BR[0], BR[1], d / l1] : [BR[1], BR[2], (d - l1) / l2], x = lerp(a[0], b[0], k), z = lerp(a[1], b[1], k);
  return [x, d < l1 ? BY + .2 : Math.max(BY + .2 - (d - l1) * .4, G(x, z) + .1), z, Math.atan2(a[0] - b[0], a[1] - b[1])];
};
// the invasion (Act III, see INVASION_STORY.md): the plateau's pink fortress, the Grumbler fleet and army, the battle's
// goo rays and jelly, the finale, and the wedding
const [sx, sz] = SITES.plateau, SG = G(sx, sz), FC = [sx, sz - 4]; // the fortress rings (radius 5.4 and 9) stand round FC
const fort = group();
{ const ring = 9, h = 1.6; for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2; if (Math.abs(a - Math.PI / 2) < .18) continue; const m = cube(fort, [ring * .14, h, .8], [FC[0] + Math.cos(a) * ring, SG + h / 2, FC[1] + Math.sin(a) * ring], { all: i % 2 ? '#f27fb7' : '#e05aa0' }); m.rotation.y = -a + Math.PI / 2; if (i % 2 === 0) cube(fort, [.6, .6, .6], [FC[0] + Math.cos(a) * ring, SG + h + .3, FC[1] + Math.sin(a) * ring], { all: '#f27fb7' }); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + .3, x = FC[0] + Math.cos(a) * ring, z = FC[1] + Math.sin(a) * ring; cube(fort, [1.4, 6, 1.4], [x, SG + 3, z], { all: '#f6c3dc' }); const roof = new T.Mesh(new T.ConeGeometry(1.1, 1.8, 4), new T.MeshLambertMaterial({ color: 0xa254e8 })); roof.position.set(x, SG + 6.9, z); roof.rotation.y = Math.PI / 4; fort.add(roof); } }
const fortClip = new T.Plane(new T.Vector3(0, -1, 0), SG + 20); const clip = m => { const c = m.clone(); c.clippingPlanes = [fortClip]; return c; }; fort.traverse(o => { if (o.material) o.material = Array.isArray(o.material) ? o.material.map(clip) : clip(o.material); }); renderer.localClippingEnabled = true;
const outsideFort = p => Math.hypot(p.x - FC[0], p.z - FC[1]) > 10;
const CROSS = { armL: [-1.25, .75], armR: [-1.25, -.75] }, mix2 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; // arms folded; a point k of the way from a to b
const HEROES = ['gi', 'saiyan', 'purpleGi', 'pocoyo', 'elly', 'pato', 'gabby', 'panda', 'cat', 'cakey', 'buu', 'bulma', 'nina', 'soldier'];
// the fleet: a sky full of saucers over the islands, a nearer squadron over the plateau, and the mothership
const fleet = group(); saucerSwarm(fleet, [0, 75, -10], [170, 28, 150], 520, { rMin: 2.5, rMax: 5.5, seed: 11 });
const squadron = group(); saucerSwarm(squadron, [sx, SG + 40, sz - 60], [80, 14, 30], 140, { seed: 7 });
const MS = mothership(scene, [0, 0, 0], 40); prop(MS.group);
const beamPalace = group(); tractorBeam(beamPalace, [px, KG + 72, pz - 6], [px, KG + 2, pz - 2], { radius: 16 });
const palaceIce = Array.from({ length: 60 }, (_, i) => { const s = .6 + rand(i, 31) * 1.8, m = new T.Mesh(new T.BoxGeometry(s, s, s), iceMat); m.castShadow = true; beamPalace.add(m); return { m, x: px + (rand(i, 32) - .5) * 22, z: pz - 4 + (rand(i, 33) - .5) * 16, y0: KG + 6 + rand(i, 34) * 30, spin: rand(i, 35) * 3 }; });
const podOut = prop(hoverPod(scene, [0, 0, 0])), cmdSaucer = prop(saucer(scene, [0, 0, 0], 1.3));
const BF = [px - 12, pz + 34], BFC = [px - 15.5, pz + 41]; // Frieza out in the snowfield, and the lens that sees him, the palace and the beam
// the rally: Bulma's map table in the inner ring
const RT = [FC[0], FC[1] - .5], RTC = [RT[0] + .4, RT[1] + 4.6], rally = group(); mapTable(rally, [RT[0], SG, RT[1]]);
rally.add(crowd(gather(120, { center: FC, radius: 8.6, inner: 4.6, groundAt: G, face: RT, seed: 41, mix: HEROES }).filter(p => p.z < FC[1] - 2.8)));
// the battle: the heroes inside the walls, the Grumblers advancing from the north, saucers firing goo
const NORTH = FC[1] - 9; // the outer wall's north side
const defenders = group(); defenders.add(crowd(gather(260, { center: FC, radius: 8.6, inner: 1.5, groundAt: G, face: [FC[0], FC[1] - 40], seed: 31, mix: HEROES }).filter(p => p.z < FC[1] + 2 && !(p.x > FC[0] - 1.2 && p.x < FC[0] + 4.2 && p.z > FC[1] - 3.6 && p.z < FC[1] + 1.4)).map((p, i) => ({ ...p, armUp: i % 4 === 0 ? 1 : undefined }))));
const army = group(); army.add(crowd([...gather(560, { center: [FC[0], NORTH - 18], radius: 16, groundAt: G, face: FC, seed: 32, costume: 'alien' }), ...gather(40, { center: [FC[0] + 1, NORTH - 3.4], radius: 4.5, groundAt: G, face: FC, seed: 33, costume: 'alien' })].filter(p => p.z < NORTH - 1.5 && Math.hypot(p.x - FC[0] - 3.5, p.z - NORTH + 7.3) > 3.2), { seed: 32, angry: true }));
const RAYS = [[-6, -22, 13, .1], [3, -26, 16, -.15], [9, -18, 11, .2], [-12, -28, 18, 0], [14, -30, 20, .1]];
const battleSaucers = group(), rays = RAYS.map(([x, z, h, tilt], i) => { const s = [FC[0] + x, SG + h, FC[1] + z]; saucer(battleSaucers, s, 2.4, { tilt: [tilt, 0] }); const r = new T.Group(); battleSaucers.add(r); gooRay(r, [s[0], s[1] - .5, s[2]], [s[0] + (x > 0 ? -2 : 2), SG + .6, FC[1] - 6 + x * .1]); return r; });
const jellies = group(); for (const [x, z] of [[-4, -4], [1, -2.5], [5, -3.5]]) { const y = G(FC[0] + x, FC[1] + z); gooJelly(jellies, [FC[0] + x, y, FC[1] + z]); jellies.add(crowd([{ x: FC[0] + x, y, z: FC[1] + z, yaw: Math.PI, costume: 'pocoyo' }])); }
// everyone fights: Krillin's disc and the saucer it halves, Buu's candy, the cats
const disc = group(); { const d = new T.Mesh(new T.CylinderGeometry(1, 1, .04, 40), glowMat(0xffe66a, .9)); disc.add(d, new T.Mesh(new T.CylinderGeometry(1.3, 1.3, .02, 40), glowMat(0xfff4b0, .35))); }
const DS = [FC[0] + 2, SG + 10, NORTH - 6], KR = [FC[0] + 1.5, NORTH + 3.5], KRC = [KR[0] + 1.2, KR[1] + 3.6]; // the saucer Krillin's disc cuts in two, and where he throws from
const discTarget = prop(saucer(scene, DS, 2.2));
const halves = [0, 1].map(() => { const s = prop(saucer(scene, [0, 0, 0], 2.2)); s.scale.z *= .5; return s; });
const candy = group(); for (let i = 0; i < 70; i++) { const c = new T.Mesh(new T.BoxGeometry(.14, .14, .14), new T.MeshLambertMaterial({ color: [0xff6fa8, 0xffe14a, 0x7fd0ff, 0xb98bff, 0x7dff6a][i % 5], emissive: 0x222222 })); c.userData.d = [Math.sin(i * 1.3), Math.abs(Math.sin(i * 2.1)) + .3, Math.cos(i * 1.7)]; candy.add(c); }
const candyRay = group(); const BUU = [FC[0] + 5.2, FC[1] - 3.6], BUUC = [BUU[0] + 1.2, BUU[1] + 4]; // east of Krillin, so neither is in the other's shot gooRay(candyRay, [BUU[0] + 5, SG + 9, BUU[1] - 9], [BUU[0] + .4, SG + 2.6, BUU[1] - .6]);
const catsUp = group(); catsUp.add(crowd(gather(16, { center: [FC[0] - 5, FC[1] - 6.5], radius: 2.2, groundAt: G, face: [FC[0] - 5, FC[1] - 20], seed: 61, mix: ['cat', 'panda', 'cakey'] }).map(p => ({ ...p, armUp: 2 }))));
// the tractor beam, the Nimbus catch and the ring of Grumblers, south of the walls
const BM = [sx - 4, sz + 9], BMC = [BM[0] + 1.6, BM[1] + 6], beamFx = group(); saucer(beamFx, [BM[0], SG + 15, BM[1] - 1], 3); tractorBeam(beamFx, [BM[0], SG + 14.4, BM[1] - 1], [BM[0], SG, BM[1] - 1], { radius: 2.4, soft: true });
const beamCrowd = group(); beamCrowd.add(crowd(gather(60, { center: [BM[0], BM[1] - 5], radius: 6, inner: 2, groundAt: G, face: [BM[0], BM[1] - 1], seed: 71, mix: HEROES }).filter(p => p.z < BM[1] - 2 && outsideFort(p)).map(p => ({ ...p, armUp: 2 }))));
const blast = group(); const blastRay = new T.Group(); blast.add(blastRay);
const CB = [sx + 6, sz + 6], CBC = [CB[0] - .6, CB[1] + 4.6], GO = [sx, sz + 11], GOC = [GO[0] + 1, GO[1] + 4]; // where Videl catches Gohan; Goku watching
const B2B = [sx - 4, sz + 9], B2BC = [B2B[0] + .4, B2B[1] + 5.4]; // back to back
const GRUNTS = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
const ringArmy = group(); ringArmy.add(crowd(gather(170, { center: B2B, radius: 12, inner: 5, groundAt: G, face: B2B, seed: 81, costume: 'alien' }).filter(p => p.z < B2B[1] + 2 && outsideFort(p)), { angry: true }));
const b2bRays = group(); gooRay(b2bRays, [B2B[0] - 3.4, SG + .8, B2B[1] - 2.2], [B2B[0] - 1.6, SG + .3, B2B[1] - .2]); gooRay(b2bRays, [B2B[0] + 3.6, SG + .8, B2B[1] - 2], [B2B[0] + 1.8, SG + .3, B2B[1] - .4]);
// the finale: everyone's hands up round Goku, the eye under the mothership, Gohan and Videl's beam, the crack
const GK = [sx, sz + 9], GKC = [GK[0] + 3, GK[1] + 6], EYE = [sx - 6, SG + 70 - 40 * .065, sz - 30], GV = [EYE[0] + 6, EYE[1] - 16, EYE[2] + 4];
const handsRing = []; for (let i = 0; i < 140; i++) { const a = i / 140 * Math.PI * 2, r = 4 + (i % 4) * 1.4, x = GK[0] + Math.cos(a) * r, z = GK[1] + Math.sin(a) * r; if (!outsideFort({ x, z })) continue; handsRing.push({ x, z, y: G(x, z), yaw: yawTo([x, z], [GK[0], GK[1] - 30]) }); }
const ringDown = group(); ringDown.add(crowd(handsRing, { mix: HEROES, seed: 91 }));
const ringUp = group(); ringUp.add(crowd(handsRing.map((p, i) => ({ ...p, armUp: i % 2 ? 1 : 2 })), { mix: HEROES, seed: 91 }));
const spiritBomb = prop(energyBall(scene, [0, 0, 0], 1, { core: 0x9fdcff, glow: 0x4aa8ff, light: 8, range: 40 }));
const masenko = group(); gooRay(masenko, [GV[0] + .9, GV[1] + 1.4, GV[2]], [EYE[0], EYE[1] - .4, EYE[2]], { color: 0xffe066, width: .5 });
const crackFlash = prop(new T.Mesh(new T.SphereGeometry(5, 16, 10), glowMat(0xfff6c0, .7))); scene.add(crackFlash);
const kiAura = prop(aura(scene, [0, 0, 0], { color: 0xffe066 })), whiteAura = prop(aura(scene, [0, 0, 0], { color: 0xffffff, h: 2.2, r: .7, sparks: 0 })); // no sparks: the breathing close-up looks through it
// victory and the proposal: wrecked saucers, and the cheering crowd
const wrecks = group(); for (const [x, z, r] of [[-7, 8, 2], [8, 6, 2.4], [-11, 14, 1.8], [5, 17, 2.2]]) wreck(wrecks, [sx + x, G(sx + x, sz + z), sz + z], r, .55);
const smoke = group(); for (let i = 0; i < 14; i++) { const s = new T.Mesh(new T.SphereGeometry(4 + i * .8, 10, 8), new T.MeshLambertMaterial({ color: 0x8a8f99, transparent: true, opacity: .32 - i * .02, depthWrite: false })); s.position.set(i * 5, -i * 3, i * 9); smoke.add(s); }
const VC = [sx + 1, sz + 10], VCC = [VC[0] + .3, VC[1] + 4.6], PR = [sx - 2, sz + 7.5], PRC = [PR[0] + 3.2, PR[1] + 3.2]; // Pocoyo meets Zib; the proposal
const cheer = group(); cheer.add(crowd(gather(150, { center: [VC[0], VC[1] - 6], radius: 9, inner: 2.5, groundAt: G, face: [VC[0], VC[1] + 5], seed: 95, mix: HEROES }).filter(p => p.z < VC[1] - 3.5 && outsideFort(p)).map((p, i) => ({ ...p, armUp: i % 3 ? 2 : 1 }))));
const ringBox = new T.Group(); C.gohanS.armR.add(ringBox); ringBox.position.set(0, -.62, -.04); cube(ringBox, [.14, .12, .14], [0, 0, 0], { all: '#d6383f' }); cube(ringBox, [.05, .05, .05], [0, .09, 0], { all: '#ffe9a8' }); prop(ringBox);
const patoArmour = new T.Group(); C.pato.torso.add(patoArmour); cube(patoArmour, [.5, .34, .4], [0, .2, 0], { all: '#d8dde6' }); for (const s of [-1, 1]) cube(patoArmour, [.16, .08, .3], [s * .26, .38, 0], { all: '#e8c04a' }); prop(patoArmour);
// the wedding: the arch, rows of guests from every island, Buu's cake, the lights, a Grumbler saucer as the party light, fireworks
const WA = [sx, sz - 3], WC = [WA[0] + .2, WA[1] + 6.6], wedding = group();
await arch(wedding, [WA[0], G(...WA), WA[1] - .8], 0, 7.4, 3.8);
const CAKE = [WA[0] + 6.2, WA[1] - 1.6], GBC = [CAKE[0] + 8, CAKE[1] + 2], cakeTop = await weddingCake(wedding, [CAKE[0], G(...CAKE), CAKE[1]], 6);
{ const rows = []; for (let r = 0; r < 5; r++) for (let i = 0; i < 16; i++) { if (i === 7 || i === 8) continue; const x = WA[0] - 7.5 + i, z = WA[1] + 4.6 + r * 1.3; rows.push({ x, z, y: G(x, z), yaw: Math.sin(i * 7 + r) * .15 }); } wedding.add(crowd(rows, { mix: [...HEROES, 'alien'], seed: 101 })); }
cube(wedding, [.9, .4, .7], [WA[0], G(...WA) + .2, WA[1] - .4], { all: '#f4f1e8' }); // Elly's step
fairyLights(wedding, [WA[0] - 8, G(...WA) + 5.4, WA[1] + 1.6], [WA[0] + 8, G(...WA) + 5.4, WA[1] + 1.6], { sag: 1 });
saucer(wedding, [WA[0], G(...WA) + 9, WA[1] + 3], 1.2);
const petals = group(); { const pet = new T.MeshLambertMaterial({ color: 0xffc0dc, side: T.DoubleSide }); for (let i = 0; i < 60; i++) { const p = new T.Mesh(new T.PlaneGeometry(.12, .12), pet); p.userData.o = [WA[0] - 4 + Math.abs(Math.sin(i * 3.1)) * 8, .5 + Math.abs(Math.sin(i * 1.7)) * 4, WA[1] + Math.abs(Math.sin(i * 2.3)) * 4, i]; petals.add(p); } }
const fwSky = group(); const bursts = fireworks(fwSky, [[[WA[0] + 16, SG + 22, WA[1] - 30], 0xff6fa8, 7], [[WA[0] - 14, SG + 26, WA[1] - 34], 0x7fd0ff, 6], [[WA[0] + 2, SG + 32, WA[1] - 40], 0xffe066, 8], [[WA[0] - 26, SG + 20, WA[1] - 26], 0x9dff7a, 6]]);
const dancers = group(); dancers.add(crowd(gather(140, { center: [CAKE[0] - 3, CAKE[1] + 1], radius: 7, inner: 2.2, groundAt: G, face: [CAKE[0] - 3, CAKE[1] + 1], seed: 111, mix: [...HEROES, 'alien'] }).filter(p => p.z < CAKE[1] + 4).map((p, i) => ({ ...p, walk: i, armUp: i % 4 === 0 ? 2 : undefined }))));

for (const p of props) separateCoplanar(p); // props are built from cube() too: no flush, same-facing faces

// ------------------------------------------------------------------ portraits for the map pins (rendered once, by a small separate renderer)
const portraits = {};
{
  const r = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); r.setSize(256, 256); r.outputColorSpace = T.SRGBColorSpace;
  for (const key of ['vegeta', 'frieza', 'pocoyo', 'bulma', 'goku', 'mercat', 'buu', 'gabby', 'gohan']) {
    const s = new T.Scene(); s.background = new T.Color(0x9fc7e8); s.add(new T.HemisphereLight(0xffffff, 0x88aacc, 2.2)); const d = new T.DirectionalLight(0xffffff, 1.6); d.position.set(-2, 3, -4); s.add(d);
    const R = makeCharacter(key === 'gohan' ? 'gohan' : key); s.add(R.root); posePlayer(R, { yaw: 0 }); R.root.updateMatrixWorld(true);
    const hp = new T.Vector3(); R.head.getWorldPosition(hp); hp.y += (R.dims.hh ?? .5) * R.root.scale.x * .55;
    const cam = new T.PerspectiveCamera(30, 1, .1, 50); cam.position.set(hp.x, hp.y + .02, hp.z - 2.4); cam.lookAt(hp); r.render(s, cam);
    const c = document.createElement('canvas'); c.width = c.height = 128; c.getContext('2d').drawImage(r.domElement, 0, 0, 128, 128); portraits[key] = c;
  }
  r.dispose();
}
const pinFace = key => (ctx, x, y, s) => ctx.drawImage(portraits[key], x, y, s, s);

// ------------------------------------------------------------------ scene directors
const H = (key, t, q) => show(key, { ...q, t });
const directors = {
  open(t) { islandBorders.visible = clouds.visible = true; },
  lobby(t) {
    lobby.visible = true; lobbySpark.rotation.y = t * .05; lobbySpark.children.forEach((m, i) => { m.visible = Math.sin(t * 3 + i) > -.2; });
    const y = LOBBY_Y, face = [0, -14];
    const heroes = [['pocoyo', 1.8, -3.6], ['goku', 0, -2.6], ['gabby', -1.8, -3.4], ['vegeta', 3.6, -1.6], ['pato', -3.6, -2.4], ['frieza', -5.6, -.4], ['pandy', 5.6, -.6], ['buu', 7.6, 1.6], ['elly', -7.6, 1.4], ['nina', -5.4, -3.8]];
    for (const [k, x, z] of heroes) H(k, t, { x, z, y, yaw: yawTo([x, z], face),
      headYaw: k === 'goku' ? Math.sin(t * .9) * .6 : Math.sin(t * .4 + x) * .15,
      armR: k === 'pocoyo' ? reach(t, [[L('poc-hello') - .2, E('n-hipoc') + .6, WAVE(t)]]) : k === 'goku' ? reach(t, [[L('goku-wow'), E('goku-wow'), [-1.2, .5]]]) : undefined });
  },
  map(t) { clouds.visible = true; },
  day1(t) { islandBorders.visible = clouds.visible = true; },
  outpost(t) {
    outpost.visible = true;
    const [a] = SC('outpost');
    H('bulma', t, { x: OC[0] - 2.2, z: OC[1] - .6, yaw: yawTo([OC[0] - 2.2, OC[1] - .6], [OC[0] - 2, OC[1] - 4]), armR: reach(t, [[L('bulma-sand'), E('bulma-sand'), [-1.6, .2]]], [-1.1, .1]), headYaw: t > E('bulma-sand') ? .6 : 0 });
    H('briefs', t, { x: OC[0] - 3.8, z: OC[1] + .4, yaw: yawTo([OC[0] - 3.8, OC[1] + .4], [OC[0] - 2, OC[1] - 4]), lean: t > L('briefs-cat') ? .3 : 0, armL: reach(t, [[L('briefs-cat'), E('briefs-cat') + 2, [-1.3, -.2]]]) });
    // Gabby carries a solar panel in from the riverbed, Pandy and Cakey follow with parcels
    const g = walker([[a, OC[0] + 6, OC[1] + 9], [L('gabby-panels') - .5, OC[0] + 6, OC[1] + 9], [E('gabby-panels') + 1.5, OC[0] + .2, OC[1] + .6], [E('cakey-delivery') + 1, OC[0] + .2, OC[1] + .6, yawTo([OC[0] + .2, OC[1] + .6], [OC[0] + 8, OC[1] + 8])]]);
    const gq = g(t, { armL: [-1.4, -.3], armR: [-1.4, .3] }); H('gabby', t, gq);
    if (t < E('cakey-delivery') + 1.2) { panel.visible = true; const h = C.gabby.root; const p = h.localToWorld(new T.Vector3(0, .95, -.5)); panel.position.copy(p); panel.rotation.set(0, h.rotation.y, 0); } else panel.visible = false;
    for (const [k, off, delay] of [['pandy', [1.4, .8], .7], ['cakey', [2.6, -.8], 1.4]]) {
      const w = walker([[a, OC[0] + 6 + off[0], OC[1] + 10 + off[1]], [L('gabby-panels') - .5 + delay, OC[0] + 6 + off[0], OC[1] + 10 + off[1]], [E('gabby-panels') + 1.5 + delay, OC[0] + off[0], OC[1] + off[1] + .2], [E('n-mailbox'), OC[0] + off[0], OC[1] + off[1] + .2, yawTo([OC[0], OC[1]], [OC[0] + 8, OC[1] + 8])]]);
      const lift = k === 'cakey' && t > L('cakey-delivery') - .3 && t < E('cakey-delivery') + .3; // Cakey holds her parcel up over her head for her line
      H(k, t, w(t, lift ? { armL: [-2.9, -.25], armR: [-2.9, .25] } : { armL: [-1.4, -.25], armR: [-1.4, .25] }));
    }
    parcels.forEach((b, i) => {
      const R = C[i ? 'cakey' : 'pandy'], h = R.root, lift = i === 1 && t > L('cakey-delivery') - .3 && t < E('cakey-delivery') + .3;
      if (lift) { R.head.getWorldPosition(b.position); b.position.y += .55 * h.scale.x + .25; } else b.position.copy(h.localToWorld(new T.Vector3(0, .62, -.38)));
      b.rotation.y = h.rotation.y; b.scale.setScalar(i === 2 ? 0 : 1);
    });
    // the mailbox flag goes up as the narrator mentions it
    mbox.children.at(-1).rotation.z = t > L('n-mailbox') + 2 ? -1.2 : 0;
  },
  warroom(t) {
    warroom.visible = true; const up = t > L('n-clapping') && t < E('n-cuteness') && Math.sin(t * 7) > 0; gruntsDown.visible = !up; gruntsUp.visible = up;
    const n = t < L('n-studied') + 1 ? 1 : Math.min(7, 1 + Math.floor((t - L('n-studied') - 1) / .45)); towers.forEach((g, i) => { g.visible = i === n - 1; });
    const angry = t > L('veg-off') && t < E('veg-off');
    H('vegeta', t, { x: vx + .6, z: TZ + 1.5, y: VG, yaw: yawTo([vx + .6, TZ + 1.5], t > L('n-studied') && t < L('n-armour') ? [vx - 1.6, TZ - .7] : [vx - 3, TZ - 6]),
      armL: L('veg-prince') < t && t < E('veg-prince') ? [-2.9, -.3] : [-.5, -.7], armR: angry ? [-1.5, .2] : t > L('veg-map') && t < E('veg-map') ? [-1.2, .3] : t > L('veg-unbelievable') ? [-2.2, -.6] : [-.4, .6], lean: angry ? .25 : t > L('veg-unbelievable') ? .2 : .05 });
    H('pocoyo', t, { x: vx - 1.6, z: TZ - .7, y: VG, yaw: yawTo([vx - 1.6, TZ - .7], t > L('poc-tower') && t < E('veg-off') ? [vx - 3, TZ - 6] : [vx - .4, TZ]),
      armR: t > L('poc-tower') && t < E('poc-tower') + .4 ? [-2.9, .2] : t > L('n-studied') && t < L('poc-tower') ? [-1.5 + Math.sin(t * 5) * .2, .2] : [-.2, .1], armL: t > L('poc-tower') && t < E('poc-tower') + .4 ? [-2.9, -.2] : [-1.3, -.2] });
    H('pato', t, { x: vx + 2.4, z: TZ - 1.4, y: VG, yaw: yawTo([vx + 2.4, TZ - 1.4], t > L('n-armour') && t < E('pato-beak') ? [vx + 3.3, TZ - .4] : [vx - 2.6, TZ - 5.6]), armL: [-1.1, -.95], armR: [-1.1, .95], headYaw: t > L('pato-beak') && t < E('pato-beak') ? Math.sin(t * 8) * .4 : 0 });
    H('elly', t, { x: vx - 2.6, z: TZ + .8, y: VG, yaw: yawTo([vx - 2.6, TZ + .8], [vx - .4, TZ]), armR: t > L('n-clapping') && t < E('grunt-tower') ? [-2.6 + Math.sin(t * 8) * .3, .3] : [-.2, .1] });
  },
  icepalace(t) {
    palace.visible = true; snowAt([px, G(px, pz) + 10, pz], t);
    H('frieza', t, { x: px, z: pz - 1, y: KG + .25, yaw: Math.PI, armR: reach(t, [[L('frieza-mine'), E('frieza-mine'), [-1.5, .5]]], [-.3, .2]), headYaw: t > L('n-bread') && t < E('n-bread') ? .9 : 0, headPitch: t > L('frieza-know') ? -.25 : 0 });
  },
  grotto(t) {
    grotto.visible = true; lightStrings.forEach((g, i) => { g.visible = i < 2 || t > L('box-tada') + 1.2; });
    H('mercat', t, { x: gx - 3, z: gz + 1, y: F0 - 1.2 + Math.sin(t * 1.6) * .05, yaw: yawTo([gx - 3, gz + 1], [gx - 6, gz + 2]), armR: reach(t, [[L('mercat-welcome'), E('mercat-welcome'), [-2.4, .4]]]) });
    H('babybox', t, { x: gx + 1.8, z: gz - 2.4, y: F0 + .9, yaw: yawTo([gx + 1.8, gz - 2.4], [gx - 6, gz + 2]), armR: [-2.8 + Math.sin(t * 3) * .1, .2], armL: [-2.8, -.2] });
    H('djcatnip', t, { x: gx + 3.2, z: gz + 2, y: F0, yaw: yawTo([gx + 3.2, gz + 2], [gx - 6, gz + 1]), armL: [-1.2 + Math.sin(t * 6) * .25, -.3], armR: [-1.2 - Math.sin(t * 6) * .25, .3], headPitch: Math.sin(t * 6) * .1 });
    H('soldier1', t, { x: gx + 3, z: gz - 1.6, y: F0 - 1, yaw: yawTo([gx + 3, gz - 1.6], [gx, gz]), lean: -.25, armL: [-.6, -1.2], armR: [-.6, 1.2] });
  },
  zfighters(t) {
    const night = t > L('n-idea') - 1; snowAt([kx, G(kx, kz) + 8, kz], t); camp.visible = night; fire.scale.y = 1 + Math.sin(t * 13) * .15; fireLight.intensity = 16 + Math.sin(t * 17) * 4;
    const shiver = s => ({ armL: [-.9, .55], armR: [-.9, -.55], headPitch: .15, roll: Math.sin(t * 40 + s) * .03 });
    if (t < E('yamcha-run')) {
      const run = t > L('yamcha-run');
      const fleeKeys = (x0, z0) => [[L('yamcha-run'), x0, z0], [L('yamcha-run') + 2.5, x0 - 9, z0 - 7]];
      const gokuQ = run ? walker(fleeKeys(kx, kz))(t, { stride: 1.3, armL: [-1, -.2], armR: [1, .2] }) : { x: kx, z: kz, yaw: yawTo([kx, kz], t > L('n-zombie') ? [kx + 5, kz + 4] : [kx - 1.6, kz - 6.6]), ...(t > L('goku-hello') && t < E('goku-hello') + .3 || (t > L('goku-hithere') && t < E('goku-hithere') + .2) ? { armR: WAVE(t) } : shiver(0)) };
      H('gokuL', t, gokuQ);
      H('krillin', t, run ? walker(fleeKeys(kx - 1.6, kz + .9))(t, { stride: 1.3 }) : { x: kx - 1.6, z: kz + .9, yaw: yawTo([kx - 1.6, kz + .9], [kx - 1.6, kz - 6.6]), ...shiver(2) });
      H('yamchaL', t, run ? walker(fleeKeys(kx + 1.5, kz + 1.2))(t, { stride: 1.3 }) : { x: kx + 1.5, z: kz + 1.2, yaw: yawTo([kx + 1.5, kz + 1.2], t > L('n-zombie') ? [kx + 5, kz + 4] : [kx + 3, kz + 9]), ...shiver(4) });
      H('bear', t, { x: kx + 6, z: kz + 11, yaw: yawTo([kx + 6, kz + 11], [kx, kz]) });
      if (t > L('n-zombie') - .6) H('zombie', t, walker([[L('n-zombie') - .6, kx + 9, kz + 6], [E('goku-hithere') + .4, kx + 3.4, kz + 2.6], [E('yamcha-run') + 1, kx + 1, kz]])(t, { armL: [-1.5, -.1], armR: [-1.5, .1], stride: .5 }));
    } else if (night) {
      auras.visible = t > L('goku-breathe') + 2; auras.position.set(kx + .5, G(kx, kz) + .2, kz + 2.5); auras.children.forEach((a, i) => { a.position.y = (i * .4 + t * .5) % 2.4; a.material.opacity = .14 * (1 - a.position.y / 2.4); });
      const breathe = Math.sin((t - L('goku-breathe')) * 1.6);
      H('gokuL', t, { x: kx + .5, z: kz + 6.2, yaw: yawTo([kx + .5, kz + 6.2], [kx + .5, kz]), armL: [-1.4 - breathe * .5, -.6], armR: [-1.4 - breathe * .5, .6], headPitch: -.1 });
      H('krillin', t, { x: kx - 2.4, z: kz + 1.4, yaw: yawTo([kx - 2.4, kz + 1.4], [kx + .5, kz + 6]), sit: true, armL: [-1.2, -.3], armR: [-1.2, .3] });
      H('yamchaL', t, { x: kx + 3.4, z: kz + 1.6, yaw: yawTo([kx + 3.4, kz + 1.6], [kx + .5, kz + 6]), sit: true });
      if (t > L('goku-breathe')) { whiteAura.visible = true; whiteAura.position.set(kx + .5, G(kx + .5, kz + 6.2), kz + 6.2); whiteAura.scale.setScalar(.8 + breathe * .1); }
    }
  },
  bakery(t) {
    bakery.visible = park.visible = true;
    H('buu', t, { x: door[0] - .4, z: door[1] + .2, yaw: yawTo(door, [bx + 3, bz + 14]), armR: reach(t, [[L('buu-cookies'), E('buu-cookies'), [-1.6 + Math.sin(t * 6) * .3, .3]], [L('buu-yes'), E('buu-yes'), [-2.8, .4]]], [-1.4, .25]), armL: t > L('buu-yes') && t < E('buu-yes') ? [-2.8, -.4] : [-.2, -.1] });
    H('goten', t, { x: bx + .6, z: bz + 8, yaw: yawTo([bx + .6, bz + 8], door), armR: reach(t, [[L('goten-two'), E('buu-yes'), [-1.7, .2]]]), headPitch: -.2, ...(t > L('n-park') ? { x: 9999 } : {}) });
    H('nina', t, { x: qx - 2, z: qz + 3, yaw: yawTo([qx - 2, qz + 3], [qx + 10, qz - 6]), armR: t > L('nina-go') && t < E('nina-go') + .3 ? (t < E('nina-go') - .3 ? [-3, .3] : [-1.2, .3]) : [-.2, .1] });
    H('loula', t, { x: qx - .8, z: qz + 3.6, yaw: yawTo([qx - .8, qz + 3.6], [qx + 10, qz - 6]), walk: t > L('nina-go') ? t * 8 : 0, stride: t > L('nina-go') ? .4 : 0 });
    // the minecart race down the hill
    const race = clamp((t - E('nina-go')) / 6), lead = [race * 22, race * 22 - .8 - Math.sin(t * 2) * .6];
    carts.forEach((m, i) => { const p = rail(clamp(lead[i], 0, 25), i), q = rail(clamp(lead[i] + 1, 0, 25), i); m.position.set(p[0], p[1], p[2]); m.rotation.set(0, Math.atan2(q[0] - p[0], q[2] - p[2]) + Math.PI, 0); });
    // riders take the cart's yaw, which already faces its travel
    for (const [k, i] of [['trunks', 0], ['goten', 1]]) if (t > L('n-park')) { const m = carts[i]; H(k, t, { x: m.position.x, z: m.position.z, y: m.position.y + .15, yaw: m.rotation.y, armL: [-2.8, -.3], armR: k === 'trunks' && t > L('trunks-way') ? [-1.5, .4] : [-2.8, .3] }); }
  },
  cafe(t) {
    cafe.visible = true;
    H('gohan', t, { x: tbl[0] - 1.15, z: tbl[1], y: TY, yaw: yawTo([tbl[0] - 1.15, tbl[1]], [tbl[0] + 5, tbl[1]]), sit: true, seat: TY + .5, armL: [-1.25, -.1], armR: reach(t, [[L('gohan-ocelots'), E('gohan-ocelots'), [-1.5, .5]]], [-1.25, .1]), headPitch: t > L('gohan-ocelots') && t < E('videl-eco') ? 0 : .35 });
    H('videl', t, { x: tbl[0] + 1.15, z: tbl[1], y: TY, yaw: yawTo([tbl[0] + 1.15, tbl[1]], [tbl[0] - 5, tbl[1]]), sit: true, seat: TY + .5, armR: [-1.2, .2], headYaw: t > L('videl-eco') ? .3 : 0 });
    H('gabby', t, { x: tbl[0] + .2, z: tbl[1] - 1.1, y: TY, yaw: yawTo([tbl[0] + .2, tbl[1] - 1.1], [tbl[0] + 1, tbl[1] + 6]), armR: t > L('gabby-ears') ? [-2.9, .3] : [-1.4, .2], armL: t > L('gabby-ears') ? [-2.9, -.3] : [-.2, -.1] });
    H('cakey', t, { x: tbl[0] + 2.6, z: tbl[1] - 1.2, y: TY, yaw: yawTo([tbl[0] + 2.6, tbl[1] - 1.2], [tbl[0] + 2, tbl[1] + 6]) });
    cats[0].rotation.y = 2.2 + Math.sin(t * .7) * .4;
  },
  day7(t) { islandBorders.visible = clouds.visible = true; },
  day8(t) {
    clouds.visible = true;
    const gone = L('n-gone'), flick = t > L('n-noise') && t < gone + .6 ? (Math.sin(t * 40) > 0 ? 1 : 0) : t < L('n-noise') ? 1 : 0;
    islandBorders.visible = flick > 0;
  },
  nimbus(t) {
    const [a, b] = SC('nimbus'), k = (t - a) / (b - a), p = [lerp(55, -10, k), SEA + 14 + Math.sin(t * 1.3) * .4, lerp(30, -30, k)], heading = Math.atan2(65, 60); // the yaw that faces the direction of travel (-65, -60): fliers lean into it
    nimbusCloud.visible = true; nimbusCloud.position.set(...p); nimbusCloud.rotation.y = heading;
    H('goku', t, { x: p[0], z: p[2], y: p[1] + .12, yaw: heading, legL: -.25, legR: .25, armR: t > L('goku-nimbus') && t < E('goku-nimbus') + .5 ? [-2.9, .3] : [-.6, .3], armL: [-.4, -.3] });
    const g = [p[0] + 9, p[1] + 4 + Math.sin(t * 2) * .3, p[2] + 8];
    // flying like a superhero: body almost level, one fist forward, legs trailing, head up to see where he goes
    H('gohan', t, { x: g[0], z: g[2], y: g[1], yaw: heading, fly: true, flyLean: 1.25, armL: [-3, -.12], armR: t > L('gohan-wait') ? [-2.5, .45] : [.25, .2], legL: .3, legR: -.05, headPitch: 1.1 }); // positive pitch tilts the face up, out of the dive
    whiteAura.visible = true; whiteAura.position.set(g[0], g[1] - .4, g[2]); whiteAura.scale.setScalar(1);
  },
  crash(t) {
    palace.visible = true; snowAt([px, KG + 8, pz], t);
    const hit = L('n-through') + .9, [a] = SC('crash');
    if (t < hit) { // Goku races in from the north on the Nimbus
      const k = clamp((t - a) / (hit - a)), p = [px - .4, KG + 3.6, lerp(K.z0 - 60, K.z0 - .5, k * k)];
      nimbusCloud.visible = true; nimbusCloud.position.set(...p); nimbusCloud.rotation.y = 0;
      H('goku', t, { x: p[0], z: p[2], y: p[1] + .12, yaw: Math.PI, armL: [-2.9, -.2], armR: [-2.9, .2] });
    } else {
      crashFx.visible = true; const d = t - hit;
      debris.forEach(({ m, dir, spin }) => { const tt = Math.min(d, 2.2); m.position.set(px + dir.x * tt * .5, Math.max(KG + .15, KG + 4 + dir.y * tt - 4.9 * tt * tt), K.z0 + dir.z * tt * .5); m.rotation.set(spin * tt, spin * tt * .7, 0); });
      flash.position.set(px, KG + 4, K.z0 + 1); flash.scale.setScalar(Math.max(.01, 1 - d * 1.5)); flash.visible = d < .7;
      const land = clamp(d / 1.2);
      H('goku', t, { x: px - .4, z: lerp(K.z0 + .5, K.z0 + 3, land), y: KG + (1 - land) * 2.5, yaw: Math.PI, armR: t > L('goku-oops') + 1 ? WAVE(t) : [-.4, .3], headYaw: t > L('goku-oops') ? .3 : 0 });
      H('frieza', t, { x: px, z: pz - 1, y: KG + .25, yaw: t > L('frieza-palace') ? 0 : Math.PI, armL: [-1.6, -.7], armR: [-1.2, .5] });
      H('soldier2', t, { x: px - 3.2, z: pz - .4, y: KG, yaw: yawTo([px - 3.2, pz - .4], [px, K.z0]), armR: [-1.7, .3] });
    }
  },
  trade(t) {
    outpost.visible = trade.visible = bakery.visible = true;
    // the mailbox sends parcels flying north
    if (t < L('n-outdone')) {
      H('gabby', t, { x: OC[0] + 2.6, z: OC[1] - .4, yaw: yawTo([OC[0] + 2.6, OC[1] - .4], [OC[0] + 1.6, OC[1] - 1.2]), armR: reach(t, [[L('gabby-mailbox'), E('gabby-mailbox'), [-1.6, .3]]]) });
      mbox.children.at(-1).rotation.z = -1.2;
      parcels.forEach((b, i) => { const k = clamp((t - E('gabby-mailbox') + .6 - i * .5) / 3), from = new T.Vector3(OC[0] + 1.6, G(...OC) + 1.4, OC[1] - 1.2); b.scale.setScalar(k > 0 && k < 1 ? 1 : 0); b.position.copy(from).add(new T.Vector3(k * 10, Math.sin(k * Math.PI) * 9, -k * 40)); b.rotation.set(k * 6, k * 4, 0); });
    }
    const go = clamp((t - L('n-outdone')) / (E('n-into') + 1 - L('n-outdone'))), [x, y, z, yaw] = trainAt(go);
    train.visible = true; train.position.set(x, y, z); train.rotation.y = yaw + Math.PI;
    const fwd = [Math.sin(yaw + Math.PI), Math.cos(yaw + Math.PI)];
    H('vegeta', t, { x, z, y: y + 1.75, yaw: yaw, armL: [-.4, -.6], armR: t > L('veg-train') && t < E('veg-train') ? [-2.9, .3] : [-.4, .6] });
    H('elly', t, { x: x + fwd[0] * 3.4 - .4, z: z + fwd[1] * 3.4, y: y + 2.3, yaw, armR: t > L('elly-choo') && t < E('pato-quack') + .5 ? [-2.8 + Math.sin(t * 9) * .3, .3] : [-.2, .1] });
    H('pato', t, { x: x + fwd[0] * 3.4 + .5, z: z + fwd[1] * 3.4, y: y + 2.3, yaw, armL: t > L('pato-quack') && t < E('pato-quack') + .5 ? [-2.8, -.3] : [-.2, -.1] });
    H('buu', t, { x: door[0] - .4, z: door[1] + .2, yaw: yawTo(door, [door[0] - 6, door[1] + 10]), armR: t > L('buu-customers') ? [-2.8, .4] : [-1.4, .25], armL: t > L('buu-customers') ? [-2.8, -.4] : [-.2, -.1] });
  },
  photobomb(t) {
    meeting.visible = true;
    const pop = clamp((t - L('poc-peekaboo') + .5) / .5), bonk = t > E('poc-peekaboo') && t < E('poc-peekaboo') + .5;
    H('frieza', t, { x: mx, z: mz + 2.1, y: MG, yaw: 0, sit: true, seat: MG + .55, armR: reach(t, [[L('frieza-deal'), E('frieza-deal'), [-1.6, .5]]], [-1.1, .3]), headYaw: t > L('frieza-baby') - .4 ? .7 : .2, headPitch: bonk ? .35 : 0 });
    H('soldier3', t, { x: mx - 1.6, z: mz - 1.4, y: MG, yaw: yawTo([mx - 1.6, mz - 1.4], [mx, mz + 2]) });
    H('yamcha', t, { x: mx + 1.7, z: mz - 1.2, y: MG, yaw: yawTo([mx + 1.7, mz - 1.2], [mx, mz + 2]), headYaw: t > L('poc-peekaboo') ? -.4 : 0 });
    if (t > L('n-found')) { hammer.visible = true; H('pocoyo', t, { x: lerp(mx - .2, mx - 1.1, pop) + (t > E('poc-peekaboo') ? .5 : 0), z: mz + 3.25, y: MG, yaw: .25, armR: bonk ? [-2.2, .1] : [-2.9, .2], headYaw: -.2, lean: pop * .25 }); } // peeks out from behind the throne
  },
  day14(t) { clouds.visible = true; },
  invasion(t) {
    clouds.visible = fleet.visible = true;
    fleet.position.y = lerp(90, 0, span(t, L('n-green') - .5, L('n-thousands') + 1));
    shipAt([-10, 150 + fleet.position.y, -120], 1.15, true);
  },
  backfire(t) {
    palace.visible = beamPalace.visible = true; snowAt([px, G(px, pz) + 10, pz], t);
    shipAt([px, KG + 75, pz - 6], .75, false);
    const lift = span(t, L('cmd-thanks') + .6, SC('backfire')[1]);
    palaceIce.forEach(({ m, x, z, y0, spin }, i) => { m.position.set(x + Math.sin(t + i) * .4, y0 + lift * 34 + Math.sin(t * 1.3 + i) * .6, z); m.rotation.set(spin * t, spin * t * .7, 0); });
    const king = t > L('frieza-king') && t < E('frieza-king') + .3, cross = t > L('frieza-deal2') - .2 && t < E('frieza-deal2') + .4;
    podOut.visible = true; podOut.position.set(BF[0], G(...BF), BF[1]); podOut.rotation.y = yawTo(BF, BFC);
    H('frieza', t, { x: BF[0], z: BF[1], y: G(...BF) + .25, yaw: yawTo(BF, mix2([px, pz], BFC, .55)), armR: king || cross ? [-2.9 + (cross ? Math.sin(t * 9) * .3 : 0), .3] : [-.4, .2], armL: king || cross ? [-2.9, -.3] : [-.4, -.2], headPitch: t > L('cmd-thanks') - .3 && t < E('cmd-thanks') ? -.35 : 0 });
    const down = span(t, L('frieza-king') + 1, L('cmd-thanks')), S = [BF[0] + 3.2, BF[1] - 1.2], sy = G(...BF) + 3.1 + (1 - down) * 12;
    cmdSaucer.visible = true; cmdSaucer.position.set(S[0], sy, S[1]);
    H('commander', t, { x: S[0], z: S[1], y: sy + .15, yaw: yawTo(S, mix2(BF, BFC, .55)), armR: t > L('cmd-thanks') && t < E('cmd-thanks') ? [-1.6, .25] : [-.4, .2], armL: [-.4, -.3] });
  },
  rally(t) {
    fort.visible = rally.visible = squadron.visible = true; shipAt([sx - 20, SG + 90, sz - 140], .75, true);
    fortClip.constant = SG + lerp(-.5, 9, span(t, L('gabby-walls') - .5, L('gabby-walls') + 4));
    const m = RT, toward = (x, z, k = .4) => yawTo([m[0] + x, m[1] + z], mix2(m, RTC, k));
    H('bulma', t, { x: m[0] - .4, z: m[1] - 1.3, yaw: toward(-.4, -1.3, .5), armR: reach(t, [[L('bulma-shield'), E('bulma-shield'), [-1.4, .1]]], [-.3, .1]) });
    const vegOnce = t > L('veg-once') - .3 && t < E('veg-once') + .3;
    H('goku', t, { x: m[0] - 1.9, z: m[1] - .9, yaw: toward(-1.9, -.9), armR: reach(t, [[L('goku-spirit'), E('goku-spirit'), [-2.8, .3]]], [-.6, .3]) });
    H('vegeta', t, { x: m[0] + 1.7, z: m[1] - 1, yaw: vegOnce ? yawTo([m[0] + 1.7, m[1] - 1], [m[0] - 1.9, m[1] - .9]) : toward(1.7, -1), ...CROSS });
    H('gohan', t, { x: m[0] - 2.2, z: m[1] + .5, yaw: toward(-2.2, .5, .6) }); H('videl', t, { x: m[0] - 1.6, z: m[1] + 1.1, yaw: toward(-1.6, 1.1, .6), armL: [-.4, -.3] });
    const walls = t > L('gabby-walls') - .3;
    H('gabby', t, { x: m[0] + 2.2, z: m[1] + .5, yaw: toward(2.2, .5, .6), armR: walls ? [-2.6 + Math.sin(t * 6) * .3, .3] : [-.3, .1], armL: walls ? [-2.6 - Math.sin(t * 6) * .3, -.3] : [-.3, -.1] });
    H('carlita', t, { x: m[0] + 3, z: m[1] + 1.3, yaw: toward(3, 1.3, .6) });
    patoArmour.visible = t > L('pato-armour'); H('pato', t, { x: m[0] + 1.4, z: m[1] + 1.4, yaw: toward(1.4, 1.4, .8), armR: t > E('pato-armour') - .6 ? [-2.9, .1] : [-.3, .1] });
    H('frieza', t, { x: m[0] + 3.3, z: m[1] - 1.6, yaw: toward(3.3, -1.6, .25), headPitch: t > L('frieza-mine2') ? 0 : .2, ...CROSS });
    H('pocoyo', t, { x: m[0] + .6, z: m[1] - .2, y: SG + .98, yaw: yawTo([m[0] + .6, m[1] - .2], RTC), sit: true, seat: SG + 1.0 });
  },
  battle(t) { battlefield(t); },
  fights(t) {
    battlefield(t, { heroes: false });
    // Krillin's disc: out of his hand, up to the saucer, which splits in two and falls
    const throwAt = L('kri-disc') + .3, hitAt = throwAt + 1.1, kq = { x: KR[0], z: KR[1], yaw: yawTo(KR, [DS[0], DS[2]]) };
    kq.yaw = yawTo(KR, mix2([DS[0], DS[2]], KRC, .75)); // he throws toward the saucer but shouts toward us
    H('krillin2', t, { ...kq, armR: t > L('kri-disc') - .4 && t < hitAt + .6 ? [-2.9, .2] : [-.5, .2], lean: .1 });
    if (t > throwAt && t < hitAt) { disc.visible = true; const k = (t - throwAt) / (hitAt - throwAt); disc.position.set(lerp(KR[0], DS[0], k), lerp(SG + 2.4, DS[1], k), lerp(KR[1], DS[2], k)); disc.rotation.set(.2, t * 30, 0); }
    if (t < hitAt) { discTarget.visible = true; discTarget.position.set(...DS); }
    else halves.forEach((h, i) => { const d = Math.min(t - hitAt, 2.4), s = i ? 1 : -1; h.visible = true; h.position.set(DS[0] + s * d * 1.2, Math.max(SG + .4, DS[1] - 4.9 * d * d * .5), DS[2] + s * d * .6); h.rotation.set(s * d * 1.2, 0, s * d * .8); });
    // Vegeta's thruster train flies along the north wall
    const tk = span(t, L('veg-train2') - 1, E('veg-train2') + 3), tx = lerp(FC[0] + 36, FC[0] - 36, tk);
    train.visible = true; train.position.set(tx, SG + 7, NORTH - 9); train.rotation.y = Math.PI / 2;
    H('vegeta', t, { x: tx, z: NORTH - 9, y: SG + 8.75, yaw: -Math.PI / 2 + .6, armR: t > L('veg-train2') && t < E('veg-train2') ? [-2.9, .3] : [-.4, .6], armL: [-.4, -.6] });
    // Buu catches a goo ray and it comes out as candy
    const candyAt = L('buu-candy') + .2; candyRay.visible = t > L('buu-candy') - 1.2 && t < candyAt;
    H('buu', t, { x: BUU[0], z: BUU[1], yaw: yawTo(BUU, BUUC), armL: [-2.6, -.5], armR: [-2.6, .5] });
    if (t > candyAt) { candy.visible = true; const d = t - candyAt; candy.children.forEach(c => { const [x, y, z] = c.userData.d; const e = Math.min(d, 1.4); c.position.set(BUU[0] + x * e, SG + 2.6 + y * e * 1.6 - .5 * e * e, BUU[1] + z * e); c.rotation.set(d * 4, d * 3, 0); }); } // a burst round his hands, never out into the lens
    patoArmour.visible = true; H('pato', t, { x: FC[0] + .6, z: FC[1] - 4.4, yaw: yawTo([FC[0] + .6, FC[1] - 4.4], [FC[0] + .8, FC[1] + 4]), armR: [-2.9, .1] });
    catsUp.visible = true; catsUp.position.y = Math.abs(Math.sin(t * 6)) * .25;
  },
  beam(t) {
    fort.visible = beamFx.visible = beamCrowd.visible = squadron.visible = true; fortClip.constant = SG + 30; shipAt([sx - 30, SG + 95, sz - 150], 1, true);
    const vy = SG + lerp(0, 4.6, span(t, L('n-beam'), E('videl-gohan') + .4)), gy = SG + lerp(0, 3.2, span(t, L('gohan-gotyou') - .8, L('gohan-gotyou') + .4)), flying = gy > SG + .2;
    H('videl', t, { x: BM[0], z: BM[1] - 1, y: vy, yaw: yawTo([BM[0], BM[1] - 1], mix2([BM[0] + 1, BM[1] + 4], BMC, .6)), fly: vy > SG + .2, flyLean: -.2, armR: [-2.6, .6], armL: [-.6, -.9], legL: .3, legR: -.2, t });
    H('gohanS', t, { x: BM[0] + 1.3, z: BM[1] - .2, y: gy, yaw: yawTo([BM[0] + 1.3, BM[1] - .2], mix2([BM[0], BM[1] - 1], BMC, .55)), fly: flying, flyLean: -.4, armL: flying ? [-2.9, -.3] : [-.4, -.2], armR: [-.5, .5], headPitch: -.4, t });
  },
  catch(t) {
    fort.visible = squadron.visible = true; fortClip.constant = SG + 30; shipAt([sx - 30, SG + 95, sz - 150], 1, true);
    const hit = L('n-furious') + 1.4, caught = L('goku-ride'), [a, b] = SC('catch');
    // the Commander on his saucer, above and behind, blasting Gohan
    const cmd = [CB[0] - 10, CB[1] - 18], cy = SG + 16; cmdSaucer.visible = true; cmdSaucer.position.set(cmd[0], cy - .3, cmd[1]);
    H('commander', t, { x: cmd[0], z: cmd[1], y: cy, yaw: yawTo(cmd, CB), armR: t > hit - 1 && t < hit + .4 ? [-1.6, .2] : [-.4, .2] });
    blast.visible = t > hit - .25 && t < hit + .15;
    // Gohan tumbles down until Videl, on the Nimbus, catches him
    const fall = clamp((t - hit) / (caught - hit)), gy = t < hit ? SG + 11 : lerp(SG + 11, SG + 8.1, fall * fall);
    H('gohanS', t, t < hit ? { x: CB[0], z: CB[1], y: gy, yaw: yawTo(CB, cmd), fly: true, flyLean: -.2, armL: [-1.6, -.3], armR: [-1.6, .3], t }
      : { x: CB[0] + .1, z: CB[1] - .45, y: gy + .05, yaw: -Math.PI / 2 - .6, lie: true, armR: [-2.6, .4], armL: [-.4, -.6] });
    if (t >= hit) C.gohanS.root.rotation.z = t < caught ? Math.sin(t * 5) * .4 : 0;
    // Videl calls the Nimbus from the ground, rides it up, and catches him
    const V0 = [CB[0] - 1.5, CB[1] + 2.5], up = span(t, L('n-goodheart') - .2, caught);
    const vx = lerp(V0[0], CB[0] - .3, up), vz = lerp(V0[1], CB[1], up), ny = lerp(G(...V0) + .35, SG + 7, up);
    const onCloud = t > L('videl-nimbus') + .6;
    if (onCloud) { nimbusCloud.visible = true; nimbusCloud.position.set(vx, ny, vz); nimbusCloud.rotation.y = Math.PI / 2; }
    H('videl', t, { x: vx, z: vz, y: onCloud ? ny + .3 : G(...V0), yaw: t < caught ? yawTo([vx, vz], mix2(CB, CBC, .4)) : yawTo([vx, vz], mix2([CB[0] + 1, CB[1]], CBC, .55)), armL: t > caught - .5 ? [-1.6, -.2] : t > L('videl-nimbus') && t < E('videl-nimbus') + .3 ? [-2.9, -.3] : [-.3, -.1], armR: t > caught - .5 ? [-1.6, .2] : [-.3, .1], headPitch: t < caught && t > hit ? -.4 : 0, lean: t > caught ? .2 : 0 });
    H('goku', t, { x: GO[0], z: GO[1], yaw: yawTo(GO, mix2(CB, GOC, .5)), headPitch: -.45, armR: t > L('goku-ride') && t < E('goku-ride') + .3 ? [-2.9, .3] : [-.4, .3] });
  },
  backtoback(t) {
    fort.visible = ringArmy.visible = b2bRays.visible = squadron.visible = true; fortClip.constant = SG + 30;
    b2bRays.visible = Math.sin(t * 2.2) > -.3;
    const m = B2B; H('gohanS', t, { x: m[0] - .35, z: m[1], yaw: yawTo([m[0] - .35, m[1]], mix2([m[0] - 4, m[1] + 1], B2BC, .5)), armL: [-1.6, -.3], armR: [-1.2, .5] });
    H('videl', t, { x: m[0] + .35, z: m[1] + .05, yaw: yawTo([m[0] + .35, m[1] + .05], mix2([m[0] + 4, m[1] + 1], B2BC, .5)), armR: [-1.6, .3], armL: [-1.1, -.5] });
    GRUNTS.forEach((k, i) => { const a = Math.PI * (1.05 + i * .13), r = 3 + (i % 2) * .7, x = m[0] + Math.cos(a) * r, z = m[1] + Math.sin(a) * r * .8; H(k, t, { x, z, yaw: yawTo([x, z], m), armR: [-1.5, .2], walk: t * 2 + i, stride: .15 }); });
  },
  finale(t) {
    fort.visible = squadron.visible = true; fortClip.constant = SG + 30;
    const hands = t > L('n-hands'), launch = L('goku-now') + .3, impact = launch + 2.2, gone = span(t, impact, SC('finale')[1]);
    ringDown.visible = !hands; ringUp.visible = hands;
    shipAt([EYE[0] + gone * 60, SG + 70 + gone * 90, EYE[2] - gone * 160], 1 - gone * .6, t < L('n-crack'));
    MS.group.rotation.set(gone * .5, t > impact ? (t - impact) * 3 : 0, gone * .4);
    H('gokuS', t, { x: GK[0], z: GK[1], yaw: yawTo(GK, mix2([GK[0], GK[1] - 20], GKC, .2)), armL: [-3.05, -.2], armR: [-3.05, .2], headPitch: t < L('n-hands') ? 0 : -.4 });
    kiAura.visible = !CLOSE.has(shotNow?.name); kiAura.position.set(GK[0], G(...GK), GK[1]); kiAura.scale.setScalar(1.1 + Math.sin(t * 12) * .04);
    const grow = span(t, L('n-hands'), L('goku-now')), fly = clamp((t - launch) / (impact - launch));
    if (t < impact) { spiritBomb.visible = true; const p0 = [GK[0], SG + lerp(6, 12, grow), GK[1]]; spiritBomb.position.set(lerp(p0[0], EYE[0], fly * fly), lerp(p0[1], EYE[1], fly * fly), lerp(p0[2], EYE[2], fly * fly)); spiritBomb.scale.setScalar(lerp(.4, 3.4, grow)); }
    nimbusCloud.visible = true; nimbusCloud.position.set(GV[0] + 1.8, GV[1] - .9, GV[2]); nimbusCloud.rotation.y = yawTo([GV[0], GV[2]], [EYE[0], EYE[2]]);
    const eyeYaw = yawTo([GV[0], GV[2]], [EYE[0], EYE[2]]);
    H('gohanS', t, { x: GV[0], z: GV[2], y: GV[1] - .4, yaw: eyeYaw, fly: true, flyLean: -.6, armL: [-2.9, -.1], armR: [-2.9, .1], t });
    whiteAura.visible = true; whiteAura.position.set(GV[0], GV[1] - .9, GV[2]); whiteAura.scale.setScalar(1);
    H('videl', t, { x: GV[0] + 1.8, z: GV[2], y: GV[1] - .4, yaw: eyeYaw, armR: [-2.9, .2], armL: [-2.6, -.2], headPitch: -.6 });
    masenko.visible = t > L('videl-together') + .2 && t < L('n-crack') + .4;
    crackFlash.visible = t > L('n-crack') - .1 && t < L('n-crack') + .8; crackFlash.position.set(EYE[0], EYE[1] - .6, EYE[2]); crackFlash.scale.setScalar(.4 + (t - L('n-crack')) * 1.8);
  },
  victory(t) {
    wrecks.visible = cheer.visible = smoke.visible = squadron.visible = true;
    const k = span(t, SC('victory')[0], SC('victory')[1]);
    shipAt([sx - 60 - k * 40, SG + 120 + k * 60, sz - 220 - k * 120], .65, false); MS.group.rotation.set(.5, t * 2, .4);
    smoke.position.copy(MS.group.position); squadron.position.set(-k * 60, k * 50, -k * 140);
    cheer.position.y = Math.abs(Math.sin(t * 7)) * .12;
    const hi = t > L('poc-hello2') - .2 && t < E('poc-hello2') + .4;
    H('pocoyo', t, { x: VC[0] - .5, z: VC[1], yaw: yawTo([VC[0] - .5, VC[1]], mix2([VC[0] + .5, VC[1]], VCC, .4)), armR: hi ? WAVE(t) : t > L('poc-party') ? [-2.2, .4] : [-.3, .1] });
    H('zib', t, { x: VC[0] + .55, z: VC[1] + .5, yaw: yawTo([VC[0] + .55, VC[1] + .5], mix2([VC[0] - .5, VC[1]], VCC, .4)), armL: t > L('zib-hello') && t < E('zib-hello') + .5 ? [-2.6, -.3] : [-.4, -.1] });
  },
  proposal(t) {
    wrecks.visible = true;
    const m = PR, Gh = [m[0] - .5, m[1]], Vi = [m[0] + .6, m[1] - .1], kneel = t > L('gohan-marry') - 1.2;
    ringBox.visible = kneel;
    H('gohanS', t, kneel ? { x: Gh[0], z: Gh[1], y: G(...Gh) - .38, yaw: yawTo(Gh, mix2(Vi, PRC, .25)), legL: -1.5, legR: 1.2, armR: [-1.5, .1], armL: [-.2, -.2], lean: .05 }
      : { x: Gh[0], z: Gh[1], yaw: yawTo(Gh, mix2(Vi, PRC, .35)) });
    H('videl', t, { x: Vi[0], z: Vi[1], yaw: yawTo(Vi, mix2(Gh, PRC, .35)), armL: t > L('videl-yes') ? [-1.2, .45] : [-.3, -.1], armR: t > L('videl-yes') ? [-1.2, -.45] : [-.3, .1], headPitch: kneel ? .15 : 0 });
  },
  wedding(t) { weddingSet(t); },
  goodbye(t) { weddingSet(t, { party: true }); },
  credits(t) { weddingSet(t, { party: true }); },
};
const CLOSE = new Set(['Lend me your energy', 'NOW!']); // close-ups of Goku: no aura over his face
/** The mothership at p, scaled, with or without its shield. */
function shipAt(p, s, shield) { MS.group.visible = true; MS.group.position.set(...p); MS.group.scale.setScalar(s); MS.group.rotation.set(0, 0, 0); MS.shield.visible = shield; }
/** The plateau under attack: the walls, the defenders inside, the Grumbler army outside, saucers firing goo, the jelly. */
function battlefield(t, { heroes = true } = {}) {
  defenders.visible = heroes; fort.visible = army.visible = battleSaucers.visible = jellies.visible = squadron.visible = true; fortClip.constant = SG + 30;
  shipAt([sx - 30, SG + 95, sz - 150], 1, true);
  army.position.y = Math.abs(Math.sin(t * 5)) * .06; defenders.position.y = Math.abs(Math.cos(t * 5)) * .05;
  rays.forEach((r, i) => { r.visible = Math.sin(t * 2.3 + i * 1.7) > .2; });
  if (!heroes) return;
  H('gokuS', t, { x: FC[0] + 2, z: NORTH + 1.6, yaw: yawTo([FC[0] + 2, NORTH + 1.6], [FC[0] + 6, NORTH - 30]), armR: [-1.6, .3], armL: [-1.6, -.3] });
  kiAura.visible = true; kiAura.position.set(FC[0] + 2, G(FC[0] + 2, NORTH + 1.6), NORTH + 1.6);
  H('vegeta', t, { x: FC[0] + 4.4, z: NORTH + 1.4, yaw: yawTo([FC[0] + 4.4, NORTH + 1.4], [FC[0] + 9, NORTH - 30]), armR: [-1.6, .2] });
  H('frieza', t, { x: FC[0] - 1.8, z: NORTH + 2.4, yaw: yawTo([FC[0] - 1.8, NORTH + 2.4], [FC[0] - 2, NORTH - 30]), armR: [-1.7, .1] });
  const cs = [FC[0] + 2, NORTH - 12], cy = SG + 12; cmdSaucer.visible = true; cmdSaucer.position.set(cs[0], cy - .3, cs[1]);
  H('commander', t, { x: cs[0], z: cs[1], y: cy, yaw: yawTo(cs, [FC[0] + 2, NORTH + 20]), armR: t > L('cmd-fire') && t < E('cmd-fire') + .4 ? [-2.9, .2] : [-1.4, .2] });
}
/** The wedding on the plateau: the couple under the arch, the guests, the cake; the party (fireworks, dancing) after. */
function weddingSet(t, { party = false } = {}) {
  wedding.visible = petals.visible = true;
  petals.children.forEach(p => { const [x, y, z, i] = p.userData.o; p.position.set(x + Math.sin(t + i) * .3, G(...WA) + .3 + ((y - t * .35) % 4 + 4) % 4, z); p.rotation.set(t + i, t * 2 + i, 0); });
  train.visible = true; train.position.set(WA[0] - 12, G(WA[0] - 12, WA[1] + 6), WA[1] + 6); train.rotation.y = 0;
  const Gh = [WA[0] - .65, WA[1] + .8], Vi = [WA[0] + .65, WA[1] + .8];
  if (!party) {
    H('gohanG', t, { x: Gh[0], z: Gh[1], yaw: yawTo(Gh, mix2(Vi, WC, .7)), armL: [-.4, -.35] });
    H('videlB', t, { x: Vi[0], z: Vi[1], yaw: yawTo(Vi, mix2(Gh, WC, .7)), armR: [-.4, .35] });
    H('elly', t, { x: WA[0], z: WA[1] - .4, y: G(...WA) + .4, yaw: yawTo([WA[0], WA[1] - .4], WC), armL: [-1.3, -.1], armR: [-1.3, .1] });
    const rings = t > L('poc-rings') - .4;
    H('pocoyo', t, { x: WA[0] - 1.4, z: WA[1] + 1.5, yaw: yawTo([WA[0] - 1.4, WA[1] + 1.5], WC), armL: rings ? [-2.6, -.2] : [-1.3, -.1], armR: rings ? [-2.6, .2] : [-1.3, .1] });
    H('zib', t, { x: WA[0] + 1.4, z: WA[1] + 1.5, yaw: yawTo([WA[0] + 1.4, WA[1] + 1.5], WC), armR: rings ? [-2.6, .3] : [-.4, .1] });
    H('frieza', t, { x: WA[0] + 3.2, z: WA[1] + 2.8, yaw: yawTo([WA[0] + 3.2, WA[1] + 2.8], mix2(WA, WC, .6)), armR: [-2.5, .4], headPitch: .2 });
    return;
  }
  fwSky.visible = dancers.visible = true; dancers.position.y = Math.abs(Math.sin(t * 6)) * .1; dancers.rotation.y = 0;
  bursts.forEach(({ points, light }, i) => { const k = ((t * .35 + i * .27) % 1); points.scale.setScalar(.15 + k); points.material.opacity = 1 - k; light.intensity = 40 * (1 - k); });
  H('pocoyo', t, { x: CAKE[0], z: CAKE[1], y: cakeTop + .5, yaw: yawTo(CAKE, GBC), sit: true, seat: cakeTop + .5, armR: t > L('n-wave') ? WAVE(t) : [-.4, .3] });
  const spin = t * .8, c = [CAKE[0] - 3, CAKE[1] + 2.5];
  H('gohanG', t, { x: c[0] - Math.cos(spin) * .45, z: c[1] - Math.sin(spin) * .45, yaw: yawTo([c[0] - Math.cos(spin) * .45, c[1] - Math.sin(spin) * .45], c), armL: [-1.4, -.4], armR: [-1.6, .2] });
  H('videlB', t, { x: c[0] + Math.cos(spin) * .45, z: c[1] + Math.sin(spin) * .45, yaw: yawTo([c[0] + Math.cos(spin) * .45, c[1] + Math.sin(spin) * .45], c), armR: [-1.4, .4], armL: [-1.6, -.2] });
}
let shotNow; // the shot being drawn (light() decides its key light)
function reset(t, shot) {
  shotNow = shot;
  for (const p of props) p.visible = false;
  visibleNow = [];
  W.group.visible = shot.scene !== 'lobby';
  for (const R of Object.values(C)) R.root.position.y = -9999;
}

// ------------------------------------------------------------------ light per scene
const LIGHT = {
  open: ['golden', { focus: [0, 20, -10], sunDir: [-.6, .32, .6], area: 200, near: 300, far: 1600 }],
  lobby: ['lobby', { focus: [0, LOBBY_Y, 0], sunDir: [-.4, .8, -.5], area: 30, near: 40, far: 160 }],
  map: ['day', { focus: [0, 12, -10], sunDir: [.3, .9, .4], area: 200, near: 700, far: 1800 }],
  day1: ['golden', { focus: [-90, 20, 55], sunDir: [-.7, .32, .35], area: 70, far: 900 }],
  outpost: ['golden', { focus: [OC[0], 16, OC[1]], sunDir: [-.75, .38, -.2], area: 30 }],
  warroom: ['golden', { focus: [vx, VG, TZ], sunDir: [-.6, .45, -.6], area: 22 }],
  icepalace: ['blizzard', { focus: [px, KG, pz], sunDir: [-.3, .6, .5], area: 40, near: 20, far: 240 }],
  grotto: ['cave', { focus: [gx, F0, gz], sunDir: [.2, .9, .1], area: 12, near: 8, far: 50 }],
  zfighters: ['blizzard', { focus: [kx, G(kx, kz), kz], sunDir: [-.4, .5, -.6], area: 20, near: 10, far: 140 }],
  bakery: ['day', { focus: [bx + 4, DY, bz + 4], sunDir: [.5, .55, .7], area: 40 }],
  cafe: ['golden', { focus: [cx, TY, cz + 6], sunDir: [.6, .4, .7], area: 16 }],
  day7: ['day', { focus: [0, 12, -10], sunDir: [.3, .9, .4], area: 200, near: 700, far: 1800 }],
  day8: ['golden', { focus: [0, 20, 0], sunDir: [-.5, .35, .8], area: 120, near: 150, far: 1100 }],
  nimbus: ['golden', { focus: [20, SEA + 14, 0], sunDir: [-.5, .35, .8], area: 60, far: 900 }],
  crash: ['blizzard', { focus: [px, KG, pz - 4], sunDir: [-.2, .8, -.5], area: 30, near: 30, far: 220 }],
  trade: ['golden', { focus: [-48, 20, -15], sunDir: [-.8, .35, .3], area: 50, far: 900 }],
  photobomb: ['day', { focus: [mx, MG, mz], sunDir: [-.4, .7, -.6], area: 14 }],
  day14: ['golden', { focus: [-90, 20, 55], sunDir: [-.7, .32, .35], area: 70, far: 900 }],
  invasion: ['invasion', { focus: [0, 12, -10], sunDir: [.2, .5, -.8], area: 200, near: 300, far: 1500 }],
  backfire: ['invasion', { focus: [px, KG + 10, pz + 20], sunDir: [-.3, .6, .6], area: 40, near: 40, far: 450 }],
  rally: ['invasion', { focus: [FC[0], SG, FC[1]], sunDir: [.3, .6, .75], area: 24, near: 60, far: 600 }],
  battle: ['invasion', { focus: [FC[0], SG, FC[1] - 10], sunDir: [-.5, .55, .6], area: 34, near: 60, far: 600 }],
  fights: ['invasion', { focus: [FC[0], SG, FC[1] - 6], sunDir: [.4, .55, .7], area: 30, near: 60, far: 600 }],
  beam: ['invasion', { focus: [BM[0], SG + 4, BM[1]], sunDir: [-.4, .5, .75], area: 24, near: 60, far: 600 }],
  catch: ['invasion', { focus: [CB[0], SG + 6, CB[1]], sunDir: [.3, .45, .85], area: 30, near: 60, far: 600 }],
  backtoback: ['invasion', { focus: [B2B[0], SG, B2B[1]], sunDir: [-.3, .5, .8], area: 24, near: 60, far: 600 }],
  finale: ['invasion', { focus: [GK[0], SG + 10, GK[1] - 10], sunDir: [-.2, .6, .75], area: 40, near: 80, far: 800 }],
  victory: ['golden', { focus: [VC[0], SG, VC[1]], sunDir: [.3, .4, .85], area: 24 }],
  proposal: ['sunset', { focus: [PR[0], SG, PR[1]], sunDir: [.35, .18, .9], area: 20, near: 60, far: 450 }],
  wedding: ['dusk', { focus: [WA[0], SG, WA[1]], sunDir: [.3, .25, .9], area: 24, near: 80, far: 500 }],
  goodbye: ['night', { focus: [WA[0], SG, WA[1]], sunDir: [.3, .25, .9], area: 24, near: 80, far: 500 }],
  credits: ['night', { focus: [WA[0], SG, WA[1]], sunDir: [.3, .25, .9], area: 24, near: 80, far: 500 }],
};
// Depth precision falls with the square of distance over the near plane: at 0.1 m the aerials (200–560 m away) resolve
// depth only to ~15 cm, so the sea plane and the shore blocks 12 cm above it fight. Aerials get a near plane of 2 m.
const AERIAL = new Set(['open', 'map', 'day1', 'day7', 'day8', 'day14', 'invasion']);
function light(name, t) { look(name, t); keyLight.intensity = shotNow ? keyFor(shotNow, t) : 0; }
function look(name, t) {
  camera.near = AERIAL.has(name) ? 2 : .1; camera.updateProjectionMatrix();
  let [look, opts] = LIGHT[name], Lk = LOOKS[look];
  if (name === 'zfighters') Lk = mixLook(LOOKS.blizzard, LOOKS.night, span(t, L('n-idea') - 1.4, L('n-idea') + .6));
  if (name === 'invasion') Lk = mixLook(LOOKS.golden, LOOKS.invasion, span(t, L('n-green') - .4, L('n-green') + 2.6));
  if (name === 'victory') Lk = mixLook(LOOKS.invasion, LOOKS.golden, span(t, SC('victory')[0], SC('victory')[0] + 5));
  if (name === 'goodbye') Lk = mixLook(LOOKS.dusk, LOOKS.night, span(t, SC('goodbye')[0], SC('goodbye')[0] + 6));
  applyLook(Lk, opts);
  clouds.position.x = t * .6;
}
// A key light: a soft lamp just above and beside the lens, as a film crew would set one. Lights placed for a set (pool
// lamps, fairy lights, a sun behind the actors) can leave the face talking to us unlit: MerCat said "Welcome!" as a
// black silhouette because every grotto light was behind her. Each shot renders its speaker at three moments and turns
// the key up only as far as the darkest one needs, decided once per shot (like the camera guard) so it never pumps.
const keyLight = new T.PointLight(0xfff0dc, 0, 12, 2); scene.add(keyLight);
const KEY_OFFSET = new T.Vector3(.5, .8, 0), KEY_LEVELS = [0, 3, 6, 12, 24, 48], FACE_MIN = 60;
scene.onBeforeRender = (r, s, cam) => { keyLight.position.copy(KEY_OFFSET).applyQuaternion(cam.quaternion).add(cam.position); keyLight.updateMatrixWorld(); };
const speakerAt = t => { const line = story.lines.find(l => l.who !== 'narrator' && t >= l.start && t <= l.start + l.duration); return line && visibleNow.find(k => C[k].root.name === line.who && C[k].root.position.y > -1000); };
function keyFor(shot, t) {
  if (shot.key != null) return shot.key;
  shot.key = 0; const span = shot.end - shot.at;
  for (const f of [.2, .5, .8]) {
    const s = shot.at + span * f; poseAt(shot, s); look(shot.scene, s);
    const key = speakerAt(s); if (!key) continue;
    const c = shot.cam(s, clamp(ease(f))); camera.position.copy(c.pos); camera.lookAt(c.look); camera.fov = c.fov; camera.updateProjectionMatrix();
    for (const level of KEY_LEVELS.filter(l => l >= shot.key)) {
      keyLight.intensity = level; renderer.render(scene, camera); const y = faceLuma(key);
      if (y == null) break; shot.key = level; if (y >= FACE_MIN) break;
    }
  }
  poseAt(shot, t); look(shot.scene, t); // the frame being drawn is posed again by the director
  return shot.key;
}
const grade = name => ({ day1: 'blur(6px) saturate(1.1) brightness(1.04)', day14: 'blur(6px) saturate(1.05) brightness(1.02)', grotto: 'saturate(1.15) contrast(1.05)', icepalace: 'saturate(.92)', zfighters: 'saturate(.95)', invasion: 'saturate(1.12) contrast(1.05)', battle: 'saturate(1.1) contrast(1.04)', finale: 'saturate(1.1) contrast(1.03)' })[name] ?? 'saturate(1.1) contrast(1.03)';

// ------------------------------------------------------------------ shots
const P = (...a) => v(...a);
/** A camera from explicit points that eases from (pos0, look0) to (pos1, look1). */
const mv = (p0, p1, l0, l1, f0 = 44, f1 = f0) => (t, k) => ({ pos: P(...p0).lerp(P(...p1), k), look: P(...l0).lerp(P(...l1), k), fov: lerp(f0, f1, k) });
/** An orbit around a point: radius, height, start and end angle. */
const orbit = (c, r, h, a0, a1, fov = 44, lookUp = 0) => (t, k) => { const a = lerp(a0, a1, k); return { pos: P(c[0] + Math.cos(a) * r, c[1] + h, c[2] + Math.sin(a) * r), look: P(c[0], c[1] + lookUp, c[2]), fov }; };
const followCam = (key, off, lookOff = [0, 1, 0], fov = 42) => () => { const p = C[key].root.position; return { pos: P(p.x + off[0], p.y + off[1], p.z + off[2]), look: P(p.x + lookOff[0], p.y + lookOff[1], p.z + lookOff[2]), fov }; };
const S0 = n => SC(n)[0];
const g = (x, z) => G(x, z);
const shots = [
  { at: 0, scene: 'open', name: 'Three islands', free: true, cam: orbit([0, 0, -12], 300, 190, 1.9, 1.35, 42) },
  { at: S0('lobby'), scene: 'lobby', name: 'The white void', dissolve: 1.4, cam: mv([0, LOBBY_Y + 3, -16], [0, LOBBY_Y + 1.8, -11.5], [0, LOBBY_Y + 2.6, 10], [0, LOBBY_Y + 2.1, 8], 50, 46) },
  { at: L('n-who'), scene: 'lobby', name: 'Every kind of player', cam: mv([-6, LOBBY_Y + 1.6, -9], [6, LOBBY_Y + 1.6, -9], [-4, LOBBY_Y + 1.2, -1], [4, LOBBY_Y + 1.2, -1], 40) },
  { at: L('goku-wow') - .3, scene: 'lobby', name: 'So many people!', cam: front(C.goku.root, { dist: 2.2, side: .35, fov: 36 }) },
  { at: L('poc-hello') - .3, scene: 'lobby', name: 'Hello, Pocoyo', cam: front(C.pocoyo.root, { dist: 2.1, side: -.3, up: -.1, fov: 36 }) },
  { at: S0('map'), scene: 'map', name: 'The map', dissolve: 1.4, cam: mv([0, 560, 120], [0, 470, 70], [0, 0, -10], [0, 0, -12], 40, 38) },
  { at: S0('day1'), scene: 'day1', name: 'Day 1', dissolve: 1, cam: mv([-30, 62, 122], [-34, 60, 116], [-92, 18, 52], [-92, 18, 52], 42) },
  { at: S0('outpost'), scene: 'outpost', name: 'The desert outpost', dissolve: 1, free: true, cam: mv([ox + 40, g(ox, oz) + 34, oz + 46], [OC[0] + 10, g(...OC) + 9, OC[1] + 14], [ox, g(ox, oz) + 2, oz], [OC[0] - 1.5, g(...OC) + 1.4, OC[1] - 1], 44, 44) },
  { at: L('bulma-sand') - .3, scene: 'outpost', name: 'Sand in, water out', cam: front(C.bulma.root, { dist: 2.2, side: .4, fov: 36 }) },
  { at: L('briefs-cat') - .3, scene: 'outpost', name: 'The cat again', cam: front(C.briefs.root, { dist: 2.1, side: -.35, fov: 36 }) },
  { at: L('gabby-panels') - .3, scene: 'outpost', name: 'Solar panels, coming through', cam: followCam('gabby', [5, 5.5, 7], [0, .8, 0], 42) },
  { at: L('cakey-delivery') - .2, scene: 'outpost', name: 'Delivery for the desert', cam: front(C.cakey.root, { dist: 1.7, side: .3, up: -.05, fov: 36 }) },
  { at: L('n-mailbox') - .3, scene: 'outpost', name: 'A pink mailbox', cam: mv([OC[0] + 5.5, g(...OC) + 3.6, OC[1] + 8.5], [OC[0] + 4.5, g(...OC) + 3, OC[1] + 6.5], [OC[0] - 1, g(...OC) + 1.2, OC[1] - 2], [OC[0] + 1.6, g(...OC) + 1.2, OC[1] - 1.2], 46, 40) },
  { at: S0('warroom'), scene: 'warroom', name: 'The highest mesa', dissolve: 1.2, free: true, cam: mv([vx - 30, VG - 12, TZ - 34], [vx - 22, VG - 6, TZ - 26], [vx, VG + 3, TZ], [vx, VG + 2, TZ], 44) },
  { at: L('veg-prince') - .3, scene: 'warroom', name: 'Prince of All Hot Island Wastes', cam: front(C.vegeta.root, { dist: 2.4, side: .45, up: .12, fov: 38 }) },
  { at: L('n-studied') - .3, scene: 'warroom', name: 'Pocoyo studies the map', cam: mv([vx - 2.6, VG + 2.2, TZ - 4.6], [vx - 2.2, VG + 1.9, TZ - 3.6], [vx - .4, VG + 1, TZ], [vx - .4, VG + 1.2, TZ], 40, 38) },
  { at: L('poc-tower') - .2, scene: 'warroom', name: 'Tower!', cam: front(C.pocoyo.root, { dist: 1.9, side: .3, up: -.1, fov: 38 }) },
  { at: L('veg-off') - .2, scene: 'warroom', name: 'Off my battle plans!', cam: front(C.vegeta.root, { dist: 1.8, side: -.3, fov: 36 }) },
  { at: L('n-armour') - .3, scene: 'warroom', name: 'The armour', cam: mv([vx + 5.2, VG + 1.7, TZ + 1.4], [vx + 4.8, VG + 1.6, TZ + 1], [vx + 2.7, VG + .9, TZ - 1.1], [vx + 2.8, VG + .9, TZ - 1], 40) }, // from beyond the stand, so Pato faces us as he turns to it
  { at: L('pato-beak') - .2, scene: 'warroom', name: 'It clashes with my beak', cam: front(C.pato.root, { dist: 1.8, side: .3, up: -.05, fov: 36 }) },
  { at: L('n-clapping') - .3, scene: 'warroom', name: 'Cheering for Pocoyo', cam: mv([vx - 3.4, VG + 2.4, TZ - 6], [vx - 2.4, VG + 2.2, TZ - 5], [vx + .4, VG + 1.4, TZ + 3], [vx + .2, VG + 1.2, TZ + 1.5], 46, 44) },
  { at: L('n-cuteness') - .3, scene: 'warroom', name: 'Stopped by cuteness', cam: mv([vx - 6, VG + 4, TZ - 9], [vx - 9, VG + 6, TZ - 13], [vx, VG + 1, TZ + 1], [vx, VG + 1, TZ + 1], 46) },
  { at: L('veg-unbelievable') - .3, scene: 'warroom', name: 'Unbelievable', cam: front(C.vegeta.root, { dist: 1.7, side: .35, fov: 36 }) },
  { at: S0('icepalace'), scene: 'icepalace', name: 'The Cold Island', dissolve: 1.4, free: true, cam: orbit([px, KG + 10, pz], 52, 16, 2.3, 1.8, 46) },
  { at: L('frieza-mine') - .3, scene: 'icepalace', name: 'Mine', cam: front(C.frieza.root, { dist: 2.1, side: .4, fov: 38 }) },
  { at: L('n-bread') - .3, scene: 'icepalace', name: 'A lot of bread', cam: mv([px + 4, KG + 2.4, pz - 1], [px + 3, KG + 2.2, pz - 2], [px + 1, KG + 1, pz - 6], [px, KG + 1, pz - 6], 46) },
  { at: L('frieza-know') - .2, scene: 'icepalace', name: 'Ohohoho', cam: front(C.frieza.root, { dist: 1.8, side: -.35, fov: 36 }) },
  { at: S0('grotto'), scene: 'grotto', name: 'The spa grotto', dissolve: 1.2, cam: mv([gx - 6.2, F0 + 2.8, gz + 2.6], [gx - 5.4, F0 + 2.4, gz + 2.2], [gx + 2.5, F0 + 1.2, gz - .4], [gx + 2.5, F0 + 1.1, gz - .4], 58) },
  { at: L('mercat-welcome') - .3, scene: 'grotto', name: 'Welcome!', cam: front(C.mercat.root, { dist: 2.0, side: .3, fov: 38 }) },
  { at: L('dj-lights') - .3, scene: 'grotto', name: 'Lights up!', cam: front(C.djcatnip.root, { dist: 2.0, side: -.3, fov: 38 }) },
  { at: L('box-tada') - .3, scene: 'grotto', name: 'Ta-da!', cam: mv([gx - 4.4, F0 + 2.2, gz + 1.6], [gx - 4.8, F0 + 2.6, gz + 1.8], [gx + 1.8, F0 + 2.4, gz - 2.4], [gx + .5, F0 + 3.5, gz - 1], 56) },
  { at: L('n-dayoff') - .3, scene: 'grotto', name: 'The day off', cam: mv([gx - 1, F0 + 1.9, gz + 2.6], [gx - .4, F0 + 1.7, gz + 2.2], [gx + 3, F0 + .4, gz - 1.6], [gx + 3, F0 + .4, gz - 1.6], 46) },
  { at: S0('zfighters'), scene: 'zfighters', name: 'This is Goku', dissolve: 1.2, free: true, cam: mv([kx - 6, g(kx, kz) + 5, kz - 14], [kx - 2.4, g(kx, kz) + 2.2, kz - 7.6], [kx, g(kx, kz) + 1.4, kz], [kx + .4, g(kx, kz) + 1.3, kz + 1], 44, 40) },
  { at: L('goku-hello') - .2, scene: 'zfighters', name: 'Hello!', cam: front(C.gokuL.root, { dist: 2.1, side: .3, fov: 36 }) },
  { at: L('n-cold') - .2, scene: 'zfighters', name: 'Very, very cold', cam: mv([kx - 1.6, g(kx, kz) + 1.7, kz - 6.6], [kx - 1.2, g(kx, kz) + 1.6, kz - 5.6], [kx + .4, g(kx, kz) + 1.2, kz + 1], [kx + .4, g(kx, kz) + 1.2, kz + 1], 40) },
  { at: L('krillin-teeth') - .3, scene: 'zfighters', name: 'Morse code', cam: front(C.krillin.root, { dist: 1.8, side: .3, fov: 36 }) },
  { at: L('n-potato') - .2, scene: 'zfighters', name: 'A potato?', cam: front(C.gokuL.root, { dist: 2.4, side: -.4, fov: 38 }) },
  { at: L('n-zombie') - .4, scene: 'zfighters', name: 'A zombie', cam: mv([kx + 3.2, g(kx, kz) + 2.1, kz + 7.5], [kx + 2.8, g(kx, kz) + 2, kz + 7], [kx + 2, g(kx, kz) + 1.2, kz + 1.5], [kx + 1.8, g(kx, kz) + 1.2, kz + 1.4], 46) }, // from the zombie's side: Goku greets it facing us
  { at: L('yamcha-run') - .2, scene: 'zfighters', name: 'Run!', cam: mv([kx - 12, g(kx, kz) + 3, kz - 2], [kx - 13, g(kx, kz) + 3, kz - 5], [kx - 2, g(kx, kz) + 1, kz - 1], [kx - 8, g(kx, kz) + 1, kz - 6], 44) },
  { at: L('n-idea') - 1.2, scene: 'zfighters', name: 'That night', dissolve: 1.2, cam: mv([kx + .5, g(kx, kz) + 6, kz - 9], [kx + .5, g(kx, kz) + 4.2, kz - 6], [kx + .5, g(kx, kz) + 1, kz + 3], [kx + .5, g(kx, kz) + 1.2, kz + 4], 46) },
  { at: L('goku-breathe') - .3, scene: 'zfighters', name: 'Breathe like me', cam: front(C.gokuL.root, { dist: 1.7, side: .3, up: .25, fov: 40 }) }, // in the ring's gap, between Goku and the fire
  { at: L('n-warmer') - .3, scene: 'zfighters', name: 'A little bit warmer', cam: mv([kx + 9, g(kx, kz) + 5, kz + 12], [kx + 11, g(kx, kz) + 8, kz + 15], [kx + .5, g(kx, kz) + 1, kz + 3], [kx + .5, g(kx, kz) + 1, kz + 3], 44) },
  { at: S0('bakery'), scene: 'bakery', name: 'The Temperate Island', dissolve: 1.4, free: true, cam: mv([bx + 60, DY + 40, bz + 70], [bx - 4, DY + 3.2, bz + 14], [bx, DY + 6, bz], [bx + 1.5, DY + 2, bz + 7], 46) },
  { at: L('buu-cookies') - .3, scene: 'bakery', name: 'Cookies for everybody', cam: front(C.buu.root, { dist: 2.0, side: 1.2, fov: 42 }) }, // on the side of the door away from the queue
  { at: L('goten-two') - .2, scene: 'bakery', name: 'Two cookies?', cam: front(C.goten.root, { dist: 1.5, side: -.3, up: -.05, fov: 36 }) },
  { at: L('buu-yes') - .2, scene: 'bakery', name: 'Buu say yes', cam: mv([door[0] - 3.6, DY + 2.4, door[1] + 4.6], [door[0] - 3.2, DY + 2.3, door[1] + 4.2], [door[0], DY + 1.5, door[1]], [door[0], DY + 1.5, door[1]], 42) },
  { at: L('n-park') - .3, scene: 'bakery', name: 'Pocoyo Park', cam: mv([qx - 5, g(qx, qz) + 3, qz + 10], [qx - 4, g(qx, qz) + 2.6, qz + 8.5], [qx, g(qx, qz) + 1, qz + 2], [qx + 2, g(qx, qz) + 1, qz], 44) },
  { at: L('nina-go') - .2, scene: 'bakery', name: 'Ready, set, go', cam: front(C.nina.root, { dist: 1.8, side: .3, up: -.05, fov: 36 }) },
  { at: E('nina-go'), scene: 'bakery', name: 'The minecart race', cam: (t, k) => { const p = C.trunks.root.position; return { pos: P(p.x + 7, p.y + 2.6, p.z + 3.5), look: P(p.x, p.y + .8, p.z + .5), fov: 46 }; } }, // ahead of the carts: the racers shout toward us
  { at: S0('cafe'), scene: 'cafe', name: 'Caffeine Paws', dissolve: 1.2, cam: mv([tbl[0] + 2, TY + 3.5, tbl[1] + 7.5], [tbl[0] + 1.6, TY + 2.6, tbl[1] + 6], [tbl[0] - .4, TY + 1.6, tbl[1]], [tbl[0] - .4, TY + 1.4, tbl[1]], 44) }, // looks at the table: a target inside the café wall leaves the guard nowhere to stand
  { at: L('gohan-ocelots') - .3, scene: 'cafe', name: 'Only when there are cookies', cam: single(C.gohan.root, C.videl.root, { dist: 1.7, angle: .55, fov: 34 }) },
  { at: L('videl-eco') - .2, scene: 'cafe', name: 'The cookies are the ecosystem', cam: single(C.videl.root, C.gohan.root, { dist: 1.7, angle: -.55, fov: 34 }) },
  { at: L('gabby-ears') - .3, scene: 'cafe', name: 'Cat ears for everyone', free: true, cam: mv([tbl[0] + 3.6, TY + 2.9, tbl[1] + 9], [tbl[0] + 3.2, TY + 2.6, tbl[1] + 8], [tbl[0] + .2, TY + 1.4, tbl[1] - 1.6], [tbl[0] + .2, TY + 1.4, tbl[1] - 1.6], 40) },
  { at: S0('day7'), scene: 'day7', name: 'Day 7: the factions', dissolve: 1.4, cam: mv([0, 520, 100], [0, 470, 70], [0, 0, -10], [0, 0, -12], 40, 38) },
  { at: S0('day8'), scene: 'day8', name: 'Day 8: a loud noise', dissolve: 1.2, cam: mv([60, 70, 150], [40, 60, 120], [0, 10, 0], [0, 12, -10], 46) },
  { at: S0('nimbus'), scene: 'nimbus', name: 'Flying Nimbus', dissolve: 1, cam: (t, k) => { const p = C.goku.root.position; return { pos: P(p.x - 6, p.y + 2.4, p.z + 7), look: P(p.x, p.y + 1, p.z), fov: 42 }; } },
  { at: L('gohan-wait') - .4, scene: 'nimbus', name: 'Dad, wait for me!', cam: (t, k) => { const R = C.gohan.root, p = R.position, f = [-Math.sin(R.rotation.y), -Math.cos(R.rotation.y)]; return { pos: P(p.x + f[0] * 5 + f[1] * 2, p.y + .3, p.z + f[1] * 5 - f[0] * 2), look: P(p.x, p.y + .6, p.z), fov: 40 }; } }, // ahead of and level with him, so he calls out toward us
  { at: S0('crash'), scene: 'crash', name: 'A shortcut', dissolve: 1.2, free: true, cam: mv([px - 20, KG + 15, K.z0 - 34], [px - 16, KG + 11, K.z0 - 24], [px, KG + 6, K.z0], [px, KG + 5, K.z0], 46) },
  { at: L('n-through') + .7, scene: 'crash', name: 'Through the wall', cam: mv([px + 5, KG + 1.9, K.z1 - 1.4], [px + 4.6, KG + 1.9, K.z1 - 1.8], [px - .4, KG + 2.6, K.z0 + 1], [px - .4, KG + 2.2, K.z0 + 2], 52) },
  { at: L('frieza-palace') - .2, scene: 'crash', name: 'My palace!', cam: front(C.frieza.root, { dist: 2, side: .4, fov: 38 }) },
  { at: L('goku-oops') - .2, scene: 'crash', name: 'Got any potatoes?', cam: front(C.goku.root, { dist: 2.4, side: -.4, fov: 38 }) },
  { at: S0('trade'), scene: 'trade', name: 'The Meow Meow Mailbox', dissolve: 1.2, cam: mv([OC[0] + 1.2, g(...OC) + 2.3, OC[1] - 4.4], [OC[0] + 1, g(...OC) + 2.2, OC[1] - 4], [OC[0] + 2.2, g(...OC) + 1.3, OC[1] - .8], [OC[0] + 2.2, g(...OC) + 1.3, OC[1] - .8], 44) }, // from beyond the mailbox: Gabby talks to it facing us
  { at: E('gabby-mailbox') - .2, scene: 'trade', name: 'Parcels to the north', cam: mv([OC[0] + 3, g(...OC) + 2, OC[1] + 4], [OC[0] + 3, g(...OC) + 4, OC[1] + 4], [OC[0] + 6, g(...OC) + 6, OC[1] - 20], [OC[0] + 10, g(...OC) + 8, OC[1] - 40], 50) },
  { at: L('n-outdone') - .2, scene: 'trade', name: 'The thruster train', cam: (t, k) => { const p = train.position; return { pos: P(p.x - 13, BY + 3.2, p.z + 1.5), look: P(p.x + 1, p.y + 1.4, p.z - 1), fov: 44 }; } },
  { at: L('veg-train') - .2, scene: 'trade', name: 'Faster than any mailbox', cam: (t, k) => { const p = C.vegeta.root.position, y = C.vegeta.root.rotation.y, f = [-Math.sin(y), -Math.cos(y)]; return { pos: P(p.x + f[0] * 3.2 + f[1] * 2.6, p.y + 1.9, p.z + f[1] * 3.2 - f[0] * 2.6), look: P(p.x, p.y + 1.4, p.z), fov: 38 }; } },
  { at: L('elly-choo') - .2, scene: 'trade', name: 'Choo choo', cam: (t, k) => { const p = C.elly.root.position; return { pos: P(p.x - 3.4, p.y + 1.6, p.z - 1.8), look: P(p.x + .3, p.y + 1, p.z), fov: 40 }; } },
  { at: L('n-into') - .3, scene: 'trade', name: 'Into the bakery', free: true, cam: mv([bx - 9, DY + 4, bz + 18], [bx - 7, DY + 3.4, bz + 15], [bx - 2, DY + 1.4, bz + 6], [bx, DY + 1.6, bz + 7], 46) },
  { at: S0('photobomb'), scene: 'photobomb', name: 'A secret plan', dissolve: 1.2, cam: mv([mx + 2, MG + 1.8, mz - 12], [mx + .2, MG + 1.6, mz - 4.3], [mx, MG + 1.6, mz + 1], [mx - .2, MG + 1.5, mz + 2], 44) }, // a straight dolly in, under the roof's edge
  { at: L('frieza-deal') - .3, scene: 'photobomb', name: 'These blasters are yours', cam: front(C.frieza.root, { dist: 2.0, side: .35, up: .05, fov: 38 }) },
  { at: L('n-broadcast') - .3, scene: 'photobomb', name: 'World broadcast', cam: mv([mx + .2, MG + 1.6, mz - 3.6], [mx + .2, MG + 1.6, mz - 3.2], [mx - .2, MG + 1.5, mz + 2], [mx - .2, MG + 1.5, mz + 2], 40) },
  { at: L('frieza-baby') - .2, scene: 'photobomb', name: 'Who invited the baby?', cam: front(C.frieza.root, { dist: 2.3, side: -.4, up: .1, fov: 40 }) },
  { at: L('n-nobody-invites') - .2, scene: 'photobomb', name: 'He just comes', cam: mv([mx + .2, MG + 1.6, mz - 3.4], [mx + .2, MG + 1.7, mz - 4.2], [mx - .2, MG + 1.5, mz + 2], [mx - .2, MG + 1.5, mz + 2], 40) },
  { at: S0('day14'), scene: 'day14', name: 'Day 14', dissolve: 1, cam: mv([-34, 70, 128], [-30, 66, 122], [-92, 18, 52], [-92, 18, 52], 42) },
  { at: S0('invasion'), scene: 'invasion', name: 'The sky turns green', dissolve: 1.2, cam: mv([230, 190, 250], [190, 170, 210], [0, 30, -30], [0, 40, -40], 46) },
  { at: L('poc-aliens') - .3, scene: 'invasion', name: 'Oooh! Aliens!', free: true, cam: mv([sx + 12, SG + 4, sz + 24], [sx + 12, SG + 4.6, sz + 23], [sx - 10, SG + 40, sz - 60], [sx - 12, SG + 46, sz - 70], 52) },
  { at: S0('backfire'), scene: 'backfire', name: 'Who invited them?', dissolve: 1.2, free: true, cam: mv([px - 30, KG + 18, pz + 46], [px - 26, KG + 14, pz + 42], [px, KG + 22, pz], [px, KG + 28, pz], 48) },
  { at: L('frieza-king') - .3, scene: 'backfire', name: 'I shall be your king', cam: front(C.frieza.root, { dist: 2.4, side: .4, up: .1, fov: 40 }) },
  { at: L('cmd-thanks') - .3, scene: 'backfire', name: 'Thank you for the invitation', cam: front(C.commander.root, { dist: 2.6, side: -.35, up: -.15, fov: 40 }) },
  { at: L('frieza-deal2') - .2, scene: 'backfire', name: 'NOT the deal', cam: front(C.frieza.root, { dist: 2.0, side: -.35, fov: 38 }) },
  { at: L('n-lesson') - .3, scene: 'backfire', name: 'They might take yours first', free: true, cam: mv([BFC[0], G(...BF) + 1.8, BFC[1]], [BFC[0] - .4, G(...BF) + 2.2, BFC[1] + .6], [BF[0] + 2.4, G(...BF) + 4.6, BF[1] - 8], [px, KG + 30, pz], 50, 54) },
  { at: S0('rally'), scene: 'rally', name: 'All three islands', dissolve: 1.2, free: true, cam: mv([sx + 30, SG + 14, sz + 40], [sx + 16, SG + 8, sz + 22], [sx, SG + 3, sz - 4], [sx - 1, SG + 2, sz - 4], 46) },
  { at: L('bulma-shield') - .3, scene: 'rally', name: 'One big shield', cam: front(C.bulma.root, { dist: 2.2, side: .4, fov: 38 }) },
  { at: L('veg-once') - .3, scene: 'rally', name: 'Just this once', cam: single(C.vegeta.root, C.goku.root, { dist: 2.2, angle: .6, fov: 38 }) },
  { at: L('goku-spirit') - .2, scene: 'rally', name: "That's the spirit", cam: front(C.goku.root, { dist: 2.0, side: -.3, fov: 36 }) },
  { at: L('gabby-walls') - .3, scene: 'rally', name: 'Pink walls', cam: front(C.gabby.root, { dist: 2.8, side: .5, up: .1, fov: 48 }) },
  { at: L('pato-armour') - .2, scene: 'rally', name: 'It goes with my beak', cam: front(C.pato.root, { dist: 1.8, side: .3, up: -.05, fov: 36 }) },
  { at: L('frieza-mine2') - .3, scene: 'rally', name: 'Move over, monkeys', cam: front(C.frieza.root, { dist: 2.2, side: .4, fov: 38 }) },
  { at: S0('battle'), scene: 'battle', name: 'The Grumblers came', dissolve: .8, free: true, cam: mv([FC[0] + 4, SG + 3.2, NORTH - 8], [FC[0] + 3, SG + 3.6, NORTH - 6.6], [FC[0] + 1, SG + 3.4, NORTH + 4], [FC[0] + 1, SG + 3.2, NORTH + 4], 56) },
  { at: L('cmd-fire') - .3, scene: 'battle', name: 'Goo rays! Fire!', cam: front(C.commander.root, { dist: 3, side: .3, up: -.3, fov: 42 }) },
  { at: L('n-goo') - .3, scene: 'battle', name: 'Like a gummy bear', cam: mv([FC[0] + 1.6, SG + 1.8, FC[1] + .2], [FC[0] + 1.9, SG + 1.9, FC[1] - .2], [FC[0] + 1, SG + 1.1, FC[1] - 2.5], [FC[0] + 1, SG + 1.2, FC[1] - 2.5], 44) },
  { at: L('kri-disc') - .3, scene: 'fights', name: 'Destructo Disc!', cam: mv([KRC[0], SG + 1.7, KRC[1]], [KRC[0] - .2, SG + 1.8, KRC[1] - .3], [KR[0], SG + 1.5, KR[1]], [KR[0], SG + 1.7, KR[1]], 42) },
  { at: L('kri-disc') + 1.0, scene: 'fights', name: 'A saucer in two', free: true, cam: mv([KRC[0], SG + 2.2, KRC[1] + .6], [KRC[0] + .3, SG + 2.1, KRC[1] + 1], [DS[0], DS[1] - 1, DS[2]], [DS[0], DS[1] - 5, DS[2]], 52) },
  { at: L('veg-train2') - .3, scene: 'fights', name: 'Saiyan train', free: true, cam: (t, k) => { const p = train.position; return { pos: P(p.x - 2, p.y + 2.6, p.z + 9), look: P(p.x + 1, p.y + 1.6, p.z), fov: 44 }; } },
  { at: L('buu-candy') - .3, scene: 'fights', name: 'Ray into candy', cam: front(C.buu.root, { dist: 2.6, side: .4, up: .2, fov: 46 }) },
  { at: L('n-cats') - .3, scene: 'fights', name: 'Even the cats', cam: mv([FC[0] - 4.4, SG + 2.4, FC[1] - 2], [FC[0] - 4.8, SG + 2.2, FC[1] - 2.4], [FC[0] - 5, SG + 1.2, FC[1] - 6.5], [FC[0] - 5, SG + 1.2, FC[1] - 6.5], 46) },
  { at: S0('beam'), scene: 'beam', name: 'A tractor beam', dissolve: .6, cam: mv([BMC[0], SG + 2.8, BMC[1]], [BMC[0] - .3, SG + 3, BMC[1] - .4], [BM[0] + .6, SG + 3.2, BM[1] - .6], [BM[0] + .6, SG + 4, BM[1] - .6], 46) },
  { at: L('gohan-gotyou') - .3, scene: 'beam', name: "I've got you", cam: mv([BM[0] + 3.4, SG + 3.2, BM[1] + 4.4], [BM[0] + 3.2, SG + 3.3, BM[1] + 4.1], [BM[0] + .6, SG + 3.8, BM[1] - .6], [BM[0] + .6, SG + 3.8, BM[1] - .6], 44) },
  { at: S0('catch'), scene: 'catch', name: 'Blasted out of the sky', dissolve: .6, free: true, cam: mv([CB[0] + 6, SG + 9, CB[1] + 14], [CB[0] + 5, SG + 8.5, CB[1] + 13], [CB[0] - 3, SG + 11, CB[1] - 6], [CB[0] - 1, SG + 9, CB[1] - 2], 50) },
  { at: L('goku-gohan') - .2, scene: 'catch', name: 'Gohan!', cam: front(C.goku.root, { dist: 2.2, side: .3, up: .1, fov: 40 }) },
  { at: L('n-cantfly') - .3, scene: 'catch', name: 'Videl could not fly', cam: front(C.videl.root, { dist: 2.4, side: .4, up: .05, fov: 40 }) },
  { at: L('n-goodheart') - .3, scene: 'catch', name: 'A good heart', cam: (t, k) => { const p = nimbusCloud.position; return { pos: P(p.x + 1.4, p.y + 2.2, p.z + 5.6), look: P(p.x, p.y + 1, p.z), fov: 44 }; } },
  { at: L('goku-ride') - .2, scene: 'catch', name: 'It let her ride!', cam: front(C.goku.root, { dist: 2.2, side: -.3, up: .1, fov: 38 }) },
  { at: L('videl-caught') - .3, scene: 'catch', name: 'Now I caught you', cam: mv([CB[0] - .6, SG + 9.6, CB[1] + 4.6], [CB[0] - .5, SG + 9.4, CB[1] + 4.2], [CB[0], SG + 8.1, CB[1] - .2], [CB[0], SG + 8.1, CB[1] - .2], 42) },
  { at: S0('backtoback'), scene: 'backtoback', name: 'Surrounded', dissolve: .6, cam: mv([B2BC[0], SG + 1.6, B2BC[1]], [B2BC[0] - .3, SG + 1.5, B2BC[1] - .4], [B2B[0], SG + 1.2, B2B[1] - .6], [B2B[0], SG + 1.2, B2B[1] - .6], 44) },
  { at: L('gohan-back') - .2, scene: 'backtoback', name: 'Back to back?', cam: front(C.gohanS.root, { dist: 2.0, side: -.3, fov: 38 }) },
  { at: L('videl-always') - .2, scene: 'backtoback', name: 'Always', cam: front(C.videl.root, { dist: 1.9, side: .3, fov: 38 }) },
  { at: L('n-partners') - .3, scene: 'backtoback', name: 'What partners do', cam: orbit([B2B[0], SG, B2B[1]], 5.2, 1.6, 1.2, 2.0, 44, 1.2) },
  { at: S0('finale'), scene: 'finale', name: 'Lend me your energy', dissolve: .8, cam: front(C.gokuS.root, { dist: 3, side: .3, up: .2, fov: 42 }) },
  { at: L('n-hands') - .3, scene: 'finale', name: 'Hands up', free: true, cam: mv([GK[0] + 14, SG + 5, GK[1] + 16], [GK[0] + 12, SG + 6, GK[1] + 14], [GK[0], SG + 7, GK[1]], [GK[0], SG + 10, GK[1]], 50) },
  { at: L('bulma-eye') - .3, scene: 'finale', name: 'The eye', free: true, cam: mv([GK[0] + 6, SG + 3, GK[1] + 8], [GK[0] + 6, SG + 3.4, GK[1] + 8], [EYE[0], EYE[1] - 4, EYE[2]], [EYE[0], EYE[1], EYE[2]], 52) },
  { at: L('gohan-together') - .3, scene: 'finale', name: 'Together', free: true, cam: mv([GV[0] - 3.4, GV[1] + 2.6, GV[2] - 4.2], [GV[0] - 3.2, GV[1] + 2.8, GV[2] - 4], [GV[0] + .9, GV[1] - .2, GV[2]], [GV[0] + .9, GV[1] - .2, GV[2]], 42) },
  { at: L('n-crack') - .3, scene: 'finale', name: 'Crack', free: true, cam: mv([GK[0] + 58, SG + 14, GK[1] + 60], [GK[0] + 56, SG + 15, GK[1] + 58], [sx - 4, SG + 34, sz - 16], [sx - 4, SG + 36, sz - 16], 50) },
  { at: L('goku-now') - .2, scene: 'finale', name: 'NOW!', cam: front(C.gokuS.root, { dist: 2.6, side: -.3, up: .3, fov: 40 }) },
  { at: L('goku-now') + 1.4, scene: 'finale', name: 'All the way home', free: true, cam: mv([GK[0] + 40, SG + 10, GK[1] + 50], [GK[0] + 44, SG + 12, GK[1] + 56], [EYE[0], EYE[1], EYE[2]], [EYE[0] + 20, EYE[1] + 40, EYE[2] - 60], 50, 56) },
  { at: S0('victory'), scene: 'victory', name: 'They flew home', dissolve: 1, free: true, cam: mv([VC[0] + 8, SG + 4, VC[1] + 12], [VC[0] + 7, SG + 3.6, VC[1] + 11], [sx - 30, SG + 40, sz - 100], [sx - 40, SG + 50, sz - 120], 50) },
  { at: L('zib-hello') - .3, scene: 'victory', name: 'Um... hello?', cam: front(C.zib.root, { dist: 1.8, side: .3, up: -.1, fov: 36 }) },
  { at: L('poc-hello2') - .2, scene: 'victory', name: 'Hello!', cam: front(C.pocoyo.root, { dist: 1.9, side: -.3, up: -.1, fov: 36 }) },
  { at: L('n-littlest') - .3, scene: 'victory', name: 'The littlest one', cam: mv([VCC[0], SG + .9, VCC[1]], [VCC[0] - .2, SG + .9, VCC[1] - .4], [VC[0], SG + 1.4, VC[1] - 1], [VC[0], SG + 1.4, VC[1] - 1], 42) },
  { at: L('poc-party') - .2, scene: 'victory', name: 'Party?', cam: front(C.pocoyo.root, { dist: 1.8, side: .3, up: -.1, fov: 36 }) },
  { at: S0('proposal'), scene: 'proposal', name: 'Sunset', dissolve: 1.4, free: true, cam: mv([PR[0] + 10, SG + 4, PR[1] + 9], [PR[0] + 8, SG + 3, PR[1] + 7], [PR[0], SG + 1.2, PR[1]], [PR[0], SG + 1.2, PR[1]], 46) },
  { at: L('gohan-saved') - .3, scene: 'proposal', name: 'You saved me', cam: front(C.gohanS.root, { dist: 2.0, side: .3, fov: 38 }) },
  { at: L('videl-first') - .2, scene: 'proposal', name: 'You saved me first', cam: front(C.videl.root, { dist: 1.9, side: -.3, fov: 38 }) },
  { at: L('gohan-marry') - .3, scene: 'proposal', name: 'Will you marry me?', cam: mv([PRC[0], SG + 1, PRC[1]], [PRC[0] - .3, SG + 1, PRC[1] - .3], [PR[0], SG + 1, PR[1] - .2], [PR[0], SG + 1, PR[1] - .2], 40) },
  { at: L('videl-yes') - .2, scene: 'proposal', name: 'Yes', cam: front(C.videl.root, { dist: 1.8, side: .3, fov: 36 }) },
  { at: L('goku-cake2') - .2, scene: 'proposal', name: 'Does this mean cake?', free: true, cam: mv([PR[0] + 6, SG + 2.4, PR[1] + 6], [PR[0] + 8, SG + 3.4, PR[1] + 8], [PR[0], SG + 1, PR[1]], [PR[0], SG + 1.4, PR[1]], 44) },
  { at: S0('wedding'), scene: 'wedding', name: 'The biggest wedding', dissolve: 1.4, free: true, cam: mv([WA[0] + 12, SG + 8.5, WA[1] + 14], [WA[0] + 10.5, SG + 7.5, WA[1] + 12], [WA[0] - .4, SG + 1.4, WA[1] + 3.2], [WA[0] - .4, SG + 1.2, WA[1] + 3.2], 50) },
  { at: L('n-guests') + 2, scene: 'wedding', name: 'A cake as tall as a house', free: true, cam: mv([CAKE[0] + 4, SG + 3, CAKE[1] + 8], [CAKE[0] + 2, SG + 4, CAKE[1] + 7], [CAKE[0], SG + 3, CAKE[1]], [CAKE[0], cakeTop, CAKE[1]], 46) },
  { at: L('elly-promise') - .3, scene: 'wedding', name: 'Do you promise?', cam: mv([WA[0] + .2, SG + 2.3, WA[1] + 4.6], [WA[0] + .2, SG + 2.2, WA[1] + 4.2], [WA[0], SG + 1.6, WA[1] - .4], [WA[0], SG + 1.6, WA[1] - .4], 40) },
  { at: L('videl-vow') - .3, scene: 'wedding', name: 'I promise to catch you', cam: front(C.videlB.root, { dist: 1.8, side: .3, fov: 36 }) },
  { at: L('gohan-vow') - .3, scene: 'wedding', name: 'I promise to never let go', cam: front(C.gohanG.root, { dist: 1.8, side: -.3, fov: 36 }) },
  { at: L('poc-rings') - .3, scene: 'wedding', name: 'Rings!', cam: mv([WA[0], SG + 1.4, WA[1] + 5], [WA[0], SG + 1.3, WA[1] + 4.6], [WA[0], SG + .9, WA[1] + 1.5], [WA[0], SG + .9, WA[1] + 1.5], 44) },
  { at: L('frieza-goo') - .3, scene: 'wedding', name: "It's the goo", cam: front(C.frieza.root, { dist: 2.0, side: .35, fov: 38 }) },
  { at: S0('goodbye'), scene: 'goodbye', name: 'The party', dissolve: 1.2, free: true, cam: mv([WA[0] + 10, SG + 5, WA[1] + 15], [WA[0] + 9, SG + 6, WA[1] + 14], [WA[0] + 3, SG + 4, WA[1]], [WA[0] + 3, SG + 6, WA[1] - 4], 50) },
  { at: L('n-wave') - .3, scene: 'goodbye', name: 'The very top of the cake', cam: mv([GBC[0], cakeTop - .8, GBC[1]], [GBC[0] - .6, cakeTop - .6, GBC[1] - .2], [CAKE[0], cakeTop - .6, CAKE[1]], [CAKE[0], cakeTop + .2, CAKE[1]], 44) },
  { at: L('poc-bye') - .2, scene: 'goodbye', name: 'Bye-bye!', cam: front(C.pocoyo.root, { dist: 2.2, side: .3, up: -.1, fov: 38 }) },
  { at: L('n-goodbye') - .3, scene: 'goodbye', name: 'Goodbye, everyone', free: true, cam: mv([CAKE[0] - 2, cakeTop + .4, CAKE[1] + 7], [CAKE[0] + 6, cakeTop + 10, CAKE[1] + 26], [CAKE[0], cakeTop, CAKE[1]], [CAKE[0] - 6, SG + 20, CAKE[1] - 30], 44, 50) },
  { at: S0('credits'), scene: 'credits', name: 'Credits', free: true, cam: mv([CAKE[0] + 6, cakeTop + 10, CAKE[1] + 26], [CAKE[0] + 10, cakeTop + 18, CAKE[1] + 40], [CAKE[0] - 6, SG + 20, CAKE[1] - 30], [CAKE[0] - 8, SG + 26, CAKE[1] - 40], 50) },
];

/** Keep the lens on the near side of any blocks (terrain, walls, leaves, the fortress) between it and its subject. */
const ray = new T.Raycaster();
const solidAt = p => { const b = W.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), d = BLOCK_DEFS[b]; return !!b && !!d && d.solid !== false && !d.plant && !d.liquid; };
const shown = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
const occluders = () => [W.group, ...props.filter(o => o.visible), ...visibleNow.map(k => C[k].root)];
const solidHit = h => shown(h.object) && !h.object.isPoints && h.object.geometry?.type !== 'PlaneGeometry' && !h.object.material?.transparent;
const AROUND = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new T.Vector3(...a));
/** Something between the subject and the lens, or the lens inside a block, or within 30 cm of an actor, prop or block. */
const blocked = (look, pos, blockers) => {
  const d = pos.clone().sub(look), len = d.length(); ray.set(look, d.normalize()); ray.far = len; ray.near = .4;
  const hit = ray.intersectObjects(blockers, true).find(solidHit); if (hit) return hit;
  if (solidAt(pos)) return { distance: len };
  for (const a of AROUND) { ray.set(pos, a); ray.near = 0; ray.far = .3; if (ray.intersectObjects(blockers, true).some(solidHit)) return { distance: len }; }
};
const probeCam = new T.PerspectiveCamera(40, 16 / 9, .05, 10);
/** Share of the frame covered by something within `near` metres of the lens (a 7×4 grid of rays): a head or a wall
 *  filling half the picture in front of the subject, which a single line of sight to the subject's face misses. */
function foreground(pos, look, fov, blockers, near = 1.6) {
  probeCam.position.copy(pos); probeCam.lookAt(look); probeCam.fov = fov; probeCam.updateProjectionMatrix(); probeCam.updateMatrixWorld();
  let hits = 0; for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) { ray.setFromCamera({ x: -.85 + i * .283, y: -.6 + j * .4 }, probeCam); ray.near = 0; ray.far = near; if (ray.intersectObjects(blockers, true).some(solidHit)) hits++; }
  return hits / 28;
}
// Offsets the guard may apply to a camera: [lift in metres, swing round the subject in radians], tried in order.
const OFFSETS = [[0, 0], [1, 0], [2.2, 0], [0, .45], [0, -.45], [1.4, .45], [1.4, -.45], [3.5, 0], [2.5, .9], [2.5, -.9]];
const offsetCam = (c, [lift, turn]) => {
  if (lift || turn) { const rel = c.pos.clone().sub(c.look).applyAxisAngle(new T.Vector3(0, 1, 0), turn); c.pos.copy(c.look).add(rel).add(new T.Vector3(0, lift, 0)); }
  return c;
};
/** Is this camera blocked in the frame as currently posed: something between lens and subject, the lens in or against
 *  something, or a near foreground over a fifth of the frame? Blockers are the set, its props and crowds, and the cast,
 *  except the subject (the actor nearest the aim point, who would otherwise block its own line of sight). */
function cameraBlocked(c) {
  const hp = new T.Vector3(), near = k => { C[k].head.getWorldPosition(hp); return hp.distanceTo(c.look); };
  const subject = visibleNow.filter(k => near(k) < 1.2).sort((a, b) => near(a) - near(b))[0];
  const blockers = [W.group, ...props.filter(o => o.visible), ...visibleNow.filter(k => k !== subject).map(k => C[k].root)];
  return !!blocked(c.look, c.pos, blockers) || foreground(c.pos, c.look, c.fov, blockers) > .2;
}
/** Pose the scene as the director would at time t of a shot (actors, props, visibility), without rendering. */
function poseAt(shot, t) { for (const R of Object.values(C)) R.root.visible = false; reset(t, shot); directors[shot.scene](t); D.applyLooks(); scene.updateMatrixWorld(true); }
/**
 * Keep the lens clear of blocks, props, crowds and the cast, with one decision per shot. The guard poses the shot at
 * nine moments across its length, picks the first offset that is clear at all of them (or blocked at the fewest), and
 * holds it for the whole shot. Deciding frame by frame made a moving camera hop between offsets 1–7 m apart whenever
 * the line of sight brushed someone (the lobby dolly past the heroes jumped several times a second).
 */
const guard = shot => {
  const cam = shot.cam; let offset;
  return (t, k) => {
    if (!offset) {
      const span = shot.end - shot.at, moments = Array.from({ length: 9 }, (_, i) => shot.at + span * (i + .5) / 9);
      const score = OFFSETS.map(() => 0);
      for (const s of moments) {
        poseAt(shot, s); const c0 = cam(s, clamp(ease((s - shot.at) / span)));
        if (c0.pos.distanceTo(c0.look) > 45) { offset = OFFSETS[0]; break; } // aerials look down from far above
        OFFSETS.forEach((o, i) => { if (score[i] < 9 && cameraBlocked(offsetCam({ pos: c0.pos.clone(), look: c0.look.clone(), fov: c0.fov }, o))) score[i]++; });
      }
      offset ??= OFFSETS[score.indexOf(Math.min(...score))];
      shot.guard = { offset, blockedAt: Math.min(...score) }; // for review: which shots the guard had to move, and how far
      poseAt(shot, t); // back to the frame being drawn
    }
    return offsetCam(cam(t, k), offset);
  };
};
for (const s of shots) if (!s.free) s.cam = guard(s); // establishing shots look at a building from outside, on purpose

// ------------------------------------------------------------------ overlays
const project = p => { const q = new T.Vector3(...p).project(camera); return q.z > 1 || Math.abs(q.x) > 1.2 || Math.abs(q.y) > 1.2 ? null : [(q.x + 1) / 2 * 1280, (1 - q.y) / 2 * 720]; };
const box3 = new T.Box3();
// The tag hangs a fixed few pixels above the top of the head (hair, ears and hats included), placed on screen. A fixed
// distance in metres above the body floated MerCat's close-up tag half a frame up, onto the soldier behind her.
const headTop = key => { box3.setFromObject(C[key].head); return [(box3.min.x + box3.max.x) / 2, box3.max.y, (box3.min.z + box3.max.z) / 2]; };
const TAGS = { lobby: ['pocoyo', 'goku', 'gabby', 'vegeta', 'pato', 'frieza', 'pandy', 'buu', 'elly', 'nina'], outpost: ['bulma', 'briefs', 'gabby', 'pandy', 'cakey'], warroom: ['vegeta', 'pocoyo', 'pato', 'elly'],
  icepalace: ['frieza'], grotto: ['mercat', 'babybox', 'djcatnip'], zfighters: ['gokuL', 'krillin', 'yamchaL', 'zombie'], bakery: ['buu', 'goten', 'nina', 'loula', 'trunks'], cafe: ['gohan', 'videl', 'gabby', 'cakey'],
  nimbus: ['goku', 'gohan'], crash: ['goku', 'frieza'], trade: ['gabby', 'vegeta', 'elly', 'pato', 'buu'], photobomb: ['frieza', 'pocoyo', 'yamcha'], backfire: ['frieza', 'commander'],
  rally: ['bulma', 'goku', 'vegeta', 'gohan', 'videl', 'gabby', 'carlita', 'pato', 'frieza', 'pocoyo'], battle: ['gokuS', 'vegeta', 'frieza', 'commander'], fights: ['krillin2', 'vegeta', 'buu', 'pato'], beam: ['videl', 'gohanS'],
  catch: ['videl', 'gohanS', 'goku', 'commander'], backtoback: ['gohanS', 'videl', 'a1', 'a5'], finale: ['gokuS', 'gohanS', 'videl'], victory: ['pocoyo', 'zib'], proposal: ['gohanS', 'videl'], wedding: ['gohanG', 'videlB', 'elly', 'pocoyo', 'zib', 'frieza'], goodbye: ['pocoyo', 'gohanG', 'videlB'] };
const ISLAND_PINS = [['hot', 'vegeta', 'HOT ISLAND'], ['cold', 'frieza', 'COLD ISLAND'], ['temperate', 'pocoyo', 'TEMPERATE ISLAND']];
const FACTION_PINS = [['bulma', SITES.outpost, 'Capsule Corp Outpost', [0, 0]], ['vegeta', SITES.vegetaMesa, 'Saiyan-Pocoyo Accord', [0, 0]], ['frieza', SITES.palace, 'Ice Sanctuary', [0, -6]], ['goku', SITES.goku, 'Z-Fighters', [-6, 6]], ['mercat', SITES.grotto, 'Spa Grotto', [10, 8]],
  ['buu', SITES.bakery, 'Buu Bakery', [-8, 0]], ['gabby', SITES.cafe, 'Caffeine Paws', [8, 4]], ['pocoyo', SITES.park, 'Pocoyo Park', [0, 10]], ['gohan', SITES.plateau, 'Central Plateau', [0, -14]]];
const CAPTIONS = [ // [from, to, text]: the editor's punchy captions
  [L('veg-prince') + .2, E('veg-prince') + .4, '"Prince of All Hot Island Wastes"'], [L('n-cuteness') + 1, E('veg-unbelievable'), 'Coup averted: cuteness'], [L('n-zombie') + .6, E('goku-hithere'), '*zombie noises*'],
  [L('n-through') + .9, L('n-through') + 2.4, 'CRASH'], [E('poc-peekaboo') + .05, E('poc-peekaboo') + 1.1, '*squeak*'], [L('n-crack') + .1, L('n-crack') + 1.4, 'CRACK'], [L('n-goo') + 2.4, E('n-goo'), '*boing*'],
];
const CREDITS = ['1500 CARTOON PLAYERS SIMULATE CIVILIZATION', '', 'A Blockyland Pictures film', 'Inspired by the Minecraft civilization experiments', '', 'Starring (fan versions of)', 'Pocoyo · Elly · Pato · Nina · Loula', 'Gabby · Pandy Paws · Cakey Cat · MerCat · Baby Box · DJ Catnip · Carlita',
  'Goku · Vegeta · Gohan · Krillin · Yamcha · Bulma · Dr. Briefs · Videl · Majin Buu · Trunks · Goten · Frieza', '', 'Commander Grumbleflux · Zib · 3,000 Grumblers', '(original aliens in Pocoyo\'s toy style)', '', 'and 1,500 players in costume', '', 'Built with Blockyland\'s own blocks', 'Voices: OpenAI text-to-speech, directed line by line · Original score', '', 'Pocoyo, Gabby\'s Dollhouse and Dragon Ball belong to their creators.', 'This is an unofficial fan film.'];
function overlay(ink, t, shot) {
  const sc = shot.scene;
  // name tags: big and soft in close-ups, small Minecraft tags in wider shots
  const placed = []; // small tags that would overlap one already drawn are left out (the nearer actor's tag wins)
  const onScreen = (TAGS[sc] ?? []).filter(key => C[key].root.visible && C[key].root.position.y > -1000).map(key => ({ key, p: headTop(key) })).map(o => ({ ...o, d: camera.position.distanceTo(new T.Vector3(...o.p)) })).sort((a, b) => a.d - b.d);
  for (const { key, p, d } of onScreen) {
    const top = project(p); if (!top) continue; const label = LABEL[key] ?? C[key].label, xy = [top[0], top[1] - 6];
    if (hidden(key) >= .8) continue; // no tag on someone behind a wall
    if (d < 3.4) { bigName(ink, [xy[0], Math.max(90, xy[1] - 8)], label, 40); continue; }
    if (d >= 60) continue;
    const size = d < 12 ? 16 : 13, w = label.length * size * .62 + size * .6, box = [xy[0] - w / 2, xy[1] - size * 1.15, xy[0] + w / 2, xy[1] + size * .15];
    if (placed.some(b => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3])) continue;
    placed.push(box); nameTag(ink, xy, label, { size });
  }
  if (sc === 'map' || sc === 'day7') {
    const [a] = SC(sc), k = ease((t - a - 1) / 1.5);
    if (sc === 'map') ISLAND_PINS.forEach(([name, face, label], i) => { const I = ISLANDS[name]; if (t > a + 1.5 + i * .8) mapPin(ink, project([I.c[0], 20, I.c[1] - 8]), '500 Players', pinFace(face), { size: 64, sub: label }); });
    else {
      ink.save(); ink.strokeStyle = 'rgba(255,60,60,.9)'; ink.lineWidth = 3; ink.setLineDash([12, 8]);
      for (const I of Object.values(ISLANDS)) { const r = I.r + 8, pts = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([dx, dz]) => project([I.c[0] + dx, SEA, I.c[1] + dz])); if (pts.some(q => !q)) continue; ink.beginPath(); pts.forEach((q, i) => i ? ink.lineTo(...q) : ink.moveTo(...q)); ink.closePath(); ink.stroke(); }
      ink.restore();
      FACTION_PINS.forEach(([face, [x, z], label, [dx, dz]], i) => { if (t > a + 1 + i * .45) mapPin(ink, project([x + dx, 20, z + dz]), label, pinFace(face), { size: 38 }); });
      counters(ink, [488, 497, 431]);
    }
  }
  if (sc === 'day1') { dayCard(ink, 'DAY 1'); counters(ink, [500, 500, 500]); }
  if (sc === 'day14') { dayCard(ink, 'DAY 14'); counters(ink, [61, 78, 40]); }
  if (sc === 'day8') { const a = SC('day8')[0]; if (t < a + 3.2) { ink.globalAlpha = Math.min(1, (a + 3.2 - t) / .6); dayCard(ink, 'DAY 8'); counters(ink, [471, 488, 402]); ink.globalAlpha = 1; } if (t > L('n-gone') + .4) banner(ink, 'WORLD BORDER DISABLED', 'Day 8 · anything is possible', { color: '#7dff9a' }); }
  if (sc === 'invasion' && t > L('n-thousands') - .2) { ink.globalAlpha = Math.min(1, (t - L('n-thousands') + .2) / .4); banner(ink, 'INVASION', 'DAY 15 · 500 SAUCERS · 3,000 GRUMBLERS', { color: '#5fd04a' }); ink.globalAlpha = 1; }
  if (sc === 'backfire' && t > L('frieza-king') - .3) broadcast(ink, 'WORLD BROADCAST · Frieza and the Grumblers');
  if (sc === 'battle' && t < S0('battle') + 5) { ink.globalAlpha = clamp(Math.min(t - S0('battle'), S0('battle') + 5 - t) / .4); banner(ink, 'THE BATTLE OF THE CENTRAL PLATEAU', 'goo rays only stick · they never hurt', { color: '#5fd04a' }); ink.globalAlpha = 1; }
  if (sc === 'photobomb' && t > L('n-broadcast') - .3) broadcast(ink, "WORLD BROADCAST · Frieza's (secret) meeting");
  if (sc === 'finale') { const flashK = clamp(1 - Math.abs(t - (L('goku-now') + 2.5)) / .7); if (flashK > 0) { ink.fillStyle = `rgba(255,248,230,${flashK * .85})`; ink.fillRect(0, 0, 1280, 720); } }
  if (sc === 'credits') {
    const [a, b] = SC('credits'), end = story.duration - 6.6, k = (t - a) / (end - a); if (t < end) {
      ink.save(); ink.textAlign = 'center'; CREDITS.forEach((line, i) => { const y = 720 - k * (CREDITS.length * 34 + 520) + i * 34; if (y < 40 || y > 690) return; ink.font = i === 0 ? '30px "Pixelify Sans", monospace' : '19px "Pixelify Sans", monospace'; ink.fillStyle = i === 0 ? '#ffd27a' : '#f4f0e6'; ink.globalAlpha = .92; ink.fillText(line, 640, y); }); ink.restore();
    }
  }
  for (const [a, b, words] of CAPTIONS) if (t > a && t < b) { ink.globalAlpha = Math.min(1, (t - a) / .2, (b - t) / .2); caption(ink, words, { y: 150, size: words.length < 10 ? 52 : 36 }); ink.globalAlpha = 1; }
}

// ------------------------------------------------------------------ sound cues
const CUES = {
  lobbySparkle: [S0('lobby'), S0('lobby') + 3], borderHum: [S0('open'), S0('day8') + 5],
  roar: L('n-noise') + 1.4, borderOff: L('n-gone') - .2, nimbus: [S0('nimbus'), SC('nimbus')[1]], crashWhoosh: [S0('crash'), L('n-through') + .9], crash: L('n-through') + .9,
  squeak: E('poc-peekaboo') + .05, mailbox: [E('gabby-mailbox') - .6, E('gabby-mailbox') + 1.2], train: [L('n-outdone'), E('n-into') + 1.2], trainArrive: E('n-into') + .9,
  zombie: [L('n-zombie') + .5, E('goku-hithere') + .5], fire: [L('n-idea') - 1, SC('zfighters')[1]], cheer: [L('n-clapping'), E('grunt-tower') + 1], minecart: [E('nina-go'), E('nina-go') + 6],
  alarm: L('n-green') + .4, fleetHum: [S0('invasion'), SC('finale')[1]], beams: [[L('frieza-king'), SC('backfire')[1]], [L('n-beam'), E('gohan-never')]], walls: L('gabby-walls') + .2,
  battle: [S0('battle'), SC('backtoback')[1]], zaps: [[S0('battle'), SC('fights')[1]], [S0('backtoback'), SC('backtoback')[1]]], disc: [L('kri-disc') + .3, L('kri-disc') + 1.4], halves: L('kri-disc') + 1.4,
  train2: [L('veg-train2') - 1, E('veg-train2') + 3], candy: L('buu-candy') + .2, blast: L('n-furious') + 1.4, nimbus2: [L('n-goodheart') - .2, L('goku-ride')], transform: S0('finale') + .2,
  bomb: [L('n-hands'), L('goku-now')], masenko: [L('videl-together') + .2, L('n-crack') + .4], crack: L('n-crack'), launch: L('goku-now') + .3, impact: L('goku-now') + 2.5, away: [L('goku-now') + 2.6, SC('finale')[1]],
  victoryCheer: [S0('victory'), L('zib-hello') - .5], bells: S0('wedding') + .6, fireworks: [S0('goodbye'), SC('credits')[1]], night: [S0('goodbye'), SC('credits')[1]],
  blizzard: [[S0('icepalace'), SC('icepalace')[1]], [S0('zfighters'), L('n-idea')], [S0('crash'), SC('crash')[1]]], birds: [[S0('bakery'), SC('cafe')[1]], [S0('outpost'), SC('warroom')[1]]],
  sea: [[S0('nimbus'), SC('nimbus')[1]], [S0('trade'), SC('trade')[1]]], cave: [S0('grotto'), SC('grotto')[1]],
};

await fontsReady;
await D.mount({ shots, directors, reset, light, grade, overlay, wavBase64, soundtrack: () => buildCivSoundtrack(story, { BASE, cues: CUES, scenes: SCENE }) });
// ------------------------------------------------------------------ continuity check (render-film.mjs runs it on sampled frames)
/** Fraction of the five sample points on a head that something solid hides from the lens. */
function hidden(key) {
  const R = C[key], hp = new T.Vector3(); R.head.getWorldPosition(hp); const s = R.root.scale.x * .18, targets = occluders().filter(o => o !== R.root); let n = 0;
  for (const [dx, dy] of [[0, 0], [-s, -s], [s, -s], [-s, s], [s, s]]) {
    const p = hp.clone().add(new T.Vector3(dx, dy + .1 * R.root.scale.x, 0)), d = p.clone().sub(camera.position), len = d.length(); ray.set(camera.position, d.normalize()); ray.near = .05; ray.far = len - .35;
    if (ray.intersectObjects(targets, true).some(h => !h.object.isPoints && !h.object.material?.transparent && shown(h.object))) n++;
  }
  return n / 5;
}
/** How bright an actor's face is in the frame just rendered: the 75th percentile of luma (0–255) over the middle of the
 *  head, so dark hair and eyes don't count. Null when the head is off screen, far away or turned from the lens. */
function faceLuma(key) {
  const R = C[key], hp = R.head.getWorldPosition(new T.Vector3()), q = hp.clone().project(camera);
  if (hp.distanceTo(camera.position) > 9 || q.z > 1 || Math.abs(q.x) > .9 || Math.abs(q.y) > .9) return null;
  const yaw = R.root.rotation.y + R.head.rotation.y, toCam = camera.position.clone().sub(hp).setY(0).normalize();
  if (-Math.sin(yaw) * toCam.x - Math.cos(yaw) * toCam.z < -.15) return null;
  const gl = renderer.getContext(), W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
  const e = hp.clone().add(new T.Vector3(0, R.root.scale.x * .18, 0)).project(camera), r = Math.max(2, Math.abs(e.y - q.y) / 2 * H * .6), n = Math.round(2 * r);
  const px = new Uint8Array(n * n * 4); gl.readPixels(Math.round((q.x + 1) / 2 * W - r), Math.round((q.y + 1) / 2 * H - r), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px);
  const ls = []; for (let i = 0; i < px.length; i += 4) ls.push(.2126 * px[i] + .7152 * px[i + 1] + .0722 * px[i + 2]);
  return ls.sort((a, b) => a - b)[Math.floor(ls.length * .75)];
}
/** Problems a viewer would see in the frame at t: actors inside blocks, a lens inside a block, a speaker hidden or turned away. */
function check(t) {
  const shot = window.pilot.renderFrame(t).shot, issues = [];
  for (const key of new Set(visibleNow)) for (const f of coplanarFaces(C[key].root)) issues.push(`${key} has flush same-facing faces (${f}): they z-fight`);
  for (const p of props) if (p.visible) for (const f of coplanarFaces(p)) issues.push(`a prop has flush same-facing faces (${f}): they z-fight`);
  if (solidAt(camera.position)) issues.push('camera inside a block');
  { const look = camera.getWorldDirection(new T.Vector3()).add(camera.position), f = foreground(camera.position, look, camera.fov, occluders()); if (f > .2) issues.push(`something within 1.6 m of the lens covers ${Math.round(f * 100)}% of the frame`); }
  for (const key of new Set(visibleNow)) {
    const R = C[key].root, k = R.scale.x; if (R.position.y < -1000) continue;
    const hp = new T.Vector3(); C[key].head.getWorldPosition(hp); const on = hp.clone().project(camera); if (on.z > 1 || Math.abs(on.x) > 1.05 || Math.abs(on.y) > 1.05) continue; // off screen
    const seated = Math.abs(C[key].legL.rotation.x) > 1; // legs raised to the horizontal (whatever the rig's sign)
    const yaw = R.rotation.y, f = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new T.Vector3(-f.z, 0, f.x);
    const inside = (seated ? [1, 1.6] : [.35, 1, 1.6]).some(h => [[-.2, 0], [.2, 0], [0, -.12], [0, .12]].some(([a, b]) => solidAt(R.position.clone().addScaledVector(r, a * k).addScaledVector(f, b * k).add(new T.Vector3(0, h * k, 0)))));
    if (inside) issues.push(`${key} is inside a block`);
  }
  for (const line of story.lines) {
    if (t < line.start || t > line.start + line.duration || line.who === 'narrator') continue;
    const key = visibleNow.find(k => C[k].root.name === line.who && C[k].root.position.y > -1000); if (!key) continue;
    const hp = new T.Vector3(); C[key].head.getWorldPosition(hp); const q = hp.clone().project(camera), d = hp.distanceTo(camera.position);
    if (q.z > 1 || Math.abs(q.x) > .9 || Math.abs(q.y) > .9 || d > 9) continue; // speaking off screen or far away
    const yaw = C[key].root.rotation.y + C[key].head.rotation.y, toCam = camera.position.clone().sub(hp).setY(0).normalize();
    if (-Math.sin(yaw) * toCam.x - Math.cos(yaw) * toCam.z < -.15) issues.push(`${key} speaks with their back to the camera`);
    const h = hidden(key); if (h >= .6) issues.push(`${key} speaks but is hidden (${Math.round(h * 100)}%)`);
    const y = h < .6 ? faceLuma(key) : null; if (y != null && y < FACE_MIN * .6) issues.push(`${key} speaks with an unlit face (luma ${Math.round(y)} of 255)`);
  }
  // camera continuity: within a shot the lens moves smoothly, so one frame's step should not dwarf the step before it
  const s = shots.find(s => s.name === shot && t >= s.at && t < s.end), dt = 1 / 24;
  if (s && t - dt >= s.at && t + dt < s.end) {
    const at = u => { poseAt(s, u); return s.cam(u, clamp(ease((u - s.at) / (s.end - s.at)))).pos.clone(); };
    const a = at(t - dt), b = at(t), c = at(t + dt), before = a.distanceTo(b), after = b.distanceTo(c);
    if (after > .3 && after > 4 * before + .05) issues.push(`camera jumps ${after.toFixed(2)} m in one frame (it was moving ${before.toFixed(2)} m per frame)`);
    poseAt(s, t);
  }
  return { t, shot, issues };
}
window.pilot.check = check;

// handles for scripts/render-film.mjs checks and for probing a frame from the console
window.civ = { T, C, camera, scene, sun, renderer, W, shots, SITES, props: { islandBorders, clouds, fleet, MS }, visible: () => visibleNow };
