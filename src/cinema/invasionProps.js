// 1500 Players · the Grumbler invasion's set pieces: flying saucers (one, or a sky full of them in a few draw calls),
// the mothership with its shield and its shield generator, tractor beams, goo rays and the green jelly they leave.
// Kept cartoon-safe: goo rays stick people in jelly; nobody is hurt.
import * as T from 'three';
import { glowMat, fresnelMat } from './civFx.js';
import { rand } from './claudeStage.js';

const hull = () => new T.MeshStandardMaterial({ color: 0xc4ccd8, metalness: .2, roughness: .45 }); // more metal reads black from below, with nothing to reflect
const glass = () => new T.MeshPhongMaterial({ color: 0x9fffb0, transparent: true, opacity: .55, shininess: 90, specular: 0xffffff });

/** The saucer's shapes at radius 1: the disc, the glass dome and the glowing underside ring. */
function saucerGeos() {
  const disc = new T.CylinderGeometry(1, .62, .32, 24); disc.translate(0, 0, 0);
  const rim = new T.CylinderGeometry(1.06, 1.06, .08, 24);
  const dome = new T.SphereGeometry(.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); dome.translate(0, .14, 0);
  const belly = new T.CylinderGeometry(.42, .42, .06, 18); belly.translate(0, -.18, 0);
  return { disc, rim, dome, belly };
}

/** One flying saucer of radius r at p (x, y, z), tilted by `tilt` (radians about x, then z). */
export function saucer(parent, p, r = 2.2, { tilt = [0, 0], lights = true } = {}) {
  const g = new T.Group(); g.position.set(...p); g.rotation.set(tilt[0], 0, tilt[1]); g.scale.setScalar(r); parent.add(g);
  const { disc, rim, dome, belly } = saucerGeos();
  const m = new T.Mesh(disc, hull()); m.castShadow = true; g.add(m);
  g.add(new T.Mesh(rim, new T.MeshLambertMaterial({ color: 0x6a7080 })));
  g.add(new T.Mesh(dome, glass()));
  g.add(new T.Mesh(belly, glowMat(0x7dff6a, .95)));
  if (lights) for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, b = new T.Mesh(new T.BoxGeometry(.09, .06, .09), glowMat(i % 2 ? 0xffe14a : 0x7dff6a, 1)); b.position.set(Math.cos(a) * 1.04, 0, Math.sin(a) * 1.04); g.add(b); }
  return g;
}

/** A sky full of saucers: n of them scattered in a box (center, half-size [sx, sy, sz]), sizes rMin…rMax. Four draw calls. */
export function saucerSwarm(parent, center, half, n = 300, { rMin = 1.6, rMax = 3.2, seed = 3 } = {}) {
  const { disc, rim, dome, belly } = saucerGeos(), group = new T.Group(); parent.add(group);
  const meshes = [[disc, hull()], [rim, new T.MeshLambertMaterial({ color: 0x6a7080 })], [dome, glass()], [belly, glowMat(0x7dff6a, .95)]].map(([geo, mat]) => { const m = new T.InstancedMesh(geo, mat, n); group.add(m); return m; });
  const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), P = new T.Vector3(), S = new T.Vector3();
  for (let i = 0; i < n; i++) {
    const r = rMin + rand(i, seed, 4) * (rMax - rMin);
    P.set(center[0] + (rand(i, seed, 1) * 2 - 1) * half[0], center[1] + (rand(i, seed, 2) * 2 - 1) * half[1], center[2] + (rand(i, seed, 3) * 2 - 1) * half[2]);
    Q.setFromEuler(E.set((rand(i, seed, 5) - .5) * .35, rand(i, seed, 6) * 6.28, (rand(i, seed, 7) - .5) * .35)); M.compose(P, Q, S.setScalar(r));
    for (const m of meshes) m.setMatrixAt(i, M);
  }
  return group;
}

/**
 * The mothership: a saucer the size of a town, rings of lights, and one huge angry red eye underneath (the shield
 * generator). Returns { group, eye, shield } (world positions: eye at the underside centre).
 */
export function mothership(parent, p, r = 40, { shield = true, shieldStrength = 1.1 } = {}) {
  const group = new T.Group(); group.position.set(...p); parent.add(group);
  const layer = (rTop, rBot, h, y, mat) => { const m = new T.Mesh(new T.CylinderGeometry(rTop, rBot, h, 48), mat); m.position.y = y; group.add(m); return m; };
  layer(r, r * .7, r * .12, 0, hull()); layer(r * 1.04, r * 1.04, r * .025, 0, new T.MeshLambertMaterial({ color: 0x5a6070 }));
  layer(r * .55, r * .7, r * .1, r * .1, hull()); layer(r * .35, r * .45, r * .08, r * .19, new T.MeshStandardMaterial({ color: 0x8a5ad0, metalness: .4, roughness: .4 }));
  const dome = new T.Mesh(new T.SphereGeometry(r * .3, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), glass()); dome.position.y = r * .23; group.add(dome);
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 48; i++) { const a = i / 48 * Math.PI * 2, rr = ring ? r * .78 : r * 1.03, y = ring ? -r * .06 : 0; const b = new T.Mesh(new T.BoxGeometry(r * .03, r * .02, r * .03), glowMat(i % 3 ? 0x7dff6a : 0xffe14a, 1)); b.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); group.add(b); }
  // the eye: a white disc, a red iris and a black pupil, looking down
  const eye = new T.Group(); eye.position.y = -r * .065; group.add(eye);
  const disc = (rad, color, y) => { const m = new T.Mesh(new T.CircleGeometry(rad, 40), new T.MeshBasicMaterial({ color })); m.rotation.x = Math.PI / 2; m.position.y = y; eye.add(m); };
  disc(r * .22, 0xfff6d0, 0); disc(r * .13, 0xd0182a, -.05); disc(r * .06, 0x120a0a, -.1);
  for (const s of [-1, 1]) { const brow = new T.Mesh(new T.BoxGeometry(r * .2, r * .02, r * .05), new T.MeshLambertMaterial({ color: 0x2a2a34 })); brow.position.set(s * r * .1, -.2, -r * .2); brow.rotation.y = s * .35; eye.add(brow); }
  const light = new T.PointLight(0xff4a3a, 60, r * 3); light.position.y = -r * .2; group.add(light);
  let dome2 = null;
  if (shield) { dome2 = new T.Mesh(new T.SphereGeometry(r * 1.35, 48, 24), fresnelMat(0x7dff6a, { power: 2.2, strength: shieldStrength, base: .04 })); group.add(dome2); }
  return { group, eye, shield: dome2 };
}

/** A tractor beam: a soft green cone of light from a (x, y, z) widening down to b, with rising sparkles. */
export function tractorBeam(parent, a, b, { radius = 2.2, color = 0x9dff7a, seed = 5, soft = false } = {}) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), len = A.distanceTo(B), g = new T.Group(); parent.add(g);
  g.position.copy(A).lerp(B, .5); g.lookAt(B); g.rotateX(Math.PI / 2);
  for (const [k, op] of soft ? [[1, .08], [.6, .06]] : [[1, .16], [.7, .14], [.4, .18]]) g.add(new T.Mesh(new T.CylinderGeometry(radius * .25 * k, radius * k, len, 24, 1, true), glowMat(color, op)));
  for (let i = 0; i < 70; i++) { const s = new T.Mesh(new T.BoxGeometry(.08, .08, .08), glowMat(0xffffff, .9)), t = rand(i, seed, 1), rr = radius * (.25 + .75 * (1 - t)) * rand(i, seed, 2), q = rand(i, seed, 3) * 6.28; s.position.set(Math.cos(q) * rr, (t - .5) * len, Math.sin(q) * rr); g.add(s); }
  const l = new T.PointLight(color, soft ? 3 : 12, radius * 4); l.position.y = -len * .4; g.add(l);
  return g;
}

/** A goo ray: a bright green bolt from a to b with a splash at b. */
export function gooRay(parent, a, b, { color = 0x7dff6a, width = .14 } = {}) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), len = A.distanceTo(B), g = new T.Group(); parent.add(g);
  const bolt = new T.Group(); bolt.position.copy(A).lerp(B, .5); bolt.lookAt(B); bolt.rotateX(Math.PI / 2); g.add(bolt);
  bolt.add(new T.Mesh(new T.CylinderGeometry(width * .45, width * .45, len, 8), glowMat(0xeaffe0, 1)));
  bolt.add(new T.Mesh(new T.CylinderGeometry(width * 1.4, width * 1.4, len, 10, 1, true), glowMat(color, .35)));
  const splash = new T.Mesh(new T.SphereGeometry(width * 4, 12, 8), glowMat(color, .5)); splash.position.copy(B); g.add(splash);
  return g;
}

/** Green jelly around someone a goo ray caught: a wobbly translucent block. */
export function gooJelly(parent, p, size = [1.1, 2.2, 1.1]) {
  const m = new T.Mesh(new T.BoxGeometry(...size, 2, 3, 2), new T.MeshPhongMaterial({ color: 0x6dff6a, transparent: true, opacity: .42, shininess: 100, specular: 0xffffff, depthWrite: false }));
  const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) pos.setXYZ(i, pos.getX(i) * (1 + Math.sin(i * 1.7) * .05), pos.getY(i), pos.getZ(i) * (1 + Math.cos(i * 2.3) * .05));
  m.geometry.computeVertexNormals(); m.position.set(p[0], p[1] + size[1] / 2, p[2]); m.renderOrder = 2; parent.add(m); return m;
}

/** A crashed saucer, half buried and tilted, smoking (a piece of battlefield set dressing). */
export function wreck(parent, p, r = 2, tilt = .5) {
  const s = saucer(parent, [p[0], p[1] + r * .1, p[2]], r, { tilt: [tilt, tilt * .6], lights: false });
  for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.SphereGeometry(r * (.25 + i * .06), 10, 8), new T.MeshLambertMaterial({ color: 0x777b84, transparent: true, opacity: .35 - i * .04, depthWrite: false })); m.position.set(p[0] + i * .2, p[1] + r * .4 + i * r * .35, p[2] + i * .1); parent.add(m); }
  return s;
}
