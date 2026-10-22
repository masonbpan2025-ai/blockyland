// 1500 Players · the cast. Blocky versions of the characters from Pocoyo, Gabby's Dollhouse and Dragon Ball,
// built from boxes with hand-painted pixel faces (front faces are painted at a finer grid than the body, so eyes
// and mouths read in close-up). Every character shares one small rig: root → hips → torso → head / arms, and legs,
// so the same poses (stand, walk, wave, fly, sit, charge) work for a duck, a panda and a Saiyan.
import * as T from 'three';

const loaderCache = new Map();
/** A canvas texture drawn at `d` pixels per block; draw(p, w, h) paints in pixel units. */
export function paint(wBlocks, hBlocks, draw, d = 16) {
  const w = Math.max(1, Math.round(wBlocks * d)), h = Math.max(1, Math.round(hBlocks * d));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const p = c.getContext('2d');
  p.imageSmoothingEnabled = false; draw(p, w, h);
  const t = new T.CanvasTexture(c); t.magFilter = t.minFilter = T.NearestFilter; t.generateMipmaps = false; t.colorSpace = T.SRGBColorSpace; return t;
}
const mats = new Map();
const flat = (color, emissive) => { const k = color + (emissive ?? ''); if (!mats.has(k)) mats.set(k, new T.MeshLambertMaterial({ color, emissive: emissive ?? 0x000000 })); return mats.get(k); };
// Simple fabric/fur noise so big surfaces do not look like plastic.
export const shadeHex = (c, k) => { const n = parseInt(c.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `#${[n >> 16, n >> 8 & 255, n & 255].map(v => f(v).toString(16).padStart(2, '0')).join('')}`; };
let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const noisy = (color, amt = .06) => (p, w, h) => { p.fillStyle = color; p.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const k = 1 + (rnd() - .5) * amt * 2; p.fillStyle = shadeHex(color, k); p.fillRect(x, y, 1, 1); } };

/**
 * A box whose six faces are a colour, a painter (p, w, h) or a texture. faces: { all, front, back, left, right, top, bottom }.
 * Front is −z (characters face −z, matching the films' `facing()`).
 */
export function cube(parent, size, at, faces = {}, { d = 16, rot, shadow = true } = {}) {
  const [sx, sy, sz] = size, pick = k => faces[k] ?? faces.sides ?? faces.all ?? '#ff00ff';
  const dims = { right: [sz, sy], left: [sz, sy], top: [sx, sz], bottom: [sx, sz], back: [sx, sy], front: [sx, sy] };
  const order = ['right', 'left', 'top', 'bottom', 'back', 'front'];
  const material = order.map(k => {
    const f = k === 'top' || k === 'bottom' ? (faces[k] ?? faces.all ?? faces.sides ?? '#ff00ff') : pick(k);
    if (f?.live) { const lf = liveFace(dims[k][0], dims[k][1], f.res ?? d, f.live); LIVE.push(lf); return new T.MeshLambertMaterial({ map: lf.texture }); }
    if (f?.isTexture) return new T.MeshLambertMaterial({ map: f });
    if (typeof f === 'function') return new T.MeshLambertMaterial({ map: paint(dims[k][0], dims[k][1], f, d) });
    if (typeof f === 'string' && f.startsWith('noise:')) return new T.MeshLambertMaterial({ map: paint(dims[k][0], dims[k][1], noisy(f.slice(6)), 16) });
    return flat(f);
  });
  const m = new T.Mesh(new T.BoxGeometry(sx, sy, sz), material);
  m.position.set(...at); if (rot) m.rotation.set(...rot); m.castShadow = m.receiveShadow = shadow; parent.add(m); return m;
}

// ------------------------------------------------------------------ face painting
// Faces are painted on a normalised grid: u, v in 0…1 across the front of the head. Faces are live: the director
// sets an expression every frame (blinks, lip-sync, smiles, brows), and the face repaints when it changes.
const F = (p, w, h) => ({ r: (u, v, uw, vh, c) => { p.fillStyle = c; p.fillRect(Math.round(u * w), Math.round(v * h), Math.max(1, Math.round(uw * w)), Math.max(1, Math.round(vh * h))); }, w, h, p });
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const NEUTRAL = { eyeOpen: 1, mouthOpen: 0, smile: 0, browY: 0, browTilt: 0, happy: 0, blush: 0, gazeX: 0 };
let EX = NEUTRAL, LIVE = [];
/** A face texture that repaints from draw(f) whenever the (quantised) expression changes. */
export function liveFace(wB, hB, d, draw) {
  const w = Math.max(1, Math.round(wB * d)), h = Math.max(1, Math.round(hB * d));
  const c = document.createElement('canvas'); c.width = w; c.height = h; const p = c.getContext('2d'); p.imageSmoothingEnabled = false;
  const texture = new T.CanvasTexture(c); texture.magFilter = texture.minFilter = T.NearestFilter; texture.generateMipmaps = false; texture.colorSpace = T.SRGBColorSpace;
  let key = null;
  const set = (e = {}) => {
    const q = { ...NEUTRAL, ...e }, r = (v, n) => Math.round(v * n) / n;
    const k = [r(clamp(q.eyeOpen, 0, 1.3), 6), r(clamp(q.mouthOpen), 5), r(q.smile, 3), r(q.browY, 3), r(q.browTilt, 3), r(q.happy, 2), r(q.blush, 2), r(q.gazeX, 3)].join();
    if (k === key) return; key = k;
    EX = q; p.clearRect(0, 0, w, h); draw(F(p, w, h)); EX = NEUTRAL; texture.needsUpdate = true;
  };
  set(); return { texture, set };
}
/** An eye that blinks and squints with the expression: an optional white, a pupil, a highlight and a lid in the face colour. */
function eyeRect(f, x, y, w, h, { white, pupil = '#141414', pw = .6, ph = .78, lid, shine = true } = {}) {
  const open = clamp(EX.eyeOpen * (1 - EX.happy * .3), 0, 1.15);
  if (open < .22) { f.r(x, y + h * .55, w, Math.max(.025, h * .14), pupil); return; }
  if (white) f.r(x, y, w, h, white);
  const iw = white ? w * pw : w, ih = white ? h * ph : h, gx = EX.gazeX * (w - iw) * .45;
  f.r(x + (w - iw) / 2 + gx, y + h - ih, iw, ih, pupil);
  if (shine) f.r(x + (w - iw) / 2 + gx + iw * .2, y + h - ih + ih * .12, iw * .32, ih * .24, '#ffffff');
  if (open < .98) f.r(x - .005, y - .005, w + .01, h * (1 - Math.min(1, open)) + .005, lid ?? f.skin ?? '#000');
}
/** A mouth that opens with the voice; closed() draws the character's own resting mouth. */
function talkMouth(f, cx, y, w, c, closed, tongue = '#d9646c') {
  const mo = EX.mouthOpen;
  if (mo > .1) { const h = .03 + .11 * Math.min(1, mo); f.r(cx - w * .35, y - h * .45, w * .7, h, c); if (mo > .35) f.r(cx - w * .2, y + h * .2, w * .4, h * .3, tongue); return; }
  closed();
}
const cheeks = (f, l, r, y, color = '#f2a0a0') => { if (EX.blush > .25) { f.p.globalAlpha = Math.min(.8, EX.blush); f.r(l, y, .12, .06, color); f.r(r, y, .12, .06, color); f.p.globalAlpha = 1; } };
function eyes(f, { y = .42, gap = .2, ew = .14, eh = .2, iris = '#1b1b1b', white = '#ffffff', shine = true, brows, browTilt = 0, browC = '#2a1a10', lashes = false, pupil = .7 }) {
  const by = EX.browY * .03, tilt = browTilt + EX.browTilt * 1.6;
  for (const s of [-1, 1]) {
    const cx = .5 + s * gap;
    eyeRect(f, cx - ew / 2, y, ew, eh, { white, pupil: iris, pw: pupil, ph: .8, shine });
    if (lashes) f.r(cx - ew / 2 - .02, y - .02, ew + .04, .03, '#151515');
    if (brows) { const bw = ew * 1.15; for (let i = 0; i < 4; i++) f.r(cx - bw / 2 + i * bw / 4, y - .09 + by - (s * (i - 1.5) * tilt * .02), bw / 4 + .005, .045, browC); }
  }
  cheeks(f, .5 - gap - .1, .5 + gap - .02, y + eh + .06);
}
function mouth(f, { y = .74, w = .22, kind = 'smile', c = '#5b1f1f', tongue = '#d9646c' }) {
  const x = .5 - w / 2;
  if (EX.mouthOpen > .1) return talkMouth(f, .5, y, w * 1.1, c, () => {}, tongue);
  if (EX.smile > .6 && kind !== 'grin') kind = 'smile'; else if (EX.smile < -.4) kind = 'frown';
  if (kind === 'smile') { f.r(x, y, w, .04, c); f.r(x - .03, y - .04, .04, .04, c); f.r(x + w - .01, y - .04, .04, .04, c); }
  else if (kind === 'grin') { f.r(x, y - .04, w, .1, c); f.r(x + .02, y - .04, w - .04, .035, '#ffffff'); f.r(x + w * .3, y + .02, w * .4, .04, tongue); }
  else if (kind === 'open') { f.r(x + w * .2, y - .05, w * .6, .12, c); f.r(x + w * .3, y + .02, w * .4, .05, tongue); }
  else if (kind === 'flat') f.r(x + w * .15, y, w * .7, .035, c);
  else if (kind === 'frown') { f.r(x + .02, y, w - .04, .035, c); f.r(x - .02, y + .035, .04, .035, c); f.r(x + w - .02, y + .035, .04, .035, c); }
  else if (kind === 'smirk') { f.r(x + w * .2, y, w * .7, .035, c); f.r(x + w * .85, y - .04, .04, .04, c); }
}

// ------------------------------------------------------------------ the rig
function rig({ legH, hipW = .5 }) {
  const root = new T.Group(), hips = new T.Group(), torso = new T.Group(), head = new T.Group();
  const armL = new T.Group(), armR = new T.Group(), legL = new T.Group(), legR = new T.Group();
  root.add(hips); hips.position.y = legH; hips.add(torso, legL, legR); torso.add(head, armL, armR);
  legL.position.x = -hipW / 4; legR.position.x = hipW / 4;
  Object.entries({ hips, torso, head, armL, armR, legL, legR }).forEach(([k, g]) => { g.name = k; });
  return { root, hips, torso, head, armL, armR, legL, legR, extras: {} };
}

/**
 * The common humanoid: sizes in blocks. o: { head:[w,h,d], body:[w,h,d], arm:[w,h], leg:[w,h], faces… }
 * Painters: headFront, headSides, hair (cap over the top), body (front/back/sides), arms, legs, hands, feet.
 */
function humanoid(o) {
  const [hw, hh, hd] = o.head, [bw, bh, bd] = o.body, [aw, al] = o.arm, [lw, lh] = o.leg;
  const R = rig({ legH: lh, hipW: bw });
  R.dims = { hw, hh, hd, bw, bh, bd, aw, al, lw, lh, height: lh + bh + hh };
  // legs: pivot at the hip, hanging down
  for (const [g, s] of [[R.legL, -1], [R.legR, 1]]) {
    g.position.x = s * (bw / 2 - lw / 2);
    const legFaces = o.legFaces?.(s) ?? { all: o.pants };
    cube(g, [lw, lh, Math.min(bd, lw * 1.05)], [0, -lh / 2, 0], legFaces);
    if (o.shoes) cube(g, [lw * 1.04, lh * .22, Math.min(bd, lw * 1.05) * 1.08], [0, -lh + lh * .11, -.01], { all: o.shoes, top: o.shoes });
  }
  R.torso.position.y = 0;
  const bodyFaces = o.bodyFaces ?? { all: o.shirt };
  cube(R.torso, [bw, bh, bd], [0, bh / 2, 0], bodyFaces, { d: 32 });
  // arms: pivot at the shoulder
  for (const [g, s] of [[R.armL, -1], [R.armR, 1]]) {
    g.position.set(s * (bw / 2 + aw / 2), bh - aw / 2, 0);
    cube(g, [aw, al, aw], [0, -al / 2 + aw / 2, 0], o.armFaces?.(s) ?? { all: o.sleeve ?? o.shirt });
    if (o.hands !== false) cube(g, [aw * 1.02, aw * .9, aw * 1.02], [0, -al + aw * .95, 0], { all: o.hands ?? o.skin });
  }
  R.head.position.y = bh;
  const front = o.face ? { live: f => { f.skin = o.skin; f.r(0, 0, 1, 1, o.faceBg ?? o.skin); o.face(f); }, res: o.faceRes ?? 64 } : o.skin;
  cube(R.head, [hw, hh, hd], [0, hh / 2, 0], { front, back: o.headBack ?? o.skin, sides: o.headSides ?? o.skin, top: o.headTop ?? o.skin, bottom: o.skin }, { d: o.faceRes ?? 64 });
  o.extras?.(R);
  return R;
}

// hair/costume helpers ------------------------------------------------------------
/** A spike: a tapered stack of boxes pointing along dir (from a base point), in the head's local frame. */
function spike(parent, base, dir, len, w, color, steps = 4) {
  const g = new T.Group(); parent.add(g); g.position.set(...base);
  const d = new T.Vector3(...dir).normalize(); g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d);
  for (let i = 0; i < steps; i++) { const k = 1 - i / steps, s = w * (k * .85 + .15); cube(g, [s, len / steps + .01, s], [0, (i + .5) * len / steps, 0], { all: color }, { shadow: true }); }
  return g;
}
/** Anime hair: a sharp square pyramid from base along dir (crisper silhouette than a stepped spike). */
const hairMats = new Map();
function blade(parent, base, dir, len, w, color, { flat = 1 } = {}) {
  if (!hairMats.has(color)) hairMats.set(color, new T.MeshLambertMaterial({ color, flatShading: true }));
  const m = new T.Mesh(new T.ConeGeometry(w * .7071, len, 4), hairMats.get(color)); m.geometry.rotateY(Math.PI / 4); m.geometry.translate(0, len / 2, 0); m.scale.z = flat;
  const g = new T.Group(); g.add(m); parent.add(g); g.position.set(...base);
  g.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3(...dir).normalize()); m.castShadow = true; return g;
}
const hairCap = (R, color, { front = .08, back = .3, sides = .2, top = .08 } = {}) => {
  const { hw, hh, hd } = R.dims;
  cube(R.head, [hw + .04, top, hd + .04], [0, hh + top / 2, 0], { all: color });
  cube(R.head, [hw + .04, hh * back * 2, .04], [0, hh - hh * back, hd / 2 + .02], { all: color });
  for (const s of [-1, 1]) cube(R.head, [.04, hh * sides * 2, hd + .04], [s * (hw / 2 + .02), hh - hh * sides, 0], { all: color });
  if (front) cube(R.head, [hw + .04, hh * front * 2, .04], [0, hh - hh * front, -hd / 2 - .02], { all: color });
};
const giFront = (gi, under, belt, symbol) => (p, w, h) => {
  const f = F(p, w, h); f.r(0, 0, 1, 1, gi);
  // V-neck showing the undershirt, crossed lapels, belt
  for (let i = 0; i < 10; i++) f.r(.5 - .2 + i * .02, 0, .4 - i * .04, .045, under);
  f.r(.47, 0, .06, .5, shadeHex(gi, .8)); f.r(0, .8, 1, .12, belt);
  if (symbol) { f.r(.12, .16, .2, .2, '#fbf6e8'); f.r(.17, .2, .1, .12, symbol); }
};
const SKIN = { light: '#f5c9a3', fair: '#f8d5b8', tan: '#d9a274', brown: '#8d5a3b' };

// ------------------------------------------------------------------ Dragon Ball
function goku({ ssj = false, torn = 0, scale = 1, kid = false, leather = false } = {}) {
  const hair = ssj ? '#ffd83b' : '#141414', gi = leather ? '#8a5a36' : '#f2711c', blue = leather ? '#5e3b22' : '#1f4fa8';
  const R = humanoid({
    head: [.52, .52, .5], body: [.5, .66, .28], arm: [.2, .66], leg: [.22, .74], skin: SKIN.light,
    bodyFaces: { front: giFront(gi, blue, blue, '#141414'), back: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, gi); f.r(.3, .2, .4, .34, '#fbf6e8'); f.r(.42, .26, .16, .22, '#141414'); f.r(0, .8, 1, .12, blue); }, sides: gi, top: gi },
    armFaces: () => ({ all: SKIN.light }), sleeve: blue, pants: gi, shoes: blue,
    face: f => {
      eyes(f, { y: .4, gap: .19, ew: .17, eh: .18, iris: ssj ? '#1aa9a0' : '#1b1b1b', brows: true, browTilt: ssj ? 2.4 : .6, browC: hair });
      f.r(.48, .58, .05, .08, shadeHex(SKIN.light, .85)); mouth(f, { kind: ssj ? 'flat' : 'grin', y: .76, w: .24 });
    },
  });
  // blue wristbands + sash tails
  for (const g of [R.armL, R.armR]) cube(g, [.21, .16, .21], [0, -.48, 0], { all: blue });
  cube(R.torso, [.12, .2, .05], [.14, .02, -.16], { all: blue });
  // hair: bangs over the forehead and big spikes fanning up and back
  const { hh } = R.dims, H = R.head;
  hairCap(R, hair, { front: .1, back: .42, sides: .3, top: .1 });
  const up = ssj ? 1.3 : 1, B = (x, y, z, dx, dy, dz, l, w) => blade(H, [x, y, z], [dx, dy, dz], l, w, hair);
  // bangs: three blades falling over the forehead
  B(-.15, hh * .98, -.25, -.35, -1, -.3, .24, .14); B(0, hh, -.26, .05, -1, -.35, .26, .15); B(.15, hh * .98, -.25, .4, -1, -.3, .22, .13);
  // the crown: big blades fanning up, out and back
  B(-.18, hh + .02, -.04, -.6, .55 * up, -.15, .62 * up, .26); B(.18, hh + .02, -.04, .65, .5 * up, -.15, .62 * up, .26); B(0, hh + .04, 0, 0, 1, .05, .58 * up, .28);
  B(-.1, hh + .02, .14, -.35, .75 * up, .7, .66 * up, .28); B(.1, hh + .02, .14, .35, .75 * up, .7, .66 * up, .28);
  B(-.26, hh * .78, .04, -1, .3 * up, .05, .5, .24); B(.26, hh * .78, .04, 1, .3 * up, .05, .5, .24);
  B(-.18, hh * .6, .24, -.6, .15, 1, .46, .24); B(.18, hh * .6, .24, .6, .15, 1, .46, .24); B(0, hh * .8, .25, 0, .45 * up, 1, .55, .26);
  B(-.26, hh * .42, -.02, -1, -.35, .1, .26, .16); B(.26, hh * .42, -.02, 1, -.35, .1, .26, .16);
  if (torn) { cube(R.torso, [.18, .22, .02], [-.12, .3, -.15], { all: SKIN.light }); cube(R.torso, [.14, .16, .02], [.15, .48, -.15], { all: blue }); }
  R.root.scale.setScalar(scale); return R;
}
function vegeta() {
  const blue = '#22336f', white = '#f4f2ea', gold = '#e8c04a', hair = '#141414';
  const R = humanoid({
    head: [.5, .5, .48], body: [.5, .64, .3], arm: [.2, .64], leg: [.22, .72], skin: SKIN.light,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, white); f.r(.36, 0, .28, .07, blue); for (let i = 0; i < 3; i++) f.r(.15, .55 + i * .12, .7, .06, shadeHex(white, .85)); }, back: white, sides: white, top: white },
    armFaces: () => ({ all: blue }), pants: blue, shoes: white, hands: white,
    face: f => { eyes(f, { y: .42, gap: .18, ew: .16, eh: .14, brows: true, browTilt: 3.2, browC: hair }); f.r(.48, .58, .05, .08, shadeHex(SKIN.light, .85)); mouth(f, { kind: 'frown', y: .76, w: .2 }); },
  });
  for (const s of [-1, 1]) { cube(R.torso, [.16, .08, .32], [s * .27, .62, 0], { all: gold }); cube(R.torso, [.08, .66, .02], [s * .14, .33, -.155], { all: gold }); }
  for (const g of [R.legL, R.legR]) cube(g, [.23, .06, .23], [0, -.52, 0], { all: gold });
  for (const g of [R.armL, R.armR]) cube(g, [.21, .2, .21], [0, -.42, 0], { all: white });
  // flame hair: a widow's peak and one tall upward blaze
  const { hh } = R.dims, H = R.head;
  hairCap(R, hair, { front: 0, back: .35, sides: .22, top: .08 });
  cube(H, [.16, .12, .04], [0, hh - .04, -.26], { all: hair }); cube(H, [.08, .08, .04], [0, hh - .14, -.26], { all: hair });
  for (const [x, z, dx, dz, l, w] of [[0, 0, 0, -.04, .95, .4], [-.13, .02, -.2, .04, .8, .3], [.13, .02, .2, .04, .8, .3], [-.22, .05, -.42, .08, .6, .26], [.22, .05, .42, .08, .6, .26], [0, .16, 0, .3, .78, .32], [-.1, -.12, -.12, -.2, .66, .24], [.1, -.12, .12, -.2, .66, .24], [-.24, -.04, -.6, -.1, .4, .2], [.24, -.04, .6, -.1, .4, .2]])
    blade(H, [x, hh - .02, z], [dx, 1, dz], l, w, hair);
  return R;
}
function frieza() {
  const white = '#f6f3f6', purple = '#7b3fa0', R = humanoid({
    head: [.46, .5, .46], body: [.42, .56, .26], arm: [.17, .6], leg: [.19, .66], skin: white,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, white); f.r(.15, .05, .7, .3, purple); f.r(.3, .45, .4, .05, '#d9d0dc'); f.r(.3, .58, .4, .05, '#d9d0dc'); }, back: white, sides: white, top: white },
    armFaces: () => ({ all: white }), pants: white, shoes: white,
    face: f => { f.r(.12, .3, .3, .08, purple); f.r(.58, .3, .3, .08, purple); eyes(f, { y: .4, gap: .18, ew: .16, eh: .12, iris: '#c71b2f', brows: false }); mouth(f, { kind: 'smirk', y: .74, w: .2, c: '#3d1250' }); f.r(.4, .72, .2, .04, purple); },
  });
  const { hh, hd } = R.dims, H = R.head;
  cube(H, [.42, .12, .42], [0, hh + .02, 0], { all: purple }); cube(H, [.3, .08, .3], [0, hh + .1, 0], { all: purple });
  for (const s of [-1, 1]) { cube(R.torso, [.12, .1, .2], [s * .26, .52, 0], { all: purple }); }
  for (const g of [R.armL, R.armR]) cube(g, [.18, .12, .18], [0, -.3, 0], { all: purple });
  for (const g of [R.legL, R.legR]) cube(g, [.2, .12, .2], [0, -.34, -.01], { all: purple });
  // tail: a curved chain of segments behind
  const tail = new T.Group(); R.hips.add(tail); tail.position.set(0, .05, .14);
  let px = 0, py = 0, pz = 0; for (let i = 0; i < 9; i++) { const a = i / 8; pz += .1; py = -Math.sin(a * 2.6) * .25 + a * .1; px = Math.sin(a * 3) * .1; cube(tail, [.1 - a * .04, .1 - a * .04, .12], [px, py, pz], { all: i === 8 ? purple : white }); }
  R.extras.tail = tail; R.root.scale.setScalar(.9); return R;
}
/** A bride's veil down the back of the head and a ring of little flowers over the brow. */
function veil(R) {
  const { hw, hh, hd } = R.dims;
  const v = cube(R.head, [hw + .26, hh * 1.5, .03], [0, hh * .35, hd / 2 + .07], { all: '#fbfaf6' }); v.rotation.x = .1; // wider than the head, so it shows from the front
  for (let i = 0; i < 7; i++) cube(R.head, [.055, .055, .055], [-hw / 2 + .04 + i * (hw - .08) / 6, hh + .05 + (i % 2) * .012, -hd / 2 + .06 + (i % 2) * .02], { all: i % 2 ? '#ffd1e3' : '#ffffff' }); // flowers spaced apart and staggered: no shared faces
}
/** A groom's black bow tie at the collar. */
export function bowTie(R) {
  const { bh, bd } = R.dims, at = [0, bh - .08, -bd / 2 - .03];
  cube(R.torso, [.07, .07, .05], at, { all: '#141414' });
  for (const s of [-1, 1]) cube(R.torso, [.1, .09, .03], [s * .085, at[1], at[2] + .005], { all: '#222222' });
}
function bulma({ bride = false } = {}) {
  const hair = '#36c4c3', dress = bride ? '#f8f6f0' : '#e65c8a', R = humanoid({
    head: [.5, .5, .48], body: [.44, .62, .26], arm: [.17, .62], leg: [.2, .7], skin: SKIN.fair,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, dress); f.r(0, .82, 1, .18, shadeHex(dress, .85)); f.r(.36, 0, .28, .06, SKIN.fair); }, back: dress, sides: dress, top: dress },
    armFaces: () => ({ all: SKIN.fair }), pants: SKIN.fair, shoes: '#7b3a2c', legFaces: () => ({ all: SKIN.fair }),
    face: f => { eyes(f, { y: .4, gap: .19, ew: .16, eh: .2, iris: '#2b7fd1', lashes: true, brows: true, browC: hair }); mouth(f, { kind: 'smile', y: .76, w: .18, c: '#b03a4a' }); },
  });
  hairCap(R, hair, { front: .12, back: .5, sides: .55, top: .08 });
  cube(R.head, [.5, .08, .2], [0, R.dims.hh - .1, -.18], { all: hair });
  cube(R.hips, [.52, .2, .34], [0, -.05, 0], { all: dress }); // skirt
  if (bride) { cube(R.hips, [.6, .5, .4], [0, -.3, 0], { all: dress }); veil(R); } // a long white skirt
  else cube(R.head, [.18, .07, .05], [.12, R.dims.hh + .04, -.2], { all: '#d6383f' }); // ribbon
  return R;
}
function chiChi({ bride = false } = {}) {
  const hair = '#151515', dress = bride ? '#f8f6f0' : '#8a3fb8', trim = bride ? '#f2c9dc' : '#f2c14e', R = humanoid({
    head: [.48, .5, .46], body: [.44, .62, .26], arm: [.17, .62], leg: [.2, .68], skin: SKIN.fair,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, dress); f.r(.44, 0, .12, .5, trim); f.r(.44, .02, .3, .06, trim); f.r(0, .78, 1, .1, '#e8584a'); }, back: dress, sides: dress, top: dress },
    armFaces: () => ({ all: dress }), pants: bride ? dress : '#2f3a7a', shoes: '#151515', hands: SKIN.fair,
    face: f => { eyes(f, { y: .42, gap: .18, ew: .16, eh: .19, iris: '#1b1b1b', lashes: true, brows: true, browTilt: .9, browC: hair }); mouth(f, { kind: 'smile', y: .76, w: .17, c: '#b03a4a' }); },
  });
  hairCap(R, hair, { front: .1, back: .45, sides: .35, top: .08 });
  const { hh } = R.dims;
  cube(R.head, [.24, .22, .2], [0, hh * .78, .32], { all: hair }); // the bun
  for (const s of [-1, 1]) cube(R.head, [.06, .3, .06], [s * .2, hh * .55, -.24], { all: hair }); // side bangs
  if (bride) { cube(R.hips, [.56, .5, .38], [0, -.3, 0], { all: dress }); veil(R); }
  return R;
}
function android18({ bride = false } = {}) {
  const hair = '#f1d27e', denim = '#3d6fb5', R = humanoid({
    head: [.48, .5, .46], body: [.44, .62, .26], arm: [.17, .62], leg: [.2, .7], skin: SKIN.fair,
    bodyFaces: bride ? { all: '#f8f6f0' } : { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, denim); for (let i = 0; i < 6; i++) f.r(.32, i / 6, .36, 1 / 12, i % 2 ? '#f4f4f4' : '#1c1c1c'); f.r(.3, .9, .4, .1, '#1c1c1c'); }, back: denim, sides: denim, top: denim },
    armFaces: () => (bride ? { all: '#f8f6f0' } : { all: (p, w, h) => { const f = F(p, w, h); for (let i = 0; i < 8; i++) f.r(0, i / 8, 1, 1 / 8, i % 2 ? '#f4f4f4' : '#1c1c1c'); } }),
    pants: bride ? '#f8f6f0' : '#2f5a9a', shoes: '#5a3a28', hands: SKIN.fair,
    face: f => { eyes(f, { y: .42, gap: .18, ew: .16, eh: .17, iris: '#3d7fd1', lashes: true, brows: true, browTilt: .4, browC: '#c9a24e' }); mouth(f, { kind: 'flat', y: .76, w: .15, c: '#b05a5a' }); },
  });
  hairCap(R, hair, { front: .14, back: .62, sides: .62, top: .08 }); // a straight bob to the jaw
  cube(R.head, [.5, .1, .18], [0, R.dims.hh - .08, -.17], { all: hair }); // the fringe swept to one side
  for (const s of [-1, 1]) cube(R.head, [.03, .07, .07], [s * .27, R.dims.hh * .3, 0], { all: '#e8c04a' }); // earrings
  if (bride) { cube(R.hips, [.56, .5, .38], [0, -.3, 0], { all: '#f8f6f0' }); veil(R); }
  return R;
}
/** The couples' daughters: Bulla (Vegeta and Bulma) and Marron (Krillin and 18). */
function kidGirl(kind) {
  const bulla = kind === 'bulla', hair = bulla ? '#36c4c3' : '#f1d27e', dress = bulla ? '#d6383f' : '#f27fb7', R = humanoid({
    head: [.52, .52, .5], body: [.46, .56, .28], arm: [.18, .54], leg: [.2, .56], skin: SKIN.fair,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, dress); f.r(.4, 0, .2, .07, SKIN.fair); f.r(0, .86, 1, .14, shadeHex(dress, .85)); }, back: dress, sides: dress, top: dress },
    armFaces: () => ({ all: SKIN.fair }), pants: SKIN.fair, legFaces: () => ({ all: SKIN.fair }), shoes: bulla ? '#7b3a2c' : '#e8584a',
    face: f => { eyes(f, { y: .42, gap: .19, ew: .17, eh: .21, iris: bulla ? '#2b7fd1' : '#3d7fd1', lashes: true, brows: true, browC: hair }); mouth(f, { kind: 'grin', y: .76, w: .2, c: '#b03a4a' }); },
  });
  cube(R.hips, [.5, .18, .32], [0, -.04, 0], { all: dress }); // skirt
  if (bulla) { hairCap(R, hair, { front: .2, back: .5, sides: .45, top: .08 }); cube(R.head, [.56, .08, .52], [0, R.dims.hh - .02, 0], { all: '#d6383f' }); }
  else { hairCap(R, hair, { front: .18, back: .35, sides: .3, top: .08 }); for (const s of [-1, 1]) { cube(R.head, [.1, .1, .1], [s * .31, R.dims.hh * .82, .04], { all: '#e8584a' }); cube(R.head, [.14, .3, .14], [s * .38, R.dims.hh * .6, .04], { all: hair }); } } // two pigtails with red bobbles
  R.root.scale.setScalar(.58); return R;
}
function drBriefs() {
  const hair = '#b9b5ca', R = humanoid({
    head: [.48, .48, .46], body: [.46, .6, .28], arm: [.18, .6], leg: [.2, .62], skin: SKIN.light,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, '#f3f3f0'); f.r(.42, 0, .16, 1, '#3b3f55'); f.r(.44, 0, .12, .1, '#e7e1d0'); }, back: '#f3f3f0', sides: '#f3f3f0', top: '#f3f3f0' },
    armFaces: () => ({ all: '#f3f3f0' }), pants: '#3b3f55', shoes: '#2b2b2b',
    face: f => { eyes(f, { y: .42, gap: .17, ew: .1, eh: .07, iris: '#1b1b1b', white: null, shine: false, brows: true, browC: hair }); f.r(.2, .6, .6, .1, hair); mouth(f, { kind: 'smile', y: .78, w: .14 }); },
  });
  hairCap(R, hair, { front: .05, back: .45, sides: .38, top: .1 });
  for (const s of [-1, 1]) spike(R.head, [s * .24, R.dims.hh * .7, 0], [s, .4, 0], .18, .12, hair);
  // Tama, the black cat on his shoulder
  const cat = new T.Group(); R.torso.add(cat); cat.position.set(.2, .66, .02);
  cube(cat, [.18, .14, .26], [0, .08, 0], { all: '#1f1f22' }); cube(cat, [.16, .14, .14], [0, .17, -.15], { all: '#1f1f22', front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, '#1f1f22'); f.r(.2, .35, .18, .18, '#f2d94a'); f.r(.62, .35, .18, .18, '#f2d94a'); } });
  for (const s of [-1, 1]) cube(cat, [.04, .06, .03], [s * .05, .27, -.16], { all: '#1f1f22' });
  R.root.scale.setScalar(.92); return R;
}
function krillin({ leather = false } = {}) {
  const gi = leather ? '#8a5a36' : '#f2711c', blue = leather ? '#5e3b22' : '#1f4fa8', R = humanoid({
    head: [.5, .5, .48], body: [.44, .56, .26], arm: [.18, .56], leg: [.2, .56], skin: SKIN.light,
    bodyFaces: { front: giFront(gi, blue, blue, '#141414'), back: gi, sides: gi, top: gi }, armFaces: () => ({ all: SKIN.light }), pants: gi, shoes: blue,
    headTop: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, SKIN.light); for (const [u, v] of [[.3, .15], [.5, .15], [.7, .15], [.3, .3], [.5, .3], [.7, .3]]) f.r(u - .04, v, .08, .08, '#5a3a28'); },
    face: f => { for (const [u, v] of [[.32, .08], [.5, .08], [.68, .08]]) f.r(u - .03, v, .06, .06, '#5a3a28'); eyes(f, { y: .42, gap: .18, ew: .15, eh: .18, brows: true, browC: '#2a1a10' }); mouth(f, { kind: 'grin', y: .76, w: .22 }); },
  });
  for (const g of [R.armL, R.armR]) cube(g, [.19, .14, .19], [0, -.4, 0], { all: blue });
  R.root.scale.setScalar(.82); return R;
}
function yamcha({ leather = false } = {}) {
  const gi = leather ? '#8a5a36' : '#f2711c', blue = leather ? '#5e3b22' : '#1f4fa8', hair = '#141414', R = humanoid({
    head: [.5, .5, .48], body: [.5, .66, .28], arm: [.2, .66], leg: [.22, .74], skin: SKIN.tan,
    bodyFaces: { front: giFront(gi, blue, blue, '#141414'), back: gi, sides: gi, top: gi }, armFaces: () => ({ all: SKIN.tan }), pants: gi, shoes: blue,
    face: f => { eyes(f, { y: .42, gap: .18, ew: .15, eh: .16, brows: true, browTilt: -.6, browC: hair }); f.r(.24, .3, .03, .3, '#8a4e36'); f.r(.66, .55, .12, .03, '#8a4e36'); mouth(f, { kind: 'smile', y: .76, w: .2 }); },
  });
  hairCap(R, hair, { front: .16, back: .55, sides: .45, top: .1 });
  for (const s of [-1, 0, 1]) blade(R.head, [s * .14, R.dims.hh + .02, .1], [s * .4, .45, 1], .4, .22, hair);
  return R;
}
function gohan({ scarred = false } = {}) {
  const gi = '#4a2f7a', sash = '#d83a3a', hair = '#141414', R = humanoid({
    head: [.52, .52, .5], body: [.52, .68, .3], arm: [.21, .68], leg: [.23, .76], skin: SKIN.light,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, gi); for (let i = 0; i < 10; i++) f.r(.3 + i * .02, 0, .4 - i * .04, .045, SKIN.light); f.r(0, .8, 1, .12, sash); if (scarred) { f.r(.1, .3, .2, .16, SKIN.light); f.r(.68, .5, .18, .14, SKIN.light); } }, back: gi, sides: gi, top: gi },
    armFaces: () => ({ all: gi }), pants: gi, shoes: '#6b4a2c',
    face: f => { eyes(f, { y: .42, gap: .19, ew: .16, eh: .16, brows: true, browTilt: 1.2, browC: hair }); if (scarred) f.r(.66, .3, .03, .22, '#a5574a'); mouth(f, { kind: 'flat', y: .76, w: .2 }); },
  });
  for (const g of [R.armL, R.armR]) cube(g, [.22, .14, .22], [0, -.52, 0], { all: sash });
  hairCap(R, hair, { front: .12, back: .38, sides: .26, top: .1 });
  for (const [x, z, dx, dy, dz, l, w] of [[-.16, 0, -.6, .7, 0, .42, .24], [.16, 0, .6, .7, 0, .42, .24], [0, .06, 0, .8, .45, .48, .26], [-.1, -.1, -.3, .8, -.35, .36, .22], [.1, -.1, .3, .8, -.35, .36, .22], [-.24, .1, -1, .2, .4, .34, .2], [.24, .1, 1, .2, .4, .34, .2], [0, -.2, .05, -1, -.5, .24, .14]])
    blade(R.head, [x, R.dims.hh + .02, z], [dx, dy, dz], l, w, hair);
  if (scarred) { // the training cape, slung over the shoulders
    const cape = cube(R.torso, [.62, .82, .04], [0, .3, .2], { all: '#f4f1e8' }); cape.rotation.x = .12; R.extras.cape = cape;
  }
  return R;
}
function videl({ bride = false } = {}) {
  const hair = '#151515', R = humanoid({
    head: [.48, .5, .46], body: [.44, .6, .26], arm: [.17, .6], leg: [.2, .68], skin: SKIN.fair,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, '#f3f2ee'); f.r(.4, 0, .2, .06, SKIN.fair); f.r(0, .88, 1, .12, '#262626'); }, back: '#f3f2ee', sides: '#f3f2ee', top: '#f3f2ee' },
    armFaces: () => ({ all: SKIN.fair }), pants: '#262626', shoes: '#c9c9c9', hands: '#151515',
    face: f => { eyes(f, { y: .4, gap: .18, ew: .16, eh: .2, iris: '#3d6fd1', lashes: true, brows: true, browTilt: .8, browC: hair }); mouth(f, { kind: 'smile', y: .76, w: .16, c: '#a43a46' }); },
  });
  hairCap(R, hair, { front: .14, back: .4, sides: .3, top: .08 });
  for (const s of [-1, 1]) { const g = spike(R.head, [s * .26, R.dims.hh * .55, .06], [s * .5, -1, .25], .36, .14, hair, 3); cube(R.head, [.06, .06, .06], [s * .27, R.dims.hh * .58, .06], { all: '#e8584a' }); }
  if (bride) { cube(R.torso, [.46, .62, .28], [0, .31, 0], { all: '#f8f6f0' }); cube(R.hips, [.56, .5, .38], [0, -.3, 0], { all: '#f8f6f0' }); veil(R); }
  return R;
}
function buu() {
  const pink = '#f5a6c3', R = humanoid({
    head: [.56, .5, .54], body: [.86, .78, .62], arm: [.24, .62], leg: [.3, .56], skin: pink,
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, pink); f.r(0, 0, .26, .7, '#242130'); f.r(.74, 0, .26, .7, '#242130'); f.r(.24, 0, .03, .7, '#e3b23c'); f.r(.73, 0, .03, .7, '#e3b23c'); f.r(0, .72, 1, .14, '#e3b23c'); f.r(.42, .73, .16, .12, '#3a2a62'); f.r(.45, .75, .1, .08, '#e3b23c'); }, back: '#5a2d82', sides: '#242130', top: '#242130' },
    armFaces: () => ({ all: pink }), pants: '#f3f1f6', shoes: '#e3b23c', hands: '#f3f1f6',
    face: f => { const sq = EX.eyeOpen < .22 ? .02 : 0; f.r(.18, .44 + sq, .2, .04, '#2a1a28'); f.r(.62, .44 + sq, .2, .04, '#2a1a28'); f.r(.14, .4 + EX.browY * .02, .06, .04, '#2a1a28'); f.r(.8, .4 + EX.browY * .02, .06, .04, '#2a1a28'); mouth(f, { kind: 'grin', y: .74, w: .3 }); f.r(.12, .58, .12, .07, '#f287ad'); f.r(.76, .58, .12, .07, '#f287ad'); },
  });
  // cape (purple, from the shoulders), antenna, holes on the head
  const cape = cube(R.torso, [.8, .95, .04], [0, .32, .34], { all: '#5a2d82' }); cape.rotation.x = .08;
  spike(R.head, [0, R.dims.hh, -.08], [0, 1, -.6], .32, .12, pink, 4);
  cube(R.hips, [.92, .22, .66], [0, -.02, 0], { all: '#f3f1f6' }); // baggy trousers
  R.root.scale.setScalar(1.05); return R;
}
function kidSaiyan(kind) {
  if (kind === 'goten') return goku({ scale: .62 });
  const hair = '#b9a6d8', R = humanoid({
    head: [.52, .52, .5], body: [.5, .62, .28], arm: [.2, .6], leg: [.22, .62], skin: SKIN.fair,
    bodyFaces: { front: giFront('#3fa35a', '#2a2a2a', '#f08b2a'), back: '#3fa35a', sides: '#3fa35a', top: '#3fa35a' }, armFaces: () => ({ all: SKIN.fair }), pants: '#3fa35a', shoes: '#f0c040',
    face: f => { eyes(f, { y: .42, gap: .19, ew: .17, eh: .2, iris: '#2d6bd1', brows: true, browC: hair }); mouth(f, { kind: 'grin', y: .76, w: .22 }); },
  });
  hairCap(R, hair, { front: .22, back: .45, sides: .4, top: .1 });
  R.root.scale.setScalar(.62); return R;
}

// ------------------------------------------------------------------ Pocoyo
function pocoyo() {
  const blue = '#3d8fe0', R = humanoid({
    head: [.78, .74, .72], body: [.5, .42, .38], arm: [.16, .36], leg: [.2, .3], skin: '#f9d9bf',
    bodyFaces: { all: blue }, armFaces: () => ({ all: blue }), pants: blue, shoes: blue, hands: '#f9d9bf',
    faceRes: 48,
    face: f => {
      // huge eyes, a dot nose, a little open smile: Pocoyo's face is mostly eyes
      for (const s of [-1, 1]) eyeRect(f, .5 + s * .16 - .1, .34, .2, .26, { white: '#ffffff', pupil: '#101010', pw: .6, ph: .7 });
      f.r(.47, .6, .06, .05, '#f0a98a'); talkMouth(f, .5, .74, .18, '#8a2d2d', () => { f.r(.42, .72, .16, .06, '#8a2d2d'); f.r(.45, .76, .1, .03, '#e46c6c'); }); f.r(.16, .64, .1, .06, '#f6b3a6'); f.r(.74, .64, .1, .06, '#f6b3a6');
    },
  });
  // the blue hood covering the top, sides and back of the big round head
  const { hw, hh, hd } = R.dims, H = R.head;
  cube(H, [hw + .06, .18, hd + .06], [0, hh - .04, 0], { all: blue }); cube(H, [hw + .02, .1, hd - .1], [0, hh + .08, .02], { all: blue });
  cube(H, [hw + .06, hh - .1, .06], [0, (hh - .1) / 2, hd / 2 + .03], { all: blue });
  for (const s of [-1, 1]) cube(H, [.06, hh * .7, hd + .06], [s * (hw / 2 + .03), hh * .58, 0], { all: blue });
  cube(H, [hw + .06, .06, .06], [0, hh - .16, -hd / 2 - .02], { all: shadeHex(blue, .8) }); // hood rim
  R.root.scale.setScalar(.95); return R;
}
function elly() {
  const pink = '#f39cc4', R = humanoid({
    head: [.7, .62, .62], body: [.62, .55, .5], arm: [.22, .44], leg: [.26, .38], skin: pink,
    bodyFaces: { all: pink }, armFaces: () => ({ all: pink }), pants: pink, shoes: shadeHex(pink, .85), hands: pink,
    face: f => { for (const s of [-1, 1]) eyeRect(f, .5 + s * .2 - .07, .34, .14, .18, { white: '#ffffff', pupil: '#151515', pw: .58, ph: .66 }); f.r(.36, .25 + EX.browY * .02, .1, .04, shadeHex(pink, .7)); f.r(.6, .25 + EX.browY * .02, .1, .04, shadeHex(pink, .7)); talkMouth(f, .5, .79, .2, '#9c3b62', () => f.r(.4, .78, .2, .04, '#9c3b62')); },
  });
  const H = R.head, { hh } = R.dims;
  // big ears, a curling trunk, and her little yellow backpack
  for (const s of [-1, 1]) { const ear = cube(H, [.06, .5, .44], [s * .4, hh * .5, .04], { all: shadeHex(pink, .93), sides: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, shadeHex(pink, .93)); f.r(.15, .15, .7, .7, '#f7bdd6'); } }); ear.rotation.y = s * .35; }
  const trunk = new T.Group(); H.add(trunk); trunk.position.set(0, hh * .38, -.32);
  for (let i = 0; i < 5; i++) cube(trunk, [.16 - i * .015, .14, .14], [0, -i * .1 + (i > 3 ? .05 : 0), -i * .04 - (i > 3 ? .06 : 0)], { all: pink });
  cube(R.torso, [.44, .4, .14], [0, .3, .32], { all: '#f6cf3e' });
  R.root.scale.setScalar(1.05); return R;
}
function pato() {
  const yellow = '#ffd83a', R = humanoid({
    head: [.6, .56, .56], body: [.54, .46, .44], arm: [.18, .34], leg: [.12, .26], skin: yellow,
    bodyFaces: { all: yellow }, armFaces: () => ({ all: yellow }), pants: '#f08a1f', shoes: '#f08a1f', hands: yellow,
    face: f => { for (const s of [-1, 1]) eyeRect(f, .5 + s * .15 - .08, .3, .16, .22, { white: '#ffffff', pupil: '#151515', pw: .5, ph: .55 }); },
  });
  const H = R.head, { hh } = R.dims;
  cube(H, [.3, .1, .22], [0, hh * .3, -.36], { all: '#f08a1f' }); cube(H, [.28, .06, .18], [0, hh * .2, -.34], { all: '#d9731a' }); // beak
  cube(H, [.5, .1, .46], [0, hh + .05, 0], { all: '#2f9a4c' }); cube(H, [.36, .12, .34], [0, hh + .14, .02], { all: '#2f9a4c' }); cube(H, [.24, .04, .14], [0, hh + .04, -.28], { all: '#257d3d' }); // green hat
  for (const g of [R.legL, R.legR]) cube(g, [.18, .05, .26], [0, -.26, -.06], { all: '#f08a1f' }); // webbed feet
  R.root.scale.setScalar(.92); return R;
}
function loula() {
  const R = rig({ legH: .26 }), c = '#f6efe2', ear = '#c9844a';
  cube(R.torso, [.32, .3, .62], [0, .15, 0], { all: c });
  cube(R.head, [.36, .34, .34], [0, .17, 0], { all: c, front: { live: f => { f.r(0, 0, 1, 1, c); for (const s of [-1, 1]) eyeRect(f, .5 + s * .2 - .07, .3, .14, .18, { white: '#fff', pupil: '#151515', pw: .58, ph: .66, lid: c }); f.r(.4, .6, .2, .12, '#2a1d1d'); talkMouth(f, .5, .82, .18, '#7a2b2b', () => f.r(.42, .8, .16, .05, '#c94d55')); } } });
  R.head.position.set(0, .26, -.36);
  for (const s of [-1, 1]) cube(R.head, [.08, .26, .16], [s * .2, .14, .04], { all: ear });
  cube(R.head, [.38, .05, .36], [0, -.02, .02], { all: '#d83a3a' }); // collar
  const legs = [[-.1, -.22], [.1, -.22], [-.1, .22], [.1, .22]].map(([x, z]) => { const g = new T.Group(); R.hips.add(g); g.position.set(x, 0, z); cube(g, [.1, .26, .1], [0, -.13, 0], { all: c }); return g; });
  R.legL = legs[0]; R.legR = legs[1]; R.extras.legs = legs;
  spike(R.torso, [0, .25, .3], [0, 1, .6], .2, .07, c, 2);
  R.dims = { height: .62 }; R.quadruped = true; return R;
}
function nina() {
  // Pocoyo's friend from space: a lime-green hooded suit with two ridged antennae and round ear pods,
  // a red swept fringe, big black oval eyes, a little smile, an A-line tunic, shorts and boots.
  const lime = '#a5d63c', limeDark = '#86b82a', hair = '#e5504a', skin = '#f7d0b0';
  const R = humanoid({
    head: [.76, .72, .7], body: [.46, .4, .36], arm: [.15, .34], leg: [.17, .3], skin,
    bodyFaces: { all: lime }, armFaces: () => ({ all: lime }), hands: skin, shoes: lime,
    legFaces: () => ({ all: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, skin); f.r(0, 0, 1, .38, lime); } }),
    faceRes: 48,
    face: f => {
      // the fringe sweeps from the left across the forehead, with one lock falling to the right
      f.r(0, 0, 1, .2, hair); f.r(.04, .2, .5, .06, hair); f.r(.5, .2, .18, .04, hair); f.r(.62, .2, .07, .1, hair); f.r(.05, .26, .22, .04, hair);
      for (const s of [-1, 1]) { f.r(.5 + s * .19 - .07, .3 + EX.browY * .02, .14, .025, '#d0584a'); eyeRect(f, .5 + s * .19 - .065, .37, .13, .24, { pupil: '#141414' }); }
      f.r(.48, .62, .04, .04, '#eab394'); talkMouth(f, .5, .72, .16, '#c8344a', () => { f.r(.42, .72, .16, .035, '#c8344a'); f.r(.39, .69, .04, .035, '#c8344a'); f.r(.57, .69, .04, .035, '#c8344a'); });
      f.r(.12, .62, .14, .08, '#f4a9a0'); f.r(.74, .62, .14, .08, '#f4a9a0');
    },
  });
  const { hw, hh, hd } = R.dims, H = R.head;
  // the hood: over the top, down the back and both sides, framing the face
  cube(H, [hw + .08, .12, hd + .08], [0, hh + .02, 0], { all: lime });
  cube(H, [hw + .08, hh, .08], [0, hh / 2, hd / 2 + .04], { all: lime });
  for (const s of [-1, 1]) cube(H, [.08, hh + .02, hd + .08], [s * (hw / 2 + .04), hh / 2, 0], { all: lime });
  cube(H, [hw + .08, .06, .06], [0, hh + .03, -hd / 2 - .02], { all: limeDark }); // hood rim over the brow
  for (const s of [-1, 1]) cube(H, [.06, .06, .06], [s * (hw / 2 + .02), hh * .1, -hd / 2 - .02], { all: limeDark }); // rim at the chin
  // round ear pods on the sides
  for (const s of [-1, 1]) { const pod = new T.Mesh(new T.CylinderGeometry(.16, .16, .1, 16), new T.MeshLambertMaterial({ color: limeDark })); pod.rotation.z = Math.PI / 2; pod.position.set(s * (hw / 2 + .12), hh * .48, 0); pod.castShadow = true; H.add(pod); }
  // two antennae, each a stack of ridged rings that narrows toward the tip
  for (const s of [-1, 1]) {
    const a = new T.Group(); a.position.set(s * hw * .3, hh + .06, 0); a.rotation.z = -s * .35; H.add(a);
    for (let i = 0; i < 4; i++) { const r = .07 - i * .008, ring = new T.Mesh(new T.CylinderGeometry(r, r * 1.1, .06, 12), new T.MeshLambertMaterial({ color: i % 2 ? limeDark : lime })); ring.position.y = .03 + i * .065; ring.castShadow = true; a.add(ring); }
    const tip = new T.Mesh(new T.SphereGeometry(.055, 12, 8), new T.MeshLambertMaterial({ color: lime })); tip.position.y = .3; a.add(tip);
  }
  // the A-line tunic flares out over the hips
  cube(R.torso, [.54, .14, .44], [0, .07, 0], { all: lime }); cube(R.hips, [.62, .12, .5], [0, -.04, 0], { all: lime });
  R.root.scale.setScalar(.95); return R;
}

// ------------------------------------------------------------------ Gabby's Dollhouse
function gabby() {
  const hair = '#4b2a1a', top = '#ef6ab0', R = humanoid({
    head: [.52, .52, .48], body: [.44, .58, .26], arm: [.17, .58], leg: [.2, .64], skin: '#d9a57d',
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, top); f.r(.38, .3, .24, .2, '#ffe14d'); f.r(.32, .36, .36, .1, '#ffe14d'); }, back: top, sides: top, top }, armFaces: () => ({ all: '#d9a57d' }), sleeve: top, pants: '#7a4ac9', shoes: '#ffffff',
    face: f => { eyes(f, { y: .42, gap: .19, ew: .17, eh: .2, iris: '#4a2a14', lashes: true, brows: true, browC: hair }); f.r(.16, .6, .1, .06, '#e98b8b'); f.r(.74, .6, .1, .06, '#e98b8b'); mouth(f, { kind: 'grin', y: .75, w: .24 }); },
  });
  // big curly hair and the pink cat-ear headband
  hairCap(R, hair, { front: .14, back: .62, sides: .62, top: .14 });
  for (const s of [-1, 1]) { cube(R.head, [.2, .56, .5], [s * .33, R.dims.hh * .48, .08], { all: hair }); cube(R.head, [.16, .3, .4], [s * .4, R.dims.hh * .1, .1], { all: hair }); }
  cube(R.head, [.66, .5, .2], [0, R.dims.hh * .5, .3], { all: hair });
  cube(R.head, [.62, .2, .3], [0, R.dims.hh + .06, .14], { all: hair });
  cube(R.head, [.56, .05, .06], [0, R.dims.hh + .1, -.06], { all: '#f19ac7' });
  for (const s of [-1, 1]) { spike(R.head, [s * .18, R.dims.hh + .12, -.06], [s * .25, 1, 0], .2, .16, '#f19ac7', 3); }
  R.root.scale.setScalar(.82); return R;
}
function catHead(R, fur, { ears = fur, inner = '#f7b7c8', eyesC = '#2c7a3a', mouthC = '#5b2b2b', w = .54, h = .46, d = .46, faceBg } = {}) {
  // a generic cartoon cat head on R.head
  cube(R.head, [w, h, d], [0, h / 2, 0], { all: fur, front: { live: f => { f.r(0, 0, 1, 1, faceBg ?? fur); for (const s of [-1, 1]) eyeRect(f, .5 + s * .19 - .09, .34, .18, .24, { white: '#fff', pupil: eyesC, pw: .56, ph: .84, lid: faceBg ?? fur }); f.r(.45, .62, .1, .06, '#e66f8e'); talkMouth(f, .5, .73, .2, mouthC, () => f.r(.4, .72, .2, .04, mouthC)); for (const s of [-1, 1]) for (let i = 0; i < 2; i++) f.r(s < 0 ? .02 : .78, .64 + i * .07, .2, .02, shadeHex(fur, .55)); cheeks(f, .1, .78, .6, '#f5a0b8'); } } }, { d: 64 });
  for (const s of [-1, 1]) { const e = cube(R.head, [.16, .18, .08], [s * (w / 2 - .1), h + .08, 0], { all: ears, front: (p, W, H) => { const f = F(p, W, H); f.r(0, 0, 1, 1, ears); f.r(.25, .25, .5, .75, inner); } }); e.rotation.z = -s * .25; }
}
function catBody(R, color, { legs = color, tail = true } = {}) {
  cube(R.torso, [.4, .42, .3], [0, .21, 0], { all: color });
  for (const [g, s] of [[R.armL, -1], [R.armR, 1]]) { g.position.set(s * .27, .36, 0); cube(g, [.14, .34, .14], [0, -.14, 0], { all: color }); }
  for (const g of [R.legL, R.legR]) cube(g, [.15, .28, .16], [0, -.14, 0], { all: legs });
  R.head.position.y = .42;
  if (tail) spike(R.torso, [0, .08, .16], [0, .7, 1], .38, .08, color, 3);
}
function pandyPaws() {
  const R = rig({ legH: .3, hipW: .44 }); catBody(R, '#1b1b1d', { tail: false });
  cube(R.torso, [.42, .36, .32], [0, .24, 0], { all: '#f2f0ec', front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, '#f2f0ec'); } });
  cube(R.head, [.56, .5, .48], [0, .25, 0], { all: '#f6f4f0', front: { live: f => { f.r(0, 0, 1, 1, '#f6f4f0'); for (const s of [-1, 1]) { f.r(.5 + s * .2 - .12, .3, .24, .3, '#1b1b1d'); eyeRect(f, .5 + s * .2 - .06, .36, .12, .16, { white: '#fff', pupil: '#151515', pw: .5, ph: .62, lid: '#1b1b1d' }); } f.r(.43, .64, .14, .08, '#1b1b1d'); talkMouth(f, .5, .77, .18, '#7a2b3b', () => f.r(.42, .76, .16, .04, '#7a2b3b')); } } }, { d: 64 });
  for (const s of [-1, 1]) cube(R.head, [.16, .16, .12], [s * .22, .52, .02], { all: '#1b1b1d' });
  R.dims = { height: 1.05 }; return R;
}
function cakeyCat() {
  const R = rig({ legH: .2, hipW: .44 });
  // the cupcake wrapper body with ridges, frosting head with sprinkles, a cherry
  cube(R.torso, [.5, .4, .44], [0, .2, 0], { all: (p, w, h) => { const f = F(p, w, h); for (let i = 0; i < 8; i++) f.r(i / 8, 0, 1 / 16, 1, i % 2 ? '#6cc7d8' : '#9fe0ea'); } });
  for (const g of [R.legL, R.legR]) cube(g, [.14, .2, .14], [0, -.1, 0], { all: '#e9b98a' });
  for (const [g, s] of [[R.armL, -1], [R.armR, 1]]) { g.position.set(s * .3, .34, 0); cube(g, [.12, .26, .12], [0, -.1, 0], { all: '#e9b98a' }); }
  R.head.position.y = .4;
  catHead(R, '#f2a3c4', { faceBg: '#f6c39a', eyesC: '#3a8fd1' });
  const H = R.head; cube(H, [.6, .14, .5], [0, .5, 0], { all: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, '#f2a3c4'); for (let i = 0; i < 14; i++) f.r(rnd(), rnd() * .8, .06, .1, ['#ffe14d', '#5cc4f2', '#7fd65b', '#ffffff'][i % 4]); } });
  cube(H, [.12, .12, .12], [0, .64, 0], { all: '#d6263b' });
  R.dims = { height: .95 }; return R;
}
function merCat() {
  const R = rig({ legH: .0, hipW: .4 }), fur = '#c9b8ec';
  cube(R.torso, [.4, .4, .3], [0, .2, 0], { all: fur, front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, fur); for (const s of [-1, 1]) { f.r(.5 + s * .22 - .14, .05, .26, .22, '#f38fb8'); } } });
  for (const [g, s] of [[R.armL, -1], [R.armR, 1]]) { g.position.set(s * .27, .34, 0); cube(g, [.13, .32, .13], [0, -.13, 0], { all: fur }); }
  // fish tail curling behind instead of legs
  const tail = new T.Group(); R.hips.add(tail);
  for (let i = 0; i < 6; i++) cube(tail, [.36 - i * .04, .14, .3 - i * .02], [0, -.06 - i * .1, .04 + i * i * .02], { all: i % 2 ? '#2ec4b6' : '#3fd8c8' });
  const fin = cube(tail, [.5, .06, .26], [0, -.62, .5], { all: '#8be3d6' }); fin.rotation.x = -.6;
  R.head.position.y = .42; catHead(R, fur, { eyesC: '#8a3fc4' });
  cube(R.head, [.6, .14, .5], [0, .44, .06], { all: '#e05aa0' }); cube(R.head, [.2, .4, .16], [.26, .22, .2], { all: '#e05aa0' }); // hair
  R.root.position.y = .66; R.dims = { height: 1.1 }; R.floating = .66; return R;
}
function babyBox() {
  const R = rig({ legH: .2, hipW: .44 }), card = '#c99a5e';
  const boxFace = (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, card); f.r(0, 0, 1, .06, shadeHex(card, .8)); f.r(.48, 0, .04, 1, shadeHex(card, .85)); };
  cube(R.torso, [.46, .4, .4], [0, .2, 0], { all: boxFace });
  for (const g of [R.legL, R.legR]) cube(g, [.14, .2, .14], [0, -.1, 0], { all: card });
  for (const [g, s] of [[R.armL, -1], [R.armR, 1]]) { g.position.set(s * .29, .34, 0); cube(g, [.12, .28, .12], [0, -.1, 0], { all: card }); }
  R.head.position.y = .4;
  cube(R.head, [.52, .44, .46], [0, .22, 0], { all: boxFace, front: { live: f => { f.r(0, 0, 1, 1, card); for (const s of [-1, 1]) eyeRect(f, .5 + s * .2 - .09, .3, .18, .24, { white: '#fff', pupil: '#3a8fd1', pw: .56, ph: .66, lid: card }); f.r(.45, .6, .1, .06, '#e66f8e'); talkMouth(f, .5, .73, .22, '#5b2b2b', () => f.r(.38, .72, .24, .04, '#5b2b2b')); for (const s of [-1, 1]) f.r(s < 0 ? .03 : .77, .62, .2, .025, '#5b8ad6'); } } }, { d: 64 });
  for (const s of [-1, 1]) { const e = cube(R.head, [.16, .18, .06], [s * .16, .52, 0], { all: card }); e.rotation.z = -s * .2; }
  cube(R.head, [.04, .3, .04], [.3, .34, .02], { all: '#e8523f' }); // a crayon
  R.dims = { height: .9 }; return R;
}
function djCatnip() {
  const R = rig({ legH: .3, hipW: .44 }), fur = '#8e97a8';
  catBody(R, '#6e4bb5', { legs: fur }); for (const g of [R.armL, R.armR]) cube(g, [.15, .12, .15], [0, -.28, 0], { all: fur });
  R.head.position.y = .42; catHead(R, fur, { eyesC: '#2c7a3a' });
  // stripes and the purple headphones
  const H = R.head; for (let i = 0; i < 3; i++) cube(H, [.08, .05, .02], [-.12 + i * .12, .44, -.24], { all: '#5a6273' });
  cube(H, [.66, .06, .14], [0, .5, 0], { all: '#2b2b33' }); for (const s of [-1, 1]) cube(H, [.08, .2, .2], [s * .31, .24, 0], { all: '#a254e8' });
  R.dims = { height: 1.05 }; return R;
}
function carlita() {
  const R = rig({ legH: .0 }), pink = '#f27fb7';
  cube(R.torso, [.62, .32, .9], [0, .26, 0], { all: pink, front: { live: f => { f.r(0, 0, 1, 1, pink); for (const s of [-1, 1]) eyeRect(f, .5 + s * .22 - .1, .2, .2, .36, { white: '#fff', pupil: '#2c7a3a', pw: .5, ph: .66, lid: pink }); talkMouth(f, .5, .74, .18, '#5b2b2b', () => f.r(.42, .7, .16, .08, '#5b2b2b')); } } });
  cube(R.torso, [.5, .22, .44], [0, .53, .1], { all: '#bfe9f7' });
  for (const s of [-1, 1]) { const e = cube(R.torso, [.16, .18, .06], [s * .16, .72, .1], { all: pink }); e.rotation.z = -s * .25; }
  for (const [x, z] of [[-.33, -.28], [.33, -.28], [-.33, .3], [.33, .3]]) cube(R.torso, [.1, .22, .22], [x, .11, z], { all: '#2b2b33', sides: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, '#2b2b33'); f.r(.3, .3, .4, .4, '#e9e9ee'); } });
  R.dims = { height: .8 }; R.vehicle = true; return R;
}

// ------------------------------------------------------------------ extras: crowd players, soldiers, animals
export function genericPlayer({ shirt = '#3a7bd5', pants = '#2a3550', skin = SKIN.light, hair = '#3b2a1a', armour } = {}) {
  const R = humanoid({ head: [.5, .5, .5], body: [.5, .7, .26], arm: [.22, .7], leg: [.22, .72], skin, bodyFaces: { all: armour ?? shirt }, armFaces: () => ({ all: armour ?? shirt }), pants: armour ?? pants, shoes: '#3b3b3b', face: f => { eyes(f, { y: .45, gap: .19, ew: .14, eh: .14, shine: false }); mouth(f, { kind: 'flat', y: .76, w: .2 }); } });
  hairCap(R, hair, { front: .12, back: .4, sides: .3 }); return R;
}
function friezaSoldier() {
  const R = humanoid({
    head: [.5, .5, .48], body: [.52, .68, .3], arm: [.2, .66], leg: [.22, .72], skin: '#7cc0a8',
    bodyFaces: { front: (p, w, h) => { const f = F(p, w, h); f.r(0, 0, 1, 1, '#ece7da'); f.r(0, .7, 1, .3, '#5d4c8a'); f.r(.4, .1, .2, .5, '#6a5aa0'); }, back: '#ece7da', sides: '#ece7da', top: '#ece7da' },
    armFaces: () => ({ all: '#2c2f54' }), pants: '#2c2f54', shoes: '#ece7da', hands: '#ece7da',
    face: f => { eyes(f, { y: .44, gap: .18, ew: .14, eh: .12, iris: '#801a1a', brows: true, browTilt: 2, browC: '#2b5b4a' }); mouth(f, { kind: 'smirk', y: .76, w: .2 }); f.r(.55, .32, .35, .2, 'rgba(70,220,120,.85)'); },
  });
  for (const s of [-1, 1]) cube(R.torso, [.18, .1, .34], [s * .28, .62, 0], { all: '#d9cfa4' }); return R;
}
/** A friendly-looking Minecraft zombie (green skin, blue shirt, arms out in front). */
function zombie() {
  return humanoid({ head: [.5, .5, .5], body: [.5, .7, .26], arm: [.22, .7], leg: [.22, .72], skin: '#5d9c4c', bodyFaces: { all: '#3a8a9c' }, armFaces: () => ({ all: '#5d9c4c' }), pants: '#3b3f8c', shoes: '#4a4a52',
    face: f => { eyeRect(f, .26, .42, .16, .1, { pupil: '#1d2a18', lid: '#5d9c4c' }); eyeRect(f, .58, .42, .16, .1, { pupil: '#1d2a18', lid: '#5d9c4c' }); f.r(.4, .6, .2, .08, '#466f3a'); talkMouth(f, .5, .76, .2, '#2a3a24', () => f.r(.38, .74, .24, .04, '#2a3a24')); } });
}
function polarBear() {
  const R = rig({ legH: .5 }), w = '#f2f2ec';
  cube(R.torso, [.8, .7, 1.4], [0, .35, 0], { all: w });
  cube(R.head, [.5, .45, .5], [0, .22, 0], { all: w, front: { live: f => { f.r(0, 0, 1, 1, w); eyeRect(f, .2, .3, .12, .12, { lid: w }); eyeRect(f, .68, .3, .12, .12, { lid: w }); f.r(.4, .6, .2, .16, '#202020'); } } }); R.head.position.set(0, .4, -.9);
  for (const s of [-1, 1]) cube(R.head, [.12, .12, .08], [s * .18, .5, .1], { all: w });
  const legs = [[-.28, -.5], [.28, -.5], [-.28, .5], [.28, .5]].map(([x, z]) => { const g = new T.Group(); R.hips.add(g); g.position.set(x, 0, z); cube(g, [.26, .5, .26], [0, -.25, 0], { all: w }); return g; });
  R.legL = legs[0]; R.legR = legs[1]; R.quadruped = true; R.dims = { height: 1.3 }; return R;
}

// ------------------------------------------------------------------ registry
export const CAST = {
  goku: { name: 'Goku', show: 'db', make: () => goku() }, goku_ssj: { name: 'Goku (Super Saiyan)', show: 'db', make: () => goku({ ssj: true }) },
  vegeta: { name: 'Vegeta', show: 'db', make: vegeta }, frieza: { name: 'Frieza', show: 'db', make: frieza },
  bulma: { name: 'Bulma', show: 'db', make: bulma }, drbriefs: { name: 'Dr. Briefs', show: 'db', make: drBriefs },
  krillin: { name: 'Krillin', show: 'db', make: () => krillin() }, yamcha: { name: 'Yamcha', show: 'db', make: () => yamcha() },
  gohan: { name: 'Gohan', show: 'db', make: () => gohan() }, gohan_scarred: { name: 'Gohan (battle-scarred)', show: 'db', make: () => gohan({ scarred: true }) },
  videl: { name: 'Videl', show: 'db', make: videl }, buu: { name: 'Majin Buu', show: 'db', make: buu },
  trunks: { name: 'Kid Trunks', show: 'db', make: () => kidSaiyan('trunks') }, goten: { name: 'Goten', show: 'db', make: () => kidSaiyan('goten') },
  pocoyo: { name: 'Pocoyo', show: 'pocoyo', make: pocoyo }, elly: { name: 'Elly', show: 'pocoyo', make: elly }, pato: { name: 'Pato', show: 'pocoyo', make: pato },
  loula: { name: 'Loula', show: 'pocoyo', make: loula }, nina: { name: 'Nina', show: 'pocoyo', make: nina },
  gabby: { name: 'Gabby', show: 'gabby', make: gabby }, pandy: { name: 'Pandy Paws', show: 'gabby', make: pandyPaws }, cakey: { name: 'Cakey Cat', show: 'gabby', make: cakeyCat },
  mercat: { name: 'MerCat', show: 'gabby', make: merCat }, babybox: { name: 'Baby Box', show: 'gabby', make: babyBox }, djcatnip: { name: 'DJ Catnip', show: 'gabby', make: djCatnip },
  carlita: { name: 'Carlita', show: 'gabby', make: carlita },
  chichi: { name: 'Chi-Chi', show: 'db', make: () => chiChi() }, android18: { name: 'Android 18', show: 'db', make: () => android18() },
  videl_bride: { name: 'Videl', show: 'db', make: () => videl({ bride: true }) }, bulla: { name: 'Bulla', show: 'db', make: () => kidGirl('bulla') }, marron: { name: 'Marron', show: 'db', make: () => kidGirl('marron') },
  chichi_bride: { name: 'Chi-Chi', show: 'db', make: () => chiChi({ bride: true }) }, bulma_bride: { name: 'Bulma', show: 'db', make: () => bulma({ bride: true }) }, android18_bride: { name: 'Android 18', show: 'db', make: () => android18({ bride: true }) },
  goku_leather: { name: 'Goku', show: 'db', make: () => goku({ leather: true }) }, krillin_leather: { name: 'Krillin', show: 'db', make: () => krillin({ leather: true }) }, yamcha_leather: { name: 'Yamcha', show: 'db', make: () => yamcha({ leather: true }) },
  zombie: { name: 'Zombie', show: 'extra', make: zombie },
  soldier: { name: 'Frieza soldier', show: 'extra', make: friezaSoldier }, polarbear: { name: 'Polar bear', show: 'extra', make: polarBear },
};
/**
 * Pairs of boxes in a character or prop whose faces lie in the same plane, face the same way and overlap: they z-fight and
 * flicker whenever that side turns to the camera (a hand ending flush with its sleeve, a sole flush with its leg).
 * Compares axis-aligned boxes that share a parent. Returns [{ a, b, ax, sg }]: the meshes, the axis and the side (±1).
 */
function findCoplanar(obj, eps = 1e-3) {
  const boxes = [], out = [];
  // instanced meshes (crowds) are skipped: their box sits at the origin and stands for every instance
  obj.traverse(m => { if (m.isMesh && !m.isInstancedMesh && m.geometry.type === 'BoxGeometry' && Math.abs(m.rotation.x) + Math.abs(m.rotation.y) + Math.abs(m.rotation.z) < 1e-6) boxes.push(m); });
  const box = m => { const { width, height, depth } = m.geometry.parameters; return { c: m.position.toArray(), s: [width * m.scale.x, height * m.scale.y, depth * m.scale.z] }; };
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    if (boxes[i].parent !== boxes[j].parent) continue;
    const A = box(boxes[i]), B = box(boxes[j]);
    for (let ax = 0; ax < 3; ax++) for (const sg of [1, -1]) {
      if (Math.abs(A.c[ax] + sg * A.s[ax] / 2 - (B.c[ax] + sg * B.s[ax] / 2)) > eps) continue;
      const overlap = [0, 1, 2].filter(k => k !== ax).every(k => Math.min(A.c[k] + A.s[k] / 2, B.c[k] + B.s[k] / 2) - Math.max(A.c[k] - A.s[k] / 2, B.c[k] - B.s[k] / 2) > eps);
      if (overlap) out.push({ a: boxes[i], b: boxes[j], ax, sg, va: A.s[0] * A.s[1] * A.s[2], vb: B.s[0] * B.s[1] * B.s[2] });
    }
  }
  return out;
}
const SIDES = [['right', 'left'], ['top', 'bottom'], ['back', 'front']];
/** Coplanar same-facing faces left in a character or prop group (see findCoplanar), as 'part:side' strings. */
export const coplanarFaces = obj => findCoplanar(obj).map(({ a, ax, sg }) => `${a.parent.name || 'part'}:${SIDES[ax][sg > 0 ? 0 : 1]}`);
/** Move the smaller box of every coplanar pair (the hand, the sole, the hair piece) out by `gap` on that side. */
export function separateCoplanar(obj, gap = .006) {
  for (let pass = 0; pass < 4; pass++) {
    const pairs = findCoplanar(obj); if (!pairs.length) return;
    for (const { a, b, ax, sg, va, vb } of pairs) {
      const m = va <= vb ? a : b, k = ['x', 'y', 'z'][ax], size = [m.geometry.parameters.width, m.geometry.parameters.height, m.geometry.parameters.depth][ax] * m.scale[k];
      m.scale[k] *= (size + gap) / size; m.position[k] += sg * gap / 2;
    }
  }
}
export function makeCharacter(id) {
  seed = [...id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483646 + 1; LIVE = [];
  const R = CAST[id].make(), faces = LIVE; LIVE = [];
  separateCoplanar(R.root); // flush detail boxes would z-fight with the part under them
  R.id = id; R.label = CAST[id].name; R.face = { set: e => { for (const f of faces) f.set(e); } };
  return R;
}

const LIMB = -1; // authored limb angle → x-rotation (see posePlayer)
/** The world-space direction a character faces (−z turned by its yaw). */
const facingOf = R => new T.Vector3(0, 0, -1).applyAxisAngle(new T.Vector3(0, 1, 0), R.root.rotation.y);
/**
 * Pose a character reaching forward and sitting at several headings, and measure where its right arm and left leg
 * went. Returns the problems found ([] when the rig matches the authored convention), so a sign error fails loudly
 * before anything renders.
 */
export function checkRig(R, key = R.id) {
  const out = [], joint = new T.Vector3(), limb = new T.Vector3();
  const ahead = g => { g.getWorldPosition(joint); new T.Box3().setFromObject(g).getCenter(limb); return limb.sub(joint).dot(facingOf(R)); };
  // only limbs a character has and is posed with: four-legged animals and vehicles have no arms; a tail is not legs
  const has = g => !new T.Box3().setFromObject(g).isEmpty(), arms = !R.quadruped && !R.vehicle && has(R.armR), legs = !R.quadruped && has(R.legL);
  for (const yaw of [0, 1.3, -2.4]) {
    posePlayer(R, { yaw, armR: [-1.5, .05] }); R.root.updateMatrixWorld(true);
    if (arms && ahead(R.armR) <= 0) out.push(`${key}: armR [-1.5] points backward at yaw ${yaw}`);
    posePlayer(R, { yaw, sit: true }); R.root.updateMatrixWorld(true);
    if (legs && ahead(R.legL) <= 0) out.push(`${key}: seated legs point backward at yaw ${yaw}`);
  }
  posePlayer(R, {}); return out;
}
/**
 * Pose a character for one frame. q: { x, y, z, yaw, walk (phase), stride, armL:[x,z], armR:[x,z], legL, legR, headYaw, headPitch, lean, sit, fly, bob }
 * Arms default to hanging; walk swings arms and legs from the phase.
 * Limb angles are authored as "negative = forward": armR [-1.5, z] reaches straight ahead, [-2.9, z] is raised overhead,
 * legL -1.45 lifts the leg forward. Characters face −z, and it is a positive x-rotation that swings a hanging limb
 * toward −z, so authored limb angles are applied negated (LIMB). checkRig() verifies this for every character.
 */
export function posePlayer(R, q = {}) {
  const ph = q.walk ?? 0, st = q.stride ?? (q.walk !== undefined ? .6 : 0), sw = Math.sin(ph) * st;
  for (const k of ['torso', 'head', 'armL', 'armR', 'legL', 'legR', 'hips']) R[k]?.rotation.set(0, 0, 0);
  if (R.extras.legs) R.extras.legs.forEach((g, i) => { g.rotation.x = (i === 0 || i === 3 ? sw : -sw); });
  else { R.legL.rotation.x = q.legL !== undefined ? LIMB * q.legL : sw; R.legR.rotation.x = q.legR !== undefined ? LIMB * q.legR : -sw; }
  R.armL.rotation.x = q.armL ? LIMB * q.armL[0] : -sw * .8; R.armL.rotation.z = q.armL?.[1] ?? -.05;
  R.armR.rotation.x = q.armR ? LIMB * q.armR[0] : sw * .8; R.armR.rotation.z = q.armR?.[1] ?? .05;
  if (q.sit) { R.legL.rotation.x = R.legR.rotation.x = LIMB * -1.45; }
  R.torso.rotation.x = -(q.lean ?? 0); R.head.rotation.y = q.headYaw ?? 0; R.head.rotation.x = q.headPitch ?? 0; R.head.rotation.z = q.headRoll ?? 0;
  if (R.extras.tail) R.extras.tail.rotation.y = Math.sin((q.t ?? 0) * 1.3) * .3;
  const bob = Math.abs(Math.cos(ph)) * .04 * st + (q.fly ? Math.sin((q.t ?? 0) * 2) * .06 : 0);
  // seated: the hips rest on the seat (or just above the ground), legs straight out in front
  const sitY = q.sit ? (q.seat ?? (q.y ?? 0) + .1) - (R.dims.lh ?? .3) * R.root.scale.x : null;
  R.root.position.set(q.x ?? 0, q.sit ? sitY : (q.y ?? 0) + (R.floating ?? 0) + bob, q.z ?? 0);
  R.root.rotation.set(q.fly ? -(q.flyLean ?? .5) : 0, q.yaw ?? 0, q.roll ?? 0, 'YXZ');
  if (q.lie) { R.root.rotation.set(-Math.PI / 2, q.yaw ?? 0, 0, 'YXZ'); R.root.position.y = (q.y ?? 0) + .14 * R.root.scale.x; }
}
