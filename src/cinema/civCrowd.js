// 1500 Players · crowds. Hundreds of players in one draw call per body part (InstancedMesh), each dressed as
// someone from the three shows: orange gis with spiky black hair, Saiyan armour, Frieza-force white and purple,
// blue Pocoyo hoodies, pink Gabby fans, pandas, cats, Majin pink. Close-ups use the full characters instead.
import * as T from 'three';
import { rand } from './claudeStage.js';
import { mergeGeometries as mergeGeo } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const COSTUMES = {
  gi: { skin: 0xf5c9a3, hair: 0x141414, body: 0xf2711c, legs: 0xf2711c, arms: 0xf5c9a3, spiky: true, w: 3 },
  saiyan: { skin: 0xf5c9a3, hair: 0x141414, body: 0xf4f2ea, legs: 0x22336f, arms: 0x22336f, spiky: true, w: 2 },
  purpleGi: { skin: 0xf5c9a3, hair: 0x141414, body: 0x4a2f7a, legs: 0x4a2f7a, arms: 0x4a2f7a, spiky: true, w: 1 },
  ssj: { skin: 0xf5c9a3, hair: 0xffd83b, body: 0xf2711c, legs: 0xf2711c, arms: 0xf5c9a3, spiky: true, w: .4 },
  frieza: { skin: 0xf6f3f6, hair: 0x7b3fa0, body: 0xf6f3f6, legs: 0xf6f3f6, arms: 0xf6f3f6, dome: true, w: .6 },
  soldier: { skin: 0x7cc0a8, hair: 0x2b5b4a, body: 0xece7da, legs: 0x2c2f54, arms: 0x2c2f54, w: 1.2 },
  buu: { skin: 0xf5a6c3, hair: 0xf5a6c3, body: 0x242130, legs: 0xf3f1f6, arms: 0xf5a6c3, fat: true, w: .5 },
  bulma: { skin: 0xf8d5b8, hair: 0x36c4c3, body: 0xe65c8a, legs: 0xf8d5b8, arms: 0xf8d5b8, w: .6 },
  pocoyo: { skin: 0xf9d9bf, hair: 0x3d8fe0, body: 0x3d8fe0, legs: 0x3d8fe0, arms: 0x3d8fe0, kid: true, bigHead: true, w: 2.2 },
  elly: { skin: 0xf39cc4, hair: 0xf39cc4, body: 0xf39cc4, legs: 0xf39cc4, arms: 0xf39cc4, kid: true, bigHead: true, w: .8 },
  pato: { skin: 0xffd83a, hair: 0x2f9a4c, body: 0xffd83a, legs: 0xf08a1f, arms: 0xffd83a, kid: true, bigHead: true, w: .8 },
  nina: { skin: 0xf7d0b0, hair: 0xa5d63c, body: 0xa5d63c, legs: 0xa5d63c, arms: 0xa5d63c, ears: 0x86b82a, kid: true, bigHead: true, w: .8 },
  gabby: { skin: 0xd9a57d, hair: 0x4b2a1a, body: 0xef6ab0, legs: 0x7a4ac9, arms: 0xef6ab0, ears: 0xf19ac7, w: 2 },
  panda: { skin: 0xf6f4f0, hair: 0x1b1b1d, body: 0xf2f0ec, legs: 0x1b1b1d, arms: 0x1b1b1d, ears: 0x1b1b1d, kid: true, w: .9 },
  cat: { skin: 0x8e97a8, hair: 0x8e97a8, body: 0x6e4bb5, legs: 0x8e97a8, arms: 0x8e97a8, ears: 0x8e97a8, kid: true, w: .9 },
  cakey: { skin: 0xf6c39a, hair: 0xf2a3c4, body: 0x6cc7d8, legs: 0xe9b98a, arms: 0xe9b98a, ears: 0xf2a3c4, kid: true, w: .6 },
  leather: { skin: 0xf5c9a3, hair: 0x3b2a1a, body: 0x8a5a36, legs: 0x6e4529, arms: 0x8a5a36, w: 0 },
};
/** The crowd's face (the head's −z side): eyes and a smile on white, tinted by each player's skin colour. */
let faceMats;
function headMaterials(emissive) {
  if (!faceMats?.[emissive]) {
    const c = document.createElement('canvas'); c.width = c.height = 16; const p = c.getContext('2d');
    p.fillStyle = '#ffffff'; p.fillRect(0, 0, 16, 16); p.fillStyle = '#1b1b1d'; p.fillRect(4, 7, 2, 3); p.fillRect(10, 7, 2, 3);
    p.fillStyle = '#5a2626'; p.fillRect(6, 12, 4, 1); p.fillRect(5, 11, 1, 1); p.fillRect(10, 11, 1, 1);
    const tex = new T.CanvasTexture(c); Object.assign(tex, { magFilter: T.NearestFilter, minFilter: T.NearestMipmapLinearFilter, colorSpace: T.SRGBColorSpace });
    const plain = new T.MeshLambertMaterial({ color: 0xffffff, emissive }), face = new T.MeshLambertMaterial({ color: 0xffffff, emissive, map: tex });
    (faceMats ??= {})[emissive] = [plain, plain, plain, plain, plain, face];
  }
  return faceMats[emissive];
}
const pickCostume = (r, allowed) => { const list = allowed.map(k => [k, COSTUMES[k]]), total = list.reduce((a, [, c]) => a + c.w, 0); let x = r * total; for (const [k, c] of list) { x -= c.w; if (x <= 0) return k; } return list[0][0]; };

/**
 * people: [{ x, y, z, yaw, costume?, walk?, armUp? }]. Returns a Group of instanced meshes.
 * opts.mix: costume keys to draw from when a person has none.
 */
export function crowd(people, { mix = Object.keys(COSTUMES).filter(k => COSTUMES[k].w), seed = 1, emissive = 0 } = {}) {
  const n = people.length, group = new T.Group();
  const parts = {
    legs: [.44, .72, .24], body: [.5, .7, .26], arms: [.2, .66, .2], head: [.5, .5, .5], hair: [.54, .14, .54], spike: null, ears: [.12, .14, .06],
  };
  const make = (geo, count = n, mat = new T.MeshLambertMaterial({ color: 0xffffff, emissive })) => { const m = new T.InstancedMesh(geo, mat, count); m.castShadow = m.receiveShadow = true; m.instanceMatrix.setUsage(T.StaticDrawUsage); group.add(m); return m; };
  const box = s => new T.BoxGeometry(...s);
  const legs = make(box(parts.legs)), body = make(box(parts.body)), armL = make(box(parts.arms)), armR = make(box(parts.arms)), head = make(box(parts.head), n, headMaterials(emissive)), hair = make(box(parts.hair));
  // spiky hair: three small blades merged into one shape
  const spikeGeo = new T.BufferGeometry(); { const parts = [[-.16, .12, -.5], [0, .0, 0], [.16, .12, .5]].map(([x, z, r]) => { const c = new T.ConeGeometry(.17, .34, 4); c.rotateY(Math.PI / 4); c.rotateZ(r); c.translate(x, 0, z); return c; }); spikeGeo.copy(mergeGeo(parts)); } const spikes = make(spikeGeo);
  const ears = make(box(parts.ears), n * 2);
  const M = new T.Matrix4(), Q = new T.Quaternion(), P = new T.Vector3(), S = new T.Vector3(), E = new T.Euler(), C = new T.Color();
  const put = (mesh, i, p, euler, s, color) => { Q.setFromEuler(euler); M.compose(p, Q, s); mesh.setMatrixAt(i, M); mesh.setColorAt(i, C.setHex(color)); };
  people.forEach((q, i) => {
    const r = rand(i, seed, 3), key = q.costume ?? pickCostume(r, mix), c = COSTUMES[key];
    const k = (c.kid ? .66 : 1) * (q.scale ?? (.94 + rand(i, seed, 4) * .1)), yaw = q.yaw ?? 0, swing = q.walk !== undefined ? Math.sin(q.walk) * .5 : 0;
    const local = (x, y, z) => P.set(x, y, z).multiplyScalar(k).applyAxisAngle(new T.Vector3(0, 1, 0), yaw).add(new T.Vector3(q.x, q.y, q.z));
    const fat = c.fat ? 1.5 : 1, hk = c.bigHead ? 1.45 : 1;
    put(legs, i, local(0, .36, 0), E.set(0, yaw, 0), S.set(k * fat, k, k * fat), c.legs);
    put(body, i, local(0, 1.07, 0), E.set(0, yaw, 0), S.set(k * fat, k, k * fat), c.body);
    // a raised arm is +2.8 rad: a positive x-rotation swings a hanging arm toward −z, the way players face (see checkRig)
    put(armL, i, local(-.36 * fat, 1.07, 0), E.set(q.armUp ? 2.8 : swing, yaw, 0, 'YXZ'), S.set(k, k, k), c.arms);
    put(armR, i, local(.36 * fat, 1.07, 0), E.set(q.armUp === 2 ? 2.8 : -swing, yaw, 0, 'YXZ'), S.set(k, k, k), c.arms);
    put(head, i, local(0, 1.42 + .25 * hk, 0), E.set(0, yaw, 0), S.set(k * hk, k * hk, k * hk), c.skin);
    // centred on the head, so the cap's faces sit 2 cm outside the head's (sharing a plane, they would z-fight and shimmer)
    put(hair, i, local(0, 1.42 + .5 * hk + .02, 0), E.set(0, yaw, 0), S.set(k * hk, k * (c.dome ? 2 : 1), k * hk), c.hair);
    if (c.spiky) put(spikes, i, local(0, 1.42 + .5 * hk + .2, .04), E.set(0, yaw, 0), S.set(k * 1.4, k * (key === 'ssj' ? 1.7 : 1.15), k * 1.4), c.hair); else put(spikes, i, local(0, -50, 0), E.set(0, 0, 0), S.set(.001, .001, .001), 0);
    for (const s of [-1, 1]) { const j = i * 2 + (s + 1) / 2; if (c.ears) put(ears, j, local(s * .17 * hk, 1.42 + .5 * hk + .1, 0), E.set(0, yaw, -s * .25), S.set(k * hk, k * hk, k * hk), c.ears); else put(ears, j, local(0, -50, 0), E.set(0, 0, 0), S.set(.001, .001, .001), 0); }
  });
  for (const m of group.children) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  return group;
}

/** Scatter n people in a disc or ring around a centre on terrain (groundAt), facing a point. */
export function gather(n, { center = [0, 0], radius = 10, inner = 0, groundAt = () => 0, face, seed = 1, costume, mix } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rand(i, seed, 1) * Math.PI * 2, r = Math.sqrt(inner * inner + rand(i, seed, 2) * (radius * radius - inner * inner));
    const x = center[0] + Math.cos(a) * r, z = center[1] + Math.sin(a) * r, f = face ?? center;
    out.push({ x, y: groundAt(x, z), z, yaw: Math.atan2(-(f[0] - x), -(f[1] - z)) + (rand(i, seed, 5) - .5) * .5, costume });
  }
  return out;
}
