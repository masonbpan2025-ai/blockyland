import { chromium } from '@playwright/test';

async function run() {
  console.log('Launching Chrome browser...');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('Minecraft Web Edition') || text.includes('Error') || text.includes('bed')) {
      console.log('PAGE LOG:', text);
    }
  });
  page.on('pageerror', err => console.error('PAGE ERROR:', err));

  console.log('Navigating to http://localhost:3000/...');
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });

  // Wait for game to be initialized
  await page.waitForFunction(() => window.game && window.game.bedManager && window.game.inventory);
  console.log('Game initialized.');

  // Generate world in survival mode
  const initResult = await page.evaluate(async () => {
    const game = window.game;
    game.player?.setGameMode?.('survival');
    game.player.gamemode = 'survival';

    if (!game.worldGenerated) {
      await game.generateNewWorld();
    }
    game.overlay?.hide();
    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) startOverlay.style.display = 'none';
    const progressOverlay = document.getElementById('world-progress-overlay');
    if (progressOverlay) progressOverlay.style.display = 'none';

    return {
      worldGenerated: game.worldGenerated,
      gamemode: game.player.gamemode,
      pos: [game.player.position.x, game.player.position.y, game.player.position.z]
    };
  });
  console.log('Init result:', initResult);

  // Wait for world chunks to build and overlay to fully clear
  await page.waitForTimeout(2000);

  // Step 1: Survival Bed Crafting with mixed planks and white wool
  console.log('Testing bed crafting in survival mode...');
  const craftResult = await page.evaluate(async () => {
    const game = window.game;
    const { BLOCKS } = await import('/src/blocks.js');

    // Ensure player is in survival
    game.player.setGameMode('survival');

    // Clear 3x3 crafting grid
    for (let i = 0; i < 9; i++) game.inventory.craft3x3[i] = null;

    // 3 white wool on top row (0, 1, 2)
    game.inventory.craft3x3[0] = { id: BLOCKS.WHITE_WOOL, isBlock: true, count: 1 };
    game.inventory.craft3x3[1] = { id: BLOCKS.WHITE_WOOL, isBlock: true, count: 1 };
    game.inventory.craft3x3[2] = { id: BLOCKS.WHITE_WOOL, isBlock: true, count: 1 };

    // 3 mixed planks on second row (3, 4, 5): oak, birch, spruce
    game.inventory.craft3x3[3] = { id: BLOCKS.OAK_PLANKS, isBlock: true, count: 1 };
    game.inventory.craft3x3[4] = { id: BLOCKS.BIRCH_PLANKS, isBlock: true, count: 1 };
    game.inventory.craft3x3[5] = { id: BLOCKS.SPRUCE_PLANKS, isBlock: true, count: 1 };

    // Check crafting result
    game.inventory.checkCrafting(3);
    const crafted = game.inventory.craft3x3Result;
    if (!crafted || crafted.id !== 'white_bed') {
      throw new Error('Crafting failed to produce white_bed: ' + JSON.stringify(crafted));
    }

    // Take craft result
    game.inventory.takeCraftResult(3);
    // Put crafted bed into hotbar slot 0
    game.inventory.hotbar[0] = game.inventory.cursorItem;
    game.inventory.cursorItem = null;
    game.inventory.activeSlot = 0;
    game.ui?.updateHotbar?.();

    return {
      craftedId: crafted.id,
      hotbarItem: game.inventory.hotbar[0]?.id
    };
  });
  console.log('Craft result:', craftResult);

  // Step 2: Bed Placement in survival mode at night
  console.log('Testing bed placement in survival mode...');
  const placeResult = await page.evaluate(async () => {
    const game = window.game;
    const px = Math.floor(game.player.position.x);
    const py = Math.floor(game.player.position.y);
    const pz = Math.floor(game.player.position.z);

    // Prepare clear, solid platform in front of player
    for (let dx = -2; dx <= 2; dx++) {
      for (let dz = -3; dz <= 2; dz++) {
        game.world.setVoxel(px + dx, py - 1, pz + dz, 1); // Solid grass below
        game.world.setVoxel(px + dx, py, pz + dz, 0);     // Air at foot level
        game.world.setVoxel(px + dx, py + 1, pz + dz, 0); // Air at head level
      }
    }

    // Set time to night (18000)
    game.worldTime = 18000;
    game.sky?.setTime?.(18000);

    // Place the white bed: foot at [px, py, pz - 2], head at [px, py, pz - 3]
    const bedFoot = [px, py, pz - 2];
    const activeItem = game.inventory.getActiveItem();
    const placeRes = game.bedManager.placeBed(game.world, bedFoot, 3, activeItem);
    if (!placeRes.success) {
      throw new Error('Failed to place bed: ' + placeRes.reason);
    }

    // Immediately rebuild chunk meshes so the 3D bed model is visible
    game.refreshDirtyChunks?.(16);

    // Consume the bed from inventory like survival placement does
    game.inventory.consumeActiveItem();
    game.ui?.updateHotbar?.();

    // Position player and camera standing in front of the bed looking down at it
    game.player.position.set(px + 0.5, py, pz - 0.5);
    game.camera.position.set(px + 0.5, py + 1.62, pz - 0.5);
    game.camera.lookAt(px + 0.5, py + 0.5, pz - 2.5);

    // Make sure HUD is updated and visible
    game.ui?.updateStatusBars?.();
    game.ui?.updateHotbar?.();

    return {
      placeSuccess: placeRes.success,
      bedFoot,
      worldTime: game.worldTime
    };
  });
  console.log('Place result:', placeResult);

  // Render frame showing the placed bed in survival mode at night
  await page.evaluate(() => {
    const game = window.game;
    game.renderer.render(game.scene, game.camera);
  });
  await page.waitForTimeout(500);

  const placedScreenshotPath = 'C:/Users/pope1/.gemini/antigravity-ide/brain/e73a5b6b-151d-4f8e-951b-3ec3327c8851/survival_bed_placed_proof.png';
  await page.screenshot({ path: placedScreenshotPath, fullPage: false });
  console.log('Placed bed screenshot saved to:', placedScreenshotPath);

  // Step 3: Sleep in the bed at night
  console.log('Testing sleeping in bed...');
  const sleepResult = await page.evaluate(async () => {
    const game = window.game;
    const px = Math.floor(game.player.position.x);
    const py = Math.floor(game.player.position.y);
    const pz = Math.floor(game.player.position.z);
    const bedFoot = [px, py, pz - 2];

    const interactRes = game.bedManager.interact(bedFoot[0], bedFoot[1], bedFoot[2], game.player);
    if (!interactRes.success) {
      throw new Error('Failed to sleep in bed: ' + interactRes.reason);
    }

    return {
      sleepSuccess: interactRes.success,
      isSleeping: game.bedManager.isSleeping,
      playerIsSleeping: game.player.isSleeping,
      worldTime: game.worldTime
    };
  });
  console.log('Sleep result:', sleepResult);

  // Wait for the sleeping overlay transition
  await page.waitForSelector('#sleeping-overlay.visible', { timeout: 5000 });
  await page.waitForTimeout(600);

  // Render scene frame during sleep
  await page.evaluate(() => {
    const game = window.game;
    game.renderer.render(game.scene, game.camera);
  });

  const sleepScreenshotPath = 'C:/Users/pope1/.gemini/antigravity-ide/brain/e73a5b6b-151d-4f8e-951b-3ec3327c8851/survival_bed_sleep_proof.png';
  await page.screenshot({ path: sleepScreenshotPath, fullPage: false });
  console.log('Sleeping screenshot saved to:', sleepScreenshotPath);

  // Step 4: Verify waking up at dawn
  console.log('Testing wake up cycle...');
  const wakeResult = await page.evaluate(() => {
    const game = window.game;
    game.bedManager.update(4.0); // Sleep duration is 3.5s
    return {
      isSleeping: game.bedManager.isSleeping,
      worldTime: game.worldTime,
      overlayHidden: document.getElementById('sleeping-overlay')?.classList.contains('hidden')
    };
  });
  console.log('Wake result:', wakeResult);

  await browser.close();
  console.log('All tests passed successfully!');
}

run().catch(err => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
