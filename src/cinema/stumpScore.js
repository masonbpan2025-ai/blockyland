// 守株待兔 · Waiting by the Stump — Claude: the score and foley, composed on the shared sound kit.
import { createSoundKit } from './claudeSound.js';

export async function buildStumpSoundtrack(story, { BASE, footsteps, hops, groundAt }) {
  const kit = await createSoundKit(story, { BASE, audioDir: 'cinema-stump' });
  const { ctx, sfx, music, pluck, flute, pad, bell, drum, burst, thump, sec, arp, melody, wind, birds, crickets, clatter, rnd } = kit;
  const boing = (at, v = .14) => { const o = ctx.createOscillator(), g = ctx.createGain(), l = ctx.createOscillator(), lg = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(620, at); o.frequency.exponentialRampToValueAtTime(240, at + .5); l.frequency.value = 18; lg.gain.value = 40; l.connect(lg).connect(o.frequency); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + .6); o.connect(g).connect(sfx); o.start(at); l.start(at); o.stop(at + .65); l.stop(at + .65); };
  const tok = (at, v = .3) => { thump(at, 420, .08, v); burst(at, .05, 'bandpass', 1500, v * .6, sfx, 1.5); };
  const woodblock = (at, v = .06, hz = 900) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = hz; g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(.0001, at + .07); o.connect(g).connect(music); o.start(at); o.stop(at + .08); };

  // A — spring morning (D major pentatonic, bright)
  { const at = sec(.3, 84); ['D', 'G', 'Asus', 'D', 'Bm', 'G', 'Asus', 'D'].forEach((c, bar) => arp(bar * 4, c, at, bar < 1 ? .2 : .24));
    melody([[4, 74, 1], [5, 76, 1], [6, 78, 1.5], [7.5, 76, .5], [8, 74, 2], [10, 71, 2], [12, 69, 1], [13, 71, 1], [14, 74, 2], [16, 78, 1], [17, 81, 1], [18, 78, 1.5], [19.5, 76, .5], [20, 74, 3],
      [24, 71, 1], [25, 74, 1], [26, 76, 2], [28, 74, 2.5]], at, .3);
    pad(.2, [50, 57, 62], 22, .03); bell(.6, 74, .1); }
  // B — the rabbit: scurrying plucks, a dead stop, the bonk, then a greedy little dance
  { for (let k = 0; k < 22; k++) pluck(24.9 + k * .17, [74, 78, 81, 78, 76, 79, 83, 79][k % 8] - (k < 8 ? 12 : 0), .2, (k % 2) - .5);
    tok(28.7, .32); boing(28.72); for (let i = 0; i < 4; i++) bell(28.85 + i * .22, 93 + (i % 2) * 2, .035);
    [69, 71, 74].forEach((m, i) => pluck(30.4 + i * .5, m, .16, 0));
    const at = sec(33.0, 120); for (let bar = 0; bar < 3; bar++) arp(bar * 4, bar % 2 ? 'G' : 'D', at, .22, [0, 2, 4, 2, 3, 4, 3, 2]);
    melody([[8, 74, .5], [8.5, 76, .5], [9, 78, .5], [9.5, 81, 1.5], [11, 78, .5], [11.5, 74, 1]], sec(33.0, 120), .26); }
  // C — the idea: a sly low motif, then a lazy pad as he settles in
  { const at = sec(39.6, 92); [59, 62, 64, 66, 64, 62, 59, 57].forEach((m, i) => { for (let r = 0; r < 2; r++) pluck(at(i + r * 8), m - 12, .2, -.2); });
    pad(46.6, [47, 54, 59], 6, .035); [81, 78, 76, 74, 71, 69].forEach((m, i) => pluck(47.0 + i * .09, m, .14, .3 - i * .1)); }
  // D/E — the neighbours, and a few days later: sparse, comic, patient
  { [[53.2, 74], [54.6, 71], [56.0, 69], [57.4, 76]].forEach(([at, m]) => pluck(at, m, .18, 0)); pluck(57.15, 81, .14, .3);
    const at = sec(58.8, 76); ['D', 'G', 'Asus', 'D'].forEach((c, bar) => arp(bar * 4, c, at, .18, [0, 2, 3, 2])); }
  // M — time-lapse: a ticking clock, one rising arpeggio per day, the rabbit's dash
  { for (let t = 66.6; t < 83.2; t += .5) woodblock(t, .045, (Math.round((t - 66.6) / .5) % 2) ? 760 : 980);
    for (let d = 0; d < 4; d++) { const t0 = 66.4 + d * 4.25 + .5; [62, 66, 69, 74, 78].forEach((m, i) => pluck(t0 + i * .32, m + (d === 3 ? 0 : d * 2), .18, -.3 + i * .15)); }
    pad(66.4, [50, 57, 62], 17, .03);
    for (let k = 0; k < 8; k++) pluck(81.6 + k * .12, [81, 79, 76, 74, 71, 69, 66, 62][k], .18, .4 - k * .1); }
  // F — harvest: bittersweet, then Auntie Li's kindness turns it warm
  { const at = sec(83.6, 66); ['Bm', 'G', 'Em', 'Asus', 'Bm', 'G', 'D', 'Asus'].forEach((c, bar) => arp(bar * 4, c, at, .2));
    melody([[4, 71, 2], [6, 69, 1], [7, 66, 1], [8, 64, 2], [10, 66, 2], [12, 71, 1.5], [13.5, 74, .5], [14, 71, 2], [16, 69, 3]], at, .26);
    pad(83.6, [47, 54, 59], 13, .03); pad(97.0, [50, 57, 62, 66], 8, .035); bell(99.8, 74, .1);
    const at2 = sec(104.2, 72); melody([[0, 69, .5], [.5, 71, .5], [1, 74, 1], [2, 76, 1], [3, 78, 2]], at2, .28); }
  // G — sunset: the theme comes home
  { const at = sec(110.2, 72); ['D', 'G', 'Asus', 'D', 'Bm', 'G', 'Asus', 'D'].forEach((c, bar) => arp(bar * 4, c, at, .2));
    melody([[2, 74, 1], [3, 76, 1], [4, 78, 1.5], [5.5, 76, .5], [6, 74, 2], [8, 71, 2], [10, 69, 1], [11, 71, 1], [12, 74, 4]], at, .28);
    pad(110.2, [50, 57, 62], 16.5, .035); [50, 57, 62, 66, 69, 74].forEach((m, i) => pluck(120.9 + i * .07, m, .24, -.3 + i * .1)); bell(120.95, 62, .15); bell(121.0, 74, .1); }

  // foley: steps (field soil is softer), rabbit paws, hoe strikes on every downswing
  kit.footsteps([...footsteps, ...hops.map(([w, a, b]) => [w, a, b, .3])], w => (w.x >= -9 && w.x <= 13 && w.z >= -6 && w.z <= 4) ? 'dirt' : 'grass');
  for (const [a, b] of [[0, 16.6], [24, 28.8], [110, 124]]) for (let k = Math.ceil(a / 1.25 - .75); (k + .75) * 1.25 < b; k++) { const t = (k + .75) * 1.25; if (t < a) continue; thump(t, 115, .12, .13); burst(t, .09, 'lowpass', 700, .06); }
  thump(29.7, 140, .1, .08); clatter(29.72, 3, .05);
  for (let k = 0; k < 11; k++) { const t = 84.2 + k * .9; burst(t, .16, 'highpass', 3000, .03); } // sickle
  thump(99.0, 120, .12, .08); thump(100.35, 110, .1, .06); burst(100.35, .12, 'lowpass', 1200, .03);
  // ambience
  birds(1, 52, 2.4, .022); birds(52.5, 66, 3, .018); birds(84, 110, 3.6, .016);
  for (let d = 0; d < 4; d++) crickets(66.4 + d * 4.25 + 3.4, 66.4 + d * 4.25 + 4.25 + .6);
  wind(0, 66.6, .018, 420); wind(66, 84, .025, 380); wind(83, 127, .02, 400); crickets(117, 126.5);
  return kit.render();
}
