// A mini-game's match keeps going while its tab is hidden. The host runs the match from the game's frame loop
// (requestAnimationFrame), which the browser stops in a background tab: the match froze -- its clock, the chest refills,
// the closing zone -- whenever the host looked away, though the bots and friends playing it went on. This ticks the
// match from a timer instead, but only while frames have stopped: a timer in a Web Worker, which the browser does not
// pause (a plain timer in a hidden tab runs at most once a second), or a plain one where there are no workers (Node).
//
//   const ticker = keepTicking((dt) => manager.update(dt), () => manager.lastUpdateAt);
//   ticker.stop();

const WORKER_SOURCE = 'let t = null; onmessage = (e) => { clearInterval(t); if (e.data > 0) t = setInterval(() => postMessage(0), e.data); };';

/**
 * Calls `update(dt)` every `intervalMs` while the page is hidden (`hidden()`) and the frame loop has not updated for
 * `stallMs` (`lastUpdateAt()` says when it last did, in ms of `now()`). dt is the time since the last update, at most
 * `maxDt` seconds.
 * @returns {{ stop(): void, tick(): void }} tick() runs one check now (tests).
 */
export function keepTicking(update, lastUpdateAt, { intervalMs = 100, stallMs = 300, maxDt = 0.25, now = () => (globalThis.performance?.now?.() ?? Date.now()), useWorker = true, hidden = () => globalThis.document?.hidden === true } = {}) {
  let worker = null, timer = null, stopped = false;
  const tick = () => {
    if (stopped || !hidden()) return;
    const t = now(), last = lastUpdateAt() ?? 0;
    if (t - last < stallMs) return;
    update(Math.min(maxDt, Math.max(0, (t - last) / 1000)));
  };
  if (useWorker && typeof Worker === 'function' && typeof Blob === 'function' && typeof URL?.createObjectURL === 'function') {
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      worker = new Worker(url);
      URL.revokeObjectURL(url);
      worker.onmessage = tick;
      worker.postMessage(intervalMs);
    } catch { worker = null; }
  }
  if (!worker) { timer = setInterval(tick, intervalMs); timer.unref?.(); }
  return {
    tick,
    stop() {
      stopped = true;
      if (worker) { try { worker.postMessage(0); worker.terminate(); } catch { /* gone */ } worker = null; }
      if (timer) { clearInterval(timer); timer = null; }
    },
  };
}
