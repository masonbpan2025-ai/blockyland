// Shared director for Blockyland films: voice-clip validation and lip-sync, acting helpers,
// camera grammar, the compositor (dissolves, grade, letterbox, title, subtitles, end card)
// and the playback/export API used by scripts/render-film.mjs.
// Everything is a pure function of the film clock t, so preview, scrubbing and the
// fixed-24fps export show the same frame for the same t.
import * as T from 'three';
import { FRAME } from './claudeStage.js';
import { pose, blocking, expressionTrack, blink, clamp, ease, lerp, facing, wrap } from './claudeActors.js';

export const v = (x, y, z) => new T.Vector3(x, y, z);
export const S = Math.PI, N = 0, E = -Math.PI / 2, Wd = Math.PI / 2; // actor yaw facing south (+z), north, east (+x), west
/** Blocking from compact keys [t, x, z, yaw?]. */
export const at = (keys, opts) => blocking(keys.map(k => ({ t: k[0], at: [k[1], k[2]], ...(k[3] !== undefined ? { yaw: k[3] } : {}) })), opts);
export const arc = (p0, p1, k, h = .25) => p0.clone().lerp(p1, k).add(new T.Vector3(0, Math.sin(k * Math.PI) * h, 0));

/**
 * story: { id, title, englishTitle, tagline, duration, lines, moral, brand?, label?, storybook? }
 * stage: { scene, camera, renderer, groundAt }
 * audioDir: folder under public/ holding audio/<line>.wav and audio/manifest.json
 */
export async function createDirector({ story, stage, cast, audioDir, voiceScript }) {
  const BASE = import.meta.env?.BASE_URL ?? '/';
  const { scene, camera, renderer, groundAt } = stage;
  const manifest = await (await fetch(`${BASE}${audioDir}/audio/manifest.json`)).json();
  for (const [i, line] of story.lines.entries()) {
    const clip = manifest[line.id]; if (!clip) throw new Error(`Voice clip ${line.id} is missing; run ${voiceScript}`);
    Object.assign(line, { duration: clip.duration, envelope: clip.envelope });
    const next = story.lines[i + 1];
    if (next && line.start + clip.duration > next.start - .12) throw new Error(`Line ${line.id} (${clip.duration}s) runs into ${next.id}`);
  }
  const speaking = (who, t) => { for (const l of story.lines) if (l.face === who && t >= l.start && t < l.start + l.duration) return l.envelope[Math.floor((t - l.start) * 48)] ?? 0; return 0; };
  for (const a of cast) scene.add(a);
  const seeds = new Map(cast.map((a, i) => [a, 1.3 + i * 2.17]));

  // ---------------------------------------------------------------- acting helpers
  const G = (x, z) => groundAt(x, z);
  function smoothGround(x, z) { // bilinear across block centres: hooves and paws glide up slopes
    const gx = x - .5, gz = z - .5, x0 = Math.floor(gx), z0 = Math.floor(gz), fx = gx - x0, fz = gz - z0, h = (a, b) => groundAt(a + .5, b + .5);
    return lerp(lerp(h(x0, z0), h(x0 + 1, z0), fx), lerp(h(x0, z0 + 1), h(x0 + 1, z0 + 1), fx), fz);
  }
  function walkY(w) { const dx = -Math.sin(w.yaw) * .18, dz = -Math.cos(w.yaw) * .18; return (G(w.x - dx, w.z - dz) + G(w.x, w.z) * 2 + G(w.x + dx, w.z + dz)) / 4; }
  const headPos = (a, out = new T.Vector3()) => { a.head.getWorldPosition(out); return out.add(new T.Vector3(0, .25 * a.scale.x, 0)); };
  const looks = [];
  /** Pose an actor at a walker sample w (from `at`/`blocking`); q adds pose overrides, `look`, `lookAmt`, and `stride` as a gait multiplier. */
  function act(a, w, t, q = {}) {
    a.visible = true;
    const { stride: gait = 1, ...rest } = q;
    pose(a, { x: w.x, z: w.z, yaw: w.yaw, phase: w.phase, y: q.y ?? walkY(w), breathe: t + seeds.get(a), ...rest, stride: gait * w.stride });
    if (q.look) looks.push([a, q.look, q.lookAmt ?? 1]);
  }
  const still = (a, x, z, yaw, t, q = {}) => act(a, { x, z, yaw, phase: 0, stride: 0 }, t, q);
  function applyLooks() { // heads turn after every body is placed, so mutual looks are frame-exact
    for (const a of cast) if (a.visible) a.updateMatrixWorld(true);
    for (const [a, target, amt] of looks) {
      const p = !target.isObject3D ? target : target.face ? headPos(target) : target.getWorldPosition(new T.Vector3()).add(v(0, target.isMesh ? 0 : 1.5, 0)), h = headPos(a);
      const yawW = facing(p.x - h.x, p.z - h.z), rel = clamp(wrap(yawW - a.rotation.y), -1.2, 1.2) * amt;
      a.head.rotation.y += rel; a.head.rotation.x += clamp(Math.atan2(p.y - h.y, Math.hypot(p.x - h.x, p.z - h.z)), -.32, .45) * amt;
    }
    looks.length = 0;
  }
  const tracks = {};
  /** Expression keys for one actor: [[t, 'expression'], ...], blended over 0.35 s. */
  const expressions = (name, keys) => { tracks[name] = expressionTrack(keys); };
  function face(a, t) {
    if (!a.visible) return;
    const e = { ...(tracks[a.name] ?? (() => expressionTrack([[0, 'calm']])(0)))(t) }, talk = speaking(a.name, t), seed = seeds.get(a);
    e.eyeOpen *= 1 - blink(t, seed);
    if (talk > 0) { e.mouthOpen = Math.max(e.mouthOpen, talk * .95); e.browY -= talk * .35; e.smile *= 1 - talk * .4; a.head.rotation.x += (talk - .35) * .07 * Math.sin(t * 9 + seed); }
    a.face.set(e);
  }
  const hold = (a, fwd = .45, up = 1.0, side = 0) => { a.updateMatrixWorld(true); return a.localToWorld(new T.Vector3(side, up, -fwd)); };

  // ---------------------------------------------------------------- cameras: (t, k) => { pos, look, fov }, k = eased shot progress
  const tmpA = new T.Vector3(), tmpB = new T.Vector3();
  const cams = {
    fixed: (pos, look, fov) => () => ({ pos: v(...pos), look: v(...look), fov }),
    move: (p0, p1, l0, l1, f0, f1 = f0) => (t, k) => ({ pos: v(...p0).lerp(v(...p1), k), look: v(...l0).lerp(v(...l1), k), fov: lerp(f0, f1, k) }),
    /** Over the listener's shoulder onto the speaker's face. */
    ots: (speaker, listener, { back = .95, side = .32, up = .1, fov = 32, fov1 } = {}) => (t, k) => {
      const s = headPos(speaker, tmpA).clone(), l = headPos(listener, tmpB).clone(), d = l.clone().sub(s); d.y = 0; d.normalize();
      const right = v(-d.z, 0, d.x);
      return { pos: l.clone().addScaledVector(d, back).addScaledVector(right, side).add(v(0, up, 0)), look: s.clone().add(v(0, -.03, 0)).addScaledVector(right, side * -.25), fov: fov1 ? lerp(fov, fov1, k) : fov };
    },
    /** A clean single on the speaker from just off the listener's eyeline. Use the opposite angle for the reverse shot (180° rule). */
    single: (speaker, listener, { dist = 1.5, angle = .5, up = .02, fov = 32, fov1, drop = .05 } = {}) => (t, k) => {
      const s = headPos(speaker, tmpA).clone(), l = headPos(listener, tmpB).clone(), d = l.clone().sub(s); d.y = 0; d.normalize();
      const c = Math.cos(angle), sn = Math.sin(angle), r = v(d.x * c - d.z * sn, 0, d.x * sn + d.z * c);
      return { pos: s.clone().addScaledVector(r, dist).add(v(0, up + (l.y - s.y) * .35, 0)), look: s.clone().add(v(0, -drop, 0)), fov: fov1 ? lerp(fov, fov1, k) : fov };
    },
    /** In front of an actor along its facing, with a sideways offset. */
    front: (a, { dist = 1.4, side = .3, up = .05, fov = 32, fov1 } = {}) => (t, k) => {
      const h = headPos(a, tmpA).clone(), f = v(-Math.sin(a.rotation.y), 0, -Math.cos(a.rotation.y)), r = v(-f.z, 0, f.x);
      return { pos: h.clone().addScaledVector(f, dist).addScaledVector(r, side).add(v(0, up, 0)), look: h, fov: fov1 ? lerp(fov, fov1, k) : fov };
    },
    follow: (p0, p1, target, offset = [0, 0, 0], fov = 40) => (t, k) => ({ pos: v(...p0).lerp(v(...p1), k), look: headPos(target, tmpA).clone().add(v(...offset)), fov }),
  };

  /**
   * shots: [{ at, scene, name, cam, dissolve? }]; directors: { [scene]: t => void }
   * reset(t): hide per-frame props; light(scene, t); grade(scene) → canvas filter; soundtrack() → Promise<{ buffer, report }>
   * overlay(ink, t, shot): optional 2D layer drawn over the picture, under the letterbox and subtitles (labels, diagrams)
   */
  async function mount({ shots, directors, reset = () => {}, light, grade = () => 'none', soundtrack, wavBase64, overlay }) {
    shots.forEach((s, i) => { s.end = shots[i + 1]?.at ?? story.duration; });
    const shotAt = t => shots.findLast(s => t >= s.at) ?? shots[0];
    function stageFrame(t, shot) {
      for (const a of cast) a.visible = false;
      reset(t, shot);
      light(shot.scene, t); directors[shot.scene](t); applyLooks();
      for (const a of cast) face(a, t);
      for (const a of cast) if (a.visible) a.updateMatrixWorld(true);
      const span = shot.end - shot.at, k = ease((t - shot.at) / span), c = shot.cam(t, clamp(k));
      // a breath of handheld drift so locked-off shots still feel alive
      c.pos.add(v(Math.sin(t * .63 + shot.at) * .012, Math.sin(t * .87) * .008, Math.cos(t * .51 + shot.at) * .012));
      camera.position.copy(c.pos); camera.lookAt(c.look); camera.fov = c.fov; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }

    // everything is laid out in 1280×720 units and scaled to the output frame, so an export is sharp, not stretched
    const canvas = document.createElement('canvas'); canvas.width = FRAME.width; canvas.height = FRAME.height;
    const ink = canvas.getContext('2d', { alpha: false });
    const prev = document.createElement('canvas'); prev.width = FRAME.width; prev.height = FRAME.height; const prevInk = prev.getContext('2d', { alpha: false });
    for (const c of [ink, prevInk]) { c.setTransform(FRAME.width / 1280, 0, 0, FRAME.height / 720, 0, 0); c.imageSmoothingQuality = 'high'; }
    document.querySelector('#stage').replaceChildren(canvas);
    await document.fonts.load('25px "Microsoft YaHei"'); await document.fonts.ready;
    function draw3d(target, t, shot) { stageFrame(t, shot); target.filter = grade(shot.scene); target.drawImage(renderer.domElement, 0, 0, 1280, 720); target.filter = 'none'; }
    function text(words, x, y, font, color = '#fbf3e1', align = 'center', blur = 10) {
      ink.font = font; ink.textAlign = align; ink.fillStyle = color; ink.shadowColor = 'rgba(5,8,6,.85)'; ink.shadowBlur = blur; ink.shadowOffsetY = 2; ink.fillText(words, x, y); ink.shadowBlur = 0; ink.shadowOffsetY = 0;
    }
    function spaced(words, x, y, font, color, spacing) { ink.font = font; const w = [...words].reduce((s, c) => s + ink.measureText(c).width + spacing, -spacing); let cx = x - w / 2; for (const c of words) { text(c, cx, y, font, color, 'left', 8); cx += ink.measureText(c).width + spacing; } }
    const format = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const BAR = 38, endCard = story.duration - 6.2, storybook = story.storybook;
    function renderFrame(t) {
      t = clamp(t, 0, story.duration);
      const shot = shotAt(t), next = shots[shots.indexOf(shot) + 1];
      // dissolves straddle the cut: half before, half after
      const incoming = next?.dissolve && t > next.at - next.dissolve / 2 ? next : null, outgoingD = shot.dissolve && t < shot.at + shot.dissolve / 2 ? shot : null;
      if (incoming || outgoingD) {
        const into = incoming ?? outgoingD, before = shots[shots.indexOf(into) - 1], mix = ease((t - (into.at - into.dissolve / 2)) / into.dissolve);
        draw3d(prevInk, t, before); draw3d(ink, t, into);
        ink.globalAlpha = 1 - mix; ink.drawImage(prev, 0, 0, 1280, 720); ink.globalAlpha = 1;
        const flash = Math.sin(mix * Math.PI) * (into.scene === storybook || before.scene === storybook ? .28 : .1); if (flash) { ink.fillStyle = `rgba(255,236,200,${flash})`; ink.fillRect(0, 0, 1280, 720); }
      } else draw3d(ink, t, shot);
      // vignette, stronger in the storybook
      const vg = ink.createRadialGradient(640, 380, 260, 640, 380, 820); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, shot.scene === storybook ? 'rgba(40,24,8,.55)' : 'rgba(0,0,0,.32)'); ink.fillStyle = vg; ink.fillRect(0, 0, 1280, 720);
      overlay?.(ink, t, shot);
      // letterbox
      ink.fillStyle = '#0b0f0c'; ink.fillRect(0, 0, 1280, BAR); ink.fillRect(0, 720 - BAR, 1280, BAR);
      ink.font = '11px Arial'; ink.textAlign = 'left'; ink.fillStyle = '#cfc6b0'; ink.fillText(story.brand ?? 'BLOCKYLAND PICTURES  ·  CLAUDE’S CUT', 30, 24); ink.textAlign = 'right'; ink.fillText(`${story.title}  ·  ${story.englishTitle}`, 1250, 24);
      for (const l of story.labels ?? []) if (t > l.from && t < l.to) { const a = Math.min(ease((t - l.from) / 1), 1 - ease((t - l.to + .8) / .8)); ink.globalAlpha = a; text(l.text, 40, 72, '600 14px "Microsoft YaHei", Georgia', '#f3dcae', 'left', 6); ink.globalAlpha = 1; }
      // title
      if (t < 5.6) {
        const a = ease((t - .5) / 1) * (1 - ease((t - 4.6) / .9)); ink.globalAlpha = a;
        ink.fillStyle = 'rgba(8,12,9,.28)'; ink.fillRect(0, 170, 1280, 210);
        text(story.title, 640, 270, '600 84px "Microsoft YaHei", serif', '#fff8ea', 'center', 18);
        spaced(story.englishTitle, 640, 322, '28px Georgia', '#f3d5a0', 9);
        text(story.tagline, 640, 356, 'italic 16px Georgia', '#efe6d2');
        ink.globalAlpha = 1;
      }
      // subtitles: Chinese above English; voice-over in italics
      const line = story.lines.find((l, i) => t >= l.start && t < Math.min(l.start + l.duration + .45, (story.lines[i + 1]?.start ?? 999) - .05));
      if (line && t < endCard) {
        const g = ink.createLinearGradient(0, 560, 0, 720 - BAR); g.addColorStop(0, 'rgba(6,10,7,0)'); g.addColorStop(1, 'rgba(6,10,7,.78)'); ink.fillStyle = g; ink.fillRect(0, 560, 1280, 720 - BAR - 560);
        const a = Math.min(1, (t - line.start) / .15); ink.globalAlpha = a;
        text(line.zh, 640, 627, '500 25px "Microsoft YaHei", sans-serif');
        text(line.en, 640, 660, `${line.face ? '' : 'italic '}20px Georgia`, line.face ? '#f6efdf' : '#eadfc3');
        ink.globalAlpha = 1;
      }
      // ending card
      if (t > endCard) {
        const a = ease((t - endCard) / 1.6); ink.fillStyle = `rgba(8,11,9,${a * .62})`; ink.fillRect(0, BAR, 1280, 720 - BAR * 2);
        ink.globalAlpha = a; text(story.moral.zh, 640, 330, '600 46px "Microsoft YaHei", serif', '#fff6e4', 'center', 14); text(story.moral.en, 640, 378, 'italic 20px Georgia', '#efd9ad');
        ink.globalAlpha = ease((t - endCard - 2.2) / 1.2); spaced(story.englishTitle, 640, 450, '16px Georgia', '#d8ccb2', 6); ink.globalAlpha = 1;
      }
      const fade = Math.max(1 - ease(t / .8), ease((t - story.duration + 1.2) / 1.2)); if (fade > 0) { ink.fillStyle = `rgba(4,6,5,${fade})`; ink.fillRect(0, 0, 1280, 720); }
      const seek = document.querySelector('#seek'); if (seek) seek.value = t;
      const time = document.querySelector('#time'); if (time) time.textContent = `${format(t)} / ${format(story.duration)}`;
      const label = document.querySelector('#shot'); if (label) label.textContent = shot.name;
      return { time: t, shot: shot.name, scene: shot.scene };
    }

    let pendingAudio;
    const buildAudio = () => pendingAudio ??= soundtrack().then(r => { window.pilot.audioReport = r.report; return r.buffer; });
    let playing = false, position = 0, source, clock, ctx;
    const play = document.querySelector('#play'), restart = document.querySelector('#restart'), seekBar = document.querySelector('#seek');
    function stop() { playing = false; source?.stop(); source = null; play.textContent = 'Play film'; }
    async function start() { if (position >= story.duration) position = 0; const data = await buildAudio(); ctx ??= new AudioContext(); await ctx.resume(); source = ctx.createBufferSource(); source.buffer = data; source.connect(ctx.destination); source.start(0, position); clock = performance.now() / 1000 - position; playing = true; play.textContent = 'Pause'; }
    function tick() { if (playing) { position = Math.min(story.duration, performance.now() / 1000 - clock); renderFrame(position); if (position >= story.duration) stop(); } requestAnimationFrame(tick); }
    play.disabled = restart.disabled = false;
    play.onclick = () => playing ? stop() : start().catch(e => { document.querySelector('#shot').textContent = e.message; });
    restart.onclick = () => { stop(); position = 0; renderFrame(0); };
    seekBar.oninput = e => { stop(); position = Number(e.target.value); renderFrame(position); };
    window.pilot = {
      ready: true, story, renderFrame, buildAudio, async wavBase64() { return wavBase64(await buildAudio()); },
      capture(t) { renderFrame(t); return canvas.toDataURL('image/jpeg', .97).split(',')[1]; }, poster(t) { renderFrame(t); return canvas.toDataURL('image/png').split(',')[1]; },
    };
    renderFrame(story.posterTime); requestAnimationFrame(tick);
    return window.pilot;
  }

  return { act, still, applyLooks, expressions, hold, headPos, walkY, smoothGround, speaking, cams, mount, seeds };
}
