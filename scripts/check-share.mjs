// Check that sharing works through a given address, with two real browsers: one hosts, one opens the link.
//
//   npm run share                              (in one terminal: the game and the introduction service)
//   node scripts/check-share.mjs http://localhost:8080
//   node scripts/check-share.mjs https://my-tunnel.example     (a public address: the real test of a deployment)
//
// It starts a world on the host, shares it, opens the link in a second browser, and checks that the second player joins,
// receives the world, and that a block placed by each side appears for the other. Prints what it found and exits
// non-zero if sharing does not work. Needs Chrome (the same one the browser tests use).
import { chromium } from '@playwright/test';

const base = process.argv[2];
if (!base || !/^https?:\/\//.test(base)) {
  console.error('Usage: node scripts/check-share.mjs <address the game is served at>, for example http://localhost:8080');
  process.exit(2);
}

const steps = [];
const ok = (name, detail = '') => { steps.push({ name, ok: true }); console.log(`  ok   ${name}${detail ? `  (${detail})` : ''}`); };
const fail = (name, detail = '') => { steps.push({ name, ok: false }); console.log(`  FAIL ${name}${detail ? `  (${detail})` : ''}`); };

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  // Keep normal WebRTC address masking/policies; special loopback flags can hide real joining failures.
});
const errors = [];
const open = async (url) => {
  const context = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'commit', timeout: 120000 });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui, null, { timeout: 120000 });
  return { page, context };
};

let exitCode = 0;
try {
  console.log(`Checking sharing at ${base}`);
  const health = await fetch(new URL('/api/share/health', base)).then((r) => r.json()).catch(() => null);
  if (health?.ok) ok('the sharing service answers', `${health.rooms} rooms`); else fail('the sharing service answers', 'no reply from /api/share/health: is this the share server?');

  const host = await open(base);
  await host.page.click('#btn-start-new-world');
  await host.page.click('#world-mode-creative');
  await host.page.click('#btn-create-world-confirm');
  await host.page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
  ok('the host started a world');
  await host.page.evaluate(() => document.exitPointerLock?.());
  await host.page.keyboard.press('Escape');
  await host.page.click('#btn-host-world');
  await host.page.waitForFunction(() => window.game.worldSync.isHosting || !document.getElementById('host-error').classList.contains('hidden'), null, { timeout: 30000 });
  const hostError = await host.page.evaluate(() => (document.getElementById('host-error').classList.contains('hidden') ? '' : document.getElementById('host-error').textContent));
  if (hostError) { fail('the host started sharing', hostError); throw new Error('cannot continue'); }
  const link = await host.page.inputValue('#host-share-link-input');
  ok('the host started sharing', link);
  const warned = await host.page.evaluate(() => !document.getElementById('host-local-warning').classList.contains('hidden'));
  if (warned) console.log('  note the link starts with localhost: only this computer can open it. Open the game at a public address for friends elsewhere.');

  const guest = await open(link);
  const started = Date.now();
  await guest.page.waitForFunction(() => window.game?.worldSync?.isJoined && window.game?.worldReady
    && document.getElementById('join-connecting-overlay')?.classList.contains('hidden'), null, { timeout: 120000 }).then(
    () => ok('the friend opened the link and joined', `${((Date.now() - started) / 1000).toFixed(1)} s`),
    async () => {
      const message = await guest.page.textContent('#join-status-text').catch(() => '');
      fail('the friend opened the link and joined', message.trim());
      console.log('  connection details', JSON.stringify(await guest.page.evaluate(() => window.game?.worldSync?.client?.lastJoinDiagnostics)));
      throw new Error('cannot continue');
    });
  const connection = await guest.page.evaluate(() => window.game.worldSync.client.hostLink?.pc?.connectionState);
  const transport = await guest.page.evaluate(() => window.game.worldSync.client.hostLink?.mode ?? 'webrtc');
  if (transport === 'local') ok('the connection uses the local-tab fallback');
  else if (connection === 'connected') ok('the connection is direct (WebRTC)');
  else fail('the connection is open', String(connection));
  const timings = await guest.page.evaluate(() => window.game.worldSync.joinTimings);
  console.log(`  note the world was ${Math.round((timings.snapshotBytes ?? 0) / 1024)} KB; connected after ${timings.connected} ms, received after ${timings.received} ms, built after ${timings.built} ms`);

  const spot = await host.page.evaluate(() => [Math.floor(window.game.player.position.x) + 2, 45, Math.floor(window.game.player.position.z) + 2]);
  await host.page.evaluate(([x, y, z]) => { window.game.world.setVoxel(x, y, z, 7); window.game.worldSync.onBlockPlaced(x, y, z, 7); }, spot);
  await guest.page.waitForFunction(([x, y, z]) => window.game.world.getVoxel(x, y, z) === 7, spot, { timeout: 15000 }).then(
    () => ok('a block the host placed appeared for the friend'), () => fail('a block the host placed appeared for the friend'));
  await guest.page.evaluate(([x, y, z]) => { window.game.world.setVoxel(x, y, z, 0); window.game.worldSync.onBlockBroken(x, y, z); }, spot);
  await host.page.waitForFunction(([x, y, z]) => window.game.world.getVoxel(x, y, z) === 0, spot, { timeout: 15000 }).then(
    () => ok('a block the friend broke disappeared for the host'), () => fail('a block the friend broke disappeared for the host'));

  if (errors.length) fail('no errors in either browser', errors[0]); else ok('no errors in either browser');
} catch (error) {
  if (error.message !== 'cannot continue') { console.error(error); fail('the check ran to the end', error.message); }
} finally {
  await browser.close();
  const failed = steps.filter((s) => !s.ok).length;
  console.log(failed ? `\nSharing does NOT work here: ${failed} check(s) failed.` : '\nSharing works here.');
  exitCode = failed ? 1 : 0;
}
process.exit(exitCode);
