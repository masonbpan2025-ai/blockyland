// Real-browser frame profile of a water scene: per-frame work, GPU-synced render time, draw calls, and the
// hottest JavaScript functions from a CPU profile.
//
//   npx vite --config e2e/fixtures/vite.water.config.js   (in another terminal)
//   node scripts/profile-water.mjs [http://127.0.0.1:3022] [--output docs/artifacts/water-profile.json] [--frames 180]
//
// Measures the game's own `animate` loop rather than a reimplementation of it: every frame's simulation, UI and
// render cost is inside the measured call. A 1x1 `readPixels` after each frame waits for the GPU, so the figure
// is CPU plus GPU work rather than only the time to queue draw calls.
import { chromium } from '@playwright/test';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const url = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:3022';
const output = arg('--output', null);
const frames = Number(arg('--frames', 180));

export async function profileWater({ url, frames = 180, headless = true, scenarios = null } = {}) {
  const browser = await chromium.launch({
    channel: 'chrome', headless,
    args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--no-proxy-server', '--proxy-bypass-list=*'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.routeWebSocket('**/*', (socket) => socket.close());
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      // The graphics settings are pinned, so the figures compare across commits whatever the defaults are: Performance
      // Mode off and 8 chunks, as the game drew when the budgets and baseline were set. A fresh browser otherwise takes
      // the defaults, and when those became Performance Mode on and 4 chunks, the plain frame lost its edge smoothing
      // and the shader-to-plain ratio moved with no change to the water renderer.
      try {
        localStorage.setItem('blockyland-performance-mode', 'off');
        localStorage.setItem('blockyland-render-distance', '8');
      } catch { /* storage blocked: the defaults apply */ }
      let state = 4242;
      Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x100000000; };
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForFunction(() => window.game?.heldItemRenderer && window.game?.shader, null, { timeout: 180000 });
    const setup = await page.evaluate(async () => {
      const g = window.game;
      const gl = g.renderer.getContext();
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      g.applyWorldSettings({ gameMode: 'creative' });
      g.world.reseed(12345, 'warm_ocean');
      await g.generateNewWorld();
      document.getElementById('start-overlay').style.display = 'none';
      return { gpu: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), seaLevel: g.world.seaLevel };
    });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });

    const results = [];
    const list = scenarios ?? [
      { name: 'surface', shader: false, dy: 3, pitch: -0.45 },
      { name: 'surface', shader: true, dy: 3, pitch: -0.45 },
      { name: 'underwater', shader: false, dy: -4, pitch: -0.1 },
      { name: 'underwater', shader: true, dy: -4, pitch: -0.1 },
    ];
    for (const scenario of list) {
      await page.evaluate(async ({ scenario, frames }) => {
        const g = window.game;
        g.shader.setEnabled(scenario.shader, false);
        g.player.isFlying = true;
        g.player.position.set(8.5, g.world.seaLevel + scenario.dy, 8.5);
        g.player.velocity.set(0, 0, 0);
        g.player.yaw = 0.6; g.player.pitch = scenario.pitch;
        // Let streaming and meshing settle, so the measured frames are steady-state rather than the load.
        for (let i = 0; i < 90; i++) await new Promise(requestAnimationFrame);
        const gl = g.renderer.getContext();
        const pixel = new Uint8Array(4);
        const proto = Object.getPrototypeOf(g);
        const original = proto.animate;
        const work = [], calls = [], triangles = [];
        window.__frameDone = new Promise((resolve) => {
          let n = 0;
          g.animate = function () {
            const t0 = performance.now();
            // Count every pass of the frame, not only the last render call.
            g.renderer.info.autoReset = false;
            g.renderer.info.reset();
            original.call(this);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            work.push(performance.now() - t0);
            calls.push(g.renderer.info.render.calls);
            triangles.push(g.renderer.info.render.triangles);
            if (++n >= frames) { g.animate = original; g.renderer.info.autoReset = true; resolve(); }
          };
        });
        window.__frameStats = { work, calls, triangles, scenario };
      }, { scenario, frames });
      await cdp.send('Profiler.start');
      await page.evaluate(() => window.__frameDone);
      const { profile } = await cdp.send('Profiler.stop');
      const stats = await page.evaluate(() => {
        const { work, calls, triangles, scenario } = window.__frameStats;
        const s = (v) => { const a = v.slice(20).sort((x, y) => x - y); const sum = a.reduce((p, q) => p + q, 0);
          return { n: a.length, mean: sum / (a.length || 1), p50: a[Math.floor(a.length * 0.5)] ?? 0, p95: a[Math.floor(a.length * 0.95)] ?? 0, max: a.at(-1) ?? 0 }; };
        return { scenario, workMs: s(work), drawCalls: s(calls), triangles: s(triangles), underwater: window.game.isUnderwater };
      });
      // Self time per function, from the sampled profile.
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const self = new Map();
      const dt = profile.timeDeltas;
      for (let i = 0; i < profile.samples.length; i++) {
        const node = byId.get(profile.samples[i]);
        const f = node.callFrame;
        const key = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|node_modules)\//, '$1/')}:${f.lineNumber + 1}`;
        self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
      }
      const total = [...self.values()].reduce((a, b) => a + b, 0);
      const hot = [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k))
        .sort((a, b) => b[1] - a[1]).slice(0, 25)
        .map(([fn, ms]) => ({ fn, ms: Math.round(ms * 10) / 10, pct: Math.round((ms / total) * 1000) / 10 }));
      const gc = [...self.entries()].filter(([k]) => k.startsWith('(garbage collector)')).reduce((a, [, v]) => a + v, 0);
      // Who calls the hottest library functions: the chain of callers above each sample of them, so a hot
      // three.js internal can be traced back to the game code that triggers it.
      const parent = new Map();
      for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
      const chains = new Map();
      const watch = new Set(['getParameters', 'getProgram', 'intersectsObject', 'updateMatrix', 'readPixels']);
      for (let i = 0; i < profile.samples.length; i++) {
        let node = byId.get(profile.samples[i]);
        if (!watch.has(node.callFrame.functionName)) continue;
        const names = [];
        let id = node.id;
        for (let depth = 0; depth < 9 && id !== undefined; depth++) {
          const f = byId.get(id).callFrame;
          names.push(`${f.functionName || '(anon)'}@${f.url.replace(/^.*\/(src|node_modules)\//, '$1/').replace(/\?.*$/, '')}:${f.lineNumber + 1}`);
          id = parent.get(id);
        }
        const key = names.join(' < ');
        chains.set(key, (chains.get(key) ?? 0) + (dt[i] ?? 0) / 1000);
      }
      const callers = [...chains.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([chain, ms]) => ({ ms: Math.round(ms), chain }));
      results.push({ ...stats, gcMs: Math.round(gc), profiledMs: Math.round(total), hot, callers });
    }
    return { url, gpu: setup.gpu, frames, results, errors };
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1:')}` || process.argv[1]?.endsWith('profile-water.mjs')) {
  const report = await profileWater({ url, frames });
  const json = JSON.stringify(report, null, 2);
  if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, json + '\n'); }
  console.log(json);
}
