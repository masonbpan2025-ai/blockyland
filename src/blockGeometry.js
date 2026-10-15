import * as THREE from 'three';
import { TERRAIN_SHADOW_CHUNK } from './terrainShadowSampling.js';
import { redstoneGeometry } from './redstoneGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BLOCKS, BLOCK_DEFS } from './blocks.js';
import { netherWartHeight } from './netherPlants.js';
import { createBedGeometry } from './bed.js';
import { createSlabGeometry, createStairGeometry, createPaneGeometry, createCarpetGeometry, createCandleGeometry, createChainGeometry, createFenceGeometry, createWallGeometry, createPressurePlateGeometry, createButtonGeometry, createFenceGateGeometry, createBannerGeometry, createSignGeometry, createWallSignGeometry, createHangingSignGeometry, createWallFanGeometry, createHeadGeometry, createRodGeometry, createRailGeometry, createFlowerPotGeometry } from './slab.js';
import { createChestGeometry } from './chest.js';
import { createModelGeometry } from './blockModels.js';
import { createDoorGeometry, createTrapdoorGeometry } from './door.js';

function ensureFlameAttributes(geo) {
  if (!geo || !geo.attributes.position) return geo;
  const count = geo.attributes.position.count;
  if (!geo.attributes.flame) {
    geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  }
  if (!geo.attributes.flameUv) {
    geo.setAttribute('flameUv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  }
  return geo;
}

// Geometry is in voxel coordinates, shared by world meshes and the held item.
export function createBlockGeometry(id, textures, state = {}) {
  const numericId = typeof id === 'string' ? (BLOCKS[id.toUpperCase()] ?? (id === 'chest' ? BLOCKS.CHEST : (id === 'oak_door' ? BLOCKS.OAK_DOOR : (id === 'iron_door' ? BLOCKS.IRON_DOOR : (id === 'oak_trapdoor' ? BLOCKS.OAK_TRAPDOOR : (id === 'iron_trapdoor' ? BLOCKS.IRON_TRAPDOOR : id)))))) : id;
  const def = BLOCK_DEFS[numericId] || BLOCK_DEFS[id];
  // Partial-cube shapes. All are placed before the cube fallback so none is ever drawn full size;
  // the mesher's dispatch routes them here for the same reason.
  // A block with a box model (blockModelShapes.js): a cactus, a cauldron, an anvil, a cake...
  if (def?.model) return ensureFlameAttributes(createModelGeometry(def, textures, state ?? {}));
  if (def?.stair) {
    // Stairs are two boxes: a base half and a step against the back. The facing comes from the
    // block state, which the mesher passes in the same way it does for doors and beds.
    const dir = state?.dir !== undefined ? state.dir : 3;
    const isTop = Boolean(state?.isTop || def.isTop);
    return ensureFlameAttributes(createStairGeometry(def, textures, dir, isTop));
  }
  if (def?.candle) {
    // A candle is a narrow column, not a cube. All sixteen colours share one builder; the
    // texture on the definition is the only difference.
    return ensureFlameAttributes(createCandleGeometry(def, textures));
  }
  if (def?.chain) {
    // A chain is a thin post. Two offset segments suggest links rather than a plain grey box.
    return ensureFlameAttributes(createChainGeometry(def, textures));
  }
  if (def?.fence) {
    // A fence is a post with two rails. The rails do not follow neighbours yet, so a fence is
    // drawn as a cross; see the note in slab.js for why that is the honest approximation.
    return ensureFlameAttributes(createFenceGeometry(def, textures));
  }
  if (def?.wall) {
    // A wall is a chunky post with full-height rails, drawn as a cross for the same reason
    // fences are; see the note in slab.js.
    return ensureFlameAttributes(createWallGeometry(def, textures));
  }
  if (def?.pressurePlate) {
    // A thin plate on the floor: the same construction as a carpet with a different footprint.
    return ensureFlameAttributes(createPressurePlateGeometry(def, textures));
  }
  if (def?.button) {
    // A small box. Modelled floor-mounted; this project has no per-face placement state for
    // buttons yet, and a floor-mounted button is never wrong about being a button.
    return ensureFlameAttributes(createButtonGeometry(def, textures));
  }
  if (def?.fenceGate) {
    // Four corner posts with slatted panels between them, drawn closed.
    return ensureFlameAttributes(createFenceGateGeometry(def, textures));
  }
  if (def?.banner) {
    // A pole with a cloth panel. Sixteen colours share the shape, so the dye colour is passed
    // through and applied as a tint -- only the cloth takes it, not the pole.
    const colour = def?.bannerColour || 'white';
    return ensureFlameAttributes(createBannerGeometry(def, textures, colour));
  }
  if (def?.wallHead) {
    // A head fixed to a wall. Checked before the standing head below, since the two share the box and
    // differ only in where it sits.
    const dir = state?.dir !== undefined ? state.dir : 3;
    return ensureFlameAttributes(createHeadGeometry(def, textures, true, dir));
  }
  if (def?.head) {
    // A mob head: an 8/16 cube. Without this it would be drawn as a full block, which is exactly what the
    // vanilla model exists to avoid.
    return ensureFlameAttributes(createHeadGeometry(def, textures, false));
  }
  if (def?.wallFan) {
    // Checked BEFORE the plant fallback, because a wall fan is also `plant: true` (so the upright fan's
    // cross-quad path is available to the shared code) and would otherwise render as a cross. A wall fan
    // is a flat growth on a wall face, not a plant standing on the floor.
    const dir = state?.dir !== undefined ? state.dir : 3;
    return ensureFlameAttributes(createWallFanGeometry(def, textures, dir));
  }
  if (def?.wallSign) {
    // Checked BEFORE sign, for the same reason the hanging sign below is: a wall sign's key also ends in
    // `_sign`, so a shared branch would give it the standing sign's post-and-board shape.
    //
    // The default direction is north, which is the same fallback the hanging signs use. Nothing in this
    // engine drives sign facing from placement -- no block-state layer owns signs -- so a wall sign is
    // drawn facing north whichever wall it is put on. See the definition comments for that limitation.
    const dir = state?.dir !== undefined ? state.dir : 3;
    return ensureFlameAttributes(createWallSignGeometry(def, textures, dir));
  }
  if (def?.hangingSign) {
    // Checked BEFORE sign, because a hanging sign's name also ends in _sign and a shared
    // branch would give it a standing sign's shape.
    const dir = state?.dir !== undefined ? state.dir : 3;
    return ensureFlameAttributes(createHangingSignGeometry(def, textures, dir));
  }
  if (def?.sign) {
    // A post with a board. This project has no sign-editing UI, so the block exists for its
    // recipe and its silhouette; the text layer is deliberately absent.
    const dir = state?.dir !== undefined ? state.dir : 3;
    return ensureFlameAttributes(createSignGeometry(def, textures, dir));
  }
  if (def?.rod) {
    // A thin full-height post: an end rod or a lightning rod.
    return ensureFlameAttributes(createRodGeometry(def, textures));
  }
  if (def?.rail) {
    // A one-pixel plate covering the block.
    return ensureFlameAttributes(createRailGeometry(def, textures));
  }
  if (def?.flowerPot) {
    // A small box. Vanilla models a lip and an inner cavity; one box is the honest
    // approximation for a decorative block whose plant-holding behaviour is not modelled.
    return ensureFlameAttributes(createFlowerPotGeometry(def, textures));
  }
  if (def?.pane) {
    return ensureFlameAttributes(createPaneGeometry(def, textures));
  }
  if (def?.carpet) {
    return ensureFlameAttributes(createCarpetGeometry(def, textures));
  }
  // A slab is a half-height box; the variant comes from the block state, defaulting to a bottom slab.
  if (def?.slab) {
    const variant = state?.slabType === 'top' || def.slabType === 'top' ? 'top' : 'bottom';
    return ensureFlameAttributes(createSlabGeometry(def, textures, variant));
  }
  if (def?.door) {
    const isTop = Boolean(def.isTop || numericId === BLOCKS.OAK_DOOR_TOP || numericId === BLOCKS.OAK_DOOR_TOP_OPEN || numericId === BLOCKS.IRON_DOOR_TOP || numericId === BLOCKS.IRON_DOOR_TOP_OPEN);
    const facing = state.facing !== undefined ? state.facing : 3;
    const open = state.open !== undefined ? state.open : (numericId === BLOCKS.OAK_DOOR_OPEN || numericId === BLOCKS.OAK_DOOR_TOP_OPEN || numericId === BLOCKS.IRON_DOOR_OPEN || numericId === BLOCKS.IRON_DOOR_TOP_OPEN);
    const isIron = Boolean(def.isIron);
    const hinge = state.hinge || 'left';
    return ensureFlameAttributes(createDoorGeometry(isTop, facing, open, isIron, hinge, textures));
  }
  if (def?.trapdoor) {
    const facing = state.facing !== undefined ? state.facing : 3;
    const open = state.open !== undefined ? state.open : (numericId === BLOCKS.OAK_TRAPDOOR_OPEN || numericId === BLOCKS.IRON_TRAPDOOR_OPEN);
    const isIron = Boolean(def.isIron);
    return ensureFlameAttributes(createTrapdoorGeometry(facing, open, isIron, textures));
  }
  if (def?.redstone && !def.redstoneNativeModel && ![BLOCKS.REDSTONE_TORCH,BLOCKS.REDSTONE_WALL_TORCH].includes(numericId)) return ensureFlameAttributes(redstoneGeometry(numericId, textures, state));
  if (def?.bed || numericId === BLOCKS.RED_BED_FOOT || numericId === BLOCKS.RED_BED_HEAD) {
    const isHead = (numericId === BLOCKS.RED_BED_HEAD) || Boolean(def?.isHead);
    const dir = state.dir !== undefined ? state.dir : 3;
    // The bed's colour comes from its definition, so one geometry builder serves all 16
    // vanilla bed colours instead of each needing its own copy.
    const colour = def?.bedColour || 'red';
    return ensureFlameAttributes(createBedGeometry(isHead, dir, textures, colour));
  }
  if (def?.chest || numericId === BLOCKS.CHEST || id === 'chest') {
    const isDouble = Boolean(state.isDouble);
    const isLeft = Boolean(state.isLeft);
    const facing = state.facing !== undefined ? state.facing : 0;
    return ensureFlameAttributes(createChestGeometry(isDouble, isLeft, facing, textures));
  }
  if (numericId === BLOCKS.FIRE) {
    // 4 intersecting and offset flame planes for volumetric 3D fire from all viewing angles
    const p1 = new THREE.PlaneGeometry(0.95, 1.05);
    const p2 = new THREE.PlaneGeometry(0.95, 1.05);
    p1.rotateY(Math.PI / 4);
    p2.rotateY(-Math.PI / 4);

    const p3 = new THREE.PlaneGeometry(0.85, 0.95);
    const p4 = new THREE.PlaneGeometry(0.85, 0.95);
    p3.rotateY(Math.PI / 4);
    p3.translate(0.1, 0, -0.1);
    p4.rotateY(-Math.PI / 4);
    p4.translate(-0.1, 0, -0.1);

    const planes = [p1, p2, p3, p4];
    for (const p of planes) p.translate(0.5, 0.525, 0.5);
    const geo = mergeGeometries(planes);
    planes.forEach(p => p.dispose());

    const tile = textures.getFaceUVs(numericId, 'all');
    const uv = geo.attributes.uv;
    // Map flame UVs with a slight 0.5-pixel inset to prevent bleeding into adjacent atlas tiles
    const du = (tile.u1 - tile.u0) * (0.5 / 16);
    const dv = (tile.v1 - tile.v0) * (0.5 / 16);
    const u0 = tile.u0 + du, u1 = tile.u1 - du;
    const v0 = tile.v0 + dv, v1 = tile.v1 - dv;

    const count = geo.attributes.position.count;
    const flameUv = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const origU = uv.getX(i);
      const origV = uv.getY(i);
      uv.setXY(i, THREE.MathUtils.lerp(u0, u1, origU), THREE.MathUtils.lerp(v0, v1, origV));
      flameUv[i * 2] = origU;
      flameUv[i * 2 + 1] = origV;
    }

    geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
    geo.setAttribute('emission', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1));
    geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(count).fill(1), 1));
    geo.setAttribute('flameUv', new THREE.Float32BufferAttribute(flameUv, 2));
    return geo;
  }
  if (def?.plant) {
    const tile = textures.getFaceUVs(numericId, 'all');
    const hanging = Boolean(def.hang);
    const plantHeight=numericId===BLOCKS.NETHER_WART?netherWartHeight(state.plantAge):1;
    const p1 = new THREE.PlaneGeometry(1.4142, plantHeight);
    const p2 = new THREE.PlaneGeometry(1.4142, plantHeight);
    p1.rotateY(Math.PI / 4);
    p2.rotateY(-Math.PI / 4);
    p1.translate(0.5, plantHeight/2, 0.5);
    p2.translate(0.5, plantHeight/2, 0.5);
    const geo = mergeGeometries([p1, p2]);
    p1.dispose();
    p2.dispose();

    const uv = geo.attributes.uv;
    const count = geo.attributes.position.count;
    for (let i = 0; i < count; i++) {
      const origU = uv.getX(i);
      const origV = uv.getY(i);
      const v = hanging ? 1 - origV : origV;
      uv.setXY(i, THREE.MathUtils.lerp(tile.u0, tile.u1, origU), THREE.MathUtils.lerp(tile.v0, tile.v1, v));
    }
    const colors = new Float32Array(count * 3).fill(1);
    const emission = new Float32Array(count).fill(def?.light ? 0.8 : 0);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('emission', new THREE.Float32BufferAttribute(emission, 1));
    return ensureFlameAttributes(geo);
  }
  const torch = def?.shape === 'torch';
  // A wall torch shares the standing torch's box and UV cropping exactly; only its POSITION differs. It is
  // the same 2/16 x 10/16 x 2/16 post, pushed back against the `z` wall and raised to the height vanilla
  // mounts it. Handling it here rather than in a separate branch keeps the two forms provably identical in
  // shape, which matters because the standing torch's cropped UVs are what make the sprite's central two
  // pixels read as a stick with a burning head and a wooden base.
  const wallTorch = Boolean(def?.wallTorch);
  const geo = new THREE.BoxGeometry(torch ? 2 / 16 : 1, torch ? 10 / 16 : 1, torch ? 2 / 16 : 1);
  if (wallTorch) geo.translate(0.5, 13 / 16, 13 / 16);
  else geo.translate(0.5, torch ? 5 / 16 : 0.5, 0.5);
  const uv = geo.attributes.uv;
  const faces = ['east', 'west', 'top', 'bottom', 'north', 'south'];
  const emission = new Float32Array(24);
  const colors = new Float32Array(72).fill(1);
  for (let face = 0; face < 6; face++) {
    const tile = textures.getFaceUVs(numericId, faces[face]);
    for (let v = 0; v < 4; v++) {
      const i = face * 4 + v;
      let u = uv.getX(i), t = uv.getY(i);
      if (torch) {
        // Only the central two texture pixels contain the stick. The top cap
        // samples the burning head; the bottom samples the wooden base.
        u = (7 + u * 2) / 16;
        t = face === 2 ? (8 + t * 2) / 16 : face === 3 ? t * 2 / 16 : t * 10 / 16;
      }
      uv.setXY(i, THREE.MathUtils.lerp(tile.u0, tile.u1, u), THREE.MathUtils.lerp(tile.v0, tile.v1, t));
      const torchGlow = face === 2 ? 1 : face === 3 ? 0 : t > 0.5 ? 1 : 0;
      const cubeGlow = numericId === BLOCKS.LIT_FURNACE ? (face === 4 ? 0.8 : 0) : numericId === BLOCKS.ENCHANTING_TABLE ? 0.2 : 0.8;
      const off=def?.redstoneBulb?!state.on:[BLOCKS.REDSTONE_TORCH,BLOCKS.REDSTONE_WALL_TORCH].includes(numericId)&&state.output===0;
      emission[i] = off ? 0 : def?.light ? (torch ? torchGlow : cubeGlow) : 0;
      if(off&&torchGlow)colors.set([.25,.15,.15],i*3);
      if (numericId === BLOCKS.OAK_LEAVES) colors.set([0.35, 0.65, 0.22], i * 3);
      if (numericId === BLOCKS.GRASS && face === 2) colors.set([0.48, 0.74, 0.31], i * 3);
    }
  }
  const count = geo.attributes.position.count;
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('emission', new THREE.Float32BufferAttribute(emission, 1));
  geo.setAttribute('flame', new THREE.Float32BufferAttribute(new Float32Array(count), 1));
  geo.setAttribute('flameUv', new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
  return geo;
}

export function enableBlockEmission(material) {
  material.userData.animationTime = { value: 0 };
  material.userData.windStrength = { value: 0 };
  material.userData.snowDaylight = { value: 0 };
  material.defaultAttributeValues = {
    ...(material.defaultAttributeValues || {}),
    flame: [0],
    flameUv: [0, 0],
    wind: [0],
    snowExposure: [0]
  };
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', TERRAIN_SHADOW_CHUNK);
    shader.uniforms.blockTime = material.userData.animationTime;
    shader.uniforms.windStrength = material.userData.windStrength;
    shader.uniforms.snowDaylight = material.userData.snowDaylight;

    shader.vertexShader = [
      'attribute float wind;',
      'attribute float snowExposure;',
      'varying float vSnowExposure;',
      'uniform float windStrength;',
      'attribute float emission;',
      'attribute float flame;',
      'attribute vec2 flameUv;',
      'uniform float blockTime;',
      'varying float vBlockEmission;',
      'varying float vFlame;',
      'varying vec2 vFlameUv;',
      shader.vertexShader
    ].join('\n');

    const vBeginReplacement = [
      '#include <begin_vertex>',
      'vBlockEmission = emission;',
      'vSnowExposure = snowExposure;',
      'vFlame = flame;',
      'vFlameUv = flameUv;',
      'transformed.x += wind * windStrength * (sin(blockTime * 1.5 + position.x * 0.65 + position.z * 0.4) * 0.075);',
      'transformed.z += wind * windStrength * sin(blockTime * 1.1 + position.x * 0.4) * 0.04;',
      'float flameHeight = clamp(flameUv.y, 0.0, 1.0);',
      'float swayX = sin(blockTime * 7.0 + position.z * 3.5 + flameUv.y * 3.0) * 0.05 * flameHeight;',
      'float swayZ = cos(blockTime * 6.0 + position.x * 3.5 + flameUv.y * 2.5) * 0.04 * flameHeight;',
      'float flickerY = (sin(blockTime * 15.0 + position.x * 8.0) * 0.5 + 0.5) * 0.035 * flameHeight;',
      'transformed.x += flame * swayX;',
      'transformed.z += flame * swayZ;',
      'transformed.y += flame * flickerY;'
    ].join('\n');
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', vBeginReplacement);

    shader.fragmentShader = [
      'uniform float blockTime;',
      'uniform float snowDaylight;',
      'varying float vSnowExposure;',
      'varying float vBlockEmission;',
      'varying float vFlame;',
      'varying vec2 vFlameUv;',
      shader.fragmentShader
    ].join('\n');

    const mapFragmentReplacement = [
      '#include <map_fragment>',
      'if (vFlame > 0.5) {',
      '  vec2 fUv = vFlameUv;',
      '  float distCenter = abs(fUv.x - 0.5) * 2.0;',
      '  float t = blockTime * 5.5;',
      '  float wave1 = sin(fUv.x * 11.0 + t * 2.5 + fUv.y * 4.0) * 0.14;',
      '  float wave2 = cos(fUv.x * 23.0 - t * 3.8 + fUv.y * 8.0) * 0.07;',
      '  float wave3 = sin(fUv.x * 5.0 + t * 1.6) * 0.09;',
      '  float flameTurbulence = wave1 + wave2 + wave3;',
      '  float flameSilhouette = 1.0 - pow(distCenter, 1.75);',
      '  float flameCutoff = flameSilhouette + flameTurbulence * (1.1 - fUv.y * 0.5);',
      '  if (fUv.y > flameCutoff) discard;',
      '  float coreIntensity = clamp((1.0 - fUv.y * 0.85) * (1.0 - distCenter * 0.7) + flameTurbulence * 0.22, 0.0, 1.0);',
      '  vec3 fireColor = mix(vec3(0.85, 0.12, 0.02), vec3(1.0, 0.42, 0.04), smoothstep(0.12, 0.42, coreIntensity));',
      '  fireColor = mix(fireColor, vec3(1.0, 0.84, 0.15), smoothstep(0.42, 0.72, coreIntensity));',
      '  fireColor = mix(fireColor, vec3(1.0, 0.98, 0.88), smoothstep(0.72, 0.96, coreIntensity));',
      '  float emberSeed = sin(floor(blockTime * 7.0) * 19.0 + floor(fUv.x * 7.0));',
      '  float isEmber = step(0.95, sin(emberSeed * 103.0)) * step(0.55, fUv.y);',
      '  fireColor += isEmber * vec3(0.35, 0.22, 0.0);',
      '  diffuseColor.rgb = fireColor;',
      '  diffuseColor.a = 1.0;',
      '}'
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', mapFragmentReplacement);

    const opaqueFragmentReplacement = [
      // Environmental sky fill uses actual exposure; roofed/cave snow gets no
      // floor. diffuseColor retains texture, face contrast and corner AO.
      'vec3 snowSkyFill = diffuseColor.rgb * vec3(0.96, 0.98, 1.0) * snowDaylight;',
      // Keep sunlit snow below clipping so fine texture and face shade survive.
      // At night or beneath a roof the regular scene lighting is unchanged.
      'float snowSkyMix = vSnowExposure * smoothstep(0.08, 0.4, snowDaylight);',
      'vec3 snowLit = min(max(outgoingLight, snowSkyFill), diffuseColor.rgb * vec3(0.98, 1.0, 1.02));',
      'outgoingLight = mix(outgoingLight, snowLit, snowSkyMix);',
      'if (vFlame > 0.5) {',
      '  outgoingLight = max(outgoingLight, diffuseColor.rgb * 1.35);',
      '} else {',
      '  outgoingLight = max(outgoingLight, diffuseColor.rgb * vBlockEmission);',
      '}',
      '#include <opaque_fragment>'
    ].join('\n');
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', opaqueFragmentReplacement);
  };
  material.customProgramCacheKey = () => 'voxel-emission-wind-fire-snow-stable-shadows-v7';
}
