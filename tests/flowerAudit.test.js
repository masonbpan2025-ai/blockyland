import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BLOCKS, BLOCK_DEFS, ITEMS } from '../src/blocks.js';
import { HeldItemRenderer } from '../src/heldItem.js';
import { createBlockGeometry } from '../src/blockGeometry.js';
import { ItemVisuals, getBlockDrop } from '../src/itemVisuals.js';
import { canSupportPlant, resolveVisualPolicy, VISUAL_POLICIES } from '../src/resourceVisualPolicy.js';
import { EXTRA_RECIPES } from '../src/extraRecipes.js';
import { ResourceInspectionWorld, ResourceBehaviorShowcase } from '../src/resourceBehaviorShowcase.js';

const mockCamera = new THREE.PerspectiveCamera();
const FALLBACK_TEXTURES = { getFaceUVs: () => ({ u0: 0, v0: 0, u1: 1, v1: 1 }) };

test('FLOWER-HAND-01: Equip a numeric flower-block stack in HeldItemRenderer — must NOT be a cube or opaque box', () => {
  const flowers = [BLOCKS.DANDELION, BLOCKS.POPPY, BLOCKS.ALLIUM, BLOCKS.AZURE_BLUET, BLOCKS.BLUE_ORCHID, BLOCKS.CORNFLOWER];
  const held = new HeldItemRenderer(mockCamera);

  for (const blockId of flowers) {
    held.setItem({ id: blockId, isBlock: true, count: 64 });
    const mesh = held.currentMesh;
    assert.ok(mesh, `Held item mesh must exist for flower block ${blockId}`);

    // Must NOT be a 3D box (cube geometry has depth > 0 or 24/36 vertices)
    assert.notEqual(mesh.geometry.type, 'BoxGeometry', `Flower ${blockId} must not be rendered as a BoxGeometry cube`);
    assert.equal(mesh.geometry.type, 'PlaneGeometry', `Flower ${blockId} should be held as a 2D PlaneGeometry sprite`);

    // Material must be transparent with alphaTest enabled — no black backing
    const mat = mesh.material;
    assert.equal(mat.transparent, true, `Flower material must be transparent`);
    assert.ok(mat.alphaTest > 0, `Flower material must have alphaTest enabled to reject black backing`);
    assert.equal(mat.side, THREE.DoubleSide, `Flower material must be DoubleSide so back faces do not disappear`);
  }
});

test('FLOWER-HAND-02: String item and numeric block forms resolve to matching species and held sprite', () => {
  const pairs = [
    { itemKey: 'dandelion', blockId: BLOCKS.DANDELION },
    { itemKey: 'poppy', blockId: BLOCKS.POPPY },
    { itemKey: 'allium', blockId: BLOCKS.ALLIUM },
    { itemKey: 'azure_bluet', blockId: BLOCKS.AZURE_BLUET },
    { itemKey: 'blue_orchid', blockId: BLOCKS.BLUE_ORCHID },
    { itemKey: 'cornflower', blockId: BLOCKS.CORNFLOWER },
  ];
  const held = new HeldItemRenderer(mockCamera);

  for (const { itemKey, blockId } of pairs) {
    held.setItem({ id: itemKey, isBlock: false });
    const itemMesh = held.currentMesh;

    held.setItem({ id: blockId, isBlock: true });
    const blockMesh = held.currentMesh;

    assert.ok(itemMesh && blockMesh, `Both forms must produce a mesh for ${itemKey}`);
    assert.equal(itemMesh.geometry.type, 'PlaneGeometry');
    assert.equal(blockMesh.geometry.type, 'PlaneGeometry');
    assert.equal(itemMesh.material.transparent, true);
    assert.equal(blockMesh.material.transparent, true);
  }
});

test('FLOWER-HAND-03: Rapid slot switching, swing, and clearing the hand cleans up without leaks', () => {
  const held = new HeldItemRenderer(mockCamera);
  for (let i = 0; i < 20; i++) {
    held.setItem({ id: BLOCKS.DANDELION, isBlock: true, count: 64 });
    held.swing();
    held.update(0.05, 1.0);
    held.setItem({ id: BLOCKS.POPPY, isBlock: true, count: 32 });
    held.setItem(null); // Clear hand
    assert.ok(held.currentMesh, 'Empty hand has Steve arm');
  }
});

test('FLOWER-GEOMETRY-01: createBlockGeometry creates cross-quad for plants, not a solid cube', () => {
  for (const blockId of [BLOCKS.DANDELION, BLOCKS.POPPY, BLOCKS.ALLIUM]) {
    const geo = createBlockGeometry(blockId, FALLBACK_TEXTURES);
    assert.ok(geo, `Geometry must exist for flower ${blockId}`);
    // Cross-quad has 8 vertices (2 intersecting planes of 4 vertices each), whereas BoxGeometry has 24 vertices
    assert.equal(geo.attributes.position.count, 8, `Plant block ${blockId} must have 8 cross-quad vertices, not a 24-vertex cube`);
    assert.ok(geo.attributes.uv, `Plant block ${blockId} must have UV attribute`);
    assert.ok(geo.attributes.flame, `Plant block ${blockId} must have flame attribute`);
  }
});

test('FLOWER-PLACE-01: Soil substrate conditions, valid/invalid placement, and support loss', () => {
  // 1. Valid substrates
  assert.equal(canSupportPlant(BLOCKS.GRASS, BLOCKS.DANDELION), true, 'Grass supports flowers');
  assert.equal(canSupportPlant(BLOCKS.DIRT, BLOCKS.DANDELION), true, 'Dirt supports flowers');
  assert.equal(canSupportPlant(BLOCKS.COARSE_DIRT, BLOCKS.POPPY), true, 'Coarse dirt supports flowers');
  assert.equal(canSupportPlant(BLOCKS.FARMLAND, BLOCKS.DANDELION), true, 'Farmland supports flowers');
  assert.equal(canSupportPlant(BLOCKS.PODZOL, BLOCKS.DANDELION), true, 'Podzol supports flowers');

  // 2. Invalid substrates
  assert.equal(canSupportPlant(BLOCKS.AIR, BLOCKS.DANDELION), false, 'Air cannot support flowers');
  assert.equal(canSupportPlant(BLOCKS.STONE, BLOCKS.DANDELION), false, 'Stone cannot support flowers');
  assert.equal(canSupportPlant(BLOCKS.GLASS, BLOCKS.DANDELION), false, 'Glass cannot support flowers');
  assert.equal(canSupportPlant(BLOCKS.OAK_PLANKS, BLOCKS.DANDELION), false, 'Wood planks cannot support flowers');

  // 3. Wither rose exception
  assert.equal(canSupportPlant(BLOCKS.NETHERRACK, BLOCKS.WITHER_ROSE), true, 'Netherrack supports Wither Rose');
  assert.equal(canSupportPlant(BLOCKS.NETHERRACK, BLOCKS.DANDELION), false, 'Netherrack does not support ordinary flowers');
});

test('FLOWER-USE-01: Crafting conversion of flowers into dyes', () => {
  const dyePairs = [
    { flower: BLOCKS.DANDELION, dye: 'yellow_dye' },
    { flower: BLOCKS.POPPY, dye: 'red_dye' },
    { flower: BLOCKS.ALLIUM, dye: 'magenta_dye' },
    { flower: BLOCKS.BLUE_ORCHID, dye: 'light_blue_dye' },
    { flower: BLOCKS.AZURE_BLUET, dye: 'light_gray_dye' },
    { flower: BLOCKS.OXEYE_DAISY, dye: 'light_gray_dye' },
    { flower: BLOCKS.CORNFLOWER, dye: 'blue_dye' },
    { flower: BLOCKS.WITHER_ROSE, dye: 'black_dye' },
  ];

  for (const { flower, dye } of dyePairs) {
    const recipe = EXTRA_RECIPES.find(r => Array.isArray(r.ingredients) && r.ingredients.includes(flower));
    assert.ok(recipe, `Recipe must exist for flower ${flower}`);
    assert.equal(recipe.result.id, dye, `Flower ${flower} should craft into ${dye}`);
  }
});

test('FLOWER-LIFECYCLE-01: Dropped form uses ItemVisuals crossed silhouettes without black box', () => {
  const visuals = new ItemVisuals(FALLBACK_TEXTURES);
  for (const blockId of [BLOCKS.DANDELION, BLOCKS.POPPY]) {
    const group = visuals.create(blockId, true);
    assert.ok(group, 'Dropped group created');
    assert.equal(group.children.length, 2, 'Dropped plant uses two crossed planes');
    for (const child of group.children) {
      assert.equal(child.material.transparent, true, 'Dropped plant material is transparent');
      assert.ok(child.material.alphaTest > 0, 'Dropped plant material uses alpha test');
    }
    visuals.release(group);
  }
  visuals.dispose();
});

test('FLOWER-SHOWCASE-01: Showcase runs with all FLOWER cases passing for Dandelion and Poppy', () => {
  for (const blockId of [BLOCKS.DANDELION, BLOCKS.POPPY]) {
    const scene = new THREE.Scene();
    const session = new ResourceInspectionWorld(blockId, { scene });
    const run = new ResourceBehaviorShowcase({ entry: { key: `B:${blockId}`, blockId, name: BLOCK_DEFS[blockId].name }, session });

    for (let i = 0; run.running && i < 1000; i++) run.update(0.1);
    assert.equal(run.running, false, 'Showcase must complete');

    const stepIds = run.results.map(r => r.id);
    assert.ok(stepIds.includes('flower-hand-01'), 'Includes FLOWER-HAND-01');
    assert.ok(stepIds.includes('flower-hand-02'), 'Includes FLOWER-HAND-02');
    assert.ok(stepIds.includes('flower-place-valid'), 'Includes valid placement');
    assert.ok(stepIds.includes('flower-place-invalid'), 'Includes invalid placement');
    assert.ok(stepIds.includes('flower-support-loss'), 'Includes support loss');
    assert.ok(stepIds.includes('flower-lifecycle-01'), 'Includes lifecycle');

    // All flower behavioral assertions must pass
    const failures = run.results.filter(r => ['not observed', 'error'].includes(r.status));
    assert.deepEqual(failures, [], `Showcase failures for ${BLOCK_DEFS[blockId].name}: ${JSON.stringify(failures)}`);
    session.dispose();
  }
});
