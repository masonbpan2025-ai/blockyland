// Construction tutorials, played by the bot in the real game. Most of the 36 are building guides (metropolis, roofs,
// floors, furniture, pixel art, colour palettes); the bot's building (place, stairs, slabs) is exercised by the shelter
// and newcomer groups. These scenarios check the mechanics the construction tutorials rely on.
import { BLOCKS } from '../../../src/blocks.js';
import { W } from './_shared.js';

export const SCENARIOS = [
  {
    id: 'construction.water',
    tutorial: 'Elevators; Airlock; Water gate; Building water features; Endless circling pool; Water-powered boat transportation; Underwater home',
    wiki: W('Elevators'),
    async run(t) {
      const { game, player } = t;
      // Elevators: a column of water over soul sand carries the player up; over magma, down.
      const shaft = (x, base) => { t.fill(x - 1, 4, -1, x + 1, 20, 1, BLOCKS.GLASS); t.set(x, 4, 0, base); for (let y = 5; y <= 18; y++) t.set(x, y, 0, BLOCKS.WATER); };
      shaft(0, BLOCKS.SOUL_SAND); shaft(6, BLOCKS.MAGMA_BLOCK);
      await t.wait(1);
      player.position.set(0.5, 5.2, 0.5); player.velocity.set(0, 0, 0);
      let top = 5; for (let i = 0; i < 30 * 3; i++) { t.step(); top = Math.max(top, player.position.y); if (i % 15 === 0) await Promise.resolve(); }
      player.position.set(6.5, 17, 0.5); player.velocity.set(0, 0, 0);
      let bottom = 17; for (let i = 0; i < 30 * 4; i++) { t.step(); bottom = Math.min(bottom, player.position.y); if (i % 15 === 0) await Promise.resolve(); }
      t.check('a soul-sand water column lifts the player to the top; a magma one pulls down to the bottom', top >= 17 && bottom <= 5.5, { rose: +top.toFixed(1), sank: +bottom.toFixed(1) }, { rose: '>= 17', sank: '<= 5.5' });
      player.position.set(-6.5, 5, -6.5); player.health = 20; player.air = player.maxAir ?? 300; await t.wait(1);
      // Airlock: "When a torch with sand on top of it touches water, the sand drops and stops water flow".
      t.fill(10, 5, -3, 10, 7, 3, BLOCKS.STONE); t.fill(16, 5, -3, 16, 7, 3, BLOCKS.STONE);
      t.fill(11, 5, -3, 15, 7, -3, BLOCKS.STONE); t.fill(11, 5, 3, 15, 7, 3, BLOCKS.STONE);
      t.set(13, 5, 0, BLOCKS.TORCH); t.set(13, 6, 0, BLOCKS.SAND);
      t.set(11, 5, 0, BLOCKS.WATER); await t.wait(6);
      t.check('water washes the torch away and the sand drops into its place', t.world.getVoxel(13, 5, 0) === BLOCKS.SAND, { at: t.world.getVoxel(13, 5, 0) }, { at: BLOCKS.SAND });
      // Airlock: "water cannot flow through a door, regardless of whether it is open or closed".
      t.fill(20, 5, -9, 20, 6, 9, BLOCKS.STONE); t.set(20, 5, 0, BLOCKS.OAK_DOOR_OPEN); t.set(20, 6, 0, BLOCKS.OAK_DOOR_TOP_OPEN);
      t.set(19, 5, 0, BLOCKS.WATER); await t.wait(5);
      t.check('water does not flow through an open door', t.world.getVoxel(21, 5, 0) !== BLOCKS.WATER && t.world.getVoxel(20, 5, 0) === BLOCKS.OAK_DOOR_OPEN, { beyond: t.world.getVoxel(21, 5, 0), door: t.world.getVoxel(20, 5, 0) }, 'dry beyond');
      // Endless circling pool: flowing water carries a swimmer along.
      t.fill(-12, 4, 8, -2, 4, 10, BLOCKS.STONE); t.fill(-12, 5, 8, -2, 5, 8, BLOCKS.STONE); t.fill(-12, 5, 10, -2, 5, 10, BLOCKS.STONE);
      t.set(-12, 5, 9, BLOCKS.WATER); await t.wait(6);
      player.position.set(-10.5, 5, 9.5); player.velocity.set(0, 0, 0);
      const x0 = player.position.x; await t.wait(2);
      t.check('flowing water carries the player along', player.position.x - x0 > 1, +(player.position.x - x0).toFixed(2), '> 1 block downstream');
    },
  },
  {
    id: 'construction.blasts',
    tutorial: 'Blast chamber; Igniting TNT underwater; Safe home; Defense; Wither cage; Chunk ban',
    wiki: W('Blast chamber'),
    async run(t) {
      const { game } = t;
      const V = game.player.position.constructor;
      // Blast chamber: "TNT blasts ... drop all blocks broken as items as of Java Edition 1.14".
      t.fill(-1, 5, 9, 1, 7, 11, BLOCKS.COBBLESTONE); t.set(0, 6, 10, BLOCKS.AIR);
      game.player.position.set(-20.5, 5, -20.5);
      const before = new Set(game.entities.droppedItems);
      game.entities.spawnPrimedTNT(new V(0, 6, 10)); await t.wait(6);
      let broken = 0; for (let x = -1; x <= 1; x++) for (let y = 5; y <= 7; y++) for (let z = 9; z <= 11; z++) if (t.world.getVoxel(x, y, z) !== BLOCKS.COBBLESTONE) broken++;
      broken -= 1; // the hollow centre
      const dropped = game.entities.droppedItems.filter((d) => !before.has(d) && d.itemType === BLOCKS.COBBLESTONE).reduce((n, d) => n + d.count, 0);
      t.check('every block a TNT blast breaks drops', broken > 10 && dropped === broken, { broken, dropped }, 'dropped = broken');
      // Igniting TNT underwater: in water a TNT blast breaks nothing.
      t.fill(9, 4, 9, 13, 8, 13, BLOCKS.STONE); t.fill(10, 5, 10, 12, 7, 12, BLOCKS.WATER);
      await t.wait(2); game.entities.spawnPrimedTNT(new V(11, 6, 11)); await t.wait(6);
      let intact = 0; for (let x = 9; x <= 13; x++) for (let y = 4; y <= 8; y++) for (let z = 9; z <= 13; z++) if (t.world.getVoxel(x, y, z) === BLOCKS.STONE) intact++;
      t.check('TNT going off in water leaves the stone around it intact', intact === 125 - 27, intact, 98);
      // Safe home: obsidian walls hold where cobblestone does not.
      t.fill(20, 5, 0, 20, 6, 0, BLOCKS.OBSIDIAN); t.fill(20, 5, 3, 20, 6, 3, BLOCKS.COBBLESTONE);
      game.entities.spawnPrimedTNT(new V(21, 5, 0)); game.entities.spawnPrimedTNT(new V(21, 5, 3)); await t.wait(6);
      t.check('a TNT blast leaves obsidian and breaks cobblestone', t.world.getVoxel(20, 5, 0) === BLOCKS.OBSIDIAN && t.world.getVoxel(20, 5, 3) !== BLOCKS.COBBLESTONE, { obsidian: t.world.getVoxel(20, 5, 0), cobble: t.world.getVoxel(20, 5, 3) }, 'obsidian stays');
    },
  },
  {
    id: 'construction.building',
    tutorial: 'Secret door; Ranching; Furniture; Roof types; Roof construction guidelines; Creating shapes; Making nice floors; Walls and buttresses; Glazed terracotta patterns; Color palette; Pixel art; Adding beauty to constructions; Architectural terms; Building a cruise ship; Building a metropolis (and its 5 parts); Building a rollercoaster; Building micro shelters; Settlement guide',
    wiki: W('Secret door'),
    async run(t) {
      const { game, player } = t;
      // Secret door: "The painting door is one of the most well known hidden doors": a painting over a 1x2 opening can be
      // walked through.
      t.fill(0, 5, 4, 4, 7, 4, BLOCKS.STONE);
      // "replace the removed blocks with ones that can hold a painting but can also be walked through": an open door.
      t.set(2, 5, 4, BLOCKS.OAK_DOOR_OPEN); t.set(2, 6, 4, BLOCKS.OAK_DOOR_TOP_OPEN);
      t.give('painting', 1); await t.run('equip painting');
      player.position.set(2.5, 5, 1.5); await t.wait(0.3);
      game.playerBot.lookAt({ x: 2.5, y: 5.5, z: 4.0 }); t.step(); game.handleRightClick(); t.step();
      const hung = game.paintings.active().find((p) => p.cells.some((c) => c.x === 2 && c.z === 3));
      player.position.set(2.5, 5, 1.5); await t.wait(0.3);
      player.botControls = { KeyW: true }; player.yaw = 0;
      for (let i = 0; i < 60; i++) { game.playerBot.lookAt({ x: 2.5, y: 6, z: 12 }); t.step(); if (i % 15 === 0) await Promise.resolve(); }
      player.botControls = null;
      t.check('a painting over an open door is a door the player walks straight through', !!hung && player.position.z > 5, { painting: !!hung, z: +player.position.z.toFixed(2) }, 'through to z > 5');
      // Ranching: fences hold animals: a fence is 1.5 blocks tall, too high to jump.
      t.fill(-8, 5, -2, -8, 5, 2, BLOCKS.OAK_FENCE);
      player.position.set(-6.5, 5, 0.5); player.velocity.set(0, 0, 0); await t.wait(0.3);
      for (let i = 0; i < 90; i++) { game.playerBot.lookAt({ x: -12, y: 6, z: 0.5 }); player.botControls = { KeyW: true, Space: true }; t.step(); if (i % 15 === 0) await Promise.resolve(); }
      player.botControls = null;
      t.check('a fence cannot be jumped over', player.position.x > -7.7, +player.position.x.toFixed(2), 'still east of the fence');
      // Roofs and shapes: a slab placed on the upper half of a block's side goes in the top half.
      t.set(6, 5, -4, BLOCKS.STONE); t.give(BLOCKS.OAK_SLAB, 1); await t.run('equip oak slab');
      player.position.set(10.5, 5, -3.5); await t.wait(0.2);
      game.playerBot.lookAt({ x: 7.0, y: 5.75, z: -3.5 }); t.step();
      game.handleRightClick(); t.step();
      const slab = game.world.structureOrientations?.get?.('7,5,-4');
      t.check('a slab placed against the upper half of a side sits in the top half', t.world.getVoxel(7, 5, -4) === BLOCKS.OAK_SLAB && slab?.slabType === 'top', { block: t.world.getVoxel(7, 5, -4), type: slab?.slabType }, { type: 'top' });
      t.notes.push('The remaining construction tutorials are design guides (metropolis, roofs, floors, palettes, pixel art); building itself -- placing blocks, stairs and slabs -- is what the bot does in every group.');
    },
  },
];
