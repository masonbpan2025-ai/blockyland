// 一层一层数体积 · Count Volume Layer by Layer: the score and sound effects, composed on the shared sound kit.
// The music changes with each act (fish ball, flat first, pyramid, ball, pointy shapes, sunset); the effects
// follow the builds the director cues: block clicks as layers land, whooshes for flying pieces, chimes for reveals.
import { createSoundKit } from './claudeSound.js';
export { wavBase64 } from './claudeSound.js';

export async function buildVolumeSoundtrack(story, { BASE, builds }) {
  const kit = await createSoundKit(story, { BASE, audioDir: 'cinema-volume' });
  const { ctx, sfx, music, noise, rnd, pluck, pad, bell, drum, burst, thump, sec, arp, melody, birds, wind, crickets } = kit;

  // ---------------------------------------------------------------- effects
  const click = (at, v = .16) => { thump(at, 520 + rnd() * 160, .05, v); burst(at, .03, 'bandpass', 2400 + rnd() * 600, v * .5, sfx, 2, (rnd() - .5) * .5); };
  const whoosh = (at, dur = .9, v = .07) => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(300, at); f.frequency.exponentialRampToValueAtTime(2200, at + dur * .7); f.frequency.exponentialRampToValueAtTime(800, at + dur); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(v, at + dur * .6); g.gain.linearRampToValueAtTime(0, at + dur); s.connect(f).connect(g).connect(sfx); s.start(at, rnd()); s.stop(at + dur + .05); };
  const shimmer = (at, v = .09) => [86, 90, 93, 98, 102].forEach((m, i) => bell(at + i * .07, m, v * (1 - i * .12)));
  const ding = (at, v = .1) => bell(at, 88, v);
  const thunk = (at, v = .3) => { thump(at, 140, .2, v); burst(at, .06, 'lowpass', 700, v * .4); };
  const pop = (at, v = .12) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.setValueAtTime(380, at); o.frequency.exponentialRampToValueAtTime(900, at + .08); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + .14); o.connect(g).connect(sfx); o.start(at); o.stop(at + .16); };
  const bloop = (at, v = .06) => { const o = ctx.createOscillator(), g = ctx.createGain(); const f0 = 260 + rnd() * 240; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f0 * 2.2, at + .09); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + .12); o.connect(g).connect(sfx); o.start(at); o.stop(at + .14); };
  const pour = (a, b, v = .05) => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; s.loop = true; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .6; g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + .4); g.gain.setValueAtTime(v, b - .4); g.gain.linearRampToValueAtTime(0, b); s.connect(f).connect(g).connect(sfx); s.start(a); s.stop(b); for (let t = a; t < b; t += .12 + rnd() * .2) bloop(t, .03 + rnd() * .03); };
  for (const c of builds) {
    if (c.kind === 'clicks') for (let i = 0; i < c.n; i++) click(c.from + (c.to - c.from) * i / Math.max(1, c.n - 1), c.v ?? .14);
    else if (c.kind === 'whoosh') whoosh(c.at, c.dur, c.v);
    else if (c.kind === 'shimmer') shimmer(c.at, c.v);
    else if (c.kind === 'ding') ding(c.at, c.v);
    else if (c.kind === 'thunk') thunk(c.at, c.v);
    else if (c.kind === 'pop') pop(c.at, c.v);
    else if (c.kind === 'pour') pour(c.from, c.to);
  }

  // ---------------------------------------------------------------- music
  // A — the fish ball (D major pentatonic, bright and bouncy)
  { const at = sec(.4, 92); ['D', 'G', 'Asus', 'D', 'Bm', 'G', 'Asus', 'D', 'G', 'D', 'Asus', 'Asus'].forEach((c, bar) => arp(bar * 4, c, at, bar < 2 ? .2 : .24));
    melody([[4, 74, 1], [5, 76, 1], [6, 78, 1.5], [7.5, 81, .5], [8, 78, 2], [10, 76, 2], [12, 74, 1], [13, 76, 1], [14, 78, 2], [16, 81, 1.5], [17.5, 83, .5], [18, 81, 2], [20, 78, 3]], at, .28);
    pad(.3, [50, 57, 62], 32, .03); bell(.8, 74, .1); }
  // B — flat first: a light, curious counting theme
  { const at = sec(32.8, 96); for (let bar = 0; bar < 27; bar++) { const c = ['D', 'Bm', 'G', 'Asus'][bar % 4]; if (at(bar * 4) < 100.6) arp(bar * 4, c, at, .17, [0, 2, 1, 3, 2, 4, 3, 2]); }
    pad(32.8, [50, 57, 62], 16, .025); pad(81, [47, 54, 59], 20, .03);
    [62, 64, 66, 69, 71, 74].forEach((m, i) => pluck(47.6 + i * .08, m + 12, .18, -.3 + i * .12)); // twenty-one!
    shimmer(61.4, .08); [69, 74, 78, 81].forEach((m, i) => pluck(97.6 + i * .12, m, .2, 0)); }
  // C — the pyramid: building energy, a drum roll for the fly-in, wonder at the limit
  { const at = sec(101.8, 100); for (let bar = 0; bar < 28; bar++) { const t0 = at(bar * 4); if (t0 > 133.2) break; arp(bar * 4, ['D', 'G', 'Bm', 'Asus'][bar % 4], at, .18); }
    melody([[8, 74, 1], [9, 78, 1], [10, 81, 2], [12, 78, 1], [13, 76, 1], [14, 74, 2], [16, 76, 1], [17, 78, 1], [18, 81, 1.5], [19.5, 83, .5], [20, 81, 3]], at, .24);
    for (let k = 0; k < 20; k++) drum(135.2 + k * .3, .2 + k * .02, 100 + k * 3);
    drum(141.4, .6, 80); shimmer(141.5, .1); pad(141.4, [50, 57, 62, 66], 5, .045);
    const at2 = sec(143.2, 96); for (let bar = 0; bar < 14; bar++) { if (at2(bar * 4) > 186.2) break; arp(bar * 4, ['Bm', 'G', 'D', 'Asus'][bar % 4], at2, .15, [0, 2, 3, 2]); }
    pad(164.2, [50, 57, 62, 69], 12, .05); pad(176, [47, 54, 59, 66], 10, .045); shimmer(168.6, .1); bell(183.4, 81, .12); }
  // D — the ball: warm and round; the fill is a quick, happy montage
  { const at = sec(187, 88); for (let bar = 0; bar < 22; bar++) { if (at(bar * 4) > 247.6) break; arp(bar * 4, ['G', 'D', 'Bm', 'Asus'][bar % 4], at, .16, [0, 1, 2, 3, 4, 3, 2, 1]); }
    pad(187, [43, 50, 55, 59], 22, .03); pad(209.2, [50, 57, 62], 20, .03); shimmer(226.4, .09); bell(235.2, 74, .12); shimmer(243.6, .1);
    const at2 = sec(248.4, 120); for (let bar = 0; bar < 5; bar++) arp(bar * 4, ['D', 'G', 'D', 'Asus', 'D'][bar], at2, .22, [0, 2, 4, 2, 3, 4, 3, 2]);
    melody([[0, 74, .5], [.5, 76, .5], [1, 78, 1], [2, 81, 1], [3, 78, 1], [4, 76, .5], [4.5, 78, .5], [5, 81, 1], [6, 83, 2], [8, 81, 1], [9, 78, 1], [10, 76, 1], [11, 74, 1], [12, 76, 1], [13, 78, 1], [14, 81, 2], [16, 86, 3]], at2, .26); }
  // E — every pointy shape: curious, then the rule clicks into place
  { const at = sec(258.8, 96); for (let bar = 0; bar < 24; bar++) { if (at(bar * 4) > 318.6) break; arp(bar * 4, ['Em', 'G', 'D', 'Asus'][bar % 4], at, .15, [0, 2, 1, 3]); }
    pad(258.8, [40, 47, 52, 55], 14, .03); pad(286.8, [43, 50, 55, 59], 14, .03); shimmer(296.4, .08); shimmer(315.4, .1); }
  // F — sunset: the opening theme comes home, slow and warm
  { const at = sec(319.6, 66); ['D', 'Bm', 'G', 'Asus', 'D', 'G', 'D', 'D'].forEach((c, bar) => arp(bar * 4, c, at, .18 + bar * .01, [0, 1, 2, 3, 4, 3, 2, 1]));
    melody([[4, 74, 1], [5, 76, 1], [6, 78, 2], [8, 81, 1.5], [9.5, 78, .5], [10, 76, 2], [12, 74, 1], [13, 76, 1], [14, 78, 2], [16, 74, 4]], at, .26);
    pad(319.6, [50, 57, 62], 18, .035); [50, 57, 62, 66, 69, 74].forEach((m, i) => pluck(334.2 + i * .07, m, .24, -.3 + i * .1)); bell(334.3, 62, .14); }

  // ---------------------------------------------------------------- ambience: birds and a breeze by day, crickets at dusk
  birds(1, 318, 4.2, .014); wind(0, 338, .016, 420); crickets(326, 337.5);
  return kit.render();
}
