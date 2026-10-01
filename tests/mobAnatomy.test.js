// A requested character needs a silhouette, not just a colour.
//
// Regression guard: the mob builder only understood a body type, one colour and
// three boolean flags, so "make a Pikachu" produced a flat rectangle with a snout
// and a stub tail — nothing like the character. Ears, a bolt tail and face
// markings are what make it recognisable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MobManager } from '../src/mobs.js';
import { MobStudioManager } from '../src/mobStudio.js';
import { MobLibrary } from '../src/mobLibrary.js';
import { validatePlan } from '../src/agentPlans.js';

function mobManager() {
  return Object.assign(Object.create(MobManager.prototype), {
    scene: new THREE.Scene(),
    world: { getVoxel: () => 0 },
    sounds: {},
    mobs: [],
    createCustomMobTexture: () => new THREE.Texture()
  });
}

function spawn(look, modelType = 'quadruped') {
  return mobManager().spawnCustomMob({
    id: 'test', name: 'Test',
    look: { modelType, mainColor: '#f7d02c', accentColor: '#8b4513', eyeColor: '#1a1a1a', ...look },
    behavior: { type: 'pet', health: 35, speed: 3, attack: 4 },
    skills: []
  }, 0, 4, 6);
}

/** Count meshes anywhere in a Group, or across an array of them. */
function countMeshes(object, predicate = null) {
  const roots = Array.isArray(object) ? object.filter(Boolean) : (object ? [object] : []);
  let total = 0;
  for (const root of roots) {
    if (typeof root.traverse !== 'function') continue;
    root.traverse(node => {
      if (node.isMesh && (!predicate || predicate(node))) total++;
    });
  }
  return total;
}

// --- the reported bug -------------------------------------------------------

test('pointed ears and a bolt tail are actually built into the mesh', () => {
  const plain = spawn({});
  const withAnatomy = spawn({ ears: 'pointed', tail: 'lightning' });

  assert.ok(countMeshes(withAnatomy.mesh) > countMeshes(plain.mesh),
    'the anatomy adds geometry rather than only changing colour');

  // Two ears, each itself a small group of parts.
  const ears = mobManager().addMobEars(new THREE.Group(), null, { ears: 'pointed' });
  assert.equal(ears.length, 2);
  for (const ear of ears) {
    assert.ok(countMeshes(ear) >= 2, 'each ear has at least a base and a tip');
  }

  // The bolt tail is a multi-segment zigzag, not a single stub.
  const tail = mobManager().addMobTail(new THREE.Group(), { tail: 'lightning' }, 'quadruped');
  assert.ok(tail, 'a lightning tail is built');
  assert.ok(countMeshes(tail) >= 4, `expected a multi-segment bolt, got ${countMeshes(tail)} parts`);
  assert.equal(mobManager().addMobTail(new THREE.Group(), { tail: 'long' }, 'quadruped').length, 1);
});

test('ear tips take their own colour, as a lightning mouse needs', () => {
  const group = new THREE.Group();
  const ears = mobManager().addMobEars(group, null, {
    mainColor: '#f7d02c', accentColor: '#8b4513', earTipColor: '#1a1a1a', ears: 'pointed'
  });
  assert.equal(ears.length, 2);

  // Each ear is a group holding a base mesh and a tip mesh.
  const colors = [];
  for (const ear of ears) {
    const meshes = [];
    ear.traverse(node => { if (node.isMesh) meshes.push(node); });
    assert.ok(meshes.length >= 2, 'each ear has a base and a tip');
    for (const mesh of meshes) colors.push(`#${mesh.material.color.getHexString()}`);
  }
  assert.ok(colors.includes('#1a1a1a'), `expected a black tip, got ${colors.join(', ')}`);
  assert.ok(colors.includes('#f7d02c'), 'and a yellow ear body');
});

test('each ear style produces a distinct shape', () => {
  const measure = style => {
    const group = new THREE.Group();
    mobManager().addMobEars(group, null, { ears: style, earTipColor: '#000000' });
    const box = new THREE.Box3().setFromObject(group);
    return box.getSize(new THREE.Vector3());
  };
  const long = measure('long');
  const round = measure('round');
  assert.ok(long.y > round.y, 'long ears are taller than round ones');
  assert.ok(round.x > long.x, 'round ears are wider than long ones');
});

test('"none" or an absent style adds no ears, and flying keeps its own tail', () => {
  assert.equal(mobManager().addMobEars(new THREE.Group(), null, { ears: 'none' }), null);
  assert.equal(mobManager().addMobEars(new THREE.Group(), null, {}), null);
  assert.equal(mobManager().addMobEars(new THREE.Group(), null, { ears: 'nonsense' }), null);
  assert.equal(mobManager().addMobTail(new THREE.Group(), { tail: 'lightning' }, 'flying'), null,
    'the flying model already builds a tail fin');
  assert.equal(mobManager().addMobTail(new THREE.Group(), { tail: 'none' }, 'quadruped'), null);
});

// --- face markings ----------------------------------------------------------

test('face markings are painted into the head texture', () => {
  // Capture what the texture generator draws. The canvas factory is injected
  // rather than stubbing a global `document`: the whole suite shares one process,
  // and a leaked global breaks unrelated test files.
  const calls = [];
  const ctx = {
    fillStyle: '', fillRect: (x, y, w, h) => calls.push({ x, y, w, h, style: ctx.fillStyle }),
    getImageData: () => ({ data: [] })
  };
  const createCanvas = () => ({ width: 0, height: 0, getContext: () => ctx });
  const mgr = Object.assign(Object.create(MobManager.prototype), {});

  mgr.createCustomMobTexture(
    { mainColor: '#f7d02c', accentColor: '#8b4513', eyeColor: '#1a1a1a', hasCheekPatches: true, cheekColor: '#e3342f', hasMouth: true, hasNose: true },
    createCanvas
  );

  const cheek = calls.filter(c => c.style === '#e3342f');
  assert.equal(cheek.length, 2, 'two cheek patches are drawn');
  // Both must land on the head front face.
  for (const patch of cheek) {
    assert.ok(patch.x >= 8 && patch.x < 16, `cheek x out of the face: ${patch.x}`);
    assert.ok(patch.y >= 8 && patch.y < 16, `cheek y out of the face: ${patch.y}`);
  }
  // A mouth is drawn in a near-black; the exact alpha is not important.
  const mouth = calls.filter(c => /^rgba\(0, 0, 0, 0\.[6-9]/.test(String(c.style)));
  assert.ok(mouth.length >= 2, `a mouth should be drawn, got ${mouth.length} strokes`);
  assert.equal(typeof globalThis.document, 'undefined', 'no global document was installed');
});

test('face markings are omitted when not requested', () => {
  const calls = [];
  const ctx = { fillStyle: '', fillRect: (x, y, w, h) => calls.push({ x, y, w, h, style: ctx.fillStyle }), getImageData: () => ({ data: [] }) };
  const mgr = Object.assign(Object.create(MobManager.prototype), {});
  mgr.createCustomMobTexture({ mainColor: '#7c3aed' }, () => ({ width: 0, height: 0, getContext: () => ctx }));
  assert.equal(calls.filter(c => c.style === '#e3342f').length, 0, 'no cheeks by default');
});

test('the texture generator still works without a canvas available at all', () => {
  const mgr = Object.assign(Object.create(MobManager.prototype), {});
  // No factory and no document: must degrade to a blank texture, not throw.
  assert.doesNotThrow(() => mgr.createCustomMobTexture({ mainColor: '#ffffff' }));
});

// --- validation -------------------------------------------------------------

test('the new appearance fields are validated', () => {
  const base = { name: 'Pika', look: {} };
  const ok = look => validatePlan({ action: 'create_mob', mob: { ...base, look } });

  assert.doesNotThrow(() => ok({ ears: 'pointed', tail: 'lightning', earTipColor: '#1a1a1a', hasCheekPatches: true, cheekColor: '#e3342f', hasMouth: true, hasNose: true }));
  assert.doesNotThrow(() => ok({ ears: 'none', tail: 'none' }));

  assert.throws(() => ok({ ears: 'floppy' }), /ear style/);
  assert.throws(() => ok({ tail: 'curly' }), /tail style/);
  assert.throws(() => ok({ earTipColor: 'black' }), /earTipColor/);
  assert.throws(() => ok({ cheekColor: 'red' }), /cheekColor/);
  assert.throws(() => ok({ hasCheekPatches: 'yes' }), /hasCheekPatches/);
});

test('every model type the renderer can build is accepted by the validator', () => {
  // biped_creature (the upright chibi body) is offered in the Studio panel and
  // handled by the renderer, so the validator must not reject it.
  for (const modelType of ['humanoid', 'quadruped', 'biped_creature', 'flying', 'golem', 'slime']) {
    assert.doesNotThrow(
      () => validatePlan({ action: 'create_mob', mob: { name: `T ${modelType}`, look: { modelType } } }),
      `${modelType} should be a valid model type`
    );
  }
  assert.throws(() => validatePlan({ action: 'create_mob', mob: { name: 'X', look: { modelType: 'dragon' } } }), /model type/);
});

test('the model is taught the anatomy, with a worked character example', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/worldAgent.js'), 'utf8');
  for (const cue of ['"ears"', 'earTipColor', '"tail"', 'hasCheekPatches', 'hasMouth', 'hasNose', 'Worked example']) {
    assert.ok(source.includes(cue), `the prompt should document ${cue}`);
  }
});

test('a full Pikachu definition passes validation and spawns with its anatomy', () => {
  const plan = {
    action: 'create_mob',
    mob: {
      name: 'Pikachu',
      look: {
        modelType: 'quadruped', mainColor: '#f7d02c', accentColor: '#8b4513', eyeColor: '#1a1a1a',
        scale: 0.8, ears: 'pointed', earTipColor: '#1a1a1a', tail: 'lightning', tailColor: '#f7d02c',
        hasCheekPatches: true, cheekColor: '#e3342f', hasMouth: true, hasNose: true
      },
      behavior: { type: 'pet', health: 35, attack: 4, speed: 3.4 },
      skills: ['lightning']
    }
  };
  assert.doesNotThrow(() => validatePlan(plan));

  const withAnatomy = spawn(plan.mob.look);
  const bare = spawn({ ears: 'none', tail: 'none' });
  assert.ok(countMeshes(withAnatomy.mesh) > countMeshes(bare.mesh),
    'the Pikachu build must contain more parts than a bare quadruped');
});

// --- Delete button ----------------------------------------------------------

test('the mob library load list offers a Delete button beside Load', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/mobStudio.js'), 'utf8');
  assert.match(source, /studio-btn-card-delete/, 'a delete button class is used');
  assert.match(source, /textContent = 'Delete'/, 'labelled Delete');
  assert.match(source, /MobLibrary\.deleteMob\(mob\.id\)/, 'it removes the mob from the library');
  assert.match(source, /btnDelete\.disabled = true/, 'built-in mobs cannot be deleted');
  assert.match(source, /this\.renderOpenMobList\(query\)/, 'the list refreshes after a delete');
});

test('deleting removes a custom mob but never a built-in one', () => {
  // deleteMob only knows custom mobs, which is what makes built-ins safe.
  const before = MobLibrary.getAllMobs().length;
  assert.equal(MobLibrary.deleteMob('fire_dragon'), false, 'a built-in mob cannot be deleted');
  assert.equal(MobLibrary.getAllMobs().length, before, 'the library is unchanged');

  const saved = MobLibrary.saveCustomMob({ name: `Deletable ${Date.now()}`, look: {}, behavior: {}, skills: [] });
  assert.ok(saved && saved.success !== false, 'the custom mob should save');
  // saveCustomMob returns { success, mob }.
  assert.equal(MobLibrary.deleteMob(saved.mob.id), true, 'a custom mob can be deleted');
  assert.equal(MobLibrary.getMob(saved.mob.id), null, 'and is gone afterwards');
});

test('biped_creature archetype renders authentic Pikachu body, folded paws, and flat feet', () => {
  const pikaDef = {
    id: 'test_pikachu',
    name: 'Pikachu',
    look: {
      modelType: 'biped_creature',
      mainColor: '#f7d02c',
      accentColor: '#8b4513',
      eyeColor: '#111111',
      scale: 0.85,
      ears: 'pointed',
      earTipColor: '#111111',
      tail: 'lightning',
      tailColor: '#f7d02c',
      hasCheekPatches: true,
      cheekColor: '#e3342f',
      hasMouth: true,
      hasNose: true,
      hasBackStripes: true
    },
    behavior: { type: 'pet', health: 45, attack: 6, speed: 3.6, followPlayer: true },
    skills: ['lightning']
  };

  const mgr = mobManager();
  const mob = mgr.spawnCustomMob(pikaDef, 0, 4, 6);
  assert.ok(mob, 'Pikachu custom mob spawns successfully');
  assert.ok(mob.mesh, 'Mesh group exists');
  assert.ok(mob.head, 'Head exists');
  assert.ok(mob.leftArm && mob.rightArm, 'Folded arms/paws exist');
  assert.ok(mob.leftLeg && mob.rightLeg, 'Flat feet exist');
  assert.ok(countMeshes(mob.mesh) >= 8, 'Has head, torso, 2 arms, 2 feet, 2 ears, and tail');

  // Pig snout is not present
  let hasSnout = false;
  mob.head.traverse(child => {
    if (child.isMesh && child.geometry?.parameters?.width === 0.25) hasSnout = true;
  });
  assert.strictEqual(hasSnout, false, 'No pig snout on Pikachu biped creature');
});

test('MobLibrary preserves full anatomy fields on custom mob save', () => {
  const uniqueName = `Electric Pet ${Date.now()}`;
  const saveRes = MobLibrary.saveMob({
    name: uniqueName,
    description: 'Electric pet with custom anatomy',
    look: {
      modelType: 'biped_creature',
      mainColor: '#f7d02c',
      accentColor: '#8b4513',
      eyeColor: '#111111',
      scale: 0.9,
      ears: 'pointed',
      earTipColor: '#111111',
      tail: 'lightning',
      tailColor: '#f7d02c',
      hasCheekPatches: true,
      cheekColor: '#e3342f',
      hasMouth: true,
      hasNose: true,
      hasBackStripes: true
    },
    behavior: { type: 'pet', health: 50, speed: 3.5, attack: 6 },
    skills: ['lightning']
  });

  assert.strictEqual(saveRes.success, true);
  const loaded = MobLibrary.getMob(saveRes.mob.id);
  assert.ok(loaded, 'Saved mob is retrievable');
  assert.strictEqual(loaded.look.modelType, 'biped_creature');
  assert.strictEqual(loaded.look.ears, 'pointed');
  assert.strictEqual(loaded.look.earTipColor, '#111111');
  assert.strictEqual(loaded.look.tail, 'lightning');
  assert.strictEqual(loaded.look.tailColor, '#f7d02c');
  assert.strictEqual(loaded.look.hasCheekPatches, true);
  assert.strictEqual(loaded.look.cheekColor, '#e3342f');
  assert.strictEqual(loaded.look.hasMouth, true);
  assert.strictEqual(loaded.look.hasNose, true);
  assert.strictEqual(loaded.look.hasBackStripes, true);

  MobLibrary.deleteMob(saveRes.mob.id);
});

test('Builtin Pikachu preset exists in MobLibrary with biped_creature model', () => {
  const pika = MobLibrary.getMob('pikachu');
  assert.ok(pika, 'Pikachu builtin preset must exist');
  assert.strictEqual(pika.name, 'Pikachu');
  assert.strictEqual(pika.look.modelType, 'biped_creature');
  assert.strictEqual(pika.look.ears, 'pointed');
  assert.strictEqual(pika.look.tail, 'lightning');
  assert.strictEqual(pika.look.hasCheekPatches, true);
  assert.ok(pika.skills.includes('lightning'));
});

test('Pikachu biped_creature updates and walks without crashing render loop', () => {
  const mgr = Object.assign(Object.create(MobManager.prototype), {
    scene: new THREE.Scene(),
    world: { getVoxel: () => 0 },
    sounds: {},
    mobs: [],
    arrows: [],
    createCustomMobTexture: () => new THREE.Texture(),
    checkMobCollision: () => false,
    isBlockSolid: () => true
  });
  const pika = MobLibrary.getMob('pikachu');
  const mob = mgr.spawnCustomMob(pika, 0, 4, 6);
  const mockPlayer = { position: new THREE.Vector3(0, 4, 0), takeDamage() {} };

  assert.doesNotThrow(() => {
    for (let frame = 0; frame < 30; frame++) {
      mgr.update(0.016, mockPlayer);
    }
  }, 'Pikachu update loop must not throw undefined rotation errors');
  assert.ok(typeof mob.leftLeg.rotation.x === 'number', 'Leg rotation should animate as a number');
});

test('Pikachu behaves like a bunny (hops around near player, follows player, retaliates with lightning on attack)', () => {
  let thunderPlayed = false;
  let playerDamageReceived = 0;
  let chatNotifications = [];

  const mockPlayer = {
    position: new THREE.Vector3(0, 4, 2),
    velocity: new THREE.Vector3(),
    takeDamage(amount) {
      playerDamageReceived += amount;
    }
  };

  const mgr = Object.assign(Object.create(MobManager.prototype), {
    scene: new THREE.Scene(),
    world: { getVoxel: () => 0 },
    sounds: {
      playThunder: () => { thunderPlayed = true; },
      playPop: () => {},
      playHurt: () => {}
    },
    mobs: [],
    arrows: [],
    createCustomMobTexture: () => new THREE.Texture(),
    checkMobCollision: (m, p) => p.y <= 4,
    isBlockSolid: () => true
  });

  mgr.game = {
    player: mockPlayer,
    ui: {
      addChatMessage: (msg) => chatNotifications.push(msg)
    }
  };

  const pika = MobLibrary.getMob('pikachu');
  const mob = mgr.spawnCustomMob(pika, 0, 4.05, 0);
  assert.ok(mob.isPikachu, 'Pikachu is identified for bunny behavior');

  // 1. Hopping around near player
  let observedHop = false;
  for (let frame = 0; frame < 50; frame++) {
    mgr.update(0.04, mockPlayer);
    if (mob.velocity.y > 2.0) {
      observedHop = true;
    }
  }
  assert.ok(observedHop, 'Pikachu must perform bunny hops into the air');

  // 2. Following player when player moves away
  mockPlayer.position.set(12, 4, 12);
  let movedTowardPlayer = false;
  for (let frame = 0; frame < 30; frame++) {
    mgr.update(0.04, mockPlayer);
    if (mob.velocity.length() > 0.5) {
      movedTowardPlayer = true;
    }
  }
  assert.ok(movedTowardPlayer, 'Pikachu must hop towards distant player to follow');

  // 3. Retaliate with lightning when attacked by player
  mockPlayer.position.set(mob.mesh.position.x + 1, mob.mesh.position.y, mob.mesh.position.z + 1);
  const success = mgr.damageMob(mob, 4, mockPlayer.position, false);
  assert.ok(success, 'Pikachu received damage');
  assert.ok(thunderPlayed, 'Thunder sound should play during retaliation');
  assert.ok(playerDamageReceived > 0, 'Player should receive lightning retaliation damage');
  assert.ok(chatNotifications.some(msg => msg.includes('Pikachu retaliated with Thunderbolt')), 'Chat notification should announce Thunderbolt');
});


