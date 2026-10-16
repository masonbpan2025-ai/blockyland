// Shared sound kit for Blockyland films, rendered offline (OfflineAudioContext, 48 kHz stereo).
//   voices    one neural TTS clip per line, at its scripted time, never time-stretched;
//             the music bus ducks ~7.5 dB under every spoken line
//   score     plucked zither (Karplus–Strong), breathy dizi-style flute, pads, bells, tanggu drum
//   foley     footsteps from each walker's stride phase, hoofbeats from horse gaits,
//             cracks, thuds, clatter, snorts, birds, wind
// Everything random comes from one seeded generator, so a film's mix is identical on every render.
// A film builds its soundtrack as: kit = await createSoundKit(...); compose with kit; kit.render().
const SR = 48000;
export const mtof = m => 440 * 2 ** ((m - 69) / 12);
export const CHORDS = { Bm: [47, 54, 59, 62, 66], G: [43, 50, 55, 59, 62], D: [50, 57, 62, 66, 69], Asus: [45, 52, 57, 62, 64], Em: [40, 47, 52, 55, 59], A: [45, 52, 57, 64, 69] };

export async function createSoundKit(story, { BASE, audioDir }) {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * story.duration), SR);
  const master = ctx.createGain(); master.gain.value = .9;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = .01; comp.release.value = .25;
  master.connect(comp).connect(ctx.destination);
  const music = ctx.createGain(), sfx = ctx.createGain(), amb = ctx.createGain(), voice = ctx.createGain();
  music.connect(master); sfx.connect(master); amb.connect(master); voice.connect(master); voice.gain.value = 1.05; sfx.gain.value = .9; amb.gain.value = .8;
  // reverb
  const ir = ctx.createBuffer(2, SR * 3.4, SR);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let lp = 0; for (let i = 0; i < d.length; i++) { lp = lp * .55 + (rnd() * 2 - 1) * .45; d[i] = lp * Math.exp(-i / SR * 2.1) * (i < SR * .012 ? i / (SR * .012) : 1); } }
  const verb = ctx.createConvolver(); verb.buffer = ir; const verbOut = ctx.createGain(); verbOut.gain.value = .55; verb.connect(verbOut).connect(master);
  const musicVerb = ctx.createGain(); musicVerb.gain.value = .55; music.connect(musicVerb).connect(verb);
  const noise = ctx.createBuffer(1, SR * 2, SR); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }

  // ---------------------------------------------------------------- voices + ducking
  const report = [];
  const duck = music.gain; duck.setValueAtTime(1, 0);
  const windows = [];
  for (const line of story.lines) {
    const res = await fetch(`${BASE}${audioDir}/audio/${line.id}.wav`); if (!res.ok) throw new Error(`Voice clip ${line.id} is missing.`);
    const buf = await ctx.decodeAudioData(await res.arrayBuffer()), src = ctx.createBufferSource(), g = ctx.createGain(), pan = ctx.createStereoPanner();
    src.buffer = buf; g.gain.value = line.face ? 1 : .95; pan.pan.value = 0;
    src.connect(g).connect(pan).connect(voice);
    if (line.face) { const send = ctx.createGain(); send.gain.value = .07; g.connect(send).connect(verb); }
    src.start(line.start);
    windows.push([line.start - .12, line.start + buf.duration + .25]);
    report.push({ id: line.id, who: line.who, start: line.start, duration: +buf.duration.toFixed(3), end: +(line.start + buf.duration).toFixed(3), rate: 1 });
  }
  windows.sort((a, b) => a[0] - b[0]);
  const merged = []; for (const w of windows) { const l = merged.at(-1); if (l && w[0] <= l[1] + .35) l[1] = Math.max(l[1], w[1]); else merged.push([...w]); }
  for (const [a, b] of merged) { duck.setValueAtTime(1, Math.max(0, a - .2)); duck.linearRampToValueAtTime(.42, a); duck.setValueAtTime(.42, b); duck.linearRampToValueAtTime(1, b + .5); }

  // ---------------------------------------------------------------- instruments
  const ksCache = new Map();
  function ksBuffer(midi) { // Karplus–Strong string, ~3 s ring, slightly bright pluck
    if (ksCache.has(midi)) return ksCache.get(midi);
    const f = mtof(midi), N = Math.max(2, Math.round(SR / f)), len = Math.round(SR * Math.min(4, 2 + 260 / f)), out = new Float32Array(len), buf = new Float32Array(N);
    let prev = 0; for (let i = 0; i < N; i++) { const n = rnd() * 2 - 1; prev = prev * .35 + n * .65; buf[i] = prev; }
    const rho = Math.pow(.001, 1 / (f * Math.min(3.2, 1.2 + 300 / f)));
    for (let i = 0, p = 0; i < len; i++) { const a = buf[p], b = buf[(p + 1) % N]; out[i] = a; buf[p] = (a * .5 + b * .5) * rho; p = (p + 1) % N; }
    let peak = 0; for (const s of out) peak = Math.max(peak, Math.abs(s)); for (let i = 0; i < len; i++) out[i] /= peak || 1;
    const ab = ctx.createBuffer(1, len, SR); ab.copyToChannel(out, 0); ksCache.set(midi, ab); return ab;
  }
  function pluck(at, midi, vel = .3, panV = 0, dest = music) {
    if (at < 0 || at > story.duration) return;
    const s = ctx.createBufferSource(), g = ctx.createGain(), p = ctx.createStereoPanner(); s.buffer = ksBuffer(midi); g.gain.value = vel * .5; p.pan.value = panV;
    s.connect(g).connect(p).connect(dest); s.start(at);
  }
  function flute(at, midi, dur, vel = .3) {
    const f = mtof(midi), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.type = 'sine'; o2.type = 'triangle'; o.frequency.value = f; o2.frequency.value = f * 2;
    lfo.frequency.value = 5.3; lg.gain.setValueAtTime(0, at); lg.gain.linearRampToValueAtTime(f * .011, at + Math.min(.45, dur * .6)); lfo.connect(lg); lg.connect(o.frequency); lg.connect(o2.frequency);
    const h = ctx.createGain(); h.gain.value = .12; o2.connect(h).connect(g); o.connect(g);
    const peak = vel * .16; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + .09); g.gain.setValueAtTime(peak, at + Math.max(.1, dur - .12)); g.gain.linearRampToValueAtTime(0, at + dur + .22);
    const b = ctx.createBufferSource(), bf = ctx.createBiquadFilter(), bg = ctx.createGain(); b.buffer = noise; b.loop = true; bf.type = 'bandpass'; bf.frequency.value = f * 2.2; bf.Q.value = 1.4;
    bg.gain.setValueAtTime(0, at); bg.gain.linearRampToValueAtTime(vel * .05, at + .05); bg.gain.linearRampToValueAtTime(vel * .012, at + .25); bg.gain.setValueAtTime(vel * .012, at + dur); bg.gain.linearRampToValueAtTime(0, at + dur + .2);
    b.connect(bf).connect(bg).connect(g);
    const send = ctx.createGain(); send.gain.value = .5; g.connect(music); g.connect(send).connect(verb);
    for (const n of [o, o2, lfo, b]) { n.start(at); n.stop(at + dur + .3); }
  }
  function pad(at, midis, dur, vel = .05) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = .4;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel, at + Math.min(1.6, dur / 3)); g.gain.setValueAtTime(vel, at + dur - Math.min(1.8, dur / 3)); g.gain.linearRampToValueAtTime(0, at + dur);
    lp.connect(g).connect(music);
    for (const m of midis) for (const det of [-6, 5]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det; const og = ctx.createGain(); og.gain.value = .22 / midis.length; o.connect(og).connect(lp); o.start(at); o.stop(at + dur + .05); }
  }
  function bell(at, midi, vel = .12, dest = music) {
    const f = mtof(midi);
    for (const [r, a, d] of [[1, 1, 4.5], [2.01, .45, 2.6], [2.76, .35, 1.8], [4.07, .2, 1.1], [5.43, .12, .7]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = f * r; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(vel * a * .25, at + .006); g.gain.exponentialRampToValueAtTime(.0001, at + d);
      o.connect(g).connect(dest); o.start(at); o.stop(at + d + .05);
    }
  }
  function drum(at, vel = .5, hz = 95) { // tanggu
    const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(hz, at); o.frequency.exponentialRampToValueAtTime(hz * .45, at + .28);
    g.gain.setValueAtTime(vel * .5, at); g.gain.exponentialRampToValueAtTime(.0001, at + .45); o.connect(g).connect(music); o.start(at); o.stop(at + .5);
    burst(at, .06, 'lowpass', 900, vel * .25, music);
  }
  function burst(at, dur, type, hz, vel, dest = sfx, q = .8, panV = 0) {
    if (at < 0) return;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), p = ctx.createStereoPanner();
    s.buffer = noise; f.type = type; f.frequency.value = hz; f.Q.value = q; p.pan.value = panV;
    g.gain.setValueAtTime(vel, at); g.gain.exponentialRampToValueAtTime(.0001, at + dur);
    s.connect(f).connect(g).connect(p).connect(dest); s.start(at, rnd() * 1.5); s.stop(at + dur + .02);
  }
  function thump(at, hz, dur, vel, dest = sfx) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(hz, at); o.frequency.exponentialRampToValueAtTime(hz * .45, at + dur); g.gain.setValueAtTime(vel, at); g.gain.exponentialRampToValueAtTime(.0001, at + dur); o.connect(g).connect(dest); o.start(at); o.stop(at + dur + .02); }

  // ---------------------------------------------------------------- score helpers
  const sec = (start, bpm) => b => start + b * 60 / bpm;
  const arp = (beat, chord, at, vel = .26, steps = [0, 1, 2, 3, 4, 3, 2, 1], dur = .5) => steps.forEach((s, i) => pluck(at(beat + i * dur), CHORDS[chord][s], vel * (i === 0 ? 1.35 : 1) * (.9 + rnd() * .2), (i % 2 ? .25 : -.2)));
  const melody = (notes, at, vel = .32) => notes.forEach(([b, m, d]) => flute(at(b), m, d * (at(1) - at(0)) * .96, vel));

  // ---------------------------------------------------------------- foley
  /** Footsteps on every stride of every walker: list of [walk, t0, t1, scale]; surface(w) → 'wood' | 'dirt' | 'grass'. */
  function footsteps(list, surface) {
    const steps = [];
    for (const [walk, t0, t1, scale] of list) {
      let last = null;
      for (let t = t0; t < t1; t += 1 / 120) {
        const w = walk(t); if (!w.stride) { last = null; continue; }
        const k = Math.floor(w.phase / Math.PI); if (last !== null && k !== last) steps.push([t, w, scale]); last = k;
      }
    }
    for (const [t, w, scale] of steps) {
      const kind = surface(w), v = .05 * scale * (.85 + rnd() * .3);
      if (kind === 'wood') { thump(t, 150 + rnd() * 30, .09, v * 1.6); burst(t, .05, 'lowpass', 900, v * .6); }
      else { burst(t, .07, 'bandpass', kind === 'dirt' ? 900 : 1700, v * (kind === 'dirt' ? 1.1 : .9), sfx, .7, (rnd() - .5) * .3); thump(t, 90, .06, v * .5); }
    }
  }
  /** Hoofbeats on every quarter-cycle of a horse path that is walking or galloping: list of [path, t0, t1]. */
  function hoofs(list) {
    for (const [path, t0, t1] of list) {
      let last = null;
      for (let t = t0; t < t1; t += 1 / 160) {
        const w = path(t); if (!w.gait) { last = null; continue; }
        const k = Math.floor(w.phase / (Math.PI / 2)); if (last !== null && k !== last) { const v = w.gait === 2 ? .09 : .045; thump(t, 210 + rnd() * 40, .07, v); burst(t, .035, 'bandpass', 2600, v * .5); } last = k;
      }
    }
  }
  const snort = (at, v = .12) => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 1.6; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + .04); g.gain.linearRampToValueAtTime(v * .3, at + .18); g.gain.linearRampToValueAtTime(v * .8, at + .22); g.gain.exponentialRampToValueAtTime(.0001, at + .5); s.connect(f).connect(g).connect(sfx); s.start(at, rnd()); s.stop(at + .55); };
  const crack = (at, v = .5) => { burst(at, .22, 'highpass', 1400, v); thump(at, 85, .35, v * .9); for (let i = 0; i < 9; i++) burst(at + .02 + rnd() * .3, .03, 'bandpass', 2000 + rnd() * 2500, v * .35 * rnd(), sfx, 2, (rnd() - .5) * .6); };
  const clatter = (at, n = 6, v = .12) => { for (let i = 0; i < n; i++) { const tt = at + i * (.06 + rnd() * .08); thump(tt, 320 + rnd() * 300, .06, v * (1 - i / n)); burst(tt, .03, 'bandpass', 1800, v * .5); } };
  const bird = (at, v = .02, pan = 0) => { const n = 2 + Math.floor(rnd() * 3), base = 2600 + rnd() * 1500; for (let i = 0; i < n; i++) { const t = at + i * (.09 + rnd() * .05), o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(); o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.25 + rnd() * .3), t + .05); o.frequency.exponentialRampToValueAtTime(base * .9, t + .08); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01); g.gain.exponentialRampToValueAtTime(.0001, t + .09); p.pan.value = pan; o.connect(g).connect(p).connect(amb); o.start(t); o.stop(t + .1); } };
  const wind = (a, b, v, hz) => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); s.buffer = noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = hz; l.frequency.value = .13; lg.gain.value = v * .4; l.connect(lg).connect(g.gain); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + 1.2); g.gain.setValueAtTime(v, b - 1.2); g.gain.linearRampToValueAtTime(0, b); s.connect(f).connect(g).connect(amb); s.start(a); s.stop(b); l.start(a); l.stop(b); };
  /** Birdsong across [a, b): a chirp roughly every `gap` seconds. */
  const birds = (a, b, gap, v) => { for (let t = a; t < b; t += gap * (.6 + rnd() * .8)) bird(t, v, rnd() * 1.6 - .8); };
  /** Crickets at dusk, fading in from `a`. */
  const crickets = (a, b) => { for (let t = a + .3; t < b; t += .55 + rnd() * .5) { const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner(); o.frequency.value = 4300 + rnd() * 300; p.pan.value = rnd() * 1.6 - .8; for (let k = 0; k < 3; k++) { const tt = t + k * .045; g.gain.setValueAtTime(0, tt); g.gain.linearRampToValueAtTime(.012 * Math.min(1, (t - a) / 3), tt + .008); g.gain.linearRampToValueAtTime(0, tt + .03); } o.connect(g).connect(p).connect(amb); o.start(t); o.stop(t + .16); } };
  /** Silence the music (not voices or foley) over [a, b] with short ramps — for a dramatic beat. */
  function musicGate(a, b) {
    const cut = ctx.createGain();
    music.disconnect(); music.connect(cut).connect(master); musicVerb.disconnect(); cut.connect(musicVerb).connect(verb);
    cut.gain.setValueAtTime(1, 0); cut.gain.setValueAtTime(1, a - .15); cut.gain.linearRampToValueAtTime(0, a + .05); cut.gain.setValueAtTime(0, b); cut.gain.linearRampToValueAtTime(1, b + .6);
  }

  return {
    ctx, master, music, sfx, amb, voice, verb, musicVerb, noise, rnd, report, SR,
    pluck, flute, pad, bell, drum, burst, thump, sec, arp, melody, footsteps, hoofs, snort, crack, clatter, bird, wind, birds, crickets, musicGate,
    async render() { return { buffer: await ctx.startRendering(), report }; },
  };
}

export async function wavBase64(buffer) {
  const n = buffer.length, out = new ArrayBuffer(44 + n * 4), v = new DataView(out), str = (at, s) => [...s].forEach((c, i) => v.setUint8(at + i, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, out.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, buffer.sampleRate, true); v.setUint32(28, buffer.sampleRate * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  const a = buffer.getChannelData(0), b = buffer.getChannelData(1), c = x => Math.max(-1, Math.min(1, x)) * 32767;
  for (let i = 0; i < n; i++) { v.setInt16(44 + i * 4, c(a[i]), true); v.setInt16(46 + i * 4, c(b[i]), true); }
  return new Promise(resolve => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.readAsDataURL(new Blob([out])); });
}
