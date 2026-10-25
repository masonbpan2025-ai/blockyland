// Skins in a shared world, in two real browsers: each player sees the other in the skin that player chose, and a skin
// changed in the Packs window shows on the other screen at once, in both directions.
import { test, expect } from '@playwright/test';

test.use({ actionTimeout: 30000 });

async function openGame(browser, errors, label) {
  const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  await page.goto('/', { waitUntil: 'commit' });
  await page.waitForFunction(() => window.game?.worldSync && window.game?.ui, null, { timeout: 300000 });
  return { page, context };
}

/** The skin this browser sees on the one other player: its PNG and arm model, and the texture its model wears. */
const seenSkin = (page) => page.evaluate(() => {
  const peer = [...window.game.worldSync.remotePlayers.remotePlayers.values()][0];
  return peer?.skin ? { png: peer.skin.png, model: peer.skin.model, worn: peer.avatar.mesh.baseMaterial?.map?.image?.src ?? null } : null;
});

/** Equip a skin through the Packs window's Equip button, as a player does. */
const equip = (page, pattern) => page.evaluate(async (source) => {
  const { packsModal } = await import('/src/packsModal.js');
  const { skinManager } = await import('/src/skinManager.js');
  packsModal.open('skins');
  const re = new RegExp(source, 'i');
  const button = [...document.querySelectorAll('[data-equip-skin]')].find((b) => re.test(b.getAttribute('data-equip-skin')));
  button.click();
  packsModal.close?.();
  const skin = skinManager.getEquippedSkin();
  return { id: skin.id, model: skin.model === 'slim' ? 'slim' : 'default' };
}, pattern);

test('a skin chosen by one player is the skin the other sees, and a change shows at once, both ways', async ({ browser }) => {
  test.setTimeout(600000);
  const errors = [];
  const { page: host, context: hostContext } = await openGame(browser, errors, 'host');
  const { page: guest, context: guestContext } = await openGame(browser, errors, 'guest');
  try {
    await host.click('#btn-start-new-world');
    await host.click('#btn-create-world-confirm');
    await host.waitForFunction(() => window.game.worldReady && window.game.lifecycle?.phase === 'ready', null, { timeout: 240000 });
    await host.evaluate(() => document.exitPointerLock?.());
    if (!await host.locator('#pause-menu').isVisible()) await host.keyboard.press('Escape');
    await host.click('#btn-host-world');
    await host.waitForFunction(() => window.game.worldSync.isHosting);
    const code = await host.textContent('#host-room-id-badge');
    await host.click('#btn-dismiss-host-modal');
    if (await host.locator('#pause-menu').isVisible()) await host.click('#btn-resume');

    await guest.click('#btn-start-join');
    await guest.fill('#join-code-input', code);
    await guest.click('#btn-join-code-confirm');
    await guest.waitForFunction(() => window.game?.worldSync?.isJoined && window.game.worldReady
      && document.getElementById('join-connecting-overlay')?.classList.contains('hidden'), null, { timeout: 240000 });

    // Each sees the other's skin from the start.
    await expect.poll(() => seenSkin(host).then((s) => s?.model), { timeout: 15000 }).toBe('default');
    await expect.poll(() => seenSkin(guest).then((s) => s?.model), { timeout: 15000 }).toBe('default');
    const first = await seenSkin(host);
    expect(first.png).toMatch(/^data:image\/png;base64,/);
    expect(first.worn, 'the avatar wears it').toBe(first.png);

    // The guest changes to Alex (slim arms): the host sees the new skin on the guest at once.
    const alex = await equip(guest, '^alex$');
    expect(alex.model).toBe('slim');
    await expect.poll(() => seenSkin(host).then((s) => s && s.png !== first.png && s.model), { timeout: 15000 }).toBe('slim');
    const changed = await seenSkin(host);
    await expect.poll(() => seenSkin(host).then((s) => s.worn), { timeout: 15000 }).toBe(changed.png);

    // And the other way: the host changes, the guest sees it.
    const before = await seenSkin(guest);
    const knight = await equip(host, '^skin_crusader_knight$');
    expect(knight.id).toBe('skin_crusader_knight');
    await expect.poll(() => seenSkin(guest).then((s) => s?.png !== before.png), { timeout: 15000 }).toBe(true);
    const knightSeen = await seenSkin(guest);
    await expect.poll(() => seenSkin(guest).then((s) => s.worn), { timeout: 15000 }).toBe(knightSeen.png);

    // Each browser shows the other player in that player's skin, not its own: the guest wears Alex, the host the knight.
    const guestOwn = await guest.evaluate(async () => (await import('/src/skinManager.js')).skinManager.equippedSkinId);
    expect(guestOwn).toBe('alex');
    expect(knightSeen.png).not.toBe(changed.png);
    expect((await seenSkin(host)).png).toBe(changed.png);

    expect(errors).toEqual([]);
  } finally {
    await guestContext.close().catch(() => {});
    await hostContext.close().catch(() => {});
  }
});
