// Three actual clients: attacker, victim and an independent observer. The bridge is a controlled fixture;
// hits use the real shared-combat entry points, physics, replication and mini-game void/death rules.
import { test, expect } from '@playwright/test';

for (const [mode, title] of [['skywars', 'SkyWars'], ['bedwars', 'Bed Wars']]) {
  test(`${title}: walking falls and sword, arrow and snowball knockback are visible to all three players`, async ({ browser }) => {
    test.setTimeout(600000);
    const contexts = [], pages = [], errors = [];
    try {
      for (let i = 0; i < 3; i++) {
        const context = await browser.newContext({ viewport: { width: 1000, height: 640 } });
        contexts.push(context);
        const page = await context.newPage(); pages.push(page);
        page.on('pageerror', e => errors.push(`${i}: ${e.message}`));
        await page.goto('/', { waitUntil: 'commit' });
        await page.waitForFunction(() => window.game?.worldSync && window.game?.ui, null, { timeout: 180000 });
      }
      const [host, guest, observer] = pages;
      await host.click('#btn-start-designed-world');
      await host.locator('#map-designed-list > *', { hasText: title }).first().getByRole('button').first().click();
      await host.waitForFunction(m => /^\d{4}$/.test(document.getElementById(`${m}-code`)?.textContent ?? ''), mode, { timeout: 120000 });
      const code = await host.textContent(`#${mode}-code`);
      for (const page of [guest, observer]) {
        await page.click('#btn-start-join');
        await page.fill('#join-code-input', code);
        await page.click('#btn-join-code-confirm');
        await page.waitForFunction(m => window.game?.worldSync?.isJoined && window.game.worldReady && window.game[m]?.state, mode, { timeout: 180000 });
      }
      const start = async () => {
        await host.click(`#${mode}-start`);
        for (const page of pages) await page.waitForFunction(m => window.game[m]?.phase === 'playing', mode, { timeout: 30000 });
      };
      await start();
      // Include the host as a victim: it receives hurt locally, whereas a guest receives a host message.
      for (const [index, weapon] of ['walking', 'sword', 'arrow', 'snowball'].entries()) {
        const victim = weapon === 'arrow' ? host : guest;
        const attacker = victim === host ? guest : host;
        const victimId = await victim.evaluate(() => window.game.worldSync.client.clientId);
        const attackerId = await attacker.evaluate(() => window.game.worldSync.client.clientId);
        for (const page of pages) {
          const role = page === victim ? 'victim' : page === attacker ? 'attacker' : 'observer';
          await page.evaluate(({ role, victimId }) => {
            const g = window.game, p = g.player;
            // A one-block-wide bridge at Y=56 over empty space, plus separate attacker/witness pads.
            for (let x = -3; x <= 5; x++) for (let z = -8; z <= 8; z++)
              for (let y = 0; y <= 61; y++) g.world.setVoxel(x, y, z, 0);
            for (let z = -7; z <= 7; z++) g.world.setVoxel(0, 56, z, 3);
            g.world.setVoxel(-2, 56, 0, 3); g.world.setVoxel(4, 56, 4, 3);
            g.refreshDirtyChunks?.();
            p.setGameMode('survival'); p.isFlying = false; p.isDead = false;
            p.health = 20; p.hunger = 10; p.invulnerableTimer = 0; p.lastHurtAmount = 0;
            p.pvpKnockbackActive = false; p.pvpKnockbackAccumulator = 0;
            p.botControls = false;
            p.velocity.set(0, 0, 0); p.onGround = true; p.fallDistance = 0;
            p.position.set(role === 'victim' ? 0.5 : role === 'attacker' ? -1.5 : 4.5, 57, role === 'observer' ? 4.5 : 0.5);
            p.keys = role === 'victim' ? { ShiftLeft: true } : {};
            g.inventory.armor = { head: null, chest: null, legs: null, feet: null };
            clearInterval(window.bridgeSampleTimer);
            window.bridgeSamples = [];
            window.bridgeSampleTimer = setInterval(() => {
              const peer = g.worldSync.remotePlayers.remotePlayers.get(victimId);
              const at = role === 'victim' ? p.position : peer?.avatar?.mesh?.position;
              if (at) window.bridgeSamples.push({ x: at.x, y: at.y, z: at.z });
            }, 20);
          }, { role, victimId });
        }
        await expect.poll(() => attacker.evaluate(id => {
          const p = window.game.worldSync.remotePlayers.remotePlayers.get(id)?.currentPos;
          return p ? Math.abs(p.x - 0.5) + Math.abs(p.y - 57) : 100;
        }, victimId)).toBeLessThan(0.15);
        const before = await host.evaluate(({ mode, attackerId }) => window.game[mode].state.players.find(p => p.id === attackerId).kills, { mode, attackerId });
        const landed = weapon === 'walking' ? await victim.evaluate(() => {
          const p = window.game.player;
          p.yaw = -Math.PI / 2; p.botControls = { KeyW: true };
          return true;
        }) : await attacker.evaluate(({ weapon, victimId }) => {
          const g = window.game;
          if (weapon === 'sword') return g.worldSync.attackRemotePlayer(victimId, 4, { weapon: 'iron_sword' });
          const from = g.player.position.clone().set(-0.5, 58, 0.5), to = from.clone().set(1.5, 58, 0.5);
          return g.worldSync.projectileHit(from, to, { kind: weapon, damage: weapon === 'snowball' ? 0 : 4 });
        }, { weapon, victimId });
        expect(landed).toBe(true);
        try {
          if (weapon === 'walking') {
            await victim.waitForFunction(() => window.game.player.position.x > 1.5);
            // Release forward after crossing, so the fixture stays inside the cleared void rather than reaching another island.
            await victim.evaluate(() => { window.game.player.botControls = {}; });
          }
          await victim.waitForFunction(m => {
            const me = window.game[m].me(); return m === 'skywars' ? me?.alive === false : me?.dead === true;
          }, mode, { timeout: 20000 });
        } catch (error) {
          const state = await victim.evaluate(m => {
            const p = window.game.player;
            return { position: p.position, velocity: p.velocity, keys: p.keys, botControls: p.botControls, mode: p.gamemode, me: window.game[m].me(), samples: window.bridgeSamples.slice(-5) };
          }, mode);
          throw new Error(`${weapon}: ${error.message}; ${JSON.stringify(state)}`);
        }
        for (const page of pages) {
          const samples = await page.evaluate(() => window.bridgeSamples);
          expect(samples.some(p => p.x > 1.3 && p.y > 50), `${weapon}: every player sees the victim leave the bridge`).toBe(true);
          expect(samples.some(p => p.x > 1.3 && p.y < 55), `${weapon}: every player sees the actual fall`).toBe(true);
        }
        await expect.poll(() => host.evaluate(({ mode, attackerId }) => window.game[mode].state.players.find(p => p.id === attackerId).kills, { mode, attackerId })).toBe(before + (weapon === 'walking' ? 0 : 1));
        if (index < 3) {
          if (mode === 'skywars') {
            // End this round after observing the real knockback death, then use the real play-again/start buttons.
            await observer.evaluate(() => { window.game.player.position.y = -10; });
            await host.waitForFunction(() => window.game.skywars.phase === 'ended');
            await host.click('#skywars-again');
            await start();
          } else {
            await victim.waitForFunction(() => window.game.bedwars.me()?.dead === false && window.game.player.gamemode === 'survival', null, { timeout: 15000 });
          }
        }
      }
      expect(errors).toEqual([]);
    } finally {
      for (const context of contexts.reverse()) await context.close();
    }
  });
}
