import { chromium } from '@playwright/test';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/pope1/.gemini/antigravity-ide/brain/e73a5b6b-151d-4f8e-951b-3ec3327c8851';

async function run() {
  console.log('Launching browser for Creeper effects proof...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Minecraft Web Edition') || text.includes('Error')) console.log('PAGE LOG:', text);
  });
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Wait for game to be initialized
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.waitForFunction(() => window.game && window.game.mobs && window.game.entities, { timeout: 10000 });
      break;
    } catch (e) {
      console.log(`Wait attempt ${attempt + 1} failed, retrying...`);
      await page.waitForTimeout(1000);
    }
  }
  console.log('Game loaded.');

  // Initialize world and prepare scene
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.evaluate(async () => {
        const game = window.game;
        game.player?.setGameMode?.('creative');
        game.player.gamemode = 'creative';
        if (!game.worldGenerated) {
          await game.generateNewWorld();
        }
        game.overlay?.hide();
        const startOverlay = document.getElementById('start-overlay');
        if (startOverlay) startOverlay.style.display = 'none';
        const progressOverlay = document.getElementById('world-progress-overlay');
        if (progressOverlay) progressOverlay.style.display = 'none';
      });
      break;
    } catch (e) {
      console.log(`World init attempt ${attempt + 1} failed, retrying...`);
      await page.waitForTimeout(1500);
    }
  }

  await page.waitForTimeout(2000);

  // Position player on an open, flat, scenic platform in daylight
  await page.evaluate(async () => {
    const game = window.game;
    const { BLOCKS } = await import('/src/blocks.js');

    // Daytime
    game.worldTime = 6000;
    game.sky?.setTime?.(6000);

    const px = Math.floor(game.player.position.x);
    const py = Math.floor(game.player.position.y);
    const pz = Math.floor(game.player.position.z);

    // Build a clean, clear grassy meadow 16x16 around the player
    for (let dx = -8; dx <= 8; dx++) {
      for (let dz = -10; dz <= 8; dz++) {
        game.world.setVoxel(px + dx, py - 1, pz + dz, BLOCKS.GRASS_BLOCK);
        for (let dy = 0; dy <= 6; dy++) {
          game.world.setVoxel(px + dx, py + dy, pz + dz, BLOCKS.AIR);
        }
      }
    }
    game.refreshDirtyChunks?.(16);

    // Player standing at [px + 0.5, py, pz + 0.5], facing straight ahead towards -Z (yaw = 0)
    game.player.position.set(px + 0.5, py, pz + 0.5);
    game.player.velocity.set(0, 0, 0);
    game.player.yaw = 0;
    game.player.pitch = -0.08;

    // Despawn other mobs in the area
    for (const m of game.mobs.mobs.slice()) {
      game.scene.remove(m.mesh);
      game.mobs.mobs.splice(game.mobs.mobs.indexOf(m), 1);
    }
  });

  await page.waitForTimeout(600);

  // Step 1: Spawn Creeper right in front of the player (3 blocks away)
  console.log('Spawning normal creeper in front of camera...');
  await page.evaluate(async () => {
    const game = window.game;
    const px = game.player.position.x;
    const py = game.player.position.y;
    const pz = game.player.position.z;

    const creeper = game.mobs.spawnCreeper(px, py, pz - 3.2);
    creeper.yaw = 0; // facing the player
    if (creeper.mesh) creeper.mesh.rotation.y = 0;
    creeper._pauseAI = true;
    window._testCreeper = creeper;

    game.player.yaw = 0;
    game.player.pitch = -0.08;
  });

  await page.waitForTimeout(400);
  const normalPath = path.join(ARTIFACT_DIR, 'creeper_normal.png');
  await page.screenshot({ path: normalPath });
  console.log('Saved:', normalPath);

  // Step 2: Activate swelling and flashing white effect on the Creeper
  console.log('Activating swelling and bright white flashing effect...');
  await page.evaluate(async () => {
    const game = window.game;
    const creeper = window._testCreeper;
    const { setCreeperVisuals } = await import('/src/creeperBehavior.js');

    creeper.fuseTime = 1.2; // 80% fuse progress
    creeper.swelling = true;
    creeper.isFlashing = true;
    setCreeperVisuals(creeper, 1.2 / 1.5, true);

    creeper._pauseAI = true;
    game.player.yaw = 0;
    game.player.pitch = -0.08;
  });

  await page.waitForTimeout(400);
  const flashingPath = path.join(ARTIFACT_DIR, 'creeper_flashing_effect.png');
  await page.screenshot({ path: flashingPath });
  console.log('Saved:', flashingPath);

  // Step 3: Detonate Creeper to capture the explosion effect
  console.log('Detonating creeper to capture explosion effect...');
  await page.evaluate(async () => {
    const game = window.game;
    const creeper = window._testCreeper;
    const { detonateCreeper } = await import('/src/creeperBehavior.js');

    creeper._pauseAI = false;
    game.player.gamemode = 'creative';
    game.player.yaw = 0;
    game.player.pitch = -0.08;
    detonateCreeper(game.mobs, creeper, game.player);
  });

  // Capture early explosion peak with billowing cloud sphere, shockwave and sparks
  await page.waitForTimeout(80);
  const explosionPath = path.join(ARTIFACT_DIR, 'creeper_explosion_effect.png');
  await page.screenshot({ path: explosionPath });
  console.log('Saved:', explosionPath);

  // Capture second frame showing billowing clouds expanding and smoke drifting
  await page.waitForTimeout(160);
  const billowingPath = path.join(ARTIFACT_DIR, 'creeper_explosion_billowing.png');
  await page.screenshot({ path: billowingPath });
  console.log('Saved:', billowingPath);

  await browser.close();
  console.log('All Creeper visual proof screenshots captured successfully!');
}

run().catch(err => {
  console.error('Error running proof:', err);
  process.exit(1);
});
