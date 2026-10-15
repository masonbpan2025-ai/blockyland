// Mining tutorials, played by the bot in the real game.
import { BLOCKS } from '../../../src/blocks.js';
import { W } from './_shared.js';

export const SCENARIOS = [
  {
    id: 'mining.ores',
    tutorial: 'Mining; Mining/Diamonds; Mining/Ancient debris; Mining/Ore veins; Mining/Fossils; Exploring caves',
    wiki: W('Mining'),
    async run(t) {
      const { game } = t;
      const take = async (id) => { t.give(id, 1); await t.run(`equip ${id.replace(/_/g, ' ')}`); };
      /** Walk beside a block, hold attack until it breaks, then step onto it to pick up what dropped. */
      const mineAt = async (x, y, z, maxTicks = 900) => {
        await t.run(`goto ${x - 1} ${y} ${z}`);
        const r = await t.breakBlock(x, y, z, { maxTicks });
        await t.wait(1.2); await t.run(`goto ${x} ${y} ${z}`); await t.wait(1);
        return r;
      };
      // Mining: "A diamond pickaxe is required to mine obsidian." Iron breaks it (slowly) for nothing.
      t.set(3, 5, 0, BLOCKS.OBSIDIAN); t.set(3, 5, 2, BLOCKS.OBSIDIAN);
      await take('iron_pickaxe');
      const withIron = await mineAt(3, 5, 0, 1800);
      const ironGot = t.count(BLOCKS.OBSIDIAN);
      await take('diamond_pickaxe');
      const withDiamond = await mineAt(3, 5, 2);
      // Breaking: obsidian (hardness 50) takes 9.4 s with a diamond pickaxe, and 41.7 s with iron, which cannot harvest it.
      t.check('obsidian needs a diamond pickaxe: iron gets nothing after ~42 s, diamond gets the block in 9.4 s',
        withIron.broken && ironGot === 0 && Math.abs(withIron.seconds - 41.7) < 0.5 && withDiamond.broken && Math.abs(withDiamond.seconds - 9.4) < 0.2 && t.count(BLOCKS.OBSIDIAN) === 1,
        { iron: [+withIron.seconds.toFixed(2), ironGot], diamond: [+withDiamond.seconds.toFixed(2), t.count(BLOCKS.OBSIDIAN)] }, { iron: [41.7, 0], diamond: [9.4, 1] });
      // Mining/Diamonds: "diamond ore does not drop diamonds when mined with a wood, stone, copper, or gold pickaxe".
      const drops = {};
      for (const [pick, x] of [['stone_pickaxe', -3], ['golden_pickaxe', -5], ['iron_pickaxe', -7]]) {
        t.set(x, 5, 0, BLOCKS.DIAMOND_ORE); await take(pick);
        const before = t.count('diamond'); await mineAt(x, 5, 0);
        drops[pick] = t.count('diamond') - before;
      }
      t.check('diamond ore gives diamonds only to an iron pickaxe or better', drops.stone_pickaxe === 0 && drops.golden_pickaxe === 0 && drops.iron_pickaxe === 1, drops, { stone: 0, golden: 0, iron: 1 });
      // "a Fortune III pickaxe harvesting an average of 2.2 (maximum 4) diamonds per ore".
      const { blockDropsWithFortune } = await import('/src/blockDrops.js');
      let total = 0, max = 0;
      for (let i = 0; i < 20000; i++) { const n = blockDropsWithFortune(BLOCKS.DIAMOND_ORE, 3, 'diamond_pickaxe').filter((d) => d.id === 'diamond').reduce((s, d) => s + d.count, 0); total += n; max = Math.max(max, n); }
      t.check('Fortune III averages 2.2 diamonds an ore, at most 4', Math.abs(total / 20000 - 2.2) < 0.05 && max === 4, { average: +(total / 20000).toFixed(3), max }, { average: 2.2, max: 4 });
      // Mining/Ancient debris: needs a diamond pickaxe; it is blast-proof ("beds are commonly used, as they explode").
      t.set(6, 5, -4, BLOCKS.ANCIENT_DEBRIS); t.set(9, 5, -4, BLOCKS.ANCIENT_DEBRIS); t.set(9, 5, -3, BLOCKS.TNT);
      await take('diamond_pickaxe'); await mineAt(6, 5, -4, 1500);
      await take('flint_and_steel'); await t.run('use flint_and_steel at 9 5 -3'); await t.run('goto -6 5 6'); await t.wait(5);
      t.check('ancient debris: a diamond pickaxe collects it, and an explosion leaves it', t.count(BLOCKS.ANCIENT_DEBRIS) === 1 && t.world.getVoxel(9, 5, -4) === BLOCKS.ANCIENT_DEBRIS,
        { collected: t.count(BLOCKS.ANCIENT_DEBRIS), afterBlast: t.world.getVoxel(9, 5, -4) }, { collected: 1, afterBlast: BLOCKS.ANCIENT_DEBRIS });
      // Mining/Ore veins: raw iron "crafting raw-ore items into compact raw-metal blocks"; Mining/Fossils: bone blocks
      // "crafted into bone meal".
      t.set(1, 5, 1, BLOCKS.CRAFTING_TABLE); await t.run('goto 0 5 2');
      t.give('raw_iron', 9); t.give(BLOCKS.BONE_BLOCK, 1);
      await t.run('craft raw iron block'); await t.run('craft 1 bone meal');
      t.check('nine raw iron make a block; a bone block gives nine bone meal', t.count(BLOCKS.RAW_IRON_BLOCK) === 1 && t.count('bone_meal') === 9,
        { rawIronBlock: t.count(BLOCKS.RAW_IRON_BLOCK), boneMeal: t.count('bone_meal') }, { rawIronBlock: 1, boneMeal: 9 });
      // Exploring caves: "pistons don't extend if there are 13+ blocks ahead of them" (the push limit is 12).
      const red = game.world.redstone;
      const tryPush = async (n, z) => {
        t.set(-12, 5, z, BLOCKS.PISTON); red.configure([-12, 5, z], 0); // facing +x
        for (let i = 1; i <= n; i++) t.set(-12 + i, 5, z, BLOCKS.STONE);
        t.set(-13, 5, z, BLOCKS.REDSTONE_BLOCK); await t.wait(1);
        return t.world.getVoxel(-12 + n + 1, 5, z) === BLOCKS.STONE;
      };
      const twelve = await tryPush(12, -10), thirteen = await tryPush(13, -13);
      t.check('a piston pushes 12 blocks but not 13', twelve && !thirteen, { pushed12: twelve, pushed13: thirteen }, { pushed12: true, pushed13: false });
      t.notes.push("The Y levels these tutorials give (diamonds at -59, ore veins at -60..-8, debris at 15, fossils 15-24 below the surface) are Java's 384-high world; this game's world is 64 high, so they are not checked.");
    },
  },
];
