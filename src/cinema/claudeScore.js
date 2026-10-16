// 塞翁失马 · We'll See — Claude: the score and foley, composed on the shared sound kit.
// The music follows the story's turns and cuts to silence when the wheel cracks.
import { createSoundKit } from './claudeSound.js';
export { wavBase64 } from './claudeSound.js';

export async function buildSoundtrack(story, { BASE, footsteps, hoofs, groundAt }) {
  const kit = await createSoundKit(story, { BASE, audioDir: 'cinema-claude' });
  const { music, pluck, flute, pad, bell, drum, burst, thump, sec, arp, melody, snort, crack, clatter, wind, birds, crickets, rnd, ctx, sfx, noise } = kit;

  // A — moving day (B minor, a little heavy-hearted)
  { const at = sec(.3, 66); ['Bm', 'G', 'D', 'Asus', 'Bm', 'G', 'D', 'Asus', 'Em', 'G', 'Asus', 'Asus'].forEach((c, bar) => arp(bar * 4, c, at, bar < 2 ? .22 : .26));
    melody([[8, 78, 1.5], [9.5, 76, .5], [10, 74, 1], [11, 71, 1], [12, 69, 2], [14, 71, 2], [16, 74, 1.5], [17.5, 76, .5], [18, 78, 1], [19, 81, 1], [20, 78, 3], [23, 76, 1],
      [24, 74, 1.5], [25.5, 71, .5], [26, 69, 1], [27, 66, 1], [28, 64, 2], [30, 66, 2], [32, 71, 1.5], [33.5, 74, .5], [34, 76, 2], [36, 74, 1], [37, 71, 1], [38, 69, 2], [40, 71, 3.5]], at, .3);
    pad(.2, [47, 54, 59], 14, .03); pad(29, [40, 47, 55], 14, .03); bell(.6, 59, .1);
    [62, 64, 66, 69, 71, 74, 76, 78, 81, 83].forEach((m, i) => pluck(42.6 + i * .075, m, .22, -.4 + i * .08)); bell(43.55, 74, .14);
  }
  // B — Grandpa's story (D major pentatonic, storybook bounce)
  { const at = sec(43.8, 88), pat = [0, 2, 3, 4, 3, 2, 1, 2];
    const chords = ['D', 'Bm', 'G', 'Asus'];
    for (let bar = 0; bar < 14; bar++) { const b0 = bar * 4; if (at(b0) > 82.0) break; arp(b0, chords[bar % 4], at, at(b0) > 46.4 && at(b0) < 52 ? .3 : .21, pat); }
    for (let k = 0; k < 7; k++) drum(46.9 + k * .68, .35, 80);
    pad(51.1, [47, 54, 59, 62], 3.6, .05); bell(51.2, 47, .16);
    for (let k = 0; k < 12; k++) pluck(58.3 + k * .42, [62, 66, 69, 74, 69, 66, 64, 69, 74, 78, 74, 81][k], .24, (k % 2) - .5);
    pad(63.9, [50, 57, 62, 66], 3.6, .05); bell(63.9, 74, .14);
    [86, 83, 81, 78, 76, 74, 71, 69, 66, 64, 62].forEach((m, i) => pluck(73.55 + i * .05, m, .2, .4 - i * .07)); pad(76.3, [47, 54, 59, 62], 3.4, .05); bell(76.35, 47, .16);
    for (let k = 0; k < 16; k++) drum(82.2 + k * .6, k % 4 === 0 ? .55 : .35, k % 4 === 0 ? 85 : 110);
    pad(82.2, [38, 45, 50], 8, .045); pad(89.5, [50, 57, 62, 66], 4.5, .05); bell(89.5, 69, .12);
    // the old man's question, left unresolved each time
    for (const s of [57.6, 69.9, 81.7, 95.75]) { const qat = sec(s, 88); melody([[0, 69, .5], [.5, 71, .5], [1, 74, .5], [1.5, 76, 2.2]], qat, .26); }
    pad(92.6, [50, 57, 64], 5, .04); bell(96.9, 76, .1);
  }
  // C — back home, the question hangs; cut to silence on the crack
  { pad(97.4, [47, 54, 59], 9.9, .035); [[98.2, 71], [100, 66], [101.8, 74], [103.6, 69], [105.4, 71]].forEach(([at, m]) => pluck(at, m, .2, 0)); }
  // D — comfort (D major, tender)
  { const at = sec(114.8, 63); ['D', 'Bm', 'G', 'Asus', 'D', 'Bm', 'G', 'D'].forEach((c, bar) => arp(bar * 4, c, at, .2 + bar * .01));
    melody([[4.5, 69, 1.5], [6, 71, .5], [6.5, 74, 1.5], [8, 76, 1], [9, 74, 1], [10, 71, 2], [12, 69, 3], [15, 66, 1], [16, 69, 1.5], [17.5, 71, .5], [18, 74, 2], [20, 78, 1.5], [21.5, 76, .5], [22, 74, 3]], at, .28);
    pad(114.6, [50, 57, 62], 18, .03); bell(130.0, 74, .1); }
  // E — the workshop (light, busy)
  { const at = sec(132.6, 100); for (let bar = 0; bar < 8; bar++) { const c = bar % 2 ? 'G' : 'D'; arp(bar * 4, c, at, .17, [0, 2, 4, 2, 3, 2, 1, 2]); }
    pad(144.0, [50, 57, 62, 66], 7, .035); [62, 66, 69, 74, 78, 81].forEach((m, i) => pluck(150.6 + i * .09, m, .22, -.3 + i * .12)); bell(151.1, 81, .1); }
  // F — evening, the theme comes home and resolves
  { const at = sec(152.9, 60); ['D', 'Bm', 'G', 'Asus', 'D', 'Bm', 'G', 'Asus', 'D', 'G', 'D', 'D', 'D', 'D', 'D'].forEach((c, bar) => { if (bar < 13) arp(bar * 2, c, at, .2, [0, 1, 2, 3], .5); });
    pad(152.9, [50, 57, 62], 25, .035);
    melody([[6, 69, .5], [6.5, 71, .5], [7, 74, 2], [9, 76, 1], [10, 78, 1], [11, 81, 2], [13, 78, 1.5], [14.5, 76, .5], [15, 74, 2], [17, 71, 1], [18, 74, 1], [19, 76, 2.6], [22, 74, 4.5]], at, .3);
    [50, 57, 62, 66, 69, 74].forEach((m, i) => pluck(174.9 + i * .07, m, .26, -.3 + i * .1)); bell(174.95, 62, .16); bell(172.0, 74, .1);
  }
  music.gain.setValueAtTime(music.gain.value, 0);
  kit.musicGate(107.25, 114.6); // silence around the crack

  // footsteps (porch wood, frontier dirt, grass) and hooves
  kit.footsteps(footsteps, w => groundAt(w.x, w.z) > 3.2 && w.z < -1.15 ? 'wood' : w.z > 22 ? 'dirt' : 'grass');
  kit.hoofs(hoofs);
  // morning
  thump(8.85, 120, .18, .14); thump(25.95, 100, .2, .12); snort(17.2, .06); snort(36.4, .05);
  // the story
  snort(46.0, .16); burst(46.1, .5, 'bandpass', 900, .05); crack(47.65, .22); clatter(47.85, 5, .1); snort(72.5, .14); snort(73.2, .16); thump(74.35, 70, .3, .3); burst(74.35, .2, 'lowpass', 600, .12);
  for (const at of [63.6, 64.2]) snort(at, .07);
  // the wheel
  thump(107.05, 95, .22, .22); crack(107.25, .6); snort(107.4, .18); clatter(107.5, 8, .14); thump(107.82, 75, .3, .26); clatter(107.9, 4, .07);
  for (const at of [115.9, 117.3, 118.6]) { burst(at, .22, 'highpass', 2800, .035); }
  burst(130.05, .6, 'lowpass', 1800, .04); burst(160.25, .6, 'lowpass', 1800, .04);
  // the workshop: wheel rolling, plane strokes, knocks
  { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; s.loop = true; f.type = 'lowpass'; f.frequency.value = 260; g.gain.setValueAtTime(0, 132.3); g.gain.linearRampToValueAtTime(.06, 133); g.gain.setValueAtTime(.06, 136.6); g.gain.linearRampToValueAtTime(0, 137.1); s.connect(f).connect(g).connect(sfx); s.start(132.3); s.stop(137.2); }
  for (let k = 0; k < 3; k++) { const at = 132.3 + k * 1.85 + .2; const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = 'bandpass'; f.frequency.value = 3200; f.Q.value = .8; g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(.05, at + .15); g.gain.linearRampToValueAtTime(0, at + .6); s.connect(f).connect(g).connect(sfx); s.start(at, rnd()); s.stop(at + .65); }
  thump(143.25, 160, .12, .1);
  // ambience: birds by day, wind on the frontier, crickets at dusk
  for (const [a, b, gap, v] of [[1, 43.5, 2.6, .022], [45, 97, 6, .012], [98, 107, 3.2, .02], [116, 132, 3.6, .016], [133, 152.5, 4, .016]]) birds(a, b, gap, v);
  wind(0, 44.4, .02, 420); wind(43.4, 97.8, .045, 520); wind(97, 153.4, .018, 400); wind(152.4, 178, .02, 360);
  crickets(152.9, 177.5);
  // story transitions: a soft shimmer
  for (const at of [43.0, 96.9]) [86, 83, 81, 78].forEach((m, i) => pluck(at + i * .06, m, .1, .3 - i * .2));

  return kit.render();
}
