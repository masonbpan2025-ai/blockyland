/**
 * A declarative way to describe a vanilla-style mob model.
 *
 * Mob after mob in this project was built as plain boxes with flat colours, which is why so many have no face:
 * a colour cannot carry an eye, a snout or a mushroom. Rewriting each one as bespoke three.js code would repeat
 * the same arithmetic eighty times and still drift.
 *
 * So a model is described as DATA here and assembled by `buildModel`:
 *
 *   parts:     boxes with a texture rectangle each (or explicit per-face rectangles), parented to each other
 *   pieces:    extra geometry that is not a box face, such as mushrooms on a mooshroom's back
 *   materials: named materials shared across parts, so one skin texture is uploaded once
 *
 * All rectangles are in ATLAS PIXELS with a top-left origin, and all sizes are in TEXTURE PIXELS unless a part
 * overrides `worldSize`. Both matter: vanilla models are measured in texels, and a mob's overall scale is then a
 * single number.
 */
import * as THREE from 'three';
import { createEntityBox, createBoxFromFaces } from './entityBox.js';

/** One texel in world units, given a model scale of `units` texels per block. */
const texel = (units) => 1 / units;

/**
 * Build a THREE.Group from a model description.
 *
 * `definition` shape:
 *   {
 *     texture: '/assets/...' | { url, size: [w, h] },
 *     units: 16,                       // texture pixels per world block
 *     materials?: { name: { color, transparent, alphaTest, map } },
 *     parts: [
 *       {
 *         name, parent?,                     // parent defaults to the model root
 *         box: [w, h, d],                    // in texture pixels
 *         uv: { u, v, tw, th, td } | { faces: [6 rects] },
 *         material?                          // a name from `materials`, or the model's default
 *         at: [x, y, z],                     // position in texture pixels, relative to the parent
 *         pivot?: [x, y, z],                 // group origin, so the part can rotate about it
 *         mirror?, visible?, scale?          // scale in texture pixels
 *       }
 *     ],
 *     pieces?: [ { name, parent?, at?, geometry: 'mushroom'|'box', box?, material? } ]
 *   }
 *
 * Returns `{ group, parts, materials }` where `parts` maps each declared name to its Object3D, so callers can
 * animate or toggle them without walking the scene graph by index.
 */
export function buildModel(definition, ctx = {}) {
  const units = definition.units ?? 16;
  const t = texel(units);
  const group = new THREE.Group();
  group.name = definition.name ?? 'mob';

  const texSize = resolveTextureSize(definition, ctx);
  const materials = resolveMaterials(definition, ctx);
  const named = new Map();
  const parts = {};

  for (const spec of definition.parts ?? []) {
    const parent = spec.parent ? (named.get(spec.parent) ?? group) : group;
    const material = typeof spec.material === 'string' ? materials[spec.material] : (spec.material ?? materials.default);

    let geometry;
    if (spec.uv?.faces) {
      geometry = createBoxFromFaces(spec.box[0] * t, spec.box[1] * t, spec.box[2] * t, spec.uv.faces, {
        texW: texSize.w, texH: texSize.h, mirror: spec.mirror
      });
    } else if (spec.uv) {
      geometry = createEntityBox(spec.box[0] * t, spec.box[1] * t, spec.box[2] * t,
        spec.uv.u, spec.uv.v, spec.uv.tw ?? spec.box[0], spec.uv.th ?? spec.box[1], spec.uv.td ?? spec.box[2],
        { texW: texSize.w, texH: texSize.h, mirror: spec.mirror });
    } else {
      geometry = new THREE.BoxGeometry(spec.box[0] * t, spec.box[1] * t, spec.box[2] * t);
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = spec.name;
    // `pivot` moves the part's ROTATION ORIGIN, in texture pixels relative to the part's own centre. A leg 8 texels
    // tall that hinges at the hip uses `pivot: [0, 4, 0]`: the holder then sits where the limb meets the body and
    // the mesh is pushed back by the same amount, so the part does not move but rotation happens at the joint.
    // The part's own position is `at`, applied to the holder afterwards.
    const holder = spec.pivot ? new THREE.Group() : mesh;
    if (spec.pivot) {
      holder.name = `${spec.name}:pivot`;
      mesh.position.set(-spec.pivot[0] * t, -spec.pivot[1] * t, -spec.pivot[2] * t);
      holder.add(mesh);
    }
    if (spec.at) holder.position.set(spec.at[0] * t, spec.at[1] * t, spec.at[2] * t);
    // A resting rotation, in radians. Vanilla holds an illager's arms crossed in front of it rather than hanging
    // at its sides, so the pose is part of the model rather than something an animation has to set up.
    if (spec.rotate) holder.rotation.set(spec.rotate[0], spec.rotate[1], spec.rotate[2]);
    if (spec.scale) holder.scale.setScalar(spec.scale);
    if (spec.visible === false) holder.visible = false;

    parent.add(holder);
    named.set(spec.name, holder);
    parts[spec.name] = holder;
    parts[`${spec.name}:mesh`] = mesh;
  }

  for (const piece of definition.pieces ?? []) {
    const parent = piece.parent ? (named.get(piece.parent) ?? group) : group;
    const material = typeof piece.material === 'string' ? materials[piece.material] : (piece.material ?? materials.default);
    const geometry = pieceGeometry(piece, t);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = piece.name;
    if (piece.at) mesh.position.set(piece.at[0] * t, piece.at[1] * t, piece.at[2] * t);
    if (piece.rotate) mesh.rotation.set(piece.rotate[0], piece.rotate[1], piece.rotate[2]);
    parent.add(mesh);
    parts[piece.name] = mesh;
  }

  return { group, parts, materials, units };
}

function pieceGeometry(piece, t) {
  if (piece.geometry === 'plane') return new THREE.PlaneGeometry(piece.box[0] * t, piece.box[1] * t);
  return new THREE.BoxGeometry(piece.box[0] * t, piece.box[1] * t, piece.box[2] * t);
}

function resolveTextureSize(definition, ctx) {
  const tex = definition.texture;
  if (tex && typeof tex === 'object' && tex.size) return { w: tex.size[0], h: tex.size[1] };
  if (definition.textureSize) return { w: definition.textureSize[0], h: definition.textureSize[1] };
  // Fall back to the loaded bitmap's dimensions, which is the correct answer whenever the asset is present.
  const url = typeof tex === 'string' ? tex : tex?.url;
  const loaded = url && ctx.loadTexture ? ctx.loadTexture(url) : null;
  if (loaded?.image?.width) return { w: loaded.image.width, h: loaded.image.height };
  return { w: definition.defaultTextureSize?.[0] ?? 64, h: definition.defaultTextureSize?.[1] ?? 64 };
}

function resolveMaterials(definition, ctx) {
  const out = {};
  const url = typeof definition.texture === 'string' ? definition.texture : definition.texture?.url;
  const skin = url && ctx.loadTexture ? ctx.loadTexture(url) : null;
  const textureCache = new Map();

  for (const [name, spec] of Object.entries(definition.materials ?? {})) {
    const material = new THREE.MeshLambertMaterial({
      color: spec.color ?? 0xffffff,
      transparent: spec.transparent ?? false,
      alphaTest: spec.alphaTest ?? 0,
      side: spec.side === 'double' ? THREE.DoubleSide : THREE.FrontSide
    });
    if (spec.map === 'skin' && skin) adoptWhenReady(material, skin, spec.color ?? 0xffffff, ctx);
    if (spec.mapUrl && ctx.loadTexture) {
      const key = spec.mapUrl;
      if (!textureCache.has(key)) textureCache.set(key, ctx.loadTexture(key));
      adoptWhenReady(material, textureCache.get(key), spec.color ?? 0xffffff, ctx);
    }
    out[name] = material;
  }

  if (!out.default) {
    const material = new THREE.MeshLambertMaterial({
      color: definition.color ?? 0xffffff,
      transparent: definition.transparent ?? false,
      alphaTest: definition.alphaTest ?? 0
    });
    if (skin && !definition.color) adoptWhenReady(material, skin, 0xffffff, ctx);
    out.default = material;
  }
  return out;
}

/**
 * The readiness hook a host can install so every deferred skin binding in the project finishes reliably.
 *
 * `src/mobs.js` sets this from `MobManager.onTextureReady`. It lives here, as a module with no dependencies, so
 * behaviour modules such as `mooshroomBehavior.js` can bind a skin without importing the whole mob manager and
 * creating an import cycle.
 */
export const skinBinding = {
  onTextureReady: null
};

/**
 * Bindings waiting for their bitmap, polled once per frame by the host.
 *
 * The readiness hook is the primary mechanism; this is the safety net for a browser that fires no event at all.
 * It empties itself as soon as everything has decoded, so the steady-state cost is one length check per frame.
 */
export const pendingSkinBindings = [];

/** Attach every binding whose bitmap has now arrived. */
export function flushPendingSkinBindings() {
  if (pendingSkinBindings.length === 0) return;
  for (let i = pendingSkinBindings.length - 1; i >= 0; i--) {
    const binding = pendingSkinBindings[i];
    // Readiness is a non-zero width, not the presence of an image object: three's loader creates the `<img>`
    // immediately, so an object that merely exists is still undecoded.
    if (!binding.texture.image?.width) continue;
    binding.adopt();
    pendingSkinBindings.splice(i, 1);
  }
}

/** Point a material at a texture that may not have decoded yet, keeping a flat colour in the meantime.
 *
 * This is the one place the project decides when a skin may be attached. It matters because a mapped material
 * whose bitmap is missing renders BLACK in three, so the colour has to be held back until the image exists.
 * The Mob Inspector spawns its mob and then sits paused, so nothing per-frame may be relied on.
 */
export function adoptWhenReady(material, texture, fallbackColor = 0xffffff, ctx = {}) {
  if (!material || !texture) return material;
  const adopt = () => {
    if (material.map === texture) return;
    material.map = texture;
    material.color.setHex(0xffffff);
    material.needsUpdate = true;
  };
  // Defer ONLY when there is a live `<img>` still decoding, which is the one case where binding now would draw
  // black. A texture with no image at all -- a headless build -- has no renderer to draw black either, and
  // deferring there just left the mob looking unskinned to anything inspecting its material.
  const imageInFlight = Boolean(texture.image)
    && typeof texture.image.addEventListener === 'function'
    && !texture.image.width;
  if (!imageInFlight) {
    adopt();
    return material;
  }
  material.color.setHex(fallbackColor);
  // The host's readiness hook is the route that actually fires: three's loader is given an explicit onLoad by
  // src/mobs.js, which SUPPRESSES its own default listener, so the texture's own 'load' event never arrives.
  (ctx.onTextureReady ?? skinBinding.onTextureReady)?.(texture, adopt);
  try { texture.image?.addEventListener?.('load', adopt); } catch { /* not an event target */ }
  pendingSkinBindings.push({ material, texture, adopt });
  return material;
}
