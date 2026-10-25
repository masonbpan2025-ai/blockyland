// Each level's soundtrack, as data: an original track in a style that suits its biome. audio.js plays it.
// Pure, so it runs in Node. Times are in sixteenth-note steps; a bar is 16 steps; notes are MIDI numbers.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], harmonicMinor: [0, 2, 3, 5, 7, 8, 11], lydian: [0, 2, 4, 6, 7, 9, 11],
  blues: [0, 3, 5, 6, 7, 10], majorPentatonic: [0, 2, 4, 7, 9], phrygianDominant: [0, 1, 4, 5, 7, 8, 10],
};

/**
 * The styles. Drum rows are 16 steps: x a hit, o a softer one, . a rest. `chords` are scale degrees (0 = the root)
 * one per bar of a four-bar loop. `rhythm` places the lead's notes in a bar (1 = a note, 0 = hold or rest).
 */
export const STYLES = {
  meadow: { scale: 'major', root: 60, lead: 'square', bass: 'triangle', pad: 'triangle',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.', chords: [0, 4, 5, 3],
    rhythm: '1010101010110100', bassLine: '1.1.1.1.1.1.1.11', delay: 0.18, drive: 0 },
  frost: { scale: 'minor', root: 62, lead: 'bell', bass: 'sine', pad: 'sine',
    kick: 'x.....x...x.....', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', chords: [0, 5, 2, 6],
    rhythm: '1001001010010010', bassLine: '1...1...1...1.1.', delay: 0.32, drive: 0, arp: true },
  badlands: { scale: 'blues', root: 57, lead: 'sawtooth', bass: 'square', pad: 'sawtooth',
    kick: 'x.......x.x.....', snare: '........x.......', hat: 'x.x.x.x.x.x.x.xo', chords: [0, 0, 3, 4],
    rhythm: '1000101000101011', bassLine: '1..1..1.1..1..1.', delay: 0.22, drive: 0.25 },
  caverns: { scale: 'minor', root: 57, lead: 'triangle', bass: 'sawtooth', pad: 'triangle',
    kick: 'x.........x.....', snare: '....x..o....x...', hat: 'x.xxx.xxx.xxx.xx', chords: [0, 3, 5, 4],
    rhythm: '1011001010110010', bassLine: '1.11..1.1.11..1.', delay: 0.26, drive: 0.1 },
  end: { scale: 'harmonicMinor', root: 59, lead: 'supersaw', bass: 'sawtooth', pad: 'supersaw',
    kick: 'x...x...x...x...', snare: '....x.......x..o', hat: '..x...x...x...xx', chords: [0, 5, 3, 4],
    rhythm: '1110111011101011', bassLine: '1111111111111111', delay: 0.2, drive: 0.2 },
  jungle: { scale: 'majorPentatonic', root: 62, lead: 'marimba', bass: 'triangle', pad: 'triangle',
    kick: 'x..x..x.x..x..x.', snare: '....x.......x.x.', hat: 'x.xx.xx.x.xx.xx.', chords: [0, 3, 4, 1],
    rhythm: '1011011010110110', bassLine: '1..1..1.1..1..1.', delay: 0.15, drive: 0, toms: true },
  sculk: { scale: 'phrygian', root: 50, lead: 'bell', bass: 'sine', pad: 'sawtooth',
    kick: 'x.......x.......', snare: '........x.......', hat: 'x.x.x.x.x.x.x.x.', chords: [0, 1, 0, 6],
    rhythm: '1000100010001010', bassLine: '1.......1...1.1.', delay: 0.42, drive: 0.15, tick: true },
  nether: { scale: 'phrygianDominant', root: 52, lead: 'sawtooth', bass: 'sawtooth', pad: 'sawtooth',
    kick: 'x.x...x.x.x...x.', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.', chords: [0, 1, 0, 5],
    rhythm: '1101001011010010', bassLine: '11.111.111.111.1', delay: 0.12, drive: 0.55 },
  mushroom: { scale: 'lydian', root: 64, lead: 'square', bass: 'triangle', pad: 'triangle',
    kick: 'x..x....x..x....', snare: '....x.......x...', hat: '.xx.xx.xx.xx.xx.', chords: [0, 1, 4, 5],
    rhythm: '1101011011010110', bassLine: '1..1.1..1..1.1..', delay: 0.24, drive: 0, arp: true },
  mineshaft: { scale: 'dorian', root: 55, lead: 'square', bass: 'square', pad: 'sawtooth',
    kick: 'x..x..x...x..x..', snare: '....x..o....x...', hat: 'xxxxxxxxxxxxxxxx', chords: [0, 3, 0, 4],
    rhythm: '1010110110101101', bassLine: '1.11.1.11.11.1.1', delay: 0.1, drive: 0.3, cowbell: true },
  stronghold: { scale: 'minor', root: 57, lead: 'supersaw', bass: 'sawtooth', pad: 'supersaw',
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'xoxoxoxoxoxoxoxo', chords: [0, 5, 2, 6],
    rhythm: '1111101011111010', bassLine: '1.1.1.1.1.1.1.1.', delay: 0.28, drive: 0.15, arp: true },
};

/** Which style each level plays, in level order (levels.js). */
export const LEVEL_STYLES = ['meadow', 'frost', 'badlands', 'caverns', 'end', 'jungle', 'sculk', 'nether', 'mushroom', 'mineshaft', 'stronghold'];

/** The note `degree` steps up the scale from its root (degrees past the scale's end climb an octave). */
export function noteOf(style, degree) {
  const scale = SCALES[style.scale];
  const octave = Math.floor(degree / scale.length), step = ((degree % scale.length) + scale.length) % scale.length;
  return style.root + octave * 12 + scale[step];
}

/**
 * A level's track: its style, its tempo, and what plays on each sixteenth step. The melody is drawn from the level's
 * own motif (levels.js), so each level's tune is its own; bars 1-2 are the intro (kick and bass, the lead an octave
 * down), bars 3-16 the full beat, and the loop answers itself every fourth bar. The intro is short: a run restarts
 * the track, and a player retrying a hard part would otherwise hear little else.
 */
export function songFor(level, levelIndex) {
  const styleName = LEVEL_STYLES[levelIndex] ?? 'meadow';
  const style = STYLES[styleName];
  const motif = level.motif ?? [0, 2, 4, 7, 4, 2, 0, 4];
  const scale = SCALES[style.scale];
  // The motif is in semitones; it is read as scale degrees, so every lead note sits in the style's scale.
  const degrees = motif.map((semitone) => Math.round(semitone * scale.length / 12));
  return {
    style: styleName, bpm: level.bpm, stepSeconds: 60 / level.bpm / 4, barSteps: 16, loopBars: 16, ...style,
    /** What sounds on step `step` (counting from the start of the run). */
    at(step) {
      const bar = Math.floor(step / 16) % 16, s = step % 16, intro = bar < 2;
      const chordDegree = style.chords[bar % 4];
      const out = { kick: style.kick[s] !== '.' ? (style.kick[s] === 'x' ? 1 : 0.6) : 0,
        snare: intro ? 0 : style.snare[s] === 'x' ? 1 : style.snare[s] === 'o' ? 0.5 : 0,
        hat: style.hat[s] === 'x' ? 1 : style.hat[s] === 'o' ? 0.45 : 0, notes: [] };
      if (style.bassLine[s] !== '.') out.notes.push({ part: 'bass', midi: noteOf(style, chordDegree) - 24, steps: 1 });
      if (s === 0 && !intro) out.notes.push({ part: 'pad', midi: noteOf(style, chordDegree), chord: [0, 2, 4].map((d) => noteOf(style, chordDegree + d)), steps: 16 });
      if (style.rhythm[s] === '1') {
        // Every fourth bar answers the motif from a step higher, so the loop does not just repeat.
        const index = (Math.floor(step / 2) + (bar % 4 === 3 ? 3 : 0)) % degrees.length;
        out.notes.push({ part: 'lead', midi: noteOf(style, degrees[index] + chordDegree % 3) - (intro ? 12 : 0), steps: style.rhythm[s + 1] === '0' ? 2 : 1 });
      }
      if (style.toms && !intro && (s === 13 || s === 14 || s === 15) && bar % 2 === 1) out.notes.push({ part: 'tom', midi: 45 + (15 - s) * 4, steps: 1 });
      if (style.cowbell && !intro && s % 4 === 2) out.notes.push({ part: 'cowbell', midi: 81, steps: 1 });
      if (style.tick && s % 2 === 0) out.notes.push({ part: 'tick', midi: s % 8 === 0 ? 96 : 91, steps: 1 });
      return out;
    },
    /** The flight layer (ship and UFO sections): a fast arpeggio over the bar's chord. */
    flightAt(step) {
      const bar = Math.floor(step / 16) % 16, chordDegree = style.chords[bar % 4];
      return { part: 'arp', midi: noteOf(style, chordDegree + [0, 2, 4, 7][step % 4]) + 12, steps: 1 };
    },
  };
}
