// The soundtrack, synthesized: each level's track (music.js) played by a small WebAudio step sequencer.
// Audio time is presentation-only; rules use session dt.
import { LEVELS } from '../levels.js';
import { songFor } from './music.js';

const LOOKAHEAD = 0.12;
const frequency = (midi) => 440 * 2 ** ((midi - 69) / 12);

export function createScore() {
  let context = null, enabled = true, master = null, echo = null, noise = null, driveCurve = null;
  let song = null, songLevel = -1, step = 0, next = 0, lastAttempt = -1, lastX = -1;

  function unlock() {
    context ||= new (window.AudioContext || window.webkitAudioContext)();
    if (context.state === 'suspended') context.resume().catch(() => {});
    if (master) return;
    // Master: a gentle compressor so the drums can hit without clipping.
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18; compressor.ratio.value = 4; compressor.attack.value = 0.003; compressor.release.value = 0.2;
    master = context.createGain(); master.gain.value = 0.85;
    master.connect(compressor); compressor.connect(context.destination);
    // An echo bus, its feedback and send set per style.
    echo = { delay: context.createDelay(1), feedback: context.createGain(), send: context.createGain() };
    echo.feedback.gain.value = 0.32; echo.send.gain.value = 0;
    echo.send.connect(echo.delay); echo.delay.connect(echo.feedback); echo.feedback.connect(echo.delay); echo.delay.connect(master);
    // White noise for the snare and hats.
    noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    driveCurve = new Float32Array(1024);
    for (let i = 0; i < driveCurve.length; i++) { const x = (i / 511.5) - 1; driveCurve[i] = Math.tanh(x * 3); }
  }

  /** A gain that rises in `attack` and dies away over `decay`, into the master (and the echo, when `wet`). */
  function envelope(at, peak, attack, decay, wet = false) {
    const g = context.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    g.connect(master);
    if (wet) g.connect(echo.send);
    return g;
  }

  function kick(at, velocity) {
    const o = context.createOscillator(), g = envelope(at, 0.9 * velocity, 0.002, 0.3);
    o.type = 'sine'; o.frequency.setValueAtTime(150, at); o.frequency.exponentialRampToValueAtTime(42, at + 0.13);
    o.connect(g); o.start(at); o.stop(at + 0.35);
  }

  function burst(at, velocity, filterType, cutoff, peak, decay, q = 0.8) {
    const src = context.createBufferSource(), f = context.createBiquadFilter(), g = envelope(at, peak * velocity, 0.001, decay);
    src.buffer = noise; f.type = filterType; f.frequency.value = cutoff; f.Q.value = q;
    src.connect(f); f.connect(g); src.start(at); src.stop(at + decay + 0.05);
  }

  function snare(at, velocity) {
    burst(at, velocity, 'bandpass', 1900, 0.42, 0.16);
    const o = context.createOscillator(), g = envelope(at, 0.22 * velocity, 0.001, 0.09);
    o.type = 'triangle'; o.frequency.setValueAtTime(200, at); o.frequency.exponentialRampToValueAtTime(140, at + 0.08);
    o.connect(g); o.start(at); o.stop(at + 0.12);
  }

  /** One pitched voice, by timbre, through a low-pass filter that opens and closes with the note. */
  function voice(timbre, midi, at, duration, peak, cutoff, { wet = false, drive = 0, attack = 0.004 } = {}) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass'; filter.Q.value = 2;
    filter.frequency.setValueAtTime(cutoff * 2.2, at); filter.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.6), at + duration);
    const decay = timbre === 'marimba' ? Math.min(0.28, duration) : timbre === 'bell' ? Math.max(0.6, duration) : duration;
    const out = envelope(at, peak, attack, decay, wet);
    let head = filter;
    if (drive > 0) { const shaper = context.createWaveShaper(); shaper.curve = driveCurve; const pre = context.createGain(); pre.gain.value = 1 + drive * 6; filter.connect(pre); pre.connect(shaper); head = shaper; }
    head.connect(out);
    const f = frequency(midi);
    const partials = timbre === 'supersaw' ? [['sawtooth', 1, -12], ['sawtooth', 1, 0], ['sawtooth', 1, 12]]
      : timbre === 'bell' ? [['sine', 1, 0], ['sine', 2.76, 0], ['sine', 5.4, 0]]
      : timbre === 'marimba' ? [['sine', 1, 0], ['sine', 4, 0]]
      : [[timbre, 1, 0]];
    for (const [type, ratio, cents] of partials) {
      const o = context.createOscillator(), g = context.createGain();
      o.type = type; o.frequency.value = f * ratio; o.detune.value = cents;
      g.gain.value = (ratio === 1 ? 1 : 0.35 / ratio) / partials.length * (timbre === 'supersaw' ? 1.6 : 1);
      o.connect(g); g.connect(filter); o.start(at); o.stop(at + decay + 0.6);
    }
  }

  function play(note, at, s) {
    const length = note.steps * s.stepSeconds;
    switch (note.part) {
      case 'bass': voice(s.bass, note.midi, at, length * 0.9, 0.14, 700, { drive: s.drive }); break;
      case 'lead': voice(s.lead, note.midi, at, length, 0.075, 2600, { wet: true }); break;
      case 'pad': for (const midi of note.chord) voice(s.pad, midi, at, length, 0.022, 1300, { wet: true, attack: 0.08 }); break;
      case 'arp': voice('square', note.midi, at, length * 0.8, 0.028, 3200, { wet: true }); break;
      case 'tom': { const o = context.createOscillator(), g = envelope(at, 0.5, 0.002, 0.22); o.type = 'sine'; o.frequency.setValueAtTime(frequency(note.midi), at); o.frequency.exponentialRampToValueAtTime(frequency(note.midi) * 0.55, at + 0.2); o.connect(g); o.start(at); o.stop(at + 0.3); break; }
      case 'cowbell': for (const hz of [587, 845]) { const o = context.createOscillator(), f = context.createBiquadFilter(), g = envelope(at, 0.06, 0.001, 0.12); o.type = 'square'; o.frequency.value = hz; f.type = 'bandpass'; f.frequency.value = 800; o.connect(f); f.connect(g); o.start(at); o.stop(at + 0.15); } break;
      case 'tick': voice('sine', note.midi, at, 0.03, 0.03, 6000); break;
      default: break;
    }
  }

  function schedule(state) {
    const s = song;
    while (next < context.currentTime + LOOKAHEAD) {
      const beat = s.at(step);
      if (beat.kick) kick(next, beat.kick);
      if (beat.snare) snare(next, beat.snare);
      if (beat.hat) burst(next, beat.hat, 'highpass', 7600, 0.09, 0.045, 0.5);
      for (const note of beat.notes) play(note, next, s);
      // Flight (ship, UFO) brings the arpeggio in; the styles that have one keep it in their full sections.
      const intro = Math.floor(step / 16) % 16 < 2;
      if (state.mode === 'ship' || state.mode === 'ufo' || (s.arp && !intro && step % 2 === 0)) play(s.flightAt(step), next, s);
      next += s.stepSeconds; step++;
    }
  }

  return {
    unlock,
    toggle() { enabled = !enabled; if (master) master.gain.value = enabled ? 0.85 : 0; return enabled; },
    update(state) {
      if (!context || !master || !enabled || state.phase !== 'play') { next = 0; return; }
      // A new run (another attempt, another level, or back at the start) starts the track from its first bar.
      const restarted = state.levelIndex !== songLevel || state.attempt !== lastAttempt || (state.x ?? 0) < lastX;
      lastX = state.x ?? 0;
      if (restarted || !next) {
        if (state.levelIndex !== songLevel) { song = songFor(LEVELS[state.levelIndex], state.levelIndex); songLevel = state.levelIndex; }
        if (restarted) step = 0;
        lastAttempt = state.attempt;
        next = context.currentTime + 0.03;
        echo.delay.delayTime.value = song.stepSeconds * 3;
        echo.send.gain.value = song.delay;
      }
      schedule(state);
    },
    dispose() { context?.close().catch(() => {}); },
  };
}
