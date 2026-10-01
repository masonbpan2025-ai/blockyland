import test from 'node:test';
import assert from 'node:assert';
import * as THREE from 'three';
import fs from 'node:fs';
import path from 'node:path';
import { MobLibrary, BUILTIN_MOBS } from '../src/mobLibrary.js';
import { MobStudioManager } from '../src/mobStudio.js';
import { MobManager } from '../src/mobs.js';
import { buildCreativeCatalog, getCreativeItemsByTab, searchCreativeItems } from '../src/creativeCatalog.js';

test('MobLibrary: has all required builtin presets and global namespace enforcement', () => {
  const allMobs = MobLibrary.getAllMobs();
  assert.ok(allMobs.length >= 8, `Expected at least 8 library mobs, found ${allMobs.length}`);

  const dragon = MobLibrary.getMob('fire_dragon');
  assert.ok(dragon, 'Fire Dragon preset must exist in MobLibrary');
  assert.strictEqual(dragon.look.modelType, 'flying');
  assert.ok(dragon.look.hasWings, 'Fire Dragon should have wings');
  assert.ok(dragon.skills.includes('fireball'), 'Fire Dragon should have fireball skill');

  const roboPet = MobLibrary.getMob('robo_pet');
  assert.ok(roboPet, 'Robo Pet preset must exist in MobLibrary');
  assert.strictEqual(roboPet.behavior.type, 'pet');
  assert.strictEqual(roboPet.behavior.followPlayer, true);

  // Global namespace conflict check
  assert.strictEqual(MobLibrary.hasMob('Fire Dragon'), true);
  assert.strictEqual(MobLibrary.hasMob('fire dragon'), true);
  assert.strictEqual(MobLibrary.hasMob('zombie'), true);
  assert.strictEqual(MobLibrary.hasMob('NonExistentMobXYZ'), false);
});

test('MobLibrary: saves custom mob, generates egg icon, and detects duplicate name collision', () => {
  const customMobData = {
    name: 'Thunder Titan',
    description: 'A towering titan of electric fury',
    look: {
      modelType: 'golem',
      mainColor: '#facc15',
      accentColor: '#3b82f6',
      eyeColor: '#ffffff',
      scale: 1.6,
      hasWings: false,
      hasHorns: true,
      hasGlowingEyes: true
    },
    behavior: {
      type: 'boss',
      health: 200,
      speed: 2.0,
      attack: 12,
      followPlayer: false,
      range: 24
    },
    skills: ['lightning', 'leap'],
    eggColors: { primary: '#facc15', secondary: '#3b82f6' }
  };

  const saveRes = MobLibrary.saveCustomMob(customMobData);
  assert.strictEqual(saveRes.success, true);
  assert.ok(saveRes.mob.id);

  // Check collision when saving the same name again
  const duplicateRes = MobLibrary.saveCustomMob(customMobData);
  assert.strictEqual(duplicateRes.success, false);
  assert.strictEqual(duplicateRes.error, 'NAME_CONFLICT');
  assert.ok(duplicateRes.message.includes('already exists'));

  // SVG Egg Icon Generation
  const svgIcon = MobLibrary.generateEggIcon('#facc15', '#3b82f6');
  assert.ok(svgIcon.startsWith('data:image/svg+xml'));
  assert.ok(svgIcon.includes('%23facc15') || svgIcon.includes('#facc15'));

  // Cleanup saved test mob
  MobLibrary.deleteMob(saveRes.mob.id);
});

test('MobStudioManager: parses agent terminal prompt for look, stats, behavior, and skills', () => {
  const fakeGame = {
    player: { position: new THREE.Vector3(0, 5, 0), gamemode: 'creative', yaw: 0, pitch: 0 },
    world: { getVoxel: () => 0, setVoxel: () => {} },
    mobs: { spawnCustomMob: (def) => ({ mesh: new THREE.Group(), customDef: def }) }
  };

  const studio = new MobStudioManager(fakeGame);

  // Prompt 1: Fire Dragon
  const res1 = studio.handleAgentPrompt('make a fast red fire dragon with 100 hp and 15 attack that shoots fireballs');
  assert.strictEqual(res1, true);
  assert.strictEqual(studio.currentMob.look.modelType, 'flying');
  assert.strictEqual(studio.currentMob.look.hasWings, true);
  assert.strictEqual(studio.currentMob.behavior.health, 100);
  assert.strictEqual(studio.currentMob.behavior.attack, 15);
  assert.ok(studio.currentMob.skills.includes('fireball'));

  // Prompt 2: Friendly Blue Robot Pet
  const res2 = studio.handleAgentPrompt('create a friendly blue robot pet that can heal and teleport');
  assert.strictEqual(res2, true);
  assert.strictEqual(studio.currentMob.behavior.type, 'pet');
  assert.strictEqual(studio.currentMob.behavior.followPlayer, true);
  assert.strictEqual(studio.currentMob.look.mainColor, '#3b82f6');
  assert.ok(studio.currentMob.skills.includes('heal'));
  assert.ok(studio.currentMob.skills.includes('teleport'));

  // Prompt 3: Giant Golden Golem Boss
  const res3 = studio.handleAgentPrompt('summon a giant gold golem boss with 250 hp');
  assert.strictEqual(res3, true);
  assert.strictEqual(studio.currentMob.look.modelType, 'golem');
  assert.strictEqual(studio.currentMob.behavior.type, 'boss');
  assert.strictEqual(studio.currentMob.behavior.health, 250);
  assert.strictEqual(studio.currentMob.look.mainColor, '#facc15');

  // Prompt 4: Green Bouncy Slime
  const res4 = studio.handleAgentPrompt('create a green slime');
  assert.strictEqual(res4, true);
  assert.strictEqual(studio.currentMob.look.modelType, 'slime');
  assert.strictEqual(studio.currentMob.look.mainColor, '#22c55e');
});

test('Creative Catalog: includes spawn eggs for all library and custom mobs in spawn_eggs tab', () => {
  const catalog = buildCreativeCatalog();
  const spawnEggItems = getCreativeItemsByTab('spawn_eggs');

  assert.ok(spawnEggItems.length >= 13, `Expected at least 13 spawn egg items, got ${spawnEggItems.length}`);

  // Check preset spawn eggs
  const dragonEgg = spawnEggItems.find(it => it.id === 'spawn_egg_fire_dragon');
  assert.ok(dragonEgg, 'Fire Dragon Spawn Egg should be present in spawn_eggs category');
  assert.strictEqual(dragonEgg.name, 'Fire Dragon Spawn Egg');
  assert.strictEqual(dragonEgg.tab, 'spawn_eggs');
  assert.ok(dragonEgg.icon.startsWith('/assets/'));

  const roboEgg = spawnEggItems.find(it => it.id === 'spawn_egg_robo_pet');
  assert.ok(roboEgg, 'Robo Pet Spawn Egg should be present in spawn_eggs category');
});

test('MobManager: spawnCustomMob builds 3D meshes with custom look, features, and stats', () => {
  const scene = new THREE.Scene();
  const mobMgr = Object.assign(Object.create(MobManager.prototype), {
    scene,
    world: { getVoxel: () => 0 },
    sounds: { playZombie: () => {}, playPop: () => {} },
    mobs: [],
    createCustomMobTexture: () => new THREE.Texture()
  });

  const testMobDef = {
    id: 'test_custom_mob',
    name: 'Demon Lord',
    look: {
      modelType: 'humanoid',
      mainColor: '#7c3aed',
      accentColor: '#ec4899',
      eyeColor: '#facc15',
      scale: 1.2,
      hasWings: true,
      hasHorns: true,
      hasGlowingEyes: true
    },
    behavior: {
      type: 'boss',
      health: 80,
      speed: 3.0,
      attack: 8,
      followPlayer: false
    },
    skills: ['fireball', 'teleport']
  };

  const spawned = mobMgr.spawnCustomMob(testMobDef, 0, 4, 6);
  assert.ok(spawned, 'Custom mob should spawn successfully');
  assert.strictEqual(spawned.isCustomMob, true);
  assert.strictEqual(spawned.name, 'Demon Lord');
  assert.strictEqual(spawned.health, 80);
  assert.strictEqual(spawned.maxHealth, 80);
  assert.strictEqual(spawned.speed, 3.0);
  assert.strictEqual(spawned.attackDamage, 8);
  assert.strictEqual(spawned.behaviorType, 'boss');
  assert.ok(spawned.wings, 'Mob with wings should have wings object');
  assert.ok(spawned.mesh, 'Mob should have Three.js Group mesh');
  assert.strictEqual(spawned.mesh.scale.x, 1.2);

  // Calling spawnMob with def or id
  const spawnedFromId = mobMgr.spawnMob('fire_dragon', 2, 4, 2);
  assert.ok(spawnedFromId, 'Should spawn Fire Dragon using spawnMob(id)');
  assert.strictEqual(spawnedFromId.name, 'Fire Dragon');
});

test('index.html: contains Mob Studio button in start screen and mob parameter panel / modals', () => {
  const htmlPath = path.resolve('index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Start screen button
  assert.ok(html.includes('id="btn-start-mob-studio"'), 'Start screen must have #btn-start-mob-studio');
  assert.ok(html.includes('Mob Studio'), 'Button text must include Mob Studio');

  // Workspace parameter panel
  assert.ok(html.includes('id="mob-parameter-panel"'), 'Workspace must have #mob-parameter-panel');
  assert.ok(html.includes('id="mob-input-name"'), 'Must have mob name input');
  assert.ok(html.includes('id="mob-select-model"'), 'Must have model select');
  assert.ok(html.includes('id="mob-skills-checkboxes"'), 'Must have skills checkboxes');
  assert.ok(html.includes('id="btn-mob-studio-save"'), 'Must have save button');
  assert.ok(html.includes('id="btn-mob-studio-open"'), 'Must have open button');

  // Modals
  assert.ok(html.includes('id="modal-save-mob"'), 'Must have #modal-save-mob');
  assert.ok(html.includes('id="modal-open-mob"'), 'Must have #modal-open-mob');
});

test('MobLibrary: overwrite support on duplicate save and renameMob', () => {
  const m1 = MobLibrary.saveMob({
    name: 'Shadow Stalker',
    description: 'A shadowy stalker',
    look: { modelType: 'humanoid', mainColor: '#111827' },
    behavior: { health: 50, attack: 6 }
  });
  assert.strictEqual(m1.success, true);
  const m1Id = m1.mob.id;

  // Duplicate save with overwrite=false fails
  const dup = MobLibrary.saveMob({
    name: 'Shadow Stalker',
    description: 'Updated stalker',
    behavior: { health: 80, attack: 10 }
  }, false);
  assert.strictEqual(dup.success, false);
  assert.strictEqual(dup.error, 'NAME_CONFLICT');

  // Duplicate save with overwrite=true succeeds in-place
  const over = MobLibrary.saveMob({
    name: 'Shadow Stalker',
    description: 'Updated stalker',
    behavior: { health: 80, attack: 10 }
  }, true);
  assert.strictEqual(over.success, true);
  assert.strictEqual(over.overwritten, true);
  assert.strictEqual(over.mob.id, m1Id);
  assert.strictEqual(over.mob.behavior.health, 80);
  assert.strictEqual(over.mob.description, 'Updated stalker');

  // Built-in mob cannot be overwritten
  const builtinTry = MobLibrary.saveMob({ name: 'Zombie' }, true);
  assert.strictEqual(builtinTry.success, false);
  assert.strictEqual(builtinTry.error, 'BUILTIN_CONFLICT');

  // Renaming
  const emptyRes = MobLibrary.renameMob(m1Id, '   ');
  assert.strictEqual(emptyRes.success, false);
  assert.strictEqual(emptyRes.error, 'EMPTY_NAME');

  const builtinRename = MobLibrary.renameMob('zombie', 'New Zombie');
  assert.strictEqual(builtinRename.success, false);
  assert.strictEqual(builtinRename.error, 'BUILTIN_READONLY');

  const renameRes = MobLibrary.renameMob(m1Id, 'Night Phantom');
  assert.strictEqual(renameRes.success, true);
  assert.strictEqual(renameRes.mob.name, 'Night Phantom');
  assert.strictEqual(MobLibrary.hasMob('Night Phantom'), true);
  assert.strictEqual(MobLibrary.hasMob('Shadow Stalker'), false);

  // Clean up
  MobLibrary.deleteMob(m1Id);
});

test('MobStudioManager: confirmSave overwrite prompt and load menu double-click rename', () => {
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
      world: { getVoxel: () => 0, setVoxel: () => {} },
      ui: { addChatMessage: () => {} }
    };

    const studio = new MobStudioManager(fakeGame);
    studio.saveInput = createMockNode('input');
    studio.saveConflictMsg = createMockNode('div');
    studio.saveModal = createMockNode('div');
    studio.openList = createMockNode('div');

    const saved = MobLibrary.saveMob({
      name: 'Crystal Beast',
      look: { modelType: 'quadruped' },
      behavior: { health: 60 }
    });

    studio.currentMob = {
      name: 'Crystal Beast',
      look: { modelType: 'quadruped', mainColor: '#06b6d4' },
      behavior: { health: 70, type: 'hostile' },
      skills: [],
      eggColors: { primary: '#06b6d4', secondary: '#3b82f6' }
    };
    studio.saveInput.value = 'Crystal Beast';

    // 1. User says NO to overwrite
    globalThis.confirm = () => false;
    studio.confirmSave();
    assert.ok(studio.saveConflictMsg.textContent.includes('already exists'));

    // 2. User says YES to overwrite
    globalThis.confirm = () => true;
    studio.confirmSave();
    assert.ok(studio.saveModal.classList.contains('hidden'));

    // 3. Render open mob list
    studio.renderOpenMobList('');
    const beastCard = studio.openList.children.find(c => {
      const info = c.children.find(ch => ch.className === 'studio-open-card-info');
      const title = info?.children.find(ch => ch.className === 'studio-open-card-name');
      return title?.textContent === 'Crystal Beast';
    });
    assert.ok(beastCard, 'Crystal Beast card should exist in open list');

    // Check open & delete buttons exist and have compact labels
    const openBtn = beastCard.children.find(ch => ch.className?.includes('studio-btn-card-load'));
    assert.ok(openBtn, 'Card must have open button');
    assert.strictEqual(openBtn.textContent, 'Open');

    const deleteBtn = beastCard.children.find(ch => ch.className?.includes('studio-btn-card-delete'));
    assert.ok(deleteBtn, 'Card must have delete button');
    assert.strictEqual(deleteBtn.textContent, 'Delete');
    assert.strictEqual(deleteBtn.disabled, false);

    // Cancel deletion test
    globalThis.confirm = () => false;
    deleteBtn.onclick({ stopPropagation: () => {} });
    assert.strictEqual(MobLibrary.hasMob('Crystal Beast'), true, 'Cancelling confirmation leaves mob intact');
    globalThis.confirm = () => true;

    // 4. Test double-click to rename Crystal Beast
    const beastInfo = beastCard.children.find(ch => ch.className === 'studio-open-card-info');
    const beastTitle = beastInfo.children.find(ch => ch.className === 'studio-open-card-name');

    beastTitle.dispatchEvent({ type: 'dblclick', stopPropagation: () => {} });
    const renameInput = beastTitle.querySelector('input');
    assert.ok(renameInput, 'Double click should spawn rename input');
    assert.strictEqual(renameInput.value, 'Crystal Beast');

    // Type new name and press Enter
    renameInput.value = 'Diamond Beast';
    renameInput.dispatchEvent({ type: 'keydown', key: 'Enter', preventDefault: () => {} });

    assert.strictEqual(beastTitle.textContent, 'Diamond Beast');
    assert.strictEqual(MobLibrary.hasMob('Diamond Beast'), true);

    // Clean up
    MobLibrary.deleteMob(saved.mob.id);
  } finally {
    globalThis.document = prevDoc;
    globalThis.confirm = prevConfirm;
  }
});

