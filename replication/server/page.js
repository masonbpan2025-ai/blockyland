// The server page: builds the BlockylandServer and its client bridge, and runs the world in real time. Driven by
// replication/server/run.mjs (or a test) through the window functions below.
import { BlockylandServer } from './engine.js';
import { Bridge } from './bridge.js';
import { snapshot } from './saves.js';

window.snapshot = () => JSON.stringify(snapshot(window.server));

const params = new URLSearchParams(location.search);
const events = [];
window.serverEvents = events;

window.startServer = async ({ seed, difficulty, save = null } = {}) => {
  const server = new BlockylandServer({ seed: save?.seed ?? seed ?? Number(params.get('seed') ?? 20261103), difficulty: save?.difficulty ?? difficulty ?? 'easy', log: (kind, data) => events.push({ kind, t: server.ticks, ...data }) });
  await server.init({ save });
  window.server = server;
  window.bridge = new Bridge(server);
  document.getElementById('status').textContent = 'Ready';
  return { spawn: server.worldSpawn };
};

/** Run the world at 20 ticks a second of wall time; after a slow tick, catch up by at most five. */
let timer = null, lag = 0, last = 0;
window.startTicking = () => {
  if (timer) return;
  last = performance.now();
  timer = setInterval(() => {
    const now = performance.now();
    lag += now - last; last = now;
    let n = 0;
    while (lag >= 50 && n < 5) { window.server.tick(); lag -= 50; n++; }
    if (lag > 250) lag = 0; // too far behind: the world slows down rather than lurching
  }, 10);
};
window.stopTicking = () => { clearInterval(timer); timer = null; };
window.drainEvents = () => events.splice(0);
window.pageReady = true;
