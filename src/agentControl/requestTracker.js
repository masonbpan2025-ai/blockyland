// What the player's AI app is doing with their latest request, for the Agent Terminal's status line.
//
// The game sees every step: it hands the request over, runs each tool the AI app calls, and shows its answer. So it can
// say "sent", "working: building the Fence", and "done" without the AI app reporting anything. A request is done when:
//   - the AI app starts waiting for the next request (the server says so: `ai_waiting`), the clearest signal; or
//   - it answered (say) and then did nothing more for IDLE_DONE_MS, for an AI app that answers and stops without
//     waiting again (an interactive Claude Code session ends its turn that way).
// It is interrupted when the AI app disconnects first. Pure logic with an injectable clock, so it is tested directly.

export const IDLE_DONE_MS = 8000;
export const SLOW_PICKUP_MS = 30000;

/** What a tool call looks like to the player, in a few words. */
export function describeStep(tool, args = {}) {
  const plan = args.plan || {};
  const what = String(plan.name || plan.explanation || plan.buildingType || '').slice(0, 60);
  switch (tool) {
    case 'get_state': return 'checking where you are';
    case 'look_around': return 'looking around';
    case 'screenshot': return 'looking at your view';
    case 'plan_reference': return 'reading the building guide';
    case 'run_command': return `running ${String(args.command || '').slice(0, 60)}`;
    case 'say': return 'answering';
    case 'run_plan': {
      const verb = { destroy: 'removing', edit: 'changing', summon: 'summoning creatures', give: 'giving items', clear: 'clearing the ground', weather: 'changing the weather', time: 'changing the time', hang_paintings: 'hanging paintings', player_control: 'moving you', message: 'answering', multi: 'building' }[plan.action] || 'building';
      // Only a build, a removal or a change names its target ("building Cobblestone Watchtower").
      return what && ['building', 'removing', 'changing'].includes(verb) ? `${verb} ${what}` : verb;
    }
    default: return 'working';
  }
}

const seconds = ms => Math.max(0, Math.round(ms / 1000));
export function formatElapsed(ms) {
  const s = seconds(ms);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/**
 * States: 'idle' | 'sent' (waiting for the AI app to pick it up) | 'working' | 'done' | 'interrupted'.
 */
export class RequestTracker {
  constructor({ now = () => Date.now(), onChange = () => {} } = {}) {
    this.now = now;
    this.onChange = onChange;
    this.reset();
  }

  reset() {
    Object.assign(this, { state: 'idle', request: '', startedAt: 0, lastActivityAt: 0, answered: false, step: '', steps: 0, finishedAt: 0, slow: false, progress: null, runningTools: 0 });
  }

  get active() { return this.state === 'sent' || this.state === 'working'; }

  /** The player sent a request. */
  start(request) {
    this.reset();
    Object.assign(this, { state: 'sent', request: String(request), startedAt: this.now() });
    this.lastActivityAt = this.startedAt;
    this.#changed();
  }

  /** The AI app took the request off the queue. */
  pickedUp() {
    if (this.state !== 'sent') return;
    this.state = 'working';
    this.step = 'reading your request';
    this.lastActivityAt = this.now();
    this.#changed();
  }

  /** The AI app called a game tool (bridge.onToolCall). */
  toolCall(tool, args) {
    if (!this.active) return;
    this.state = 'working';
    this.answered = false;
    this.progress = null;
    this.runningTools += 1;
    this.step = describeStep(tool, args);
    this.steps += 1;
    this.lastActivityAt = this.now();
    this.#changed();
  }

  /** Real work progress persists until the next step, even when a frame or chunk takes seconds. */
  reportProgress(pct, message) {
    if (!this.active) return;
    this.state = 'working';
    this.answered = false;
    this.step = String(message || this.step || 'working').slice(0, 500);
    this.progress = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null;
    this.lastActivityAt = this.now();
    this.#changed();
  }

  toolResult(tool, ok) {
    if (!this.active) return;
    this.runningTools = Math.max(0, this.runningTools - 1);
    this.lastActivityAt = this.now();
    this.progress = null;
    if (tool === 'say' && ok) this.answered = true;
    if (!ok) this.step = 'reviewing a tool error';
    this.#changed();
  }

  /** The AI app is waiting for the next request: whatever it was doing is finished. */
  aiWaiting() {
    if (this.state === 'working' && !this.runningTools) this.#finish('done');
  }

  /** The AI app went away. */
  disconnected() {
    if (this.active) this.#finish('interrupted');
  }

  /** Call about once a second: notices an answered request going quiet, and a request nobody picks up. */
  tick() {
    const now = this.now();
    if (this.state === 'working' && this.answered && !this.runningTools && now - this.lastActivityAt >= IDLE_DONE_MS) {
      this.#finish('done');
    } else if (this.state === 'sent' && !this.slow && now - this.startedAt >= SLOW_PICKUP_MS) {
      this.slow = true;
      this.#changed();
    } else if (this.active) {
      this.#changed(); // the elapsed time moves on
    }
  }

  /** The status line: { state, icon, text, elapsed }. */
  view() {
    const elapsed = formatElapsed((this.finishedAt || this.now()) - this.startedAt);
    switch (this.state) {
      case 'sent':
        return { state: 'sent', icon: '⏳', elapsed, text: this.slow
          ? 'Your AI app has not picked up your request yet. If it is not waiting, ask it in the app to "wait for my requests in Blockyland".'
          : 'Sent to your AI app, waiting for it to pick it up…' };
      case 'working':
        return { state: 'working', icon: '⚙️', elapsed, progress: this.progress, text: `Working: ${this.step}…` };
      case 'done':
        return { state: 'done', icon: '✓', elapsed, text: `Done in ${elapsed}.` };
      case 'interrupted':
        return { state: 'interrupted', icon: '✗', elapsed, text: 'Your AI app disconnected before it finished. Anything already built stays.' };
      default:
        return { state: 'idle', icon: '', elapsed: '', text: '' };
    }
  }

  #finish(state) {
    this.state = state;
    this.finishedAt = this.now();
    this.#changed();
  }

  #changed() { this.onChange(this.view(), this); }
}
