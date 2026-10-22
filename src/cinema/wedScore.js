// Three Islands, Three Weddings: the score and sound effects, composed on the shared sound kit (same kit and theme family
// as civScore.js). A playful pentatonic theme for the meetings, a lonely pad for the lantern night, a low march for the
// Big Freeze that breaks into bells when the tower pops, a wedding march for both weddings, a festival beat for the
// tournament, and the theme again, slow, under the moral. Effects follow the cues the film passes in.
import { createSoundKit } from './claudeSound.js';
export { wavBase64 } from './claudeSound.js';

export async function buildWedSoundtrack(story, { BASE, cues: Q, scenes: SC }) {
  const kit = await createSoundKit(story, { BASE, audioDir: 'cinema-weddings' });
  const { ctx, sfx, amb, noise, rnd, pluck, pad, bell, drum, burst, thump, sec, arp, melody, wind, birds, crickets, crack, clatter, musicGate } = kit;

  // ---------------------------------------------------------------- effects
  const sweep = (a, dur, f0, f1, v, type = 'bandpass', q = 1.2, dest = sfx) => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, a); f.frequency.exponentialRampToValueAtTime(f1, a + dur); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + dur * .3); g.gain.linearRampToValueAtTime(0, a + dur); s.connect(f).connect(g).connect(dest); s.start(a, rnd()); s.stop(a + dur + .05); };
  const tone = (a, dur, f0, f1, v, type = 'sine', dest = sfx) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, a); o.frequency.exponentialRampToValueAtTime(f1, a + dur); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + .02); g.gain.exponentialRampToValueAtTime(.0001, a + dur); o.connect(g).connect(dest); o.start(a); o.stop(a + dur + .02); };
  const cheer = (a, b, v = .05) => { for (let t = a; t < b; t += .08) burst(t, .25 + rnd() * .2, 'bandpass', 900 + rnd() * 1400, v * (.5 + rnd() * .5), sfx, .9, rnd() * 1.6 - .8); };
  const sparkle = (a, b) => { for (let t = a; t < b; t += .07 + rnd() * .1) bell(t, 96 + Math.floor(rnd() * 12), .035, sfx); };
  const gong = a => { for (const [m, v] of [[38, .2], [45, .12], [50, .08]]) bell(a, m, v, sfx); thump(a, 55, 2.4, .35); };
  const rangeAll = (list, fn) => list.forEach(([a, b]) => fn(a, b));

  sparkle(...Q.lobbySparkle);
  cheer(Q.yay, Q.yay + 1.8, .05);
  // the flip in the carrot field, and the exhibition flip years later
  for (const t of [Q.flip, Q.flip2]) { sweep(t - .35, .45, 400, 2400, .12); thump(t, 70, .5, .55); burst(t + .02, .3, 'lowpass', 600, .2); }
  cheer(Q.flip2 + .2, Q.flip2 + 2.6, .055);
  // the fair, the tournament crowd and the gong
  cheer(Q.fairCheer[0], Q.fairCheer[1], .02); cheer(Q.budokai[0], Q.budokai[1], .03); gong(Q.gong); cheer(Q.winner, Q.winner + 3, .06);
  // the gravity machine bursting, the tape, the remote snapping
  thump(Q.boom, 45, 1.6, .8); crack(Q.boom + .05, .6); clatter(Q.boom + .2, 10, .15); musicGate(Q.boom - .05, Q.boom + 1.2);
  for (let i = 0; i < 3; i++) tone(Q.tape + i * .14, .08, 1800, 1800, .05, 'square');
  sweep(Q.tape + .4, 2.4, 2000, 3000, .015, 'highpass', .6); // tape hiss
  crack(Q.snap, .5); tone(Q.snap, .25, 900, 300, .08, 'square');
  sweep(Q.flyAway - .2, 1.6, 300, 2400, .1, 'bandpass', .8); // 18 flies off
  // the Big Freeze: crackling ice, wind; the pop, the snowflakes
  for (let t = Q.freeze[0]; t < Q.freeze[1]; t += .3 + rnd() * .5) burst(t, .06, 'highpass', 3000 + rnd() * 3000, .03 * rnd(), amb);
  tone(Q.pop, .18, 300, 1400, .25, 'sine'); burst(Q.pop, .12, 'bandpass', 1800, .25); sparkle(Q.pop + .1, Q.pop + 6);
  // the proposals: fireworks; the weddings: bells; the chase: little paws
  for (const t of Q.fireworks) { sweep(t - 1.1, 1.1, 300, 2600, .06, 'bandpass', 2); crack(t, .35); for (let i = 0; i < 10; i++) burst(t + .1 + rnd() * .9, .03, 'highpass', 4000, .05 * rnd()); }
  for (const t of [Q.bells, Q.bells2]) for (let i = 0; i < 12; i++) bell(t + i * .32, [86, 81, 78, 74][i % 4], .08, sfx);
  cheer(Q.bells + 4, Q.bells + 7, .05); cheer(Q.bells2 + 2, Q.bells2 + 5, .05);
  for (let t = Q.chase[0]; t < Q.chase[1]; t += .14) { thump(t, 300 + rnd() * 80, .04, .05); }
  // the flying lesson: a gentle whoosh up
  sweep(Q.lift, 2.4, 300, 1800, .06, 'bandpass', .6); bell(Q.lift + 1.4, 93, .08);
  // ambience
  rangeAll(Q.blizzard, (a, b) => { wind(a, b, .05, 900); wind(a, b, .03, 2400); });
  rangeAll(Q.birds, (a, b) => birds(a, b, 3.2, .016));
  rangeAll(Q.night, (a, b) => crickets(a, b));

  // ---------------------------------------------------------------- music
  const at = (scene, bpm, offset = 0) => sec(SC[scene][0] + offset, bpm);
  const each = (scene, bpm, chords, steps, vel, offset = 0) => { const a = at(scene, bpm, offset), end = SC[scene][1]; for (let bar = 0; a(bar * 4) < end - 1; bar++) arp(bar * 4, chords[bar % chords.length], a, vel, steps); };
  const THEME = [[0, 74, 1], [1, 76, 1], [2, 78, 1.5], [3.5, 81, .5], [4, 78, 2], [6, 76, 1], [7, 74, 1], [8, 76, 1], [9, 78, 1], [10, 81, 1], [11, 83, 1], [12, 81, 3]];
  const LOVE = [[0, 78, 1.5], [1.5, 76, .5], [2, 74, 2], [4, 76, 1], [5, 78, 1], [6, 81, 2], [8, 83, 1.5], [9.5, 81, .5], [10, 78, 2], [12, 74, 3]]; // the love theme: the main theme turned gentle
  // Act I: bright, a different colour for each island
  { each('open', 104, ['D', 'G', 'Asus', 'D'], undefined, .2); melody(THEME, sec(SC.open[0] + 1.6, 104), .28); pad(SC.open[0], [50, 57, 62], SC.open[1] - SC.open[0], .03); }
  each('lobby', 108, ['D', 'Bm', 'G', 'Asus'], [0, 2, 1, 3, 2, 4, 3, 2], .16);
  each('map', 96, ['G', 'D', 'Em', 'Asus'], [0, 2, 4, 2], .15); bell(SC.map[0] + 2, 86, .1); bell(SC.map[0] + 2.8, 90, .1); bell(SC.map[0] + 3.6, 93, .1);
  each('farm', 108, ['G', 'D', 'G', 'Asus'], [0, 1, 2, 3, 4, 3, 2, 1], .16); melody(THEME.slice(0, 8), sec(SC.farm[0] + 1, 108), .2);
  { const a = at('lab', 112), end = SC.lab[1]; for (let b = 0; a(b) < end - .5; b++) { drum(a(b), b % 4 === 0 ? .32 : .16, b % 2 ? 140 : 95); if (b % 8 === 0) arp(b, ['D', 'A'][(b / 8) % 2 | 0], a, .13, [0, 2, 4, 2]); } }
  { const a = at('gate', 72); for (let b = 0; a(b) < SC.gate[1] - 1; b += 2) bell(a(b), [74, 76, 81, 79][b / 2 % 4], .06); pad(SC.gate[0], [45, 52, 57], SC.gate[1] - SC.gate[0], .03); }
  // Act II: the fair, then trouble
  each('fair', 116, ['D', 'G', 'Asus', 'D'], [0, 2, 1, 3, 2, 4, 3, 2], .17); melody(THEME, sec(SC.fair[0] + 2, 116), .22);
  pad(SC.lantern[0], [47, 54, 59, 62], SC.lantern[1] - SC.lantern[0], .045); { const a = at('lantern', 60, 2); [[0, 74], [2, 71], [4, 69], [8, 66]].forEach(([b, m]) => pluck(a(b), m, .12)); }
  each('knot', 84, ['G', 'Bm', 'Em', 'Asus'], [0, 2, 4, 2], .12, 1); melody(LOVE, sec(SC.knot[0] + 9, 84), .16);
  { const a = at('smoke', 96); for (let b = 0; a(b) < SC.smoke[1] - 1; b++) pluck(a(b), [52, 55, 57, 59, 57, 55, 52, 47][b % 8], .14, b % 2 ? .3 : -.3); }
  { const a = at('tape', 90); for (let b = 2; a(b) < SC.tape[1] - 1; b++) pluck(a(b), [50, 54, 57, 62][b % 4], .1); pad(Q.truth, [50, 57, 62, 66], SC.tape[1] - Q.truth, .035); }
  pad(SC.spy[0], [40, 47, 52], SC.spy[1] - SC.spy[0], .04);
  // Act III: the freeze march, the remote, the pop
  { for (const name of ['freeze', 'table']) { const a = at(name, 84), end = SC[name][1]; for (let b = 0; a(b) < end - .3; b++) drum(a(b), b % 4 === 0 ? .45 : .2, b % 4 === 0 ? 70 : 95); pad(SC[name][0], [40, 47, 52, 55], end - SC[name][0], .035); } }
  { const a = at('remote', 70); for (let b = 0; a(b) < Q.snap - .5; b++) pluck(a(b), [47, 50, 52, 50][b % 4], .12); pad(Q.snap + .5, [50, 57, 62, 66], SC.remote[1] - Q.snap - .5, .04); }
  { const a = at('thaw', 120); for (let b = 0; a(b) < Q.pop - .3; b++) drum(a(b), b % 2 ? .25 : .45, b % 2 ? 110 : 75); }
  { const a = sec(Q.pop + .4, 104); ['D', 'G', 'Bm', 'Asus', 'D', 'G', 'D', 'D'].forEach((c, bar) => { if (a(bar * 4) < SC.thaw[1] - 1) arp(bar * 4, c, a, .2); }); melody(THEME, sec(Q.pop + 1.2, 104), .26); }
  // Act IV: three proposals, the wedding march, the chase
  for (const name of ['propgoku', 'propveg', 'propkri']) { each(name, 80, ['G', 'D', 'Em', 'Asus'], [0, 2, 4, 2], .13); }
  melody(LOVE, sec(SC.propveg[0] + 4, 80), .18);
  { const a = at('wedding', 72); ['D', 'G', 'D', 'Asus', 'D', 'G', 'Bm', 'Asus', 'G', 'D', 'Asus', 'D'].forEach((c, bar) => { if (a(bar * 4) < SC.wedding[1] - 1) arp(bar * 4, c, a, .16, [0, 2, 4, 2]); }); melody(LOVE, sec(SC.wedding[0] + 2, 72), .2); pad(SC.wedding[0], [50, 57, 62], SC.wedding[1] - SC.wedding[0], .03); }
  each('chase', 150, ['D', 'G', 'A', 'D'], [0, 1, 2, 3, 4, 3, 2, 1], .2);
  // Act V: brighter, the next generation
  each('year15', 112, ['D', 'G', 'Asus', 'D'], [0, 1, 2, 3, 4, 3, 2, 1], .16); melody(THEME, sec(SC.year15[0] + 6, 112), .2);
  each('saiyaman', 100, ['G', 'Bm', 'Em', 'Asus'], [0, 2, 1, 3], .14);
  pad(SC.flying[0], [50, 57, 62, 66, 69], SC.flying[1] - SC.flying[0], .04); melody(LOVE, sec(SC.flying[0] + 1.5, 96), .18);
  { const a = at('budokai', 120), end = SC.budokai[1]; for (let b = 0; a(b) < end - .5; b++) { drum(a(b), b % 4 === 0 ? .4 : .2, b % 2 ? 150 : 90); if (b % 8 === 0) arp(b, ['D', 'G'][(b / 8) % 2 | 0], a, .14, [0, 2, 4, 2]); } }
  each('flip', 116, ['D', 'G', 'Asus', 'D'], undefined, .18);
  { const a = at('fourth', 66, 1); ['D', 'Bm', 'G', 'Asus', 'D', 'G', 'Bm', 'Asus', 'G', 'D', 'Asus', 'D'].forEach((c, bar) => { if (a(bar * 4) < SC.fourth[1] - .5) arp(bar * 4, c, a, .15, [0, 1, 2, 3, 4, 3, 2, 1]); }); melody(LOVE, sec(SC.fourth[0] + 2, 66), .2); pad(SC.fourth[0], [50, 57, 62], SC.fourth[1] - SC.fourth[0], .03); }
  { each('credits', 96, ['D', 'G', 'Asus', 'D'], undefined, .2); melody(THEME, sec(SC.credits[0] + 1, 96), .28); const end = SC.credits[1]; [50, 57, 62, 66, 69, 74].forEach((m, i) => pluck(end - 3.4 + i * .07, m, .24, -.3 + i * .1)); bell(end - 3.3, 62, .14); }
  return kit.render();
}
