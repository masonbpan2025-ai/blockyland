import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { appendFileSync, mkdirSync } from 'node:fs';

// Groups of scenarios, one module each under e2e/fixtures/tutorialScenarios/. Run a subset with
// TUTORIALS=<group or scenario id prefix>[,...].
const GROUPS = ['probe', 'newcomer', 'shelters', 'general', 'mining', 'food', 'combat', 'smelting', 'stations', 'redstone', 'mechanisms', 'farms', 'dimensions', 'challenges', 'construction', 'nonstandard'];
const wanted = (process.env.TUTORIALS || '').split(',').map((s) => s.trim()).filter(Boolean);

for (const group of GROUPS) {
  test(`wiki tutorials: ${group}`, async ({ page }, testInfo) => {
    const exists = await fs.access(`e2e/fixtures/tutorialScenarios/${group}.js`).then(() => true, () => false);
    test.skip(!exists, 'no scenarios yet');
    test.skip(group === 'probe' && !wanted.some((w) => w.startsWith('probe')), 'diagnostics run only when asked for');
    const ids = wanted.filter((w) => w !== group);
    test.skip(wanted.length > 0 && !wanted.includes(group) && !ids.some((id) => id.startsWith(group + '.')), 'not selected');
    page.on('pageerror', (e) => console.log('[page error]', e.message));
    // A runaway scenario must not flood the disk or the runner's memory: the log stops at 5000 lines a group.
    let lines = 0;
    page.on('console', (m) => { const x = m.text(); if (m.type() === 'error') console.log('[console]', x.slice(0, 300)); else if ((x.startsWith('[playtest]') || x.startsWith('[check]')) && ++lines <= 5000) { console.log(x.slice(0, 400)); try { mkdirSync('test-results', { recursive: true }); appendFileSync('test-results/tutorial-progress.log', `${group} ${x.slice(0, 600)}\n`); } catch {} } });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const ready = () => page.waitForFunction(() => window.game?.playerBot && window.game?.ui?.openBiomeModal && window.game?.bedManager, null, { timeout: 90000 });
    // Vite answers "504 Outdated Optimize Dep" once after it re-bundles dependencies; a reload picks up the new bundle.
    try { await ready(); } catch { await page.reload({ waitUntil: 'domcontentloaded' }); await ready(); }
    const reports = await page.evaluate(async ({ group, ids }) => {
      const { runScenarios } = await import('/e2e/fixtures/tutorialPlaytest.js');
      const { SCENARIOS } = await import(`/e2e/fixtures/tutorialScenarios/${group}.js`);
      return runScenarios(window.game, SCENARIOS, ids.filter((id) => id.startsWith(group + '.')));
    }, { group, ids });
    await fs.mkdir('docs/artifacts/tutorial-playtest', { recursive: true });
    await fs.writeFile(`docs/artifacts/tutorial-playtest/${group}.json`, JSON.stringify(reports, null, 2));
    await testInfo.attach(group, { body: JSON.stringify(reports, null, 2), contentType: 'application/json' });
    const unexpected = [];
    for (const r of reports) {
      console.log(`${r.failed || r.error ? 'FAIL' : 'pass'} ${r.id} (${r.passed}/${r.passed + r.failed} checks, ${r.simulatedSeconds}s simulated, ${r.ms}ms)`);
      if (r.error) { console.log('   error:', r.error); unexpected.push(`${r.id}: ${r.error.split('\n')[0]}`); }
      for (const c of r.checks.filter((c) => !c.ok)) {
        console.log(`   x ${c.name}: observed ${JSON.stringify(c.observed)} expected ${JSON.stringify(c.expected)}${c.known ? ' [known: ' + c.known + ']' : ''}`);
        if (!c.known) unexpected.push(`${r.id}: ${c.name}`);
      }
      for (const n of r.notes) console.log('   note:', n);
    }
    expect(unexpected).toEqual([]);
  });
}
