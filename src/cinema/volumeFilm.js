// 一层一层数体积 · Count Volume Layer by Layer. Direction: cast, models, builds, light, the shot list and the math overlay.
// The shared director (claudeDirector.js) supplies acting helpers, cameras, compositing and playback;
// the math models come from volumeBlocks.js and the meadow set from volumeSets.js.
import * as T from 'three';
import { VOLUME_STORY as story } from './volumeStory.js';
import { buildMeadow, FLOOR } from './volumeSets.js';
import { makeActor, box, clamp, ease, lerp, facing } from './claudeActors.js';
import { applyLook, blockTex } from './claudeStage.js';
import { createDirector, v } from './claudeDirector.js';
import { staircase, staircaseTwin, stepPyramid, cubePyramids, disc, hemisphere, cylinderMinusCone, layeredSolid, SHAPES, blocks, surface, ballCells, smoothTriangle, smoothPyramid, rod, wireBox, COLORS, SIX } from './volumeBlocks.js';
import { buildVolumeSoundtrack, wavBase64 } from './volumeScore.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const stage = await buildMeadow();
const { scene, groundAt } = stage;
const span = (t, a, b) => ease((t - a) / (b - a)); // eased 0→1 between a and b

// ------------------------------------------------------------------ cast (Mei and Bo from FILM 02)
const mei = makeActor({ name: 'mei', scale: .74, skin: '#f0c7a3', hair: '#1e1815', shirt: '#4b98a3', pants: '#7a6a4f', hairLen: 6, hairBack: 8, sleeve: 9, belt: '#2f5a63', face: { style: 'bangs', child: true, lashes: true, eyes: '#3b2617', lip: '#c27766' },
  extras: a => { for (const sx of [-1, 1]) { box(a.head, [.13, .44, .13], [sx * .2, -.06, .2], 0x1e1815); box(a.head, [.17, .08, .17], [sx * .2, -.2, .2], 0xc8423a); } } });
const bo = makeActor({ name: 'bo', scale: .56, skin: '#f2caa8', hair: '#2a201b', shirt: '#e39a4f', pants: '#4f6c78', sleeve: 5, face: { style: 'short', child: true, eyes: '#3b2617' } });
const cast = [mei, bo];
const D = await createDirector({ story, stage, cast, audioDir: 'cinema-volume', voiceScript: 'node scripts/narrate-claude.mjs volume-layers' });
const { still, hold } = D, { move, single, front } = D.cams;
const bucket = new T.Group(); box(bucket, [.34, .36, .34], [0, .18, 0], 0x8d969c); box(bucket, [.28, .04, .28], [0, .37, 0], 0x3f8fd6); scene.add(bucket);
const handBlock = blocks([[0, 0, 0]], { size: .34, color: COLORS.blue }); scene.add(handBlock);

// ------------------------------------------------------------------ expressions
const X = D.expressions;
X('mei', [[0, 'warm'], [9.5, 'surprised'], [12, 'happy'], [17.2, 'thinking'], [20.5, 'knowing'], [25.4, 'warm'], [33, 'warm'], [41, 'proud'], [49, 'knowing'], [55, 'proud'], [64, 'happy'],
  [102, 'excited'], [114.6, 'proud'], [121, 'warm'], [128.8, 'knowing'], [136, 'warm'], [141.6, 'happy'], [143.3, 'knowing'], [153, 'warm'], [165, 'proud'], [172.4, 'excited'], [180, 'warm'],
  [188, 'happy'], [190.5, 'warm'], [202.4, 'knowing'], [218, 'proud'], [230, 'happy'], [233, 'proud'], [238, 'thinking'], [242.4, 'knowing'], [245.6, 'happy'], [259.8, 'curious'], [265.4, 'proud'],
  [272, 'knowing'], [287, 'warm'], [300, 'happy'], [303, 'warm'], [310, 'proud'], [319.5, 'happy'], [324, 'warm']]);
X('bo', [[0, 'excited'], [10.4, 'excited'], [15, 'curious'], [18.3, 'curious'], [22.8, 'surprised'], [25.8, 'curious'], [33, 'curious'], [41, 'thinking'], [47.6, 'joy'], [49.3, 'surprised'],
  [53.6, 'shock'], [55.8, 'curious'], [60.8, 'surprised'], [61.8, 'joy'], [64, 'happy'], [102, 'curious'], [107, 'thinking'], [119.4, 'joy'], [121, 'surprised'], [126.2, 'worried'], [130, 'curious'],
  [138.4, 'shock'], [141.4, 'joy'], [143.3, 'surprised'], [149, 'thinking'], [165, 'excited'], [188, 'hopeful'], [190.5, 'curious'], [230.2, 'excited'], [233, 'joy'], [238, 'thinking'],
  [242.4, 'curious'], [245.6, 'shock'], [248.4, 'joy'], [259.8, 'curious'], [265.4, 'curious'], [287, 'curious'], [299.8, 'hopeful'], [303, 'joy'], [310, 'curious'], [316, 'joy'], [319.5, 'joy'], [324, 'happy']]);
/** A gesture: the arm goes to `to` during [a, b] (eased in and out over 0.4 s), otherwise rests. */
const reach = (t, windows, rest) => { for (const [a, b, to] of windows) if (t > a - .4 && t < b + .4) { const k = Math.min(span(t, a - .4, a), 1 - span(t, b, b + .4)); return [lerp(rest[0], to[0], k), lerp(rest[1], to[1], k)]; } return rest; };
const RL = [0, -.04], RR = [0, .04];

// ------------------------------------------------------------------ models
const models = new T.Group(); scene.add(models);
const add = (g, [x, y, z] = [0, 0, 0]) => { g.position.set(x, y, z); models.add(g); return g; };
const pivot = (g, centre) => { const p = new T.Group(); p.position.set(...centre); g.position.set(-centre[0], -centre[1], -centre[2]); p.add(g); models.add(p); return p; };
const M = {};
// the fish ball: Minecraft glass on the outer faces only, water layers, a wooden stand, and fish for the ending
const RS = 6, BALL = [0, FLOOR + .6, -3], ballC = ballCells(RS);
const glassTex = await blockTex('glass.png');
M.ball = add(new T.Group(), BALL);
M.ball.add(surface(ballC, new T.MeshLambertMaterial({ map: glassTex, transparent: true, alphaTest: .45, side: T.DoubleSide })));
{ const tint = surface(ballC, new T.MeshLambertMaterial({ color: 0xcfeaf3, transparent: true, opacity: .16, depthWrite: false, side: T.DoubleSide })); tint.renderOrder = 3; M.ball.add(tint); }
const waterMat = new T.MeshLambertMaterial({ color: COLORS.water, transparent: true, opacity: .58, depthWrite: false, emissive: 0x0c2f5a });
M.water = Array.from({ length: 2 * RS + 1 }, (_, level) => { if (!level) return null; const w = surface(ballC.filter(c => c[1] < level && Math.hypot(c[0] + .5, c[1] - RS + .5, c[2] + .5) <= RS - .6), waterMat); w.renderOrder = 2; M.ball.add(w); return w; });
M.stand = add(new T.Group()); box(M.stand, [3.4, .6, 3.4], [BALL[0], FLOOR + .3, BALL[2]], 0x6b4a2c);
M.fish = [0xf08a3c, 0xf2c14e, 0xe86a5a, 0xf5f0e0].map(color => { const f = new T.Group(); box(f, [.5, .3, .16], [0, 0, 0], color); const tail = box(f, [.16, .24, .06], [-.32, 0, 0], color); f.userData.tail = tail; box(f, [.05, .05, .17], [.17, .05, 0], 0x1d1d1d); models.add(f); return f; });
// flat first: the staircase, its twin (pivoting round the rectangle's centre), and staircases of smaller blocks
const NS = 6;
M.stairs = add(blocks(staircase(NS), { color: COLORS.blue }), [-3, FLOOR, 0]);
M.twin = pivot(blocks(staircaseTwin(NS), { color: COLORS.orange }), [3.5, 3, .5]); M.twinBlocks = M.twin.children[0];
const stairRowX = i => -20 + i * 10.5;
M.stairRow = [4, 8, 16].map((n, i) => { const g = add(blocks(staircase(n), { size: 6 / n, color: COLORS.blue, gap: .06 }), [stairRowX(i), FLOOR, 0]); g.userData.n = n; return g; });
M.stairSmooth = add(smoothTriangle(6, 6, COLORS.blue, .5), [11.5, FLOOR, 0]);
M.square2d = add(new T.Group(), [-17, FLOOR, 0]);
M.tri2dA = smoothTriangle(6, 6, COLORS.blue, .5); M.tri2dB = smoothTriangle(6, 6, COLORS.orange, .5); M.tri2dB.rotation.z = Math.PI; M.square2d.add(M.tri2dA, M.tri2dB);
// the pyramid, one layer split into quarters, the six pyramids of the cube, and the shrinking seams
const N = 4, layerColor = [COLORS.blue, COLORS.green, COLORS.yellow, COLORS.red];
M.pyr = add(blocks(stepPyramid(N), { colorOf: c => layerColor[N - c[3]] }), [-9, FLOOR, 1]);
M.quarters = add(new T.Group(), [0, FLOOR + .05, 0]);
M.quarterParts = [[-1, -1, COLORS.red], [1, -1, COLORS.blue], [-1, 1, COLORS.green], [1, 1, COLORS.yellow]].map(([sx, sz, color]) => {
  const q = []; for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) q.push([sx < 0 ? x - 3 : x, 0, sz < 0 ? z - 3 : z]);
  const g = blocks(q, { color }); g.userData.dir = [sx, sz]; M.quarters.add(g); return g;
});
const six = cubePyramids(N), CUBE_Y = FLOOR + N + 1.9;
M.sixPlain = six.map((p, i) => add(blocks(p.cells, { color: SIX[i] })));
M.sixGold = six.map((p, i) => add(blocks(p.cells, { colorOf: c => c[3] ? COLORS.gold : SIX[i] })));
M.cubeWire = add(wireBox(2 * N, 2 * N, 2 * N, 0xffffff), [0, CUBE_Y, 0]);
M.shrink = [2, 4, 8, 16].map((n, i) => {
  const s = 7 / (2 * n), p = cubePyramids(n)[1];
  const g = add(blocks(p.cells.filter(c => c[2] < 0).map(c => [c[0], c[1] + n, c[2], c[3]]), { size: s, colorOf: c => c[3] ? COLORS.gold : COLORS.teal, gap: .05 }), [-15 + i * 10, FLOOR, 0]);
  g.userData.n = n; return g;
});
// the smooth limit: five pyramids close into the cube; the front one lifts out and stands up beside it
const LIM = [2, FLOOR + N + .12, 0];
M.limit = six.map((p, i) => add(smoothPyramid(N, p.normal, SIX[i])));
// the ball: a half ball cut open, Archimedes' cylinder minus cone, and two halves
const R = 8, K = 4, half = cells => cells.filter(c => c[2] < 0);
const hemiColor = c => c[1] === K ? COLORS.gold : [COLORS.blue, COLORS.teal][c[1] % 2];
M.hemiCut = add(blocks(half(hemisphere(R)), { colorOf: hemiColor }), [0, FLOOR, 0]);
M.hemiCutL = add(blocks(half(hemisphere(R)), { colorOf: hemiColor }), [-10, FLOOR, 0]);
M.cylCutR = add(blocks(half(cylinderMinusCone(R)), { colorOf: c => c[1] === K ? COLORS.gold : COLORS.orange }), [10, FLOOR, 0]);
M.coneGhost = add(blocks(half(Array.from({ length: R }, (_, k) => disc(k + .5, k)).flat()), { color: COLORS.white, opacity: .28 }), [10, FLOOR, 0]);
const rKx = Math.sqrt(R * R - (K + .5) ** 2);
M.rodR = add(rod([0, FLOOR, .08], [rKx, FLOOR + K + .5, .08], 0xff5a5a, .12)); M.rodK = add(rod([0, FLOOR, .08], [0, FLOOR + K + .5, .08], 0xffffff, .12)); M.rodr = add(rod([0, FLOOR + K + .5, .08], [rKx, FLOOR + K + .5, .08], 0x5ad1ff, .12));
M.hemiFull = add(blocks(hemisphere(R), { colorOf: c => [COLORS.blue, COLORS.teal][c[1] % 2] }), [0, FLOOR, 0]);
M.hemiTop = add(blocks(hemisphere(R).map(c => [c[0], -c[1] - 1, c[2]]), { colorOf: c => [COLORS.purple, COLORS.pink][(-c[1]) % 2] }));
// every pointy shape, the side view, the bases with their shrunken layers, and the heart pyramid
const shapeColors = [COLORS.red, COLORS.blue, COLORS.green, COLORS.pink], shapeX = i => -15.75 + i * 10.5;
M.shapes = ['square', 'circle', 'triangle', 'heart'].map((s, i) => add(blocks(layeredSolid(SHAPES[s], 8, 8), { colorOf: c => c[1] === 4 ? COLORS.gold : shapeColors[i] }), [shapeX(i), FLOOR, 0]));
const H = 8, KK = 6, LAYER = H - KK, top = FLOOR + H, yk = FLOOR + LAYER + .5, wk = 4 * KK / H;
M.sidePyr = add(blocks(half(layeredSolid(SHAPES.square, 8, H)), { colorOf: c => c[1] === LAYER ? COLORS.gold : COLORS.red }), [0, FLOOR, 0]);
M.sideEdges = [add(rod([0, top, .1], [-4, FLOOR, .1], 0xffffff, .1)), add(rod([0, top, .1], [4, FLOOR, .1], 0xffffff, .1)), add(rod([-4, FLOOR - .02, 1.2], [4, FLOOR - .02, 1.2], 0xffffff, .1))];
M.sideH = add(rod([5.2, FLOOR, .1], [5.2, top, .1], 0xff8a8a, .1)); M.sideK = add(rod([0, top, .12], [0, yk, .12], 0x5ad1ff, .1)); M.sideW = add(rod([-wk, yk, .12], [wk, yk, .12], 0xffd75e, .14));
const flat = (inside, size, scale = 1) => { const q = []; for (let x = -size / 2; x < size / 2; x++) for (let z = -size / 2; z < size / 2; z++) if (inside((x + .5) / (size / 2) / scale, (z + .5) / (size / 2) / scale)) q.push([x, 0, z]); return q; };
M.baseSquare = add(blocks(flat(SHAPES.square, 8), { color: COLORS.red }), [5, FLOOR, 0]);
M.baseHeart = add(blocks(flat(SHAPES.heart, 16), { size: .625, color: COLORS.pink }), [-8, FLOOR, 0]);
M.halfSquare = add(blocks(flat(SHAPES.square, 8, .5), { color: COLORS.gold }));
M.halfHeart = add(blocks(flat(SHAPES.heart, 16, .5), { size: .625, color: COLORS.gold }));
M.baseRods = [add(rod([1, FLOOR + 1.2, 4.6], [9, FLOOR + 1.2, 4.6], 0xffffff, .1)), add(rod([3, FLOOR + 2.25, 2.4], [7, FLOOR + 2.25, 2.4], 0xffd75e, .12)), add(rod([7.4, FLOOR + 2.25, -2], [7.4, FLOOR + 2.25, 2], 0xffd75e, .12))];
M.heartPyr = add(blocks(layeredSolid(SHAPES.heart, 10, 9), { colorOf: c => c[1] === 4 ? COLORS.gold : COLORS.pink }), [0, FLOOR, 0]);

// ------------------------------------------------------------------ direction, scene by scene
const show = (...gs) => { for (const g of gs.flat()) g.visible = true; };
function reset() { for (const o of models.children) o.visible = false; for (const w of M.water) if (w) w.visible = false; bucket.visible = handBlock.visible = false; bucket.rotation.set(0, 0, 0); }
const lookAt = (x, y, z) => ({ look: v(x, y, z) });
/** Mei and Bo standing at given spots, each looking at a point or at each other, with gestures. */
function pair(t, { mei: [mx, mz, myaw], bo: [bx, bz, byaw], meiLook, boLook, meiArmR = [], meiArmL = [], boArmR = [], boArmL = [], meiQ = {}, boQ = {} }) {
  still(mei, mx, mz, myaw, t, { ...(meiLook ? { look: meiLook } : {}), armR: reach(t, meiArmR, RR), armL: reach(t, meiArmL, RL), ...meiQ });
  still(bo, bx, bz, byaw, t, { ...(boLook ? { look: boLook } : {}), armR: reach(t, boArmR, RR), armL: reach(t, boArmL, RL), ...boQ });
}
const yawTo = (from, to) => facing(to[0] - from[0], to[1] - from[1]);

const directors = {
  ball(t) { // the fish ball, before it is filled
    show(M.ball, M.stand);
    const B = [2.6, 8.6], Mp = [-2.4, 9.2], talk = t > 15;
    pair(t, { mei: [...Mp, talk ? yawTo(Mp, [1, 15]) : yawTo(Mp, [0, 13])], bo: [...B, talk && t < 22.6 ? yawTo(B, [-1, 14]) : yawTo(B, [0, 13])],
      meiLook: t < 9.5 ? v(0, 9, -3) : t < 25 ? bo : v(.5, 5.4, 12), boLook: t < 15 || (t > 22.6 && t < 25.6) ? v(0, 11, -3) : mei,
      boArmR: [[10.6, 14.2, [-2.7, .25]], [23, 25.4, [-2.4, .3]]], meiArmR: [[26.2, 32.6, [-1.9, .15]]], boArmL: [[23, 25.4, [-2.4, -.3]]] });
    if (t > 25.9) { mei.updateMatrixWorld(true); handBlock.visible = true; handBlock.position.copy(mei.rightArm.localToWorld(new T.Vector3(0, -.85, 0))).add(v(-.17, -.1, -.17)); }
    bucket.visible = true; bucket.position.set(-3.2, FLOOR, 9.8);
  },
  stairs(t) { // flat first: the staircase, then the twin flips over and slides in
    show(M.stairs); M.stairs.build((t - 33.0) * 4.6, { window: 4 });
    if (t > 56.8) {
      show(M.twin); const pop = span(t, 56.8, 57.4), flip = span(t, 58.2, 59.6), slide = span(t, 59.8, 61.2);
      M.twin.position.set(-3 + 3.5 + lerp(8.5, 0, slide), FLOOR + 3 + (1 - pop) * 1.5, .5); M.twin.rotation.set(0, 0, lerp(Math.PI, 0, flip)); M.twin.scale.setScalar(lerp(.3, 1, pop));
    }
    const Mp = [-5.6, 2.6], B = t < 55.7 ? [5.4, 2.4] : [9.6, 3.2];
    pair(t, { mei: [...Mp, yawTo(Mp, [0, 6])], bo: [...B, yawTo(B, [1, 6])], meiLook: t > 48.8 && t < 55.6 ? bo : v(0, 6, 0), boLook: t > 48.8 && t < 55.6 ? mei : t > 55.7 && t < 62 ? v(6, 6, .5) : v(0, 5.5, 0),
      meiArmL: [[33.6, 39.6, [-1.6, -.3]], [56.2, 61.2, [-1.4, -.2]], [64.4, 71.6, [-1.7, -.3]]], boArmR: [[41.3, 48.2, [-1.4, .3]]], boArmL: [[62, 63.4, [-2.8, -.3]]], boQ: t > 62 && t < 63.4 ? { armR: [-2.8, .3] } : {} });
  },
  tiny(t) { // the same staircase in smaller and smaller blocks, then a smooth triangle
    M.stairRow.forEach((g, i) => { const a = 82.2 + i * 1.5; if (t > a) { show(g); g.build((t - a) * g.userData.count / 1.1, { window: Math.max(3, g.userData.count / 8), drop: 6 / g.userData.n * 2 }); } });
    if (t > 86.6) { show(M.stairSmooth); M.stairSmooth.scale.set(1, span(t, 86.6, 87.6) || .001, 1); }
  },
  pyramid(t) { // count the square layers of a pyramid
    show(M.pyr);
    const layerEnd = [108.8, 110.4, 111.9, 113.4], sizes = [64, 36, 16, 4]; let n = 0;
    for (let L = 0; L < 4; L++) { const a = L ? layerEnd[L - 1] : 103.2, b = layerEnd[L]; n += sizes[L] * clamp((t - a) / (b - a)); }
    M.pyr.build(n, { window: 6 });
    const Mp = [-3.4, -1.6], B = [-3, 1.6];
    pair(t, { mei: [...Mp, t > 128 ? yawTo(Mp, B) : yawTo(Mp, [-9, 1])], bo: [...B, t > 126 ? yawTo(B, Mp) : yawTo(B, [-9, 1])],
      meiLook: t > 126 ? bo : v(-9, 5, 1), boLook: t > 126 ? mei : v(-9, 4.5, 1), meiArmR: [[102.6, 106.4, [-1.7, .35]], [130.4, 133.4, [-1.2, .5]]], boArmR: [[119.4, 121, [-2.8, .3]]], boArmL: [[119.4, 121, [-2.8, -.3]], [126.6, 129, [-.6, -.7]]] });
  },
  quarters(t) { // one 6 × 6 layer splits into four 3 × 3 squares
    show(M.quarters); const k = span(t, 122.2, 123.6);
    for (const g of M.quarterParts) g.position.set(g.userData.dir[0] * .5 * k, Math.sin(k * Math.PI) * .6, g.userData.dir[1] * .5 * k);
    still(bo, 5.6, 2.4, facing(-5.6, -1.4), t, { look: v(0, 3.5, 0), armR: reach(t, [[122, 125.6, [-1.5, .25]]], RR) });
  },
  cube(t) { // six pyramids fly together, then the seams turn gold
    const gold = t > 145.2;
    six.forEach((p, i) => {
      const g = (gold ? M.sixGold : M.sixPlain)[i], d0 = p.normal[1] === -1 ? 1.6 : 13, a = 135.4 + i * .35, k = span(t, a, a + 3.6), d = lerp(d0, 1.6, k);
      show(g); g.position.set(p.normal[0] * d, CUBE_Y + p.normal[1] * d, p.normal[2] * d); g.scale.setScalar(lerp(.2, 1, span(t, 133.8 + i * .25, 134.6 + i * .25)));
    });
    if (t < 141.2) show(M.cubeWire);
    const Mp = [9.5, 11], B = [12, 9.4];
    pair(t, { mei: [...Mp, yawTo(Mp, [0, 0])], bo: [...B, yawTo(B, [0, 0])], meiLook: t > 153 ? bo : v(0, 8, 0), boLook: t > 149.4 && t < 153 ? mei : v(0, 8, 0),
      meiArmR: [[143.6, 152, [-1.5, .2]]], boArmL: [[141.6, 143, [-2.8, -.3]]], boArmR: [[141.6, 143, [-2.8, .3]]] });
  },
  shrink(t) { // the same pyramid, cut open, in smaller and smaller blocks
    M.shrink.forEach((g, i) => { const a = 157.4 + i * 1.2; if (t > a) { show(g); g.build((t - a) * g.userData.count / .9, { window: Math.max(4, g.userData.count / 6), drop: 2 }); } });
  },
  limit(t) { // tiny blocks: five smooth pyramids close into the cube, the front one lifts out; two triangles make a square
    six.forEach((p, i) => {
      const g = M.limit[i]; show(g);
      const d = lerp(3.2, .12, span(t, 165, 168.4));
      if (p.normal[2] !== 1) { g.position.set(LIM[0] + p.normal[0] * d, LIM[1] + p.normal[1] * d, p.normal[2] * d); return; }
      const out = span(t, 173.4, 175.2), over = span(t, 175.2, 177.6);
      g.position.set(lerp(LIM[0], 14, over), lerp(LIM[1], FLOOR + N, over) + Math.sin(out * Math.PI / 2) * 9 * (1 - over), lerp(d, 2.5, out) * (1 - over) + over * 1);
      g.rotation.set(lerp(0, Math.PI / 2, over), 0, 0);
    });
    show(M.square2d); M.tri2dB.position.set(6.12 + lerp(5, 0, span(t, 165.4, 167.8)), 6.12, 0);
    const Mp = [-6.4, 5], B = [-4.6, 6.2];
    pair(t, { mei: [...Mp, yawTo(Mp, [2, -1])], bo: [...B, yawTo(B, [6, 0])], meiLook: t > 172.4 && t < 180 ? v(2, 6, 0) : v(-14, 5, 0), boLook: t > 174 ? v(12, 6, 2) : v(2, 7, 0),
      meiArmR: [[172.8, 179.6, [-1.6, .3]]], boArmL: [[168.4, 170, [-2.7, -.3]]], boArmR: [[168.4, 170, [-2.7, .3]]] });
  },
  hemi(t) { // Bo asks; a half ball of circles builds, and the right triangle appears on the cut
    show(M.hemiCut); M.hemiCut.build(M.hemiCut.upToLayer(clamp((t - 191.2) / 6.2 * R, 0, R)), { window: 30, drop: 1.5 });
    if (t > 197.4) show(M.rodR); if (t > 198.4) show(M.rodK); if (t > 199.4) show(M.rodr);
    const B = [-8.8, 5.2], Mp = [-10.8, 6.4];
    pair(t, { mei: [...Mp, yawTo(Mp, [0, 0])], bo: [...B, t < 190.2 ? yawTo(B, [-11, 9]) : yawTo(B, [0, 0])], meiLook: t < 190.4 ? bo : v(0, 5, 0), boLook: t < 190.2 ? mei : v(0, 6, 0),
      meiArmR: [[190.8, 194.4, [-1.6, .3]], [202.8, 207.6, [-1.5, .25]]] });
  },
  arch(t) { // half ball beside a cylinder with a cone taken out, built layer for layer together
    const L = clamp((t - 210.2) / 5.6 * R, 0, R);
    show(M.hemiCutL, M.cylCutR); M.hemiCutL.build(M.hemiCutL.upToLayer(L), { window: 30, drop: 1.5 }); M.cylCutR.build(M.cylCutR.upToLayer(L), { window: 30, drop: 1.5 });
    if (t > 213.4) { show(M.coneGhost); M.coneGhost.build(M.coneGhost.upToLayer(clamp((t - 213.4) / 2.2 * R, 0, R)), { window: 20, drop: 1 }); }
  },
  halves(t) { // a second half ball flips over and settles on the first
    show(M.hemiFull, M.hemiTop); const k = span(t, 229.8, 235.2);
    M.hemiTop.position.set(0, lerp(FLOOR + 2 * R + 6, FLOOR + 2 * R, k), 0); M.hemiTop.rotation.set(lerp(Math.PI, 0, span(t, 229.8, 233.4)), 0, 0);
    const Mp = [-9, 13], B = [-6.2, 14.4];
    pair(t, { mei: [...Mp, yawTo(Mp, [0, 0])], bo: [...B, yawTo(B, [0, 0])], meiLook: v(0, 10, 0), boLook: v(0, 13, 0),
      meiArmR: [[233.4, 236.6, [-2.2, .3]]], boArmL: [[230.4, 232.4, [-2.8, -.3]]], boArmR: [[230.4, 232.4, [-2.8, .3]]] });
  },
  fill(t) { // how many buckets, then the water rises layer by layer
    show(M.ball, M.stand);
    const level = Math.floor(clamp((t - 249.4) / 8.6) * 2 * RS + (t > 258 ? 2 * RS : 0)); if (level > 0) M.water[Math.min(2 * RS, level)].visible = true;
    const B = [4.2, 3.6], Mp = [-1.8, 5.6], pour = t > 248.6;
    pair(t, { mei: [...Mp, t < 248.4 ? yawTo(Mp, B) : yawTo(Mp, [0, -3])], bo: [...B, t < 248.4 ? yawTo(B, Mp) : yawTo(B, [0, -3])], meiLook: t < 248.4 ? bo : v(0, 7, -3), boLook: t < 248.4 ? mei : v(0, 8, -3),
      boArmL: pour ? [[248.6, 260, [-2.5, -.15]]] : [[238.6, 241, [-1.2, -.4]]], boArmR: pour ? [[248.6, 260, [-2.5, .15]]] : [[245.8, 247.6, [-2.6, .3]]], meiArmR: [[242.8, 245, [-1.3, .4]]] });
    if (pour) { bo.updateMatrixWorld(true); bucket.visible = true; bucket.position.copy(hold(bo, .55, 1.35)); bucket.rotation.set(0, bo.rotation.y, Math.sin(t * 2.4) * .25 + .2); }
    else { bucket.visible = true; bucket.position.set(5, FLOOR, 4.6); }
  },
  shapes(t) { // every pointy shape, built one after another
    M.shapes.forEach((g, i) => { const a = 259.4 + i * 1.3; if (t > a) { show(g); g.build(g.upToLayer(clamp((t - a) / 1.6 * 8, 0, 8)), { window: 16, drop: 1.5 }); } });
    const B = [2.6, 10.6], Mp = [-2.6, 10.8];
    pair(t, { mei: [...Mp, t > 265.4 ? yawTo(Mp, B) : yawTo(Mp, [0, 0])], bo: [...B, t > 265.4 ? yawTo(B, Mp) : yawTo(B, [0, 0])], meiLook: t > 265.4 ? bo : v(0, 6, 0), boLook: t > 265.4 ? mei : v(15.75, 6, 0),
      boArmR: [[262.2, 264.6, [-1.8, .4]]], meiArmL: [[265.8, 270, [-1.2, -.5]]] });
  },
  side(t) { // the side view: straight edges from the point, so the width shrinks steadily
    show(M.sidePyr); if (t > 273.6) show(M.sideEdges); if (t > 276.4) show(M.sideH); if (t > 281.2) show(M.sideK); if (t > 282.4) show(M.sideW);
    const Mp = [-7.4, 3.6]; still(mei, ...Mp, yawTo(Mp, [0, 4]), t, { look: t > 279.6 ? v(1, 6.2, 19) : v(0, 6, 0), armR: reach(t, [[272.6, 279.2, [-1.6, .25]], [280.6, 285.4, [-1.4, .3]]], RR) });
  },
  base(t) { // the shrunken layer comes down onto the base: ½ as wide and ½ as deep is ¼ the area
    show(M.baseSquare, M.baseHeart);
    if (t > 287.4) { show(M.halfSquare); M.halfSquare.position.set(5, lerp(FLOOR + 7, FLOOR + 1.03, span(t, 287.4, 290.4)), 0); }
    if (t > 291.4) show(M.baseRods[0]); if (t > 292.6) show(M.baseRods[1], M.baseRods[2]);
    if (t > 303.6) { show(M.halfHeart); M.halfHeart.position.set(-8, lerp(FLOOR + 7, FLOOR + .65, span(t, 303.6, 306.6)), 0); }
    const Mp = [1.2, 7.2], B = [-3.4, 8.2];
    pair(t, { mei: [...Mp, t > 299.6 && t < 309 ? yawTo(Mp, B) : yawTo(Mp, [3, 0])], bo: [...B, t > 299.6 ? yawTo(B, Mp) : yawTo(B, [-6, 0])], meiLook: t > 299.6 && t < 303 ? bo : t > 303 ? v(-8, 4, 0) : v(5, 4, 0), boLook: t > 299.6 && t < 303.4 ? mei : v(-8, 4, 0),
      meiArmR: [[287.4, 298, [-1.3, .3]]], meiArmL: [[303.4, 308.4, [-1.3, -.4]]], boArmL: [[300, 302.2, [-2.2, -.4]]] });
  },
  heartpyr(t) { // add up the layers of a heart pyramid
    show(M.heartPyr); M.heartPyr.build(M.heartPyr.upToLayer(clamp((t - 310.6) / 5.4 * 9, 0, 9)), { window: 24, drop: 1.5 });
    const Mp = [7, 3.4], B = [8.8, 4.8];
    pair(t, { mei: [...Mp, yawTo(Mp, [0, 0])], bo: [...B, yawTo(B, [0, 0])], meiLook: v(0, 6, 0), boLook: v(0, 7, 0), meiArmR: [[310.6, 317.6, [-1.6, .25]]], boArmL: [[316.2, 319.2, [-2.7, -.3]]], boArmR: [[316.2, 319.2, [-2.7, .3]]] });
  },
  ending(t) { // sunset: the fish ball is full; fish swim; Mei and Bo sit and watch
    show(M.ball, M.stand); M.water[2 * RS].visible = true;
    M.fish.forEach((f, i) => { f.visible = true; const a = t * (.45 + i * .07) + i * 1.6, r = 2.2 + (i % 2) * 1.1, y = BALL[1] + 4 + i * 1.1 + Math.sin(t * .8 + i) * .4;
      f.position.set(BALL[0] + Math.cos(a) * r, y, BALL[2] + Math.sin(a) * r); f.rotation.set(0, -a - Math.PI / 2, 0); f.userData.tail.rotation.y = Math.sin(t * 9 + i) * .5; });
    const Mp = [-1.5, 4.6], B = [1.3, 4.6];
    still(mei, ...Mp, facing(.3, 1), t, { look: t > 320.6 && t < 323.6 ? bo : v(0, 9, -3), sit: 1, seat: FLOOR + .05 });
    still(bo, ...B, facing(-.3, 1), t, { look: t < 323.6 ? v(0, 10, -3) : mei, sit: 1, seat: FLOOR + .05, armR: reach(t, [[320.8, 323.4, [-2.6, .3]]], RR) });
  },
};

// ------------------------------------------------------------------ light
const LOOKS = {
  day: { sun: [14, 22, 18], sunColor: 0xfff2dc, sunI: 3.0, hemiSky: 0xdcecff, hemiGround: 0x7d7a52, hemiI: 2.0, top: 0x6fa6d6, horizon: 0xdcebee, glow: 0xfff2d0, fog: 0xcfe0e6, focus: [0, 3, 0], exposure: 1.05, hills: 0x9db1b4 },
  sunset: { sun: [-30, 7, 10], sunColor: 0xff9e58, sunI: 2.3, hemiSky: 0xa9b6dc, hemiGround: 0x5a4a38, hemiI: 1.55, top: 0x34477a, horizon: 0xf2a066, glow: 0xffb070, fog: 0xa0868a, focus: [0, 3, 0], exposure: 1.18, hills: 0x5d5670 },
};
function light(name, t) {
  stage.clouds.position.x = t * .3;
  if (name !== 'ending') return applyLook(stage, LOOKS.day);
  const dusk = ease((t - 326) / 12), L = LOOKS.sunset;
  applyLook(stage, L, { dusk, sunI: L.sunI * (1 - dusk * .45), top: new T.Color(L.top).lerp(new T.Color(0x1d2a4f), dusk) });
}
const grade = name => name === 'ending' ? 'saturate(1.08) contrast(1.04)' : 'saturate(1.06) contrast(1.02)';

// ------------------------------------------------------------------ shots
const shots = [
  { at: 0, scene: 'ball', name: 'The fish ball', cam: move([5, 14, 32], [1.5, 6, 19], [0, 8.6, -3], [0, 7.6, -2], 50, 50) },
  { at: 10.3, scene: 'ball', name: 'A fish ball for my fish!', cam: single(bo, mei, { angle: -.45, dist: 2.3, fov: 34 }) },
  { at: 18.1, scene: 'ball', name: 'Layer by layer', cam: single(mei, bo, { angle: .45, dist: 1.9, fov: 33 }) },
  { at: 22.8, scene: 'ball', name: 'But it’s round!', cam: front(bo, { dist: 1.8, side: .3, up: -.05, fov: 34 }) },
  { at: 25.8, scene: 'ball', name: 'Something simpler', cam: move([.1, 4.9, 16.4], [.1, 4.8, 15.4], [.1, 4.3, 8.9], [.1, 4.2, 8.9], 38, 36) },
  { at: 32.6, scene: 'stairs', name: 'A staircase', dissolve: 1.2, cam: move([1.2, 7.4, 20], [1.2, 6.2, 16], [.6, 5.2, 0], [.6, 5, 0], 40) },
  { at: 48.9, scene: 'stairs', name: 'A hundred steps?', cam: front(mei, { dist: 2.2, side: .35, fov: 34 }) },
  { at: 53.5, scene: 'stairs', name: 'Forever!', cam: front(bo, { dist: 1.9, side: -.3, up: -.05, fov: 34 }) },
  { at: 55.6, scene: 'stairs', name: 'Copy, flip, slide', cam: move([4.5, 7.4, 21], [3.6, 7, 20], [3.8, 4.8, 0], [3, 4.8, 0], 44) },
  { at: 63.8, scene: 'stairs', name: 'A rectangle', cam: move([1.5, 6.4, 17], [1.5, 6.2, 15.6], [.9, 5, 0], [.9, 5, 0], 40) },
  { at: 81.0, scene: 'tiny', name: 'Smaller and smaller', dissolve: 1.2, cam: move([-1.2, 6.4, 29], [-1.2, 6, 26], [-1.2, 3.8, 0], [-1.2, 3.6, 0], 46) },
  { at: 101.6, scene: 'pyramid', name: 'Now in 3D', dissolve: 1.2, cam: move([9, 9, 18.5], [6.6, 7.6, 15], [-7.4, 4, 1], [-6.4, 4, 1], 42) },
  { at: 114.6, scene: 'pyramid', name: 'A hundred and twenty!', cam: front(bo, { dist: 2.2, side: .45, up: .1, fov: 36 }) },
  { at: 121.2, scene: 'quarters', name: 'Four little squares', dissolve: .8, cam: move([1, 10.4, 14.4], [1, 9.4, 12.8], [.8, 2.6, 0], [.8, 2.6, 0], 40) },
  { at: 126.2, scene: 'pyramid', name: 'Harder and harder', dissolve: .8, cam: single(bo, mei, { angle: -.5, dist: 1.8, fov: 34 }) },
  { at: 129.9, scene: 'pyramid', name: 'Make six', cam: single(mei, bo, { angle: .5, dist: 2.0, fov: 33 }) },
  { at: 133.6, scene: 'cube', name: 'Six pyramids', dissolve: 1, cam: move([32, 23, 36], [21, 15, 25], [0, 10, 0], [0, 8.4, 0], 50, 44) },
  { at: 141.3, scene: 'cube', name: 'A cube!', cam: front(bo, { dist: 2.0, side: .4, fov: 36 }) },
  { at: 143.1, scene: 'cube', name: 'Gold seams', cam: move([19, 15, 22], [13, 13.5, 23], [0, 8.4, 0], [0, 8.2, 0], 42) },
  { at: 152.9, scene: 'cube', name: 'Smaller blocks', cam: front(mei, { dist: 2.2, side: -.35, fov: 34 }) },
  { at: 156.8, scene: 'shrink', name: 'Thinner seams', dissolve: 1, cam: move([0, 8.6, 36], [0, 8, 32], [0, 2.4, 0], [0, 2.2, 0], 40) },
  { at: 164.2, scene: 'limit', name: 'Infinitely small', dissolve: 1.2, cam: move([-1, 13, 34], [-1, 11.6, 30], [0, 5.8, 0], [0, 5.5, 0], 46) },
  { at: 186.8, scene: 'hemi', name: 'Can we?', dissolve: 1.2, cam: front(bo, { dist: 2.0, side: .4, fov: 35 }) },
  { at: 190.0, scene: 'hemi', name: 'A stack of circles', cam: move([5, 10, 24], [3, 7.5, 18], [0, 5.2, 0], [0, 5.5, 0], 44) },
  { at: 209.2, scene: 'arch', name: 'Cylinder minus cone', dissolve: 1.2, cam: move([0, 12, 34], [0, 10, 30], [0, 5.6, 0], [0, 6, 0], 44) },
  { at: 229.4, scene: 'halves', name: 'Two halves', dissolve: 1.2, cam: move([-6, 8, 34], [-5, 9, 31], [0, 13, 0], [0, 12.5, 0], 52) },
  { at: 237.4, scene: 'fill', name: 'Six blocks', dissolve: 1.2, cam: single(bo, mei, { angle: -.5, dist: 1.8, fov: 34 }) },
  { at: 242.4, scene: 'fill', name: 'About 905', cam: single(mei, bo, { angle: .5, dist: 2.0, fov: 33 }) },
  { at: 245.6, scene: 'fill', name: '905 buckets?', cam: front(bo, { dist: 1.6, side: .25, up: -.05, fov: 34 }) },
  { at: 248.2, scene: 'fill', name: 'Layer by layer, it fills', cam: move([10, 6.2, 21], [8, 7, 18], [0, 7.4, -3], [0, 7.8, -3], 50) },
  { at: 258.6, scene: 'shapes', name: 'Every pointy shape', dissolve: 1.2, cam: move([0, 13, 33], [0, 12, 30], [0, 3.8, 0], [0, 3.6, 0], 44) },
  { at: 265.2, scene: 'shapes', name: 'The same rule', cam: single(mei, bo, { angle: .5, dist: 2.0, fov: 33 }) },
  { at: 271.6, scene: 'side', name: 'From the side', dissolve: 1.2, cam: move([1, 6.6, 21], [1, 6.2, 18.5], [.4, 5.4, 0], [.4, 5.4, 0], 42) },
  { at: 286.8, scene: 'base', name: 'Both ways', dissolve: 1.2, cam: move([-1.5, 13, 19], [-1.5, 12, 16.6], [-1.5, 2.8, 0], [-1.5, 2.6, 0], 42) },
  { at: 299.6, scene: 'base', name: 'Even my heart?', cam: single(bo, mei, { angle: -.5, dist: 1.7, fov: 34 }) },
  { at: 302.8, scene: 'base', name: 'A quarter of the heart', cam: move([-5, 13, 12.5], [-5.6, 12, 11], [-8, 3.2, 0], [-8, 3.2, 0], 40) },
  { at: 309.8, scene: 'heartpyr', name: 'Add up the layers', dissolve: 1.2, cam: move([6, 9, 21], [3, 8, 18.6], [-.5, 5.4, 0], [-.5, 5, 0], 44) },
  { at: 319.4, scene: 'ending', name: 'The fish love it', dissolve: 1.5, cam: move([3.2, 5, 15], [2.6, 5, 13.6], [0, 6.4, -2], [0, 6.2, -2], 46) },
  { at: 323.8, scene: 'ending', name: 'Layer by layer', cam: move([3, 5.2, 14], [4, 15, 34], [0, 6.4, -2], [0, 7.4, -3], 46, 50) },
];

// ------------------------------------------------------------------ math overlay: cards, labels and the bucket counter
const camera = stage.camera;
const project = p => { const q = new T.Vector3(...p).project(camera); return [(q.x + 1) * 640, (1 - q.y) * 360, q.z]; };
function text(ink, words, x, y, font, color = '#fbf3e1', align = 'center', blur = 8) { ink.font = font; ink.textAlign = align; ink.fillStyle = color; ink.shadowColor = 'rgba(5,8,6,.85)'; ink.shadowBlur = blur; ink.shadowOffsetY = 2; ink.fillText(words, x, y); ink.shadowBlur = 0; ink.shadowOffsetY = 0; }
const ROW = { big: [46, '600 34px Cambria, Georgia, serif', '#fbf6ea'], small: [26, 'italic 17px Georgia', '#d9e4d6'], zh: [26, '500 18px "Microsoft YaHei"', '#fbf6ea'], gold: [34, '24px Cambria, Georgia, serif', '#ffd75e'], '': [34, '24px Cambria, Georgia, serif', '#fbf6ea'] };
/** A chalkboard card shown during [from, to]; each row [text | t => text, style, appearsAt] writes on in turn. */
const CARDS = [], TAGS = [];
const card = (scene, from, to, x, y, w, rows) => CARDS.push({ scene, from, to, x, y, w, rows });
const tag = (scene, from, to, words, p, color = '#fff8e8') => TAGS.push({ scene, from, to, words, p, color });
// flat first
const countSum = t => { const n = clamp(Math.floor((t - 41.2) / 1.12) + 1, 1, 6); return Array.from({ length: n }, (_, i) => i + 1).join(' + ') + (t > 47.6 ? ' = 21' : ''); };
card('stairs', 41.2, 48.8, 760, 70, 470, [['a staircase 6 wide and 6 high', 'small', 41.2], [countSum, 'big', 41.2]]);
for (let i = 0; i < 6; i++) tag('stairs', 41.2 + i * 1.12, 48.8, String(i + 1), [-3 + (i + 1) + .55, FLOOR + (5 - i) + .5, 1], '#ffd75e');
tag('stairs', 62.2, 80.6, '7 wide', [.5, FLOOR - .4, 1.2]); tag('stairs', 62.6, 80.6, '6 high', [4.9, FLOOR + 3, 1.2]);
card('stairs', 64.2, 72.2, 740, 70, 500, [['two staircases make a 7 × 6 rectangle', 'small', 64.4], ['6 × 7 = 42', 'big', 66.6], ['half of it: 21', 'gold', 69.6]]);
card('stairs', 72.6, 80.7, 740, 70, 500, [['for any staircase', 'small', 72.6], ['1 + 2 + … + N = N × (N+1) ÷ 2', 'big', 74.2]]);
[4, 8, 16].forEach((n, i) => tag('tiny', 82.6 + i * 1.5, 101.2, `${n} rows: extra ${Math.round(100 / n)}%`, [stairRowX(i) + 3, FLOOR - .5, 1], n < 8 ? '#ffd75e' : '#fff8e8'));
tag('tiny', 87.2, 101.2, 'tiny blocks: extra 0', [14.5, FLOOR - .5, 1]);
card('tiny', 92.4, 101.2, 405, 56, 470, [['1 + 2 + … + N = ½N² + ½N', '', 92.4], ['the extra ½N fades away', 'small', 94.8], ['A = ½ × B × H', 'big', 97.6]]);
// the pyramid
[['8 × 8 = 64', [-14.6, FLOOR + .5, 3], 108.8], ['6 × 6 = 36', [-13.2, FLOOR + 1.5, 2.6], 110.4], ['4 × 4 = 16', [-11.8, FLOOR + 2.5, 2.2], 111.9], ['2 × 2 = 4', [-9.5, FLOOR + 4.2, 1], 113.4]].forEach(([w, p, a]) => tag('pyramid', a, 121, w, p));
card('pyramid', 114.8, 121.0, 760, 70, 470, [['now in 3D: every layer is a square', 'small', 114.8], [t => ['64', '64 + 36', '64 + 36 + 16', '64 + 36 + 16 + 4'][clamp(Math.floor((t - 114.8) / 1.25), 0, 3)] + (t > 119 ? ' = 120' : ''), 'big', 114.8], ['Σ(2k)²  =  “add up all the layers”', 'gold', 119.4]]);
for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) tag('quarters', 123.4, 126, '3 × 3', [x, FLOOR + 1.6, z]);
card('quarters', 121.6, 126.0, 760, 70, 470, [['a 6 × 6 layer is four 3 × 3 squares', 'small', 121.6], ['(2k)² = 4 × k²', 'big', 122.8], ['6 × 6 = 4 × (3 × 3)', 'gold', 124]]);
card('cube', 135.8, 141.2, 50, 70, 470, [['6 pyramids, points meeting in the middle', 'small', 135.8], ['= one 8 × 8 × 8 cube?', 'big', 137.4]]);
card('cube', 143.4, 152.8, 50, 70, 500, [['6 pyramids ≈ 1 cube', 'big', 143.4], ['the gold seam blocks belong to two pyramids', 'small', 146.2], ['金色的方块被两个金字塔共用', 'zh', 146.2]]);
M.shrink.forEach((g, i) => { const n = g.userData.n, extra = (12 * n * n + 4 * n) / (8 * n ** 3); tag('shrink', 157.6 + i * 1.2, 164.4, `${2 * n} wide: extra ${Math.round(extra * 100)}%`, [g.position.x, FLOOR + 4.6, 0], extra > .3 ? '#ffd75e' : '#fff8e8'); });
card('shrink', 157.4, 164.4, 405, 66, 470, [['smaller blocks → thinner gold seams', 'small', 157.4], ['the extra shrinks toward 0', 'big', 160.4]]);
tag('limit', 167.6, 186.8, '2 triangles = 1 square', [-14, FLOOR - .6, 1]); tag('limit', 168.4, 186.8, '6 pyramids = 1 cube', [2, FLOOR - .6, 5.2]); tag('limit', 177.4, 186.8, 'one of the six', [14, FLOOR - .6, 5.6], '#ffd75e');
card('limit', 165.6, 180.4, 300, 50, 680, [['infinitely small blocks: no seams, a perfect fit', 'small', 165.6], ['2D:  1 + 2 + … + N = ½N²  →  A = ½ × B × H', '', 167.8], ['3D:  6 × pyramid = (2N)³  →  V = ⅓ × S × H', '', 175.6]]);
card('limit', 180.8, 186.6, 405, 50, 470, [['add up every k², from 1 to N', 'small', 180.8], ['Σk² = ⅓ × N³', 'big', 183.4], ['exact when the blocks are tiny', 'small', 184.2]]);
// the ball
tag('hemi', 197.4, 209, 'R', [rKx / 2 - .6, FLOOR + 2.8, .3], '#ff8a8a'); tag('hemi', 198.4, 209, 'k', [-.7, FLOOR + 2.3, .3]); tag('hemi', 199.4, 209, 'r', [rKx / 2, FLOOR + K + 1.4, .3], '#8ae0ff');
card('hemi', 196.2, 209.0, 760, 70, 470, [['the layer at height k is a circle', 'small', 196.2], ['r² = R² − k²', 'big', 199.6], ['area = π × (R² − k²)', 'gold', 203.4]]);
tag('arch', 210.4, 229.2, 'half ball', [-10, FLOOR - .3, 3]); tag('arch', 210.4, 229.2, 'cylinder with a cone taken out', [10, FLOOR - .3, 3]);
tag('arch', 214.6, 229.2, 'π(R² − k²)', [-10, FLOOR + K + 1.6, .5], '#ffd75e'); tag('arch', 215.4, 229.2, 'πR² − πk²', [10, FLOOR + K + 1.6, .5], '#ffd75e');
card('arch', 209.8, 217.8, 405, 50, 470, [['same layer, same area, at every height', 'small', 209.8], ['half ball = cylinder − cone', 'big', 213.2], ['阿基米德的发现', 'zh', 215.2]]);
card('arch', 218.2, 229.2, 340, 50, 600, [['add up the layers, with the shortcut', 'small', 218.2], ['Σ π(R² − k²) = πR³ − π × ⅓R³', 'big', 219.4], ['half ball = ⅔ π R³', 'gold', 226.2]]);
card('halves', 233.2, 237.4, 40, 60, 560, [['ball = 2 × ⅔ π R³', 'big', 233.2], ['= ⁴⁄₃ × π × R³', 'gold', 234.6]]);
card('fill', 238.4, 248.2, 760, 70, 470, [['R = 6 blocks', 'small', 238.6], ['⁴⁄₃ × π × 6³ ≈ 905', 'big', 242.6], ['about 905 buckets!', 'gold', 243.6]]);
card('fill', 249.0, 258.6, 820, 70, 400, [['one layer at a time', 'small', 249.0], [t => `buckets: ${Math.round(905 * clamp((t - 249.4) / 8.6))}`, 'big', 249.0]]);
// every pointy shape
['square pyramid', 'cone', 'tetrahedron', 'heart pyramid'].forEach((w, i) => tag('shapes', 260 + i * 1.3, 265.2, w, [shapeX(i), FLOOR - .2, 5.2]));
card('shapes', 259.8, 265.2, 405, 52, 470, [['every pointy shape, same rule?', 'small', 259.8], ['V = ⅓ × S × H', 'big', 261.4], ['S = base area   H = height', 'small', 262.4]]);
tag('side', 276.6, 286.6, 'H', [6, FLOOR + 4, .3], '#ff8a8a'); tag('side', 281.4, 286.6, 'k', [-.6, FLOOR + 5.2, .3], '#8ae0ff'); tag('side', 274, 286.6, 'B', [0, FLOOR - .6, 1.4]); tag('side', 282.6, 286.6, 'B × k ÷ H', [wk + 1.6, yk + .3, .3], '#ffd75e');
card('side', 272.2, 286.6, 40, 60, 480, [['the sides are straight lines from the point', 'small', 272.2], ['k of the way down → k/H as wide', 'big', 280.6], ['just like the 2D triangle', 'gold', 282.6]]);
tag('base', 291.6, 299.4, 'B', [5, FLOOR + 1.6, 5]); tag('base', 292.8, 299.4, '½ B', [5, FLOOR + 2.6, 2.8], '#ffd75e'); tag('base', 292.8, 299.4, '½ B', [8.6, FLOOR + 2.6, 0], '#ffd75e'); tag('base', 294.6, 299.4, '¼ of the area', [5, FLOOR + 2.6, 0], '#ffd75e');
tag('base', 306.6, 309.6, 'a quarter of the heart', [-8, FLOOR + 2.6, 0], '#ffd75e');
card('base', 287.2, 299.4, 390, 52, 500, [['a layer shrinks in width AND in depth', 'small', 287.2], ['× k/H  and  × k/H  →  × (k/H)²', 'big', 291.4], ['layer = S × (k/H)²', 'gold', 296.4]]);
card('heartpyr', 310.4, 319.2, 40, 60, 560, [['add up every layer, from k = 1 to H', 'small', 310.4], ['Σ S × (k/H)² = S/H² × Σk²', 'big', 312.2], ['= S/H² × ⅓H³ = ⅓ × S × H', 'gold', 315.4]]);
card('ending', 324.6, 331.4, 40, 60, 470, [['triangle: ½ × B × H', '', 324.8], ['pyramid & cone: ⅓ × S × H', '', 325.8], ['ball: ⁴⁄₃ × π × R³', '', 326.8], ['大东西，都是一层一层加起来的', 'zh', 328]]);

function overlay(ink, t, shot) {
  for (const c of CARDS) {
    if (c.scene !== shot.scene || t < c.from || t > c.to) continue;
    const a = Math.min(ease((t - c.from) / .45), 1 - ease((t - c.to + .45) / .45)); if (a <= 0) continue;
    const rows = c.rows.filter(r => t >= r[2]), h = 26 + rows.reduce((s, [, st]) => s + ROW[st][0], 0);
    ink.globalAlpha = a; ink.fillStyle = 'rgba(28,52,40,.88)'; ink.strokeStyle = '#c9a86a'; ink.lineWidth = 3; ink.beginPath(); ink.roundRect(c.x, c.y, c.w, h, 10); ink.fill(); ink.stroke();
    let cy = c.y + 18;
    for (const [words, st, at] of rows) { const [size, font, color] = ROW[st]; cy += size; ink.globalAlpha = a * ease((t - at) / .4); text(ink, typeof words === 'function' ? words(t) : words, c.x + c.w / 2, cy - 10, font, color, 'center', 0); }
    ink.globalAlpha = 1;
  }
  for (const g of TAGS) {
    if (g.scene !== shot.scene || t < g.from || t > g.to) continue;
    const a = Math.min(ease((t - g.from) / .35), 1 - ease((t - g.to + .35) / .35)); if (a <= 0) continue;
    const [x, y, z] = project(g.p); if (z > 1) continue;
    ink.globalAlpha = a; ink.font = '600 19px Cambria, Georgia, serif'; const w = ink.measureText(g.words).width + 18;
    ink.fillStyle = 'rgba(20,24,22,.72)'; ink.beginPath(); ink.roundRect(x - w / 2, y - 15, w, 28, 6); ink.fill(); text(ink, g.words, x, y + 6, '600 19px Cambria, Georgia, serif', g.color, 'center', 0); ink.globalAlpha = 1;
  }
}

// ------------------------------------------------------------------ sound cues, matched to the builds above
const clicks = (from, to, n, v) => ({ kind: 'clicks', from, to, n, v });
const BUILD_CUES = [
  clicks(33.9, 38.4, 21), { kind: 'pop', at: 56.9 }, { kind: 'whoosh', at: 58.2, dur: 1.4 }, { kind: 'whoosh', at: 59.8, dur: 1.3, v: .05 }, { kind: 'thunk', at: 61.2 },
  clicks(82.4, 83.4, 10, .1), clicks(83.9, 84.9, 14, .09), clicks(85.4, 86.4, 18, .08), { kind: 'shimmer', at: 87.0 },
  clicks(103.6, 108.8, 32), clicks(109, 110.4, 18), clicks(110.6, 111.9, 10), clicks(112.1, 113.4, 4),
  { kind: 'whoosh', at: 122.2, dur: 1.2, v: .05 },
  ...six.map((_, i) => ({ kind: 'pop', at: 133.9 + i * .25, v: .08 })), ...six.map((_, i) => ({ kind: 'whoosh', at: 135.4 + i * .35, dur: 3.4, v: .05 })), { kind: 'thunk', at: 140.9, v: .35 }, { kind: 'shimmer', at: 145.2, v: .1 },
  ...[0, 1, 2, 3].map(i => clicks(157.5 + i * 1.2, 158.3 + i * 1.2, 10, .1)),
  { kind: 'whoosh', at: 165, dur: 3.2, v: .05 }, { kind: 'whoosh', at: 165.4, dur: 2.4, v: .04 }, { kind: 'thunk', at: 168.4, v: .25 }, { kind: 'whoosh', at: 173.4, dur: 1.8, v: .05 }, { kind: 'whoosh', at: 175.2, dur: 2.4, v: .05 }, { kind: 'thunk', at: 177.6, v: .25 },
  clicks(191.4, 197.4, 26), { kind: 'ding', at: 197.4 }, { kind: 'ding', at: 198.4 }, { kind: 'ding', at: 199.4 },
  clicks(210.4, 215.8, 30), { kind: 'shimmer', at: 213.6, v: .07 },
  { kind: 'whoosh', at: 229.8, dur: 3.6, v: .05 }, { kind: 'thunk', at: 235.2, v: .35 },
  { kind: 'pour', from: 249.4, to: 258 },
  ...[0, 1, 2, 3].map(i => clicks(259.6 + i * 1.3, 261 + i * 1.3, 12, .1)),
  { kind: 'ding', at: 273.6 }, { kind: 'ding', at: 276.4 }, { kind: 'ding', at: 281.2 }, { kind: 'ding', at: 282.4 },
  { kind: 'whoosh', at: 287.4, dur: 3, v: .04 }, { kind: 'thunk', at: 290.4, v: .25 }, { kind: 'ding', at: 291.4 }, { kind: 'ding', at: 292.6 }, { kind: 'whoosh', at: 303.6, dur: 3, v: .04 }, { kind: 'thunk', at: 306.6, v: .25 },
  clicks(310.8, 316, 30),
];

// ------------------------------------------------------------------ mount
await D.mount({
  shots, directors, reset, light, grade, overlay, wavBase64,
  soundtrack: () => buildVolumeSoundtrack(story, { BASE, builds: BUILD_CUES }),
});
