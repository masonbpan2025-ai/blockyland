// 1500 Players · key frames for review. Each key frame builds its own scene, renders it through a light
// "shader pack" grade (bloom, warm tone), then paints the documentary overlays (name tags, captions, day cards,
// map icons) on a 2D canvas. window.kf.render(id) returns a PNG for the review sheet.
import * as T from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CAST, makeCharacter, posePlayer } from './civCast.js';
// ?set=weddings shows the Three Weddings key frames; the default is 1500 Players
const SETS = { civ: () => import('./civFrames.js'), weddings: () => import('./weddingFrames.js') };
const { FRAMES } = await SETS[new URLSearchParams(location.search).get('set') ?? 'civ']();

const W = 1280, H = 720;
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.setPixelRatio(1); renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const out = document.createElement('canvas'); out.width = W; out.height = H; document.getElementById('stage').append(out);
const ctx = out.getContext('2d');

/** Project a world point to overlay pixels (null when behind the camera). */
export function project(camera, p) { const v = new T.Vector3(...p).project(camera); return v.z > 1 ? null : [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; }

async function render(id) {
  const frame = FRAMES[id]; if (!frame) throw new Error('no key frame ' + id);
  const built = await frame.build({ T, renderer, makeCharacter, posePlayer, CAST });
  const { scene, camera } = built; camera.aspect = W / H; camera.updateProjectionMatrix();
  const composer = new EffectComposer(renderer); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = built.bloom ?? [.35, .6, .82]; if (bloom) composer.addPass(new UnrealBloomPass(new T.Vector2(W, H), ...bloom));
  composer.addPass(new OutputPass());
  composer.render();
  ctx.save(); ctx.filter = built.grade ?? 'saturate(1.12) contrast(1.04)'; ctx.drawImage(renderer.domElement, 0, 0); ctx.restore();
  built.overlay?.(ctx, { W, H, project: p => project(camera, p) });
  composer.dispose(); scene.traverse(o => { o.geometry?.dispose?.(); });
  return out.toDataURL('image/png').split(',')[1];
}
/** Debug: what is under screen pixel (px, py) in a key frame? */
async function pick(id, px, py) {
  const b = await FRAMES[id].build({ T, renderer, makeCharacter, posePlayer, CAST }); b.scene.updateMatrixWorld(true);
  const ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2(px / 640 - 1, 1 - py / 360), b.camera);
  return ray.intersectObjects(b.scene.children, true).slice(0, 4).map(h => { let o = h.object, path = []; while (o) { path.push(o.type + (o.isInstancedMesh ? '#' + h.instanceId : '') + (o.name ? ':' + o.name : '')); o = o.parent; } return { d: +h.distance.toFixed(2), path: path.slice(0, 6).join(' < '), p: h.point.toArray().map(v => +v.toFixed(2)) }; });
}
window.kf = { pick, ids: Object.keys(FRAMES), titles: Object.fromEntries(Object.entries(FRAMES).map(([k, f]) => [k, f.title])), times: Object.fromEntries(Object.entries(FRAMES).map(([k, f]) => [k, f.time ?? ''])), render, ready: true };
