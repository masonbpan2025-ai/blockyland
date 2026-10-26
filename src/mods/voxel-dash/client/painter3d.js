import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { LEVELS, createCourse } from '../levels.js';
import { levelPalette, mix } from './theme.js';
import { buildTrack, chaseCamera, clampCamera, DEFAULT_CAMERA, UNIT, TRACK_WIDTH, LEAD_IN } from './track3d.js';

// The 3D view of a run: the same state the 2D painter draws (the simulation does not know which view is on), shown as
// a blocky world the course winds through on a fixed path (track3d.js), with a chase camera behind and beside the
// player, as in Minecraft's Sonic the Hedgehog DLC. One unit here is one block, 30 course units.
//
// The course is built once per level into instanced meshes -- a block per cell, every cell across the track -- so a
// frame is a handful of draw calls whatever the level. Only the few moving things (pads, orbs, portals, saws, coins)
// are meshes of their own, shown when near.

const fract = (n) => n - Math.floor(n), rand = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
const HALF = TRACK_WIDTH / 2;
/** How far ahead and behind the moving objects are drawn, in blocks. */
const AHEAD = 110, BEHIND = 20;

/** A small pixel texture, drawn by `paint(ctx, size)`, sampled Minecraft-sharp. */
function pixelTexture(size, paint) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  paint(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.NearestMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
/** A grey block face with Minecraft-style speckle, tinted by the material's colour. */
function noiseTexture(seed, edge = true) {
  return pixelTexture(16, (ctx, n) => {
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const v = 200 + Math.floor(rand(seed + x * 17 + y * 131) * 55);
      ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, 1, 1);
    }
    if (edge) { ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(0, n - 1, n, 1); ctx.fillRect(n - 1, 0, 1, n); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(0, 0, n, 1); ctx.fillRect(0, 0, 1, n); }
  });
}
/** The creeper head: the level's colour, speckled, with the face in dark green -- the 2D cube's face, on every side. */
function creeperTexture(color, face = true) {
  return pixelTexture(8, (ctx) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = mix(color, rand(x * 9 + y * 31) > 0.5 ? '#ffffff' : '#000000', rand(x + y * 8) * 0.22); ctx.fillRect(x, y, 1, 1); }
    if (!face) return;
    ctx.fillStyle = '#17372b';
    for (const [x, y, w, h] of [[1, 2, 2, 2], [5, 2, 2, 2], [3, 4, 2, 1], [2, 5, 4, 2], [2, 7, 1, 1], [5, 7, 1, 1]]) ctx.fillRect(x, y, w, h);
  });
}
/** The sky behind it all: the level's two sky colours, top to bottom. */
function skyTexture(level) {
  const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 256;
  const ctx = canvas.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, level.sky[0]); g.addColorStop(1, level.sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, 2, 256);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}

export function createPainter3d(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.1, 400);
  // The light: sky and ground fill in the level's colours, a warm sun that follows the player and casts its shadows
  // (where the player is over the track is plain at a glance), a rim light in the level's colour from ahead that picks
  // out every edge, and a glow the player carries. Bright things -- pads, orbs, portals, the finish -- bloom.
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445566, 1.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0xffffff, 1.3); scene.add(rim, rim.target);
  const carried = new THREE.PointLight(0xffffff, 3, 8, 1); scene.add(carried);
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
  const bloom = new UnrealBloomPass(new THREE.Vector2(480, 270), 0.55, 0.4, 1.6);
  composer.addPass(new RenderPass(scene, camera)); composer.addPass(bloom); composer.addPass(new OutputPass());
  // Drawn without a graphics chip (a software renderer), the glow and the shadows go from the start.
  const gl = renderer.getContext(), info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe|software|basic render/i.test(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : '');
  if (software) { bloom.enabled = false; renderer.shadowMap.enabled = false; rim.visible = false; }
  let width = 0, height = 0, cssWidth = canvas.clientWidth || 960, cssHeight = canvas.clientHeight || 540;
  const resize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(([entry]) => { cssWidth = entry.contentRect.width; cssHeight = entry.contentRect.height; }) : null;
  resize?.observe(canvas);

  // Shared, level-independent pieces.
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const spikeGeometry = new THREE.ConeGeometry(0.5 * Math.SQRT2, 1, 4, 1); spikeGeometry.rotateY(Math.PI / 4);
  const spikeOutlineGeometry = spikeGeometry.clone(); spikeOutlineGeometry.scale(1.16, 1.1, 1.16);
  const disposables = [unitBox, spikeGeometry, spikeOutlineGeometry];
  const temp = new THREE.Object3D(), tempColor = new THREE.Color();

  let level = null, levelIndex = -1, track = null, pal = null, world = null;
  /** Everything built for the current level; dropped and disposed when the level changes. */
  function clearWorld() {
    if (!world) return;
    scene.remove(world.root);
    world.root.traverse((o) => { if (o.geometry && !disposables.includes(o.geometry)) o.geometry.dispose(); const m = o.material; for (const mm of Array.isArray(m) ? m : m ? [m] : []) { mm.map?.dispose(); mm.dispose(); } });
    scene.background?.dispose?.();
    world = null;
  }

  /** Set an instance's matrix: a box `w` long, `h` tall and `d` across, centred on course point (x, y units) at `across` blocks. */
  function placeBox(mesh, i, xUnits, yUnits, w, h, d, across = 0, extraZ = 0) {
    const p = track.place(xUnits, yUnits, across);
    temp.position.set(p.x, p.y, p.z); temp.rotation.set(0, -p.heading, extraZ); temp.scale.set(w, h, d); temp.updateMatrix();
    mesh.setMatrixAt(i, temp.matrix);
  }
  function instanced(geometry, material, count) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count)); mesh.count = count; mesh.frustumCulled = false; return mesh;
  }

  function buildWorld(index) {
    clearWorld();
    levelIndex = index; level = LEVELS[index]; pal = levelPalette(level);
    const course = createCourse(index); track = buildTrack(level.length, index);
    const root = new THREE.Group(); scene.add(root);
    scene.background = skyTexture(level);
    scene.fog = new THREE.Fog(new THREE.Color(level.sky[1]), 40, 150);
    hemi.color.set(mix(level.sky[0], '#ffffff', 0.6)); hemi.groundColor.set(mix(level.ground, '#000000', 0.3));
    hemi.intensity = pal.light ? 1.6 : 2.6; sun.intensity = pal.light ? 2.4 : 2.8;
    rim.color.set(mix(level.color, '#ffffff', 0.3)); carried.color.set(level.color);
    world = { root, course, moving: [], used: null };

    // The ground: the track bed along the whole run, three blocks across, its curbs striped like a Sonic road.
    const runBlocks = Math.ceil(track.length + LEAD_IN);
    const groundSide = new THREE.MeshLambertMaterial({ color: level.stone, map: noiseTexture(1) });
    const groundTop = new THREE.MeshLambertMaterial({ color: pal.light ? level.ground : mix(level.ground, '#ffffff', 0.1), map: noiseTexture(2) });
    const ground = instanced(unitBox, [groundSide, groundSide, groundTop, groundSide, groundSide, groundSide], runBlocks * TRACK_WIDTH);
    let n = 0;
    for (let b = 0; b < runBlocks; b++) for (let k = 0; k < TRACK_WIDTH; k++) placeBox(ground, n++, (b - LEAD_IN + 0.5) * UNIT, -0.5 * UNIT, 1.02, 1, 1, k - HALF + 0.5);
    ground.receiveShadow = true; root.add(ground);
    const curb = instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff, map: noiseTexture(3, false) }), runBlocks * 2);
    const stripeA = new THREE.Color(pal.accent), stripeB = new THREE.Color(pal.light ? '#1b1b24' : '#0b0d12');
    n = 0;
    for (let b = 0; b < runBlocks; b++) for (const side of [-1, 1]) { placeBox(curb, n, (b - LEAD_IN + 0.5) * UNIT, 0.12 * UNIT, 1.02, 0.24, 0.3, side * (HALF + 0.15)); curb.setColorAt(n++, b % 2 ? stripeA : stripeB); }
    root.add(curb);
    // Pillars under the track every few blocks, down into the haze: the road is a raised one.
    const pillars = instanced(unitBox, new THREE.MeshLambertMaterial({ color: mix(level.stone, '#000000', 0.25), map: noiseTexture(4) }), Math.ceil(runBlocks / 9));
    n = 0;
    for (let b = 4; b < runBlocks; b += 9) placeBox(pillars, n++, (b - LEAD_IN) * UNIT, -9 * UNIT, 1.2, 17, 1.2);
    pillars.count = n; root.add(pillars);

    // Blocks and wall insides, a cube per 30-unit cell, every cell the width of the track.
    const cells = (type) => {
      const out = [];
      for (const o of course) if (o.type === type) {
        const nx = Math.max(1, Math.round(o.w / UNIT)), ny = Math.max(1, Math.round(o.h / UNIT));
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([o.x + (i + 0.5) * o.w / nx, o.y + (j + 0.5) * o.h / ny, o.w / nx / UNIT, o.h / ny / UNIT]);
      }
      return out;
    };
    const solidSide = new THREE.MeshLambertMaterial({ color: pal.solid, map: noiseTexture(5) });
    const solidTop = new THREE.MeshLambertMaterial({ color: pal.solidTop, map: noiseTexture(6) });
    for (const [type, materials] of [['block', [solidSide, solidSide, solidTop, solidSide, solidSide, solidSide]], ['fill', new THREE.MeshLambertMaterial({ color: pal.fill, map: noiseTexture(7) })]]) {
      const list = cells(type), mesh = instanced(unitBox, materials, list.length * TRACK_WIDTH);
      n = 0;
      for (const [x, y, w, h] of list) for (let k = 0; k < TRACK_WIDTH; k++) placeBox(mesh, n++, x, y, w * 1.001, h * 1.001, 1.001, k - HALF + 0.5);
      mesh.receiveShadow = true; root.add(mesh);
    }

    // Spikes: a row across the track, turned and flipped as the course has them. Pits: a dark trench of small spikes.
    // Bright, lit, glowing faintly in the level's colour and outlined in near-black: the 2D painter's dark spikes on a
    // light level were all but invisible in 3D, where the light falls on them from one side.
    const spikeMaterial = new THREE.MeshLambertMaterial({ color: mix(level.color, '#ffffff', 0.82), emissive: new THREE.Color(mix(level.color, '#000000', 0.45)) });
    const outlineMaterial = new THREE.MeshBasicMaterial({ color: '#08090c', side: THREE.BackSide });
    const spikes = course.filter((o) => o.type === 'spike'), pits = course.filter((o) => o.type === 'pit');
    const pitTeeth = pits.reduce((sum, o) => sum + Math.max(1, Math.round(o.w / 10)) * TRACK_WIDTH * 2, 0);
    const spikeMesh = instanced(spikeGeometry, spikeMaterial, spikes.length * TRACK_WIDTH + pitTeeth);
    n = 0;
    for (const o of spikes) for (let k = 0; k < TRACK_WIDTH; k++) {
      const p = track.place(o.cx, o.cy, k - HALF + 0.5);
      temp.position.set(p.x, p.y, p.z); temp.rotation.set(0, -p.heading, -o.rotation * Math.PI / 180 + (o.flipY ? Math.PI : 0), 'YXZ');
      temp.scale.set(o.localW / UNIT * 0.98, o.localH / UNIT, 0.98); temp.updateMatrix(); spikeMesh.setMatrixAt(n++, temp.matrix);
    }
    const pitMesh = instanced(unitBox, new THREE.MeshLambertMaterial({ color: pal.light ? '#141418' : '#05080a' }), pits.length);
    pits.forEach((o, i) => {
      placeBox(pitMesh, i, o.x + o.w / 2, o.y + o.h / 2, o.w / UNIT * 1.01, o.h / UNIT, TRACK_WIDTH * 1.01);
      const teeth = Math.max(1, Math.round(o.w / 10));
      for (let t = 0; t < teeth; t++) for (let k = 0; k < TRACK_WIDTH * 2; k++) {
        const p = track.place(o.x + (t + 0.5) * o.w / teeth, o.y + o.h + 3, (k + 0.5) / 2 - HALF);
        temp.position.set(p.x, p.y, p.z); temp.rotation.set(0, -p.heading, 0); temp.scale.set(o.w / teeth / UNIT * 0.9, 0.2, 0.45); temp.updateMatrix(); spikeMesh.setMatrixAt(n++, temp.matrix);
      }
    });
    spikeMesh.count = n; pitMesh.receiveShadow = true;
    // The outline: the same spikes, a shell a little larger, drawn from inside in near-black.
    const spikeOutline = instanced(spikeOutlineGeometry, outlineMaterial, spikeMesh.instanceMatrix.count);
    spikeOutline.instanceMatrix = spikeMesh.instanceMatrix; spikeOutline.count = n;
    root.add(spikeMesh, spikeOutline, pitMesh);

    // The moving and glowing things, one mesh each, shown when near.
    const glowMaterial = (color, opacity = 1) => { const m = new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, fog: false, toneMapped: false }); m.color.multiplyScalar(2.6); return m; };
    const ringGeometry = new THREE.TorusGeometry(0.47, 0.07, 8, 24), sphereGeometry = new THREE.SphereGeometry(0.34, 16, 12);
    const portalGeometry = new THREE.TorusGeometry(1, 0.07, 8, 40); portalGeometry.rotateY(Math.PI / 2);
    const sawShape = new THREE.Shape();
    for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 2, r = k % 2 ? 0.78 : 1; k ? sawShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sawShape.moveTo(r, 0); }
    const sawGeometry = new THREE.ExtrudeGeometry(sawShape, { depth: 0.12, bevelEnabled: false }); sawGeometry.translate(0, 0, -0.06);
    const coinGeometry = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 20); coinGeometry.rotateX(Math.PI / 2);
    const sawMaterial = new THREE.MeshLambertMaterial({ color: pal.light ? '#262b30' : '#d5dbe1', side: THREE.DoubleSide });
    const coinMaterial = new THREE.MeshLambertMaterial({ color: '#ffd977', emissive: '#6b4a10' });
    const add = (o, mesh, kind, across = 0) => {
      const p = track.place(o.cx, o.cy, across);
      mesh.position.set(p.x, p.y, p.z); mesh.rotation.set(0, -p.heading, 0);
      root.add(mesh); world.moving.push({ o, mesh, kind, s: o.cx / UNIT });
      return mesh;
    };
    for (const o of course) {
      if (o.type === 'pad') {
        const color = o.pad === 'gravity' ? pal.padGravity : o.pad === 'pink' ? pal.padPink : pal.padYellow;
        const pad = new THREE.Mesh(unitBox, glowMaterial(color)); pad.scale.set(o.w / UNIT, Math.max(4, o.h) / UNIT, TRACK_WIDTH * 0.8);
        add(o, pad, 'pad');
      } else if (o.type === 'ring') {
        const color = o.orb === 'pink' ? pal.orbPink : o.orb === 'blue' ? pal.orbBlue : pal.orbYellow, group = new THREE.Group();
        group.add(new THREE.Mesh(sphereGeometry, glowMaterial(color, 0.75)), new THREE.Mesh(ringGeometry, glowMaterial(color)));
        group.children[1].rotation.y = Math.PI / 2; add(o, group, 'orb');
      } else if (o.type === 'portal') {
        const color = o.mode === 'ship' ? '#71f9fa' : o.mode === 'cube' ? '#a9f478' : o.mode === 'ball' ? '#ff6a5a' : o.mode === 'ufo' ? '#ffb14a' : o.size === 1 ? '#6dff7a' : o.size ? '#ff7ad9' : o.mirror === true ? '#ffa040' : o.mirror === false ? '#48a8ff' : o.gravity === -1 ? '#e1a4ff' : '#ffe8a4';
        const group = new THREE.Group(), ring = new THREE.Mesh(portalGeometry, glowMaterial(color)), haze = new THREE.Mesh(portalGeometry, glowMaterial(color, 0.25));
        haze.scale.setScalar(1.08); group.add(ring, haze); group.scale.set(1, 50 / UNIT, Math.max(50 / UNIT, HALF + 0.2));
        const holder = new THREE.Group(); holder.add(group); group.rotation.z = -o.rotation * Math.PI / 180; add(o, holder, 'portal');
      } else if (o.type === 'saw') {
        const saw = new THREE.Mesh(sawGeometry, sawMaterial); const holder = new THREE.Group(); holder.add(saw);
        saw.scale.setScalar(o.radius / UNIT); add(o, holder, 'saw');
      } else if (o.type === 'coin') add(o, new THREE.Mesh(coinGeometry, coinMaterial), 'coin');
    }

    // The finish: a gate of the level's colour across the track.
    const gate = new THREE.Group(), gateMaterial = glowMaterial(level.color);
    for (const side of [-1, 1]) { const post = new THREE.Mesh(unitBox, gateMaterial); post.scale.set(0.3, 9, 0.3); post.position.set(0, 4.5, side * (HALF + 0.4)); gate.add(post); }
    const beam = new THREE.Mesh(unitBox, gateMaterial); beam.scale.set(0.3, 0.3, TRACK_WIDTH + 1.1); beam.position.y = 9; gate.add(beam);
    const gp = track.place(level.length, 0); gate.position.set(gp.x, 0, gp.z); gate.rotation.y = -gp.heading; root.add(gate);

    // The world around the road: blocky hills in the level's hill colours, either side, nearer ones lower.
    // The same colours as the 2D view's hills.
    const hills = level.hills ?? (index === 2 ? ['#75544d', '#97644d', '#bd7750'] : index === 4 ? ['#29243f', '#37304c', '#51455b'] : ['#193e47', '#25545a', '#336a60']);
    const hillMesh = instanced(unitBox, new THREE.MeshLambertMaterial({ color: 0xffffff, map: noiseTexture(8) }), Math.ceil(runBlocks / 4) * 2);
    n = 0;
    for (let b = -LEAD_IN; b < track.length; b += 4) for (const side of [-1, 1]) {
      const r = rand(b * 3.1 + side + index * 50), layer = Math.floor(rand(b + side * 7 + index) * 3);
      const across = side * (16 + layer * 12 + r * 10), h = 6 + r * 10 + layer * 7, w = 5 + rand(b + 9) * 6;
      placeBox(hillMesh, n, b * UNIT, (h / 2 - 14) * UNIT, w, h, w, across);
      hillMesh.setColorAt(n++, tempColor.set(hills[2 - layer]));
    }
    hillMesh.count = n; root.add(hillMesh);

    // The flight corridor's roof and raised floor, laid near the player each frame while flying.
    const corridorMaterial = new THREE.MeshLambertMaterial({ color: level.stone, map: noiseTexture(9), transparent: true, opacity: 0.55 });
    world.corridor = instanced(unitBox, corridorMaterial, 140 * TRACK_WIDTH * 2); world.corridor.count = 0; root.add(world.corridor);

    world.player = buildPlayer(level.color); root.add(world.player.root);
    world.player.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    // The burst of a crash: bits of the player flying apart.
    world.burst = instanced(unitBox, glowMaterial(level.color), 30); world.burst.count = 0; root.add(world.burst);
    world.checkpoint = new THREE.Group();
    const pole = new THREE.Mesh(unitBox, glowMaterial('#76ffd7')); pole.scale.set(0.1, 2.2, 0.1); pole.position.y = 1.1;
    const flag = new THREE.Mesh(unitBox, glowMaterial('#76ffd7')); flag.scale.set(0.9, 0.5, 0.06); flag.position.set(0.45, 1.95, 0);
    world.checkpoint.add(pole, flag); world.checkpoint.visible = false; root.add(world.checkpoint);
  }

  /** The player in each of its forms: the creeper head (cube), and the ship, ball and UFO it rides. */
  function buildPlayer(color) {
    const root = new THREE.Group(), spin = new THREE.Group(); root.add(spin);
    const faceMaterial = new THREE.MeshLambertMaterial({ map: creeperTexture(color) }), topMaterial = new THREE.MeshLambertMaterial({ map: creeperTexture(color, false) });
    const head = new THREE.Mesh(unitBox, [faceMaterial, faceMaterial, topMaterial, topMaterial, faceMaterial, faceMaterial]);
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(unitBox), new THREE.LineBasicMaterial({ color: pal.outline }));
    head.add(outline);
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: '#d7c6ff' })); hull.scale.set(1.5, 0.36, 0.9); hull.position.y = -0.32;
    const keel = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: '#8765c1' })); keel.scale.set(0.9, 0.12, 0.7); keel.position.set(-0.1, -0.55, 0);
    const flame = new THREE.Mesh(unitBox, new THREE.MeshBasicMaterial({ color: '#ffcb76' })); flame.scale.set(0.35, 0.18, 0.4); flame.position.set(-0.9, -0.3, 0);
    ship.add(hull, keel, flame);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 14), faceMaterial);
    const ufo = new THREE.Group();
    const cart = new THREE.Mesh(unitBox, new THREE.MeshLambertMaterial({ color: '#7d7d7d' })); cart.scale.set(1.2, 0.32, 1.0); cart.position.y = -0.38;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: '#bfe9ff', transparent: true, opacity: 0.35 }));
    dome.position.y = -0.22; ufo.add(cart, dome);
    spin.add(head, ship, ball, ufo);
    return { root, spin, head, ship, ball, ufo };
  }

  // Smoothed camera height and the time the player died, for the burst.
  let cameraBase = 0, lastTime = 0, deadAt = null, lastX = -1;
  // The glow is the dearest part of a frame. Where the 3D view cannot hold 45 frames a second with it, it goes, for
  // good: a dash game is played on its frame rate, and looks second.
  const frameTimes = []; let lastFrame = 0;
  function judgeFrameRate() {
    const now = performance.now(), gap = now - lastFrame; lastFrame = now;
    if (!bloom.enabled || gap > 250) return; // a pause or a hidden tab is not a slow frame
    frameTimes.push(gap); if (frameTimes.length < 45) return;
    const average = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length; frameTimes.length = 0;
    if (average > 1000 / 45) bloom.enabled = false;
  }
  const look = new THREE.Vector3();
  const playerAt = {};
  // The camera angle the player chose (track3d.js chaseCamera), and the small preview on the level page where it is
  // chosen: the creeper head standing near the level's start, seen from that angle.
  let angle = { ...DEFAULT_CAMERA }, preview = null;
  const PREVIEW_S = 8, previewCamera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300), previewAt = {};
  function aim(cam, at) { cam.position.set(at.x, at.y, at.z); look.set(at.lookX, at.lookY, at.lookZ); cam.lookAt(look); }
  /** Draw the preview: into the corner of this canvas, then copied out to the preview's own, before the main view. */
  function renderPreview(t) {
    const pw = preview.width, ph = preview.height, ratio = renderer.getPixelRatio(), buffer = renderer.domElement;
    if (!pw || !ph || ph > buffer.height || pw > buffer.width) return;
    const p = world.player;
    track.place(PREVIEW_S * UNIT, 15, 0, previewAt);
    p.root.visible = true; p.root.position.set(previewAt.x, previewAt.y, previewAt.z); p.root.rotation.y = -previewAt.heading; p.root.scale.setScalar(1);
    p.spin.rotation.z = Math.sin(t * 1.5) * 0.08; p.spin.scale.y = 1;
    p.head.visible = true; p.head.scale.setScalar(1); p.head.position.y = 0; p.ship.visible = p.ball.visible = p.ufo.visible = false;
    sun.position.set(previewAt.x + 8, 18, previewAt.z + 5); sun.target.position.set(previewAt.x, 0, previewAt.z);
    previewCamera.aspect = pw / ph; previewCamera.updateProjectionMatrix();
    aim(previewCamera, chaseCamera(track, PREVIEW_S, 0, angle));
    renderer.setViewport(0, 0, pw / ratio, ph / ratio); renderer.setScissor(0, 0, pw / ratio, ph / ratio); renderer.setScissorTest(true);
    renderer.render(scene, previewCamera);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, width, height);
    preview.getContext('2d').drawImage(buffer, 0, buffer.height - ph, pw, ph, 0, 0, pw, ph);
  }

  return {
    render(state, visualTime) {
      const dpr = software ? 1 : Math.min(devicePixelRatio || 1, 1.5);
      if (cssWidth !== width || cssHeight !== height) {
        width = cssWidth; height = cssHeight;
        renderer.setPixelRatio(dpr); renderer.setSize(Math.max(1, width), Math.max(1, height), false);
        camera.aspect = Math.max(1, width) / Math.max(1, height); camera.updateProjectionMatrix();
        composer.setPixelRatio(dpr); composer.setSize(Math.max(1, width), Math.max(1, height));
        bloom.resolution.set(Math.max(1, width) / 2, Math.max(1, height) / 2);
      }
      const index = state?.levelIndex ?? 0;
      if (index !== levelIndex || !world) buildWorld(index);
      const menu = !state || state.phase === 'menu', t = visualTime;
      const flight = !menu && ['ship', 'ufo', 'ball'].includes(state.mode);
      // Between physics ticks, where the motion has carried the player since the last one (as the 2D painter does).
      const lag = !menu && state.phase === 'play' ? Math.min(state.lag ?? 0, 1 / 240) : 0;
      const drawX = menu ? (t * 90) % Math.max(1, level.length) : state.x + (state.speed ?? 0) * lag;
      const drawY = menu ? 0 : state.y + (state.vy ?? 0) * lag;
      if (!menu && state.x < lastX) cameraBase = 0;
      lastX = menu ? -1 : state.x;
      const desired = menu ? 0 : flight ? Math.max(0, state.floor) / UNIT : Math.max(0, drawY - 150) / UNIT;
      cameraBase += (desired - cameraBase) * (1 - Math.exp(-Math.max(0, t - lastTime) * 6)); lastTime = t;

      // The player.
      const scale = menu ? 1 : state.scale ?? 1, s = (drawX + 15) / UNIT;
      const p = world.player, dead = !menu && state.phase === 'dead';
      track.place(drawX + 15, drawY + 15 * scale, 0, playerAt);
      p.root.position.set(playerAt.x, playerAt.y, playerAt.z); p.root.rotation.y = -playerAt.heading;
      p.root.scale.setScalar(scale);
      const mode = menu ? 'cube' : state.mode;
      p.spin.rotation.z = menu ? Math.sin(t) * 0.12 : -(state.angle ?? 0);
      p.spin.scale.y = (mode === 'ship' || mode === 'ufo') && state?.gravity === -1 ? -1 : 1;
      p.head.visible = mode === 'cube' || mode === 'ship' || mode === 'ufo'; p.head.scale.setScalar(mode === 'cube' ? 1 : 0.6);
      p.head.position.y = mode === 'ship' ? 0.05 : mode === 'ufo' ? -0.05 : 0;
      p.ship.visible = mode === 'ship'; p.ball.visible = mode === 'ball'; p.ufo.visible = mode === 'ufo';
      // In the menu the course drifts past with nobody on it.
      p.root.visible = !dead && !menu;
      if (dead) {
        deadAt ??= t;
        const age = t - deadAt; world.burst.count = 30;
        for (let i = 0; i < 30; i++) {
          const a = rand(i) * Math.PI * 2, b = rand(i + 40) * Math.PI - Math.PI / 2, speed = 3 + rand(i + 70) * 5;
          temp.position.set(playerAt.x + Math.cos(a) * Math.cos(b) * speed * age, playerAt.y + Math.sin(b) * speed * age + 2 * age - 6 * age * age, playerAt.z + Math.sin(a) * Math.cos(b) * speed * age);
          temp.rotation.set(age * 5 + i, age * 3, 0); temp.scale.setScalar(Math.max(0, 0.22 * (1 - age))); temp.updateMatrix(); world.burst.setMatrixAt(i, temp.matrix);
        }
        world.burst.instanceMatrix.needsUpdate = true;
      } else { deadAt = null; world.burst.count = 0; }

      // Moving things near the player: shown, turned and pulsing; collected coins gone, spent orbs dimmed.
      const used = state?.used ?? [];
      if (used !== world.used) world.usedSet = new Set(used), world.used = used;
      for (const m of world.moving) {
        const near = (m.s > s - BEHIND && m.s < s + AHEAD) || (menu && preview && m.s > PREVIEW_S - BEHIND && m.s < PREVIEW_S + AHEAD);
        m.mesh.visible = near && !(m.kind === 'coin' && world.usedSet.has(m.o.sourceIndex));
        if (!m.mesh.visible) continue;
        if (m.kind === 'saw') m.mesh.children[0].rotation.z = -t * 6;
        else if (m.kind === 'coin') m.mesh.rotation.y = -track.at(m.s).heading + t * 3;
        else if (m.kind === 'orb') { const spent = world.usedSet.has(m.o.sourceIndex); m.mesh.scale.setScalar(spent ? 0.8 : 1 + Math.sin(t * 6) * 0.06); m.mesh.children[0].material.opacity = spent ? 0.25 : 0.75; }
      }

      // The flight corridor: a roof at the ceiling and the raised floor, for the stretch around the player.
      const c = world.corridor; c.count = 0;
      if (flight) {
        let k = 0;
        const roofY = state.ceiling, floorY = state.floor;
        for (let b = Math.floor(s) - 12; b < Math.floor(s) + 120 && k < c.instanceMatrix.count - 2 * TRACK_WIDTH; b++) for (let w = 0; w < TRACK_WIDTH; w++) {
          placeBox(c, k++, (b + 0.5) * UNIT, roofY + UNIT / 2, 1.01, 1, 1.01, w - HALF + 0.5);
          if (floorY > 0) placeBox(c, k++, (b + 0.5) * UNIT, floorY - UNIT / 2, 1.01, 1, 1.01, w - HALF + 0.5);
        }
        c.count = k; c.instanceMatrix.needsUpdate = true;
      }
      // The practice checkpoint, where it was set.
      world.checkpoint.visible = state?.checkpoint !== null && state?.checkpoint !== undefined;
      if (world.checkpoint.visible) { const cp = track.place(state.checkpoint, 0, -HALF + 0.3); world.checkpoint.position.set(cp.x, 0, cp.z); world.checkpoint.rotation.y = -cp.heading; }

      // The chosen angle, seen first in the preview; then the main view's chase camera at the same angle (in the menu,
      // drifting along the course with nobody on it).
      if (menu && preview) { renderPreview(t); p.root.visible = false; }
      aim(camera, chaseCamera(track, s, cameraBase, angle, !menu && state.mirrored));
      const lit = menu ? track.at(s + 8) : playerAt, ly = menu ? cameraBase : playerAt.y;
      sun.position.set(lit.x + 8, ly + 18, lit.z + 5); sun.target.position.set(lit.x, ly, lit.z);
      const front = track.at(s + 14); rim.position.set(front.x, ly + 6, front.z); rim.target.position.set(lit.x, ly, lit.z);
      carried.position.set(playerAt.x + Math.cos(playerAt.heading) * 1.5, playerAt.y + 1.6, playerAt.z + Math.sin(playerAt.heading) * 1.5); carried.visible = !menu && !dead && !software;
      judgeFrameRate();
      // Without the glow there is nothing for the extra render target to do: straight to the screen.
      if (bloom.enabled) composer.render(); else renderer.render(scene, camera);
    },
    /** The chase camera's angle ({azimuth, elevation, distance}), kept within its limits; null for the default. */
    setCameraAngle(next) { angle = clampCamera(next); },
    get cameraAngle() { return { ...angle }; },
    /** The level page's angle preview: a 2D canvas to draw it into while the menu shows, or null. */
    setPreview(canvas) { preview = canvas ?? null; },
    /** Whether the glow is on: off where it cost the frame rate. For the tests. */
    get glow() { return bloom.enabled; },
    dispose() {
      resize?.disconnect(); clearWorld();
      for (const g of disposables) g.dispose();
      composer.dispose?.(); renderer.dispose(); renderer.forceContextLoss?.();
    },
  };
}
