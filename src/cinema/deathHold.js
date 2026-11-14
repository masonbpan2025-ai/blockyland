// Where a dying player is drawn in the arena films (arenaFilm.js, arenaDuelFilm.js).
//
// When a player dies, the game moves them at once to the spectators' spot above the middle of the map, and the
// recording's frames follow them there -- usually a frame before the death itself is logged. Drawn as recorded, the
// dying player glides up into the sky and plays the death animation there. Instead, each death holds its player at
// the last frame before that move, where they fell, until the death animation is over.

/** A move of more than this many blocks between two frames is the game moving a player, not the player moving. */
export const TELEPORT_BLOCKS = 3;
/** How far before the logged death to look for that move. */
export const LOOKBACK_SECONDS = 1.5;

/**
 * For each death, the frame its player is held at and from when.
 * @param {Array<{t: number, p: Array<Array<number>>}>} frames the recording's frames; p[i] starts [x, y, z, ...]
 * @param {string[]} names the players, in the order of p
 * @param {Array<{t: number, player: string}>} deaths
 * @returns {Array<{i: number, t: number, frame: number, from: number}>} `from` is when the hold starts (never after `t`)
 */
export function deathHolds(frames, names, deaths) {
  const indexAt = (g) => {
    let lo = 0, hi = frames.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (frames[mid].t <= g) lo = mid; else hi = mid - 1; }
    return lo;
  };
  const holds = [];
  for (const d of deaths) {
    const i = names.indexOf(d.player);
    if (i < 0 || !frames.length) continue;
    let frame = indexAt(d.t);
    // The latest jump in the last moments before the death is the move to the spectators' spot (a fall into the
    // void is fast too, but the move comes after it, so the latest jump is the right one).
    for (let j = frame; j > 0 && frames[j].t >= d.t - LOOKBACK_SECONDS; j--) {
      const a = frames[j - 1].p[i], b = frames[j].p[i];
      if (Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > TELEPORT_BLOCKS) { frame = j - 1; break; }
    }
    holds.push({ i, t: d.t, frame, from: Math.min(frames[frame].t, d.t) });
  }
  return holds;
}
