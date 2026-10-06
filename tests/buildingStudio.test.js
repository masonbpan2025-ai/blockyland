import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { BuildingLibrary } from '../src/buildingLibrary.js';
import { BuildingStudioManager } from '../src/buildingStudio.js';
import { CREATIVE_TABS, buildCreativeCatalog } from '../src/creativeCatalog.js';
import { BLOCKS } from '../src/blocks.js';
import { World } from '../src/world.js';

describe('Structure Studio and Structure Library System', () => {
  beforeEach(() => {
    // Reset custom structures before each test
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  });

  describe('BuildingLibrary Presets and Generator Code', () => {
    it('has all required built-in structures including Aquarium', () => {
      const all = BuildingLibrary.getAllBuildings();
      assert.ok(all.length >= 9, 'Expected at least 9 built-in structures');

      const expectedIds = [
        'stairs',
        'aquarium',
        'skyscraper',
        'pyramid',
        'castle',
        'cozy_house',
        'watchtower',
        'greenhouse',
        'spaceship'
      ];

      for (const id of expectedIds) {
        const found = BuildingLibrary.getBuilding(id);
        assert.ok(found, `Expected structure ${id} to exist`);
        assert.ok(found.name, `Structure ${id} should have a name`);
        assert.ok(Array.isArray(found.parameters), `Structure ${id} should have parameters`);
        assert.strictEqual(typeof found.generate, 'function', `Structure ${id} should have a generate function`);
      }
    });

    it('generates stairs with parameterized height and width', () => {
      const stairs = BuildingLibrary.getBuilding('stairs');
      const blocksHeight5 = stairs.generate({ height: 5, width: 3 });
      assert.ok(Array.isArray(blocksHeight5));
      assert.ok(blocksHeight5.length > 0);

      // Highest stone brick step is at dy = H - 1 (4 and 9)
      const stepBlocks = blocksHeight5.filter(b => b.id === BLOCKS.STONE_BRICKS);
      const maxStepDy = Math.max(...stepBlocks.map(b => b.dy));
      assert.strictEqual(maxStepDy, 4);

      const blocksHeight10 = stairs.generate({ height: 10, width: 3 });
      const stepBlocks10 = blocksHeight10.filter(b => b.id === BLOCKS.STONE_BRICKS);
      const maxStepDy10 = Math.max(...stepBlocks10.map(b => b.dy));
      assert.strictEqual(maxStepDy10, 9);
      assert.ok(blocksHeight10.length > blocksHeight5.length);
    });

    it('generates aquarium with water and glass walls', () => {
      const aquarium = BuildingLibrary.getBuilding('aquarium');
      const blocks = aquarium.generate({ width: 6, height: 4, depth: 6 });
      assert.ok(blocks.some(b => b.id === BLOCKS.GLASS), 'Aquarium should contain glass');
      assert.ok(blocks.some(b => b.id === BLOCKS.WATER), 'Aquarium should contain water');
      assert.ok(blocks.some(b => b.id === BLOCKS.SAND), 'Aquarium should have a sand bottom');
    });

    it('enforces global namespace and detects conflicts', () => {
      assert.strictEqual(BuildingLibrary.hasBuilding('Aquarium'), true);
      assert.strictEqual(BuildingLibrary.hasBuilding('aquarium'), true);
      assert.strictEqual(BuildingLibrary.hasBuilding('STAIRS'), true);
      assert.strictEqual(BuildingLibrary.hasBuilding('NonexistentUniqueName123'), false);
    });

    it('saves a custom structure and warns on duplicate name', () => {
      // Trying to save an existing name fails
      assert.throws(() => {
        BuildingLibrary.saveCustomBuilding({
          name: 'Stairs',
          parameters: [],
          generatorCode: 'function generate() { return []; }'
        });
      }, /already exists/i);

      // Unique name succeeds
      const saved = BuildingLibrary.saveCustomBuilding({
        name: 'My Custom Tower',
        parameters: [{ id: 'height', name: 'Height', default: 12, min: 2, max: 40 }],
        generatorCode: `function generate(params) {
          const blocks = [];
          for (let y = 0; y < (params.height || 10); y++) {
            blocks.push({ dx: 0, dy: y, dz: 0, id: 1 });
          }
          return blocks;
        }`
      });

      assert.ok(saved);
      assert.strictEqual(saved.name, 'My Custom Tower');
      assert.strictEqual(BuildingLibrary.hasBuilding('My Custom Tower'), true);
      assert.strictEqual(BuildingLibrary.hasBuilding('my custom tower'), true);

      // Now attempting to save with that name again throws
      assert.throws(() => {
        BuildingLibrary.saveCustomBuilding({
          name: 'my custom tower',
          parameters: [],
          generatorCode: 'function generate() { return []; }'
        });
      }, /already exists/i);
    });
  });

  describe('Prompt Parsing in Structure Studio', () => {
    it('parses explicit parameter prompts: "build a stair with a height parameter"', () => {
      const manager = new BuildingStudioManager({});
      const parsed = manager.parsePromptParameters('build a stair with a height parameter');
      assert.ok(parsed, 'Expected prompt to be parsed');
      assert.strictEqual(parsed.structure.id, 'stairs');
      assert.ok('height' in parsed.extractedParams);
      assert.strictEqual(parsed.extractedParams.height, 8); // default height
    });

    it('parses symbol / implied parameter prompts: "build a stair with a height H"', () => {
      const manager = new BuildingStudioManager({});
      const parsed = manager.parsePromptParameters('build a stair with a height H');
      assert.ok(parsed);
      assert.strictEqual(parsed.structure.id, 'stairs');
      assert.ok('height' in parsed.extractedParams);
    });

    it('parses numeric parameters: "build an aquarium with width 14 and height 8"', () => {
      const manager = new BuildingStudioManager({});
      const parsed = manager.parsePromptParameters('build an aquarium with width 14 and height 8');
      assert.ok(parsed);
      assert.strictEqual(parsed.structure.id, 'aquarium');
      assert.strictEqual(parsed.extractedParams.width, 14);
      assert.strictEqual(parsed.extractedParams.height, 8);
    });
  });

  describe('Creative Inventory Structure Tab', () => {
    it('includes "building" category in CREATIVE_TABS', () => {
      const structTab = CREATIVE_TABS.find(t => t.id === 'building');
      assert.ok(structTab, 'Expected "building" tab in CREATIVE_TABS');
      assert.strictEqual(structTab.name, 'Structures');
      assert.ok(structTab.icon.startsWith('/assets/'), 'Icon should have asset path');
    });

    it('lists all structures with icons and names in creative catalog', () => {
      const catalog = buildCreativeCatalog();
      const buildingItems = catalog.filter(it => it.category === 'structure');
      assert.ok(buildingItems.length >= 9, 'Should have all built-in structures in catalog');

      for (const item of buildingItems) {
        assert.ok(item.isBuilding, `Item ${item.name} should have isStructure: true`);
        assert.ok(item.buildingId, `Item ${item.name} should have structureId`);
        assert.ok(item.name, 'Item must have a name for hover tooltip');
        assert.ok(item.icon.startsWith('/assets/'), 'Item must have an icon path');
      }
    });
  });

  describe('HTML Layout Elements for Structure Studio', () => {
    it('has the Structure Studio button and modals in index.html', () => {
      const htmlPath = resolve(process.cwd(), 'index.html');
      const html = readFileSync(htmlPath, 'utf8');

      assert.ok(html.includes('id="btn-start-structure-studio"'), 'Missing btn-start-structure-studio');
      assert.ok(html.includes('Structure Studio'), 'Missing "Structure Studio" text in button');
      assert.ok(html.includes('id="structure-parameter-panel"'), 'Missing structure-parameter-panel');
      assert.ok(html.includes('id="btn-studio-save"'), 'Missing btn-studio-save');
      assert.ok(html.includes('id="btn-studio-open"'), 'Missing btn-studio-open');
      assert.ok(html.includes('id="modal-save-structure"'), 'Missing modal-save-structure');
      assert.ok(html.includes('id="modal-open-structure"'), 'Missing modal-open-structure');
    });
  });

  describe('Flat World Generation', () => {
    it('generates flat terrain (bedrock, dirt, grass, air above) when isFlatWorld is true', () => {
      const world = new World();
      world.isFlatWorld = true;

      const chunk = world.getOrCreateChunk(0, 0);
      assert.strictEqual(world.getVoxel(0, 0, 0), BLOCKS.BEDROCK, 'Y=0 should be bedrock');
      assert.strictEqual(world.getVoxel(0, 1, 0), BLOCKS.DIRT, 'Y=1 should be dirt');
      assert.strictEqual(world.getVoxel(0, 2, 0), BLOCKS.DIRT, 'Y=2 should be dirt');
      assert.strictEqual(world.getVoxel(0, 3, 0), BLOCKS.DIRT, 'Y=3 should be dirt');
      assert.strictEqual(world.getVoxel(0, 4, 0), BLOCKS.GRASS, 'Y=4 should be grass');
      assert.strictEqual(world.getVoxel(0, 5, 0), BLOCKS.AIR, 'Y=5 should be air');
      assert.strictEqual(world.getVoxel(0, 10, 0), BLOCKS.AIR, 'Y=10 should be air');
    });
  });

  describe('World Structure Placement', () => {
    it('executes structure build placing blocks in world coordinates', () => {
      const world = new World();
      world.isFlatWorld = true;
      world.getOrCreateChunk(0, 0);

      const stairs = BuildingLibrary.getBuilding('stairs');
      BuildingLibrary.executeBuildingBuild(stairs, { x: 0, y: 5, z: 0 }, { height: 4, width: 2 }, world);

      // Verify blocks placed in world
      assert.strictEqual(world.getVoxel(0, 5, 0), BLOCKS.STONE_BRICKS);
      assert.strictEqual(world.getVoxel(0, 6, 1), BLOCKS.STONE_BRICKS);
      assert.strictEqual(world.getVoxel(0, 7, 2), BLOCKS.STONE_BRICKS);
      assert.strictEqual(world.getVoxel(0, 8, 3), BLOCKS.STONE_BRICKS);
    });
  });

  describe('Overwrite, Rename, and Delete in Structure Studio', () => {
    it('prompts and overwrites custom structure when overwrite is true, rejects without overwrite', () => {
      const initial = BuildingLibrary.saveBuilding({
        name: 'Fortress',
        parameters: [{ id: 'size', name: 'Size', default: 10 }],
        code: 'function generate(origin, params, BLOCKS) { return [{ x: 0, y: 0, z: 0, id: 1 }]; }'
      });
      assert.strictEqual(initial.success, true);
      const originalId = initial.structure.id;

      // Duplicate save without overwrite fails
      const duplicate = BuildingLibrary.saveBuilding({
        name: 'Fortress',
        parameters: [{ id: 'size', name: 'Size', default: 20 }],
        code: 'function generate(origin, params, BLOCKS) { return []; }'
      }, false);
      assert.strictEqual(duplicate.success, false);
      assert.strictEqual(duplicate.error, 'NAME_CONFLICT');

      // Duplicate save with overwrite=true succeeds and updates in-place
      const overwritten = BuildingLibrary.saveBuilding({
        name: 'Fortress',
        parameters: [{ id: 'size', name: 'Size', default: 25 }],
        code: 'function generate(origin, params, BLOCKS) { return [{ x: 1, y: 1, z: 1, id: 2 }]; }',
        description: 'Updated Fortress'
      }, true);
      assert.strictEqual(overwritten.success, true);
      assert.strictEqual(overwritten.overwritten, true);
      assert.strictEqual(overwritten.structure.id, originalId);
      assert.strictEqual(overwritten.structure.parameters[0].default, 25);
      assert.strictEqual(overwritten.structure.description, 'Updated Fortress');

      // Built-in structure cannot be overwritten even with overwrite=true
      const builtinTry = BuildingLibrary.saveBuilding({
        name: 'Aquarium',
        parameters: []
      }, true);
      assert.strictEqual(builtinTry.success, false);
      assert.strictEqual(builtinTry.error, 'BUILTIN_CONFLICT');

      // Clean up
      BuildingLibrary.deleteBuilding(originalId);
    });

    it('renames custom structure successfully, preventing collisions and empty names', () => {
      const s1 = BuildingLibrary.saveBuilding({ name: 'Alpha Tower' });
      const s2 = BuildingLibrary.saveBuilding({ name: 'Beta Castle' });
      assert.strictEqual(s1.success, true);
      assert.strictEqual(s2.success, true);

      // Rejects empty name
      const emptyRes = BuildingLibrary.renameBuilding(s1.structure.id, '   ');
      assert.strictEqual(emptyRes.success, false);
      assert.strictEqual(emptyRes.error, 'EMPTY_NAME');

      // Rejects collision with another structure
      const conflictRes = BuildingLibrary.renameBuilding(s1.structure.id, 'Beta Castle');
      assert.strictEqual(conflictRes.success, false);
      assert.strictEqual(conflictRes.error, 'NAME_CONFLICT');

      // Renaming built-in structures now succeeds and can be restored
      const builtinRes = BuildingLibrary.renameBuilding('stairs', 'Grand Stairs');
      assert.strictEqual(builtinRes.success, true);
      assert.strictEqual(BuildingLibrary.hasBuilding('Grand Stairs'), true);
      assert.strictEqual(BuildingLibrary.hasDeletedOrRenamedDefaults(), true);
      BuildingLibrary.restoreDefaults();
      assert.strictEqual(BuildingLibrary.hasBuilding('Stairs'), true);
      assert.strictEqual(BuildingLibrary.hasDeletedOrRenamedDefaults(), false);

      // Successful rename of custom structure
      const renameRes = BuildingLibrary.renameBuilding(s1.structure.id, 'Omega Tower');
      assert.strictEqual(renameRes.success, true);
      assert.strictEqual(renameRes.structure.name, 'Omega Tower');
      assert.strictEqual(BuildingLibrary.hasBuilding('Omega Tower'), true);
      assert.strictEqual(BuildingLibrary.hasBuilding('Alpha Tower'), false);

      // Clean up
      BuildingLibrary.deleteBuilding(s1.structure.id);
      BuildingLibrary.deleteBuilding(s2.structure.id);
    });

    it('BuildingStudioManager handles overwrite confirmation and renders delete button & inline rename', () => {
      // Mock DOM environment
      function createMockNode(tag = 'div') {
        const node = {
          tagName: tag.toUpperCase(),
          className: '',
          id: '',
          textContent: '',
          value: '',
          title: '',
          style: {},
          disabled: false,
          children: [],
          listeners: {},
          classList: {
            classes: new Set(),
            add(c) { this.classes.add(c); },
            remove(c) { this.classes.delete(c); },
            contains(c) { return this.classes.has(c); }
          },
          appendChild(child) {
            this.children.push(child);
            return child;
          },
          append(...args) {
            for (const c of args) this.children.push(c);
          },
          querySelector(sel) {
            if (sel === 'input') return this.children.find(c => c.tagName === 'INPUT') || null;
            return null;
          },
          addEventListener(type, fn) {
            if (!this.listeners[type]) this.listeners[type] = [];
            this.listeners[type].push(fn);
          },
          dispatchEvent(evt) {
            const list = this.listeners[evt.type] || [];
            for (const fn of list) fn(evt);
          },
          focus() {},
          select() {}
        };
        return node;
      }

      const prevDoc = globalThis.document;
      const prevConfirm = globalThis.confirm;
      try {
        globalThis.document = {
          createElement: (tag) => createMockNode(tag),
          getElementById: (id) => null
        };

        const fakeGame = {
          world: { setVoxel: () => {} },
          ui: { addChatMessage: () => {} }
        };

        const studio = new BuildingStudioManager(fakeGame);
        studio.saveInput = createMockNode('input');
        studio.saveConflictMsg = createMockNode('div');
        studio.saveModal = createMockNode('div');
        studio.buildingNameBadge = createMockNode('span');
        studio.openList = createMockNode('div');

        // Create a custom structure
        const saved = BuildingLibrary.saveBuilding({
          name: 'Bridge',
          parameters: [],
          code: 'function generate() { return []; }'
        });

        studio.currentBuilding = {
          name: 'Bridge',
          parameters: [],
          code: 'function generate() { return []; }'
        };
        studio.saveInput.value = 'Bridge';

        // 1. User says NO to overwrite
        globalThis.confirm = () => false;
        studio.confirmSave();
        assert.ok(studio.saveConflictMsg.textContent.includes('already exists'));

        // 2. User says YES to overwrite
        globalThis.confirm = () => true;
        studio.confirmSave();
        assert.ok(studio.saveModal.classList.contains('hidden'));

        // 3. Render open structure list and check buttons
        studio.renderOpenBuildingList('');
        assert.ok(studio.openList.children.length > 0);

        // Find the card for Bridge and the card for Aquarium (built-in)
        const bridgeCard = studio.openList.children.find(c => {
          const info = c.children.find(ch => ch.className === 'studio-open-card-info');
          const nameEl = info?.children.find(ch => ch.className === 'studio-open-card-name');
          return nameEl?.textContent === 'Bridge';
        });
        assert.ok(bridgeCard, 'Bridge card should exist');

        const bridgeOpenBtn = bridgeCard.children.find(ch => ch.className?.includes('studio-btn-card-load'));
        assert.ok(bridgeOpenBtn, 'Bridge card must have open button');
        assert.strictEqual(bridgeOpenBtn.textContent, 'Open');

        const bridgeDeleteBtn = bridgeCard.children.find(ch => ch.className?.includes('studio-btn-card-delete'));
        assert.ok(bridgeDeleteBtn, 'Bridge card must have delete button');
        assert.strictEqual(bridgeDeleteBtn.textContent, 'Delete');
        assert.strictEqual(bridgeDeleteBtn.disabled, false);

        // Cancel deletion test
        globalThis.confirm = () => false;
        bridgeDeleteBtn.onclick({ stopPropagation: () => {} });
        assert.strictEqual(BuildingLibrary.hasBuilding('Bridge'), true, 'Cancelling confirmation leaves structure intact');
        globalThis.confirm = () => true;

        const aquariumCard = studio.openList.children.find(c => {
          const info = c.children.find(ch => ch.className === 'studio-open-card-info');
          const nameEl = info?.children.find(ch => ch.className === 'studio-open-card-name');
          return nameEl?.textContent === 'Aquarium';
        });
        assert.ok(aquariumCard, 'Aquarium card should exist');

        const aquariumDeleteBtn = aquariumCard.children.find(ch => ch.className?.includes('studio-btn-card-delete'));
        assert.ok(aquariumDeleteBtn, 'Aquarium card must have delete button');
        assert.strictEqual(aquariumDeleteBtn.disabled, false);

        // 4. Test double-click to rename built-in Aquarium
        const aquariumInfo = aquariumCard.children.find(ch => ch.className === 'studio-open-card-info');
        const aquariumNameEl = aquariumInfo.children.find(ch => ch.className === 'studio-open-card-name');
        aquariumNameEl.dispatchEvent({ type: 'dblclick', stopPropagation: () => {} });
        const aquariumRenameInput = aquariumNameEl.querySelector('input');
        assert.ok(aquariumRenameInput, 'Double click should spawn rename input for built-in structure');
        assert.strictEqual(aquariumRenameInput.value, 'Aquarium');

        aquariumRenameInput.value = 'Mega Aquarium';
        aquariumRenameInput.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} });
        assert.strictEqual(aquariumNameEl.textContent, 'Mega Aquarium');
        assert.strictEqual(BuildingLibrary.hasBuilding('Mega Aquarium'), true);

        // 5. Test delete button on built-in structure
        aquariumDeleteBtn.onclick({ stopPropagation: () => {} });
        assert.strictEqual(BuildingLibrary.hasBuilding('Mega Aquarium'), false);
        assert.strictEqual(BuildingLibrary.hasBuilding('Aquarium'), false);

        // Restore defaults
        BuildingLibrary.restoreDefaults();
        assert.strictEqual(BuildingLibrary.hasBuilding('Aquarium'), true);

        // 6. Test double-click to rename Bridge (custom structure)
        const bridgeInfo = bridgeCard.children.find(ch => ch.className === 'studio-open-card-info');
        const bridgeNameEl = bridgeInfo.children.find(ch => ch.className === 'studio-open-card-name');

        // Trigger dblclick
        bridgeNameEl.dispatchEvent({ type: 'dblclick', stopPropagation: () => {} });
        const renameInput = bridgeNameEl.querySelector('input');
        assert.ok(renameInput, 'Double click should spawn rename input');
        assert.strictEqual(renameInput.value, 'Bridge');

        // Simulate typing new name and pressing Enter
        renameInput.value = 'Arch Bridge';
        renameInput.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {}, stopPropagation: () => {} });

        assert.strictEqual(bridgeNameEl.textContent, 'Arch Bridge');
        assert.strictEqual(BuildingLibrary.hasBuilding('Arch Bridge'), true);

        // Clean up
        BuildingLibrary.deleteBuilding(saved.structure.id);
      } finally {
        globalThis.document = prevDoc;
        globalThis.confirm = prevConfirm;
      }
    });
  });
});
