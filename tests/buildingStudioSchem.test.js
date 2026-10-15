import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { BuildingLibrary } from '../src/buildingLibrary.js';
import {
  BuildingStudioManager,
  STUDIO_GROUND_Y,
  blockIdToCanonicalState,
  canonicalStateToBlockId
} from '../src/buildingStudio.js';
import { BLOCKS } from '../src/blocks.js';
import { readSpongeSchematic, writeSpongeSchematic } from '../src/io/codecs.js';
import { CanonicalStructure, CanonicalRegion, CanonicalBlockState } from '../src/io/canonical.js';
import { buildCreativeCatalog } from '../src/creativeCatalog.js';

describe('Building Studio .schem Export and Import', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('Block State and ID Mapping', () => {
    it('converts common game block IDs to canonical namespaced states', () => {
      const stoneState = blockIdToCanonicalState(BLOCKS.STONE);
      assert.strictEqual(stoneState.name, 'minecraft:stone');

      const planksState = blockIdToCanonicalState(BLOCKS.OAK_PLANKS);
      assert.strictEqual(planksState.name, 'minecraft:oak_planks');

      const glassState = blockIdToCanonicalState(BLOCKS.GLASS);
      assert.strictEqual(glassState.name, 'minecraft:glass');

      const airState = blockIdToCanonicalState(BLOCKS.AIR);
      assert.strictEqual(airState.name, 'minecraft:air');
    });

    it('converts canonical states back to game block IDs', () => {
      assert.strictEqual(canonicalStateToBlockId(new CanonicalBlockState('minecraft:stone')), BLOCKS.STONE);
      assert.strictEqual(canonicalStateToBlockId(new CanonicalBlockState('minecraft:oak_planks')), BLOCKS.OAK_PLANKS);
      assert.strictEqual(canonicalStateToBlockId(new CanonicalBlockState('minecraft:cobblestone')), BLOCKS.COBBLESTONE);
      assert.strictEqual(canonicalStateToBlockId(new CanonicalBlockState('minecraft:air')), BLOCKS.AIR);
      assert.strictEqual(canonicalStateToBlockId(new CanonicalBlockState('minecraft:water')), BLOCKS.WATER);
    });
  });

  describe('Export to .schem Format (WorldEdit Sponge Schematic)', () => {
    it('exports a loaded parametric building into a valid .schem file readable by WorldEdit codec', async () => {
      const studio = new BuildingStudioManager({});
      const stairs = BuildingLibrary.getBuilding('stairs');
      assert.ok(stairs, 'Stairs building should exist');

      studio.loadBuilding(stairs, { height: 4, width: 2 });

      const result = await studio.exportCurrentToSchematic({ version: 3, gzipped: true });
      assert.ok(result, 'Export should return result object');
      assert.ok(result.bytes instanceof Uint8Array, 'Export bytes should be a Uint8Array');
      assert.ok(result.bytes.length > 0, 'Export bytes should not be empty');

      // Verify gzip magic header 0x1f 0x8b
      assert.strictEqual(result.bytes[0], 0x1f);
      assert.strictEqual(result.bytes[1], 0x8b);

      assert.strictEqual(result.filename, 'stairs.schem');

      // Read back with readSpongeSchematic to verify WorldEdit compatibility
      const { structure, warnings } = await readSpongeSchematic(result.bytes);
      assert.strictEqual(warnings.count, 0, 'Sponge schematic read should have 0 warnings');
      assert.ok(structure, 'Should decode into CanonicalStructure');
      assert.strictEqual(structure.name, 'Stairs');
      assert.ok(structure.main, 'Should have main region');

      const region = structure.main;
      assert.ok(region.size.x > 0);
      assert.ok(region.size.y > 0);
      assert.ok(region.size.z > 0);
      assert.ok(region.blocks.length > 0);

      // Verify block palette contains valid minecraft block states
      const palette = structure.palette();
      assert.ok(palette.some(st => st.name === 'minecraft:stone_bricks' || st.name === 'minecraft:cobblestone'));
    });

    it('exports a custom voxel build into a .schem file', async () => {
      const studio = new BuildingStudioManager({});
      studio.adoptCustomBuild({
        name: 'Mini Fort',
        blocks: [
          { x: 0, y: STUDIO_GROUND_Y, z: 8, id: BLOCKS.COBBLESTONE },
          { x: 1, y: STUDIO_GROUND_Y, z: 8, id: BLOCKS.COBBLESTONE },
          { x: 0, y: STUDIO_GROUND_Y + 1, z: 8, id: BLOCKS.OAK_PLANKS },
          { x: 1, y: STUDIO_GROUND_Y + 1, z: 8, id: BLOCKS.GLASS }
        ]
      });

      const result = await studio.exportCurrentToSchematic({ version: 3 });
      assert.ok(result);
      assert.strictEqual(result.filename, 'mini_fort.schem');

      const { structure } = await readSpongeSchematic(result.bytes);
      assert.strictEqual(structure.name, 'Mini Fort');
      assert.strictEqual(structure.main.blocks.length, 4);

      // Size should be 2 x 2 x 1
      assert.strictEqual(structure.main.size.x, 2);
      assert.strictEqual(structure.main.size.y, 2);
      assert.strictEqual(structure.main.size.z, 1);
    });

    it('returns null and does not throw when exporting with no active building', async () => {
      const studio = new BuildingStudioManager({});
      const result = await studio.exportCurrentToSchematic();
      assert.strictEqual(result, null);
    });
  });

  describe('Importing Multiple .schem Files into Structure Panel in Game', () => {
    it('imports multiple .schem files, registers them in BuildingLibrary and displays them in the game structure panel', async () => {
      // 1. Create two test structures and serialize them to .schem
      const struct1 = new CanonicalStructure({
        name: 'Watch Post',
        regions: [new CanonicalRegion({
          name: 'main',
          origin: { x: 0, y: 0, z: 0 },
          size: { x: 2, y: 3, z: 2 },
          blocks: [
            { pos: { x: 0, y: 0, z: 0 }, state: new CanonicalBlockState('minecraft:stone_bricks') },
            { pos: { x: 1, y: 0, z: 0 }, state: new CanonicalBlockState('minecraft:stone_bricks') },
            { pos: { x: 0, y: 1, z: 0 }, state: new CanonicalBlockState('minecraft:oak_planks') },
            { pos: { x: 1, y: 1, z: 0 }, state: new CanonicalBlockState('minecraft:glass') },
            { pos: { x: 0, y: 2, z: 0 }, state: new CanonicalBlockState('minecraft:torch') }
          ]
        })],
        source: { format: 'sponge-schem-v3', edition: 'java', dataVersion: 4189 }
      });

      const struct2 = new CanonicalStructure({
        name: 'Stone Arch',
        regions: [new CanonicalRegion({
          name: 'main',
          origin: { x: 0, y: 0, z: 0 },
          size: { x: 3, y: 2, z: 1 },
          blocks: [
            { pos: { x: 0, y: 0, z: 0 }, state: new CanonicalBlockState('minecraft:cobblestone') },
            { pos: { x: 2, y: 0, z: 0 }, state: new CanonicalBlockState('minecraft:cobblestone') },
            { pos: { x: 0, y: 1, z: 0 }, state: new CanonicalBlockState('minecraft:stone') },
            { pos: { x: 1, y: 1, z: 0 }, state: new CanonicalBlockState('minecraft:stone') },
            { pos: { x: 2, y: 1, z: 0 }, state: new CanonicalBlockState('minecraft:stone') }
          ]
        })],
        source: { format: 'sponge-schem-v3', edition: 'java', dataVersion: 4189 }
      });

      const schem1Bytes = await writeSpongeSchematic(struct1);
      const schem2Bytes = await writeSpongeSchematic(struct2);

      // 2. Prepare file inputs for multi-import
      const filesToImport = [
        { name: 'watch_post.schem', bytes: schem1Bytes },
        { name: 'stone_arch.schem', bytes: schem2Bytes }
      ];

      const studio = new BuildingStudioManager({});
      const imported = await studio.importSchematicFiles(filesToImport);

      assert.strictEqual(imported.length, 2, 'Both files should be imported');

      // 3. Verify structures are registered in BuildingLibrary
      const b1 = BuildingLibrary.getBuilding('Watch Post');
      const b2 = BuildingLibrary.getBuilding('Stone Arch');

      assert.ok(b1, 'Watch Post should be registered in BuildingLibrary');
      assert.ok(b2, 'Stone Arch should be registered in BuildingLibrary');

      assert.strictEqual(BuildingLibrary.hasBuilding('Watch Post'), true);
      assert.strictEqual(BuildingLibrary.hasBuilding('Stone Arch'), true);

      // Verify generator generates correct blocks
      const origin = { x: 10, y: 5, z: 10 };
      const blocks1 = b1.generate(origin, {}, BLOCKS);
      assert.strictEqual(blocks1.length, 5);
      assert.ok(blocks1.some(b => b.id === BLOCKS.STONE_BRICKS));
      assert.ok(blocks1.some(b => b.id === BLOCKS.GLASS));

      const blocks2 = b2.generate(origin, {}, BLOCKS);
      assert.strictEqual(blocks2.length, 5);
      assert.ok(blocks2.some(b => b.id === BLOCKS.COBBLESTONE));
      assert.ok(blocks2.some(b => b.id === BLOCKS.STONE));

      // 4. Verify in-game Structure Panel (Creative Catalog Buildings tab) contains both imported structures
      const catalog = buildCreativeCatalog();
      const buildingItems = catalog.filter(it => it.category === 'building');

      const catalogItem1 = buildingItems.find(it => it.buildingId === b1.id);
      const catalogItem2 = buildingItems.find(it => it.buildingId === b2.id);

      assert.ok(catalogItem1, 'Watch Post must appear in the in-game building/structure catalog');
      assert.strictEqual(catalogItem1.isBuilding, true);
      assert.strictEqual(catalogItem1.name, 'Watch Post');
      assert.strictEqual(catalogItem1.tab, 'building');

      assert.ok(catalogItem2, 'Stone Arch must appear in the in-game building/structure catalog');
      assert.strictEqual(catalogItem2.isBuilding, true);
      assert.strictEqual(catalogItem2.name, 'Stone Arch');
      assert.strictEqual(catalogItem2.tab, 'building');

      // Clean up
      BuildingLibrary.deleteBuilding(b1.id);
      BuildingLibrary.deleteBuilding(b2.id);
    });

    it('handles duplicate names cleanly when importing by appending a counter', async () => {
      const struct = new CanonicalStructure({
        name: 'Tower',
        regions: [new CanonicalRegion({
          name: 'main',
          origin: { x: 0, y: 0, z: 0 },
          size: { x: 1, y: 2, z: 1 },
          blocks: [{ pos: { x: 0, y: 0, z: 0 }, state: new CanonicalBlockState('minecraft:stone') }]
        })],
        source: { format: 'sponge-schem-v3', edition: 'java', dataVersion: 4189 }
      });
      const bytes = await writeSpongeSchematic(struct);

      const studio = new BuildingStudioManager({});
      const imported = await studio.importSchematicFiles([
        { name: 'tower.schem', bytes },
        { name: 'tower.schem', bytes }
      ]);

      assert.strictEqual(imported.length, 2);
      assert.strictEqual(imported[0].name, 'Tower');
      assert.strictEqual(imported[1].name, 'Tower (2)');

      assert.strictEqual(BuildingLibrary.hasBuilding('Tower'), true);
      assert.strictEqual(BuildingLibrary.hasBuilding('Tower (2)'), true);

      // Clean up
      BuildingLibrary.deleteBuilding(imported[0].id);
      BuildingLibrary.deleteBuilding(imported[1].id);
    });

    it('supports single import via importSchematic helper', async () => {
      const struct = new CanonicalStructure({
        name: 'Single Hut',
        regions: [new CanonicalRegion({
          name: 'main',
          origin: { x: 0, y: 0, z: 0 },
          size: { x: 2, y: 2, z: 2 },
          blocks: [{ pos: { x: 0, y: 0, z: 0 }, state: new CanonicalBlockState('minecraft:oak_planks') }]
        })],
        source: { format: 'sponge-schem-v3', edition: 'java', dataVersion: 4189 }
      });
      const bytes = await writeSpongeSchematic(struct);

      const studio = new BuildingStudioManager({});
      const imported = await studio.importSchematic(bytes, 'single_hut.schem');

      assert.ok(imported);
      assert.strictEqual(imported.name, 'Single Hut');
      assert.strictEqual(BuildingLibrary.hasBuilding('Single Hut'), true);

      // Clean up
      BuildingLibrary.deleteBuilding(imported.id);
    });
  });
});
