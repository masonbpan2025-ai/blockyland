// Actors for Claude's cut: player-model bodies with painted clothes, an expressive
// face plane, props, and a small pose rig (hip bend, sit, kneel, look-at, walk paths
// that always face the direction of travel, so nobody moonwalks).
import * as T from 'three';
import { createPlayerModel } from '../playerModel.js';
import { createFace, mixExpression } from './claudeFace.js';

export const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const ease = v => { v = clamp(v); return v * v * (3 - 2 * v); };
export const lerp = (a, b, k) => a + (b - a) * k;
export const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
export const lerpAngle = (a, b, k) => a + wrap(b - a) * k;
// Body yaw that faces the direction (dx, dz). The player model's face points at local −Z.
export const facing = (dx, dz) => Math.atan2(-dx, -dz);
const matte = color => new T.MeshLambertMaterial({ color });
export function box(parent, size, at, material, rot) {
  const m = new T.Mesh(new T.BoxGeometry(...size), typeof material === 'number' ? matte(material) : material);
  m.position.set(...at); if (rot) m.rotation.set(...rot); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
}

const shade = (c, k) => { const n = parseInt(c.slice(1), 16), f = v => Math.max(0, Math.min(255, Math.round(v * k))); return `rgb(${f(n >> 16)},${f(n >> 8 & 255)},${f(n & 255)})`; };

function paintSkin(o) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const p = c.getContext('2d');
  const r = (x, y, w, h, col) => { p.fillStyle = col; p.fillRect(x, y, w, h); };
  const skin = o.skin, hair = o.hair, shirt = o.shirt, pants = o.pants, shoes = o.shoes ?? '#3d2f25';
  // Head: skin all round, hair on top, back and down the sides by hairLen rows.
  r(0, 0, 32, 16, skin); r(8, 0, 8, 8, o.hatTop ?? hair);
  const len = o.hairLen ?? 3; r(0, 8, 8, len, hair); r(16, 8, 8, len, hair); r(24, 8, 8, Math.max(len, o.hairBack ?? 6), hair);
  if (o.beard) { r(0, 13, 8, 3, o.beard); r(16, 13, 8, 3, o.beard); r(8, 0, 0, 0, o.beard); r(16, 0, 8, 8, o.beard); }
  // Torso (front 20..28, sides, back) with shading, collar, buttons or apron, belt.
  r(16, 16, 24, 4, shirt); r(16, 20, 24, 12, shirt);
  r(16, 20, 4, 12, shade(shirt, .86)); r(28, 20, 4, 12, shade(shirt, .86)); r(32, 20, 8, 12, shade(shirt, .92));
  r(22, 20, 4, 2, o.collar ?? shade(shirt, .75)); r(23, 20, 2, 1, skin);
  if (o.buttons) for (const y of [23, 26, 29]) r(24, y, 1, 1, o.buttons);
  if (o.sash) for (let i = 0; i < 8; i++) r(20 + i, 21 + i, 2, 2, o.sash);
  if (o.apron) { r(20, 23, 8, 9, o.apron); r(21, 20, 1, 3, shade(o.apron, .8)); r(26, 20, 1, 3, shade(o.apron, .8)); r(22, 26, 4, 3, shade(o.apron, .85)); }
  if (o.belt !== false) { r(16, 29, 24, 2, o.belt ?? '#4b3626'); r(23, 29, 2, 2, '#b99a52'); }
  if (o.robe) { r(16, 26, 24, 6, shade(shirt, .9)); }
  // Arms: sleeves to `sleeve` rows, then skin, hand at the bottom.
  const sleeve = o.sleeve ?? 12;
  for (const [x, y] of [[40, 16], [32, 48]]) {
    r(x, y, 16, 4, shirt); r(x + 8, y, 4, 4, skin); // top shirt, bottom (hand) skin
    r(x, y + 4, 16, 12, skin); r(x, y + 4, 16, Math.min(12, sleeve), shirt);
    if (sleeve < 12) r(x, y + 4 + sleeve, 16, 1, shade(shirt, .8)); // cuff
    r(x, y + 4, 4, 12, 'rgba(0,0,0,0)'); r(x, y + 4, 4, Math.min(12, sleeve), shade(shirt, .88)); r(x, y + 4 + sleeve, 4, 12 - Math.min(12, sleeve), shade(skin, .9));
    r(x, y + 14, 16, 2, shade(skin, .94));
  }
  // Legs: trousers, boots.
  for (const [x, y] of [[0, 16], [16, 48]]) {
    r(x, y, 16, 4, pants); r(x + 8, y, 4, 4, shoes); r(x, y + 4, 16, 12, pants); r(x, y + 4, 4, 12, shade(pants, .86));
    if (o.skirt) r(x, y + 4, 16, 6, o.skirt);
    r(x, y + 13, 16, 3, shoes); r(x, y + 13, 16, 1, shade(shoes, 1.25));
  }
  // Overlay layers stay transparent (no doubled faces to flicker).
  p.clearRect(32, 0, 32, 16); p.clearRect(16, 32, 40, 16); p.clearRect(48, 48, 16, 16); p.clearRect(0, 48, 16, 16); p.clearRect(0, 32, 16, 16);
  return c;
}

/**
 * spec: { name, scale, skin, hair, shirt, pants, face: {...look}, extras(actor) }
 */
export function makeActor(spec) {
  const canvas = paintSkin(spec);
  const texture = new T.CanvasTexture(canvas); texture.magFilter = texture.minFilter = T.NearestFilter; texture.generateMipmaps = false; texture.colorSpace = T.SRGBColorSpace;
  const actor = createPlayerModel({ skinDataUrl: canvas.toDataURL() });
  actor.baseMaterial.map = texture; actor.baseMaterial.needsUpdate = true;
  // The overlay shell is fully transparent here; hide it so it can never z-fight or self-shadow.
  actor.traverse(o => { if (o.isMesh) { if (o.material === actor.overlayMaterial) o.visible = false; else o.castShadow = o.receiveShadow = true; } });
  actor.scale.setScalar(spec.scale ?? 1);
  const face = createFace({ skin: spec.skin, hair: spec.hair, ...spec.face });
  actor.head.add(face.plane); actor.face = face;
  actor.spec = spec; actor.name = spec.name;
  actor.base = Object.fromEntries(['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg'].map(k => [k, actor[k].position.clone()]));
  actor.props = {};
  spec.extras?.(actor);
  return actor;
}

const HIP = new T.Vector3(0, .75, 0), tmp = new T.Vector3();
/**
 * Pose an actor completely from scratch for this frame (no state carried between frames).
 * q: { x, y, z, yaw, phase, stride, sit, sitLegs, kneel, lean, twist, headYaw, headPitch, headRoll,
 *      armL:[x,z], armR:[x,z], legL, legR, breathe, rootRoll }
 */
export function pose(actor, q) {
  const s = actor.scale.x;
  for (const k of ['head', 'torso', 'leftArm', 'rightArm', 'leftLeg', 'rightLeg']) { actor[k].rotation.set(0, 0, 0); actor[k].position.copy(actor.base[k]); }
  const stride = q.stride ?? 0, ph = q.phase ?? 0;
  let y = q.y ?? 3;
  const swing = Math.sin(ph) * stride;
  actor.leftLeg.rotation.x = q.legL ?? swing; actor.rightLeg.rotation.x = q.legR ?? -swing;
  let armLx = -swing * .85, armRx = swing * .85, armLz = -.04, armRz = .04;
  y += Math.abs(Math.cos(ph)) * .045 * stride * s;
  const sit = q.sit === true ? 1 : q.sit || 0;
  if (sit) { // hip comes to rest on the seat; legs swing forward as the actor sits
    const legs = q.sitLegs ?? 1.35;
    actor.leftLeg.rotation.x = lerp(actor.leftLeg.rotation.x, legs + (q.sitLegL ?? 0), sit); actor.rightLeg.rotation.x = lerp(actor.rightLeg.rotation.x, legs + (q.sitLegR ?? 0), sit);
    y = lerp(y, (q.seat ?? q.y) - .63 * s, ease(sit));
  }
  if (q.kneel) { // shins on the ground behind; body drops by the leg length
    actor.leftLeg.rotation.x = -1.42 * q.kneel; actor.rightLeg.rotation.x = -1.42 * q.kneel; y -= (.75 - .13) * s * q.kneel;
  }
  // Upper body bends at the hip (lean > 0 bows forward).
  const lean = q.lean ?? 0, twist = q.twist ?? 0;
  if (lean || twist) {
    const rot = new T.Euler(-lean, twist, 0, 'YXZ');
    for (const k of ['head', 'torso', 'leftArm', 'rightArm']) {
      tmp.copy(actor.base[k]).sub(HIP).applyEuler(rot).add(HIP); actor[k].position.copy(tmp);
      actor[k].rotation.x = -lean; actor[k].rotation.y = twist;
    }
  }
  const breathe = Math.sin((q.breathe ?? 0) * 1.7) * .018;
  actor.torso.scale.set(1, 1, 1 + breathe); armLz -= breathe * 1.5; armRz += breathe * 1.5;
  if (q.armL) { armLx = q.armL[0]; armLz = q.armL[1]; }
  if (q.armR) { armRx = q.armR[0]; armRz = q.armR[1]; }
  actor.leftArm.rotation.x += armLx; actor.leftArm.rotation.z = armLz;
  actor.rightArm.rotation.x += armRx; actor.rightArm.rotation.z = armRz;
  actor.head.rotation.x += q.headPitch ?? 0; actor.head.rotation.y += q.headYaw ?? 0; actor.head.rotation.z = q.headRoll ?? 0;
  actor.position.set(q.x, y, q.z); actor.rotation.set(0, q.yaw ?? 0, q.rootRoll ?? 0, 'YXZ');
}

/** Head yaw/pitch (relative to the body) for looking at a world point, clamped to a natural range. */
export function lookAngles(actor, yaw, target, eyeHeight) {
  const s = actor.scale.x, ex = actor.position.x, ez = actor.position.z, ey = actor.position.y + (eyeHeight ?? 1.75 * s);
  const dx = target[0] - ex, dy = target[1] - ey, dz = target[2] - ez;
  const yawW = facing(dx, dz), rel = clamp(wrap(yawW - yaw), -1.15, 1.15);
  return { headYaw: rel, headPitch: clamp(Math.atan2(dy, Math.hypot(dx, dz)), -.6, .6) };
}

/**
 * Blocking: keys [{ t, at:[x,z], yaw? }]. Between keys with different positions the actor
 * walks (eased start/stop) facing the direction of travel; otherwise it stands, turning to
 * `yaw` if given. Turns are smoothed so nobody snaps round.
 */
export function blocking(keys, { stride = .9, speedUp = .35 } = {}) {
  const segAt = t => { let i = 0; while (i < keys.length - 1 && t >= keys[i + 1].t) i++; return i; };
  const ramp = u => { const a = speedUp; if (u < a) return u * u / (2 * a * (1 - a)); if (u > 1 - a) return 1 - (1 - u) * (1 - u) / (2 * a * (1 - a)); return (u - a / 2) / (1 - a); };
  const travelled = []; let acc = 0;
  for (let i = 0; i < keys.length; i++) { travelled.push(acc); if (i < keys.length - 1) acc += Math.hypot(keys[i + 1].at[0] - keys[i].at[0], keys[i + 1].at[1] - keys[i].at[1]); }
  const headings = keys.map((k, i) => {
    for (let j = i; j < keys.length - 1; j++) { const a = keys[j].at, b = keys[j + 1].at; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > .01) return facing(b[0] - a[0], b[1] - a[1]); }
    return null;
  });
  function rawYaw(t) {
    const i = segAt(t), a = keys[i], b = keys[i + 1];
    if (b && Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]) > .01 && t >= a.t) return facing(b.at[0] - a.at[0], b.at[1] - a.at[1]);
    if (a.yaw !== undefined) return a.yaw;
    for (let j = i; j > 0; j--) { // keep facing the way we last walked (or the last yaw we were given)
      const pa = keys[j - 1], k = keys[j];
      if (Math.hypot(k.at[0] - pa.at[0], k.at[1] - pa.at[1]) > .01) return facing(k.at[0] - pa.at[0], k.at[1] - pa.at[1]);
      if (pa.yaw !== undefined) return pa.yaw;
    }
    return headings[i] ?? Math.PI;
  }
  return t => {
    const i = segAt(t), a = keys[i], b = keys[i + 1];
    let x = a.at[0], z = a.at[1], moving = false, dist = travelled[i];
    if (b && t >= a.t) {
      const len = Math.hypot(b.at[0] - a.at[0], b.at[1] - a.at[1]);
      if (len > .01) { const u = ramp(clamp((t - a.t) / (b.t - a.t))); x = lerp(a.at[0], b.at[0], u); z = lerp(a.at[1], b.at[1], u); dist += len * u; moving = u > 0 && u < 1; }
    }
    // Smooth turns: average the facing over a third of a second centred on now.
    let sx = 0, sz = 0; for (let k = -3; k <= 3; k++) { const y = rawYaw(t + k * .055); sx += Math.sin(y); sz += Math.cos(y); }
    const speed = moving ? 1 : 0;
    return { x, z, yaw: Math.atan2(sx, sz), phase: dist / stride * Math.PI, stride: speed * .62, moving };
  };
}

/** Expression track: [[t, name] or [t, name, weight]...] blended over `fade` seconds. */
export function expressionTrack(keys, fade = .35) {
  return t => {
    let i = 0; while (i < keys.length - 1 && t >= keys[i + 1][0]) i++;
    const cur = keys[i], prev = keys[i - 1];
    const k = prev ? ease((t - cur[0]) / fade) : 1;
    return prev && k < 1 ? mixExpression([[prev[1], 1 - k], [cur[1], k]]) : mixExpression([[cur[1], 1]]);
  };
}

/** Deterministic blinks: one every 2.6–4.8 s, ~140 ms each. Returns lid closure 0..1. */
export function blink(t, seed) {
  let at = (seed * 1.37) % 2.5;
  for (let n = 0; n < 200 && at < t + 1; n++) {
    const d = t - at; if (d >= 0 && d < .14) return Math.sin(d / .14 * Math.PI);
    const h = Math.sin((n + 1) * 12.9898 + seed * 78.233) * 43758.5453; at += 2.6 + (h - Math.floor(h)) * 2.2;
  }
  return 0;
}

// ------------------------------------------------------------------ horses
export function horsePose(h, q) {
  // q: { x, y, z, yaw, gait: 0 stand | 1 walk | 2 gallop, phase, rear, buck, headDown, tailUp, graze }
  const m = h.mesh, ph = q.phase ?? 0, g = q.gait ?? 0;
  m.position.set(q.x, q.y ?? 3, q.z); m.rotation.set(0, q.yaw ?? 0, 0, 'YXZ');
  const amp = g === 2 ? .85 : g === 1 ? .38 : 0;
  // Gallop: hind pair then fore pair (transverse); walk: four-beat.
  const offs = g === 2 ? [0, .35, Math.PI, Math.PI + .35] : [0, Math.PI, Math.PI * 1.5, Math.PI * .5];
  h.legs.forEach((leg, i) => { leg.rotation.x = Math.sin(ph + offs[i]) * amp; });
  let pitch = g === 2 ? Math.sin(ph + .6) * .09 : 0, lift = g === 2 ? Math.abs(Math.sin(ph)) * .16 : g === 1 ? Math.abs(Math.sin(ph * 2)) * .02 : 0;
  if (q.rear) { // front lifts, pivot on hind hooves
    const a = q.rear * .75; pitch -= a; lift += Math.sin(a) * .62;
    h.legs[0].rotation.x = h.legs[1].rotation.x = -q.rear * 1.1 + Math.sin(ph * 2) * .3 * q.rear;
  }
  if (q.buck) { const a = q.buck * .45; pitch += a; lift += Math.sin(a) * .55; h.legs[2].rotation.x = h.legs[3].rotation.x = q.buck * 1.0; }
  m.position.y += lift; m.rotation.x = pitch;
  h.head.rotation.x = (q.headDown ?? 0) * .9 + (g === 2 ? Math.sin(ph) * .12 : g === 1 ? Math.sin(ph * 2) * .05 : Math.sin(ph * .2) * .03) - (q.rear ?? 0) * .3;
  h.head.rotation.y = q.headTurn ?? 0;
  h.tail.rotation.x = -.35 - (g === 2 ? .7 : 0) - (q.tailUp ?? 0) + Math.sin(ph * .7) * .08;
  h.tail.rotation.z = Math.sin(ph * .45) * (g ? .1 : .2);
}

/** Path for horses: keys [{t, at:[x,z]}]; returns {x,z,yaw,phase,gait,speed}. */
export function horsePath(keys, stride = 1.6) {
  const walk = blocking(keys, { stride, speedUp: .2 });
  return t => {
    const a = walk(t), b = walk(t + .05), sp = Math.hypot(b.x - a.x, b.z - a.z) / .05;
    const yaw = Math.atan2(-Math.sin(a.yaw), -Math.cos(a.yaw)); // horse faces +Z: rotate the actor facing by π
    return { x: a.x, z: a.z, yaw, phase: a.phase, gait: sp > 3 ? 2 : sp > .2 ? 1 : 0, speed: sp };
  };
}
