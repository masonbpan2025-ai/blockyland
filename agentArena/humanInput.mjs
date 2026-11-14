// The hands of an arena player: everything a strategy asks for becomes the key presses, mouse buttons, mouse motion and
// screen clicks a person at a keyboard would make, and none of it happens at once.
//
// The limits (agentArena/docs/agent-rules.md, "Controls and reaction time"), the same for every player:
//   - reaction: each command takes effect `reactionMs` plus a random 0..`jitterMs` after the strategy issued it (a
//     person's simple reaction time is about 200-250 ms); commands keep their order;
//   - clicking: a mouse button is pressed at most once every `minClickGapMs` (10 clicks a second, a fast clicker);
//   - screens: a slot or shop button is clicked at most once every `minScreenClickGapMs` (moving the cursor there);
//   - turning: the view turns toward where the strategy wants to look at no more than `maxTurnDegPerSec`;
//   - typing: chat is typed at `typingCharsPerSec`.
// Pure: a clock, a random source and an executor (match.mjs's Playwright one, or a test's) are given to it.

export const HUMAN_LIMITS = Object.freeze({
  reactionMs: 200,
  jitterMs: 80,
  minClickGapMs: 100,
  minScreenClickGapMs: 150,
  maxTurnDegPerSec: 900,
  typingCharsPerSec: 12,
  tapMs: 60,
});

/** The game's mouse: one pixel of motion turns the view by this many radians (src/player.js sensitivity). */
export const RADIANS_PER_PIXEL = 0.0022;

/** The keys a strategy may hold, by name, and the keyboard codes the game reads (src/player.js). */
export const KEYS = Object.freeze({
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
});

const MAX_PITCH = Math.PI / 2 - 0.01;
const wrap = (a) => { let r = a % (2 * Math.PI); if (r > Math.PI) r -= 2 * Math.PI; if (r < -Math.PI) r += 2 * Math.PI; return r; };
const clampPitch = (p) => Math.max(-MAX_PITCH, Math.min(MAX_PITCH, p));

/** The yaw and pitch that look from `eye` at `point`, in the game's convention: forward is (-sin yaw, 0, -cos yaw). */
export function anglesTo(eye, point) {
  const dx = point.x - eye.x, dy = point.y - eye.y, dz = point.z - eye.z;
  return { yaw: Math.atan2(-dx, -dz), pitch: clampPitch(Math.atan2(dy, Math.hypot(dx, dz))) };
}

export class HumanInput {
  /**
   * @param {object} o
   * @param {{key(code:string,down:boolean):any, mouse(button:'left'|'right',down:boolean):any, look(dx:number,dy:number):any,
   *          slot(id:string,opts:{button:string,shift:boolean}):any, close():any, chat(text:string,charDelayMs:number):any}} o.executor
   * @param {() => number} [o.clock] milliseconds
   * @param {() => number} [o.random] in [0, 1)
   * @param {Partial<typeof HUMAN_LIMITS>} [o.limits]
   * @param {(entry: object) => void} [o.onExecuted] every input as it happens, for the recording
   */
  constructor({ executor, clock = () => performance.now(), random = Math.random, limits = {}, onExecuted = null }) {
    this.executor = executor;
    this.clock = clock;
    this.random = random;
    this.limits = { ...HUMAN_LIMITS, ...limits };
    this.onExecuted = onExecuted;
    this.queue = [];
    this.lastDue = 0;
    /** What the strategy has asked to be held, counting commands still queued: so repeats are not queued again. */
    this.wantKeys = Object.fromEntries(Object.keys(KEYS).map((k) => [k, false]));
    this.wantButtons = { left: false, right: false };
    /** What is held now, on the keyboard and the mouse. */
    this.keys = { ...this.wantKeys };
    this.buttons = { left: false, right: false };
    this.lastPress = { left: -Infinity, right: -Infinity };
    this.lastScreenClick = -Infinity;
    /** The view: where it points (refreshed from the game every tick) and where the strategy wants it. */
    this.yaw = 0; this.pitch = 0; this.target = null; this.targetAt = 0;
    this.pixelCarry = { x: 0, y: 0 };
    this.lastPump = null;
    this.busyUntil = 0;
    this.executed = 0;
    this.errors = [];
  }

  reaction() { return this.limits.reactionMs + this.random() * this.limits.jitterMs; }

  /** Queue one input to happen after a reaction time, never before anything queued earlier. */
  push(cmd, extraMs = 0) {
    const now = this.clock();
    const due = Math.max(now + this.reaction() + extraMs, this.lastDue);
    this.lastDue = due;
    this.queue.push({ ...cmd, issuedAt: now, due });
  }

  /** Where the game says the view points now. */
  observe(yaw, pitch) {
    if (Number.isFinite(yaw)) this.yaw = yaw;
    if (Number.isFinite(pitch)) this.pitch = pitch;
  }

  // --- what a strategy can ask for (input.* in agentArena/docs/strategy-api.md) ------------------------------------------

  /** Hold or release movement keys: { forward, back, left, right, jump, sneak, sprint }; keys not named stay as they are. */
  move(keys = {}) {
    for (const [name, value] of Object.entries(keys)) {
      if (!(name in KEYS)) throw new Error(`unknown key "${name}" (keys: ${Object.keys(KEYS).join(', ')})`);
      const down = Boolean(value);
      if (this.wantKeys[name] === down) continue;
      this.wantKeys[name] = down;
      this.push({ type: 'key', key: name, down });
    }
  }

  /** Let go of every movement key. */
  stop() { this.move(Object.fromEntries(Object.keys(KEYS).map((k) => [k, false]))); }

  /** Press a key once (jump, hotbar digits, Q, E, F) and let go. */
  tap(code) {
    this.push({ type: 'tap', code });
  }

  jump() { if (!this.wantKeys.jump) this.tap(KEYS.jump); }
  hotbar(slot) {
    const n = Math.floor(Number(slot));
    if (!(n >= 0 && n <= 8)) throw new Error('hotbar slot must be 0..8');
    this.tap(`Digit${n + 1}`);
  }
  drop() { this.tap('KeyQ'); }
  swapHands() { this.tap('KeyF'); }
  openInventory() { this.tap('KeyE'); }
  closeScreen() { this.push({ type: 'close' }); }

  /** Turn to this yaw and pitch (radians, the game's convention). */
  look(yaw, pitch) {
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) throw new Error('look needs finite yaw and pitch');
    this.push({ type: 'look', yaw: wrap(yaw), pitch: clampPitch(pitch) });
  }

  /** Turn by this much from where the view is heading. */
  turn(dyaw, dpitch = 0) {
    const base = this.target ?? { yaw: this.yaw, pitch: this.pitch };
    this.look(base.yaw + dyaw, base.pitch + dpitch);
  }

  lookAt(eye, point) { const a = anglesTo(eye, point); this.look(a.yaw, a.pitch); }

  /** One click of a mouse button (attack/break with left, use/place with right). */
  click(button = 'left') {
    if (button !== 'left' && button !== 'right') throw new Error('button is left or right');
    this.push({ type: 'click', button });
  }

  /** Hold a mouse button down (mining, eating, drawing a bow, blocking) or let it go. */
  hold(button, down) {
    if (button !== 'left' && button !== 'right') throw new Error('button is left or right');
    const d = Boolean(down);
    if (this.wantButtons[button] === d) return;
    this.wantButtons[button] = d;
    this.push({ type: 'button', button, down: d });
  }

  /** Click a slot or button on the open screen ('chest:3', 'inv:12', 'hotbar:0', 'armor:head', 'offer:2', 'tab:Melee'). */
  clickSlot(id, { button = 'left', shift = false } = {}) {
    this.push({ type: 'slot', id: String(id), button: button === 'right' ? 'right' : 'left', shift: Boolean(shift) });
  }

  chat(text) {
    const clean = String(text ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    if (clean) this.push({ type: 'chat', text: clean });
  }

  /** The commands not yet carried out. */
  pending() { return this.queue.length; }

  /** Forget everything queued and let go of everything held (a strategy reload or the end of the match). */
  async releaseAll() {
    this.queue = [];
    this.target = null;
    for (const name of Object.keys(KEYS)) { this.wantKeys[name] = false; if (this.keys[name]) await this.#exec({ type: 'key', key: name, down: false }); }
    for (const b of ['left', 'right']) { this.wantButtons[b] = false; if (this.buttons[b]) await this.#exec({ type: 'button', button: b, down: false }); }
  }

  // --- carrying it out --------------------------------------------------------------------------------------------

  /** Carry out what is due, and move the mouse toward the look target. Call often (every frame or so). */
  async pump() {
    const now = this.clock();
    const dt = this.lastPump === null ? 0 : Math.min(0.1, (now - this.lastPump) / 1000);
    this.lastPump = now;
    while (this.queue.length && this.queue[0].due <= now && now >= this.busyUntil) {
      const cmd = this.queue.shift();
      await this.#run(cmd, now);
    }
    // Turning time counts from when the look began, not from the previous pump.
    const turnDt = Math.min(dt, Math.max(0, (now - this.targetAt) / 1000));
    if (this.target && turnDt > 0) await this.#turnToward(turnDt);
  }

  async #run(cmd, now) {
    switch (cmd.type) {
      case 'look':
        if (!this.target) this.targetAt = now;
        this.target = { yaw: cmd.yaw, pitch: cmd.pitch };
        this.onExecuted?.({ ...cmd, at: now });
        return;
      case 'click': {
        const wait = this.lastPress[cmd.button] + this.limits.minClickGapMs - now;
        if (wait > 0) { this.queue.unshift({ ...cmd, due: now + wait }); this.busyUntil = now + wait; return; }
        this.lastPress[cmd.button] = now;
        await this.#exec({ type: 'button', button: cmd.button, down: true });
        // The release follows a short tap later, ahead of anything queued after the click.
        this.queue.unshift({ type: 'button', button: cmd.button, down: false, due: now + this.limits.tapMs, internal: true });
        this.busyUntil = now + this.limits.tapMs;
        return;
      }
      case 'button': {
        if (cmd.down) {
          const wait = this.lastPress[cmd.button] + this.limits.minClickGapMs - now;
          if (wait > 0) { this.queue.unshift({ ...cmd, due: now + wait }); this.busyUntil = now + wait; return; }
          this.lastPress[cmd.button] = now;
        }
        await this.#exec(cmd);
        return;
      }
      case 'tap':
        await this.#exec({ type: 'keycode', code: cmd.code, down: true });
        this.queue.unshift({ type: 'keycode', code: cmd.code, down: false, due: now + this.limits.tapMs, internal: true });
        this.busyUntil = now + this.limits.tapMs;
        return;
      case 'slot': {
        const wait = this.lastScreenClick + this.limits.minScreenClickGapMs - now;
        if (wait > 0) { this.queue.unshift({ ...cmd, due: now + wait }); this.busyUntil = now + wait; return; }
        this.lastScreenClick = now;
        await this.#exec(cmd);
        return;
      }
      case 'chat': {
        const perChar = 1000 / this.limits.typingCharsPerSec;
        await this.#exec({ ...cmd, charDelayMs: perChar });
        return;
      }
      default:
        await this.#exec(cmd);
    }
  }

  async #exec(cmd) {
    const at = this.clock();
    try {
      switch (cmd.type) {
        case 'key': await this.executor.key(KEYS[cmd.key], cmd.down); this.keys[cmd.key] = cmd.down; break;
        case 'keycode': await this.executor.key(cmd.code, cmd.down); break;
        case 'button': await this.executor.mouse(cmd.button, cmd.down); this.buttons[cmd.button] = cmd.down; break;
        case 'slot': await this.executor.slot(cmd.id, { button: cmd.button, shift: cmd.shift }); break;
        case 'close': await this.executor.close(); break;
        case 'chat': await this.executor.chat(cmd.text, cmd.charDelayMs); break;
        case 'mouseMove': await this.executor.look(cmd.dx, cmd.dy); break;
        default: throw new Error(`unknown input ${cmd.type}`);
      }
      this.executed++;
      if (cmd.type !== 'mouseMove') this.onExecuted?.({ ...cmd, at });
    } catch (err) {
      this.errors.push({ at, cmd: cmd.type, message: String(err?.message ?? err).slice(0, 200) });
      if (this.errors.length > 50) this.errors.shift();
      this.onExecuted?.({ ...cmd, at, error: String(err?.message ?? err).slice(0, 200) });
    }
  }

  /** Move the mouse toward the target at no more than the turning limit; whole pixels, the rest carried over. */
  async #turnToward(dt) {
    const maxStep = (this.limits.maxTurnDegPerSec * Math.PI / 180) * dt;
    const dyaw = wrap(this.target.yaw - this.yaw);
    const dpitch = this.target.pitch - this.pitch;
    const dist = Math.hypot(dyaw, dpitch);
    if (dist < RADIANS_PER_PIXEL / 2) { this.target = null; return; }
    const k = dist > maxStep ? maxStep / dist : 1;
    // The game turns yaw by -dx * sensitivity and pitch by -dy * sensitivity.
    const px = -(dyaw * k) / RADIANS_PER_PIXEL + this.pixelCarry.x;
    const py = -(dpitch * k) / RADIANS_PER_PIXEL + this.pixelCarry.y;
    const dx = Math.round(px), dy = Math.round(py);
    this.pixelCarry = { x: px - dx, y: py - dy };
    if (dx === 0 && dy === 0) { if (k === 1) this.target = null; return; }
    await this.#exec({ type: 'mouseMove', dx, dy });
    this.yaw = wrap(this.yaw - dx * RADIANS_PER_PIXEL);
    this.pitch = clampPitch(this.pitch - dy * RADIANS_PER_PIXEL);
  }
}

/** Turn a strategy command into the player's hands' terms. Unknown or malformed commands are reported, not run. */
export function applyCommand(input, cmd, view) {
  switch (cmd.type) {
    case 'move': return input.move(cmd.keys);
    case 'stop': return input.stop();
    case 'jump': return input.jump();
    case 'look': return input.look(cmd.yaw, cmd.pitch);
    case 'turn': return input.turn(cmd.dyaw, cmd.dpitch);
    case 'lookAt': return input.lookAt(view.me.eye, { x: cmd.x, y: cmd.y, z: cmd.z });
    case 'click': return input.click(cmd.button);
    case 'hold': return input.hold(cmd.button, cmd.down);
    case 'hotbar': return input.hotbar(cmd.slot);
    case 'drop': return input.drop();
    case 'swapHands': return input.swapHands();
    case 'openInventory': return input.openInventory();
    case 'closeScreen': return input.closeScreen();
    case 'slot': return input.clickSlot(cmd.id, { button: cmd.button, shift: cmd.shift });
    case 'chat': return input.chat(cmd.text);
    default: throw new Error(`unknown command ${cmd.type}`);
  }
}

