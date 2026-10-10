import { test, expect } from '@playwright/test';

test('Agent Terminal bot mines iron through real raycasting, mining, drops and pickup', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.game?.inventory && window.game?.heldItemRenderer && window.game?.targetBoxMesh, {timeout:60000});
  const result = await page.evaluate(async () => {
    const { BLOCKS } = await import('/src/blocks.js');
    const g=window.game;
    // A private deterministic arena in this isolated browser; no saved world is touched.
    // Keep the automatic animation gated and advance the actual gameplay methods below.
    g.lifecycle.phase='loading';g.worldReady=true;g.worldGenerated=true;
    g.mobs.clearMobs();g.world.isFlatWorld=true;
    for(let x=0;x<10;x++)for(let z=0;z<8;z++)for(let y=0;y<6;y++)g.world.setVoxel(x,y,z,y===0?BLOCKS.STONE:BLOCKS.AIR);
    g.world.setVoxel(5,1,3,BLOCKS.IRON_ORE);
    g.player.position.set(2.5,1,3.5);g.player.velocity.set(0,0,0);g.player.onGround=true;g.player.gamemode='survival';g.player.isFlying=false;
    g.inventory.hotbar=Array(9).fill(null);g.inventory.storage=Array(27).fill(null);g.inventory.activeSlot=0;
    g.inventory.hotbar[1]={id:'stone_pickaxe',isBlock:false,count:1};
    g.ui.openGeminiTerminal();
    const pending=g.geminiAgent.executePrompt('mine 1 iron ore');
    for(let i=0;i<3000&&g.playerBot.active;i++){
      g.playerBot.tick(1/60);g.player.update(1/60);g.updateRaycast();g.playerBot.afterRaycast();g.updateMining(1/60);g.entities.update(1/60,g.player,g.inventory);
    }
    if(g.playerBot.active)g.playerBot.stop('Browser test exceeded tick budget.');
    const task=await pending;
    return {task,ore:g.world.getVoxel(5,1,3),air:BLOCKS.AIR,rawIron:g.playerBot.itemCount('raw_iron'),controls:g.player.botControls,terminalOpen:g.ui.isGeminiOpen(),tool:g.inventory.hotbar[1],active:g.playerBot.active};
  });
  expect(result.task.ok, result.task.message).toBe(true);
  expect(result.ore).toBe(result.air);
  expect(result.rawIron).toBeGreaterThan(0);
  expect(result.tool.durability).toBe(130);
  expect(result.controls).toBeNull();expect(result.active).toBe(false);expect(result.terminalOpen).toBe(true);
  await expect(page.locator('#player-bot-stop')).toBeVisible();
});
