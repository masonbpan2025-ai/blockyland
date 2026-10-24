// Frame-cost regression test for the water work, measured in a real browser on the real GPU.
//
// It runs `scripts/profile-water.mjs`: the game's own animate loop on a generated warm ocean, at the surface and
// under water, with the Lightweight Shader off and on, and a 1x1 readPixels after each frame so GPU work counts.
//
// Two kinds of check:
//   - Against the recorded baseline (docs/artifacts/water-profile-before.json) when the GPU is the same one the
//     baseline was taken on: no scenario may be more than 10% slower at the median. The baseline was re-recorded on
//     2026-10-23, with the profiler's graphics settings pinned (Performance Mode off, 8 chunks). The first one, from
//     before the water work, no longer described the game: by then defbe3a ran the same scenes 2-3x slower than it
//     recorded (other content had changed the scene), and the chunk batching after defbe3a ran them 1.4-2.7x faster
//     than defbe3a. Re-record it the same way when the scene changes on purpose.
//   - Budgets that hold on any machine: the second water render and the refraction copy must not double the frame,
//     no material may be rebuilding its program every frame, and draw calls stay bounded.
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { profileWater } from '../scripts/profile-water.mjs';

const BASELINE = 'docs/artifacts/water-profile-before.json';

test('the water renderer is no slower than the game before it, and stays inside its budgets', async ({}, testInfo) => {
  test.setTimeout(900000);
  const url = testInfo.project.use.baseURL;
  const report = await profileWater({ url, frames: 150 });
  mkdirSync('docs/artifacts', { recursive: true });
  writeFileSync('docs/artifacts/water-profile-latest.json', JSON.stringify(report, null, 2) + '\n');

  expect(report.errors, 'the profiled page raised no errors').toEqual([]);
  const key = (s) => `${s.scenario.name}/${s.scenario.shader ? 'shader' : 'plain'}`;
  const now = Object.fromEntries(report.results.map((s) => [key(s), s]));

  // --- budgets that hold anywhere ---------------------------------------------------
  for (const s of report.results) {
    const perFrame = (name) => (s.hot.find((h) => h.fn.startsWith(name))?.ms ?? 0) / (s.workMs.n + 20);
    expect(perFrame('getParameters'), `${key(s)}: no material rebuilds its program every frame`).toBeLessThan(0.3);
    expect(s.drawCalls.p50, `${key(s)}: draw calls stay bounded`).toBeLessThan(2000);
  }
  for (const place of ['surface', 'underwater']) {
    const plain = now[`${place}/plain`].workMs.p50;
    const shader = now[`${place}/shader`].workMs.p50;
    expect(shader / plain, `${place}: the shader path costs less than twice the plain one (${shader.toFixed(1)} vs ${plain.toFixed(1)} ms)`).toBeLessThan(2.0);
  }

  // --- against the game before this work ---------------------------------------------
  if (!existsSync(BASELINE)) {
    testInfo.annotations.push({ type: 'baseline', description: 'no baseline recorded; budgets only' });
    return;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  if (baseline.gpu !== report.gpu) {
    testInfo.annotations.push({ type: 'baseline', description: `baseline GPU "${baseline.gpu}" is not this GPU "${report.gpu}"; budgets only` });
    return;
  }
  for (const before of baseline.results) {
    const after = now[key(before)];
    expect(after, `${key(before)} was measured`).toBeTruthy();
    const limit = before.workMs.p50 * 1.10;
    expect(after.workMs.p50, `${key(before)}: median frame ${after.workMs.p50.toFixed(1)} ms against ${before.workMs.p50.toFixed(1)} ms before`).toBeLessThanOrEqual(limit);
  }
});
