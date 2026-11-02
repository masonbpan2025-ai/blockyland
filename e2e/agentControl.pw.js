// Agent Control end to end: the real MCP server (scripts/blockyland-mcp.mjs), a scripted MCP client standing in for
// Claude Code, and the game in a real browser, started by clicking. The player switches Offline Mode off, reads the
// code from Connect AI, and the "AI app" connects with it, looks around, builds, reads what the player typed and
// answers in the terminal. Run: npm run test:agent-control:browser
import { test, expect } from '@playwright/test';
import { startMcpServer } from './fixtures/mcpClient.js';

const MCP_PORT = 47699; // not the default, so a player's own server on 47615 is left alone

async function startWorld(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/?agent-control-port=${MCP_PORT}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  await page.click('#btn-start-new-world');
  // Creative: the Agent Terminal (and so an AI app) may change the world only in Creative or with cheats on.
  await page.click('#world-mode-creative');
  await page.click('#btn-create-world-confirm');
  await page.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 180000 });
  return errors;
}

async function openTerminal(page) {
  // C opens it on release in Creative (vanilla's toolbar key shares C).
  await page.keyboard.press('c');
  await expect(page.locator('#gemini-modal')).toBeVisible();
}

test('an AI app connects by code, builds, hears the player and answers in the terminal', async ({ page }) => {
  test.setTimeout(420000);
  const mcp = await startMcpServer({ port: MCP_PORT });
  try {
    expect(mcp.init.serverInfo.name).toBe('blockyland');
    const errors = await startWorld(page);
    await openTerminal(page);

    // Offline Mode starts on; Connect AI is locked until it is switched off.
    await expect(page.locator('#gemini-offline-state')).toHaveText('ON');
    await expect(page.locator('#agent-connect-btn')).toBeDisabled();
    expect((await mcp.call('get_state')).body.kind, 'nothing is connected yet').toBe('connection');

    await page.click('#gemini-offline-btn');
    await expect(page.locator('#gemini-offline-state')).toHaveText('OFF');
    await expect(page.locator('#agent-connect-drawer')).toBeVisible();
    await expect(page.locator('#agent-connect-status')).toContainText('Found Claude Code', { timeout: 20000 });
    // The dev server names this checkout's script, so the command can be pasted as it is.
    await expect(page.locator('#agent-connect-setup')).toContainText('node "');
    await expect(page.locator('#agent-connect-setup')).toContainText('/scripts/blockyland-mcp.mjs"');
    const code = (await page.locator('#agent-connect-code').textContent()).trim();
    expect(code).toMatch(/^\d{6}$/);

    expect((await mcp.call('connect', { code: '000000' })).isError, 'a wrong code is refused').toBe(true);
    const connected = await mcp.call('connect', { code });
    expect(connected.isError, JSON.stringify(connected.body)).toBe(false);
    await expect(page.locator('#gemini-status-text')).toHaveText('CLAUDE CODE CONNECTED', { timeout: 10000 });
    await expect(page.locator('#agent-connect-status')).toContainText('Connected to Claude Code');

    // Seeing the world.
    const state = (await mcp.call('get_state')).body;
    expect(state.position).toHaveLength(3);
    const around = (await mcp.call('look_around')).body;
    expect(around.description).toContain('LOCAL TERRAIN');
    expect((await mcp.call('plan_reference')).body.reference).toContain('fill_box');
    const shot = await mcp.call('screenshot');
    expect(shot.isError, JSON.stringify(shot.body)).toBe(false);
    expect(shot.images[0].mimeType).toBe('image/jpeg');
    expect(Buffer.from(shot.images[0].data, 'base64').subarray(0, 2).toString('hex'), 'a real JPEG').toBe('ffd8');

    // Building: a 5-block gold pillar, checked block by block in the browser's world.
    const built = await mcp.call('run_plan', {
      request: 'build a gold pillar',
      plan: {
        action: 'build', name: 'Gold pillar', buildingType: 'custom', explanation: 'A gold pillar next to you',
        dimensions: { width: 1, height: 5, depth: 1 },
        operations: [{ type: 'fill_box', min: [0, 0, 0], max: [0, 4, 0], block: 'GOLD_BLOCK' }],
      },
    });
    expect(built.isError, JSON.stringify(built.body)).toBe(false);
    const [pillar] = built.body.buildings.slice(-1);
    const placed = await page.evaluate(([x, y, z]) => {
      const { world } = window.game;
      return Array.from({ length: 5 }, (_, i) => world.getVoxel(x, y + i, z));
    }, pillar.origin);
    const gold = await page.evaluate(() => window.game.geminiAgent.resolveBlockId('GOLD_BLOCK'));
    expect(placed, `gold at ${pillar.origin}`).toEqual([gold, gold, gold, gold, gold]);
    await expect(page.locator('#gemini-log-feed')).toContainText('Claude Code: A gold pillar next to you');

    // Destroying needs confirm.
    const destroy = { action: 'destroy', targetBuilding: pillar.id, explanation: 'Remove the pillar' };
    expect((await mcp.call('run_plan', { plan: destroy })).body.kind).toBe('confirm');

    // The player types a request; the AI app reads it, with a screenshot of the view.
    const waiting = mcp.call('wait_for_player_message', { timeout_seconds: 60 });
    await page.fill('#gemini-prompt-input', 'make the pillar twice as tall');
    await page.press('#gemini-prompt-input', 'Enter');
    const heard = await waiting;
    expect(heard.body.message).toBe('make the pillar twice as tall');
    expect(heard.images.length, 'the view goes with the message').toBe(1);
    await expect(page.locator('#gemini-log-feed')).toContainText('You → Claude Code: make the pillar twice as tall');
    await expect(page.locator('#gemini-log-feed')).toContainText('picked up your request');

    // While it works, the status line and the pill say what it is doing, with the time so far.
    const activity = page.locator('#agent-activity');
    await expect(activity).toBeVisible();
    await expect(activity).toHaveAttribute('data-state', 'working');
    await expect(page.locator('#gemini-status-text')).toHaveText(/^WORKING \d+ s$/);
    const weather = await mcp.call('run_command', { command: '/weather rain' });
    expect(weather.isError, JSON.stringify(weather.body)).toBe(false);
    expect(await page.evaluate(() => window.game.weather.weatherType)).toBe('rain');
    await expect(activity).toContainText('Claude Code — Working: running /weather rain');

    // The answer appears in the terminal; when the AI app goes back to waiting, the request is clearly done.
    await mcp.call('say', { text: 'Done! The pillar is ten blocks tall now.' });
    await expect(page.locator('#gemini-log-feed .ai-reply')).toContainText('Claude Code: Done! The pillar is ten blocks tall now.');
    await expect(activity).toHaveAttribute('data-state', 'working', { timeout: 1000 });
    const next = mcp.call('wait_for_player_message', { timeout_seconds: 2 });
    await expect(activity).toHaveAttribute('data-state', 'done');
    await expect(activity).toContainText(/Done in \d+ s\./);
    await expect(page.locator('#gemini-status-text')).toHaveText('DONE ✓');
    await expect(page.locator('#gemini-log-feed .gemini-log-entry.done')).toContainText('✓ Done: Claude Code finished “make the pillar twice as tall”');
    expect((await next).body.waiting).toBe(true);

    // The setup steps folded away once connected; one button unfolds them, and folds them again.
    await expect(page.locator('#agent-connect-details')).toBeHidden();
    await page.click('#agent-connect-collapse');
    await expect(page.locator('#agent-connect-details')).toBeVisible();
    await page.click('#agent-connect-collapse');
    await expect(page.locator('#agent-connect-details')).toBeHidden();

    // The small terminal: docked bottom-left, the world clear behind it, and remembered.
    await page.click('#gemini-compact-btn');
    await expect(page.locator('#gemini-modal')).toHaveClass(/agent-compact/);
    const card = await page.locator('.gemini-terminal-card').boundingBox();
    expect(card.width, 'small').toBeLessThanOrEqual(460);
    expect(card.x, 'docked on the left').toBeLessThan(40);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById('gemini-modal')).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
    expect(await page.evaluate(() => localStorage.getItem('mc_agent_terminal_compact'))).toBe('1');
    await page.screenshot({ path: test.info().outputPath('terminal-small.png') });
    await page.click('#gemini-compact-btn');
    await expect(page.locator('#gemini-modal')).not.toHaveClass(/agent-compact/);
    await page.screenshot({ path: test.info().outputPath('terminal-large-steps-folded.png') });

    // Switching Offline Mode back on disconnects the AI app.
    await page.click('#gemini-offline-btn');
    await expect(page.locator('#gemini-offline-state')).toHaveText('ON');
    await expect.poll(async () => (await mcp.call('get_state')).body.kind, { timeout: 10000 }).toBe('connection');

    expect(errors, 'no uncaught page errors').toEqual([]);
  } finally {
    await mcp.stop();
  }
});

test('when the AI app quits and starts again, the same code connects it again', async ({ page }) => {
  test.setTimeout(420000);
  const errors = await startWorld(page);
  await openTerminal(page);
  await page.click('#gemini-offline-btn');
  let mcp = await startMcpServer({ port: MCP_PORT });
  try {
    await expect(page.locator('#agent-connect-status')).toContainText('Found Claude Code', { timeout: 20000 });
    const code = (await page.locator('#agent-connect-code').textContent()).trim();
    expect((await mcp.call('connect', { code })).isError).toBe(false);
    await expect(page.locator('#gemini-status-text')).toHaveText('CLAUDE CODE CONNECTED', { timeout: 10000 });

    // Each AI session starts its own server; when the session ends, the server goes.
    await mcp.stop();
    await expect(page.locator('#gemini-status-text')).toHaveText('LOOKING FOR AI APP', { timeout: 10000 });
    await expect(page.locator('#gemini-log-feed')).toContainText('Your AI app disconnected');
    expect((await page.locator('#agent-connect-code').textContent()).trim(), 'the code stays, so the player need not look again').toBe(code);

    mcp = await startMcpServer({ port: MCP_PORT });
    await expect(page.locator('#agent-connect-status')).toContainText('Found Claude Code', { timeout: 20000 });
    expect((await page.locator('#agent-connect-code').textContent()).trim()).toBe(code);
    expect((await mcp.call('connect', { code })).isError, 'the same code works with the new server').toBe(false);
    await expect(page.locator('#gemini-status-text')).toHaveText('CLAUDE CODE CONNECTED', { timeout: 10000 });
    expect(errors).toEqual([]);
  } finally {
    await mcp.stop();
  }
});

test('an AI app has the player light a Nether portal frame', async ({ page }) => {
  test.setTimeout(420000);
  const errors = await startWorld(page);
  await openTerminal(page);
  await page.click('#gemini-offline-btn');
  const mcp = await startMcpServer({ port: MCP_PORT });
  try {
    await expect(page.locator('#agent-connect-status')).toContainText('Found Claude Code', { timeout: 20000 });
    const code = (await page.locator('#agent-connect-code').textContent()).trim();
    expect((await mcp.call('connect', { code })).isError).toBe(false);

    // What the AI is told: portals exist, and how to light one.
    const reference = (await mcp.call('plan_reference')).body.reference;
    expect(reference).toContain('light portal at X Y Z');
    expect(reference).not.toMatch(/extra dimensions or portals/);

    // A frame 4 blocks in front of the player on cleared, level ground: vanilla's smallest, opening x+1..x+2, y+1..y+3.
    const frame = await page.evaluate(() => {
      const { world, player } = window.game;
      const O = window.game.geminiAgent.resolveBlockId('OBSIDIAN'), STONE = window.game.geminiAgent.resolveBlockId('STONE');
      const px = Math.floor(player.position.x), y = Math.floor(player.position.y), fz = Math.floor(player.position.z) + 4;
      for (let x = px - 2; x <= px + 6; x++) for (let z = fz - 4; z <= fz + 2; z++) {
        world.setVoxel(x, y - 1, z, STONE);
        for (let h = 0; h <= 6; h++) world.setVoxel(x, y + h, z, 0);
      }
      const fx = px;
      for (let x = fx; x <= fx + 3; x++) { world.setVoxel(x, y, fz, O); world.setVoxel(x, y + 4, fz, O); }
      for (let h = 1; h <= 3; h++) { world.setVoxel(fx, y + h, fz, O); world.setVoxel(fx + 3, y + h, fz, O); }
      window.game.refreshDirtyChunks?.();
      return { x: fx, y, z: fz };
    });

    const lit = await mcp.call('run_plan', { plan: { action: 'player_control', command: `light portal at ${frame.x + 1} ${frame.y} ${frame.z}`, explanation: 'Light the portal' } });
    expect(lit.isError, JSON.stringify(lit.body)).toBe(false);
    const opening = await page.evaluate(({ x, y, z }) => {
      const out = [];
      for (let dx = 1; dx <= 2; dx++) for (let h = 1; h <= 3; h++) out.push(window.game.world.getVoxel(x + dx, y + h, z));
      return out;
    }, frame);
    const portal = await page.evaluate(() => window.game.geminiAgent.resolveBlockId('NETHER_PORTAL'));
    expect(opening).toEqual(Array(6).fill(portal));
    expect(await page.evaluate(() => window.game.currentDimension)).toBe('overworld');
    await page.screenshot({ path: test.info().outputPath('portal-lit.png') });
    expect(errors).toEqual([]);
  } finally {
    await mcp.stop();
  }
});

test('the player plays with the terminal open, and Escape closes only the terminal', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await startWorld(page);
  await openTerminal(page);
  const locked = () => page.evaluate(() => document.pointerLockElement === window.game.renderer.domElement);

  // A click on the world beside the terminal takes the mouse back; the terminal stays.
  await expect(page.locator('#world-progress-overlay')).toBeHidden({ timeout: 60000 });
  const box = await page.locator('#gemini-modal').boundingBox();
  await page.mouse.click(box.x + box.width - 20, box.y + 20);
  await expect.poll(locked).toBe(true);
  await expect(page.locator('#gemini-modal')).toBeVisible();
  await expect(page.locator('#gemini-log-feed')).toContainText('Playing with the terminal open');

  // Moving: W walks the player forward with the terminal on screen.
  const start = await page.evaluate(() => window.game.player.position.clone());
  await page.keyboard.down('w');
  await page.waitForTimeout(700);
  await page.keyboard.up('w');
  const moved = await page.evaluate(([x, z]) => Math.hypot(window.game.player.position.x - x, window.game.player.position.z - z), [start.x, start.z]);
  expect(moved, 'the player walked').toBeGreaterThan(0.5);
  // Looking: the mouse turns the camera.
  const facing = () => page.evaluate(() => {
    const d = new window.game.camera.position.constructor();
    window.game.camera.getWorldDirection(d);
    return Math.atan2(d.x, d.z);
  });
  const before = await facing();
  await page.evaluate(() => window.dispatchEvent(new MouseEvent('mousemove', { movementX: 300, movementY: 0 })));
  await expect.poll(async () => Math.abs((await facing()) - before)).toBeGreaterThan(0.05);

  // Enter goes back to typing in the terminal, without the pause menu.
  await page.keyboard.press('Enter');
  await expect(page.locator('#gemini-prompt-input')).toBeFocused();
  await expect.poll(locked).toBe(false);
  await expect(page.locator('#pause-menu')).toBeHidden();

  // Escape while playing beside it closes the terminal and does not pause.
  await page.mouse.click(box.x + box.width - 20, box.y + 20);
  await expect.poll(locked).toBe(true);
  await page.keyboard.press('Escape');
  // A real Escape also drops the pointer lock; the synthetic one may not, so let it go as the browser would.
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.locator('#gemini-modal')).toBeHidden();
  await page.waitForTimeout(300);
  await expect(page.locator('#pause-menu')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Small docks the terminal in Building Studio, even with Connect AI open', async ({ page }) => {
  test.setTimeout(300000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`/?agent-control-port=${MCP_PORT}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.ui, null, { timeout: 180000 });
  await page.evaluate(() => localStorage.removeItem('mc_agent_terminal_compact'));
  await page.click('#btn-start-building-studio');
  await page.waitForFunction(() => window.game.worldReady, null, { timeout: 180000 });
  if (!(await page.locator('#gemini-modal').isVisible())) await openTerminal(page);
  await expect(page.locator('#gemini-modal')).toHaveClass(/studio-mode/);

  // Connect AI widens the studio's terminal.
  if ((await page.locator('#gemini-offline-state').textContent()) === 'ON') await page.click('#gemini-offline-btn');
  await expect(page.locator('#agent-connect-drawer')).toBeVisible();
  await expect(page.locator('#gemini-modal')).toHaveClass(/studio-settings-expanded/);

  await page.click('#gemini-compact-btn');
  await expect(page.locator('#gemini-modal')).toHaveClass(/agent-compact/);
  await expect(page.locator('#gemini-modal')).not.toHaveClass(/studio-settings-expanded/);
  const card = await page.locator('.gemini-terminal-card').boundingBox();
  expect(card.width, 'small').toBeLessThanOrEqual(480);
  expect(card.x, 'docked on the left').toBeLessThan(40);
  // The request box is fully on screen under the studio's file panel, in a short window too.
  for (const height of [720, 600]) {
    await page.setViewportSize({ width: 1280, height });
    await page.waitForTimeout(200);
    const input = await page.locator('.gemini-input-bar').boundingBox();
    expect(input.y + input.height, `the request box fits a ${height}-pixel window`).toBeLessThanOrEqual(height);
    const panel = await page.locator('#building-parameter-panel').boundingBox();
    expect(panel.y, 'the file panel is on screen too').toBeGreaterThanOrEqual(0);
    await expect(page.locator('#gemini-prompt-input')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`studio-terminal-small-${height}.png`) });
  }

  // Large widens it again while Connect AI is open.
  await page.click('#gemini-compact-btn');
  await expect(page.locator('#gemini-modal')).toHaveClass(/studio-settings-expanded/);
  await page.evaluate(() => localStorage.removeItem('mc_agent_terminal_compact'));
  expect(errors).toEqual([]);
});

test('Offline Mode still answers with the built-in presets', async ({ page }) => {
  test.setTimeout(300000);
  const errors = await startWorld(page);
  await openTerminal(page);
  await expect(page.locator('#gemini-offline-state')).toHaveText('ON');
  await page.fill('#gemini-prompt-input', 'make it rain');
  await page.press('#gemini-prompt-input', 'Enter');
  await expect.poll(() => page.evaluate(() => window.game.weather.weatherType), { timeout: 20000 }).toBe('rain');
  expect(errors).toEqual([]);
});
