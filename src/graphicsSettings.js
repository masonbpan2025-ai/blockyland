/**
 * Player-chosen graphics settings that trade looks for frame rate: Performance Mode and the render distance.
 *
 * Measured on an Intel Iris Xe laptop at 150% display scaling (the frame is GPU-bound there: about two thirds of it
 * is drawing):
 *   - Performance Mode -- the canvas at 1x the CSS size rather than up to 1.25x, and no edge-smoothing pass -- took the
 *     median frame from 57 to 48ms and the slowest 5% from 91 to 66ms.
 *   - Render distance 6 instead of 8 took it from 62 to 44ms. The fog follows the distance (atmosphere.js), so the
 *     world still fades out at its edge rather than ending in a wall.
 *
 * Both are kept in localStorage, like the Lightweight Shader's switch. A player who has not chosen gets the fast
 * settings: Performance Mode on and 4 chunks.
 */
export const PERFORMANCE_STORAGE_KEY = 'blockyland-performance-mode';
export const RENDER_DISTANCE_STORAGE_KEY = 'blockyland-render-distance';
export const RENDER_DISTANCES = Object.freeze([4, 6, 8, 10]);
export const DEFAULT_RENDER_DISTANCE = 4;
/** The canvas resolution cap outside Performance Mode, as main.js always set it. */
export const FULL_PIXEL_RATIO = 1.25;

function read(storage, key) {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function write(storage, key, value) {
  try { storage?.setItem(key, value); } catch { /* private window or blocked storage: the choice lasts this session */ }
}

/** The render distance the player chose last time, or the default. */
export function savedRenderDistance(storage = globalThis.localStorage) {
  const saved = Number(read(storage, RENDER_DISTANCE_STORAGE_KEY));
  return RENDER_DISTANCES.includes(saved) ? saved : DEFAULT_RENDER_DISTANCE;
}

/** The distance after `current` in the cycle the button steps through. */
export function nextRenderDistance(current) {
  const at = RENDER_DISTANCES.indexOf(current);
  return RENDER_DISTANCES[(at + 1) % RENDER_DISTANCES.length];
}

export class GraphicsSettings {
  /**
   * @param {object} game  the Game: its renderer, shader, streamer and `renderDistance`
   */
  constructor(game, { storage = globalThis.localStorage } = {}) {
    this.game = game;
    this.storage = storage;
    this.performanceMode = read(storage, PERFORMANCE_STORAGE_KEY) !== 'off';
    this.performanceButton = null;
    this.distanceButton = null;
  }

  /** Put the saved choices into effect. Called once the renderer and shader exist. */
  apply() {
    this.setPerformanceMode(this.performanceMode, false);
    this.updateButtons();
  }

  setPerformanceMode(on, persist = true) {
    this.performanceMode = !!on;
    const { renderer, shader } = this.game;
    const deviceRatio = globalThis.devicePixelRatio || 1;
    // setPixelRatio resizes the drawing buffer itself; the shader's targets follow the new size on their next frame.
    renderer?.setPixelRatio(this.performanceMode ? 1 : Math.min(deviceRatio, FULL_PIXEL_RATIO));
    if (shader) shader.edgeAntialiasing = !this.performanceMode;
    if (persist) write(this.storage, PERFORMANCE_STORAGE_KEY, this.performanceMode ? 'on' : 'off');
    this.updateButtons();
  }

  setRenderDistance(chunks, persist = true) {
    this.game.setRenderDistance(chunks);
    if (persist) write(this.storage, RENDER_DISTANCE_STORAGE_KEY, String(this.game.renderDistance));
    this.updateButtons();
  }

  bindButtons(performanceButton, distanceButton) {
    this.performanceButton = performanceButton ?? null;
    this.distanceButton = distanceButton ?? null;
    this.performanceButton?.addEventListener('click', () => this.setPerformanceMode(!this.performanceMode));
    this.distanceButton?.addEventListener('click', () => this.setRenderDistance(nextRenderDistance(this.game.renderDistance)));
    this.updateButtons();
  }

  updateButtons() {
    if (this.performanceButton) {
      this.performanceButton.textContent = `Performance Mode: ${this.performanceMode ? 'ON' : 'OFF'}`;
      this.performanceButton.setAttribute('aria-pressed', String(this.performanceMode));
    }
    if (this.distanceButton) this.distanceButton.textContent = `Render Distance: ${this.game.renderDistance} Chunks`;
  }
}
