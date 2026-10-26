// Eating takes time.
//
// Wiki (Food): eating is done by holding use, and finishes after the item's consumption time -- 32 game ticks (1.6 s)
// for most foods, 16 ticks (0.8 s) for dried kelp, 40 ticks (2 s) for a honey bottle ("Drinking a honey bottle takes
// 25% longer than eating other food"). Letting go, switching item or opening a screen stops it with nothing eaten, and
// the player moves at a fifth of their speed meanwhile, as when drawing a bow.
//
// It used to be instant: a click restored hunger at once, so a fight could be healed through mid-swing, which the
// Combat and Hunger management tutorials explicitly warn is not possible ("eating them takes a few seconds").

export const CONSUME_TICKS = { default: 32, dried_kelp: 16, honey_bottle: 40 };
export const consumeSeconds = (id) => (CONSUME_TICKS[id] ?? CONSUME_TICKS.default) / 20;
/** Movement while using an item (eating, drinking, drawing a bow): a fifth of normal speed. */
export const USING_ITEM_SPEED = 0.2;

export class EatingController {
  constructor(game) { this.game = game; this.cancel(); }

  get active() { return this.eating; }

  /**
   * Begin eating `item` (the held stack), or keep eating it: holding use calls this again, and a second call for the
   * same stack in the same slot continues the timer rather than restarting it.
   */
  start(item, { sound = null } = {}) {
    const g = this.game;
    if (this.eating && this.item === item && this.slot === g.inventory.activeSlot) return true;
    // `sound`: what plays while using it, the eating sound unless given (a potion is drunk, not eaten).
    this.item = item; this.slot = g.inventory.activeSlot; this.time = 0; this.soundTimer = 0; this.eating = true; this.sound = sound;
    if (g.player) g.player.usingItem = true;
    return true;
  }

  cancel() {
    this.eating = false; this.item = null; this.time = 0;
    if (this.game?.player) this.game.player.usingItem = false;
  }

  /** Letting go of use. */
  release() { if (this.eating) this.cancel(); }

  update(dt) {
    if (!this.eating) return;
    const g = this.game, held = g.inventory.getActiveItem();
    if (g.player?.isDead || held !== this.item || g.inventory.activeSlot !== this.slot || !held || held.count <= 0 || g.ui?.isModalOpen?.()) { this.cancel(); return; }
    this.time += Math.max(0, dt);
    this.soundTimer -= dt;
    if (this.soundTimer <= 0) { this.soundTimer = this.sound ? 0.4 : 0.2; if (this.sound) this.sound(); else g.sounds?.playEat?.(); }
    if (this.time < consumeSeconds(held.id)) return;
    const item = held;
    this.cancel();
    g.finishEating?.(item);
  }
}
