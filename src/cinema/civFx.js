// 1500 Players · effects and props: Ki auras, the Spirit Bomb, Death Balls, the protective light dome, the
// Flying Nimbus, the world border wall, blizzard snow, fairy lights, the thruster train, Gabby's mailbox,
// ocelots, bread, a squeaky toy hammer and the final floating platform.
import * as T from 'three';
import { cube } from './civCast.js';
import { rand } from './claudeStage.js';

const glowMat = (color, opacity = .6) => new T.MeshBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false });
/** Fresnel glow shell: bright at the rim, clear in the middle. */
export function fresnelMat(color, { power = 2.2, strength = 1.4, base = .08 } = {}) {
  return new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide,
    uniforms: { color: { value: new T.Color(color) }, power: { value: power }, strength: { value: strength }, base: { value: base } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 color; uniform float power; uniform float strength; uniform float base; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1. - abs(dot(normalize(vN), normalize(vV))), power); gl_FragColor = vec4(color * (f * strength + base), 1.); }',
  });
}

/** A flame-shaped Ki aura: stacked additive cones around a character standing at p (height h). */
export function aura(scene, p, { color = 0xffe066, h = 2.1, r = .8, seed = 1, sparks = 26 } = {}) {
  const g = new T.Group(); g.position.set(...p); scene.add(g);
  for (let i = 0; i < 3; i++) { const m = new T.Mesh(new T.ConeGeometry(r * (1 - i * .18), h * (1.3 - i * .1), 8, 1, true), glowMat(color, .22 - i * .04)); m.position.y = h * .6; g.add(m); }
  for (let i = 0; i < sparks; i++) { const a = rand(i, seed) * 6.28, rr = r * (.6 + rand(seed, i) * .5), y = rand(i, seed, 2) * h * 1.3; const m = new T.Mesh(new T.BoxGeometry(.06, .3 + rand(i, 3) * .4, .06), glowMat(color, .7)); m.position.set(Math.cos(a) * rr, y, Math.sin(a) * rr); g.add(m); }
  const light = new T.PointLight(color, 6, 9); light.position.y = h * .6; g.add(light);
  return g;
}
/** An energy ball (Spirit Bomb blue-white, Death Ball orange-red): a core, layered glow shells and a light. */
export function energyBall(scene, p, radius, { core = 0xe8f6ff, glow = 0x6fc8ff, light = 40, range = 120 } = {}) {
  const g = new T.Group(); g.position.set(...p); scene.add(g);
  g.add(new T.Mesh(new T.SphereGeometry(radius, 40, 24), new T.MeshBasicMaterial({ color: core })));
  for (const [k, op] of [[1.08, .5], [1.25, .28], [1.6, .14], [2.2, .07]]) g.add(new T.Mesh(new T.SphereGeometry(radius * k, 32, 16), glowMat(glow, op)));
  const l = new T.PointLight(glow, light, range, 1.2); g.add(l); return g;
}
/** The protective dome of joyful light: a fresnel hemisphere with sparkles. */
export function lightDome(scene, p, radius, { color = 0xffd27a, seed = 4 } = {}) {
  const g = new T.Group(); g.position.set(...p); scene.add(g);
  g.add(new T.Mesh(new T.SphereGeometry(radius, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), fresnelMat(color, { power: 2.4, strength: 1.0, base: .03 })));
  for (let i = 0; i < 160; i++) { const a = rand(i, seed) * 6.28, e = rand(seed, i) * 1.5, rr = radius * (.98 + rand(i, 7) * .05); const m = new T.Mesh(new T.BoxGeometry(.18, .18, .18), glowMat([0xffffff, 0xffe28a, 0xffb3e0, 0x9fe8ff][i % 4], .9)); m.position.set(Math.cos(a) * Math.cos(e) * rr, Math.sin(e) * rr, Math.sin(a) * Math.cos(e) * rr); g.add(m); }
  const l = new T.PointLight(color, 10, radius * 3); l.position.y = radius * .6; g.add(l); return g;
}
/** Kintoun, the Flying Nimbus: a puffy yellow cloud of boxes. */
export function nimbus(parent, p, scale = 1) {
  const g = new T.Group(); g.position.set(...p); g.scale.setScalar(scale); parent.add(g);
  const mat = new T.MeshLambertMaterial({ color: 0xffe36a, emissive: 0x6a5410 });
  for (let i = 0; i < 9; i++) { const m = new T.Mesh(new T.BoxGeometry(.6 + rand(i, 1) * .5, .35 + rand(i, 2) * .25, .6 + rand(i, 3) * .4), mat); m.position.set((rand(i, 4) - .5) * 1.2, (rand(i, 5) - .5) * .2, (i - 4) * .22); m.castShadow = true; g.add(m); }
  for (let i = 0; i < 6; i++) { const m = new T.Mesh(new T.BoxGeometry(.3, .25, .3), mat); m.position.set((rand(i, 6) - .5) * .5, 0, 1.1 + i * .35); m.scale.setScalar(1 - i * .14); g.add(m); }
  return g;
}
/** The world border: a soft curtain of light, brightest at its foot and fading upward. (Minecraft's diagonal
 *  stripes, tiled every few metres, read on screen as scan-line artefacts over the islands, so they are not used.) */
export function borderWall(scene, x0, z0, x1, z1, { y0 = 0, height = 120, color = '#ff3d3d', opacity = .55 } = {}) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const p = c.getContext('2d'), k = new T.Color(color), rgb = `${Math.round(k.r * 255)},${Math.round(k.g * 255)},${Math.round(k.b * 255)}`;
  const grad = p.createLinearGradient(0, 256, 0, 0); grad.addColorStop(0, `rgba(${rgb},1)`); grad.addColorStop(.04, `rgba(${rgb},.7)`); grad.addColorStop(.3, `rgba(${rgb},.22)`); grad.addColorStop(1, `rgba(${rgb},0)`);
  p.fillStyle = grad; p.fillRect(0, 0, 4, 256);
  const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace; const g = new T.Group(); scene.add(g);
  for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0]]) {
    const len = Math.hypot(bx - ax, bz - az);
    const m = new T.Mesh(new T.PlaneGeometry(len, height), new T.MeshBasicMaterial({ map: tex, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    m.position.set((ax + bx) / 2, y0 + height / 2, (az + bz) / 2); m.rotation.y = -Math.atan2(bz - az, bx - ax); g.add(m);
  }
  return g;
}
/** Snow flying across the lens: n flakes in a box in front of the camera. */
export function snowfall(scene, camera, { n = 2500, depth = 40, spread = 30, seed = 2, size = .12, wind = .6 } = {}) {
  const geo = new T.BufferGeometry(), pos = new Float32Array(n * 3), dir = new T.Vector3(); camera.getWorldDirection(dir);
  const right = new T.Vector3().crossVectors(dir, camera.up).normalize(), up = new T.Vector3().crossVectors(right, dir).normalize();
  for (let i = 0; i < n; i++) { const d = 1 + rand(i, seed) * depth, a = (rand(seed, i) - .5) * spread * (d / depth + .2), b = (rand(i, seed, 3) - .5) * spread * .6 * (d / depth + .2); const p = camera.position.clone().addScaledVector(dir, d).addScaledVector(right, a + b * wind * .3).addScaledVector(up, b); pos.set([p.x, p.y, p.z], i * 3); }
  geo.setAttribute('position', new T.BufferAttribute(pos, 3));
  const m = new T.Points(geo, new T.PointsMaterial({ color: 0xffffff, size, transparent: true, opacity: .85, depthWrite: false })); scene.add(m); return m;
}
/** A string of fairy lights between points, sagging, with soft glows. */
export function fairyLights(scene, a, b, { n = 16, sag = 1, colors = [0xffd27a, 0xff9ad5, 0x9fe8ff, 0xc7a0ff], light = true } = {}) {
  const g = new T.Group(); scene.add(g); const A = new T.Vector3(...a), B = new T.Vector3(...b);
  for (let i = 0; i <= n; i++) { const k = i / n, p = A.clone().lerp(B, k); p.y -= Math.sin(k * Math.PI) * sag; const c = colors[i % colors.length]; const m = new T.Mesh(new T.SphereGeometry(.07, 8, 6), new T.MeshBasicMaterial({ color: c })); m.position.copy(p); g.add(m); const h = new T.Mesh(new T.SphereGeometry(.22, 8, 6), glowMat(c, .35)); h.position.copy(p); g.add(h); }
  if (light) { const l = new T.PointLight(0xffc89a, 4, 10); l.position.copy(A.clone().lerp(B, .5)); l.position.y -= sag; g.add(l); }
  return g;
}
/** The squeaky toy hammer (red head, yellow handle). */
export function toyHammer(parent, at = [0, 0, 0], rot = [0, 0, 0]) {
  const g = new T.Group(); g.position.set(...at); g.rotation.set(...rot); parent.add(g);
  cube(g, [.07, .55, .07], [0, .27, 0], { all: '#ffd23a' }); cube(g, [.36, .2, .2], [0, .6, 0], { all: '#e8323a' }); cube(g, [.06, .22, .22], [-.2, .6, 0], { all: '#ffffff' }); cube(g, [.06, .22, .22], [.2, .6, 0], { all: '#ffffff' });
  return g;
}
/** A loaf of bread. */
export function bread(parent, at, rot = [0, 0, 0]) { const g = new T.Group(); g.position.set(...at); g.rotation.set(...rot); parent.add(g); cube(g, [.5, .2, .24], [0, 0, 0], { all: '#c98a3e', top: '#a96b2a' }); cube(g, [.4, .06, .2], [0, .12, 0], { all: '#b57532' }); return g; }
/** A plate of chocolate-chip cookies. */
export function cookies(parent, at, n = 5) { const g = new T.Group(); g.position.set(...at); parent.add(g); cube(g, [.6, .04, .6], [0, 0, 0], { all: '#f1efe8' }); for (let i = 0; i < n; i++) cube(g, [.16, .04, .16], [(i % 3 - 1) * .17, .04 + Math.floor(i / 3) * .04, (Math.floor(i / 3) - .5) * .17], { all: (p, w, h) => { p.fillStyle = '#c98a3e'; p.fillRect(0, 0, w, h); p.fillStyle = '#4a2a14'; p.fillRect(w * .2, h * .3, 1, 1); p.fillRect(w * .6, h * .6, 1, 1); } }); return g; }
/** An ocelot (yellow, spotted). */
export function ocelot(parent, at, yaw = 0) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; parent.add(g);
  const fur = (p, w, h) => { p.fillStyle = '#e8b84a'; p.fillRect(0, 0, w, h); p.fillStyle = '#6a4a1c'; for (let i = 0; i < 6; i++) p.fillRect(Math.floor(rand(i, 1) * w), Math.floor(rand(i, 2) * h), 1, 1); };
  cube(g, [.24, .22, .6], [0, .3, 0], { all: fur }); cube(g, [.26, .24, .26], [0, .42, -.36], { all: fur, front: (p, w, h) => { fur(p, w, h); p.fillStyle = '#2c8a3a'; p.fillRect(w * .2, h * .35, 1, 1); p.fillRect(w * .7, h * .35, 1, 1); } });
  for (const s of [-1, 1]) cube(g, [.06, .08, .04], [s * .08, .58, -.38], { all: '#e8b84a' });
  for (const [x, z] of [[-.08, -.2], [.08, -.2], [-.08, .2], [.08, .2]]) cube(g, [.07, .2, .07], [x, .1, z], { all: '#e8b84a' });
  const tail = cube(g, [.05, .05, .4], [0, .36, .45], { all: '#e8b84a' }); tail.rotation.x = .5; return g;
}
/** Gabby's Meow Meow Mailbox: a pink mailbox with cat ears and a flag. */
export function mailbox(parent, at, yaw = 0) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; parent.add(g);
  cube(g, [.12, 1, .12], [0, .5, 0], { all: '#b08a5a' });
  cube(g, [.5, .44, .7], [0, 1.2, 0], { all: '#f27fb7', front: (p, w, h) => { p.fillStyle = '#f27fb7'; p.fillRect(0, 0, w, h); p.fillStyle = '#fff'; p.fillRect(w * .2, h * .3, w * .2, h * .25); p.fillRect(w * .6, h * .3, w * .2, h * .25); p.fillStyle = '#2c7a3a'; p.fillRect(w * .26, h * .36, w * .1, h * .16); p.fillRect(w * .66, h * .36, w * .1, h * .16); p.fillStyle = '#5b2b2b'; p.fillRect(w * .4, h * .72, w * .2, h * .06); } }, { d: 32 });
  for (const s of [-1, 1]) { const e = cube(g, [.14, .16, .06], [s * .15, 1.48, -.2], { all: '#f27fb7' }); e.rotation.z = -s * .3; }
  cube(g, [.04, .3, .04], [.27, 1.35, .1], { all: '#e8323a' }); cube(g, [.04, .12, .16], [.27, 1.45, .18], { all: '#e8323a' });
  return g;
}
/** The thruster train: cars with Saiyan-pod engines and blue flames, on a rail bridge. */
export function thrusterTrain(parent, at, yaw = 0, cars = 4) {
  const g = new T.Group(); g.position.set(...at); g.rotation.y = yaw; parent.add(g);
  for (let i = 0; i < cars; i++) {
    const c = new T.Group(); c.position.z = i * 3.4; g.add(c);
    cube(c, [1.6, 1.2, 3], [0, .9, 0], { all: i === 0 ? '#f4f2ea' : '#22336f', front: i === 0 ? (p, w, h) => { p.fillStyle = '#f4f2ea'; p.fillRect(0, 0, w, h); p.fillStyle = '#8fd4ff'; p.fillRect(w * .15, h * .15, w * .7, h * .35); } : undefined });
    cube(c, [1.7, .14, 3.1], [0, 1.56, 0], { all: '#e8c04a' });
    if (i > 0) { cube(c, [1.2, .5, 1.6], [0, 1.75, .2], { all: '#d9cfa4' }); }
    for (const s of [-1, 1]) { // the pod engine and its flame
      const e = new T.Mesh(new T.SphereGeometry(.42, 16, 12), new T.MeshLambertMaterial({ color: 0xeeeeee })); e.position.set(s * 1.05, .9, .9); c.add(e);
      const f = new T.Mesh(new T.ConeGeometry(.3, 1.6, 12, 1, true), glowMat(0x6fc8ff, .75)); f.rotation.x = Math.PI / 2; f.position.set(s * 1.05, .9, 2.1); c.add(f);
      const f2 = new T.Mesh(new T.ConeGeometry(.16, 1, 12, 1, true), glowMat(0xffffff, .9)); f2.rotation.x = Math.PI / 2; f2.position.set(s * 1.05, .9, 1.8); c.add(f2);
    }
    for (const [x, z] of [[-.7, -1], [.7, -1], [-.7, 1], [.7, 1]]) cube(c, [.12, .4, .4], [x, .25, z], { all: '#2b2b33' });
  }
  const l = new T.PointLight(0x6fc8ff, 8, 14); l.position.set(0, 1, 3); g.add(l); return g;
}
/** A rail bridge across the sea from a to b at height y (oak deck on stone pillars). */
export function railBridge(parent, a, b, y) {
  const g = new T.Group(); parent.add(g); const len = Math.hypot(b[0] - a[0], b[1] - a[1]), yaw = Math.atan2(b[0] - a[0], b[1] - a[1]);
  g.position.set((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2); g.rotation.y = yaw;
  const deck = new T.Mesh(new T.BoxGeometry(3, .4, len), new T.MeshLambertMaterial({ color: 0x9c7a4c })); deck.receiveShadow = deck.castShadow = true; g.add(deck);
  for (const s of [-1, 1]) { const r = new T.Mesh(new T.BoxGeometry(.12, .12, len), new T.MeshLambertMaterial({ color: 0x8a8a8a })); r.position.set(s * .7, .26, 0); g.add(r); }
  for (let z = -len / 2; z <= len / 2; z += 10) { const p = new T.Mesh(new T.BoxGeometry(1.2, y, 1.2), new T.MeshLambertMaterial({ color: 0x8c8c8c })); p.position.set(0, -y / 2, z); p.castShadow = true; g.add(p); }
  return g;
}
/** The last platform over the void: a ragged slab of grass and dirt blocks. */
export function platform(parent, at, size = 9, mats = {}) {
  const g = new T.Group(); g.position.set(...at); parent.add(g);
  const grass = mats.top ?? new T.MeshLambertMaterial({ color: 0x6aa84f }), side = mats.side ?? new T.MeshLambertMaterial({ color: 0x7a5a3a }), dirt = mats.dirt ?? side;
  for (let x = -size; x <= size; x++) for (let z = -size; z <= size; z++) {
    if (Math.hypot(x, z) > size * (.85 + rand(x, z, 1) * .2)) continue;
    const m = new T.Mesh(new T.BoxGeometry(1, 1, 1), [side, side, grass, dirt, side, side]); m.position.set(x, -.5, z); m.receiveShadow = m.castShadow = true; g.add(m);
    const depth = 1 + Math.floor((1 - Math.hypot(x, z) / size) * 5 * rand(z, x, 2)); for (let d = 1; d <= depth; d++) { const u = new T.Mesh(new T.BoxGeometry(1, 1, 1), dirt); u.position.set(x, -.5 - d, z); g.add(u); }
  }
  return g;
}
/** Sparkles that materialise players (the lobby). */
export function sparkles(scene, center, { n = 300, radius = 30, height = 4, seed = 9 } = {}) {
  const g = new T.Group(); scene.add(g);
  for (let i = 0; i < n; i++) { const a = rand(i, seed) * 6.28, r = Math.sqrt(rand(seed, i)) * radius; const m = new T.Mesh(new T.BoxGeometry(.1, .1, .1), glowMat([0xffffff, 0xbfe8ff, 0xffe8a8][i % 3], .9)); m.position.set(center[0] + Math.cos(a) * r, center[1] + rand(i, 3) * height, center[2] + Math.sin(a) * r); g.add(m); }
  return g;
}
export { glowMat };
