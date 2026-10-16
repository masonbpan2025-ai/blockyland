// 守株待兔 · Waiting by the Stump — Claude. Direction: cast, blocking, seasons, light and the shot list.
// The shared director (claudeDirector.js) supplies acting helpers, cameras, compositing and playback.
import * as T from 'three';
import { createRabbitModel, poseRabbitHop } from '../rabbitBehavior.js';
import { STUMP_STORY as story } from './stumpStory.js';
import { buildFarm, STUMP, STUMP_TOP } from './stumpSets.js';
import { texBox, applyLook } from './claudeStage.js';
import { makeActor, box, clamp, ease, lerp, facing } from './claudeActors.js';
import { createDirector, v, at, arc, S, N, E, Wd } from './claudeDirector.js';
import { buildStumpSoundtrack } from './stumpScore.js';
import { wavBase64 } from './claudeSound.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const stage = await buildFarm();
const { scene, M, crops, setWheat, setWeed, groundAt } = stage;

// ------------------------------------------------------------------ cast
const farmer = makeActor({ name: 'farmer', scale: 1, skin: '#d9a982', hair: '#2a211c', shirt: '#7d8f5a', pants: '#5b4a3a', sleeve: 7, belt: '#3e3022', face: { style: 'elder', hatShadow: '#7a6438', eyes: '#3b2617' },
  extras: a => { for (const [w, y] of [[1.0, .52], [.76, .58], [.5, .64], [.26, .7]]) texBox(a.head, [w, .06, w], [0, y, 0], M.hay); } });
const li = makeActor({ name: 'li', scale: .9, skin: '#e8bf9b', hair: '#bdb6aa', shirt: '#5f7698', pants: '#4f4a46', skirt: '#4f4a46', apron: '#e6dcc4', hairLen: 5, face: { style: 'bun', lashes: true, wrinkles: true, eyes: '#3b2617', lip: '#b07060', brows: '#9a948a' },
  extras: a => { box(a.head, [.3, .24, .2], [0, .36, .33], 0xbdb6aa); box(a.head, [.05, .05, .36], [.11, .44, .33], 0x6b4a2c); } });
const hu = makeActor({ name: 'hu', scale: .58, skin: '#f2caa8', hair: '#231b18', shirt: '#c9503f', pants: '#4f6c78', sleeve: 5, face: { style: 'short', child: true, eyes: '#3b2617' } });
const cast = [farmer, li, hu];
const D = await createDirector({ story, stage, cast, audioDir: 'cinema-stump', voiceScript: 'node scripts/narrate-claude.mjs stump-claude' });
const { act, hold, headPos, walkY, smoothGround } = D, { move, single, front, follow } = D.cams;

const rabbitTex = await new T.TextureLoader().loadAsync(`${BASE}assets/entity/rabbit/brown.png`); rabbitTex.magFilter = rabbitTex.minFilter = T.NearestFilter; rabbitTex.colorSpace = T.SRGBColorSpace;
const bunny = () => { const r = createRabbitModel(new T.MeshLambertMaterial({ map: rabbitTex }), new T.MeshLambertMaterial({ color: 0xf2dbb4 }), new T.MeshLambertMaterial({ color: 0x241d19 })); r.group.scale.setScalar(1.6); r.group.traverse(o => { if (o.isMesh) o.castShadow = o.receiveShadow = true; }); scene.add(r.group); return r; };
const rabbit = bunny(), rabbit2 = bunny();

// props
const hoe = stage.makeHoe(); const sickle = stage.makeSickle(); li.rightArm.add(sickle); sickle.position.set(0, -.74, -.08); sickle.rotation.x = -1.2;
const can = stage.makeCan(); hu.rightArm.add(can); can.position.set(0, -.86, -.02);
const seeds = stage.makeSack(); scene.add(seeds);
const myBasket = stage.basket([-3.5, 3, -9.75]), emptyBasket = stage.basket([0, 0, 0]), liBasket = stage.basket([9.6, 3, 4.1], true), huBundle = stage.bundle();
const bundles = [0, 1, 2, 3].map(() => stage.bundle());

// ------------------------------------------------------------------ expressions
const X = D.expressions;
X('farmer', [[0, 'determined'], [11.8, 'calm'], [16.8, 'warm'], [21.3, 'happy'], [23.6, 'determined'], [28.75, 'surprised'], [31.6, 'curious'], [32.9, 'shock'], [34.6, 'excited'], [36.6, 'greedy'], [39.5, 'happy'],
  [41.0, 'thinking'], [44.0, 'knowing'], [46.8, 'greedy'], [48.2, 'proud'], [53.0, 'calm'],
  [58.6, 'proud'], [63.5, 'knowing'], [66.4, 'bored'], [70.65, 'sleepy'], [74.9, 'bored'], [79.2, 'sleepy'], [81.3, 'surprised'], [82.4, 'sad'],
  [83.4, 'sad'], [92.0, 'sheepish'], [94.4, 'sad'], [97.2, 'worried'], [99.6, 'hopeful'], [104.2, 'determined'], [106.4, 'warm'], [110, 'determined'], [116, 'proud']]);
X('li', [[0, 'calm'], [16.6, 'happy'], [21.4, 'joy'], [24, 'calm'], [52.5, 'calm'], [55.2, 'knowing'], [57.4, 'worried'], [59.8, 'stern'], [63.5, 'worried'], [66.4, 'calm'], [83.4, 'warm'], [96.6, 'warm'], [97.0, 'warm'], [101, 'happy'], [110, 'happy']]);
X('hu', [[0, 'excited'], [16.8, 'happy'], [52.5, 'curious'], [55.3, 'surprised'], [57.0, 'curious'], [57.7, 'excited'], [66.4, 'happy'], [83.4, 'happy'], [91.0, 'curious'], [94.6, 'sad'], [100, 'happy'], [110, 'happy']]);

// ------------------------------------------------------------------ blocking
// farmer
const fA = at([[0, -8.6, -1.5, E], [16.6, -6.2, -1.5], [24.0, -6.2, -1.5], [28.6, -5.6, -1.5]], { stride: .9 });
const fB = at([[28.8, -5.6, -1.5], [29.3, -5.6, -1.5], [31.3, -3.85, -8.9], [31.45, -3.85, -8.9, N], [39.5, -3.85, -8.9], [40.3, -4.5, -8.45], [40.35, -4.5, -8.45, S]]);
const fH = at([[83.4, -.9, -2.6, E], [90.9, -.9, -2.6], [91.4, -.9, -2.6, facing(1, -.4)], [96.4, -.9, -2.6], [96.8, -.9, -2.6, facing(1, .5)], [108.1, -.9, -2.6], [109.4, -5.15, -1.45], [109.5, -5.15, -1.45, facing(-.5, .8)]]);
const fS = at([[110, -5.3, -1.55, Wd], [124, -8.7, -1.55]], { stride: .9 });
// Auntie Li
const lA = at([[0, 7.6, -2.0, Wd], [13.6, 6.8, -2.0], [14.6, 6.8, -2.0], [16.5, 2.4, -2.0], [16.7, 2.4, -2.0, Wd], [25.6, 2.4, -2.0], [27.6, 6.6, -2.0], [27.8, 6.6, -2.0, Wd]]);
const lH = at([[83.4, 3.6, -1.0, E], [94.0, 8.0, -1.0], [94.4, 8.0, -1.0], [95.4, 2.4, -1.5], [96.6, .5, -1.85], [96.8, .5, -1.85, facing(-1, -.6)], [110, .5, -1.85], [110.6, 1.6, -1.5], [113.6, 8.5, -1.4], [116.2, 14.6, -3.9]]);
// Hu
const hA = at([[0, 4.2, 1.2, N], [4, 4.2, 1.2], [5.5, 5.6, 2.3], [7.5, 4.0, 2.8], [9.2, 3.4, 1.0], [10, 3.4, 1.0, Wd], [15.6, 3.4, 1.0], [16.6, 2.5, -1.2], [16.8, 2.5, -1.2, Wd]], { stride: .55 });
const hH = at([[83.4, 5.0, 2.6, E], [86.2, 9.0, 3.6], [87.2, 9.0, 3.6], [88.8, 5.6, .4], [89.4, 5.6, .4], [90.6, 2.4, -1.5], [91.5, .35, -3.0], [91.7, .35, -3.0, facing(-1, .35)], [110, .35, -3.0], [110.7, 1.6, -1.6], [113.2, 8.0, -.8], [115.6, 14.0, -3.4]], { stride: .55 });
// rabbits
const runR = at([[0, -1.2, -15.5], [25.2, -1.2, -15.5], [25.9, -1.6, -13.4], [26.6, -2.7, -12.4], [27.3, -2.6, -11.2], [28.0, -3.5, -10.6], [28.7, -4.05, -9.85]], { stride: .5, speedUp: .05 });
const runR2 = at([[79.4, -.8, -14.4], [80.4, -2.4, -11.4], [80.6, -2.4, -11.4, facing(-1.8, 2.3)], [81.55, -2.4, -11.4], [81.75, -2.4, -11.4, facing(1.6, -3)], [82.8, -.6, -14.6]], { stride: .5, speedUp: .1 });

// ------------------------------------------------------------------ seasons: the montage clock
const DAY0 = 66.4, DAYLEN = 4.25;
const dayOf = t => clamp((t - DAY0) / DAYLEN, 0, 3.999);
const nightness = t => { if (t < DAY0 || t > DAY0 + 4 * DAYLEN) return 0; const f = dayOf(t) % 1; return Math.max(0, 1 - Math.min(f, 1 - f) / .16) * (dayOf(t) > .5 ? 1 : 0); };
function growth(t) { // 0 at sowing → 1 by harvest
  if (t < 52.5) return 0; if (t < DAY0) return .12; if (t < DAY0 + 17) return lerp(.15, 1, (t - DAY0) / 17); return 1;
}
function fields(t) {
  const g = growth(t), harvestX = t < 84 ? -99 : 3 + (t - 84) * .42;
  for (const c of crops.li) {
    const cut = c.x < harvestX;
    setWheat(c, cut ? 0 : 1 + g * 6 + c.seed * .4, cut ? .35 : .55 + g * .55 + c.seed * .08);
  }
  const clearX = t < 110 ? 99 : -5.0 - (t - 110) * .25; // weeds hoed out behind him at sunset
  for (const c of crops.mine) {
    setWheat(c, 1 + Math.min(g, .25) * 4, t < 52.5 ? .55 : .55 - g * .25 + c.seed * .1);
    const cleared = t >= 110 && Math.abs(c.z + 1.5) < 1.6 && c.x > clearX;
    setWeed(c, t < 52.5 ? 0 : cleared ? 0 : Math.min(1, g * 1.15 + c.seed * .15) * (t < DAY0 ? .4 : 1));
  }
}

// ------------------------------------------------------------------ direction
function holdHoe(a, armX, mode) { // 'work': the handle continues the arms to the blade; 'staff': upright in the hand
  if (hoe.parent !== a.rightArm) a.rightArm.add(hoe);
  if (mode === 'work') { hoe.position.set(0, -1.08, -.02); hoe.rotation.set(0, 0, Math.PI); }
  else { hoe.position.set(0, -.66, -.02); hoe.rotation.set(-armX, 0, 0); }
}
function dropHoe(p, rot) { if (hoe.parent !== scene) scene.add(hoe); hoe.position.copy(p); hoe.rotation.set(...rot); }
const hoeRest = v(-5.45, 3.04, -.95); // dropped in the field when he runs for the rabbit; it lies there all season
let strikeTimes = [];

function directFarm(t) {
  fields(t);
  const night = nightness(t);
  rabbit.group.visible = t > 25 && t < 40.1; rabbit2.group.visible = t > 79.3 && t < 82.9;
  myBasket.visible = t > 40 && t < 83.4;
  stage.stars.visible = t > 28.75 && t < 30.6;
  emptyBasket.visible = t >= 83.4 && t < 110; liBasket.visible = t >= 83.4; liBasket.grain.visible = t > 88;
  seeds.visible = t > 99.4 && t < 110; huBundle.visible = false;
  bundles.forEach((b, i) => { b.visible = t > 86 + i * .9 && t < 110; b.position.set(9.0 + (i % 2) * .3, 3.0, 3.6 + Math.floor(i / 2) * .3); b.rotation.z = (i - 1.5) * .12; });
  can.visible = t < 52.5 || (t > DAY0 && t < DAY0 + 4.25);
  sickle.visible = t >= 83.4 && t < 94.2;

  // ---- the farmer
  if (t < 28.8) {
    const w = fA(t), working = t < 16.6 || t > 24, s = t * 2 * Math.PI / 1.25, swing = working ? Math.sin(s) : 0, wipe = t > 12.6 && t < 13.7 ? Math.sin((t - 12.6) / 1.1 * Math.PI) : 0;
    const rub = t > 21.3 && t < 23.5 ? Math.sin((t - 21.3) * 4) * .15 : 0;
    act(farmer, w, t, { stride: .6, lean: working ? .28 + swing * .16 - wipe * .2 : rub ? -.12 : 0, armR: working ? [1.3 + swing * .8, -.08] : [.5, -.05], armL: wipe ? [2.5 * wipe + .4, .35] : working ? [1.3 + swing * .8, .1] : rub ? [-.6, .25 + rub] : [.4, .05],
      look: t > 16.6 && t < 24 ? li : undefined });
    holdHoe(farmer, 0, working ? 'work' : 'staff'); if (!working) hoe.rotation.set(-.5, 0, 0);
  } else if (t < 40.4) {
    const w = fB(t), kneel = t > 31.4 && t < 33.2 ? ease((t - 31.4) / .4) * (1 - ease((t - 32.8) / .4)) : 0, reach = t > 31.8 && t < 32.9 ? Math.sin((t - 31.8) / 1.1 * Math.PI) : 0;
    const joy = t > 36.6 && t < 39.3 ? Math.abs(Math.sin((t - 36.6) * 5.2)) : 0, holdUp = t > 33.0 && t < 39.5;
    act(farmer, w, t, { stride: 1.2, kneel, lean: reach * .55 + kneel * .1, y: walkY(w) + joy * .2, armR: holdUp ? [1.65 + joy * .6, -.12] : reach ? [.9, -.1] : t < 29.3 ? [.6, -.05] : undefined, armL: holdUp ? [1.65 + joy * .6, .12] : reach ? [.9, .1] : undefined,
      look: t < 29.4 ? v(-4.2, 3.3, -9.8) : t < 31.6 ? v(-4.05, 3.2, -9.85) : t < 36.6 ? v(-3.85, 5.1, -9.5) : undefined, lookAmt: t > 33 && t < 36.6 ? .5 : 1 });
    if (t < 29.25) holdHoe(farmer, .6, 'staff');
    else { const k = clamp((t - 29.25) / .45); dropHoe(arc(v(-5.45, 4.0, -1.35), hoeRest, ease(k), .15), [k * Math.PI / 2, 0, -.5 * k]); }
  } else if (t < 52.5 || (t >= 52.5 && t < 58.6)) {
    const sitK = clamp((t - 40.35) / .6), relaxed = t > 47.0;
    const ponder = t > 41 && t < 44 ? 1 : 0;
    act(farmer, { x: -4.5, z: lerp(-8.45, -9.15, ease(sitK)), yaw: S, phase: 0, stride: 0 }, t, { sit: sitK, seat: STUMP_TOP, sitLegs: 1.15, lean: ponder ? .35 : relaxed ? -.12 : .05,
      armR: relaxed ? [2.85, -.55] : ponder ? [1.25, -.32] : [.55, -.05], armL: relaxed ? [2.85, .55] : ponder ? [1.25, .32] : [.55, .05],
      headPitch: ponder ? .15 : 0, headRoll: relaxed ? Math.sin(t * 2.2) * .06 : 0, look: t > 52.6 ? v(2.2, 4.4, -6.2) : undefined, lookAmt: .35 });
    dropHoe(hoeRest, [Math.PI / 2, 0, -.5]);
  } else if (t < DAY0) { // a few days later: lounging against the stump
    const wave = t > 63.6 && t < 65.4 ? Math.sin((t - 63.6) * 7) * .3 : 0;
    act(farmer, { x: -4.5, z: -8.55, yaw: S, phase: 0, stride: 0 }, t, { sit: 1, seat: 3.0, sitLegs: 1.5, lean: -.5, armL: [2.85, .55], armR: t > 63.4 && t < 65.6 ? [1.5 + wave, -.35] : [2.85, -.55], look: t > 59.8 && t < 66 ? li : undefined, lookAmt: .6 });
    dropHoe(hoeRest, [Math.PI / 2, 0, -.5]);
  } else if (t < 83.4) { // the season passes: a new pose each day
    const d = Math.floor(dayOf(t)); dropHoe(hoeRest, [Math.PI / 2, 0, -.5]);
    if (d === 0) act(farmer, { x: -4.5, z: -9.15, yaw: S, phase: 0, stride: 0 }, t, { sit: 1, seat: STUMP_TOP, sitLegs: 1.15, lean: .4, armL: [1.25, .32], armR: [1.25, -.32], headPitch: .25 });
    else if (d === 1) act(farmer, { x: -4.5, z: -8.55, yaw: S, phase: 0, stride: 0 }, t, { sit: 1, seat: 3.0, sitLegs: 1.5, lean: -.55, armL: [.3, .2], armR: [.3, -.2], headRoll: .25 });
    else if (d === 2) act(farmer, { x: -4.2, z: -10.6, yaw: N, phase: 0, stride: 0 }, t, { armR: [2.7, -.2], armL: [.3, .05], headPitch: .05 });
    else {
      const jump = t > 81.4 && t < 82.4 ? Math.sin((t - 81.4) / 1 * Math.PI) : 0, up = clamp((t - 81.35) / .3);
      const w = t < 81.5 ? { x: -4.5, z: -9.15, yaw: S, phase: 0, stride: 0 } : at([[81.5, -4.5, -9.6], [82.3, -4.1, -10.9], [82.5, -4.1, -10.9, N]])(t);
      act(farmer, w, t, { sit: 1 - up, seat: STUMP_TOP, sitLegs: 1.15, y: walkY(w) + jump * .3, lean: t > 82.5 ? .25 : 0, armL: t > 81.5 && t < 82.5 ? [1.7, .25] : t > 82.5 ? [.15, .02] : [.6, .1], armR: t > 81.5 && t < 82.5 ? [1.7, -.25] : t > 82.5 ? [.15, -.02] : [.6, -.1],
        headPitch: t > 82.5 ? -.3 : 0, headRoll: t < 81.3 ? .2 : 0, look: t > 81.3 && t < 82.6 ? rabbit2.group : undefined });
    }
  } else if (t < 110) { // harvest: an empty basket among the weeds
    const w = fH(t), holdB = t < 99.0, pick = t > 109.4 && t < 110 ? Math.sin((t - 109.4) / .6 * Math.PI) : 0;
    act(farmer, w, t, { armL: holdB ? [.95, .25] : t > 99.6 && t < 108.2 ? [.85, .12] : undefined, armR: holdB ? [.95, -.25] : t > 99.7 ? undefined : [.4, -.05], lean: pick * .6 + (t > 94.4 && t < 97 ? .12 : 0),
      headPitch: t > 94.4 && t < 96.4 ? -.08 : 0, look: t < 90.8 ? v(8, 4.2, -1) : t < 96.6 ? hu : t < 108.2 ? li : hoeRest, lookAmt: t > 108.2 ? .6 : t > 90.8 && t < 96.6 ? .55 : 1 });
    if (holdB) emptyBasket.position.copy(hold(farmer, .42, .5)); else emptyBasket.position.set(-1.25, 3, -1.95);
    if (t < 109.7) dropHoe(hoeRest, [Math.PI / 2, 0, -.5]); else holdHoe(farmer, .5, 'staff');
  } else { // sunset: hoeing out the weeds
    const w = fS(t), s = t * 2 * Math.PI / 1.25, swing = Math.sin(s);
    act(farmer, w, t, { stride: .6, lean: .28 + swing * .16, armR: [1.3 + swing * .8, -.08], armL: [1.3 + swing * .8, .1] });
    holdHoe(farmer, 0, 'work');
  }

  // ---- Auntie Li
  if (t < 52.5) {
    const w = lA(t), bending = t < 13.6 || t > 27.8, plantS = Math.sin(t * 2.4), wave = t > 16.7 && t < 19.2 ? Math.sin((t - 16.7) * 9) * .35 : 0, laugh = t > 21.4 && t < 23.6 ? Math.abs(Math.sin(t * 8)) : 0;
    act(li, w, t, { lean: bending ? .55 + plantS * .08 : laugh * .15, armR: bending ? [.7 + plantS * .3, -.1] : wave ? [2.6 + wave, -.35] : undefined, armL: bending ? [.7 - plantS * .3, .1] : laugh ? [.9, .45] : undefined, look: t > 16.4 && t < 25.6 ? farmer : undefined });
  } else if (t < 58.6) {
    const shake = t > 57.6 && t < 58.5 ? Math.sin((t - 57.6) * 14) * .3 : 0;
    act(li, { x: 2.3, z: -6.4, yaw: Wd, phase: 0, stride: 0 }, t, { armL: [.8, .35], armR: [.8, -.35], headYaw: shake, look: t > 54.9 && t < 57.6 ? hu : farmer, lookAmt: t > 54.9 && t < 57.6 ? .8 : 1 });
  } else if (t < DAY0) {
    const call = t > 59.7 && t < 63.1;
    act(li, { x: 2.3, z: -3.0, yaw: facing(-1, -.6), phase: 0, stride: 0 }, t, { armL: call ? [2.1, -.35] : [.4, .1], armR: call ? [2.1, .35] : [.4, -.1], lean: call ? -.08 : 0, look: farmer });
  } else if (t < 83.4) {
    const d = Math.floor(dayOf(t)), spots = [[7, -4, Wd], [9, 0, N], [5, 2, S], [10, -3, Wd]], [x, z, yaw] = spots[d], work = Math.sin(t * 2.4);
    act(li, { x, z, yaw, phase: 0, stride: 0 }, t, { lean: d === 3 ? 0 : .5 + work * .08, armR: d === 3 ? [.4, -.05] : [.8 + work * .3, -.1], armL: d === 3 ? [.4, .05] : [.8 - work * .3, .1], look: d === 3 ? v(8, 3.8, -1) : undefined, lookAmt: .5 });
  } else {
    const w = lH(t), cutting = t < 94 && w.stride === 0 || (t < 94 && t > 83.4), swingS = Math.sin(t * 7), give = t > 99.4 && t < 100.6 ? Math.sin((t - 99.4) / 1.2 * Math.PI) : 0;
    act(li, w, t, { lean: cutting ? .5 + swingS * .06 : give * .2, armR: cutting ? [.9 + swingS * .55, -.15] : give ? [1.2, -.12] : t > 110 ? [.9, -.1] : undefined, armL: cutting ? [.7, .15] : t > 110 ? [.9, .1] : undefined,
      look: t > 96.4 && t < 110 ? farmer : undefined });
  }
  if (t > 99.4 && t < 110) { const from = hold(li, .55, .95), to = hold(farmer, .5, .9, .2), k = ease((t - 99.6) / .7); seeds.position.copy(arc(from, to, clamp(k), .1)); }
  if (t >= 110) { liBasket.position.copy(hold(li, .45, .5)); }

  // ---- Hu
  if (t < 52.5) {
    const w = hA(t), hop = t > 16.8 && t < 20 ? Math.abs(Math.sin(t * 6)) * .1 : 0, pour = w.stride === 0 && t < 16.6;
    act(hu, w, t, { stride: 1.2, y: walkY(w) + hop, armR: pour ? [1.1, -.05] : t > 16.8 && t < 20 ? [2.7, -.3] : undefined, look: t > 16.6 && t < 25 ? farmer : undefined });
  } else if (t < DAY0) {
    if (t < 58.6) act(hu, { x: 2.25, z: -5.7, yaw: Wd, phase: 0, stride: 0 }, t, { armL: [1.0, .2], armR: [1.0, -.2], y: 3 + (t > 57 && t < 57.6 ? .08 : 0), look: t > 52.9 && t < 54.8 ? li : farmer });
    else act(hu, { x: 2.4, z: -2.2, yaw: facing(-1, -.7), phase: 0, stride: 0 }, t, { look: farmer });
  } else if (t < 83.4) {
    const d = Math.floor(dayOf(t)), path = [[[6, -3.4], [8.2, -3.4]], [[10.5, 1], [7.5, 2.5]], [[4.2, 0], [6.4, -1.5]], [[11, -1.6], [11, -1.6]]][d], k = (dayOf(t) % 1);
    const a = path[0], b = path[1], x = lerp(a[0], b[0], k), z = lerp(a[1], b[1], k), moving = a[0] !== b[0] || a[1] !== b[1];
    act(hu, { x, z, yaw: moving ? facing(b[0] - a[0], b[1] - a[1]) : Wd, phase: k * 18, stride: moving ? .62 : 0 }, t, { stride: 1.2 });
  } else {
    const w = hH(t), carry = t > 86.2 && t < 89.4;
    act(hu, w, t, { stride: 1.2, armL: carry ? [1.2, .2] : t > 110 ? [1.2, .2] : undefined, armR: carry ? [1.2, -.2] : undefined, look: t > 91.6 && t < 110 ? (t < 96.6 || t > 103 ? farmer : li) : undefined });
    huBundle.visible = carry || t > 110; if (huBundle.visible) { huBundle.position.copy(hold(hu, .3, .55)); huBundle.rotation.z = Math.PI / 2.4; }
  }
  // hide the harvest props before autumn
  if (t < 83.4) liBasket.visible = false;

  // ---- rabbits
  if (rabbit.group.visible) {
    if (t < 28.7) { const w = runR(t), airborne = w.stride > 0 && Math.sin(w.phase) > .2; rabbit.group.position.set(w.x, smoothGround(w.x, w.z) + (w.stride ? Math.abs(Math.sin(w.phase)) * .32 : 0), w.z); rabbit.group.rotation.set(0, w.yaw + Math.PI, 0); poseRabbitHop(rabbit, w.phase, airborne); }
    else if (t < 32.2) { // bonk: recoil, flop onto its side, lie still
      const k = ease((t - 28.7) / .45), p = v(-4.05, 3, -9.85).lerp(v(-3.95, 3, -10.15), k);
      rabbit.group.position.set(p.x, 3 + Math.sin(clamp((t - 28.7) / .45) * Math.PI) * .18, p.z); rabbit.group.rotation.set(0, Math.PI * .85, k * Math.PI / 2); poseRabbitHop(rabbit, 0, false);
    } else { // in the farmer's hands, then in the basket
      const hp = t < 40.0 ? hold(farmer, .62, 1.45 + (t > 36.6 && t < 39.3 ? .25 : 0)) : v(-3.5, 3.45, -9.75);
      rabbit.group.position.copy(hp); rabbit.group.rotation.set(0, farmer.rotation.y, Math.PI / 2); poseRabbitHop(rabbit, 0, false);
    }
    rabbit.ears?.forEach?.(e => { e.rotation.z = 0; });
  }
  if (stage.stars.visible) stage.stars.children.forEach((s, i) => { const a = t * 6 + i / 5 * Math.PI * 2; s.position.set(-3.95 + Math.cos(a) * .28, 3.55 + Math.sin(t * 9 + i) * .03, -10.15 + Math.sin(a) * .28); s.rotation.set(t * 4, t * 3, 0); });
  if (rabbit2.group.visible) { const w = runR2(t); rabbit2.group.position.set(w.x, smoothGround(w.x, w.z) + (w.stride ? Math.abs(Math.sin(w.phase)) * .3 : 0), w.z); rabbit2.group.rotation.set(0, w.yaw + Math.PI, 0); poseRabbitHop(rabbit2, w.phase, w.stride > 0 && Math.sin(w.phase) > .2); if (rabbit2.head) rabbit2.head.rotation.y = t > 80.6 && t < 81.5 ? Math.sin(t * 3) * .3 : 0; }

  // fireflies on montage nights and at dusk
  stage.fireflies.forEach((f, i) => { const k = t * (.3 + (i % 5) * .05) + i * 1.7; f.visible = night > .3 || t > 118; f.position.set(-10 + (i * 7.3) % 22 + Math.sin(k) * 1.2, 3.5 + (i % 4) * .4 + Math.sin(k * 1.7) * .3, -9 + (i * 3.1) % 12 + Math.cos(k * .8)); });
}

// ------------------------------------------------------------------ light
const LOOKS = {
  spring: { sun: [10, 18, 22], sunColor: 0xfff0d6, sunI: 3.0, hemiSky: 0xdcecff, hemiGround: 0x7d7a52, hemiI: 1.9, top: 0x78acd8, horizon: 0xe0ecea, glow: 0xfff2d0, fog: 0xd2e2e2, focus: [-1, 3, -4], exposure: 1.05, hills: 0x9db1b4 },
  days: { sun: [6, 26, 14], sunColor: 0xfff4e0, sunI: 3.1, hemiSky: 0xdcecff, hemiGround: 0x7d7a52, hemiI: 1.9, top: 0x6fa6d6, horizon: 0xdcebee, glow: 0xfff2d0, fog: 0xcfe0e6, focus: [-1, 3, -4], exposure: 1.05, hills: 0x9db1b4 },
  autumn: { sun: [-16, 14, 18], sunColor: 0xffcf8f, sunI: 3.0, hemiSky: 0xffe8c8, hemiGround: 0x86704a, hemiI: 1.8, top: 0x8fb3d1, horizon: 0xf2d5a8, glow: 0xffd9a0, fog: 0xe6d4b4, focus: [0, 3, -3], exposure: 1.06, hills: 0xb3a88a },
  sunset: { sun: [-30, 6, 8], sunColor: 0xff9850, sunI: 2.2, hemiSky: 0xa9b6dc, hemiGround: 0x5a4a38, hemiI: 1.45, top: 0x34477a, horizon: 0xf2a066, glow: 0xffb070, fog: 0xa0868a, focus: [-3, 3, -4], exposure: 1.2, hills: 0x5d5670 },
};
function light(name, t) {
  stage.clouds.position.x = t * .35;
  if (name !== 'montage') {
    const dusk = name === 'sunset' ? ease((t - 116) / 10) : 0;
    applyLook(stage, LOOKS[name], { dusk, sunI: LOOKS[name].sunI * (1 - dusk * .5), top: new T.Color(LOOKS[name].top).lerp(new T.Color(0x1d2a4f), dusk) });
    return;
  }
  // time-lapse: the sun sweeps east → west each day, nights dip blue
  const f = dayOf(t) % 1, ang = lerp(-1.25, 1.25, f), night = nightness(t);
  const L = LOOKS.days, dir = new T.Vector3(-Math.sin(ang) * 20, Math.cos(ang) * 24 + 3, 14).normalize();
  const top = new T.Color(L.top).lerp(new T.Color(0x1a2648), night), horizon = new T.Color(L.horizon).lerp(new T.Color(0x3a4a6a), night);
  applyLook(stage, { ...L, sunColor: night > .5 ? 0x9fb4ff : f < .2 || f > .8 ? 0xffc890 : L.sunColor, hemiI: lerp(1.9, .75, night) }, { sunDir: dir, sunI: lerp(3.1, .45, night), top, horizon, dusk: night * .8 });
}

// ------------------------------------------------------------------ shots
const shots = [
  { at: 0, scene: 'spring', name: 'Sunrise over the fields', cam: move([14, 13, 22], [6, 7.2, 14], [-2, 3.8, -6], [-3, 3.6, -3], 42) },
  { at: 11.8, scene: 'spring', name: 'Hard work', cam: follow([-4.6, 4.5, 2.2], [-4.4, 4.4, 1.6], farmer, [0, -.45, 0], 34) },
  { at: 16.6, scene: 'spring', name: 'Morning, neighbor!', cam: move([-.6, 4.5, .4], [-.4, 4.45, .1], [2.45, 4.0, -1.55], [2.45, 4.0, -1.55], 34) },
  { at: 21.1, scene: 'spring', name: 'A crooked back', cam: single(farmer, li, { angle: -.32, dist: 2.1, fov: 32 }) },
  { at: 23.9, scene: 'spring', name: 'Out of the woods', cam: move([-1.0, 3.75, -5.4], [-1.6, 3.65, -6.0], [-2.4, 3.4, -12.6], [-3.9, 3.35, -10.2], 34) },
  { at: 27.7, scene: 'spring', name: 'The stump', cam: move([-2.4, 3.45, -8.0], [-2.55, 3.42, -8.15], [-4.3, 3.3, -9.7], [-4.2, 3.3, -9.8], 34) },
  { at: 30.0, scene: 'spring', name: 'What luck', cam: move([-1.5, 4.2, -6.4], [-1.9, 4.1, -6.9], [-3.9, 3.6, -9.3], [-3.9, 3.7, -9.3], 38) },
  { at: 32.8, scene: 'spring', name: 'Whoa!', cam: front(farmer, { dist: 2.2, side: .4, up: -.25, fov: 36 }) },
  { at: 36.4, scene: 'spring', name: 'Rabbit stew', cam: move([-2.0, 4.4, -12.6], [-2.3, 4.3, -12.1], [-3.9, 4.1, -8.9], [-3.9, 4.1, -8.9], 40) },
  { at: 39.4, scene: 'spring', name: 'An idea', cam: move([-4.1, 4.3, -5.4], [-4.2, 4.2, -5.8], [-4.4, 4.1, -9.0], [-4.4, 4.1, -9.0], 36) },
  { at: 41.0, scene: 'spring', name: 'Why break my back?', cam: front(farmer, { dist: 1.9, side: -.3, up: .05, fov: 31, fov1: 26 }) },
  { at: 46.7, scene: 'spring', name: 'The hoe in the field', cam: move([-6.4, 3.75, 1.6], [-6.1, 3.65, .8], [-5.3, 3.2, -1.1], [-4.7, 3.7, -6.5], 38) },
  { at: 48.6, scene: 'spring', name: 'And he waited', cam: move([-4.5, 6.4, 4.6], [-4.5, 6.1, 3.4], [-4.5, 3.9, -8], [-4.5, 3.9, -8], 36) },
  { at: 52.5, scene: 'days', name: 'The neighbors', cam: move([-.5, 4.3, -3.6], [-.4, 4.25, -3.9], [2.25, 3.95, -6.1], [2.25, 3.95, -6.1], 34) },
  { at: 54.9, scene: 'days', name: 'Waiting for rabbits', cam: single(li, hu, { angle: .55, dist: 1.6, fov: 31 }) },
  { at: 56.7, scene: 'days', name: 'Really?', cam: move([.1, 4.15, -5.0], [.2, 4.13, -5.1], [2.25, 3.9, -5.75], [2.25, 3.9, -5.75], 34) },
  { at: 57.8, scene: 'days', name: 'Across the field', cam: move([3.4, 4.6, -5.3], [3.3, 4.55, -5.4], [-4.4, 3.9, -8.9], [-4.4, 3.9, -8.9], 30) },
  { at: 58.6, scene: 'days', name: 'A few days later', dissolve: 1.2, cam: move([-7.8, 4.9, -1.2], [-7.4, 4.8, -1.6], [-4.5, 3.6, -8.2], [-4.4, 3.6, -8.2], 40) },
  { at: 61.2, scene: 'days', name: 'The weeds!', cam: front(li, { dist: 2.3, side: .45, fov: 32 }) },
  { at: 63.3, scene: 'days', name: 'Any minute now', cam: front(farmer, { dist: 2.6, side: .45, up: -.35, fov: 32 }) },
  { at: 66.4, scene: 'montage', name: 'Days pass', dissolve: 1.2, cam: move([-12.5, 9.6, 8.6], [-11.5, 9.2, 7.8], [-.5, 3.6, -4.5], [-.8, 3.6, -4.8], 46) },
  { at: 79.7, scene: 'montage', name: 'A rabbit!', cam: move([-.5, 4.2, -6.0], [-.7, 4.15, -6.3], [-3.3, 3.75, -10.3], [-3.3, 3.75, -10.5], 40) },
  { at: 83.4, scene: 'autumn', name: 'Harvest', dissolve: 1.2, cam: move([14, 6.6, 10], [7.5, 5.4, 7], [3, 3.8, -2], [-1.5, 3.9, -2.6], 42) },
  { at: 91.8, scene: 'autumn', name: 'Any more rabbits?', cam: single(hu, farmer, { angle: -1.1, dist: 1.6, fov: 33 }) },
  { at: 93.8, scene: 'autumn', name: 'Not one', cam: single(farmer, hu, { angle: .85, dist: 2.2, up: -.12, fov: 30 }) },
  { at: 96.0, scene: 'autumn', name: 'Auntie Li', cam: move([-.3, 4.6, 2.8], [-.25, 4.55, 2.3], [-.1, 4.0, -2.4], [-.1, 4.0, -2.4], 38) },
  { at: 98.6, scene: 'autumn', name: 'Seeds for spring', cam: single(li, farmer, { angle: -.5, dist: 1.9, fov: 31 }) },
  { at: 103.8, scene: 'autumn', name: 'With a hoe', cam: single(farmer, li, { angle: .5, dist: 2.0, up: -.08, fov: 30, fov1: 26 }) },
  { at: 108.0, scene: 'autumn', name: 'The hoe', cam: move([-1.2, 4.7, 1.0], [-1.6, 4.6, .6], [-3.4, 3.8, -2.0], [-5.1, 3.6, -1.4], 38) },
  { at: 110, scene: 'sunset', name: 'Back to work', dissolve: 1.2, cam: follow([-9.6, 4.8, .6], [-10.4, 4.7, .2], farmer, [0, -.45, 0], 38) },
  { at: 115.6, scene: 'sunset', name: 'Honest work', cam: (t, k) => { const e = ease(k); return { pos: v(-6.5, 5, 3).lerp(v(4, 18, 22), e), look: v(-5, 3.9, -5).lerp(v(-2.5, 4, -7), e), fov: lerp(40, 46, e) }; } },
];
const grade = name => name === 'autumn' ? 'sepia(.12) saturate(1.1) contrast(1.03)' : name === 'sunset' ? 'saturate(1.08) contrast(1.04)' : 'saturate(1.05) contrast(1.02)';
const directors = { spring: directFarm, days: directFarm, montage: directFarm, autumn: directFarm, sunset: directFarm };

// ------------------------------------------------------------------ sound & mount
const footsteps = [[fA, 0, 28.8, .9], [fB, 28.8, 40.4, 1], [fH, 83.4, 110, 1], [fS, 110, 127, .8], [lA, 0, 52.5, .8], [lH, 83.4, 127, .8], [hA, 0, 52.5, .5], [hH, 83.4, 127, .5]];
const hops = [[runR, 25.2, 28.7], [runR2, 79.4, 82.8]];
await D.mount({
  shots, directors, light, grade, wavBase64,
  soundtrack: () => buildStumpSoundtrack(story, { BASE, footsteps, hops, groundAt }),
});
