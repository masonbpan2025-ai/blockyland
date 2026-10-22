// 1500 Cartoon Players: Three Islands, Three Weddings · 1500名卡通玩家：三座岛，三场婚礼. Direction: the cast (with wedding
// clothes), the sets on the three islands, every scene's action, cameras, light and overlays (name tags, act cards,
// captions, the broadcast, the CCTV tape and the credits). Built on the shared stage and director like civFilm.js, with the
// same safeguards: the rig check, a camera guard decided once per shot, a per-shot key light for faces, and the
// continuity check that scripts/render-film.mjs runs before every render. Blocking follows the key frames
// (weddingFrames.js): people talking face each other cheated toward the lens, and the lens sits in front of the speaker.
import * as T from 'three';
import { WED_STORY as story, SCENE } from './wedStory.js';
import { buildWorld, SITES, ISLANDS, SEA } from './civWorld.js';
import { makeCharacter, posePlayer, cube, bowTie, separateCoplanar, coplanarFaces, checkRig } from './civCast.js';
import { crowd, gather } from './civCrowd.js';
import { aura, fairyLights, cookies, sparkles, glowMat } from './civFx.js';
import { skyDome, mapTable, hoverPod } from './civFrames.js';
import { nameTag, bigName, caption, banner, broadcast, mapPin, fontsReady } from './civOverlay.js';
import { texBox, rand } from './claudeStage.js';
import { BLOCK_DEFS } from '../blocks.js';
import { at as walkPath, createDirector, v } from './claudeDirector.js';
import { clamp, ease, lerp } from './claudeActors.js';
import { mat, farm, lantern, gravityMachine, smoke, sign, arch, weddingCake, ring, fireworks } from './wedProps.js';
import { buildWedSoundtrack, wavBase64 } from './wedScore.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const W = await buildWorld();
const stage = { ...W.stage, groundAt: W.groundAt };
const { scene, camera, sun, hemi, renderer } = W.stage;
camera.far = 3200; camera.updateProjectionMatrix();
scene.add(W.group);
const G = (x, z) => W.groundAt(x, z);
const span = (t, a, b) => ease((t - a) / (b - a));
const yawTo = (from, to) => Math.atan2(-(to[0] - from[0]), -(to[1] - from[1]));
/** A point k of the way from a to b: talkers face their partner cheated toward the lens (k .3–.5), so both faces read. */
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
const SC = name => SCENE[name];
/** Arms folded across the chest (a left arm's negative z swings it outward, so folding is the opposite sign). */
const CROSS = { armL: [-1.25, .75], armR: [-1.25, -.75] };
const HIPS = { armL: [-.5, -.5], armR: [-.5, .5] };

// ------------------------------------------------------------------ sky, sun and looks
const sky = skyDome(scene, 0x7fa8d8, 0xf6d9b0, 0xffd9a0, [-.6, .45, .55], { stars: false });
scene.fog = new T.Fog(0xf0d6b4, 90, 700);
sun.shadow.camera.far = 900; sun.shadow.mapSize.set(4096, 4096);
const LOOKS = {
  golden: { top: 0x7fa8d8, horizon: 0xf6d9b0, glow: 0xffd9a0, sunColor: 0xffd7a8, sunI: 2.7, hemiSky: 0xdfe8ff, hemiGround: 0x8a6f52, hemiI: 1.15, fog: 0xf0d6b4, exposure: 1.0, stars: 0 },
  day: { top: 0x6fa6e0, horizon: 0xdbeaf3, glow: 0xfff3d6, sunColor: 0xfff2dc, sunI: 2.5, hemiSky: 0xdcecff, hemiGround: 0x7d7a52, hemiI: 1.3, fog: 0xd8e6ef, exposure: 1.02, stars: 0 },
  blizzard: { top: 0xaab8c6, horizon: 0xdfe6ec, glow: 0xe8eef2, sunColor: 0xe7eef6, sunI: 1.0, hemiSky: 0xe6eef6, hemiGround: 0x8f9cab, hemiI: 1.7, fog: 0xd9e1e8, exposure: 1.0, stars: 0 },
  night: { top: 0x0c1430, horizon: 0x2c3a5e, glow: 0x6a7cc0, sunColor: 0x8fa2d8, sunI: .6, hemiSky: 0x52608e, hemiGround: 0x1c2032, hemiI: .8, fog: 0x2a3550, exposure: 1.05, stars: 1 },
  dusk: { top: 0x2c3a6e, horizon: 0xf2a066, glow: 0xffb070, sunColor: 0xffb080, sunI: 1.4, hemiSky: 0x7080b0, hemiGround: 0x3a3040, hemiI: .95, fog: 0x8a7090, exposure: 1.05, stars: 0 },
  freeze: { top: 0x7f98b8, horizon: 0xd8e6f2, glow: 0xe8f4ff, sunColor: 0xd8e8ff, sunI: 1.4, hemiSky: 0xe6eef6, hemiGround: 0x8f9cab, hemiI: 1.5, fog: 0xc8d8e8, exposure: 1.0, stars: 0 },
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
function make(key, id, name = id, { groom = false } = {}) { const R = makeCharacter(id); if (groom) bowTie(R); Object.assign(R.root, { head: R.head, face: R.face, name }); C[key] = R; cast.push(R.root); return R; }
for (const [k, id, name, o] of [['goku', 'goku'], ['gokuG', 'goku', 'goku', { groom: true }], ['chichi', 'chichi'], ['chichiB', 'chichi_bride', 'chichi'],
  ['vegeta', 'vegeta'], ['vegetaG', 'vegeta', 'vegeta', { groom: true }], ['bulma', 'bulma'], ['bulmaB', 'bulma_bride', 'bulma'],
  ['krillin', 'krillin'], ['krillinG', 'krillin', 'krillin', { groom: true }], ['a18', 'android18'], ['a18B', 'android18_bride', 'android18'],
  ['gohan', 'gohan'], ['gohanG', 'gohan', 'gohan', { groom: true }], ['videl', 'videl'], ['videlB', 'videl_bride', 'videl'],
  ['goten', 'goten'], ['trunks', 'trunks'], ['bulla', 'bulla'], ['marron', 'marron'],
  ['yamcha', 'yamcha'], ['frieza', 'frieza'], ['buu', 'buu'], ['briefs', 'drbriefs'], ['babybox', 'babybox'],
  ['pocoyo', 'pocoyo'], ['pato', 'pato'], ['elly', 'elly'], ['loula', 'loula']]) make(k, id, name, o);
// every limb must move the way the poses below are written (a reach ends in front of the face): stop the film otherwise
{ const bad = Object.entries(C).flatMap(([k, R]) => checkRig(R, k)); if (bad.length) throw new Error('Rig check failed:\n' + bad.join('\n')); }
const LABEL = { a18: 'Android 18', a18B: 'Android 18', gokuG: 'Goku', chichiB: 'Chi-Chi', vegetaG: 'Vegeta', bulmaB: 'Bulma', krillinG: 'Krillin', gohanG: 'Gohan', videlB: 'Videl', briefs: 'Dr. Briefs', trunks: 'Trunks' };
let visibleNow = [];
/** Pose a character for this frame and make it visible. q: posePlayer options; y defaults to the ground.
 *  q.lie lays it on its back, face to the sky; q.tip (0–1) is the flip in between (tipping backward through the air). */
function show(key, q) {
  const R = C[key]; R.root.visible = true;
  const y = q.y ?? G(q.x, q.z);
  posePlayer(R, { ...q, y, t: q.t ?? 0, lie: false });
  if (q.lie) { R.root.rotation.set(Math.PI / 2, q.yaw ?? 0, 0, 'YXZ'); R.root.position.y = y + .16 * R.root.scale.x; }
  else if (q.tip) { R.root.rotation.set(q.tip * Math.PI / 2, q.yaw ?? 0, 0, 'YXZ'); R.root.position.y = y + Math.sin(q.tip * Math.PI) * .9 + q.tip * .16; }
  R.root.updateMatrixWorld(true); visibleNow.push(key); return R;
}
const H = (key, t, q) => show(key, { ...q, t });
/** A walker: keys [[t, x, z, yaw?]]; returns options for show() (position, facing, walk phase). */
const walker = keys => { const w = walkPath(keys); return (t, q = {}) => { const s = w(t); return { x: s.x, z: s.z, yaw: s.yaw, walk: s.phase, stride: s.stride * .9, ...q }; }; };
/** Arm gesture: during [a, b] the arm eases to `to`, otherwise it rests. */
const reach = (t, windows, rest) => { for (const [a, b, to] of windows) if (t > a - .4 && t < b + .4) { const k = Math.min(span(t, a - .4, a), 1 - span(t, b, b + .4)); return [lerp(rest?.[0] ?? 0, to[0], k), lerp(rest?.[1] ?? 0, to[1], k)]; } return rest; };
const WAVE = t => [-2.6 + Math.sin(t * 9) * .25, .35];
const WAVEL = t => [-2.6 + Math.sin(t * 9) * .25, -.35];
const CHEER = t => ({ armL: [-2.8 + Math.sin(t * 8) * .15, -.35], armR: [-2.8 - Math.sin(t * 8) * .15, .35] });

const D = await createDirector({ story, stage, cast, audioDir: 'cinema-weddings', voiceScript: 'PYTHON=python3.10 node scripts/narrate-claude.mjs civ-weddings' });
const LINE = Object.fromEntries(story.lines.map(l => [l.id, l]));
const L = id => LINE[id].start, E = id => LINE[id].start + LINE[id].duration;
const { single: single0, front: front0 } = D.cams;
// block heads are big: singles and fronts a little wider than the human films
const front = (a, o = {}) => front0(a, { ...o, dist: (o.dist ?? 1.4) * 1.6 }), single = (a, b, o = {}) => single0(a, b, { ...o, dist: (o.dist ?? 1.5) * 1.45 });

// ------------------------------------------------------------------ expressions
const X = D.expressions;
X('goku', [[0, 'happy'], [L('goku-cake'), 'excited'], [L('n-farm'), 'sad'], [L('goku-carrot'), 'greedy'], [L('chichi-mind'), 'surprised'], [E('chichi-mind') + .4, 'shock'], [L('goku-strong'), 'joy'], [L('n-plough'), 'happy'], [L('goku-food'), 'curious'],
  [L('goku-spar'), 'excited'], [L('goku-promise'), 'happy'], [L('goku-onemore'), 'excited'], [L('n-breakfast'), 'happy'], [L('chichi-keep'), 'sheepish'], [L('goku-sorry'), 'sad'], [L('n-knot'), 'determined'], [L('chichi-help'), 'happy'],
  [L('goku-him'), 'bored'], [E('veg-him'), 'determined'], [SC('thaw')[0], 'determined'], [L('n-flakes'), 'joy'], [L('goku-know'), 'warm'], [L('chichi-yes'), 'joy'], [L('goku-foodq'), 'curious'], [L('n-wedding'), 'happy'], [L('goku-vow'), 'warm'], [L('goku-back'), 'surprised'],
  [SC('year15')[0], 'happy'], [L('n-flipped'), 'shock'], [L('goku-best'), 'joy'], [L('goku-food2'), 'curious'], [L('n-love'), 'warm']]);
X('chichi', [[0, 'happy'], [L('chichi-mind'), 'stern'], [L('n-flip'), 'determined'], [L('chichi-pay'), 'stern'], [L('chichi-marry'), 'knowing'], [L('chichi-car'), 'excited'], [L('n-round'), 'hopeful'], [L('n-thirtyone'), 'sad'], [L('n-waited'), 'sniffle'],
  [L('chichi-keep'), 'sad'], [L('goku-sorry'), 'surprised'], [L('n-knot'), 'warm'], [L('chichi-help'), 'happy'], [SC('freeze')[0], 'worried'], [L('chichi-seeds'), 'determined'], [L('goku-know'), 'hopeful'], [L('chichi-yes'), 'joy'], [L('goku-foodq'), 'knowing'],
  [L('chichi-vow'), 'warm'], [L('goku-back'), 'shock'], [SC('year15')[0], 'happy'], [L('n-flipped'), 'determined'], [L('goku-best'), 'joy'], [L('chichi-baby'), 'cry'], [L('n-love'), 'warm']]);
X('vegeta', [[0, 'stern'], [L('veg-build'), 'proud'], [L('bulma-please'), 'shock'], [L('veg-prince'), 'proud'], [L('veg-pl'), 'pained'], [E('veg-pl'), 'stern'], [L('veg-grumpy'), 'stern'], [L('veg-crush'), 'determined'], [L('n-boom'), 'stern'], [L('bulma-true'), 'pained'], [L('bulma-out'), 'sad'],
  [L('veg-broke'), 'sheepish'], [L('bulma-secrets'), 'sad'], [L('veg-accepted'), 'proud'], [L('veg-him'), 'shock'], [SC('thaw')[0], 'determined'], [L('n-fireworks'), 'sheepish'], [L('veg-please'), 'warm'], [L('bulma-said'), 'sheepish'], [L('veg-vow'), 'warm'],
  [SC('year15')[0], 'stern'], [L('veg-congrats'), 'proud'], [L('bulma-again'), 'sheepish']]);
X('bulma', [[0, 'determined'], [L('bulma-please'), 'knowing'], [L('bulma-nomachine'), 'proud'], [L('n-pride'), 'bored'], [L('bulma-saiyan'), 'excited'], [L('bulma-machine'), 'shock'], [L('bulma-true'), 'sad'], [L('bulma-out'), 'stern'], [L('veg-broke'), 'surprised'],
  [L('bulma-secrets'), 'warm'], [L('bulma-plan'), 'determined'], [L('bulma-together'), 'stern'], [L('n-fireworks'), 'surprised'], [L('veg-please'), 'hopeful'], [L('bulma-said'), 'joy'], [L('bulma-vow'), 'warm'], [SC('year15')[0], 'happy'], [L('bulma-again'), 'joy']]);
X('krillin', [[0, 'happy'], [L('n-cold'), 'pained'], [L('kri-cocoa'), 'hopeful'], [L('a18-need'), 'sad'], [L('kri-everyone'), 'warm'], [L('n-empty'), 'joy'], [L('n-crept'), 'curious'], [L('kri-okay'), 'worried'], [L('n-flew'), 'sad'], [L('kri-get'), 'determined'],
  [L('n-grab'), 'determined'], [L('kri-nobody'), 'warm'], [L('a18-choose'), 'joy'], [SC('thaw')[0], 'happy'], [L('kri-every'), 'hopeful'], [L('a18-fine'), 'joy'], [L('kri-vow'), 'warm'], [SC('year15')[0], 'happy']]);
X('android18', [[0, 'bored'], [L('kri-everyone'), 'thinking'], [L('n-empty'), 'calm'], [L('n-spy'), 'knowing'], [L('kri-okay'), 'sad'], [SC('remote')[0], 'stern'], [L('n-eighteen'), 'worried'], [L('kri-nobody'), 'surprised'], [L('a18-choose'), 'warm'],
  [SC('thaw')[0], 'determined'], [L('n-flakes'), 'happy'], [L('kri-every'), 'knowing'], [L('a18-fine'), 'warm'], [L('a18-vow'), 'warm'], [SC('year15')[0], 'calm']]);
X('yamcha', [[0, 'bored'], [L('yamcha-never'), 'knowing'], [L('yamcha-saw'), 'stern'], [L('veg-broke'), 'surprised'], [L('yamcha-sorry'), 'sheepish'], [E('veg-accepted'), 'happy']]);
X('frieza', [[0, 'knowing'], [L('frieza-one'), 'greedy'], [L('frieza-remote'), 'knowing'], [L('n-grab'), 'shock'], [L('frieza-what'), 'shock'], [L('n-pop'), 'pained'], [L('poc-cake'), 'surprised'], [L('frieza-front'), 'happy'], [SC('wedding')[0], 'warm'], [L('frieza-snow'), 'cry'], [SC('budokai')[0], 'excited']]);
X('buu', [[0, 'joy']]); X('babybox', [[0, 'curious'], [L('box-play'), 'joy']]); X('pato', [[0, 'calm'], [L('pato-dearly'), 'proud']]);
X('pocoyo', [[0, 'happy'], [L('poc-cake'), 'excited'], [L('poc-rings'), 'joy'], [L('n-loula'), 'shock']]); X('elly', [[0, 'happy']]);
X('gohan', [[0, 'curious'], [L('gohan-rules'), 'knowing'], [L('videl-theory'), 'shock'], [L('gohan-student'), 'sheepish'], [L('gohan-me'), 'sheepish'], [L('gohan-anyway'), 'warm'], [L('gohan-lift'), 'calm'], [L('goten-girlfriend'), 'shock'], [L('gohan-friend'), 'sheepish'], [L('videl-fornow'), 'surprised'],
  [L('gohan-winner'), 'proud'], [SC('fourth')[0], 'warm']]);
X('videl', [[0, 'determined'], [L('videl-theory'), 'knowing'], [L('n-helmet'), 'surprised'], [L('videl-deal'), 'knowing'], [L('gohan-anyway'), 'warm'], [L('videl-flying'), 'joy'], [L('videl-fornow'), 'knowing'], [SC('budokai')[0], 'happy'], [SC('fourth')[0], 'warm']]);
X('goten', [[0, 'excited'], [L('goten-nope'), 'determined'], [L('goten-girlfriend'), 'joy'], [L('n-nudge'), 'shock'], [L('goten-again'), 'happy']]);
X('trunks', [[0, 'proud'], [L('trunks-strong'), 'proud'], [L('n-nudge'), 'shock'], [E('n-nudge') + 1, 'sheepish']]);
X('marron', [[0, 'happy'], [L('marron-settle'), 'knowing'], [L('n-nudge'), 'determined'], [L('gohan-winner'), 'joy']]); X('bulla', [[0, 'happy']]);

// ------------------------------------------------------------------ props (hidden every frame, shown by the scene that needs them)
const props = [];
const prop = o => { props.push(o); o.visible = false; return o; };
const group = () => { const g = new T.Group(); scene.add(g); return prop(g); };
const ALL = ['gi', 'saiyan', 'purpleGi', 'pocoyo', 'elly', 'pato', 'nina', 'gabby', 'panda', 'cat', 'cakey', 'bulma', 'buu', 'soldier'];
// the lobby: a white void floor high above the world, 1,500 players, two crowds (arms down, arms up for "Yaaay!")
const LOBBY_Y = 420;
const lobby = group(); { const floor = new T.Mesh(new T.PlaneGeometry(400, 400), new T.MeshLambertMaterial({ color: 0xf3f5f8 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; lobby.add(floor); lobby.position.y = LOBBY_Y; }
const lobbyFolk = gather(1490, { center: [0, 52], radius: 42, inner: 4, face: [0, -30], seed: 3, mix: ALL });
const lobbyDown = crowd(lobbyFolk), lobbyUp = crowd(lobbyFolk.map((p, i) => ({ ...p, armUp: i % 2 ? 1 : 2 }))); lobby.add(lobbyDown, lobbyUp);
const lobbySpark = sparkles(lobby, [0, 0, 40], { n: 500, radius: 36, height: 6 });
// clouds for the aerials (opaque puffs, each a little taller and higher than the last: no re-sorting, no shared top faces)
const clouds = group(); { const m = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8f99 }); for (let i = 0; i < 40; i++) { const g = new T.Group(); g.position.set((rand(i, 1) - .5) * 700, 95 + rand(i, 3) * 25, (rand(i, 2) - .5) * 700); for (let k = 0; k < 4; k++) { const b = new T.Mesh(new T.BoxGeometry(12 + rand(i, k) * 20, 4 + k * .45, 10 + rand(k, i) * 14), m); b.position.set((rand(k, i, 4) - .5) * 18, k * .3, (rand(i, k, 5) - .5) * 12); g.add(b); } clouds.add(g); } }
// snow: two stacked boxes of flakes that fall forever around a focus
const snow = group(); { const mk = () => { const g = new T.BufferGeometry(), n = 6000, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([(rand(i, 7) - .5) * 70, rand(i, 8) * 30, (rand(i, 9) - .5) * 70], i * 3); g.setAttribute('position', new T.BufferAttribute(a, 3)); return new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: .13, transparent: true, opacity: .9, depthWrite: false })); }; const a = mk(), b = new T.Points(a.geometry, a.material); b.position.y = 30; snow.add(a, b); }
const snowAt = (p, t) => { snow.visible = true; snow.position.set(p[0] + Math.sin(t * .3) * 2.5, p[1] - 12 - (t * 3.2) % 30, p[2] + Math.cos(t * .23) * 2); };

// Temperate Island: Chi-Chi's farm (on the bakery's plaza, south-east of the shop) and the frost that covers it on day 15
const [bx, bz] = SITES.bakery, FARM = [bx + 11, bz + 8], FG = G(FARM[0] - 1.5, FARM[1] + 3.2);
const farmSet = group(); const carrots = await farm(farmSet, G, FARM[0], FARM[1], 7, 6, { skip: (i, j) => i === 0 && j === 3 });
const frost = group(); { const ice = await mat('packed_ice.png'); for (const c of carrots) texBox(frost, [.3, .32, .3], [c.position.x, c.position.y + .16, c.position.z], ice); }
const pulled = cube(C.goku.armR, [.08, .3, .08], [0, -.82, 0], { all: '#f08a24' }); cube(pulled, [.1, .12, .1], [0, -.2, 0], { all: '#4fa83a' }); prop(pulled); // the stolen carrot, upside down in his fist
const hoe = new T.Group(); cube(hoe, [.06, 1.6, .06], [0, -.1, 0], { all: '#8a6a44' }); cube(hoe, [.36, .08, .08], [.12, -.88, 0], { all: '#9aa0aa' }); hoe.position.set(0, -.6, -.1); hoe.rotation.x = Math.PI; C.goku.armR.add(hoe); prop(hoe);
const tray = new T.Group(); cube(tray, [.7, .05, .5], [0, 0, 0], { all: '#c9ccd2' }); for (const [x, z, c] of [[-.2, -.1, '#f2c14e'], [.15, -.08, '#e05a3a'], [0, .12, '#f4f1e8'], [.22, .14, '#6fae4a']]) cube(tray, [.16, .1, .16], [x, .07, z], { all: c }); prop(tray); scene.add(tray);
const knot = new T.Group(); cube(knot, [.12, .12, .08], [0, 0, 0], { all: '#1f4fa8' }); cube(knot, [.05, .18, .03], [.03, -.12, -.01], { all: '#1f4fa8' }); knot.position.set(-.1, .14, -.18); C.goku.torso.add(knot); prop(knot);
const ringBox = new T.Group(); cube(ringBox, [.14, .12, .14], [0, 0, 0], { all: '#d6383f' }); cube(ringBox, [.05, .05, .05], [0, .09, 0], { all: '#ffe9a8' }); prop(ringBox); scene.add(ringBox);
// the bakery front: the fair's crowd and bunting, Buu's cookies, and the Saiyaman scene's school bag and helmet
const fair = group(); { const c = [bx + 1.6, bz + 10], fg = G(...c); fair.add(crowd(gather(70, { center: c, radius: 9, inner: 6.5, groundAt: G, face: c, seed: 31, mix: ['gi', 'saiyan', 'pocoyo', 'gabby', 'cat', 'panda', 'elly', 'pato', 'bulma'] }).filter(p => p.z < c[1] + 2 && p.z > bz + 6.2))); fairyLights(fair, [bx - 6, fg + 4.6, bz + 7.4], [bx + 9, fg + 4.6, bz + 7.4], { n: 26, sag: 1.2, light: false }); cookies(fair, [bx - .8, G(bx, bz + 6.4) + 1.32, bz + 6]); }
const bag = group(); { cube(bag, [.4, .3, .2], [0, .15, 0], { all: '#3a5aa8' }); cube(bag, [.3, .02, .16], [0, .31, 0], { all: '#2a4080' }); }
const helmet = group(); { cube(helmet, [.34, .3, .34], [0, 0, 0], { all: '#141414' }); cube(helmet, [.3, .1, .02], [0, .02, -.18], { all: '#f08a24' }); }
// Hot Island: the lab yard in front of Bulma's dome
const [ox, oz] = SITES.outpost, OC = [ox + 1, oz + 14], OG = G(...OC), MACH = [OC[0] - 1, OC[1] - 3.4];
const lab = group(); { const b = [OC[0] - .6, OC[1] - 2.4]; cube(lab, [2.2, .1, 1], [b[0], OG + .95, b[1]], { all: '#c9ccd2' }); for (const s of [-1, 1]) cube(lab, [.1, .95, .9], [b[0] + s, OG + .47, b[1]], { all: '#8a8f99' }); cube(lab, [.5, .3, .4], [b[0] - .5, OG + 1.15, b[1]], { all: '#3a8fd1' }); cube(lab, [.3, .4, .3], [b[0] + .4, OG + 1.2, b[1]], { all: '#ffd23a' }); }
const machine = await gravityMachine(scene, [MACH[0], G(...MACH), MACH[1]], 0); prop(machine);
const fumes = smoke(scene, [MACH[0], G(...MACH) + 2.2, MACH[1]]); prop(fumes);
const sparkRed = new T.PointLight(0xff5040, 0, 12); sparkRed.position.set(MACH[0], OG + 2.6, MACH[1] - 1.4); machine.add(sparkRed); sparkRed.position.set(0, 2.6, -1.4);
const wrench = cube(C.vegeta.armR, [.07, .36, .07], [0, -.66, -.06], { all: '#9aa0aa' }); prop(wrench);
const TV = [OC[0] - .2, OC[1] - 2], tvSet = group(); cube(tvSet, [1.2, .9, .6], [TV[0], G(...TV) + .45, TV[1]], { all: '#6b4a2c' });
const screenMat = new T.MeshBasicMaterial({ color: 0x8fe0a0, toneMapped: false }); { const s = new T.Mesh(new T.BoxGeometry(1.7, 1, .12), [0, 0, 0, 0, 1, 0].map(i => i ? screenMat : new T.MeshLambertMaterial({ color: 0x2b2b33 }))); s.position.set(TV[0], G(...TV) + 1.45, TV[1]); tvSet.add(s); }
const plans = cube(C.a18.armR, [.12, .5, .12], [0, -.66, -.06], { all: '#3d6fd1' }); plans.rotation.x = Math.PI / 2; prop(plans);
const table = group(); mapTable(table, [OC[0], OG, OC[1] - 1]);
const sky1 = fireworks(scene, [[[OC[0] + 16, OG + 24, OC[1] + 42], 0xff6fa8, 7], [[OC[0] - 10, OG + 28, OC[1] + 48], 0x7fd0ff, 6], [[OC[0] + 2, OG + 34, OC[1] + 56], 0xffe066, 8]]);
for (const f of sky1) { prop(f.points); prop(f.light); }
// Cold Island: the gate, the cocoa, the throne hall (pod, remote), the freeze tower and the snowdrift
const [px, pz] = SITES.palace, KG = G(px, pz - 3), GATE = [px + 1, pz + 17];
const mugL = cube(C.krillin.armL, [.13, .16, .13], [0, -.62, -.08], { all: '#f4f1e8' }), mugR = cube(C.krillin.armR, [.13, .16, .13], [0, -.62, -.08], { all: '#f4f1e8' });
for (const m of [mugL, mugR]) { cube(m, [.11, .02, .11], [0, .08, 0], { all: '#6b3a1e' }); prop(m); }
const mug18 = cube(C.a18.armR, [.13, .16, .13], [0, -.62, -.08], { all: '#f4f1e8' }); prop(mug18);
const mug18B = cube(C.a18.armL, [.13, .16, .13], [0, -.62, -.08], { all: '#f4f1e8' }); cube(mug18B, [.04, .04, .04], [0, .1, 0], { all: '#ffe066' }); prop(mug18B); // the mug with the ring in it
const pod = group(); hoverPod(pod, [px + 3.4, KG, pz - 6.4], 0);
const remoteF = cube(C.frieza.armR, [.12, .16, .06], [0, -.66, -.08], { all: '#2b2b33' }); prop(remoteF);
const remoteK = cube(C.krillin.armR, [.12, .16, .06], [0, -.66, -.08], { all: '#2b2b33' }); prop(remoteK);
const halfL = cube(C.krillin.armL, [.1, .09, .07], [0, -.66, -.085], { all: '#2b2b33' }), halfR = cube(C.krillin.armR, [.1, .09, .07], [0, -.66, -.095], { all: '#d6383f' }); prop(halfL); prop(halfR);
const TOWER = [px + 4, pz - 24], tower = group(); { const blue = await mat('blue_ice.png'), tg = G(...TOWER); for (let i = 0; i < 6; i++) texBox(tower, [4 - i * .3, 5, 4 - i * .3], [TOWER[0], tg + 2.5 + i * 5, TOWER[1]], blue); tower.userData.top = tg + 31; }
const orb = new T.Mesh(new T.SphereGeometry(1, 24, 14), glowMat(0xbfe8ff, .85)); orb.position.set(TOWER[0], tower.userData.top + 2, TOWER[1]); prop(orb); scene.add(orb);
const flakes = sparkles(scene, [px + 1, KG, pz + 6], { n: 1600, radius: 30, height: 30 }); prop(flakes);
const seaIce = group(); { const ice = await mat('packed_ice.png'); ice.map = ice.map.clone(); ice.map.repeat.set(60, 60); ice.map.needsUpdate = true; const sheet = new T.Mesh(new T.CircleGeometry(150, 48), ice); sheet.rotation.x = -Math.PI / 2; sheet.position.set(20, SEA + .95, 10); sheet.receiveShadow = true; seaIce.add(sheet); }
const console1 = group(); { const p = [px + 3.6, pz + 15.6], g = G(...p); cube(console1, [.9, 1, .5], [p[0], g + .5, p[1]], { all: '#3a3f4a' }); cube(console1, [.06, .5, .06], [p[0] + .2, g + 1.25, p[1] - .1], { all: '#d6383f' }); cube(console1, [.06, .5, .06], [p[0] - .2, g + 1.25, p[1] - .1], { all: '#3a8fd1' }); }
const soldiers = group(); soldiers.add(crowd(gather(24, { center: [px + 1, pz + 26], radius: 4, groundAt: G, face: [px + 1, pz + 18], seed: 41, costume: 'soldier' })));
const FARMERS = [px - 3, pz + 21], farmers = group(); farmers.add(crowd(gather(30, { center: FARMERS, radius: 3.5, groundAt: G, face: [px + 1, pz + 17], seed: 43, mix: ['gi', 'pocoyo', 'panda', 'cat', 'elly'] })));
const drift = group(); { const sn = await mat('snow.png').catch(() => new T.MeshLambertMaterial({ color: 0xf4f8fb })); const p = [px - 2.4, pz + 20.4], g = G(...p); texBox(drift, [1.6, .7, 1.4], [p[0], g + .35, p[1]], sn); }
// the Central Plateau: the lanterns, the wedding (arch, cake, guests), the tournament (sign, ring, stands, rock)
const P = SITES.plateau, PG = G(...P), LANT = [P[0] + 4, P[1] + 6];
const lanterns = [lantern(scene, [LANT[0] - 1, G(LANT[0] - 1, LANT[1] + .2), LANT[1] + .2]), lantern(scene, [LANT[0] + 1, G(LANT[0] + 1, LANT[1] + .2), LANT[1] + .2])]; lanterns.forEach(prop);
const sparring = group(); { const far = [LANT[0] - 10, LANT[1] - 70], fg = PG + 16; sparring.add(aura(new T.Group(), [far[0], fg, far[1]], { color: 0xffe066, h: 2, r: .8 }), aura(new T.Group(), [far[0] + 2.4, fg + 1, far[1] + .5], { color: 0x7fb0ff, h: 2, r: .8 })); const fl = new T.Mesh(new T.SphereGeometry(1.4, 16, 10), glowMat(0xfff2c0, .6)); fl.position.set(far[0] + 1.2, fg + 1.6, far[1] + .2); sparring.add(fl); sparring.userData.far = [far[0] + 1.2, fg + 1.6, far[1] + .2]; }
const ARCH = [P[0], P[1] - 3], AG = G(...ARCH);
const wedding = group(); await arch(wedding, [ARCH[0], AG, ARCH[1] - .8], 0, 7.4, 3.8); cube(wedding, [.9, .5, .7], [ARCH[0], AG + .25, ARCH[1] - .6], { all: '#f4f1e8' }); await weddingCake(wedding, [ARCH[0] + 6.4, G(ARCH[0] + 6.4, ARCH[1] + .6), ARCH[1] + .6]);
{ const pet = new T.MeshLambertMaterial({ color: 0xffc0dc }); for (let i = 0; i < 50; i++) { const p = new T.Mesh(new T.BoxGeometry(.1, .02, .1), pet); p.position.set(ARCH[0] - 4 + rand(i, 1) * 8, AG + .5 + rand(i, 2) * 4, ARCH[1] + rand(i, 3) * 4); p.rotation.set(i, i * 2, 0); wedding.add(p); } } // petals (thin boxes, not planes, so they never vanish edge-on)
const guestsSpots = []; for (let r = 0; r < 3; r++) for (let i = 0; i < 12; i++) { if (i === 5 || i === 6) continue; const x = ARCH[0] - 5.5 + i, z = ARCH[1] + 5.2 + r * 1.3; guestsSpots.push({ x, z, y: G(x, z), yaw: Math.sin(i * 7 + r) * .15 }); }
const guests = group(); guests.add(crowd(guestsSpots, { mix: ['gi', 'saiyan', 'pocoyo', 'elly', 'pato', 'gabby', 'panda', 'cat', 'cakey', 'buu', 'bulma'], seed: 44 }));
const cushion = cube(C.pocoyo.armR, [.4, .08, .3], [-.15, -.42, -.12], { all: '#e05aa0' }); prop(cushion);
const dogCushion = cube(C.loula.head, [.34, .08, .26], [0, .1, -.3], { all: '#e05aa0' }); prop(dogCushion);
const budokaiSign = group(); sign(budokaiSign, [P[0], G(P[0], P[1] + .2), P[1] + .2], 0, 'TENKAICHI BUDOKAI', { w: 4.4, h: 1 });
const book = cube(C.gohan.armL, [.34, .44, .04], [.1, -.66, -.14], { all: '#f4f1e8' }); prop(book);
const rock = group(); { const r = [P[0] + 1.4, P[1] + 2.2]; cube(rock, [2.2, 1, 1.2], [r[0], G(...r) + .5, r[1]], { all: '#8a8a8a' }); rock.userData.at = r; }
const arena = group(); const RT = await ring(arena, [P[0], PG, P[1]], 10);
arena.add(crowd(gather(140, { center: P, radius: 12, inner: 7, groundAt: G, face: P, seed: 51, mix: ['gi', 'saiyan', 'pocoyo', 'gabby', 'cat', 'panda', 'elly', 'pato', 'bulma', 'buu', 'soldier'] }).filter(p => p.z > P[1] - 5 && !(p.z < P[1] + 7.2 && Math.abs(p.x - P[0]) < 5.2))));
const mic = cube(C.frieza.armR, [.08, .2, .08], [0, -.66, -.06], { all: '#2b2b33' }); prop(mic);

for (const p of props) separateCoplanar(p); // props are built from cube() too: no flush, same-facing faces

// ------------------------------------------------------------------ portraits for the map pins (rendered once, by a small separate renderer)
const portraits = {};
{
  const r = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true }); r.setSize(256, 256); r.outputColorSpace = T.SRGBColorSpace;
  for (const key of ['goku', 'chichi', 'vegeta', 'bulma', 'krillin', 'android18']) {
    const s = new T.Scene(); s.background = new T.Color(0x9fc7e8); s.add(new T.HemisphereLight(0xffffff, 0x88aacc, 2.2)); const d = new T.DirectionalLight(0xffffff, 1.6); d.position.set(-2, 3, -4); s.add(d);
    const R = makeCharacter(key); s.add(R.root); posePlayer(R, { yaw: 0 }); R.root.updateMatrixWorld(true);
    const hp = new T.Vector3(); R.head.getWorldPosition(hp); hp.y += (R.dims.hh ?? .5) * R.root.scale.x * .55;
    const cam = new T.PerspectiveCamera(30, 1, .1, 50); cam.position.set(hp.x, hp.y + .02, hp.z - 2.4); cam.lookAt(hp); r.render(s, cam);
    const c = document.createElement('canvas'); c.width = c.height = 128; c.getContext('2d').drawImage(r.domElement, 0, 0, 128, 128); portraits[key] = c;
  }
  r.dispose();
}
const pinFace = key => (ctx, x, y, s) => ctx.drawImage(portraits[key], x, y, s, s);

// ------------------------------------------------------------------ scene directors
// the marks for each set, as in the key frames
const FA = [FARM[0] - 1.4, FARM[1] + 2.8], FB = [FARM[0] - 2.2, FARM[1] + 4.2], FCAM = [FARM[0] - 6.4, FARM[1] + 6.8]; // the farm: Chi-Chi, Goku on his back, the lens
const LA = [OC[0] - 1, OC[1] + .2], LB = [OC[0] + 1, OC[1]], LCAM = [OC[0] - .4, OC[1] + 5.2]; // the lab yard: Bulma, Vegeta, the lens
const GA = [GATE[0] - .8, GATE[1]], GB = [GATE[0] + .8, GATE[1] + .2], GCAM = [GATE[0] + .5, GATE[1] + 4.4]; // the gate: 18, Krillin, the lens
const FC = [bx + 1.6, bz + 10], FAIRCAM = [bx + 1.6, bz + 16.4]; // the fair
const at2 = (c, dx, dz) => [c[0] + dx, c[1] + dz];
const directors = {
  open(t) { clouds.visible = true; },
  lobby(t) {
    lobby.visible = true; lobbySpark.rotation.y = t * .05;
    const up = t > L('kids-yay') - .1 && t < E('kids-yay') + 1.2; lobbyDown.visible = !up; lobbyUp.visible = up;
    const y = LOBBY_Y, face = [0, -14];
    for (const [k, x, z] of [['goku', -1.2, -2.6], ['chichi', .4, -2.8], ['vegeta', 2.4, -2], ['bulma', 3.8, -1.4], ['krillin', -2.8, -2.2], ['a18', -4.2, -1.4]]) {
      const q = { x, z, y, yaw: yawTo([x, z], face), headYaw: Math.sin(t * .4 + x) * .15 };
      if (k === 'vegeta' || k === 'a18') Object.assign(q, CROSS);
      if (k === 'goku') { q.yaw += t > L('goku-cake') - .3 ? 0 : .45; q.armR = reach(t, [[L('goku-cake'), E('goku-cake') + .3, [-2.7, .4]]]); }
      if (k === 'chichi') q.yaw -= .45;
      H(k, t, q);
    }
  },
  map(t) { clouds.visible = true; },
  farm(t) {
    farmSet.visible = true; const a = SC('farm')[0], flipAt = E('chichi-mind') + .15, k = clamp((t - flipAt) / .55);
    // Goku walks up to the field and pulls a carrot; Chi-Chi flips him; he lies there delighted; then he ploughs
    if (t < L('n-plough')) {
      if (t < flipAt) {
        const w = walker([[a, FB[0] - 8, FB[1] + 3], [L('goku-carrot') - .3, FB[0], FB[1] - .4, yawTo(FB, FARM)]]);
        H('goku', t, w(t, { armR: reach(t, [[L('goku-carrot') + .4, flipAt, [-1.9, .1]]]), lean: t > L('goku-carrot') ? .25 : 0 }));
        pulled.visible = t > L('goku-carrot') + 1;
      } else {
        const yaw = yawTo(FB, FARM); H('goku', t, k < 1 ? { x: FB[0], z: FB[1], tip: k, yaw } : { x: FB[0], z: FB[1], lie: true, yaw, armR: reach(t, [[L('goku-strong'), E('goku-strong'), [-1.6, .2]]], [-1.2, .5]), armL: [-.3, -.5], legL: -.3 });
        pulled.visible = true;
      }
      const cw = walker([[a, FA[0] + 4, FA[1] - 3], [L('chichi-mind') - .6, FA[0] + 4, FA[1] - 3], [flipAt - .1, FA[0], FA[1], yawTo(FA, mix(FB, FCAM, .55))]]);
      H('chichi', t, cw(t, t > flipAt ? { ...HIPS, headPitch: .35 } : { armR: reach(t, [[flipAt - .35, flipAt + .2, [-1.8, .2]]]) }));
    } else {
      // the ploughing, the boast to her friends, and "what's marry?"
      const row = Math.floor((t - L('n-plough')) / 2.2) % 3, kk = ((t - L('n-plough')) % 2.2) / 2.2, dir = row % 2 ? -1 : 1, gx = FARM[0] + .5 + (dir > 0 ? kk : 1 - kk) * 6, gz = FARM[1] + .5 + row * 2;
      const done = t > L('goku-food') - .4, gp = done ? [FARM[0] + 3.2, FARM[1] + 2.2] : [gx, gz];
      hoe.visible = true;
      H('goku', t, done ? { x: gp[0], z: gp[1], yaw: yawTo(gp, [FA[0] - 2, FA[1] + 4]), armR: [-.4, .2], armL: reach(t, [[L('goku-food'), E('goku-food'), [-2.8, -.2]]], [-.2, -.1]), headYaw: .2 } : { x: gx, z: gz, yaw: yawTo([gx, gz], [gx + dir, gz]), walk: t * 6, stride: .7, armR: [-.7, .1] });
      H('chichi', t, { x: FA[0] - .4, z: FA[1] + .6, yaw: yawTo([FA[0] - .4, FA[1] + .6], t > L('chichi-marry') - .3 && t < E('chichi-marry') ? mix([FA[0] - 2.4, FA[1] + 2.4], FCAM, .5) : [gp[0], gp[1]]), ...CROSS });
      H('pocoyo', t, { x: FA[0] - 2.4, z: FA[1] + 2.2, yaw: yawTo([FA[0] - 2.4, FA[1] + 2.2], [FA[0] - .4, FA[1] + .6]) });
      H('elly', t, { x: FA[0] - 3.4, z: FA[1] + 1.4, yaw: yawTo([FA[0] - 3.4, FA[1] + 1.4], [FA[0] - .4, FA[1] + .6]) });
    }
  },
  lab(t) {
    lab.visible = machine.visible = true; machine.setBroken(false); const a = SC('lab')[0], land = L('veg-build') - .2;
    H('bulma', t, { x: LA[0], z: LA[1], yaw: yawTo(LA, t < land ? [OC[0] - .6, OC[1] - 2.4] : mix(LB, LCAM, .4)), armR: t < land ? [-1.2 + Math.sin(t * 5) * .15, .1] : reach(t, [[L('bulma-please'), E('bulma-please'), [-1.5, .2]], [L('bulma-nomachine'), E('bulma-nomachine'), [-1.4, .3]]], [-.5, .5]), armL: t < land ? [-1.2, -.1] : [-.5, -.5] });
    const fall = clamp((t - (land - 1.6)) / 1.6), vy = (1 - ease(fall)) * 9;
    if (t > land - 1.6) H('vegeta', t, { x: LB[0], z: LB[1], y: G(...LB) + vy, yaw: yawTo(LB, t > L('veg-pl') && t < E('veg-pl') ? [LB[0] + 3, LB[1] + 2] : mix(LA, LCAM, .3)), ...(vy > .1 ? { armL: [-.3, -.4], armR: [-.3, .4] } : t > L('veg-pl') && t < E('veg-pl') ? { armL: [-1.4, -.2], armR: [-1.4, .2], lean: Math.sin(t * 6) * .08 } : t > L('veg-build') && t < E('veg-build') ? { armR: [-1.4, .2], armL: [-.4, -.4] } : CROSS), headPitch: -.1 });
    H('yamcha', t, { x: OC[0] - 2.8, z: OC[1] - 2, yaw: yawTo([OC[0] - 2.8, OC[1] - 2], mix(LB, LCAM, .35)), ...CROSS });
    H('briefs', t, { x: OC[0] + 2.6, z: OC[1] - 2.4, yaw: yawTo([OC[0] + 2.6, OC[1] - 2.4], mix(LA, LCAM, .5)) });
  },
  gate(t) {
    snowAt([GATE[0], G(...GATE) + 10, GATE[1]], t); const a = SC('gate')[0], morning = t > L('n-empty');
    const kw = walker([[a, GATE[0] + 7, GATE[1] + 7], [L('kri-cocoa') - .4, GB[0], GB[1], yawTo(GB, mix(GA, GCAM, .3))]]);
    if (!morning) { mugL.visible = mugR.visible = true; H('krillin', t, kw(t, { armL: [-1.45, -.1], armR: reach(t, [[L('kri-cocoa'), E('kri-everyone') + .4, [-1.5, .1]]], [-1.2, .1]) })); }
    else { mugL.visible = mugR.visible = true; H('krillin', t, { x: GB[0], z: GB[1], yaw: yawTo(GB, mix(GA, GCAM, .3)), armL: [-1.45, -.1], armR: [-1.45, .1] }); mug18.visible = true; }
    H('a18', t, { x: GA[0], z: GA[1], yaw: yawTo(GA, mix(GB, GCAM, .35)), ...(morning ? { armR: [-1.5 + Math.sin(t * .8) * .1, .25], armL: [-.4, -.3] } : CROSS), headYaw: t > L('kri-everyone') && t < E('kri-everyone') + 1 ? .25 : 0 });
  },
  fair(t) {
    fair.visible = true;
    const Gk = at2(FC, .7, .4), V = at2(FC, 1.9, 0), Bu = at2(FC, -2.6, .6), Ch = at2(FC, -1.4, .3), K = at2(FC, 4.2, -.4), E18 = at2(FC, 5.2, -1);
    H('buu', t, { x: bx - .4, z: bz + 6.4, yaw: yawTo([bx - .4, bz + 6.4], FAIRCAM), armR: reach(t, [[L('buu-fair'), E('buu-fair'), [-2.6, .4]]], [-1.4, .25]), armL: reach(t, [[L('buu-fair'), E('buu-fair'), [-2.6, -.4]]], [-.2, -.1]) });
    const promise = t > L('goku-promise') - .3;
    H('goku', t, { x: Gk[0], z: Gk[1], yaw: yawTo(Gk, promise ? mix(Ch, FAIRCAM, .3) : mix(V, FAIRCAM, .6)), armR: promise ? WAVE(t) : reach(t, [[L('goku-spar'), E('goku-spar'), [-1.5, .3]]], [-1.2, .2]), armL: [-.9, -.3], lean: promise ? 0 : .12 });
    H('vegeta', t, { x: V[0], z: V[1], yaw: yawTo(V, mix(Gk, FAIRCAM, .6)), ...(t > L('veg-crush') && t < E('veg-crush') ? { armR: [-1.6, .2], armL: [-.5, -.5] } : CROSS), lean: .1 });
    H('bulma', t, { x: Bu[0], z: Bu[1], yaw: yawTo(Bu, mix(Ch, FAIRCAM, .65)), armR: reach(t, [[L('bulma-saiyan'), E('bulma-saiyan'), [-1.7, .3]]], [-.3, .2]) });
    H('chichi', t, { x: Ch[0], z: Ch[1], yaw: yawTo(Ch, promise ? mix(Gk, FAIRCAM, .4) : mix(Bu, FAIRCAM, .65)), armL: reach(t, [[L('chichi-car'), E('chichi-car'), [-2.2, -.3]]], [-.2, -.1]), armR: promise ? WAVE(t) : undefined });
    H('krillin', t, { x: K[0], z: K[1], yaw: yawTo(K, mix(E18, FAIRCAM, .5)), armR: [-1.3, .1] });
    H('a18', t, { x: E18[0], z: E18[1], yaw: yawTo(E18, t > L('n-spy') - .5 && t < E('n-spy') + .5 ? [bx - 4, bz + 2] : mix(Gk, FAIRCAM, .2)), ...CROSS });
  },
  lantern(t) {
    sparring.visible = t < E('n-thirtyone') + 1.2; sparring.children.forEach((c, i) => { c.visible = Math.sin(t * 6 + i * 2) > -.3; });
    lanterns.forEach(l => { l.visible = true; }); lanterns[0].setLit(1 - span(t, L('n-thirtyone') + .3, L('n-thirtyone') + 1.2)); lanterns[1].setLit(1 - span(t, E('n-waited') - 1.2, E('n-waited') - .2));
    H('chichi', t, { x: LANT[0], z: LANT[1], yaw: yawTo(LANT, [LANT[0] + .9, LANT[1] + 3.6]), sit: true, seat: G(...LANT) + .12, armL: [-.9, -.1], armR: [-.9, .1], headPitch: t > L('n-waited') ? .35 : .05, headYaw: t < L('n-waited') ? -.5 : 0 });
  },
  knot(t) {
    farmSet.visible = true; const a = SC('knot')[0], A = [FARM[0] - 1.3, FARM[1] + 3.2], B = [FARM[0] - 2.5, FARM[1] + 2.9], CAM = [FARM[0] - 3.4, FARM[1] + 7.2];
    const w = walker([[a, A[0] - 7, A[1] + 3], [L('goku-biggest') - .3, A[0], A[1], yawTo(A, mix(B, CAM, .4))]]);
    const tying = t > L('n-knot') && t < E('n-knot'), held = t < L('goku-sorry') - .4;
    const gq = w(t, held ? { armL: [-1.4, -.2], armR: [-1.4, .2] } : tying ? { armL: [-.6, .35], armR: [-.6, -.35], headPitch: .45 } : t > L('chichi-help') ? { armR: [-1.4, .2] } : { armL: [-.2, -.1], armR: [-.2, .1], headPitch: .15 });
    H('goku', t, gq);
    tray.visible = held; if (held) { const h = C.goku.root; tray.position.copy(h.localToWorld(new T.Vector3(0, .82, -.42))); tray.rotation.y = h.rotation.y; }
    knot.visible = t > (L('n-knot') + E('n-knot')) / 2;
    H('chichi', t, { x: B[0], z: B[1], yaw: yawTo(B, mix(A, CAM, .4)), ...(t < L('goku-sorry') ? CROSS : t > L('chichi-help') ? { armR: [-1.5, .3] } : { armR: [-.7, .35], armL: [-.4, -.2] }) });
    hoe.visible = t > L('chichi-help') + 1.2;
  },
  smoke(t) {
    lab.visible = machine.visible = true; const boom = L('n-boom') + 1.6; machine.setBroken(t > boom); fumes.visible = t > boom; fumes.at(t); sparkRed.intensity = t > boom ? 14 + Math.sin(t * 13) * 4 : 0;
    const CAM = [OC[0] + .2, OC[1] + 5.4], Y = [OC[0] - 2, OC[1] + .4], V = [OC[0] + 1.6, OC[1] + .6], Bu = [OC[0] - .2, OC[1] - .7];
    const bw = walker([[SC('smoke')[0], OC[0] - 4, OC[1] - 6], [boom + .2, OC[0] - 4, OC[1] - 6], [L('bulma-machine'), Bu[0], Bu[1], yawTo(Bu, mix(V, CAM, .35))]]);
    H('bulma', t, bw(t, { armL: reach(t, [[L('bulma-machine'), E('bulma-machine'), [-2.6, -.3]]], [-.5, -.6]), armR: reach(t, [[L('bulma-machine'), E('bulma-machine'), [-2.6, .3]], [L('bulma-out'), E('bulma-out') + .8, [-1.6, -.9]]], [-.5, .6]) }));
    const yw = walker([[SC('smoke')[0], Y[0] - 6, Y[1] + 4], [L('yamcha-saw') - .4, Y[0], Y[1], yawTo(Y, mix(V, CAM, .2))]]);
    H('yamcha', t, yw(t, { armR: reach(t, [[L('yamcha-saw'), E('yamcha-saw') + .4, [-1.55, .1]]]) }));
    const leave = E('bulma-out') + .3, vw = walker([[leave, V[0], V[1], yawTo(V, [V[0] + 2, V[1] + 3])], [leave + 4, V[0] + 6, V[1] + 7]]);
    H('vegeta', t, t < leave ? { x: V[0], z: V[1], yaw: yawTo(V, [V[0] + 2, V[1] + 3]), ...CROSS, headYaw: -.3 } : vw(t));
  },
  tape(t) {
    const night = t > L('n-footage') - .2 && t < E('n-footage') + .3;
    lab.visible = machine.visible = true; machine.setBroken(night);
    if (night) { // the recording: Vegeta at three in the morning, kneeling at the machine with a wrench
      wrench.visible = true; H('vegeta', t, { x: MACH[0] + .3, z: MACH[1] - 1.5, yaw: yawTo([MACH[0] + .3, MACH[1] - 1.5], MACH), armR: [-1.4 + Math.sin(t * 7) * .2, .1], armL: [-1.2, -.2], lean: .5, headPitch: .2 });
      return;
    }
    tvSet.visible = true; const CAM = [OC[0] - .2, OC[1] + 5.8], V = [OC[0] + 1.2, OC[1] + .9], Bu = [OC[0] - 1, OC[1] + 1.1];
    H('babybox', t, { x: TV[0] + 1.4, z: TV[1] + .2, yaw: yawTo([TV[0] + 1.4, TV[1] + .2], CAM), armL: reach(t, [[L('box-play') - .2, E('box-play') + .4, [-1.4, -.3]]], [-.2, -.1]) });
    const watch = t < L('veg-broke') - .4;
    H('vegeta', t, { x: V[0], z: V[1], yaw: yawTo(V, watch ? TV : mix(Bu, CAM, .4)), headPitch: t > L('veg-broke') && t < E('veg-broke') + .4 ? .25 : 0, ...(t > L('veg-accepted') ? CROSS : { armL: [-.2, -.2], armR: [-.2, .2] }) });
    H('bulma', t, { x: Bu[0], z: Bu[1], yaw: yawTo(Bu, watch ? TV : mix(V, CAM, .4)), armR: reach(t, [[L('bulma-secrets'), E('bulma-secrets'), [-1.1, .3]]], [-.3, .2]) });
    H('yamcha', t, { x: OC[0] - 2.8, z: OC[1] - .4, yaw: yawTo([OC[0] - 2.8, OC[1] - .4], watch ? TV : mix(V, CAM, .3)), armR: reach(t, [[L('yamcha-sorry'), E('yamcha-sorry'), [-.9, .3]]], [-.2, .1]) });
  },
  spy(t) {
    lab.visible = machine.visible = true; machine.setBroken(false);
    const K = [OC[0] - 1.2, OC[1] + 1.6], E0 = [OC[0] + 1.6, OC[1] + .2], CAM = [OC[0] - .4, OC[1] + 6.2], up = span(t, L('n-flew') + .4, E('n-flew') + .6);
    plans.visible = true;
    H('a18', t, { x: lerp(E0[0], E0[0] + 9, up * up), z: lerp(E0[1], E0[1] - 6, up * up), y: G(...E0) + lerp(0, 1.8, span(t, E('kri-okay'), L('n-flew') + .6)) + up * 14, yaw: yawTo(E0, up > .05 ? [E0[0] + 9, E0[1] - 6] : mix(K, CAM, .5)), fly: t > E('kri-okay'), flyLean: up * .9, armR: [-.9, .25], armL: [-.2, -.3], legL: .25, legR: -.05, headYaw: up > .05 ? -.9 : 0 });
    H('krillin', t, { x: K[0], z: K[1], yaw: yawTo(K, mix(E0, CAM, .45)), armR: reach(t, [[L('kri-okay'), E('n-flew'), [-1.2, .2]]]), headPitch: -.2 - up * .3 });
  },
  freeze(t) {
    clouds.visible = seaIce.visible = tower.visible = orb.visible = true; seaIce.scale.setScalar(.2 + .8 * span(t, SC('freeze')[0], L('n-carrots'))); orb.scale.setScalar(3.4 + Math.sin(t * 4) * .3);
    farmSet.visible = frost.visible = true; snowAt([FARM[0], FG + 10, FARM[1]], t);
    H('chichi', t, { x: FARM[0] - 1.2, z: FARM[1] + 2.6, yaw: yawTo([FARM[0] - 1.2, FARM[1] + 2.6], [FARM[0] - 5, FARM[1] + 6]), lean: .45, armR: [-1.2, .2], armL: [-1.2, -.2], headPitch: .3 });
  },
  table(t) {
    table.visible = lab.visible = true; snowAt([OC[0], OG + 10, OC[1]], t);
    const tt = [OC[0], OC[1] - 1], CAM = [tt[0] - .6, tt[1] + 5.6], Gk = [tt[0] + 1.6, tt[1] + 1.4], V = [tt[0] + 2.6, tt[1] + .9];
    H('bulma', t, { x: tt[0] - .2, z: tt[1] - 1.3, yaw: yawTo([tt[0] - .2, tt[1] - 1.3], CAM), armR: reach(t, [[L('bulma-plan'), E('bulma-together'), [-1.3, .2]]], [-.4, .2]), lean: .15 });
    H('krillin', t, { x: tt[0] + 1, z: tt[1] - 1.1, yaw: yawTo([tt[0] + 1, tt[1] - 1.1], mix(tt, CAM, .6)), armR: reach(t, [[L('kri-get'), E('kri-get'), [-1.6, .1]]]) });
    H('chichi', t, { x: tt[0] - 1.9, z: tt[1] - .1, yaw: yawTo([tt[0] - 1.9, tt[1] - .1], mix(tt, CAM, .45)), ...(t > L('chichi-seeds') && t < E('chichi-seeds') ? { armR: [-1.5, .3], armL: [-.4, -.3] } : { armL: [-1.2, -.1], armR: [-1.2, .1] }) });
    const point = t > L('goku-him') - .2 && t < E('veg-him') + 1;
    H('goku', t, { x: Gk[0], z: Gk[1], yaw: yawTo(Gk, CAM), ...(point ? { armL: [-.3, -1.45], lean: -.08 } : { armL: [-.3, -.2], armR: [-.3, .2] }) });
    H('vegeta', t, { x: V[0], z: V[1], yaw: yawTo(V, CAM), ...(point ? { armR: [-.3, 1.45], lean: -.08 } : CROSS) });
  },
  remote(t) {
    pod.visible = true; const K0 = [px - .4, pz + 1.6], K = [px - 1.5, pz - 3.2], E0 = [px + .7, pz - 3.4], F = [px + 3.4, pz - 6.4], CAM = [px - .6, pz + 1.6];
    const grab = L('n-grab') + .3, snap = E('kri-nobody') + .1, got = t > grab;
    remoteF.visible = !got; remoteK.visible = got && t < snap; halfL.visible = halfR.visible = t >= snap;
    H('frieza', t, { x: F[0], z: F[1], y: KG + .25, yaw: yawTo(F, mix(K, CAM, .3)), armR: got ? [-1.5, .4] : reach(t, [[L('frieza-remote'), grab, [-2.2, .3]]], [-1.2, .3]), armL: t > L('frieza-what') ? [-2.6, -.5] : [-.3, -.2], headPitch: -.1 });
    const kw = walker([[SC('remote')[0], K0[0], K0[1]], [L('n-grab') - .2, K0[0], K0[1]], [grab, K[0], K[1], yawTo(K, mix(E0, CAM, .35))]]);
    H('krillin', t, kw(t, t >= snap ? { armL: [-1.2, -.35], armR: [-1.2, .35] } : got ? { armR: [-1.3, .2], armL: [-.3, -.2] } : { armR: reach(t, [[grab - .4, grab, [-1.6, .2]]]) }));
    H('a18', t, { x: E0[0], z: E0[1], yaw: yawTo(E0, t > L('n-eighteen') - .3 ? mix(K, CAM, .4) : mix(F, CAM, .2)), armL: [-.2, -.15], armR: [-.2, .15] });
  },
  thaw(t) {
    snowAt([GATE[0], G(...GATE) + 10, GATE[1]], t); tower.visible = console1.visible = true; const popAt = L('n-pop') + .8;
    orb.visible = t < popAt + .6; orb.scale.setScalar(t < popAt ? 3.4 + Math.sin(t * 4) * .3 : 3.4 + (t - popAt) * 30); flakes.visible = t > popAt; flakes.rotation.y = t * .1; flakes.position.y = KG - ((t * 1.2) % 4);
    const m = [px + 1, pz + 18], a = L('n-team');
    // Goku and Vegeta back to back at the gate, the soldiers before them; Chi-Chi leading the farmers; 18 at the console
    soldiers.visible = t < popAt; farmers.visible = t > a && t < popAt; const fk = 1 - span(t, a, popAt); farmers.position.set(-6 * fk, 0, 5 * fk); const lead = [FARMERS[0] - 6 * fk + .8, FARMERS[1] + 5 * fk - 3.6];
    const after = t > popAt + .4, heroes = [['chichi', -3.4, 0], ['bulma', -2.2, -.4], ['goku', -.6, .2], ['vegeta', .6, .2], ['krillin', 2, -.3], ['a18', 3.1, -.5]], CAM = [px + 1.4, pz + 21.4];
    for (const [k, dx, dz] of heroes) {
      if (!after && (k === 'chichi' || k === 'a18' || k === 'bulma' || k === 'krillin')) continue;
      const p = [m[0] + dx, m[1] + dz];
      H(k, t, after ? { x: p[0], z: p[1], yaw: yawTo(p, CAM), ...CHEER(t + dx) } : { x: p[0], z: p[1] + 1.2, yaw: yawTo(p, [p[0], p[1] + 8]), armL: [-1.5, -.2], armR: [-1.5, .2] });
    }
    if (!after && t > a) { // the montage beats: Chi-Chi with the farmers, 18 pulling the red wire
      H('chichi', t, { x: lead[0], z: lead[1], yaw: yawTo(lead, [px + 1, pz + 17]), walk: t * 6, stride: .8, armR: [-2.6, .3] });
      H('a18', t, { x: px + 3.6, z: pz + 14.8, yaw: yawTo([px + 3.6, pz + 14.8], [px + 4.2, pz + 19]), armR: [lerp(-2.2, -1.2, span(t, popAt - 1.4, popAt - .4)), .1] });
    }
    if (t > L('poc-cake') - 2) { // Frieza in the snowdrift, Pocoyo with the invitation
      drift.visible = true; const f = [px - 2.4, pz + 20.4];
      H('frieza', t, { x: f[0], z: f[1], y: G(...f) + .1, lie: true, yaw: 2.2, armR: [-2.6, .4], armL: [-.4, -.4] });
      H('pocoyo', t, { x: f[0] + 1.2, z: f[1] + .9, yaw: yawTo([f[0] + 1.2, f[1] + .9], [f[0] + 1, f[1] + 5]), armR: reach(t, [[L('poc-cake'), E('frieza-front') + 1, [-1.5, .3]]]) });
    }
  },
  propgoku(t) {
    farmSet.visible = true; const A = [FARM[0] - 1.6, FARM[1] + 3.4], B = [FARM[0] - 2.8, FARM[1] + 3.0], CAM = [FARM[0] - 3.8, FARM[1] + 7.4];
    ringBox.visible = t < L('chichi-yes'); if (ringBox.visible) { const h = C.goku.root; ringBox.position.copy(h.localToWorld(new T.Vector3(.2, .95, -.5))); ringBox.rotation.y = h.rotation.y; }
    knot.visible = true;
    H('goku', t, { x: A[0], z: A[1], yaw: yawTo(A, mix(B, CAM, .35)), armR: t < L('chichi-yes') ? [-1.5, .1] : [-.3, .2], armL: reach(t, [[L('goku-foodq'), E('goku-foodq'), [-2.7, -.2]]]) });
    const jump = t > L('chichi-yes') && t < E('chichi-yes') + 1 ? Math.abs(Math.sin((t - L('chichi-yes')) * 8)) * .3 : 0;
    H('chichi', t, { x: B[0], z: B[1], y: G(...B) + jump, yaw: yawTo(B, mix(A, CAM, .35)), ...(t > L('chichi-yes') ? CHEER(t) : { armL: [-1.2, .5], armR: [-1.2, -.5] }) });
  },
  propveg(t) {
    lab.visible = true; const m = [OC[0], OC[1] + 2], V = [m[0] + .7, m[1]], Bu = [m[0] - .7, m[1] + .2], CAM = [m[0] - .6, m[1] - 4.6];
    sky1.forEach((f, i) => { const go = L('n-fireworks') + .8 + i * 1.1, k = (t - go) / 2.4; const on = k > 0 && k < 1; f.points.visible = f.light.visible = on; f.points.scale.setScalar(.3 + ease(clamp(k * 2)) * .7); f.points.material.opacity = 1 - clamp((k - .5) * 2); f.light.intensity = 40 * (1 - k); });
    const ask = t > L('veg-please') - .3;
    ringBox.visible = true; { const h = C.vegeta.root; ringBox.position.copy(h.localToWorld(new T.Vector3(.27, .9, -.55))); ringBox.rotation.y = h.rotation.y; }
    H('vegeta', t, { x: V[0], z: V[1], yaw: yawTo(V, ask ? mix(Bu, CAM, .4) : [CAM[0] + 2.4, CAM[1]]), armR: [-1.5, -.2], armL: [-.2, -.2] });
    const jump = t > L('bulma-said') && t < E('bulma-said') + 1 ? Math.abs(Math.sin((t - L('bulma-said')) * 8)) * .3 : 0;
    H('bulma', t, { x: Bu[0], z: Bu[1], y: G(...Bu) + jump, yaw: yawTo(Bu, t < L('n-butnot') ? [Bu[0] + 6, Bu[1] + 40] : mix(V, CAM, .45)), ...(t > L('bulma-said') ? CHEER(t) : { armL: [-2.3, .2], armR: [-2.3, -.2] }), headPitch: t < L('n-butnot') ? -.5 : 0 });
  },
  propkri(t) {
    snowAt([GATE[0], G(...GATE) + 10, GATE[1]], t); mugR.visible = true; mug18B.visible = t > L('kri-every') + 1;
    H('krillin', t, { x: GB[0], z: GB[1], yaw: yawTo(GB, mix(GA, GCAM, .3)), armR: reach(t, [[L('kri-every'), L('kri-every') + 1.2, [-1.5, .1]]], [-1.4, .1]), armL: [-.2, -.1] });
    H('a18', t, { x: GA[0], z: GA[1], yaw: yawTo(GA, mix(GB, GCAM, .4)), armL: t > L('kri-every') + 1 ? [-1.5, -.2] : [-.3, -.2], ...(t > L('kri-every') + 1 ? {} : { armR: [-.3, .2] }) });
  },
  wedding(t) {
    wedding.visible = guests.visible = true; const CAM = [P[0] + .3, P[1] + 7.6], a = ARCH;
    H('pato', t, { x: a[0], z: a[1] - .6, y: AG + .5, yaw: yawTo([a[0], a[1] - .6], CAM), armL: [-1.3, -.1], armR: reach(t, [[L('pato-dearly'), E('pato-dearly'), [-2.6, .3]]], [-1.3, .1]) });
    const row = [['gokuG', -3.1], ['chichiB', -2.3], ['vegetaG', -.45], ['bulmaB', .45], ['krillinG', 2.3], ['a18B', 3.1]], vows = { gokuG: 'goku-vow', chichiB: 'chichi-vow', vegetaG: 'veg-vow', bulmaB: 'bulma-vow', krillinG: 'kri-vow', a18B: 'a18-vow' };
    row.forEach(([k, dx], i) => {
      const p = [a[0] + dx, a[1] + .8], partner = [a[0] + row[i ^ 1][1], a[1] + .8], speaking = t > L(vows[k]) - .4 && t < E(vows[k]) + .4;
      H(k, t, { x: p[0], z: p[1], yaw: yawTo(p, speaking ? mix(partner, CAM, .4) : mix(partner, CAM, .7)), [i % 2 ? 'armR' : 'armL']: [-.4, i % 2 ? .35 : -.35] });
    });
    cushion.visible = true;
    H('pocoyo', t, { x: a[0] - 1.1, z: a[1] + 2.2, yaw: yawTo([a[0] - 1.1, a[1] + 2.2], CAM), armL: [-1.3, -.1], armR: t > L('poc-rings') ? [-2.6, .1] : [-1.3, .1] });
    H('elly', t, { x: a[0] + 1.2, z: a[1] + 2.3, yaw: yawTo([a[0] + 1.2, a[1] + 2.3], CAM), armR: [-2.4 + Math.sin(t * 3) * .2, .4] });
    H('frieza', t, { x: a[0] - 3.2, z: a[1] + 4, yaw: yawTo([a[0] - 3.2, a[1] + 4], mix(a, CAM, .6)), armR: reach(t, [[L('frieza-snow'), E('frieza-snow') + 1, [-2.5, .4]]], [-.3, .2]), headPitch: .2 });
  },
  chase(t) {
    // the loop is timed from Goku's shout, so he shouts on the stretch that faces the lens whatever the clip lengths
    wedding.visible = true; const a = L('goku-back') - 2.65, c = [P[0] + 1, P[1] + 1.5], loop = (d, sp = .55) => { const ang = (t - a) * sp - d; return [c[0] + Math.cos(ang) * 4.2, c[1] + Math.sin(ang) * 2.6, -ang]; };
    const run = (k, d, q = {}) => { const [x, z] = loop(d), [x2, z2] = loop(d - .05); H(k, t, { x, z, yaw: yawTo([x, z], [x2, z2]), walk: t * 10, stride: 1.1, ...q }); };
    dogCushion.visible = true; run('loula', 0); run('pocoyo', .6, { armR: [-1.6, .2], armL: [-1.6, -.2] }); run('gokuG', 1.1, { armR: [-1.5, .2] }); run('chichiB', 1.6); run('elly', 2.1);
    H('vegetaG', t, { x: P[0] - 1.6, z: P[1] - 4, yaw: yawTo([P[0] - 1.6, P[1] - 4], [P[0] + 3, P[1] + 4.6]), ...CROSS });
    H('bulmaB', t, { x: P[0] - .6, z: P[1] - 4.4, yaw: yawTo([P[0] - .6, P[1] - 4.4], [P[0] + 3, P[1] + 4.6]), armR: [-2.3, .2], armL: [-.4, -.4] });
  },
  year15(t) {
    budokaiSign.visible = true; book.visible = true;
    const m = [P[0], P[1] + 2], CAM = [m[0] + .2, m[1] + 6.2], Gt = [m[0] - .5, m[1] + .6], Tr = [m[0] + .5, m[1] + .6];
    H('goten', t, { x: Gt[0], z: Gt[1], yaw: yawTo(Gt, mix(Tr, CAM, .3)), armR: reach(t, [[L('goten-nope'), E('goten-nope'), [-1.5, .2]]], [-.4, .1]), lean: .12 });
    H('trunks', t, { x: Tr[0], z: Tr[1], yaw: yawTo(Tr, mix(Gt, CAM, .3)), armL: reach(t, [[L('trunks-strong'), E('trunks-strong'), [-2.8, -.2]]], [-1.4, -.2]), lean: .12 });
    H('marron', t, { x: m[0] - 1.6, z: m[1] + 1.4, yaw: yawTo([m[0] - 1.6, m[1] + 1.4], CAM), ...HIPS });
    H('bulla', t, { x: m[0] + 1.6, z: m[1] + 1.3, yaw: yawTo([m[0] + 1.6, m[1] + 1.3], mix([m[0], m[1] - 1.8], CAM, .5)), armR: [-2.2 + Math.sin(t * 4) * .2, .3] });
    H('gohan', t, { x: m[0] - 2.9, z: m[1] + .2, yaw: yawTo([m[0] - 2.9, m[1] + .2], t > L('gohan-rules') - .3 ? CAM : mix(Gt, CAM, .5)), armL: [-1.3, -.1], armR: reach(t, [[L('gohan-rules'), E('gohan-rules'), [-1.6, .2]]], [-1.1, .2]), headPitch: t < L('gohan-rules') ? .25 : 0 });
  },
  saiyaman(t) {
    const c = [bx + 2, bz + 10], CAM = [c[0] + .3, c[1] + 5], Gh = [c[0] - .8, c[1]], Vi = [c[0] + .8, c[1] + .1], drop = L('n-helmet') + .5, k = clamp((t - drop) / .6);
    bag.visible = true; bag.position.set(Gh[0] - .5, G(Gh[0] - .5, Gh[1] + .4), Gh[1] + .4);
    const held = t > L('videl-deal') - .8;
    helmet.visible = t > drop; if (!held && helmet.visible) helmet.position.set(lerp(Gh[0] - .5, Gh[0] - .1, k), G(...Gh) + .3 + Math.sin(k * Math.PI) * .5 - k * .15, lerp(Gh[1] + .4, Gh[1] + 1.1, k));
    if (held) { const h = C.videl.armL; helmet.position.copy(h.localToWorld(new T.Vector3(-.05, -.78, -.12))); helmet.rotation.y = C.videl.root.rotation.y; }
    H('gohan', t, { x: Gh[0], z: Gh[1], yaw: yawTo(Gh, mix(Vi, CAM, .4)), armR: t > L('gohan-me') - .3 && t < E('gohan-anyway') - 2 ? [-2.7, .1] : reach(t, [[L('gohan-student'), E('gohan-student'), [-1.4, .4]]], [-.3, .2]), armL: [-.3, -.2] });
    H('videl', t, { x: Vi[0], z: Vi[1], yaw: yawTo(Vi, mix(Gh, CAM, .4)), armL: held ? [-1.1, -.55] : reach(t, [[L('videl-theory'), E('videl-theory'), [-1.5, -.2]]], [-.5, -.5]), armR: [-.5, .5] });
  },
  flying(t) {
    rock.visible = true; const m = [P[0] - 2, P[1] + 1], CAM = [m[0] + 1, m[1] + 6.4], Gh = [m[0] - 1, m[1]], Vi = [m[0] + .8, m[1] - .2], lift = span(t, L('gohan-lift') + 1, L('videl-flying') + .4);
    H('gohan', t, { x: Gh[0], z: Gh[1], yaw: yawTo(Gh, mix(Vi, CAM, .35)), armR: [-1.6, .2], armL: [-1.6, -.2] });
    H('videl', t, { x: Vi[0], z: Vi[1], y: G(...Vi) + lift * .7 + Math.sin(t * 3) * .05 * lift, yaw: yawTo(Vi, mix(Gh, CAM, .45)), fly: lift > .1, flyLean: .1, armL: [-.3, -1.3 + Math.sin(t * 4) * .1 * lift], armR: [-.3, 1.3 - Math.sin(t * 4) * .1 * lift], legL: .15 * lift, legR: -.1 * lift });
    const pop = span(t, L('goten-girlfriend') - .6, L('goten-girlfriend')), r = rock.userData.at;
    [['goten', -.6], ['trunks', .1], ['marron', .8]].forEach(([k, dx]) => H(k, t, { x: r[0] + dx, z: r[1] - 1.1, y: G(r[0] + dx, r[1] - 1.1) + pop * .25, yaw: yawTo([r[0] + dx, r[1] - 1.1], mix(Gh, CAM, .7)), armL: [-2.6, -.1], armR: t > L('goten-girlfriend') && t < E('goten-girlfriend') + .6 && k !== 'marron' ? [-2.8, .3] : [-1.4, .2] }));
  },
  budokai(t) {
    arena.visible = mic.visible = true; const CAM = [P[0] + .4, P[1] - 6.8], nudge = L('n-nudge') + 1.2, out = span(t, nudge, nudge + .8);
    const show0 = t < nudge; // the boys show off in the ring, then land on the grass outside it
    H('goten', t, show0 ? { x: P[0] - 1.6, z: P[1] - .2, y: RT, yaw: yawTo([P[0] - 1.6, P[1] - .2], CAM), ...CHEER(t), lean: -.1 } : { x: lerp(P[0] - 2.4, P[0] - 5.8, out), z: P[1] + 1, y: out < 1 ? RT + Math.sin(out * Math.PI) * .6 : PG, yaw: yawTo([P[0] - 5.8, P[1] + 1], P), sit: out >= 1, seat: PG + .05, armR: reach(t, [[L('goten-again'), E('goten-again'), [-1.5, .3]]], [-1, .2]) });
    H('trunks', t, show0 ? { x: P[0] + 1.6, z: P[1] - .2, y: RT, yaw: yawTo([P[0] + 1.6, P[1] - .2], CAM), armL: [-2.8, -.4], armR: [-1.2, .8] } : { x: lerp(P[0] + 2.4, P[0] + 5.8, out), z: P[1] + 1.4, y: out < 1 ? RT + Math.sin(out * Math.PI) * .6 : PG, yaw: yawTo([P[0] + 5.8, P[1] + 1.4], P), sit: out >= 1, seat: PG + .05, armL: [-.9, -.4] });
    const mw = walker([[SC('budokai')[0], P[0], P[1] + 3], [L('n-nudge'), P[0], P[1] + 3], [nudge, P[0] - .5, P[1] - .6, yawTo([P[0] - .5, P[1] - .6], CAM)]]);
    H('marron', t, mw(t, { y: RT, ...(t > L('gohan-winner') ? { armL: [-2.9, -.3], armR: [-.4, .3] } : t > nudge - .4 && t < nudge + .4 ? { armL: [-1.5, -.6], armR: [-1.5, .6] } : HIPS) }));
    H('gohan', t, { x: P[0] + .8, z: P[1] - .2, y: RT, yaw: yawTo([P[0] + .8, P[1] - .2], CAM), armL: reach(t, [[L('gohan-winner'), E('goten-again') + 1, [-2.9, -.4]]]) });
    H('frieza', t, { x: P[0] - 3.6, z: P[1] - 6.2, yaw: yawTo([P[0] - 3.6, P[1] - 6.2], mix(P, CAM, .5)), armR: [-1.6, .2], armL: reach(t, [[L('frieza-announce'), E('frieza-announce'), [-2.6, -.4]]]) });
    for (const [k, dx, dz] of [['chichi', -4.4, 6.2], ['goku', -3.4, 6.4], ['videl', -2.4, 6.2], ['a18', -1.2, 6.4], ['krillin', -.4, 6.2], ['vegeta', 1.4, 6.4], ['bulma', 2.4, 6.4], ['bulla', 3.2, 6]]) {
      const cheer = t > L('gohan-winner') && (k === 'krillin' || k === 'a18' || k === 'videl'); H(k, t, { x: P[0] + dx, z: P[1] + dz, yaw: yawTo([P[0] + dx, P[1] + dz], [P[0], P[1] - 4]), ...(cheer ? CHEER(t + dx) : k === 'vegeta' ? CROSS : {}) });
    }
  },
  flip(t) {
    arena.visible = true; const CAM = [P[0] + .4, P[1] - 5.8], at0 = L('n-flipped') + .3, k = clamp((t - at0) / .55), Gk = [P[0] + .6, P[1] + .4], Ch = [P[0] - .9, P[1] - .4];
    knot.visible = true;
    H('goku', t, k <= 0 ? { x: Gk[0], z: Gk[1], y: RT, yaw: yawTo(Gk, mix(Ch, CAM, .3)), armL: [-1.4, -.3], armR: [-1.4, .3], lean: .1 } : k < 1 ? { x: Gk[0], z: Gk[1], y: RT, tip: k, yaw: yawTo(Gk, Ch) } : { x: Gk[0], z: Gk[1], y: RT, lie: true, yaw: yawTo(Gk, Ch), armR: [-2.9, .6], armL: [-2.9, -.6] });
    H('chichi', t, { x: Ch[0], z: Ch[1], y: RT, yaw: yawTo(Ch, k >= 1 ? CAM : mix(Gk, CAM, .3)), ...(k >= 1 ? { armR: [-2.9, .3], armL: [-.5, -.5] } : { armL: [-1.4, -.3], armR: [-1.4, .3] }) });
    for (const [kk, dx, dz] of [['goten', -2.6, 4.6], ['trunks', -1.6, 4.8], ['bulla', 1.2, 4.8], ['marron', 2.2, 4.6], ['vegeta', 3.6, 5.6], ['bulma', 4.6, 5.4], ['gohan', -3.8, 5.6], ['videl', -4.8, 5.4]]) H(kk, t, { x: P[0] + dx, z: P[1] + dz, y: dz < 5 ? RT : undefined, yaw: yawTo([P[0] + dx, P[1] + dz], CAM), ...(k >= 1 ? CHEER(t + dx) : {}) });
  },
  fourth(t) {
    wedding.visible = true; const a = ARCH, CAM = [P[0] + .3, P[1] + 5.4], Gh = [a[0] - .45, a[1] + .8], Vi = [a[0] + .45, a[1] + .8], bye = t > L('n-bye') - .2;
    H('gohanG', t, { x: Gh[0], z: Gh[1], yaw: yawTo(Gh, mix(Vi, CAM, .7)), armL: [-.4, -.35], armR: bye ? WAVE(t) : undefined });
    H('videlB', t, { x: Vi[0], z: Vi[1], yaw: yawTo(Vi, mix(Gh, CAM, .7)), armR: [-.4, .35], armL: bye ? WAVEL(t) : undefined });
    for (const [k, dx, dz, q] of [['goten', -1.8, 2.2, {}], ['chichi', -2.6, 2.6, { armR: t > L('chichi-baby') - .3 ? [-2.4, .4] : undefined, headPitch: .2 }], ['goku', -3.4, 2.9, { armL: reach(t, [[L('goku-food2'), E('goku-food2'), [-2.7, -.2]]]) }], ['marron', -4.1, 2.4, {}],
      ['krillin', 1.9, 2.3, {}], ['bulma', 2.6, 2.6, { armR: reach(t, [[L('bulma-again'), E('bulma-again'), [-1.6, -.4]]]) }], ['vegeta', 3.4, 2.9, CROSS], ['a18', 4.2, 2.7, {}], ['bulla', 3.4, 1.9, {}], ['trunks', -3.4, 1.9, {}]]) {
      const p = [a[0] + dx, a[1] + dz]; H(k, t, { x: p[0], z: p[1], yaw: yawTo(p, mix(a, CAM, .6)), ...q, ...(bye && k !== 'vegeta' ? { armR: WAVE(t + dx) } : {}) });
    }
  },
  credits(t) { wedding.visible = clouds.visible = true; },
};
let shotNow; // the shot being drawn (light() decides its key light and near plane)
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
  farm: ['day', { focus: [FARM[0], FG, FARM[1] + 3], sunDir: [-.6, .55, .45], area: 18 }],
  lab: ['golden', { focus: [OC[0], OG, OC[1]], sunDir: [.35, .45, .8], area: 22 }],
  gate: ['blizzard', { focus: [GATE[0], G(...GATE), GATE[1]], sunDir: [.3, .6, .8], area: 20, near: 14, far: 160 }],
  fair: ['golden', { focus: [FC[0], G(...FC), FC[1]], sunDir: [.4, .5, .8], area: 20 }],
  lantern: ['dusk', { focus: [LANT[0], G(...LANT), LANT[1]], sunDir: [-.35, .14, .9], area: 20, near: 60, far: 500 }],
  knot: ['day', { focus: [FARM[0], FG, FARM[1] + 3], sunDir: [-.5, .55, .6], area: 18 }],
  smoke: ['night', { focus: [OC[0], OG, OC[1]], sunDir: [.3, .6, .7], area: 22 }],
  tape: ['golden', { focus: [OC[0], OG, OC[1]], sunDir: [.35, .45, .8], area: 22 }],
  spy: ['night', { focus: [OC[0], OG, OC[1]], sunDir: [.3, .6, .7], area: 22 }],
  freeze: ['freeze', { focus: [0, 12, -10], sunDir: [.2, .6, -.6], area: 200, near: 300, far: 1300 }],
  table: ['freeze', { focus: [OC[0], OG, OC[1]], sunDir: [.3, .5, .8], area: 22 }],
  remote: ['blizzard', { focus: [px, KG, pz - 3], sunDir: [-.4, .8, .4], area: 20, near: 30, far: 200 }],
  thaw: ['golden', { focus: [px + 1, KG, pz + 14], sunDir: [.3, .5, .8], area: 26, near: 40, far: 400 }],
  propgoku: ['golden', { focus: [FARM[0], FG, FARM[1] + 3], sunDir: [-.5, .3, .8], area: 16 }],
  propveg: ['night', { focus: [OC[0], OG, OC[1] + 2], sunDir: [.2, .6, -.7], area: 16 }],
  propkri: ['blizzard', { focus: [GATE[0], G(...GATE), GATE[1]], sunDir: [.3, .6, .8], area: 16, near: 14, far: 160 }],
  wedding: ['golden', { focus: [ARCH[0], AG, ARCH[1] + 2], sunDir: [.3, .5, .8], area: 18 }],
  chase: ['golden', { focus: [P[0], PG, P[1]], sunDir: [.5, .5, .7], area: 18 }],
  year15: ['day', { focus: [P[0], PG, P[1] + 2], sunDir: [.3, .6, .8], area: 16 }],
  saiyaman: ['golden', { focus: [bx + 2, G(bx + 2, bz + 10), bz + 10], sunDir: [.4, .5, .8], area: 16 }],
  flying: ['golden', { focus: [P[0] - 2, PG, P[1] + 1], sunDir: [-.4, .45, .8], area: 18 }],
  budokai: ['day', { focus: [P[0], PG, P[1]], sunDir: [-.2, .6, -.75], area: 20 }],
  flip: ['golden', { focus: [P[0], PG, P[1]], sunDir: [-.3, .35, -.9], area: 20, near: 80, far: 500 }],
  fourth: ['dusk', { focus: [ARCH[0], AG, ARCH[1] + 2], sunDir: [.3, .25, .9], area: 18, near: 80, far: 500 }],
  credits: ['dusk', { focus: [P[0], PG, P[1]], sunDir: [.3, .2, .9], area: 60, near: 120, far: 900 }],
};
function light(name, t) { look(name, t); keyLight.intensity = shotNow ? keyFor(shotNow, t) : 0; }
function look(name, t) {
  // aerial shots get a 2 m near plane (depth precision 200–560 m away); everything else 0.1 m
  camera.near = shotNow?.aerial ? 2 : .1; camera.updateProjectionMatrix();
  let [lookName, opts] = LIGHT[name], Lk = LOOKS[lookName];
  if (name === 'tape' && t > L('n-footage') - .2 && t < E('n-footage') + .3) Lk = LOOKS.night; // the recording was made at night
  if (name === 'freeze') Lk = mixLook(LOOKS.golden, LOOKS.freeze, span(t, SC('freeze')[0], SC('freeze')[0] + 3));
  if (name === 'thaw') Lk = mixLook(LOOKS.freeze, LOOKS.golden, span(t, L('n-pop') + .8, L('n-flakes')));
  applyLook(Lk, opts);
  clouds.position.x = t * .6;
}
// The key light: a soft lamp just above and beside the lens. Each shot renders its speaker at three moments and turns it
// up only as far as the darkest one needs, decided once per shot so it never pumps (see the guidelines, Light and colour).
const keyLight = new T.PointLight(0xfff0dc, 0, 12, 2); scene.add(keyLight);
const KEY_OFFSET = new T.Vector3(.5, .8, 0), KEY_LEVELS = [0, 3, 6, 12, 24, 48], FACE_MIN = 60;
scene.onBeforeRender = (r, s, cam) => { keyLight.position.copy(KEY_OFFSET).applyQuaternion(cam.quaternion).add(cam.position); keyLight.updateMatrixWorld(); };
const speakerAt = t => { const line = story.lines.find(l => l.face && t >= l.start && t <= l.start + l.duration); return line && visibleNow.find(k => C[k].root.name === line.face && C[k].root.position.y > -1000); };
function keyFor(shot, t) {
  if (shot.key != null) return shot.key;
  shot.key = 0; const sp = shot.end - shot.at;
  for (const f of [.2, .5, .8]) {
    const s = shot.at + sp * f; poseAt(shot, s); look(shot.scene, s);
    const key = speakerAt(s); if (!key) continue;
    const c = shot.cam(s, clamp(ease(f))); camera.position.copy(c.pos); camera.lookAt(c.look); camera.fov = c.fov; camera.updateProjectionMatrix();
    for (const level of KEY_LEVELS.filter(l => l >= shot.key)) {
      keyLight.intensity = level; renderer.render(scene, camera); const y = faceLuma(key);
      if (y == null) break; shot.key = level; if (y >= FACE_MIN) break;
    }
  }
  poseAt(shot, t); look(shot.scene, t);
  return shot.key;
}
const grade = name => ({ lantern: 'saturate(1.1) contrast(1.04)', smoke: 'saturate(1.05) contrast(1.05)', spy: 'saturate(1.05)', freeze: 'saturate(.92) contrast(1.04)', remote: 'saturate(.95)', propveg: 'saturate(1.15)', fourth: 'saturate(1.12)' })[name] ?? 'saturate(1.1) contrast(1.03)';

// ------------------------------------------------------------------ shots
const P3 = (...a) => v(...a);
/** A camera from explicit points that eases from (pos0, look0) to (pos1, look1). */
const mv = (p0, p1, l0, l1, f0 = 44, f1 = f0) => (t, k) => ({ pos: P3(...p0).lerp(P3(...p1), k), look: P3(...l0).lerp(P3(...l1), k), fov: lerp(f0, f1, k) });
/** A still lens at C (x, z) aimed at L (x, z), heights over the ground at L, with a slow push of `push` metres. */
const lens = (C, h, Lk, lift, fov = 42, push = .4) => { const g = G(...Lk), d = [Lk[0] - C[0], Lk[1] - C[1]], n = Math.hypot(...d), u = [d[0] / n * push, d[1] / n * push]; return mv([C[0], g + h, C[1]], [C[0] + u[0], g + h, C[1] + u[1]], [Lk[0], g + lift, Lk[1]], [Lk[0], g + lift, Lk[1]], fov); };
const orbit = (c, r, h, a0, a1, fov = 44, lookUp = 0) => (t, k) => { const a = lerp(a0, a1, k); return { pos: P3(c[0] + Math.cos(a) * r, c[1] + h, c[2] + Math.sin(a) * r), look: P3(c[0], c[1] + lookUp, c[2]), fov }; };
const S0 = n => SC(n)[0];
const shots = [
  { at: 0, scene: 'open', name: 'Three islands', free: true, aerial: true, cam: orbit([0, 0, -12], 300, 190, 1.9, 1.35, 42) },
  { at: S0('lobby'), scene: 'lobby', name: 'The white void', dissolve: 1.4, cam: mv([0, LOBBY_Y + 3, -16], [0, LOBBY_Y + 1.8, -11], [0, LOBBY_Y + 2.6, 10], [0, LOBBY_Y + 2.1, 8], 50, 46) },
  { at: L('kids-yay') - .3, scene: 'lobby', name: 'Yaaay!', free: true, cam: mv([-5, LOBBY_Y + 3, 2], [5, LOBBY_Y + 3.4, 2], [0, LOBBY_Y + 1.2, 20], [0, LOBBY_Y + 1.2, 20], 50) },
  { at: L('goku-cake') - .3, scene: 'lobby', name: 'Did somebody say cake?', cam: front(C.goku.root, { dist: 2.2, side: .35, fov: 36 }) },
  { at: S0('map'), scene: 'map', name: 'The map', dissolve: 1.4, free: true, aerial: true, cam: mv([0, 560, 120], [0, 470, 70], [0, 0, -10], [0, 0, -12], 40, 38) },
  // farm
  { at: S0('farm'), scene: 'farm', name: 'The carrot field', dissolve: 1.2, cam: mv([FCAM[0] - 6, FG + 6, FCAM[1] + 6], [FCAM[0], FG + 1.6, FCAM[1]], [FARM[0], FG + 1, FARM[1] + 2], [FB[0], FG + 1, FB[1]], 46, 42) },
  { at: L('goku-carrot') - .3, scene: 'farm', name: 'Nobody will mind', cam: front(C.goku.root, { dist: 2.2, side: .5, fov: 38 }) },
  { at: L('chichi-mind') - .2, scene: 'farm', name: 'The flip', cam: lens([FA[0] + 1.4, FA[1] + 6.2], 1.6, mix(FA, FB, .5), .9, 44) },
  { at: L('goku-strong') - .3, scene: 'farm', name: 'Fight me again tomorrow?', cam: (t, k) => { const h = C.goku.head.getWorldPosition(v(0, 0, 0)), d = v(FCAM[0] - h.x, 0, FCAM[1] - h.z).normalize(); return { pos: h.clone().addScaledVector(d, 1.5).add(v(0, 1.7, 0)), look: h.clone().add(v(0, .1, 0)), fov: 42 }; } },
  { at: L('chichi-pay') - .3, scene: 'farm', name: 'Pay for the carrot', cam: front(C.chichi.root, { dist: 2.2, side: -.3, up: .1, fov: 38 }) },
  { at: L('n-plough') - .3, scene: 'farm', name: 'Before lunch', cam: mv([FARM[0] - 4, FG + 4, FARM[1] + 9], [FARM[0] - 2, FG + 3.4, FARM[1] + 10], [FARM[0] + 3, FG + .6, FARM[1] + 2.5], [FARM[0] + 3.5, FG + .6, FARM[1] + 3], 46) },
  { at: L('chichi-marry') - .3, scene: 'farm', name: 'I’ll marry him', cam: front(C.chichi.root, { dist: 2.3, side: .4, fov: 38 }) },
  { at: L('goku-food') - .3, scene: 'farm', name: 'Is it a kind of food?', cam: front(C.goku.root, { dist: 2.3, side: -.3, fov: 38 }) },
  // lab
  { at: S0('lab'), scene: 'lab', name: 'Bulma’s lab', dissolve: 1.2, free: true, cam: mv([ox + 30, OG + 22, oz + 40], [LCAM[0] + 3, OG + 4, LCAM[1] + 4], [ox, OG + 2, oz], [OC[0] - .6, OG + 1.2, OC[1] - 1], 44) },
  { at: L('veg-build') - .5, scene: 'lab', name: 'Woman!', cam: lens(LCAM, 1.7, OC, 1.4, 42) },
  { at: L('bulma-please') - .2, scene: 'lab', name: 'Say please', cam: front(C.bulma.root, { dist: 2.1, side: .35, fov: 36 }) },
  { at: L('veg-prince') - .2, scene: 'lab', name: 'A prince does not', cam: front(C.vegeta.root, { dist: 2.1, side: -.35, fov: 36 }) },
  { at: L('bulma-nomachine') - .2, scene: 'lab', name: 'No machine', cam: front(C.bulma.root, { dist: 2.0, side: .3, fov: 36 }) },
  { at: L('veg-pl') - .2, scene: 'lab', name: 'Pl... pll...', cam: front(C.vegeta.root, { dist: 1.9, side: .3, fov: 36 }) },
  { at: L('n-pride') - .3, scene: 'lab', name: 'The pride and the rude', cam: lens(LCAM, 1.8, OC, 1.3, 46) },
  { at: L('yamcha-never') - .3, scene: 'lab', name: 'He’ll never say it', cam: front(C.yamcha.root, { dist: 2.1, side: .3, fov: 36 }) },
  // gate
  { at: S0('gate'), scene: 'gate', name: 'Two cups of cocoa', dissolve: 1.2, cam: mv([GCAM[0] + 3, G(...GATE) + 9, GCAM[1] + 8], [GCAM[0] + 1, G(...GATE) + 2.4, GCAM[1] + 2], [px, KG + 10, pz], [GATE[0] + 2, G(...GATE) + 1.2, GATE[1] + 2], 46) },
  { at: L('kri-cocoa') - .3, scene: 'gate', name: 'Cocoa?', cam: lens(GCAM, 1.45, GATE, 1.05, 40) },
  { at: L('a18-need') - .2, scene: 'gate', name: 'I don’t need cocoa', cam: front(C.a18.root, { dist: 2.1, side: .35, fov: 36 }) },
  { at: L('kri-everyone') - .2, scene: 'gate', name: 'Everyone needs cocoa', cam: front(C.krillin.root, { dist: 1.9, side: -.3, fov: 36 }) },
  { at: L('n-empty') - .3, scene: 'gate', name: 'Every morning', dissolve: .8, cam: lens(GCAM, 1.5, GATE, 1.1, 40) },
  // fair
  { at: S0('fair'), scene: 'fair', name: 'The Three-Island Fair', dissolve: 1.4, free: true, cam: mv([bx + 18, G(...FC) + 10, bz + 30], [FAIRCAM[0], G(...FC) + 2.2, FAIRCAM[1] + 2], [bx, G(...FC) + 4, bz], [FC[0] + .6, G(...FC) + 1.4, FC[1] - .6], 46) },
  { at: L('buu-fair') - .3, scene: 'fair', name: 'Even the grumpy one', cam: front(C.buu.root, { dist: 2.2, side: .6, fov: 40 }) },
  { at: L('veg-grumpy') - .2, scene: 'fair', name: 'Not grumpy', cam: front(C.vegeta.root, { dist: 1.8, side: 0.35, fov: 34 }) },
  { at: L('goku-spar') - .2, scene: 'fair', name: 'Want to spar?', cam: front(C.goku.root, { dist: 1.8, side: -0.35, fov: 34 }) },
  { at: L('veg-crush') - .2, scene: 'fair', name: 'I’ll crush you', cam: front(C.vegeta.root, { dist: 1.8, side: 0.35, fov: 34 }) },
  { at: L('chichi-car') - .2, scene: 'fair', name: 'A flying car?', cam: front(C.chichi.root, { dist: 1.8, side: -0.35, fov: 34 }) },
  { at: L('bulma-saiyan') - .2, scene: 'fair', name: 'You flipped a Saiyan?', cam: front(C.bulma.root, { dist: 1.8, side: 0.35, fov: 34 }) },
  { at: L('n-spy') - .3, scene: 'fair', name: 'Only for the cookies', cam: front(C.a18.root, { dist: 2.6, side: .4, fov: 38 }) },
  { at: L('goku-promise') - .3, scene: 'fair', name: 'Promise!', cam: lens(FAIRCAM, 1.8, at2(FC, -.4, .3), 1.5, 44) },
  // lantern
  { at: S0('lantern'), scene: 'lantern', name: 'One more round', dissolve: 1.4, cam: lens([LANT[0] + .9, LANT[1] + 3.6], 1.05, LANT, 1.0, 40) },
  { at: L('goku-onemore') - .3, scene: 'lantern', name: 'Over the far hills', free: true, cam: mv([LANT[0] - 2, PG + 3, LANT[1] + 2], [LANT[0] - 4, PG + 6, LANT[1] - 4], sparring.userData.far, sparring.userData.far, 30, 24) },
  { at: L('n-waited') - .3, scene: 'lantern', name: 'Two lanterns', cam: mv([LANT[0] + .6, PG + 1.1, LANT[1] + 2.8], [LANT[0] + .4, PG + 1, LANT[1] + 2.2], [LANT[0], PG + .7, LANT[1]], [LANT[0], PG + .7, LANT[1]], 40, 36) },
  // knot
  { at: S0('knot'), scene: 'knot', name: 'The biggest breakfast', dissolve: 1.2, cam: lens([FARM[0] - 3.4, FARM[1] + 7.2], 1.55, [FARM[0] - 1.9, FARM[1] + 3.05], 1.2, 40) },
  { at: L('chichi-keep') - .2, scene: 'knot', name: 'Keep your promises', cam: front(C.chichi.root, { dist: 2.0, side: -.3, fov: 36 }) },
  { at: L('goku-sorry') - .2, scene: 'knot', name: 'More important than fun', cam: front(C.goku.root, { dist: 2.0, side: .3, fov: 36 }) },
  { at: L('n-knot') - .2, scene: 'knot', name: 'The knot', cam: (t, k) => { const p = C.goku.root.position, y = C.goku.root.rotation.y, f = [-Math.sin(y), -Math.cos(y)]; return { pos: P3(p.x + f[0] * 1.8 + f[1] * .6, p.y + 1.3, p.z + f[1] * 1.8 - f[0] * .6), look: P3(p.x, p.y + .85, p.z), fov: 38 }; } },
  { at: L('chichi-help') - .3, scene: 'knot', name: 'Help me with the carrots', cam: lens([FARM[0] - 3.4, FARM[1] + 7.2], 1.6, [FARM[0] - 1.9, FARM[1] + 3.05], 1.2, 42) },
  // smoke
  { at: S0('smoke'), scene: 'smoke', name: 'Boom', dissolve: 1.2, cam: lens([OC[0] + .2, OC[1] + 5.4], 1.8, [OC[0] - .4, OC[1] - 1.6], 1.6, 46) },
  { at: L('yamcha-saw') - .2, scene: 'smoke', name: 'I saw Vegeta', cam: front(C.yamcha.root, { dist: 2.1, side: .35, fov: 38 }) },
  { at: L('bulma-true') - .2, scene: 'smoke', name: 'Is that true?', cam: front(C.bulma.root, { dist: 2.1, side: -.3, fov: 38 }) },
  { at: L('n-silent') - .2, scene: 'smoke', name: 'Too proud', cam: front(C.vegeta.root, { dist: 2.2, side: .4, fov: 38 }) },
  { at: L('bulma-out') - .2, scene: 'smoke', name: 'Get out of my lab', cam: lens([OC[0] + .2, OC[1] + 5.4], 1.8, OC, 1.5, 44) },
  // tape
  { at: S0('tape'), scene: 'tape', name: 'The security camera', dissolve: 1.2, cam: lens([OC[0] - .2, OC[1] + 5.8], 1.9, [OC[0] - .2, OC[1] - .2], 1.4, 44) },
  { at: L('n-footage') - .2, scene: 'tape', name: 'The tape', free: true, cam: mv([MACH[0] - 3.2, G(...MACH) + 3, MACH[1] - 4.4], [MACH[0] - 3, G(...MACH) + 3, MACH[1] - 4.2], [MACH[0] + .2, G(...MACH) + .9, MACH[1] - 1], [MACH[0] + .2, G(...MACH) + .9, MACH[1] - 1], 50) },
  { at: E('n-footage') + .3, scene: 'tape', name: 'I broke it', cam: front(C.vegeta.root, { dist: 2.0, side: .3, fov: 36 }) },
  { at: L('bulma-secrets') - .2, scene: 'tape', name: 'I can’t fix secrets', cam: front(C.bulma.root, { dist: 2.0, side: -.3, fov: 36 }) },
  { at: L('yamcha-sorry') - .2, scene: 'tape', name: 'Sorry, man', cam: front(C.yamcha.root, { dist: 2.1, side: .3, fov: 36 }) },
  { at: L('veg-accepted') - .2, scene: 'tape', name: 'Accepted', cam: lens([OC[0] - .2, OC[1] + 5.8], 1.9, [OC[0] - .2, OC[1] + .6], 1.4, 42) },
  // spy
  { at: S0('spy'), scene: 'spy', name: 'Someone else', dissolve: 1.2, cam: lens([OC[0] - .4, OC[1] + 6.2], 1.5, [OC[0] + .2, OC[1] + .8], 1.7, 42) },
  { at: L('kri-okay') - .2, scene: 'spy', name: 'Are you okay?', cam: front(C.krillin.root, { dist: 2.0, side: -.3, up: .1, fov: 38 }) },
  { at: L('n-flew') - .2, scene: 'spy', name: 'She flew away', free: true, cam: mv([OC[0] - 2, OG + 1.3, OC[1] + 6], [OC[0] - 2.4, OG + 1.4, OC[1] + 6.6], [OC[0] + 1.6, OG + 2.4, OC[1] + .2], [OC[0] + 8, OG + 14, OC[1] - 5], 46) },
  // freeze
  { at: S0('freeze'), scene: 'freeze', name: 'The Big Freeze', dissolve: 1.4, free: true, aerial: true, cam: mv([-90, 200, 240], [-80, 190, 230], [30, 10, 0], [30, 10, 0], 44) },
  { at: L('n-carrots') - .3, scene: 'freeze', name: 'Frozen carrots', cam: lens([FARM[0] - 5, FARM[1] + 6], 1.5, [FARM[0] - 1.2, FARM[1] + 2.6], .9, 40) },
  // table
  { at: S0('table'), scene: 'table', name: 'Five heroes, one table', dissolve: 1.2, cam: lens([OC[0] - .6, OC[1] + 4.6], 2.4, [OC[0] + .4, OC[1] - 1], 1.1, 44) },
  { at: L('chichi-seeds') - .2, scene: 'table', name: 'Nobody goes hungry', cam: front(C.chichi.root, { dist: 2.0, side: .3, fov: 36 }) },
  { at: L('bulma-together') - .2, scene: 'table', name: 'Together', cam: front(C.bulma.root, { dist: 2.1, side: .3, fov: 36 }) },
  { at: L('goku-him') - .3, scene: 'table', name: 'With him?!', cam: lens([OC[0] + 1.8, OC[1] + 4.2], 1.6, [OC[0] + 2.1, OC[1] + .15], 1.4, 40) },
  { at: L('kri-get') - .2, scene: 'table', name: 'I’m going to get Eighteen', cam: front(C.krillin.root, { dist: 2.0, side: -.3, fov: 36 }) },
  // remote
  { at: S0('remote'), scene: 'remote', name: 'The throne hall', dissolve: 1.2, cam: lens([px - .6, pz + 1.6], 1.7, [px + 1.4, pz - 4.4], 1.6, 46) },
  { at: L('frieza-remote') - .2, scene: 'remote', name: 'One click', cam: front(C.frieza.root, { dist: 2.3, side: .4, fov: 38 }) },
  { at: L('n-grab') - .2, scene: 'remote', name: 'The grab', cam: lens([px - .6, pz + 1.6], 1.6, [px - .2, pz - 4], 1.3, 44) },
  { at: L('n-eighteen') - .2, scene: 'remote', name: 'She waited', cam: front(C.a18.root, { dist: 2.0, side: .3, fov: 36 }) },
  { at: L('kri-nobody') - .2, scene: 'remote', name: 'Nobody should have a remote', cam: front(C.krillin.root, { dist: 1.9, side: -.3, fov: 36 }) },
  { at: L('a18-choose') - .3, scene: 'remote', name: 'I choose cocoa', cam: front(C.a18.root, { dist: 1.9, side: .3, fov: 36 }) },
  { at: L('frieza-what') - .2, scene: 'remote', name: 'What?!', cam: front(C.frieza.root, { dist: 2.0, side: -.4, fov: 38 }) },
  // thaw
  { at: S0('thaw'), scene: 'thaw', name: 'Red wire', dissolve: 1, cam: lens([px + 1.4, pz + 21.4], 1.6, [px + 1, pz + 18.4], 1.5, 46) },
  { at: L('n-team') + 2.6, scene: 'thaw', name: 'The farmers', cam: lens([FARMERS[0] + 6, FARMERS[1] + 5], 2.6, [FARMERS[0] - 2, FARMERS[1] + 1], 1.2, 48) },
  { at: L('n-team') + 5.2, scene: 'thaw', name: 'Eighteen pulls the wire', cam: lens([px + 5.6, pz + 19.6], 1.9, [px + 3.6, pz + 15.2], 1.3, 44) },
  { at: L('n-pop') - .3, scene: 'thaw', name: 'Pop', free: true, cam: lens([px + 1.4, pz + 21.4], 1.2, [px + 2.5, pz - 12], 18, 64) },
  { at: L('n-flakes') - .2, scene: 'thaw', name: 'Snowflakes', cam: mv([px + 1.4, G(px + 1, pz + 18) + 1.5, pz + 23.6], [px + 1.4, G(px + 1, pz + 18) + 1.7, pz + 22.8], [px + 1, G(px + 1, pz + 18) + 2.6, pz + 14], [px + 1, G(px + 1, pz + 18) + 1.8, pz + 16], 58, 52) },
  { at: L('poc-cake') - .3, scene: 'thaw', name: 'Wedding? Cake?', cam: lens([px - 1.6, pz + 24.2], 1.6, [px - 1.6, pz + 21], .6, 42) },
  // proposals
  { at: S0('propgoku'), scene: 'propgoku', name: 'Will you?', dissolve: 1.2, cam: front(C.goku.root, { dist: 1.9, side: .45, fov: 34 }) },
  { at: L('chichi-yes') - .2, scene: 'propgoku', name: 'Yes!', cam: lens([FARM[0] - 3.8, FARM[1] + 7.4], 1.5, [FARM[0] - 2.2, FARM[1] + 3.2], 1.2, 40) },
  { at: S0('propveg'), scene: 'propveg', name: 'Fireworks', dissolve: 1.2, cam: lens([OC[0] - .6, OC[1] - 2.6], 1.5, [OC[0] + .6, OC[1] + 6], 2.6, 46) },
  { at: L('veg-please') - .3, scene: 'propveg', name: 'Please', cam: front(C.vegeta.root, { dist: 2.0, side: .3, fov: 36 }) },
  { at: L('bulma-said') - .2, scene: 'propveg', name: 'You said it!', cam: front(C.bulma.root, { dist: 2.0, side: -.3, fov: 36 }) },
  { at: S0('propkri'), scene: 'propkri', name: 'Every morning', dissolve: 1.2, cam: lens(GCAM, 1.45, GATE, 1.05, 40) },
  { at: L('a18-fine') - .2, scene: 'propkri', name: 'You’re making the cocoa', cam: front(C.a18.root, { dist: 2.0, side: .3, fov: 36 }) },
  // wedding and chase
  { at: S0('wedding'), scene: 'wedding', name: 'Three weddings at once', dissolve: 1.6, cam: mv([P[0] + .3, AG + 6, P[1] + 12], [P[0] + .3, AG + 4.4, P[1] + 7.6], [ARCH[0], AG + 2, ARCH[1]], [ARCH[0], AG + 1.4, ARCH[1] + .6], 46, 42) },
  { at: L('pato-dearly') - .2, scene: 'wedding', name: 'Dearly beloved', cam: lens([ARCH[0] - .9, ARCH[1] + 3.6], 4.6, [ARCH[0], ARCH[1] - .6], 1.7, 26) },
  ...[['chichi-vow', 'chichiB', .3], ['goku-vow', 'gokuG', -.3], ['bulma-vow', 'bulmaB', .3], ['veg-vow', 'vegetaG', -.3], ['a18-vow', 'a18B', .3], ['kri-vow', 'krillinG', -.3]].map(([id, a, side]) => ({ at: L(id) - .25, scene: 'wedding', name: 'Vow: ' + id.split('-')[0], cam: front(C[a].root, { dist: 1.7, side, fov: 32 }) })),
  { at: L('frieza-snow') - .2, scene: 'wedding', name: 'It’s the snow', cam: front(C.frieza.root, { dist: 2.1, side: .3, fov: 36 }) },
  { at: L('n-rings') - .3, scene: 'wedding', name: 'The rings', cam: front(C.pocoyo.root, { dist: 2.0, side: .3, up: -.1, fov: 38 }) },
  { at: S0('chase'), scene: 'chase', name: 'Loula', free: true, cam: mv([P[0] + 3, PG + 1.4, P[1] + 7.4], [P[0] + 2.6, PG + 1.6, P[1] + 7], [P[0] + 1, PG + .8, P[1] + 1.5], [P[0] + 1, PG + .8, P[1] + 1.5], 50) },
  // Act V
  { at: S0('year15'), scene: 'year15', name: 'Server year fifteen', dissolve: 1.6, cam: lens([P[0] + .2, P[1] + 8.2], 1.3, [P[0] - .5, P[1] + 2], 1.1, 42) },
  { at: L('trunks-strong') - .2, scene: 'year15', name: 'The strongest kid', cam: front(C.trunks.root, { dist: 1.8, side: 0.3, fov: 34 }) },
  { at: L('goten-nope') - .2, scene: 'year15', name: 'Nuh-uh!', cam: front(C.goten.root, { dist: 1.8, side: -0.3, fov: 34 }) },
  { at: L('marron-settle') - .2, scene: 'year15', name: 'Settle it properly', cam: front(C.marron.root, { dist: 1.8, side: .3, fov: 36 }) },
  { at: L('gohan-rules') - .2, scene: 'year15', name: 'The rules', cam: front(C.gohan.root, { dist: 2.1, side: .3, fov: 36 }) },
  { at: S0('saiyaman'), scene: 'saiyaman', name: 'A theory', dissolve: 1.2, cam: lens([bx + 2.3, bz + 15], 1.6, [bx + 2, bz + 10], 1.35, 40) },
  { at: L('videl-theory') - .2, scene: 'saiyaman', name: 'The Great Saiyaman', cam: front(C.videl.root, { dist: 1.8, side: 0.3, fov: 34 }) },
  { at: L('gohan-student') - .2, scene: 'saiyaman', name: 'Just a student', cam: front(C.gohan.root, { dist: 1.8, side: -0.3, fov: 34 }) },
  { at: L('n-helmet') - .2, scene: 'saiyaman', name: 'The helmet', cam: lens([bx + 2.3, bz + 14], 1.4, [bx + 1.4, bz + 10.4], .9, 40) },
  { at: L('videl-deal') - .2, scene: 'saiyaman', name: 'A deal', cam: front(C.videl.root, { dist: 1.8, side: 0.3, fov: 34 }) },
  { at: L('gohan-anyway') - .2, scene: 'saiyaman', name: 'No deals', cam: front(C.gohan.root, { dist: 1.8, side: -0.3, fov: 34 }) },
  { at: S0('flying'), scene: 'flying', name: 'The flying lesson', dissolve: 1.2, cam: lens([P[0] - 1, P[1] + 7.4], 1.5, [P[0] - .4, P[1] + 1], 1.1, 46) },
  { at: L('goten-girlfriend') - .3, scene: 'flying', name: 'Girlfriend!', cam: lens([P[0] + 1.6, P[1] + 5.6], 1.3, [P[0] + 1.4, P[1] + 1.1], 1.0, 40) },
  { at: L('gohan-friend') - .2, scene: 'flying', name: 'She’s my friend', cam: front(C.gohan.root, { dist: 2.0, side: .3, fov: 36 }) },
  { at: L('videl-fornow') - .2, scene: 'flying', name: 'For now', cam: front(C.videl.root, { dist: 2.0, side: -.3, fov: 36 }) },
  { at: S0('budokai'), scene: 'budokai', name: 'The Tenkaichi Budokai', dissolve: 1.4, cam: mv([P[0] + 10, PG + 9, P[1] - 14], [P[0] + .4, RT + 1.6, P[1] - 7.2], [P[0], PG + 1, P[1]], [P[0], RT + .9, P[1] + 1.8], 50) },
  { at: L('frieza-announce') - .2, scene: 'budokai', name: 'Ladies and gentlemen', cam: front(C.frieza.root, { dist: 2.2, side: .3, fov: 38 }) },
  { at: L('n-showoff') - .2, scene: 'budokai', name: 'The junior final', cam: mv([P[0] + .4, RT + 1.3, P[1] - 6.8], [P[0] + .4, RT + 1.4, P[1] - 6.2], [P[0], RT + .8, P[1] + 1], [P[0], RT + .8, P[1] + 1], 50) },
  { at: L('gohan-winner') - .2, scene: 'budokai', name: 'Winner: Marron', cam: lens([P[0] + .3, P[1] - 4.6], 1.6, [P[0] + .2, P[1] - .4], 1.5, 40) },
  { at: L('goten-again') - .2, scene: 'budokai', name: 'Again? Tomorrow?', cam: front(C.goten.root, { dist: 1.8, side: .3, up: .2, fov: 38 }) },
  { at: S0('flip'), scene: 'flip', name: 'The exhibition match', dissolve: 1.2, cam: (t, k) => ({ pos: P3(P[0] + .4, RT + 2.2, P[1] - 5.8), look: P3(P[0], RT + .6, P[1] + 1.6), fov: 48 }) },
  { at: L('goku-best') - .3, scene: 'flip', name: 'Best fight ever', cam: (t, k) => { const p = C.goku.root.position; return { pos: P3(p.x - .6, p.y + 2.3, p.z - 1.6), look: P3(p.x, p.y + .2, p.z + .2), fov: 40 }; } },
  { at: S0('fourth'), scene: 'fourth', name: 'The fourth wedding', dissolve: 1.6, cam: mv([P[0] + .3, AG + 4, P[1] + 9], [P[0] + .3, AG + 2.2, P[1] + 5.4], [ARCH[0], AG + 2, ARCH[1]], [ARCH[0], AG + 1.4, ARCH[1] + 1.4], 48) },
  { at: L('chichi-baby') - .2, scene: 'fourth', name: 'My baby!', cam: front(C.chichi.root, { dist: 1.7, side: -.45, fov: 32 }) },
  { at: L('goku-food2') - .2, scene: 'fourth', name: 'Food at this wedding?', cam: front(C.goku.root, { dist: 1.7, side: .5, fov: 32 }) },
  { at: L('veg-congrats') - .2, scene: 'fourth', name: 'Congratulations', cam: front(C.vegeta.root, { dist: 1.7, side: .3, fov: 32 }) },
  { at: L('bulma-again') - .2, scene: 'fourth', name: 'He said it again', cam: front(C.bulma.root, { dist: 1.7, side: -.3, fov: 32 }) },
  { at: L('n-love') - .3, scene: 'fourth', name: 'Love isn’t winning', cam: mv([P[0] + .3, AG + 2.2, P[1] + 5.4], [P[0] + .3, AG + 6, P[1] + 12], [ARCH[0], AG + 1.4, ARCH[1] + 1.4], [ARCH[0], AG + 2, ARCH[1]], 48) },
  { at: S0('credits'), scene: 'credits', name: 'Credits', free: true, aerial: true, cam: orbit([P[0], PG, P[1]], 70, 36, 1.2, 2.4, 46) },
];

/** Keep the lens on the near side of any blocks (terrain, walls, leaves) between it and its subject. */
const ray = new T.Raycaster();
const solidAt = p => { const b = W.get(Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)), d = BLOCK_DEFS[b]; return !!b && !!d && d.solid !== false && !d.plant && !d.liquid; };
const shown = o => { for (let q = o; q; q = q.parent) if (!q.visible) return false; return true; };
const occluders = () => [W.group, ...props.filter(o => o.visible), ...visibleNow.map(k => C[k].root)];
const solidHit = h => shown(h.object) && !h.object.isPoints && h.object.geometry?.type !== 'PlaneGeometry' && !h.object.material?.transparent;
const AROUND = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map(a => new T.Vector3(...a));
const blocked = (lookAt, pos, blockers) => {
  const d = pos.clone().sub(lookAt), len = d.length(); ray.set(lookAt, d.normalize()); ray.far = len; ray.near = .4;
  const hit = ray.intersectObjects(blockers, true).find(solidHit); if (hit) return hit;
  if (solidAt(pos)) return { distance: len };
  for (const a of AROUND) { ray.set(pos, a); ray.near = 0; ray.far = .3; if (ray.intersectObjects(blockers, true).some(solidHit)) return { distance: len }; }
};
const probeCam = new T.PerspectiveCamera(40, 16 / 9, .05, 10);
function foreground(pos, lookAt, fov, blockers, near = 1.6) {
  probeCam.position.copy(pos); probeCam.lookAt(lookAt); probeCam.fov = fov; probeCam.updateProjectionMatrix(); probeCam.updateMatrixWorld();
  let hits = 0; for (let i = 0; i < 7; i++) for (let j = 0; j < 4; j++) { ray.setFromCamera({ x: -.85 + i * .283, y: -.6 + j * .4 }, probeCam); ray.near = 0; ray.far = near; if (ray.intersectObjects(blockers, true).some(solidHit)) hits++; }
  return hits / 28;
}
const OFFSETS = [[0, 0], [1, 0], [2.2, 0], [0, .45], [0, -.45], [1.4, .45], [1.4, -.45], [3.5, 0], [2.5, .9], [2.5, -.9]];
const offsetCam = (c, [lift, turn]) => {
  if (lift || turn) { const rel = c.pos.clone().sub(c.look).applyAxisAngle(new T.Vector3(0, 1, 0), turn); c.pos.copy(c.look).add(rel).add(new T.Vector3(0, lift, 0)); }
  return c;
};
function cameraBlocked(c) {
  const hp = new T.Vector3(), near = k => { C[k].head.getWorldPosition(hp); return hp.distanceTo(c.look); };
  const subject = visibleNow.filter(k => near(k) < 1.2).sort((a, b) => near(a) - near(b))[0];
  const blockers = [W.group, ...props.filter(o => o.visible), ...visibleNow.filter(k => k !== subject).map(k => C[k].root)];
  return !!blocked(c.look, c.pos, blockers) || foreground(c.pos, c.look, c.fov, blockers) > .2;
}
/** Pose the scene as the director would at time t of a shot (actors, props, visibility), without rendering. */
function poseAt(shot, t) { for (const R of Object.values(C)) R.root.visible = false; reset(t, shot); directors[shot.scene](t); D.applyLooks(); scene.updateMatrixWorld(true); }
/** The camera guard, one decision per shot (nine sampled moments, the first offset clear at all of them, held). */
const guard = shot => {
  const cam = shot.cam; let offset;
  return (t, k) => {
    if (!offset) {
      const sp = shot.end - shot.at, moments = Array.from({ length: 9 }, (_, i) => shot.at + sp * (i + .5) / 9);
      const score = OFFSETS.map(() => 0);
      for (const s of moments) {
        poseAt(shot, s); const c0 = cam(s, clamp(ease((s - shot.at) / sp)));
        if (c0.pos.distanceTo(c0.look) > 45) { offset = OFFSETS[0]; break; }
        OFFSETS.forEach((o, i) => { if (score[i] < 9 && cameraBlocked(offsetCam({ pos: c0.pos.clone(), look: c0.look.clone(), fov: c0.fov }, o))) score[i]++; });
      }
      offset ??= OFFSETS[score.indexOf(Math.min(...score))];
      shot.guard = { offset, blockedAt: Math.min(...score) };
      poseAt(shot, t);
    }
    return offsetCam(cam(t, k), offset);
  };
};
for (const s of shots) if (!s.free) s.cam = guard(s);

// ------------------------------------------------------------------ overlays
const project = p => { const q = new T.Vector3(...p).project(camera); return q.z > 1 || Math.abs(q.x) > 1.2 || Math.abs(q.y) > 1.2 ? null : [(q.x + 1) / 2 * 1280, (1 - q.y) / 2 * 720]; };
const box3 = new T.Box3();
// the tag hangs a few pixels above the top of the head on screen (a fixed distance in metres floats in close-ups)
const headTop = key => { box3.setFromObject(C[key].head); return [(box3.min.x + box3.max.x) / 2, box3.max.y, (box3.min.z + box3.max.z) / 2]; };
const COUPLES = ['goku', 'chichi', 'vegeta', 'bulma', 'krillin', 'a18'];
const TAGS = { lobby: COUPLES, farm: ['goku', 'chichi', 'pocoyo', 'elly'], lab: ['bulma', 'vegeta', 'yamcha', 'briefs'], gate: ['krillin', 'a18'], fair: [...COUPLES, 'buu'], lantern: ['chichi'], knot: ['goku', 'chichi'],
  smoke: ['bulma', 'vegeta', 'yamcha'], tape: ['bulma', 'vegeta', 'yamcha', 'babybox'], spy: ['krillin', 'a18'], freeze: ['chichi'], table: ['bulma', 'chichi', 'goku', 'vegeta', 'krillin'], remote: ['krillin', 'a18', 'frieza'],
  thaw: [...COUPLES, 'frieza', 'pocoyo'], propgoku: ['goku', 'chichi'], propveg: ['vegeta', 'bulma'], propkri: ['krillin', 'a18'], wedding: ['gokuG', 'chichiB', 'vegetaG', 'bulmaB', 'krillinG', 'a18B', 'pato', 'pocoyo', 'elly', 'frieza'],
  chase: ['loula', 'pocoyo', 'gokuG', 'chichiB', 'elly', 'vegetaG', 'bulmaB'], year15: ['gohan', 'goten', 'trunks', 'marron', 'bulla'], saiyaman: ['gohan', 'videl'], flying: ['gohan', 'videl', 'goten', 'trunks', 'marron'],
  budokai: ['marron', 'gohan', 'goten', 'trunks', 'frieza', 'chichi', 'goku', 'videl', 'a18', 'krillin', 'vegeta', 'bulma', 'bulla'], flip: ['goku', 'chichi', 'goten', 'trunks', 'bulla', 'marron', 'vegeta', 'bulma', 'gohan', 'videl'],
  fourth: ['gohanG', 'videlB', 'chichi', 'goku', 'vegeta', 'bulma', 'krillin', 'a18', 'goten', 'trunks', 'bulla', 'marron'] };
const CAPTIONS = [ // [from, to, text]: the editor's punchy captions
  [L('kids-eww') - .1, E('kids-eww') + .5, '"Ewwwww!"'], [E('chichi-mind') + .4, E('chichi-mind') + 2, 'FLIP!'], [L('veg-pl') + .2, E('veg-pl') + .3, '*cannot say please*'], [L('n-thirtyone') + .1, E('n-thirtyone') + 1.4, 'Round 32...'],
  [L('n-boom') + 1.5, L('n-boom') + 3, 'BOOM'], [L('n-pop') + .8, L('n-pop') + 2.4, 'pop.'], [L('n-catch') - .2, E('n-catch') + .6, 'The rings: last seen in a dog.'], [E('n-nudge') - .4, E('n-nudge') + 1.2, '*boop*'],
];
const CREDITS = ['THREE ISLANDS, THREE WEDDINGS', '', 'A Blockyland Pictures film', 'The 1500 Cartoon Players series', '', 'Starring (fan versions of)', 'Goku · Chi-Chi · Vegeta · Bulma · Krillin · Android 18', 'Gohan · Videl · Goten · Trunks · Bulla · Marron',
  'Yamcha · Frieza · Majin Buu · Dr. Briefs', 'Pocoyo · Pato · Elly · Loula · Baby Box', '', 'and 1,500 players in costume', '', 'Built with Blockyland\'s own blocks', 'Voices: neural text-to-speech · Original score', '', 'Dragon Ball, Pocoyo and Gabby\'s Dollhouse belong to their creators.', 'This is an unofficial fan film.'];
function overlay(ink, t, shot) {
  const sc = shot.scene;
  // the security tape: green, scanlines, REC and a timestamp
  if (shot.name === 'The tape') {
    ink.save(); ink.globalCompositeOperation = 'saturation'; ink.fillStyle = '#808080'; ink.fillRect(0, 0, 1280, 720); ink.globalCompositeOperation = 'multiply'; ink.fillStyle = '#7dff9a'; ink.fillRect(0, 0, 1280, 720); ink.restore();
    ink.save(); ink.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < 720; y += 4) ink.fillRect(0, y, 1280, 2); ink.font = 'bold 30px monospace'; ink.fillStyle = Math.sin(t * 5) > 0 ? '#ff4040' : 'rgba(255,64,64,.3)'; ink.fillText('● REC', 60, 90); ink.fillStyle = '#e8ffe8'; ink.fillText('LAB CAM 2 · 03:12 AM', 860, 90); ink.restore();
  }
  // name tags: big and soft in close-ups, small Minecraft tags in wider shots
  const placed = [];
  const onScreen = (TAGS[sc] ?? []).filter(key => C[key].root.visible && C[key].root.position.y > -1000).map(key => ({ key, p: headTop(key) })).map(o => ({ ...o, d: camera.position.distanceTo(new T.Vector3(...o.p)) })).sort((a, b) => a.d - b.d);
  if (shot.name !== 'The tape') for (const { key, p, d } of onScreen) {
    const top = project(p); if (!top) continue; const label = LABEL[key] ?? C[key].label, xy = [top[0], top[1] - 6];
    if (hidden(key) >= .8) continue;
    if (d < 3.4) { bigName(ink, [xy[0], Math.max(90, xy[1] - 8)], label, 40); continue; }
    if (d >= 60) continue;
    const size = d < 12 ? 16 : 13, w = label.length * size * .62 + size * .6, box = [xy[0] - w / 2, xy[1] - size * 1.15, xy[0] + w / 2, xy[1] + size * .15];
    if (placed.some(b => box[0] < b[2] && b[0] < box[2] && box[1] < b[3] && b[1] < box[3])) continue;
    placed.push(box); nameTag(ink, xy, label, { size });
  }
  if (sc === 'map') { const [a] = SC('map'); [['goku', 'temperate', 'Goku & Chi-Chi', -10], ['chichi', 'temperate', '', 10], ['vegeta', 'hot', 'Vegeta & Bulma', -10], ['bulma', 'hot', '', 10], ['krillin', 'cold', 'Krillin & 18', -10], ['android18', 'cold', '', 10]].forEach(([k, isl, label, dx], i) => { const I = ISLANDS[isl]; if (t > a + 1.2 + Math.floor(i / 2) * .9) mapPin(ink, project([I.c[0] + dx, 20, I.c[1] - 8]), label, pinFace(k), { size: 56, sub: label ? isl.toUpperCase() + ' ISLAND' : '' }); }); }
  if (sc === 'fair' && t < SC('fair')[0] + 6) { ink.globalAlpha = Math.min(1, (SC('fair')[0] + 6 - t) / .6); banner(ink, 'THREE-ISLAND FAIR', 'Day 8 · the borders are open', { color: '#7dff9a' }); ink.globalAlpha = 1; }
  if (sc === 'freeze') { banner(ink, 'THE BIG FREEZE', 'Day 15 · the sea is turning to ice', { color: '#9fdcff' }); if (t > L('frieza-one') - .4) broadcast(ink, 'FRIEZA: From now on, there is ONE island. Mine.'); }
  if (sc === 'propveg' && t > L('n-fireworks') + 1.6 && t < E('bulma-said') + 1) { const p = project([OC[0] + 3, OG + 22, OC[1] + 50]); if (p) { ink.save(); ink.font = '900 64px "Arial Rounded MT Bold", Arial, sans-serif'; ink.textAlign = 'center'; ink.shadowColor = '#ff9ad5'; ink.shadowBlur = 24; ink.globalAlpha = clamp((t - L('n-fireworks') - 1.6) / .8); ink.fillStyle = '#fff4fb'; ink.fillText('MARRY ME', p[0], Math.max(110, p[1])); ink.restore(); } }
  if (sc === 'year15' && t < SC('year15')[0] + 6) caption(ink, 'SERVER YEAR 15', { y: 110, size: 44, color: '#ffd23a' });
  if (sc === 'fourth' && t < SC('fourth')[0] + 6) caption(ink, 'SERVER YEAR 22', { y: 110, size: 44, color: '#ffd23a' });
  if (sc === 'budokai') banner(ink, 'TENKAICHI BUDOKAI', t > L('gohan-winner') ? 'Junior final · winner: MARRON!' : 'Junior final', { color: '#ffd23a' });
  if (sc === 'credits') {
    const [a] = SC('credits'), end = story.duration - 6.6, k = (t - a) / (end - a); if (t < end) {
      ink.save(); ink.textAlign = 'center'; CREDITS.forEach((line, i) => { const y = 720 - k * (CREDITS.length * 34 + 520) + i * 34; if (y < 40 || y > 690) return; ink.font = i === 0 ? '30px Minecraft, monospace' : '19px Minecraft, monospace'; ink.fillStyle = i === 0 ? '#ffd27a' : '#f4f0e6'; ink.globalAlpha = .92; ink.fillText(line, 640, y); }); ink.restore();
    }
  }
  for (const [a, b, words] of CAPTIONS) if (t > a && t < b) { ink.globalAlpha = Math.min(1, (t - a) / .2, (b - t) / .2); caption(ink, words, { y: 150, size: words.length < 12 ? 52 : 36 }); ink.globalAlpha = 1; }
}

// ------------------------------------------------------------------ sound cues
const CUES = {
  lobbySparkle: [S0('lobby'), S0('lobby') + 3], yay: L('kids-yay'), flip: E('chichi-mind') + .4, flip2: L('n-flipped') + .5,
  fairCheer: [S0('fair'), SC('fair')[1]], budokai: [S0('budokai'), SC('budokai')[1]], gong: S0('budokai') + 1.5, winner: L('gohan-winner') + .4,
  boom: L('n-boom') + 1.6, tape: L('box-play') + .6, truth: L('veg-broke'), snap: E('kri-nobody') + .1, flyAway: L('n-flew') + .6,
  freeze: [S0('freeze'), SC('freeze')[1]], pop: L('n-pop') + .8, fireworks: [0, 1, 2].map(i => L('n-fireworks') + .8 + i * 1.1),
  bells: S0('wedding') + .5, bells2: S0('fourth') + .5, chase: [S0('chase'), SC('chase')[1]], lift: L('gohan-lift') + 1,
  blizzard: [[S0('gate'), SC('gate')[1]], [S0('remote'), SC('remote')[1]], [S0('thaw'), L('n-pop') + .8], [S0('propkri'), SC('propkri')[1]], [S0('freeze'), SC('table')[1]]],
  birds: [[S0('farm'), SC('farm')[1]], [S0('knot'), SC('knot')[1]], [S0('fair'), SC('fair')[1]], [S0('year15'), SC('flip')[1]]],
  night: [[S0('lantern'), SC('lantern')[1]], [S0('smoke'), SC('smoke')[1]], [S0('spy'), SC('spy')[1]], [S0('propveg'), SC('propveg')[1]]],
};

await fontsReady;
await D.mount({ shots, directors, reset, light, grade, overlay, wavBase64, soundtrack: () => buildWedSoundtrack(story, { BASE, cues: CUES, scenes: SCENE }) });
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
/** How bright an actor's face is in the frame just rendered (75th percentile of luma over the middle of the head). */
function faceLuma(key) {
  const R = C[key], hp = R.head.getWorldPosition(new T.Vector3()), q = hp.clone().project(camera);
  if (hp.distanceTo(camera.position) > 9 || q.z > 1 || Math.abs(q.x) > .9 || Math.abs(q.y) > .9) return null;
  const yaw = R.root.rotation.y + R.head.rotation.y, toCam = camera.position.clone().sub(hp).setY(0).normalize();
  if (-Math.sin(yaw) * toCam.x - Math.cos(yaw) * toCam.z < -.15) return null;
  const gl = renderer.getContext(), Wd = gl.drawingBufferWidth, Hd = gl.drawingBufferHeight;
  const e = hp.clone().add(new T.Vector3(0, R.root.scale.x * .18, 0)).project(camera), r = Math.max(2, Math.abs(e.y - q.y) / 2 * Hd * .6), n = Math.round(2 * r);
  const px0 = new Uint8Array(n * n * 4); gl.readPixels(Math.round((q.x + 1) / 2 * Wd - r), Math.round((q.y + 1) / 2 * Hd - r), n, n, gl.RGBA, gl.UNSIGNED_BYTE, px0);
  const ls = []; for (let i = 0; i < px0.length; i += 4) ls.push(.2126 * px0[i] + .7152 * px0[i + 1] + .0722 * px0[i + 2]);
  return ls.sort((a, b) => a - b)[Math.floor(ls.length * .75)];
}
/** Problems a viewer would see in the frame at t: actors inside blocks, a lens inside a block, a speaker hidden, turned away or unlit. */
function check(t) {
  const shot = window.pilot.renderFrame(t).shot, issues = [];
  for (const key of new Set(visibleNow)) for (const f of coplanarFaces(C[key].root)) issues.push(`${key} has flush same-facing faces (${f}): they z-fight`);
  for (const p of props) if (p.visible) for (const f of coplanarFaces(p)) issues.push(`a prop has flush same-facing faces (${f}): they z-fight`);
  if (solidAt(camera.position)) issues.push('camera inside a block');
  { const lookAt = camera.getWorldDirection(new T.Vector3()).add(camera.position), f = foreground(camera.position, lookAt, camera.fov, occluders()); if (f > .2) issues.push(`something within 1.6 m of the lens covers ${Math.round(f * 100)}% of the frame`); }
  for (const key of new Set(visibleNow)) {
    const R = C[key].root, k = R.scale.x; if (R.position.y < -1000) continue;
    const hp = new T.Vector3(); C[key].head.getWorldPosition(hp); const on = hp.clone().project(camera); if (on.z > 1 || Math.abs(on.x) > 1.05 || Math.abs(on.y) > 1.05) continue;
    if (Math.abs(R.rotation.x) > 1) continue; // lying on the ground (flipped, sleeping): the probe heights below assume an upright body
    const seated = Math.abs(C[key].legL.rotation.x) > 1;
    const yaw = R.rotation.y, f = new T.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), r = new T.Vector3(-f.z, 0, f.x);
    const inside = (seated ? [1, 1.6] : [.35, 1, 1.6]).some(h => [[-.2, 0], [.2, 0], [0, -.12], [0, .12]].some(([a, b]) => solidAt(R.position.clone().addScaledVector(r, a * k).addScaledVector(f, b * k).add(new T.Vector3(0, h * k, 0)))));
    if (inside) issues.push(`${key} is inside a block`);
  }
  for (const line of story.lines) {
    if (t < line.start || t > line.start + line.duration || !line.face) continue;
    const key = visibleNow.find(k => C[k].root.name === line.face && C[k].root.position.y > -1000); if (!key) continue;
    const hp = new T.Vector3(); C[key].head.getWorldPosition(hp); const q = hp.clone().project(camera), d = hp.distanceTo(camera.position);
    if (q.z > 1 || Math.abs(q.x) > .9 || Math.abs(q.y) > .9 || d > 9) continue;
    if (Math.abs(C[key].root.rotation.x) > 1) continue; // lying on his back: the face points at the sky, not along the yaw
    const yaw = C[key].root.rotation.y + C[key].head.rotation.y, toCam = camera.position.clone().sub(hp).setY(0).normalize();
    if (-Math.sin(yaw) * toCam.x - Math.cos(yaw) * toCam.z < -.15) issues.push(`${key} speaks with their back to the camera`);
    const h = hidden(key); if (h >= .6) issues.push(`${key} speaks but is hidden (${Math.round(h * 100)}%)`);
    const y = h < .6 ? faceLuma(key) : null; if (y != null && y < FACE_MIN * .6) issues.push(`${key} speaks with an unlit face (luma ${Math.round(y)} of 255)`);
  }
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
window.civ = { T, C, camera, scene, sun, renderer, W, shots, SITES, props: { clouds }, visible: () => visibleNow };
