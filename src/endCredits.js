// The credits that roll the first time a player goes through the exit portal after the ender dragon is defeated.
//
// Vanilla (Minecraft Wiki, "Exit portal"): "The credits roll when a player enters the End podium for the first time",
// and then the player is back at their spawn point. The words are this game's own; vanilla's End Poem is not copied.

export const END_CREDITS = [
  ['title', 'THE END'],
  ['gap'],
  ['line', 'The dragon is gone, and the island is quiet.'],
  ['line', 'The portal at its heart is open again.'],
  ['gap'],
  ['line', 'You came with twelve eyes and a sword,'],
  ['line', 'crossed the void, broke the crystals'],
  ['line', 'and stood your ground under its wings.'],
  ['gap'],
  ['line', 'What happens next is up to you.'],
  ['line', 'The world you made is still waiting at home.'],
  ['gap'],
  ['heading', 'Blockyland'],
  ['line', 'Made by its players and contributors'],
  ['line', 'with three.js, in your browser'],
  ['gap'],
  ['heading', 'Thank you for playing'],
];

/** Seconds the roll takes, end to end. */
export const END_CREDITS_SECONDS = 32;

/**
 * Roll the credits over the game. Resolves when they finish, or when the player skips them (Escape, Space or a click).
 *
 * @param {{doc?: Document, seconds?: number}} [options]
 * @returns {Promise<{skipped: boolean}>}
 */
export function showEndCredits({ doc = globalThis.document, seconds = END_CREDITS_SECONDS } = {}) {
  if (!doc?.body) return Promise.resolve({ skipped: false });
  return new Promise((resolve) => {
    const overlay = doc.createElement('div');
    overlay.id = 'end-credits';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Credits');
    const roll = doc.createElement('div');
    roll.className = 'end-credits-roll';
    roll.style.animationDuration = `${seconds}s`;
    for (const [kind, text] of END_CREDITS) {
      const row = doc.createElement('div');
      row.className = `end-credits-${kind}`;
      if (text) row.textContent = text;
      roll.appendChild(row);
    }
    const hint = doc.createElement('div');
    hint.className = 'end-credits-hint';
    hint.textContent = 'Press Esc or click to skip';
    overlay.append(roll, hint);
    doc.body.appendChild(overlay);

    let done = false;
    const finish = (skipped) => {
      if (done) return;
      done = true;
      doc.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve({ skipped });
    };
    const onKey = (e) => {
      if (e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); }
    };
    doc.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', () => finish(true));
    roll.addEventListener('animationend', () => finish(false));
    // A tab in the background runs no animation; the roll still ends.
    setTimeout(() => finish(false), (seconds + 1) * 1000);
  });
}
