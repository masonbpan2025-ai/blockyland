// Math models for 一层又一层 · Layer by Layer: solids built from unit blocks, layer by layer.
// Every model is a list of cells [x, y, z] (integer corners, one block each) that is drawn with one
// InstancedMesh per colour, so a 16³ cube or an R = 12 sphere stays cheap to render every frame.
// Blocks have a soft dark outline so young viewers can count them.
import * as T from 'three';

// ------------------------------------------------------------------ cells
/** A 2D staircase, one block deep, standing in the x–y plane: row y (0 = bottom) has N − y blocks, so N wide and N high. */
export function staircase(N) { const cells = []; for (let y = 0; y < N; y++) for (let x = 0; x < N - y; x++) cells.push([x, y, 0]); return cells; }
/** The staircase's twin, turned round so the two fill an (N + 1) × N rectangle: row y has y + 1 blocks on the right. */
export function staircaseTwin(N) { const cells = []; for (let y = 0; y < N; y++) for (let x = N - y; x <= N; x++) cells.push([x, y, 0]); return cells; }
/** Stepped pyramid: layers 2k × 2k for k = N (bottom) … 1 (top), centred on x = z = 0, bottom at y = 0. */
export function stepPyramid(N) {
  const cells = [];
  for (let layer = 0; layer < N; layer++) { const k = N - layer; for (let x = -k; x < k; x++) for (let z = -k; z < k; z++) cells.push([x, layer, z, k]); }
  return cells;
}
/**
 * The 2N cube cut into six pyramids, one per face, apex at the centre. A cell belongs to the face(s) whose axis it is
 * furthest along; cells tied between axes (the diagonal seams) belong to two or three pyramids, so 6·Σ(2k)² > (2N)³.
 * Returns { pyramids: [{ face, normal, cells:[[x,y,z,shared]] }] } with the cube spanning −N…N on every axis.
 */
export function cubePyramids(N) {
  const faces = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]], pyramids = faces.map(normal => ({ normal, cells: [] }));
  for (let x = -N; x < N; x++) for (let y = -N; y < N; y++) for (let z = -N; z < N; z++) {
    const c = [x + .5, y + .5, z + .5], m = Math.max(...c.map(Math.abs)), owners = [];
    faces.forEach((n, i) => { const axis = n.findIndex(Boolean); if (Math.abs(c[axis]) === m && Math.sign(c[axis]) === n[axis]) owners.push(i); });
    for (const i of owners) pyramids[i].cells.push([x, y, z, owners.length > 1]);
  }
  return pyramids;
}
/** A filled disc of radius r (cell centres inside), on layer y. */
export function disc(r, y = 0, hole = 0) {
  const cells = [], n = Math.ceil(r);
  for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) { const d2 = (x + .5) ** 2 + (z + .5) ** 2; if (d2 <= r * r && d2 >= hole * hole) cells.push([x, y, z]); }
  return cells;
}
/** Hemisphere of radius R from discs: layer k (0 = bottom) has radius √(R² − k²). */
export const hemisphere = R => Array.from({ length: R }, (_, k) => disc(Math.sqrt(R * R - (k + .5) ** 2), k)).flat();
/** Archimedes' cylinder: radius R, height R, with a cone hollowed out (hole radius k at height k). */
export const cylinderMinusCone = R => Array.from({ length: R }, (_, k) => disc(R, k, k + .5)).flat();
export const cone = (R, H) => Array.from({ length: H }, (_, k) => disc(R * (H - k - .5) / H, k)).flat();
/** Any pyramid or cone: the base outline `inside(u, v)` (u, v in −1…1) shrinks linearly to the apex. */
export function layeredSolid(inside, size, H) {
  const cells = [];
  for (let k = 0; k < H; k++) { const s = (H - k - .5) / H, n = Math.ceil(size / 2);
    for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) { const u = (x + .5) / (size / 2) / s, w = (z + .5) / (size / 2) / s; if (s > 0 && inside(u, w)) cells.push([x, k, z]); } }
  return cells;
}
export const SHAPES = {
  square: (u, v) => Math.abs(u) <= 1 && Math.abs(v) <= 1,
  circle: (u, v) => u * u + v * v <= 1,
  triangle: (u, v) => v >= -1 && v <= 1 && Math.abs(u) <= (1 - v) / 2 * 1.15, // tetrahedron base
  heart: (u, v) => { const x = u * 1.15, y = -v * 1.15 + .25; return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0; },
};

// ------------------------------------------------------------------ drawing
let blockTexture;
function outlineTexture() {
  if (blockTexture) return blockTexture;
  const c = document.createElement('canvas'); c.width = c.height = 32; const p = c.getContext('2d');
  p.fillStyle = '#ffffff'; p.fillRect(0, 0, 32, 32);
  // a little texture noise so large faces do not look like flat plastic
  for (let i = 0; i < 90; i++) { const g = 236 + ((i * 37) % 19); p.fillStyle = `rgb(${g},${g},${g})`; p.fillRect((i * 13) % 30 + 1, (i * 7 + i * i) % 30 + 1, 2, 2); }
  p.strokeStyle = 'rgba(40,40,40,.55)'; p.lineWidth = 2; p.strokeRect(1, 1, 30, 30);
  p.strokeStyle = 'rgba(255,255,255,.6)'; p.lineWidth = 1; p.strokeRect(3.5, 3.5, 25, 25);
  blockTexture = new T.CanvasTexture(c); blockTexture.magFilter = T.NearestFilter; blockTexture.minFilter = T.LinearMipmapLinearFilter; blockTexture.colorSpace = T.SRGBColorSpace; blockTexture.anisotropy = 8;
  return blockTexture;
}
export const COLORS = { red: 0xe0574f, orange: 0xf0973e, yellow: 0xf3cf45, green: 0x67bf5c, blue: 0x4d8fe0, purple: 0x9b6ad6, pink: 0xf08fb4, teal: 0x45bcb4, white: 0xf2efe6, gold: 0xffd75e, glass: 0xbfe6f2, water: 0x3f8fd6 };
export const SIX = [COLORS.red, COLORS.orange, COLORS.green, COLORS.blue, COLORS.purple, COLORS.pink];

/**
 * A block model: cells → instanced cubes in a group. opts: { size (block edge), color, colorOf(cell, i), gap, glow, opacity }
 * Returns the group; group.userData.count is the block count. `reveal(n)` shows only the first n blocks (for building up).
 */
export function blocks(cells, { size = 1, color = COLORS.white, colorOf, gap = .04, glow = 0, opacity = 1 } = {}) {
  const group = new T.Group();
  const mat = new T.MeshLambertMaterial({ map: outlineTexture(), emissive: new T.Color(color), emissiveIntensity: glow, transparent: opacity < 1, opacity, depthWrite: opacity >= 1 });
  const geo = new T.BoxGeometry(size - gap * size, size - gap * size, size - gap * size);
  const mesh = new T.InstancedMesh(geo, mat, Math.max(1, cells.length)); mesh.castShadow = opacity >= 1; mesh.receiveShadow = true;
  const m = new T.Matrix4(), col = new T.Color();
  cells.forEach((c, i) => { m.makeTranslation((c[0] + .5) * size, (c[1] + .5) * size, (c[2] + .5) * size); mesh.setMatrixAt(i, m); mesh.setColorAt(i, col.setHex(colorOf ? colorOf(c, i) : color)); });
  mesh.count = cells.length; group.add(mesh);
  group.userData = { count: cells.length, mesh, cells };
  group.reveal = n => { mesh.count = Math.max(0, Math.min(cells.length, Math.floor(n))); };
  // build(n): the first n blocks are in place; the newest `window` are still dropping in from `drop` blocks above.
  // A pure function of n (the matrices it may have moved last time are recomputed), so seeking works.
  let last = cells.length;
  group.build = (n, { window = 6, drop = 2.2 } = {}) => {
    n = Math.max(0, Math.min(cells.length + window, n));
    const W = Math.ceil(window), lo = Math.max(0, Math.floor(Math.min(n, last)) - W - 1), hi = Math.min(cells.length, Math.ceil(Math.max(n, last)) + W + 1);
    for (let i = lo; i < hi; i++) {
      const p = Math.min(1, Math.max(0, (n - i) / window)), e = 1 - (1 - p) ** 3, c = cells[i];
      m.makeTranslation((c[0] + .5) * size, (c[1] + .5) * size + (1 - e) * drop * size, (c[2] + .5) * size); mesh.setMatrixAt(i, m);
    }
    mesh.count = Math.min(cells.length, Math.ceil(n)); mesh.instanceMatrix.needsUpdate = true; last = n;
  };
  /** How many blocks sit below layer L (fractional L reveals part of the next layer); cells must be ordered by layer. */
  group.upToLayer = L => { const f = Math.floor(L); let below = 0, at = 0; for (const c of cells) { if (c[1] < f) below++; else if (c[1] === f) at++; } return below + at * (L - f); };
  return group;
}

const FACES = [[[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]]], [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]], [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]]],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]]]];
/**
 * Only the outer faces of a set of cells, as one mesh: a clean shell for glass and water, where drawing every
 * block's inner faces would turn a transparent solid into a cluttered grid. `material` is any three.js material.
 */
export function surface(cells, material, { size = 1 } = {}) {
  const key = (x, y, z) => `${x},${y},${z}`, set = new Set(cells.map(c => key(c[0], c[1], c[2])));
  const pos = [], nrm = [], uv = [], idx = [];
  for (const [x, y, z] of cells) for (const [n, quad] of FACES) {
    if (set.has(key(x + n[0], y + n[1], z + n[2]))) continue;
    const base = pos.length / 3;
    quad.forEach(([a, b, c]) => { pos.push((x + a) * size, (y + b) * size, (z + c) * size); nrm.push(...n); });
    uv.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const mesh = new T.Mesh(g, material); mesh.receiveShadow = true; return mesh;
}
/** A blocky ball of radius R (centre at y = R), split into the glass skin and the water below `level` (blocks from the bottom). */
export function ballCells(R) { const cells = []; for (let x = -R; x < R; x++) for (let y = -R; y < R; y++) for (let z = -R; z < R; z++) if (Math.hypot(x + .5, y + .5, z + .5) <= R) cells.push([x, y + R, z]); return cells; }

/** The smooth limit of the staircase: a right triangle w wide and h high, `depth` thick, standing in the x–y plane. */
export function smoothTriangle(w, h, color, depth = 1) {
  const shape = new T.Shape(); shape.moveTo(0, 0); shape.lineTo(w, 0); shape.lineTo(0, h); shape.closePath();
  const m = new T.Mesh(new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false }), new T.MeshLambertMaterial({ color })); m.castShadow = m.receiveShadow = true; return m;
}
/**
 * The smooth limit of one of the cube's six pyramids: apex at the cube's centre (the origin), square base of side 2a
 * on the face with outward normal n. Drawn with crisp edges so the six pieces stay readable when they meet.
 */
export function smoothPyramid(a, n, color) {
  const axis = n.findIndex(Boolean), s = n[axis], u = (axis + 1) % 3, w = (axis + 2) % 3;
  const corner = (p, q) => { const v = [0, 0, 0]; v[axis] = s * a; v[u] = p * a; v[w] = q * a; return v; };
  const c = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], apex = [0, 0, 0];
  const tris = [[c[0], c[1], c[2]], [c[0], c[2], c[3]], [apex, c[1], c[0]], [apex, c[2], c[1]], [apex, c[3], c[2]], [apex, c[0], c[3]]];
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(tris.flat(2), 3)); g.computeVertexNormals();
  // make every face point outward whichever way the corners were listed
  const pos = g.attributes.position, centre = new T.Vector3(...n).multiplyScalar(a * .6), A = new T.Vector3(), B = new T.Vector3(), C = new T.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    A.fromBufferAttribute(pos, i); B.fromBufferAttribute(pos, i + 1); C.fromBufferAttribute(pos, i + 2);
    const normal = B.clone().sub(A).cross(C.clone().sub(A)), mid = A.clone().add(B).add(C).divideScalar(3);
    if (normal.dot(mid.sub(centre)) < 0) { pos.setXYZ(i + 1, C.x, C.y, C.z); pos.setXYZ(i + 2, B.x, B.y, B.z); }
  }
  g.computeVertexNormals();
  const group = new T.Group(), mesh = new T.Mesh(g, new T.MeshLambertMaterial({ color, flatShading: true })); mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh, new T.LineSegments(new T.EdgesGeometry(g), new T.LineBasicMaterial({ color: 0x1d2420 })));
  return group;
}

/** A thin rod between two points (for radii, heights and the right triangle). */
export function rod(a, b, color = 0xffffff, width = .08) {
  const A = new T.Vector3(...a), B = new T.Vector3(...b), len = A.distanceTo(B);
  const m = new T.Mesh(new T.BoxGeometry(width, len, width), new T.MeshBasicMaterial({ color, fog: false }));
  m.position.copy(A).lerp(B, .5); m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), B.clone().sub(A).normalize()); return m;
}
/** A translucent outline box (the cube the six pyramids will fill). */
export function wireBox(w, h, d, color = 0xffffff) {
  const g = new T.LineSegments(new T.EdgesGeometry(new T.BoxGeometry(w, h, d)), new T.LineBasicMaterial({ color, transparent: true, opacity: .9, fog: false }));
  return g;
}
