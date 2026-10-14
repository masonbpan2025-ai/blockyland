// The two decisions that keep the mouse and the pointer lock in step with the game.
//
// Escape is the case that matters. Browsers take Escape for themselves while the pointer is locked: the lock is
// released and the page is NOT sent a keydown. So the game never saw the key, the pause menu never opened, and
// the player was left unlocked but still in the game -- and the look code kept turning the view on any mouse
// movement over the canvas. Losing the lock is therefore the signal to pause, and the camera may turn only while
// the pointer is locked, or while a button is held to drag it.

/**
 * May the mouse turn the camera right now?
 *
 * @param {object} state
 * @param {boolean} state.locked the pointer is captured by the game
 * @param {boolean} state.buttonHeld a mouse button is down (dragging to look without the lock)
 * @param {boolean} state.controlsDisabled a menu, chat or the terminal owns the input
 */
export function cameraTurnAllowed({ locked = false, buttonHeld = false, controlsDisabled = false } = {}) {
  if (controlsDisabled) return false;
  return Boolean(locked || buttonHeld);
}

/**
 * Should losing the pointer lock open the pause menu?
 *
 * Only when a world is running and nothing else is open. A lock released by a modal (the inventory, a chest) or
 * by the pause menu itself is already accounted for, so it must not open a second menu.
 *
 * @param {object} state
 */
export function shouldPauseOnLockLoss({
  worldReady = false,
  phase = 'idle',
  dead = false,
  sleeping = false,
  modalOpen = false,
  chatOpen = false,
  geminiOpen = false,
} = {}) {
  if (!worldReady || phase !== 'ready') return false;
  if (dead || sleeping) return false;
  return !(modalOpen || chatOpen || geminiOpen);
}
