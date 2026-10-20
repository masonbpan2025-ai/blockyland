// 1500 Cartoon Players Simulate Civilization: the score and sound effects, composed on the shared sound kit.
// A playful pentatonic theme for the three islands, a sneaky one for Frieza, a low drum march for Doomsday, a rising
// swell for the Spirit Bomb that resolves into the opening theme when it becomes a dome, and a gentle reprise for the end.
// Effects follow the cues the film passes in: border hum and its shutdown roar, the Nimbus, the crash, the squeak,
// the train, crowds cheering, blizzard wind, the campfire, the Death Ball, the dome, and the final countdown.
import { createSoundKit } from './claudeSound.js';
export { wavBase64 } from './claudeSound.js';

export async function buildCivSoundtrack(story, { BASE, cues: Q, scenes: SC }) {
  const kit = await createSoundKit(story, { BASE, audioDir: 'cinema-civ' });
  const { ctx, sfx, music, amb, noise, rnd, pluck, flute, pad, bell, drum, burst, thump, sec, arp, melody, wind, birds, crickets, crack, clatter, musicGate } = kit;

  // ---------------------------------------------------------------- effects
  const sweep = (a, dur, f0, f1, v, type = 'bandpass', q = 1.2, dest = sfx) => { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; s.loop = true; f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, a); f.frequency.exponentialRampToValueAtTime(f1, a + dur); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + dur * .3); g.gain.linearRampToValueAtTime(0, a + dur); s.connect(f).connect(g).connect(dest); s.start(a, rnd()); s.stop(a + dur + .05); };
  const tone = (a, dur, f0, f1, v, type = 'sine', dest = sfx) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0, a); o.frequency.exponentialRampToValueAtTime(f1, a + dur); g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + .02); g.gain.exponentialRampToValueAtTime(.0001, a + dur); o.connect(g).connect(dest); o.start(a); o.stop(a + dur + .02); };
  const hum = (a, b, hz, v) => { const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.value = hz; o2.type = 'sine'; o2.frequency.value = hz * 1.5; const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(v, a + 1); g.gain.setValueAtTime(v, b - .3); g.gain.linearRampToValueAtTime(0, b); o.connect(f); o2.connect(f); f.connect(g).connect(amb); o.start(a); o2.start(a); o.stop(b); o2.stop(b); };
  const cheer = (a, b, v = .05) => { for (let t = a; t < b; t += .08) burst(t, .25 + rnd() * .2, 'bandpass', 900 + rnd() * 1400, v * (.5 + rnd() * .5), sfx, .9, rnd() * 1.6 - .8); };
  const squeak = (a) => { tone(a, .12, 1500, 2600, .22, 'square'); tone(a + .12, .1, 2600, 1800, .16, 'square'); };
  const chug = (a, b) => { for (let t = a; t < b; t += .21) { thump(t, 120, .08, .07); burst(t + .1, .06, 'highpass', 3000, .03); } sweep(a, b - a, 600, 900, .03, 'lowpass', .5); };
  const sparkle = (a, b) => { for (let t = a; t < b; t += .07 + rnd() * .1) bell(t, 96 + Math.floor(rnd() * 12), .035, sfx); };
  const sleigh = (a, n = 6) => { for (let i = 0; i < n; i++) bell(a + i * .08, 88 + (i % 3) * 4, .06, sfx); };
  const rangeAll = (list, fn) => list.forEach(([a, b]) => fn(a, b));

  hum(Q.borderHum[0], Q.borderHum[1], 55, .018);
  sparkle(...Q.lobbySparkle);
  // Day 8: the roar and the border switching off
  sweep(Q.roar - .6, 3.2, 80, 900, .32, 'lowpass', .7); thump(Q.roar, 48, 1.6, .7); thump(Q.roar + .3, 40, 1.4, .5); crack(Q.roar + .5, .35);
  tone(Q.borderOff, 1.4, 420, 40, .18, 'sawtooth');
  // the Nimbus: wind rushing past
  sweep(Q.nimbus[0], Q.nimbus[1] - Q.nimbus[0], 500, 1400, .07, 'bandpass', .6); sleigh(Q.nimbus[0] + 1);
  // the crash
  sweep(Q.crashWhoosh[0] + (Q.crashWhoosh[1] - Q.crashWhoosh[0]) * .4, (Q.crashWhoosh[1] - Q.crashWhoosh[0]) * .6, 300, 3000, .2, 'bandpass', .8);
  crack(Q.crash, .9); thump(Q.crash, 60, .9, .9); clatter(Q.crash + .2, 18, .2); for (let i = 0; i < 14; i++) bell(Q.crash + .3 + rnd() * 1.6, 100 + Math.floor(rnd() * 10), .04, sfx); // tinkling ice
  musicGate(Q.crash - .05, Q.crash + 1.6);
  squeak(Q.squeak);
  // the mailbox and the train
  sweep(Q.mailbox[0], Q.mailbox[1] - Q.mailbox[0], 400, 2400, .08); bell(Q.mailbox[0] + .2, 91, .1, sfx);
  chug(...Q.train); tone(Q.trainArrive, .5, 660, 660, .1, 'square'); tone(Q.trainArrive + .55, .7, 880, 880, .08, 'square');
  // the zombie, the campfire, the grunts and the minecarts
  for (let t = Q.zombie[0]; t < Q.zombie[1]; t += .9) { tone(t, .5, 140 + rnd() * 20, 95, .08, 'sawtooth'); }
  for (let t = Q.fire[0]; t < Q.fire[1]; t += .05) if (rnd() < .5) burst(t, .02, 'highpass', 2500 + rnd() * 2000, .02 * rnd(), amb);
  cheer(Q.cheer[0], Q.cheer[1], .045);
  for (let t = Q.minecart[0]; t < Q.minecart[1]; t += .16) { thump(t, 260, .05, .05); burst(t, .04, 'bandpass', 2400, .02); }
  // Doomsday and the stand
  for (let i = 0; i < 3; i++) tone(Q.doom + i * .6, .45, 220, 220, .14, 'square'); // the alarm
  thump(Q.doom + 2, 45, 2.4, .5);
  for (let t = Q.rumble[0]; t < Q.rumble[1]; t += 2.4) sweep(t, 2.6, 60, 120, .05, 'lowpass', .5, amb);
  sweep(Q.deathBall[0], Q.deathBall[1] - Q.deathBall[0], 120, 400, .09, 'lowpass', .8);
  sweep(Q.transform - .3, 1.6, 200, 4000, .22, 'bandpass', .7); thump(Q.transform, 70, 1.2, .6);
  sweep(Q.bomb[0], Q.bomb[1] - Q.bomb[0], 200, 1600, .08, 'bandpass', .5); sparkle(Q.bomb[0] + 1, Q.bomb[1]);
  for (const [i, m] of [86, 90, 93, 98, 102, 105].entries()) bell(Q.dome + i * .09, m, .14, sfx);
  crack(Q.deflect, .5); thump(Q.deflect, 55, 1, .5);
  for (let i = 0; i < 4; i++) tone(Q.countdown + i, .25, i === 3 ? 1320 : 880, i === 3 ? 1320 : 880, .12, 'sine');
  thump(Q.finalFlash, 40, 2.2, .7); sweep(Q.finalFlash - .4, 2.6, 200, 6000, .2, 'bandpass', .6);
  musicGate(Q.finalFlash - .1, Q.finalFlash + 1.8);
  // ambience
  rangeAll(Q.blizzard, (a, b) => { wind(a, b, .05, 900); wind(a, b, .03, 2400); });
  rangeAll(Q.birds, (a, b) => birds(a, b, 3.2, .016));
  rangeAll(Q.sea, (a, b) => { for (let t = a; t < b; t += 3.5) sweep(t, 3.4, 300, 700, .035, 'lowpass', .5, amb); });
  { const [a, b] = Q.cave; for (let t = a + .5; t < b; t += .9 + rnd() * 1.4) tone(t, .25, 1800 + rnd() * 600, 900, .03); } // drips
  crickets(SC.epilogue[0], SC.credits[1]);

  // ---------------------------------------------------------------- music
  const at = (scene, bpm, offset = 0) => sec(SC[scene][0] + offset, bpm);
  const each = (scene, bpm, chords, steps, vel, offset = 0) => { const a = at(scene, bpm, offset), end = SC[scene][1]; for (let bar = 0; a(bar * 4) < end - 1; bar++) arp(bar * 4, chords[bar % chords.length], a, vel, steps); };
  const THEME = [[0, 74, 1], [1, 76, 1], [2, 78, 1.5], [3.5, 81, .5], [4, 78, 2], [6, 76, 1], [7, 74, 1], [8, 76, 1], [9, 78, 1], [10, 81, 1], [11, 83, 1], [12, 81, 3]];
  // the opening: the theme, bright
  { const a = at('open', 104); each('open', 104, ['D', 'G', 'Asus', 'D'], undefined, .22); melody(THEME, sec(SC.open[0] + 2.4, 104), .3); pad(SC.open[0], [50, 57, 62], SC.open[1] - SC.open[0], .03); }
  each('lobby', 104, ['D', 'Bm', 'G', 'Asus'], [0, 2, 1, 3, 2, 4, 3, 2], .17); pad(SC.lobby[0], [62, 69, 74], SC.lobby[1] - SC.lobby[0], .02);
  each('map', 96, ['G', 'D', 'Em', 'Asus'], [0, 2, 4, 2], .16); bell(SC.map[0] + 2, 86, .1); bell(SC.map[0] + 2.8, 90, .1); bell(SC.map[0] + 3.6, 93, .1);
  // Hot Island: plucky and sunny; the war room gets a toy march
  each('outpost', 108, ['D', 'G', 'D', 'Asus'], [0, 1, 2, 3, 4, 3, 2, 1], .18); melody(THEME.slice(0, 8), sec(SC.outpost[0] + 1.2, 108), .22);
  { const a = at('warroom', 112), end = SC.warroom[1]; for (let b = 0; a(b) < end - .5; b++) { drum(a(b), b % 4 === 0 ? .4 : .22, b % 2 ? 140 : 95); if (b % 8 === 0) arp(b, ['D', 'A'][(b / 8) % 2 | 0], a, .14, [0, 2, 4, 2]); } }
  // Cold Island: wind and sparse bells, the grotto glows, the camp at night is warm
  { const a = at('icepalace', 70); for (let b = 0; a(b) < SC.icepalace[1] - 1; b += 2) bell(a(b), [74, 76, 81, 79][b / 2 % 4], .06); pad(SC.icepalace[0], [45, 52, 57], SC.icepalace[1] - SC.icepalace[0], .03); }
  { const a = at('grotto', 80); for (let b = 0; a(b) < SC.grotto[1] - 1; b++) bell(a(b), [86, 90, 93, 98, 93, 90][b % 6], .05); pad(SC.grotto[0], [57, 64, 69], SC.grotto[1] - SC.grotto[0], .035); }
  { const a = at('zfighters', 118), night = Q.fire[0]; for (let b = 0; a(b) < night - 1; b++) pluck(a(b), [62, 62, 69, 66, 64, 62, 57, 59][b % 8] - 12, .14); pad(night, [50, 57, 62, 66], SC.zfighters[1] - night, .045); melody(THEME.slice(0, 6), sec(night + 2, 72), .18); }
  // Temperate Island: the theme on the flute, happy
  each('bakery', 104, ['G', 'D', 'G', 'Asus'], [0, 1, 2, 3, 4, 3, 2, 1], .16); melody(THEME, sec(SC.bakery[0] + 1, 104), .24);
  each('cafe', 92, ['G', 'Bm', 'Em', 'Asus'], [0, 2, 4, 2], .15);
  each('day7', 88, ['Bm', 'G', 'D', 'Asus'], [0, 2, 1, 3], .14); pad(SC.day7[0], [47, 54, 59], SC.day7[1] - SC.day7[0], .035);
  // Phase II: faster and brighter; a sneaky minor theme for Frieza's plan
  each('nimbus', 132, ['D', 'G', 'A', 'D'], [0, 1, 2, 3, 4, 3, 2, 1], .2); melody(THEME, sec(SC.nimbus[0], 132), .26);
  each('trade', 116, ['D', 'G', 'Asus', 'D'], [0, 2, 1, 3, 2, 4, 3, 2], .18);
  { const a = at('photobomb', 96); for (let b = 0; a(b) < SC.photobomb[1] - 1; b++) pluck(a(b), [52, 55, 57, 59, 57, 55, 52, 47][b % 8], .16, (b % 2 ? .3 : -.3)); }
  // Phase III: a low march, then the swell
  { for (const name of ['doomsday', 'march', 'stand']) { const a = at(name, 84), end = SC[name][1]; for (let b = 0; a(b) < end - .3; b++) drum(a(b), b % 4 === 0 ? .55 : .25, b % 4 === 0 ? 70 : 95); pad(SC[name][0], [40, 47, 52, 55], end - SC[name][0], .04); } }
  pad(Q.bomb[0], [50, 57, 62, 66, 69], Q.dome - Q.bomb[0], .05);
  { const a = sec(Q.dome, 96); ['D', 'G', 'Bm', 'Asus', 'D', 'G', 'D', 'D'].forEach((c, bar) => { if (a(bar * 4) < SC.spirit[1] - 2) arp(bar * 4, c, a, .22); }); melody(THEME, sec(Q.dome + 1, 96), .3); }
  // the end: a gentle reprise as the sun comes up, then the credits
  { const a = at('epilogue', 66, 1); ['D', 'Bm', 'G', 'Asus', 'D', 'G', 'D', 'D'].forEach((c, bar) => arp(bar * 4, c, a, .15, [0, 1, 2, 3, 4, 3, 2, 1])); pad(SC.epilogue[0], [50, 57, 62], SC.epilogue[1] - SC.epilogue[0], .03); }
  { each('credits', 96, ['D', 'G', 'Asus', 'D'], undefined, .2); melody(THEME, sec(SC.credits[0] + 1, 96), .28); const end = SC.credits[1]; [50, 57, 62, 66, 69, 74].forEach((m, i) => pluck(end - 3.4 + i * .07, m, .24, -.3 + i * .1)); bell(end - 3.3, 62, .14); }
  return kit.render();
}
