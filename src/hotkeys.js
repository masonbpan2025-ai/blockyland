// The Java Edition hotkeys that are not movement, inventory or chat.
//
// Movement, sneaking, sprinting, jumping, the hotbar keys 1-9, the scroll wheel, E, Q, F, T, / and Escape
// were already bound where they belong (player.js for movement, ui.js for the interface, main.js for the
// item actions). What was missing is the rest of the Java Edition list: F1, F2, F11, Control+B and the
// debug combinations that hang off the F3 modifier.
//
// This module is deliberately only a table plus a dispatcher: every entry names a method on the Game, so
// the behaviour lives next to the system it affects (the chunk streamer for reloading chunks, the UI for
// the HUD and the chat) and this file stays readable as a list of keys. The only state it owns is whether
// F3 is currently held, because that is what turns a plain key into a debug combination.

/**
 * The debug combinations from the Java Edition controls list, keyed by KeyboardEvent.code.
 *
 * Vanilla's `key.debug.*` set, minus the ones with nothing to act on in a browser build: there is no
 * resource pack stack to dump (F3+S), no profiling archive to write (F3+L), no improved-transparency
 * renderer to switch (F3+X) and no profiler/FPS/TPS graph to toggle (F3+1..4). F3+F6 opens a debug options
 * screen that this build does not have either.
 */
export const DEBUG_COMBOS = {
  KeyA: 'reloadChunks',
  KeyB: 'toggleHitboxes',
  KeyC: 'copyLocation',
  KeyD: 'clearChat',
  KeyG: 'toggleChunkBorders',
  KeyH: 'toggleAdvancedTooltips',
  KeyI: 'copyBlockData',
  KeyN: 'cycleGameMode',
  KeyP: 'toggleFocusPause',
  KeyT: 'reloadResources',
  KeyV: 'dumpVersionInfo',
};

/** The Game method a debug combination runs, or null when the key is not part of the set. */
export function debugActionFor(code) {
  return Object.prototype.hasOwnProperty.call(DEBUG_COMBOS, code) ? DEBUG_COMBOS[code] : null;
}

/** Is the event aimed at a text field, where the game must not steal the keystroke? */
export function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable === true;
}

/**
 * Bind the interface hotkeys.
 *
 * @param {object} game the Game, which owns one method per action
 * @param {{window?: object, document?: object}} [env] injectable for tests
 * @returns {() => void} a function that removes the listeners again
 */
export function installHotkeys(game, { window: win = globalThis.window, document: doc = globalThis.document } = {}) {
  if (!win || !doc) return () => {};

  // F3 is a modifier for the combos above; ui.js still owns F3 on its own as the overlay toggle.
  let debugHeld = false;

  const run = (action) => {
    const fn = game?.[action];
    if (typeof fn === 'function') fn.call(game);
  };

  const onKeyDown = (e) => {
    if (e.code === 'F3') {
      debugHeld = true;
      return;
    }
    if (isTypingTarget(e.target)) return;

    if (debugHeld) {
      const action = debugActionFor(e.code);
      if (action) {
        e.preventDefault();
        run(action);
        return;
      }
    }

    // F1, F2 and F11 work whatever else is open, as they do in vanilla.
    if (e.code === 'F1') {
      e.preventDefault();
      run('toggleHud');
      return;
    }
    if (e.code === 'F2') {
      e.preventDefault();
      run('captureScreenshot');
      return;
    }
    if (e.code === 'F11') {
      e.preventDefault();
      run('toggleFullscreen');
      return;
    }
    if (e.code === 'KeyB' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run('toggleNarrator');
    }
  };

  const onKeyUp = (e) => {
    if (e.code === 'F3') debugHeld = false;
  };

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  return () => {
    win.removeEventListener('keydown', onKeyDown);
    win.removeEventListener('keyup', onKeyUp);
  };
}
