// 塞翁失马 · We'll See — Claude. Direction: cast, blocking, light and the shot list.
// The shared director (claudeDirector.js) supplies acting helpers, cameras, compositing and playback.
import * as T from 'three';
import { createHorseModel } from '../horseModel.js';
import { CLAUDE_STORY as story } from './claudeStory.js';
import { buildStage, texBox } from './claudeSets.js';
import { makeActor, horsePose, horsePath, box, clamp, ease, lerp, facing } from './claudeActors.js';
import { createDirector, v, at, arc, S, N, E, Wd } from './claudeDirector.js';
import { buildSoundtrack, wavBase64 } from './claudeScore.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const stage = await buildStage();
const { scene, camera, renderer, sun, hemi, sky, groundAt, M } = stage;
// ------------------------------------------------------------------ cast
const dad = makeActor({ name: 'dad', scale: 1, skin: '#e0b08a', hair: '#2a211c', shirt: '#3f5f86', pants: '#5b4a3a', sleeve: 7, buttons: '#d8c9a8', face: { style: 'short', eyes: '#3b2617' } });
const mom = makeActor({ name: 'mom', scale: .95, skin: '#ecc29e', hair: '#221a17', shirt: '#a8544a', pants: '#6b5546', skirt: '#6b5546', apron: '#eadfc6', hairLen: 5, face: { style: 'bun', lashes: true, eyes: '#3b2617', lip: '#b86a5e' },
  extras: a => { box(a.head, [.3, .24, .2], [0, .36, .33], 0x221a17); box(a.head, [.05, .05, .36], [.11, .44, .33], 0xc9a24a); } });
const mei = makeActor({ name: 'mei', scale: .74, skin: '#f0c7a3', hair: '#1e1815', shirt: '#4b98a3', pants: '#7a6a4f', hairLen: 6, hairBack: 8, sleeve: 9, belt: '#2f5a63', face: { style: 'bangs', child: true, lashes: true, eyes: '#3b2617', lip: '#c27766' },
  extras: a => { for (const sx of [-1, 1]) { box(a.head, [.13, .44, .13], [sx * .2, -.06, .2], 0x1e1815); box(a.head, [.17, .08, .17], [sx * .2, -.2, .2], 0xc8423a); } } });
const bo = makeActor({ name: 'bo', scale: .56, skin: '#f2caa8', hair: '#2a201b', shirt: '#e39a4f', pants: '#4f6c78', sleeve: 5, face: { style: 'short', child: true, eyes: '#3b2617' } });
const elderFace = { style: 'elder', beard: '#ece6da', wrinkles: true, eyes: '#3b2617', brows: '#d8d0c2', hatShadow: '#8a7448' };
const grandpa = makeActor({ name: 'grandpa', scale: .95, skin: '#dcae88', hair: '#e5ded2', shirt: '#8d7a5a', pants: '#5e5446', beard: '#ece6da', hairLen: 4, face: elderFace,
  extras: a => { texBox(a.head, [.9, .06, .9], [0, .53, 0], M.hay); texBox(a.head, [.56, .2, .56], [0, .66, 0], M.hay); box(a.head, [.58, .05, .58], [0, .585, 0], 0x6d4a2c); a.props.cane = box(a.rightArm, [.06, .62, .06], [0, -1.03, -.06], 0x6b4a2c); } });
const elder = makeActor({ name: 'elder', scale: .95, skin: '#dcae88', hair: '#e5ded2', shirt: '#55697a', pants: '#4b4a44', robe: true, sash: '#c9a24a', beard: '#ece6da', hairLen: 4, face: elderFace,
  extras: a => { for (const [w, y] of [[1.02, .52], [.78, .58], [.52, .64], [.26, .7]]) texBox(a.head, [w, .06, w], [0, y, 0], M.hay); a.props.staff = box(a.rightArm, [.07, 1.5, .07], [0, -.55, -.06], 0x6b4a2c); } });
const son = makeActor({ name: 'son', scale: .95, skin: '#e3b48f', hair: '#231b18', shirt: '#a2683f', pants: '#4e4a3e', sleeve: 8, face: { style: 'headband', band: '#b8342b', eyes: '#3b2617' },
  extras: a => { a.props.cast = box(a.rightLeg, [.29, .52, .29], [0, -.46, 0], 0xefe9da); for (const y of [-.3, -.6]) box(a.props.cast, [.3, .04, .3], [0, y + .46, 0], 0xb9ab8b); a.props.axe = new T.Group(); a.rightArm.add(a.props.axe); box(a.props.axe, [.05, .7, .05], [0, -.75, -.25], 0x6b4a2c).rotation.x = 1.4; box(a.props.axe, [.06, .2, .22], [0, -.75, -.58], 0x7d8488); } });
const neighborA = makeActor({ name: 'neighborA', scale: 1, skin: '#d9a982', hair: '#2a211c', shirt: '#6e7d4f', pants: '#55493b', face: { style: 'cropped', mustache: '#2a211c', eyes: '#3b2617' },
  extras: a => { box(a.head, [.56, .12, .56], [0, .55, 0], 0x7b5a3a); box(a.head, [.36, .04, .2], [0, .5, -.34], 0x6b4a2c); } });
const neighborB = makeActor({ name: 'neighborB', scale: .93, skin: '#ebc19c', hair: '#2a1f1b', shirt: '#8a5a8f', pants: '#5e4b5f', skirt: '#5e4b5f', face: { style: 'scarf', scarf: '#c9a24a', lashes: true, eyes: '#3b2617', lip: '#b86a5e' },
  extras: a => { box(a.head, [.56, .1, .56], [0, .55, 0], 0xc9a24a); box(a.head, [.56, .42, .06], [0, .24, .3], 0xc9a24a); } });
const soldier = (name, captain) => makeActor({ name, scale: 1, skin: '#d9a982', hair: '#231b18', shirt: '#8d2f26', pants: '#3c3a36', belt: '#2a2522', sash: '#c9a24a', face: { style: 'helmet', eyes: '#2a1c14' },
  extras: a => { box(a.head, [.58, .22, .58], [0, .56, 0], 0x5d6870); box(a.head, [.64, .05, .64], [0, .46, 0], 0x4b555c); if (captain) box(a.head, [.08, .3, .34], [0, .8, .04], 0xb8342b);
    else { a.props.spear = new T.Group(); a.rightArm.add(a.props.spear); box(a.props.spear, [.05, 2.4, .05], [0, -.45, -.08], 0x6b4a2c); box(a.props.spear, [.03, .26, .1], [0, .86, -.08], 0xb0b6ba); } } });
const captain = soldier('captain', true), soldierB = soldier('soldierB'), soldierC = soldier('soldierC');
soldierC.props.spear.visible = false; // carries the banner instead
const youth = (name, shirt) => makeActor({ name, scale: .93, skin: '#e3b48f', hair: '#231b18', shirt, pants: '#4e4a3e', face: { style: 'short', eyes: '#3b2617' }, extras: a => { box(a.torso, [.42, .46, .26], [0, .05, .28], 0xbfae86); } });
const youths = [youth('youthA', '#9c8c6a'), youth('youthB', '#7d6a58')];
const carpenter = makeActor({ name: 'carpenter', scale: 1.03, skin: '#d9a982', hair: '#3a2c22', shirt: '#7a8d99', pants: '#4b4036', apron: '#6b4a2e', sleeve: 6, face: { style: 'headband', band: '#d8cbb0', mustache: '#3a2c22', eyes: '#3b2617' } });
const cast = [dad, mom, mei, bo, grandpa, elder, son, neighborA, neighborB, captain, soldierB, soldierC, ...youths, carpenter];
const D = await createDirector({ story, stage, cast, audioDir: 'cinema-claude', voiceScript: 'node scripts/narrate-claude.mjs' });
const { act, applyLooks, hold, headPos, walkY, smoothGround } = D, { move, single, front, follow } = D.cams;

const horseCache = {};
const familyHorse = createHorseModel(3, 0, horseCache), whiteHorse = createHorseModel(1, 1, horseCache), blackHorse = createHorseModel(4, 0, horseCache), redHorse = createHorseModel(2, 2, horseCache);
familyHorse.bridleMesh.visible = whiteHorse.bridleMesh.visible = true;
for (const h of [familyHorse, whiteHorse, blackHorse, redHorse]) scene.add(h.mesh);

// carried props live in the scene and are placed every frame
const carry = { crate: stage.crate(scene, [0, 0, 0]), sack: new T.Group(), cloth: new T.Group(), wheel: stage.wagon.makeWheel() };
box(carry.sack, [.5, .55, .4], [0, .27, 0], new T.MeshLambertMaterial({ map: stage.tex.white_wool, color: 0xcdb98e })); box(carry.sack, [.2, .12, .2], [0, .6, 0], 0x9e8a62);
box(carry.cloth, [.7, .06, .5], [0, 0, 0], new T.MeshLambertMaterial({ map: stage.tex.white_wool, color: 0xe7dcc4 }));
scene.add(carry.sack, carry.cloth, carry.wheel);
const crutch = new T.Group(); box(crutch, [.06, 1.2, .06], [0, .6, 0], 0x7a5a38); box(crutch, [.3, .06, .08], [0, 1.2, 0], 0x7a5a38); crutch.position.set(-3.55, 3, 37.55); crutch.rotation.z = .18; stage.sets.frontier.add(crutch);
const fireflies = []; { const mat = new T.MeshBasicMaterial({ color: 0xfff1a0, fog: false }); for (let i = 0; i < 34; i++) { const m = new T.Mesh(new T.BoxGeometry(.06, .06, .06), mat); scene.add(m); fireflies.push(m); } }
const lamps = [new T.PointLight(0xffb45a, 0, 10, 1.6), new T.PointLight(0xffb45a, 0, 10, 1.6)]; lamps[0].position.set(-5, 6, -2.9); lamps[1].position.set(0, 6, -2.9); scene.add(...lamps);

// ------------------------------------------------------------------ expressions
const X = D.expressions;
X('mei', [[0, 'sulk'], [16.9, 'sad'], [18.4, 'sulk'], [26.2, 'sad'], [29, 'sulk'], [31.4, 'curious'], [33.6, 'thinking'], [35.7, 'curious'], [40.6, 'hopeful'],
  [97.5, 'curious'], [102.9, 'thinking'], [107.25, 'shock'], [109.6, 'worried'], [114.9, 'hopeful'], [115.5, 'worried'], [119.4, 'warm'], [125.8, 'happy'], [130, 'happy'],
  [152.9, 'calm'], [157.9, 'surprised'], [158.8, 'joy'], [161.4, 'happy'], [163.2, 'knowing'], [164.9, 'joy']]);
X('bo', [[0, 'excited'], [16, 'happy'], [37.5, 'curious'], [97.5, 'calm'], [103.2, 'excited'], [107.25, 'shock'], [109.8, 'cry'], [115.6, 'sniffle'], [122.8, 'sad'], [125.6, 'sniffle'], [127.4, 'hopeful'], [130.1, 'happy'],
  [152.9, 'happy'], [157.9, 'surprised'], [158.7, 'joy'], [161.6, 'curious'], [164.6, 'happy']]);
X('grandpa', [[0, 'calm'], [31.1, 'warm'], [33.2, 'knowing'], [38.2, 'warm'], [41.0, 'thinking'], [42.4, 'knowing'], [97.5, 'warm'], [102.9, 'knowing'], [105.8, 'calm'], [107.25, 'surprised'], [108.8, 'worried'], [119.6, 'warm'], [125, 'happy'],
  [152.9, 'warm'], [157.8, 'happy'], [163.7, 'knowing'], [165.0, 'wink'], [165.7, 'joy']]);
X('dad', [[0, 'determined'], [9, 'calm'], [97.5, 'calm'], [104.8, 'determined'], [107.25, 'shock'], [109.7, 'worried'], [132.3, 'sad'], [137.3, 'calm'], [142.4, 'proud'], [143.6, 'calm'], [145.6, 'surprised'], [147.4, 'thinking'], [149.2, 'happy'],
  [152.9, 'warm'], [157.4, 'warm'], [159.6, 'joy'], [161.6, 'happy']]);
X('mom', [[0, 'calm'], [20.5, 'warm'], [26.3, 'sad'], [28.8, 'worried'], [97.5, 'calm'], [107.25, 'shock'], [109.6, 'worried'], [119.5, 'warm'], [152.9, 'warm'], [157.8, 'happy'], [159.6, 'joy'], [162.6, 'happy']]);
X('elder', [[0, 'calm'], [46, 'surprised'], [47.4, 'calm'], [54.7, 'knowing'], [58.3, 'calm'], [67.0, 'knowing'], [70.2, 'calm'], [73.6, 'worried'], [75.8, 'calm'], [79.6, 'knowing'], [82.2, 'calm'], [86.0, 'worried'], [88.4, 'calm'], [92.9, 'thinking'], [94.8, 'knowing']]);
X('son', [[0, 'calm'], [46.1, 'shock'], [48.4, 'sad'], [58.8, 'surprised'], [61, 'excited'], [70.2, 'determined'], [72.4, 'excited'], [73.0, 'shock'], [73.9, 'pained'], [75.8, 'sad'], [79.6, 'calm'], [82.4, 'worried'], [85.8, 'sheepish'], [87.6, 'relieved']]);
X('neighborA', [[0, 'calm'], [49.6, 'shock'], [54.6, 'worried'], [75.8, 'sad'], [76.4, 'shock'], [79.4, 'worried']]);
X('neighborB', [[0, 'calm'], [62, 'excited'], [63.9, 'joy'], [66.6, 'happy'], [82.2, 'worried'], [89.5, 'happy'], [92, 'relieved']]);
for (const n of ['captain', 'soldierB', 'soldierC']) X(n, [[0, 'stern'], [86.4, 'calm'], [87.2, 'stern']]);
X('youthA', [[0, 'sad']]); X('youthB', [[0, 'worried']]);
X('carpenter', [[0, 'determined'], [137.3, 'warm'], [139.6, 'curious'], [142.5, 'warm'], [144.1, 'curious'], [146, 'warm'], [148.6, 'happy'], [150.6, 'joy']]);

// ------------------------------------------------------------------ blocking
// HOME, MORNING (0–43.8)
const dadA = at([[0, -3.6, -3.95], [.8, -3.6, -3.95], [2.6, -.25, -3.1], [4.2, -.25, -.9], [5.4, -.25, 1.4], [8.0, 1.75, 5.15], [8.2, 1.75, 5.15, E],
  [9.9, 1.75, 5.15], [12.4, -.25, 1.4], [13.6, -.25, -.9], [15.0, -.25, -3.1], [16.6, -2.75, -4.0], [16.8, -2.75, -4.0, facing(-.3, -.6)],
  [18.4, -2.75, -4.0], [20.0, -.25, -3.1], [21.4, -.25, -.9], [22.6, -.25, 1.4], [25.1, 1.75, 5.15], [25.3, 1.75, 5.15, E], [26.6, 1.75, 5.15], [28.2, 3.6, 4.15], [28.4, 3.6, 4.15, S]]);
const momA = at([[0, -6.4, -4.0, S], [16.0, -6.4, -4.0], [17.6, -.3, -3.05], [18.2, .05, -2.4], [19.4, .05, -.75], [20.3, -1.3, -.45], [20.5, -1.3, -.45, facing(-.6, -1.3)],
  [29.4, -1.3, -.45], [30.6, -.9, 2.4], [31.4, -.6, 3.9], [33.0, 2.2, 4.15], [33.2, 2.2, 4.15, S]], { stride: .8 });
const gpA = at([[0, -1, -7.6, S], [28.4, -1, -7.6], [29.9, -1, -4.4], [30.6, -.45, -2.35], [30.7, -.45, -2.35, S]], { stride: .7 });
const boA = at([[0, 1.5, 7.7], [1.4, 4.6, 8.4], [3.3, 8.8, 7.4], [4.1, 9.4, 5.6], [4.9, 8.6, 3.9], [6.6, 4.6, 4.0], [8.0, 1.5, 4.1], [8.8, 1.0, 5.8], [9.6, 1.6, 7.6], [10.4, 3.3, 7.9], [10.6, 3.3, 7.9, S],
  [15.6, 3.3, 7.9], [16.8, 5.8, 8.2], [18.2, 8.9, 7.0], [19.0, 9.2, 5.1], [19.8, 7.95, 4.6], [20.0, 7.95, 4.6, S],
  [33.2, 7.95, 4.6], [33.8, 9.3, 5.3], [34.6, 8.6, 7.4], [36.0, 4.0, 8.1], [36.8, .4, 6.4], [37.4, -.9, 3.6], [38.2, .25, -.85], [38.3, .25, -.85, S]], { stride: .55 });
// HOME, AFTERNOON (97.5–132.3)
const boB = at([[97.5, .25, -1.35, S], [103.4, .25, -1.35], [103.8, .25, -.9], [104.5, -.9, 3.0], [105.2, .6, 6.5], [105.9, 4.2, 8.0], [106.1, 4.2, 8.0, N], [109.8, 4.2, 8.0], [110.4, 4.2, 8.0, Wd]], { stride: .55 });
const dadB = at([[97.5, 3.6, 4.15, S], [103.2, 3.6, 4.15], [104.0, 1.6, 4.2], [104.7, .85, 5.6], [104.8, .85, 5.6, E], [106.2, .85, 5.6], [106.6, 1.5, 5.6], [107.35, 1.5, 5.6], [107.9, 1.1, 6.3], [108.0, 1.1, 6.3, facing(2.1, .8)],
  [110.6, 1.1, 6.3], [111.5, 2.35, 6.7], [111.6, 2.35, 6.7, facing(.85, .4)]]);
const momB = at([[97.5, 2.2, 4.15, S], [103.0, 2.2, 4.15], [105.0, 8.3, 4.65], [105.1, 8.3, 4.65, S], [112.0, 8.3, 4.65], [113.0, 9.3, 6.4], [114.6, 5.3, 9.0], [114.8, 5.3, 9.0, facing(-1, -.4)]], { stride: .8 });
const meiB = at([[97.5, -1.9, -1.75, S], [116.1, -1.9, -1.75], [116.6, -1.75, -.7], [117.6, -.9, 2.8], [118.6, 1.8, 6.8], [119.2, 3.45, 8.0], [119.3, 3.45, 8.0, E]], { stride: .62 });
// WORKSHOP (132.3–152.9)
const dadW = at([[132.3, 17.5, 5.6], [135.0, 24.5, 5.2], [137.0, 31.0, -2.6], [137.2, 31.0, -2.6, E]], { stride: .9 });
const carpW = at([[132.3, 34.4, -1.5, S], [136.2, 34.4, -1.5], [137.2, 32.2, -2.0], [137.4, 32.2, -2.0, Wd], [144.6, 32.2, -2.0], [145.4, 32.2, -2.0, facing(1.5, -.4)], [147.4, 32.2, -2.0, facing(1.5, -.4)], [147.9, 32.2, -2.0, Wd]]);
// FRONTIER (43.8–97.5)
const elder1 = at([[43.8, 4.0, 36.3, S], [51.0, 4.0, 36.3], [51.4, 4.0, 36.3, facing(2.0, -1.1)], [58.3, 4.0, 36.3], [58.8, 4.0, 36.3, facing(.3, 1)], [63.6, 4.0, 36.3], [64.0, 4.0, 36.3, facing(-2, -1)], [70.0, 4.0, 36.3], [70.4, 4.0, 36.3, facing(.6, 1)]]);
const elder2 = at([[75.8, -6.0, 36.6, facing(.6, -1)], [76.4, -6.0, 36.6, facing(1, -.3)], [82.2, -6.0, 36.6], [82.6, -6.0, 36.6, facing(1, -.5)], [88.0, -6.0, 36.6], [88.4, -6.0, 36.6, facing(1, -.2)]]);
const son1 = at([[43.8, -8.0, 36.4, N], [46.6, -8.0, 36.4], [48.6, 1.2, 36.0], [48.8, 1.2, 36.0, facing(.4, 1)], [58.4, 1.2, 36.0], [62.0, 1.2, 36.0, facing(.5, 1)], [70.2, 1.2, 36.0], [71.0, 3.0, 37.4], [72.0, 5.45, 42.4], [72.05, 5.45, 42.4, E]], { stride: .8 });
const nA1 = at([[43.8, 18, 34.3], [48.2, 18, 34.3], [51.0, 6.1, 35.2], [51.2, 6.1, 35.2, facing(-2.1, 1.1)], [58.6, 6.1, 35.2], [64.0, 18, 34.3]]);
const nA2 = at([[75.8, -.6, 34.3], [76.4, -2.4, 35.4], [76.5, -2.4, 35.4, facing(-2.2, 1.7)]]);
const nB1 = at([[43.8, -14, 34.3], [61.6, -14, 34.3], [63.8, 2.0, 35.2], [64.0, 2.0, 35.2, facing(2, 1.1)]], { stride: .7 });
const nB2 = at([[82.2, .3, 36.5, facing(.6, -1)], [89.4, .3, 36.5], [89.6, .3, 36.5, facing(-6.3, .1)]]);
const capt = at([[82.2, 5.0, 34.2], [85.2, -3.9, 35.25], [85.4, -3.9, 35.25, facing(-.6, 1.9)], [87.4, -3.9, 35.25], [87.8, -4.6, 34.4], [93.6, -14.5, 34.2]], { stride: .95 });
const solB = at([[82.2, 6.6, 33.6], [85.3, -1.8, 33.7], [85.4, -1.8, 33.7, facing(-1, .4)], [87.7, -1.8, 33.7], [94.0, -13.6, 33.6]], { stride: .95 });
const solC = at([[82.2, 7.8, 34.8], [85.3, -.6, 34.8], [85.4, -.6, 34.8, facing(-1, .5)], [87.9, -.6, 34.8], [94.3, -12.6, 34.8]], { stride: .95 });
const yA = at([[82.2, 9.3, 34.1], [85.4, 1.0, 34.1], [88.1, 1.0, 34.1], [94.6, -11.2, 34.1]], { stride: .9 });
const yB = at([[82.2, 10.5, 34.9], [85.4, 2.2, 34.9], [88.3, 2.2, 34.9], [94.8, -10.0, 34.9]], { stride: .9 });
const fromEast = d => [[58.2 + d, 44, 57], [59.4 + d, 31, 59.5], [60.6 + d, 18, 56.5], [61.6 + d, 9, 50.5], [62.6 + d, 5.2, 46.2], [63.5 + d, 4.9, 43.6]];
const white1 = horsePath([{ t: 43.8, at: [4.0, 39.4], yaw: N }, { t: 46.0, at: [4.0, 39.4] }, { t: 46.5, at: [4.7, 39.3] }, { t: 46.9, at: [4.7, 40.1] }, { t: 47.6, at: [5.0, 43.6] }, { t: 47.95, at: [5.05, 45.7] }, { t: 48.8, at: [7.5, 50.4] }, { t: 49.9, at: [16, 56.2] }, { t: 51.2, at: [30, 59.5] }, { t: 52.6, at: [46, 57.5] }]);
const white2 = horsePath([...fromEast(0).map(k => ({ t: k[0], at: [k[1], k[2]] })), { t: 64.4, at: [4.4, 41.6] }, { t: 64.6, at: [4.4, 41.6], yaw: N }]);
const black2 = horsePath([...fromEast(.45).map(k => ({ t: k[0], at: [k[1], k[2]] })), { t: 64.9, at: [5.8, 42.9] }, { t: 65.2, at: [5.8, 42.9], yaw: N }]);
const red2 = horsePath([...fromEast(.9).map(k => ({ t: k[0], at: [k[1], k[2]] })), { t: 65.4, at: [2.5, 42.8] }, { t: 65.7, at: [2.5, 42.8], yaw: N }]);
const blackAfter = horsePath([{ t: 73.8, at: [5.8, 42.9] }, { t: 75.0, at: [7.0, 40.0] }, { t: 75.2, at: [7.0, 40.0], yaw: facing(-.4, 1) }]);

// ------------------------------------------------------------------ scenes
const { wagon } = stage;
function wagonState(t, mode) {
  // mode: 'loaded' | 'break' | 'propped'
  const w = wagon; w.root.visible = true;
  const brk = mode === 'break' ? t - 107.25 : mode === 'propped' ? 99 : -1;
  const tilt = brk < 0 ? 0 : mode === 'propped' ? 0 : ease(brk / .28) * (1 + Math.sin(clamp(brk - .28, 0, .6) * 18) * Math.exp(-(brk - .28) * 6) * .08 * (brk > .28));
  // The bed rolls about the line from the rear-left wheel's ground contact to the front axle pivot.
  const A = v(-.82, 0, -.85), dir = v(1.64, .55, .85).normalize(), q = new T.Quaternion().setFromAxisAngle(dir, .19 * tilt);
  w.bed.quaternion.copy(q); w.bed.position.copy(A).sub(A.clone().applyQuaternion(q));
  w.wheels.rr.visible = brk < 0; w.chock.visible = mode === 'propped';
  const bw = w.brokenWheel; bw.visible = brk >= 0 && mode === 'break';
  if (bw.visible) { // falls outward onto its face, bounces once
    const fall = clamp(brk / .55), k = fall * fall, bounce = brk > .55 ? Math.abs(Math.sin((brk - .55) * 9)) * Math.exp(-(brk - .55) * 7) * .12 : 0;
    bw.position.set(4 - .82, 3 + .45 * Math.cos(k * Math.PI / 2) + .06 + bounce, 5.6 + .85 + .45 * Math.sin(k * Math.PI / 2) + .1 * k);
    bw.rotation.set(k * Math.PI / 2 * .98, 0, -.3 * k);
    bw.spokes.forEach((s, i) => { s.visible = i % 2 === 0 || brk < .05; });
  }
  w.splinters.forEach((s, i) => {
    const age = brk, on = mode === 'break' && age >= 0 && age < 1.6; s.visible = on; if (!on) return;
    const a = i / w.splinters.length * Math.PI * 2 + i, sp = 1.6 + (i % 4) * .5, tt = Math.min(age, .55 + (i % 3) * .12);
    s.position.set(3.18 + Math.cos(a) * sp * tt * .7, Math.max(3.03, 3.45 + (2.4 + (i % 3)) * tt - 4.9 * tt * tt), 6.45 + Math.abs(Math.sin(a)) * sp * tt * .8);
    s.rotation.set(tt * 9 + i, tt * 7, i);
  });
  // cargo slides toward the dropped corner
  const slide = ease(clamp(brk / .5)) * (mode === 'break' ? 1 : 0);
  w.cargo[3].position.set(-.55 - slide * .18, 1.71 - slide * .05, -.3 + slide * .3); w.cargo[3].rotation.z = slide * .2;
}
function homeSet(t, phase) {
  stage.sets.home.visible = true; stage.sets.frontier.visible = false;
  stage.porchCrates.forEach(c => { c.visible = phase === 'evening'; });
  stage.porchCrates[2].visible = phase === 'morning' ? t < 17.4 : phase === 'evening';
  stage.porchCrates[0].visible = phase === 'morning' ? false : phase === 'evening'; stage.porchCrates[1].visible = phase === 'evening' || phase === 'morning';
  const cargoOn = phase !== 'evening';
  wagon.cargo.forEach((c, i) => { c.visible = cargoOn; });
  if (phase === 'morning') { wagon.cargo[0].visible = t >= 8.9; wagon.cargo[2].visible = t >= 25.9; }
  wagon.trunk.visible = phase === 'afternoon';
}

function directMorning(t) {
  homeSet(t, 'morning'); wagonState(t, 'loaded');
  // family horse, hitched, ears and tail alive
  horsePose(familyHorse, { x: 7.25, z: 5.6, yaw: Math.PI / 2, gait: 0, phase: t * 2, headDown: .1 + Math.sin(t * .6) * .08, headTurn: t > 20 && t < 33.2 ? -.35 : 0 }); familyHorse.mesh.visible = true;
  // Dad: two trips, carrying with both arms, bending to set things down
  const d = dadA(t), carrying = t < 8.6 || (t > 17.5 && t < 25.6);
  const set = t > 7.9 && t < 9.2 ? Math.sin(clamp((t - 7.9) / 1.3) * Math.PI) : t > 25 && t < 26.3 ? Math.sin(clamp((t - 25) / 1.3) * Math.PI) : t > 16.8 && t < 17.9 ? Math.sin(clamp((t - 16.8) / 1.1) * Math.PI) : 0;
  const tying = t > 28.4 ? Math.sin(t * 3.1) * .25 : 0;
  act(dad, d, t, { lean: set * .55 + (t > 28.4 ? .2 : 0), armL: carrying || set ? [1.05 + set * .3, .14] : t > 28.4 ? [1.0 + tying, .1] : undefined, armR: carrying || set ? [1.05 + set * .3, -.14] : t > 28.4 ? [1.0 - tying, -.1] : undefined, look: t > 28.4 ? v(3.6, 3.9, 5.4) : undefined, lookAmt: .6 });
  // Mom folds cloth on the porch, then talks to Mei, then joins Dad at the wagon
  const m = momA(t);
  const folding = t < 15.8 ? Math.sin(t * 2.2) * .18 : 0;
  act(mom, m, t, { armL: t < 15.8 ? [.95 + folding, .2] : t > 20.4 && t < 29.2 ? [.35, .25] : t > 33.2 ? [1.0 + Math.sin(t * 2.7) * .2, .1] : undefined, armR: t < 15.8 ? [.95 - folding, -.2] : t > 20.4 && t < 29.2 ? [.35, -.25] : t > 33.2 ? [1.0 - Math.sin(t * 2.7) * .2, -.1] : undefined,
    lean: t > 20.4 && t < 29.2 ? .22 : t > 33.2 ? .25 : t < 15.8 ? .12 : 0, look: t > 19.6 && t < 29.6 ? mei : t < 15.8 ? v(-6.4, 4.4, -3.3) : undefined, lookAmt: t < 15.8 ? .7 : 1 });
  carry.cloth.visible = t < 15.9;
  // Mei on the top step, knees hugged, refusing to look at anyone
  const sulk = t < 31.2;
  act(mei, { x: -1.9, z: -1.75, yaw: S, phase: 0, stride: 0 }, t, { sit: 1, seat: 3 + 2 / 3, sitLegs: .95, armL: sulk ? [1.18, .2] : [.75, .08], armR: sulk ? [1.18, -.2] : [.75, -.08],
    headPitch: sulk ? -.28 : 0, headYaw: t > 20.6 && t < 26 ? -.55 : 0, look: t >= 26.1 && t < 29.4 ? mom : t >= 31 ? grandpa : undefined, lookAmt: t >= 26.1 && t < 29.4 ? .8 : 1 });
  // Grandpa comes out, sits on the porch edge beside her
  const g = gpA(t), sitK = clamp((t - 30.7) / .65);
  act(grandpa, { ...g, z: lerp(g.z, -2.12, ease(sitK)) }, t, { sit: sitK, seat: 4.0, sitLegs: 1.1, lean: sitK > 0 ? .1 : .12, armR: sitK < 1 ? [.25 + Math.sin(g.phase) * .15, .05] : [.55, .05], armL: sitK < 1 ? undefined : [.55, -.02],
    look: t > 31 ? (t > 40.8 && t < 42.4 ? v(6, 5.5, 14) : t > 38.2 && t < 40.8 ? mei : mei) : undefined });
  grandpa.props.cane.visible = sitK < .5; if (t < 28.3) grandpa.visible = false;
  // Bo races round the wagon, bounces through his line, pets the horse, then hurries to hear the story
  const b = boA(t), hop = t > 11.8 && t < 15.4 ? Math.abs(Math.sin((t - 11.8) * 6.5)) * .22 : 0, sitB = clamp((t - 38.3) / .5);
  act(bo, b, t, { stride: 1.25, y: walkY(b) + hop, lean: b.stride ? .12 : 0, sit: sitB, seat: 3 + 1 / 3, sitLegs: .9,
    armL: t > 11.8 && t < 15.4 ? [2.7, -.35] : t > 20 && t < 33.2 ? [.5, -.05] : sitB ? [.5, .1] : undefined, armR: t > 11.8 && t < 15.4 ? [2.7, .35] : t > 20 && t < 33.2 ? [1.7 + Math.sin(t * 3) * .25, -.1] : sitB ? [.5, -.1] : undefined,
    look: t > 20 && t < 33.2 ? v(8.0, 4.9, 5.6) : t > 38.3 ? grandpa : undefined });
  // carried things
  const dh = hold(dad, .45, .98);
  carry.crate.visible = t < 8.9; if (carry.crate.visible) carry.crate.position.copy(t < 8.2 ? dh.clone().add(v(0, -.3, 0)) : arc(dh.clone().add(v(0, -.3, 0)), v(3.4, 4.01, 5.3), ease((t - 8.2) / .7), .15));
  carry.sack.visible = t >= 17.4 && t < 25.9; if (carry.sack.visible) carry.sack.position.copy(t < 17.9 ? arc(v(-3.0, 4, -4.55), dh.clone().add(v(0, -.3, 0)), ease((t - 17.4) / .5), .1) : t < 25.2 ? dh.clone().add(v(0, -.3, 0)) : arc(dh.clone().add(v(0, -.3, 0)), v(4.6, 4.01, 5.25), ease((t - 25.2) / .7), .15));
  if (carry.cloth.visible) { const mh = hold(mom, .4, .95); carry.cloth.position.copy(mh); carry.cloth.rotation.set(Math.sin(t * 2.2) * .2, mom.rotation.y, 0); }
}

function directAfternoon(t) {
  homeSet(t, 'afternoon');
  wagonState(t, t >= 107.25 ? 'break' : 'loaded');
  const spook = t > 107.25 && t < 109.5 ? Math.sin(clamp((t - 107.3) / 1.6) * Math.PI) : 0;
  horsePose(familyHorse, { x: 7.25 + spook * .25, z: 5.6, yaw: Math.PI / 2, gait: 0, phase: t * 2, rear: spook * .35, headDown: .1 - spook * .4, headTurn: t > 109.5 ? -.3 : 0 }); familyHorse.mesh.visible = true;
  // Mei and Grandpa on the steps; Mei leaves to comfort Bo
  const meiStand = clamp((t - 115.6) / .5), meiKneel = clamp((t - 119.3) / .45), mw = meiB(t);
  const hug = clamp((t - 130.0) / .6);
  act(mei, mw, t, { stride: 1.2, sit: 1 - meiStand, seat: 3 + 2 / 3, sitLegs: .95, kneel: meiKneel, lean: meiKneel * (.12 + hug * .25),
    armL: meiKneel ? [lerp(1.0, 1.35, hug), lerp(.12, .55, hug)] : t < 115.6 ? [.75, .08] : undefined, armR: meiKneel ? [lerp(1.0, 1.35, hug), lerp(-.12, -.55, hug)] : t < 115.6 ? [.75, -.08] : undefined,
    look: t < 102.6 ? grandpa : t < 107.2 ? grandpa : t < 114.8 ? v(3.6, 3.6, 7.0) : t < 116.2 ? bo : meiKneel ? bo : undefined, lookAmt: t >= 103.5 && t < 107.2 ? .5 : 1 });
  act(grandpa, { x: -.45, z: -2.12, yaw: S, phase: 0, stride: 0 }, t, { sit: 1, seat: 4.0, sitLegs: 1.1, lean: .1, armL: [.55, -.02], armR: [.55, .05], look: t < 105.6 ? mei : t < 116 ? v(3.3, 4, 6.5) : t < 130 ? v(3.8, 3.6, 8) : mei, lookAmt: t >= 105.6 && t < 107.2 ? .7 : 1 });
  grandpa.props.cane.visible = false;
  // Bo: from the step to the wagon, then down in the dirt, crying
  const bw = boB(t), up = clamp((t - 103.0) / .4), down = clamp((t - 109.8) / .5), excited = t > 106 && t < 107.25 ? Math.abs(Math.sin(t * 7)) * .15 : 0;
  const sob = t > 110.1 && t < 119.6 ? Math.abs(Math.sin(t * 5.2)) : 0, held = clamp((t - 119.5) / .5);
  const startle = t > 107.25 && t < 107.7 ? Math.sin((t - 107.25) / .45 * Math.PI) * .2 : 0;
  act(bo, bw, t, { stride: 1.25, y: walkY(bw) + excited + startle, sit: t < 104 ? 1 - up : down, seat: t < 104 ? 3 + 1 / 3 : 3.0, sitLegs: t < 104 ? .9 : 1.25, lean: down * (.2 + sob * .1 - held * .15),
    armL: t < 103 ? [.5, .1] : down ? (held ? [lerp(.9, 1.3, hug), lerp(-.05, .5, hug)] : t < 111.4 || t > 114.6 ? [2.5 - sob * .2, .45] : [.45 + sob * .1, .2]) : t > 106 && t < 107.25 ? [2.6, -.3] : undefined,
    armR: t < 103 ? [.5, -.1] : down ? (held ? [lerp(.9, 1.3, hug), lerp(.05, -.5, hug)] : t < 111.4 || t > 114.6 ? [2.5 - sob * .2, -.45] : [.45 + sob * .1, -.2]) : t > 106 && t < 107.25 ? [2.6, .3] : undefined,
    headPitch: down && !held ? -.14 + sob * .1 : 0, look: t < 103 ? grandpa : held ? mei : t < 109.8 ? v(3.2, 3.5, 6.9) : undefined, lookAmt: t < 103 ? .6 : 1 });
  // Dad lifts the trunk, the wheel gives way
  const dw = dadB(t), bend = clamp((t - 104.8) / .6) * (1 - clamp((t - 105.4) / .8)), heave = clamp((t - 106.55) / .45), kneel = clamp((t - 111.6) / .5);
  const shock = t > 107.9 && t < 109.9;
  act(dad, dw, t, { lean: bend * .75 + (t > 105.4 && t < 106.6 ? .1 : 0) - heave * (1 - clamp((t - 107.1) / .3)) * .12 + kneel * .3, kneel,
    armL: shock ? [2.65, .35] : kneel ? [.95, .05] : t > 104.8 && t < 107.2 ? [lerp(.55, 1.15, clamp((t - 105.3) / .6)) + heave * .55, .12] : t < 103.2 ? [1.0 + Math.sin(t * 3.1) * .25, .1] : undefined,
    armR: shock ? [2.65, -.35] : kneel ? [.6, -.05] : t > 104.8 && t < 107.2 ? [lerp(.55, 1.15, clamp((t - 105.3) / .6)) + heave * .55, -.12] : t < 103.2 ? [1.0 - Math.sin(t * 3.1) * .25, -.1] : undefined,
    look: t > 107.3 && t < 111 ? v(3.2, 3.3, 7.1) : kneel ? v(3.2, 3.1, 7.1) : t > 104.7 && t < 107.3 ? v(2.9, 4.1, 5.7) : undefined });
  const tr = wagon.trunk, dh = hold(dad, .5, .95);
  if (t < 105.4) { tr.position.set(1.55, 3, 5.6); tr.rotation.set(0, 0, 0); }
  else if (t < 106.55) { tr.position.copy(arc(v(1.55, 3, 5.6), dh.clone().add(v(0, -.35, 0)), ease((t - 105.4) / .8), 0)); tr.rotation.set(0, Math.PI / 2 + dad.rotation.y, 0); }
  else { const k = ease((t - 106.55) / .5); const p = arc(dh.clone().add(v(0, -.35, 0)), v(3.05, 4.07, 5.75), k, .25); if (t >= 107.25) p.add(v(0, -ease(clamp((t - 107.25) / .3)) * .2, ease(clamp((t - 107.25) / .3)) * .12)); tr.position.copy(p); tr.rotation.set(t >= 107.25 ? ease(clamp((t - 107.25) / .3)) * .17 : 0, 0, 0); }
  // Mom calms the horse, then comes to watch the children
  const mw2 = momB(t);
  act(mom, mw2, t, { armR: t > 105 && t < 112 ? [1.75 + spook * .4, -.05] : t > 114.8 ? [.55, -.3] : undefined, armL: t > 107.4 && t < 112 ? [1.4 + Math.sin(t * 4) * .2, .1] : t > 114.8 ? [.55, .3] : undefined,
    lean: spook * -.15, look: t > 105 && t < 112 ? v(8.4, 4.6, 5.6) : t > 114.8 ? mei : undefined });
  carry.crate.visible = carry.sack.visible = carry.cloth.visible = false;
}

function directWorkshop(t) {
  stage.sets.home.visible = true; stage.sets.frontier.visible = false; familyHorse.mesh.visible = false;
  homeSet(t, 'evening'); wagonState(t, 'propped');
  const d = dadW(t), arrived = t >= 137.0;
  const handoff = clamp((t - 137.9) / .7), shake = t > 150.6 && t < 152.3 ? Math.sin((t - 150.6) * 11) * .12 : 0, offer = clamp((t - 148.6) / .7);
  act(dad, d, t, { armR: !arrived ? [.35, .42] : handoff < 1 ? [1.15, -.1] : t > 150.3 ? [1.05 + shake, -.18] : undefined, armL: arrived && handoff < 1 ? [1.15, .1] : undefined, look: arrived ? carpenter : undefined,
    headPitch: arrived ? 0 : -.08 });
  // the wheel rolls beside him on his right, then is handed over
  const wh = carry.wheel; wh.visible = true;
  if (!arrived) {
    const right = v(Math.cos(d.yaw), 0, -Math.sin(d.yaw)), fwd = v(-Math.sin(d.yaw), 0, -Math.cos(d.yaw)), pos = v(d.x, 3.47, d.z).addScaledVector(right, .62).addScaledVector(fwd, .25);
    wh.position.copy(pos); wh.rotation.set(0, Math.atan2(fwd.z * -1, fwd.x), -d.phase * .9 / Math.PI * .9 / .45, 'YXZ');
  }
  const cw = carpW(t), planing = t < 136.2 ? Math.sin(t * 3.4) : 0, inspect = t > 138.5 && t < 142.5;
  act(carpenter, cw, t, { lean: t < 136.2 ? .3 + planing * .08 : inspect ? .05 : 0, armL: t < 136.2 ? [1.1 + planing * .25, .15] : handoff > 0 && t < 142.6 ? [1.2, .1] : t > 145.3 && t < 147.4 ? [1.4, -.25] : undefined,
    armR: t < 136.2 ? [1.1 + planing * .25, -.15] : handoff > 0 && t < 142.6 ? [1.2, -.1] : t > 150.3 ? [1.05 + shake, -.18] : offer && t < 150.3 ? [lerp(.1, .95, offer), -.12] : undefined,
    look: t < 136.2 ? v(34.4, 4.0, -.6) : t > 145.3 && t < 147.4 ? v(38.8, 5.3, -2) : t > 138.5 && t < 142.4 ? wh : dad, lookAmt: t > 138.5 && t < 142.4 ? .7 : 1 });
  if (arrived) {
    const dh = hold(dad, .55, .9), ch = hold(carpenter, .6, .95);
    const p = handoff < 1 ? arc(dh, ch, ease(handoff), .05) : t < 142.6 ? ch : arc(ch, v(33.6, 3.47, -1.05), ease((t - 142.6) / .6), .1);
    wh.position.copy(p);
    wh.rotation.set(0, (handoff < 1 ? dad.rotation.y : carpenter.rotation.y) + Math.PI / 2 + (inspect ? Math.sin((t - 138.5) * 1.3) * .6 : 0), t > 143.2 ? .25 : 0, 'YXZ');
  }
  for (const a of [mom, mei, bo, grandpa]) a.visible = false;
}

function directEvening(t) {
  homeSet(t, 'evening'); wagonState(t, 'propped');
  horsePose(familyHorse, { x: 9.2, z: .8, yaw: -Math.PI / 2 + .3, gait: 0, phase: t * 1.5, headDown: .95 + Math.sin(t * .8) * .05 }); familyHorse.mesh.visible = true;
  const meiUp = clamp((t - 159.3) / .5), hugK = t > 160.2 && t < 161.5 ? Math.sin(clamp((t - 160.2) / 1.3) * Math.PI) : 0;
  const mw = t < 159.3 ? { x: -1.9, z: -1.75, yaw: S, phase: 0, stride: 0 } : at([[159.3, -1.9, -1.6], [159.9, -1.9, -1.6], [160.25, -1.5, -.75], [160.3, -1.5, -.75, S], [161.5, -1.5, -.75], [162.0, -1.5, -.75, facing(.1, -1)]])(t);
  act(mei, mw, t, { sit: 1 - meiUp, seat: 3 + 2 / 3, sitLegs: .95, lean: hugK * .15, armL: t < 159.3 ? [.7, .08] : [lerp(.2, 1.35, hugK), lerp(-.05, .55, hugK)], armR: t < 159.3 ? [.7, -.08] : [lerp(.2, 1.35, hugK), lerp(.05, -.55, hugK)],
    look: t < 157.4 ? (Math.sin(t * .4) > 0 ? bo : grandpa) : t < 161.6 ? dad : t < 163.0 ? bo : t < 163.85 ? grandpa : bo });
  act(bo, { x: -1.15, z: -1.75, yaw: S, phase: 0, stride: 0 }, t, { sit: 1, seat: 3 + 2 / 3, sitLegs: .95 + Math.sin(t * 2.6) * .1 * (t < 157), armL: [.6, .05], armR: [.6, -.05], y: 3 + (t > 158.6 && t < 160 ? Math.abs(Math.sin(t * 8)) * .06 : 0),
    look: t < 157.4 ? grandpa : t < 161.6 ? dad : mei });
  act(grandpa, { x: -.45, z: -2.12, yaw: S, phase: 0, stride: 0 }, t, { sit: 1, seat: 4.0, sitLegs: 1.1, lean: .1 + (t > 165.4 && t < 166.6 ? Math.abs(Math.sin(t * 9)) * .05 : 0), armL: [.55, -.02], armR: [.55, .05], look: t < 163.6 ? dad : t < 164.9 ? mei : v(-.9, 4.7, 1.8), lookAmt: t > 164.9 ? .75 : 1 });
  grandpa.props.cane.visible = false;
  act(dad, { x: -1.2, z: .15, yaw: N, phase: 0, stride: 0 }, t, { lean: hugK * .38, armL: hugK ? [lerp(.1, 1.25, hugK), lerp(-.04, .6, hugK)] : t > 157.6 && t < 159.3 ? [.35, -.2] : undefined, armR: hugK ? [lerp(.1, 1.25, hugK), lerp(.04, -.6, hugK)] : t > 157.6 && t < 159.3 ? [.35, .2] : undefined,
    look: t < 157.5 ? grandpa : t < 161.6 ? mei : bo });
  act(mom, { x: -1.7, z: -3.15, yaw: S, phase: 0, stride: 0 }, t, { armL: [.55, .32], armR: [.55, -.32], headRoll: t > 159.5 && t < 161.5 ? .12 : 0, look: t < 159.4 ? dad : mei });
  for (const a of [carpenter]) a.visible = false;
  fireflies.forEach((f, i) => { const k = t * (.3 + (i % 5) * .05) + i * 1.7; f.visible = true; f.position.set(-12 + (i * 7.3) % 26 + Math.sin(k) * 1.2, 3.6 + (i % 4) * .4 + Math.sin(k * 1.7) * .3, -1 + (i * 3.1) % 10 + Math.cos(k * .8) * 1.1); f.scale.setScalar(.5 + .5 * Math.max(0, Math.sin(k * 3))); });
}

function directParable(t) {
  stage.sets.home.visible = false; stage.sets.frontier.visible = true; familyHorse.mesh.visible = false; wagon.root.visible = false;
  const late = t >= 75.8;
  // the old man
  const e = late ? elder2(t) : elder1(t), feeding = t < 46 ? Math.sin(t * 2) * .15 : 0, shrug = (s0, d = 1.4) => (t > s0 && t < s0 + d ? Math.sin((t - s0) / d * Math.PI) : 0);
  const sh = shrug(55.6) + shrug(67.8) + shrug(80.3, 1.1);
  act(elder, e, t, { stride: .9, armL: t < 46 ? [.9 + feeding, .1] : sh ? [.35 + sh * .3, -.1 - sh * .55] : late && t < 82 ? [.95, .3] : undefined, armR: t < 46 ? [.9 - feeding, -.1] : t > 46.2 && t < 49 ? [2.55, .2] : sh ? [.4 + sh * .3, .1 + sh * .55] : [.15, .02],
    lean: t < 46 ? .2 : 0, headRoll: sh * .12,
    look: t < 46 ? v(4, 3.8, 39) : t < 51 ? (white1(t).x ? v(white1(t).x, 4.6, white1(t).z) : undefined) : t < 58.3 ? neighborA : t < 63.6 ? v(white2(t).x, 4.3, white2(t).z) : t < 70.2 ? neighborB : t < 75.8 ? son : t < 82.2 ? (t < 79.5 ? neighborA : neighborA) : t < 89.4 ? captain : t < 93.6 ? neighborB : t < 94.9 ? v(-14, 4.4, 34) : neighborB,
    lookAmt: t > 93.6 && t < 94.9 ? .8 : 1 });
  elder.props.staff.visible = t > 49;
  // horses
  const wp = t < 58.2 ? white1(t) : white2(t);
  const rear = t > 46 && t < 46.9 ? Math.sin((t - 46) / .9 * Math.PI) : 0, jump = t > 47.45 && t < 48.05 ? Math.sin((t - 47.45) / .6 * Math.PI) : 0;
  const hidden = (t > 52.6 && t < 58.2);
  whiteHorse.mesh.visible = !hidden;
  horsePose(whiteHorse, { x: wp.x, z: wp.z, y: smoothGround(wp.x, wp.z) + jump * .8, yaw: wp.yaw, gait: rear ? 0 : wp.gait, phase: wp.phase * 1.0 + t * (wp.gait ? 0 : 1.5), rear, headDown: t < 46 ? .85 : t > 64.6 ? .5 + Math.sin(t * .5) * .3 : 0, tailUp: jump * .5 });
  stage.brokenRails.forEach((r, i) => { const k = t > 47.65 ? ease((t - 47.65) / .4) : 0; r.rotation.set(k * (1.2 + i * .3), 0, k * (.4 - i * .7)); r.position.y = (i ? 3.95 : 3.5) - k * (i ? .8 : .35); r.position.z = 45 + k * .3; });
  const bp = t < 72.4 ? black2(t) : t < 73.8 ? { x: 5.8, z: 42.9, yaw: Math.PI + Math.sin(t * 5) * .25, phase: t * 10, gait: 0 } : blackAfter(t);
  const buck = t > 72.4 && t < 73.8 ? Math.max(0, Math.sin((t - 72.4) * 8.5)) * (t > 73.3 ? 1.2 : .8) : 0, brear = t > 72.4 && t < 73.8 ? Math.max(0, -Math.sin((t - 72.4) * 8.5)) * .6 : 0;
  blackHorse.mesh.visible = redHorse.mesh.visible = t > 58.2;
  horsePose(blackHorse, { x: bp.x, z: bp.z, y: smoothGround(bp.x, bp.z) + (buck + brear) * .1, yaw: bp.yaw, gait: buck || brear ? 0 : bp.gait, phase: bp.phase, buck, rear: brear, headDown: t > 76 ? .6 : 0 });
  const rp = red2(t); horsePose(redHorse, { x: rp.x, z: rp.z, y: smoothGround(rp.x, rp.z), yaw: rp.yaw, gait: rp.gait, phase: rp.phase + (rp.gait ? 0 : t * 1.3), headDown: t > 66 ? .8 + Math.sin(t * .7) * .1 : 0 });
  // the son
  son.props.cast.visible = late; son.props.axe.visible = t < 46.6; crutch.visible = late;
  if (!late) {
    if (t < 72.0) {
      const w = son1(t), chop = t < 46.3 ? Math.sin(t * 3.4) : 0, cheer = t > 61.5 && t < 64.5 ? Math.abs(Math.sin(t * 6)) : 0;
      act(son, w, t, { stride: 1.2, armR: t < 46.3 ? [2.0 + chop * 1.0, -.05] : cheer ? [2.8, .3] : undefined, armL: t < 46.3 ? [1.4 + chop * .6, .2] : cheer ? [2.8, -.3] : undefined, lean: t < 46.3 ? .15 + Math.max(0, -chop) * .2 : 0, y: walkY(w) + cheer * .1,
        look: t < 46.3 ? v(-8, 3.6, 35.6) : t < 52.6 ? v(wp.x, 4.5, wp.z) : t > 58.2 && t < 66 ? v(rp.x, 4.5, rp.z) : t > 66 ? blackHorse.mesh : undefined });
      if (t > 71.95) { const k = ease((t - 71.95) / .45); son.position.y += Math.sin(k * Math.PI) * .6; }
    } else if (t < 73.8) { // riding, bareback, holding on
      blackHorse.mesh.updateMatrixWorld(true);
      const seat = blackHorse.mesh.localToWorld(v(0, 1.36, -.05)), mount = clamp((t - 72.0) / .4), from = v(5.45, 3, 42.4);
      act(son, { x: lerp(from.x, seat.x, ease(mount)), z: lerp(from.z, seat.z, ease(mount)), yaw: blackHorse.mesh.rotation.y + Math.PI, phase: 0, stride: 0 }, t, { sit: 1, seat: lerp(3.6, seat.y, ease(mount)), sitLegs: .55, armL: [1.0 + buck * .8, .2 + buck * .6], armR: [1.0 + buck * .8, -.2 - buck * .6], lean: .1 - buck * .3 + brear * .3 });
      son.leftLeg.rotation.z = -.42; son.rightLeg.rotation.z = .42; son.rotation.x = blackHorse.mesh.rotation.x * -1;
    } else { // thrown forward, lands, clutches the leg
      const fl = clamp((t - 73.8) / .55), land = v(5.4, 3, 40.6), start = v(5.8, 4.1, 42.4);
      const p = arc(start, land, fl, 1.1);
      act(son, { x: p.x, z: p.z, yaw: N, phase: 0, stride: 0 }, t, { y: fl < 1 ? p.y : 3, sit: fl < 1 ? .4 : 1, seat: 3.12, sitLegs: 1.45, lean: fl < 1 ? -.6 : .45 + Math.sin(t * 6) * .04,
        armL: fl < 1 ? [2.8, -.6] : [.75, .25], armR: fl < 1 ? [2.8, .6] : [.75, -.1], headPitch: fl < 1 ? .4 : -.25 });
      if (fl < 1) son.rotation.x = -fl * Math.PI * .5;
    }
  } else {
    const point = t > 85.6 && t < 86.8, shrugS = t > 86.8 && t < 87.6 ? Math.sin((t - 86.8) / .8 * Math.PI) : 0;
    act(son, { x: -4.6, z: 37.25, yaw: N, phase: 0, stride: 0 }, t, { sit: 1, seat: 3.47, sitLegs: 1.05, sitLegR: .45, armL: shrugS ? [.4, -.5] : [.5, .1], armR: point ? [.75, -.05] : shrugS ? [.4, .5] : [.5, -.1], headPitch: point ? -.3 : 0,
      look: t < 79.5 ? neighborA : t < 82.2 ? elder : t < 88 ? captain : t < 89.4 ? v(-12, 4.5, 34) : neighborB });
  }
  // neighbours
  neighborA.visible = false; neighborB.visible = false;
  if (t < 64.2) { const w = nA1(t), out = t > 51.3 && t < 54.4 ? Math.sin(clamp((t - 51.3) / 3.1) * Math.PI) : 0; act(neighborA, w, t, { armL: out ? [.8 + out * .5, -.5 - out * .4] : undefined, armR: out ? [.8 + out * .5, .5 + out * .4] : undefined, look: t > 49 && t < 58.6 ? elder : t > 47 && t < 49 ? v(wp.x, 4.3, wp.z) : undefined }); }
  if (late && t < 82.2) { const w = nA2(t), head = t > 76.4 && t < 79.4; act(neighborA, w, t, { armL: head ? [2.75, .45] : undefined, armR: head ? [2.75, -.45] : undefined, look: t < 79.6 ? son : elder }); }
  if (t > 61.5 && t < 70.2) { const w = nB1(t), clasp = t > 64.0 && t < 66.8; act(neighborB, w, t, { stride: 1.2, armL: clasp ? [1.35, .45] : undefined, armR: clasp ? [1.35, -.45] : undefined, y: walkY(w) + (clasp ? Math.abs(Math.sin(t * 7)) * .08 : 0), look: t > 63.5 ? elder : undefined }); }
  if (t >= 82.2) { const w = nB2(t), heart = t > 89.6 && t < 92.4; act(neighborB, w, t, { armR: heart ? [1.0, .4] : [.4, -.25], armL: heart ? [1.0, -.1] : [.4, .25], look: t < 89.4 ? (t < 88 ? captain : v(-10, 4.4, 34.4)) : elder }); }
  // soldiers and the young men they take
  for (const [a, w] of [[captain, capt], [soldierB, solB], [soldierC, solC], [youths[0], yA], [youths[1], yB]]) {
    if (t < 82.2) { a.visible = false; continue; }
    const p = w(t), marching = p.stride > 0;
    const shake = a === captain && t > 86.2 && t < 87.1 ? Math.sin((t - 86.2) * 14) * .35 : 0;
    act(a, p, t, { stride: 1.1, armR: a === captain ? (t > 85.6 && t < 86.2 ? [1.45, .05] : t > 87.2 && t < 87.8 ? [2.2, .4] : undefined) : a.props.spear ? [.25 + (marching ? Math.sin(p.phase) * .1 : 0), .05] : undefined,
      headYaw: shake, headPitch: a.name.startsWith('youth') ? -.2 : 0, look: a === captain && t > 85.2 && t < 87.4 ? son : a.name.startsWith('youth') && t > 88.5 ? v(-4, 4, 37) : undefined, lookAmt: .6 });
  }
  const bn = stage.banner; bn.visible = t > 82.2; if (bn.visible) { soldierC.updateMatrixWorld(true); bn.position.copy(soldierC.localToWorld(v(.5, 0, -.1))); bn.position.y = soldierC.position.y; bn.rotation.y = soldierC.rotation.y + Math.PI / 2; bn.flag.rotation.y = Math.sin(t * 3) * .25; }
  for (const a of [dad, mom, mei, bo, grandpa, carpenter]) a.visible = false;
}

// ------------------------------------------------------------------ light, sky, weather
const LOOKS = {
  home: { sun: [14, 26, 18], sunColor: 0xfff0d8, sunI: 3.0, hemiSky: 0xdcecff, hemiGround: 0x7d7a52, hemiI: 1.9, top: 0x78acd8, horizon: 0xdcebee, glow: 0xfff2d0, fog: 0xcfe0e6, focus: [0, 3, 0], exposure: 1.05, hills: 0x9db1b4 },
  parable: { sun: [12, 24, -18], sunColor: 0xffdcaa, sunI: 3.1, hemiSky: 0xffe9c8, hemiGround: 0x8a7a50, hemiI: 1.8, top: 0x9abfd6, horizon: 0xf1dfba, glow: 0xffe2a8, fog: 0xe8dcc0, focus: [2, 3, 39], exposure: 1.05, hills: 0xc8b893 },
  workshop: { sun: [-22, 24, 14], sunColor: 0xffe2b8, sunI: 2.9, hemiSky: 0xdde9f7, hemiGround: 0x7d7a52, hemiI: 1.85, top: 0x7aaed6, horizon: 0xe8e4d6, glow: 0xffe9c4, fog: 0xd8dcd6, focus: [30, 3, -1], exposure: 1.05, hills: 0xa5b5ae },
  evening: { sun: [-30, 7, 5], sunColor: 0xff9850, sunI: 2.1, hemiSky: 0xa9b6dc, hemiGround: 0x5a4a38, hemiI: 1.4, top: 0x34477a, horizon: 0xf2a066, glow: 0xffb070, fog: 0xa0868a, focus: [0, 3, 0], exposure: 1.2, hills: 0x5d5670 },
};
function light(name, t) {
  const L = LOOKS[name], f = v(...L.focus);
  let sunDir = v(...L.sun).normalize(), sunI = L.sunI, top = new T.Color(L.top), horizon = new T.Color(L.horizon);
  if (name === 'evening') { const dusk = ease((t - 160) / 16); sunI *= 1 - dusk * .55; top.lerp(new T.Color(0x1d2a4f), dusk); horizon.lerp(new T.Color(0xc77a5a), dusk * .7); sunDir.y -= dusk * .12; sunDir.normalize(); }
  sun.position.copy(f).addScaledVector(sunDir, 70); sun.target.position.copy(f); sun.target.updateMatrixWorld();
  sun.color.setHex(L.sunColor); sun.intensity = sunI; hemi.color.setHex(L.hemiSky); hemi.groundColor.setHex(L.hemiGround); hemi.intensity = L.hemiI;
  sky.material.uniforms.top.value.copy(top); sky.material.uniforms.horizon.value.copy(horizon); sky.material.uniforms.glow.value.setHex(L.glow); sky.material.uniforms.sunDir.value.copy(sunDir);
  scene.fog.color.copy(horizon).lerp(new T.Color(L.fog), .5); scene.fog.near = name === 'parable' ? 45 : 60; scene.fog.far = name === 'parable' ? 190 : 240;
  renderer.toneMappingExposure = L.exposure;
  const evening = name === 'evening'; stage.glowMat.opacity = evening ? .9 : 0;
  lamps.forEach(l => { l.intensity = evening ? 9 : 0; l.distance = 12; });
  stage.setHills(L.hills, name === 'evening' ? ease((t - 160) / 16) : 0); stage.lanterns.forEach(l => { l.glass.material.emissiveIntensity = evening ? 2.2 : .15; });
  stage.clouds.position.x = t * .35;
}

// ------------------------------------------------------------------ shots
const tmpA = new T.Vector3();
const shots = [
  { at: 0, scene: 'home', name: 'Moving day', cam: move([17, 12.5, 27], [9.5, 6.6, 16], [-2, 5, -6], [.5, 4.4, -1], 40) },
  { at: 11.6, scene: 'home', name: 'Bo can’t wait', cam: move([3.3, 4.05, 11.6], [3.3, 3.95, 10.8], [3.3, 3.75, 7.9], [3.3, 3.7, 7.9], 34) },
  { at: 16.6, scene: 'home', name: 'Mei', cam: move([-.55, 4.45, 1.6], [-.8, 4.42, 1.05], [-1.85, 4.3, -1.75], [-1.85, 4.3, -1.75], 32) },
  { at: 20.2, scene: 'home', name: 'Mom tries', cam: move([-6.7, 5.0, 1.7], [-6.3, 4.9, 1.3], [-1.55, 4.4, -1.05], [-1.55, 4.4, -1.05], 36) },
  { at: 26.0, scene: 'home', name: 'The worst thing', cam: single(mei, mom, { angle: -.5, dist: 1.5, fov: 30 }) },
  { at: 28.9, scene: 'home', name: 'Grandpa', cam: move([-.7, 4.9, 5.6], [-.8, 4.75, 4.1], [-1.0, 4.6, -2.6], [-1.0, 4.5, -2.1], 38) },
  { at: 35.3, scene: 'home', name: 'Maybe not?', cam: single(mei, grandpa, { angle: .5, dist: 1.4, fov: 30 }) },
  { at: 37.8, scene: 'home', name: 'A story', cam: single(grandpa, mei, { angle: -.55, dist: 1.8, fov: 30, fov1: 25 }) },
  { at: 43.8, scene: 'parable', name: 'The horse runs', dissolve: 1.4, cam: (t, k) => { const w = white1(clamp(t, 43.8, 52)); return { pos: v(-2.5, 7.2, 27.5).lerp(v(-.5, 6.8, 28.8), k), look: v(3.5, 4, 39.5).lerp(v(w.x, 4.4, w.z), ease((t - 46.4) / 1.6)), fov: 40 }; } },
  { at: 51.2, scene: 'parable', name: 'Terrible luck', cam: single(neighborA, elder, { angle: .5, dist: 1.9, fov: 32 }) },
  { at: 54.6, scene: 'parable', name: 'Maybe', cam: single(elder, neighborA, { angle: -.5, dist: 1.7, fov: 30 }) },
  { at: 58.2, scene: 'parable', name: 'Three horses', cam: (t, k) => { const w = white2(t); return { pos: v(13, 10, 26).lerp(v(11, 8.5, 27.5), k), look: v(w.x, smoothGround(w.x, w.z) + 1.2, w.z), fov: 42 }; } },
  { at: 63.8, scene: 'parable', name: 'Wonderful luck', cam: single(neighborB, elder, { angle: -.5, dist: 1.9, fov: 32 }) },
  { at: 66.9, scene: 'parable', name: 'Maybe', cam: single(elder, neighborB, { angle: .5, dist: 1.7, fov: 30 }) },
  { at: 70.2, scene: 'parable', name: 'The wild horse', cam: (t, k) => ({ pos: v(11.5, 6.4, 33.2).lerp(v(10.6, 5.6, 34.4), k), look: headPos(son, tmpA).clone().lerp(v(5.8, 4.2, 42), .35), fov: 36 }) },
  { at: 75.8, scene: 'parable', name: 'Later', cam: move([-1.6, 5.3, 30.4], [-2.0, 5.1, 31.4], [-4.4, 4.1, 37.0], [-4.4, 4.1, 37.0], 38) },
  { at: 79.6, scene: 'parable', name: 'Bad luck?', cam: single(elder, neighborA, { angle: -.45, dist: 1.7, fov: 30 }) },
  { at: 82.2, scene: 'parable', name: 'Soldiers', cam: move([3.5, 6.8, 26.5], [1.5, 6.4, 27.5], [-1.5, 4.2, 35.5], [-3.5, 4.2, 35.5], 42) },
  { at: 85.2, scene: 'parable', name: 'Not him', cam: move([-1.5, 4.5, 36.5], [-1.75, 4.45, 36.65], [-4.3, 4.0, 36.4], [-4.3, 4.0, 36.4], 38) },
  { at: 88.0, scene: 'parable', name: 'They march on', cam: move([-1.5, 6.2, 27.5], [-2.5, 6.0, 28.0], [-7, 4.2, 34.8], [-10, 4.2, 34.8], 42) },
  { at: 89.4, scene: 'parable', name: 'Good luck', cam: single(neighborB, elder, { angle: .5, dist: 1.9, fov: 32 }) },
  { at: 92.8, scene: 'parable', name: 'We’ll see', cam: single(elder, neighborB, { angle: .55, dist: 1.9, fov: 30, fov1: 25 }) },
  { at: 97.5, scene: 'home', name: 'Good or bad?', dissolve: 1.2, cam: move([-1.15, 4.85, 1.6], [-1.15, 4.8, 1.2], [-1.2, 4.62, -1.95], [-1.2, 4.6, -1.95], 34) },
  { at: 102.7, scene: 'home', name: 'Not over yet', cam: single(grandpa, mei, { angle: -.55, dist: 1.6, fov: 30 }) },
  { at: 106.2, scene: 'home', name: 'The wheel', cam: move([-3.0, 5.1, 13.8], [-2.8, 5.0, 13.4], [2.9, 3.9, 5.8], [2.9, 3.8, 5.9], 38) },
  { at: 108.1, scene: 'home', name: 'Oh no', cam: front(dad, { dist: 1.45, side: .35, fov: 32 }) },
  { at: 109.9, scene: 'home', name: 'Everything’s ruined', cam: front(bo, { dist: 1.35, side: .3, up: -.16, fov: 34 }) },
  { at: 114.9, scene: 'home', name: 'Mei decides', cam: move([-1.0, 4.55, -.55], [-1.1, 4.54, -.75], [-1.9, 4.5, -1.75], [-1.9, 4.5, -1.75], 30) },
  { at: 116.2, scene: 'home', name: 'Big sister', cam: follow([-4.0, 5.0, 12.0], [-3.2, 4.6, 12.4], mei, [0, -.4, 0], 40) },
  { at: 119.6, scene: 'home', name: 'Remember the horse?', cam: single(mei, bo, { angle: .85, dist: 1.3, fov: 32 }) },
  { at: 122.7, scene: 'home', name: 'The one that ran away', cam: single(bo, mei, { angle: -.85, dist: 1.3, fov: 33 }) },
  { at: 124.6, scene: 'home', name: 'We’ll see', cam: single(mei, bo, { angle: .8, dist: 1.3, fov: 30, fov1: 26 }) },
  { at: 129.3, scene: 'home', name: 'We’ll see?', cam: single(bo, mei, { angle: -.8, dist: 1.25, fov: 32 }) },
  { at: 130.3, scene: 'home', name: 'Family', cam: move([.4, 4.4, 12.0], [.8, 4.6, 11.3], [3.4, 3.7, 7.6], [3.1, 3.9, 6.6], 38) },
  { at: 132.3, scene: 'workshop', name: 'The workshop', dissolve: 1.2, cam: (t, k) => ({ pos: v(19.5, 6.2, 13.5).lerp(v(22.5, 5.6, 10.0), k), look: headPos(dad, tmpA).clone().add(v(2, -.4, -1)), fov: 42 }) },
  { at: 137.2, scene: 'workshop', name: 'By tomorrow', cam: single(carpenter, dad, { angle: -.45, dist: 1.8, fov: 32 }) },
  { at: 142.3, scene: 'workshop', name: 'Every board', cam: single(dad, carpenter, { angle: .45, dist: 1.6, fov: 30 }) },
  { at: 144.0, scene: 'workshop', name: 'Stay', cam: move([36.6, 4.75, -3.7], [36.2, 4.7, -3.5], [31.8, 4.45, -2.3], [31.8, 4.45, -2.3], 38, 34) },
  { at: 147.2, scene: 'workshop', name: 'Dad thinks', cam: single(dad, carpenter, { angle: .45, dist: 1.5, fov: 30, fov1: 26 }) },
  { at: 150.0, scene: 'workshop', name: 'A handshake', cam: move([28.3, 4.6, .3], [28.7, 4.55, 0], [31.6, 4.25, -2.3], [31.6, 4.25, -2.3], 36) },
  { at: 152.9, scene: 'evening', name: 'That evening', dissolve: 1.2, cam: move([13, 7.8, 17], [11, 7, 15], [-2, 4.6, -3], [-1.5, 4.6, -2.5], 40) },
  { at: 157.4, scene: 'evening', name: 'We’ll stay', cam: single(dad, mei, { angle: .45, dist: 1.6, fov: 31 }) },
  { at: 159.3, scene: 'evening', name: 'Home', cam: move([1.9, 4.6, -.1], [1.6, 4.55, -.3], [-1.35, 4.25, -.35], [-1.35, 4.25, -.35], 38) },
  { at: 161.7, scene: 'evening', name: 'Is that good luck?', cam: single(bo, mei, { angle: -.55, dist: 1.3, fov: 32 }) },
  { at: 163.4, scene: 'evening', name: 'We’ll see', cam: single(mei, bo, { angle: .55, dist: 1.25, fov: 30 }) },
  { at: 165.0, scene: 'evening', name: 'Grandpa', cam: front(grandpa, { dist: 2.4, side: -.35, up: -.18, fov: 26 }) },
  { at: 166.4, scene: 'evening', name: 'Give the story time', cam: (t, k) => { const e2 = ease(k); return { pos: v(-.6, 4.8, 3.4).lerp(v(15, 15, 28), e2), look: v(-1.2, 4.4, -1.8).lerp(v(-2, 5.5, -5), e2), fov: lerp(36, 44, e2) }; } },
];
const directors = { home: t => (t < 70 ? directMorning(t) : directAfternoon(t)), parable: directParable, workshop: directWorkshop, evening: directEvening };
const grade = name => name === 'parable' ? 'sepia(.3) saturate(.92) contrast(1.05) brightness(1.03)' : name === 'evening' ? 'saturate(1.08) contrast(1.04)' : 'saturate(1.04) contrast(1.02)';

// ------------------------------------------------------------------ sound & mount
const footsteps = [[dadA, 0, 43.8, 1], [momA, 0, 43.8, .8], [gpA, 28, 43.8, .75], [boA, 0, 43.8, .55], [boB, 97.5, 132.3, .55], [dadB, 97.5, 132.3, 1], [momB, 97.5, 132.3, .8], [meiB, 97.5, 132.3, .7], [dadW, 132.3, 152.9, 1], [carpW, 132.3, 152.9, 1],
  [son1, 43.8, 72, 1], [nA1, 43.8, 64.2, 1], [nA2, 75.8, 82.2, 1], [nB1, 61.5, 70.2, .9], [capt, 82.2, 97.5, 1.1], [solB, 82.2, 97.5, 1.1], [solC, 82.2, 97.5, 1.1], [yA, 82.2, 97.5, .9], [yB, 82.2, 97.5, .9], [elder1, 43.8, 75.8, .8]];
const hoofs = [[white1, 43.8, 52.6], [white2, 58.2, 66], [black2, 58.6, 66], [red2, 59, 66]];
await D.mount({
  shots, directors, light, grade, wavBase64,
  reset() {
    for (const h of [whiteHorse, blackHorse, redHorse]) h.mesh.visible = false;
    carry.wheel.visible = carry.crate.visible = carry.sack.visible = carry.cloth.visible = false;
    for (const f of fireflies) f.visible = false; stage.banner.visible = false;
  },
  soundtrack: () => buildSoundtrack(story, { BASE, footsteps, hoofs, groundAt }),
});
