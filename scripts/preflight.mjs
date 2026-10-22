// The checks that must pass before code leaves this machine: run by the git pre-push hook (.githooks/pre-push) and by
// `npm run deploy:cloudflare`. They are the few that prove the game still starts for a player, kept to a few minutes:
//   1. the start-screen wiring unit tests,
//   2. a production build,
//   3. the start-screen click suite in a real browser (e2e/startButtons.pw.js): every button answers, and Generate
//      New World -> Create World builds a world.
// The button suite exists because buttons once did nothing and no test noticed: the world-start suite called
// game.generateNewWorld() directly instead of clicking.
//   node scripts/preflight.mjs               all three
//   node scripts/preflight.mjs --skip-build  when the caller builds next anyway (the deploy script)
import { spawnSync } from 'node:child_process';

const steps = [
  ['Start-screen wiring tests', 'node', ['--test', '--test-isolation=none', 'tests/startScreenBinding.test.js', 'tests/domWiring.test.js']],
  !process.argv.includes('--skip-build') && ['Production build', 'npm', ['run', 'build']],
  ['Start-screen buttons, clicked in a browser', 'npx', ['playwright', 'test', '-c', 'playwright.startButtons.config.js']],
].filter(Boolean);

for (const [name, cmd, args] of steps) {
  console.log(`\n== Preflight: ${name}`);
  const started = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) {
    console.error(`\nPreflight failed at "${name}". Fix it before pushing or deploying.`);
    process.exit(r.status ?? 1);
  }
  console.log(`== ${name}: passed in ${Math.round((Date.now() - started) / 1000)} s`);
}
console.log('\nPreflight passed.');
