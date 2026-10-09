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
import { createEntityBox, createBoxFromFaces, quadRects } from './entityBox.js';

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
    if (spec.plane) {
      // A FLAT part, for the mobs vanilla models as zero-thickness planes -- the vex's wings are 0x5x8, and a box
      // cannot represent them at all, which is why they resisted every attempt to infer a layout. The plane's own
      // quad is mapped to the one texture patch given.
      const [pw, ph] = spec.plane;
      geometry = new THREE.PlaneGeometry(pw * t, ph * t);
      const u0 = spec.uv.u / texSize.w;
      const u1 = (spec.uv.u + spec.uv.tw) / texSize.w;
      const v1 = 1 - spec.uv.v / texSize.h;
      const v0 = 1 - (spec.uv.v + spec.uv.th) / texSize.h;
      const uvs = geometry.attributes.uv;
      if (spec.mirror) {
        // Mirrored horizontally, as vanilla flips one wing onto the other from a single patch.
        uvs.setXY(0, u1, v1); uvs.setXY(1, u0, v1);
        uvs.setXY(2, u1, v0); uvs.setXY(3, u0, v0);
      } else {
        uvs.setXY(0, u0, v1); uvs.setXY(1, u1, v1);
        uvs.setXY(2, u0, v0); uvs.setXY(3, u1, v0);
      }
      uvs.needsUpdate = true;
      // The plane faces +Z; a wing runs along the body, so it is turned a quarter turn.
      geometry.rotateY(Math.PI / 2);
    } else if (spec.uv?.faces) {
      geometry = createBoxFromFaces(spec.box[0] * t, spec.box[1] * t, spec.box[2] * t, spec.uv.faces, {
        texW: texSize.w, texH: texSize.h, mirror: spec.mirror
      });
    } else if (spec.uv) {
      // `createEntityBox` refuses a box whose depth exceeds half its width, because vanilla's own layout then has no
      // room for the side faces. Several real mobs contain exactly that shape -- the frog's body is 7x3x9, the wolf's
      // snout 3x3x4, the turtle's abdomen 10x8x12 -- and the decompiled definitions give no alternative, so rather
      // than have every one of them fail, the fall back is to vanilla's own rectangles (`quadRects`) instead of the
      // packed layout. Where those overlap for an impossible box, the box was never expressible in that layout anyway.
      const tw = spec.uv.tw ?? spec.box[0];
      const th = spec.uv.th ?? spec.box[1];
      const td = spec.uv.td ?? spec.box[2];
      try {
        geometry = createEntityBox(spec.box[0] * t, spec.box[1] * t, spec.box[2] * t,
          spec.uv.u, spec.uv.v, tw, th, td,
          { texW: texSize.w, texH: texSize.h, mirror: spec.mirror });
      } catch {
        geometry = createBoxFromFaces(spec.box[0] * t, spec.box[1] * t, spec.box[2] * t,
          quadRects(spec.uv.u, spec.uv.v, tw, th, td),
          { texW: texSize.w, texH: texSize.h, mirror: spec.mirror });
      }
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
 * Shift a built model so its base sits on y = 0, measuring rather than guessing the offset.
 *
 * WHY THIS IS SHARED AND GUARDED. Vanilla places a mob entity at its own origin, so a transcribed model floats far
 * above this project's group origin (which is the mob's feet). Measuring the bounding box and shifting by
 * `-bounds.min.y` has fixed that on three mobs without a single revision round, against four failed attempts when the
 * offset was chosen by hand.
 *
 * It also has one sharp edge worth guarding: a part with a ZERO EXTENT makes the box degenerate and reports Infinity,
 * so the shift becomes NaN and the whole mob disappears -- exactly what the tadpole's zero-width tail did. A non-finite
 * shift is always a bug, so this refuses to move anything and says so instead.
 *
 * Returns the applied shift, or null when the model could not be measured.
 */
export function groundModel(built, { axis = 'y' } = {}) {
  const group = built?.group;
  if (!group) return null;

  // Move the contents into a child so the shift never touches the caller's own transform, then measure.
  const inner = new THREE.Group();
  while (group.children.length) inner.add(group.children[0]);
  inner.position.set(0, 0, 0);
  inner.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(inner);
  const shift = -bounds.min[axis];
  if (!Number.isFinite(shift)) {
    console.warn(
      '[modelBuilder] groundModel: refusing a non-finite ' + axis + ' shift (' + shift + '). A part with a zero extent '
      + 'makes the bounding box degenerate; give it a thin extent instead of an exact zero.'
    );
    group.add(inner);
    return null;
  }

  inner.position[axis] = shift;
  group.add(inner);
  return shift;
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

/**
 * Apply vanilla's box UV layout to an EXISTING geometry, using vanilla's own box dimensions for the layout.
 *
 * The face rectangles come from the vanilla sizes, so the UVs sample the correct atlas regions. They are then applied to
 * the geometry as-is, so a model built at a different scale still receives them -- the layout depends on vanilla's
 * DIMENSIONS, while the mapping covers the whole face whatever its world size.
 *
 * `u` and `v` are the atlas anchor in PIXELS from the top-left, and `tw`/`th`/`td` are vanilla's width, height and depth.
 * Negative `u` or `v` are allowed, because vanilla puts the small fish's tail and dorsal planes at (22, -6) and (10, -5).
 */
export function applyVanillaBoxUVs(geo, u, v, texW, texH, tw, th, td) {
  // Vanilla's six cross-layout rectangles, in the order +X, -X, +Y, -Y, +Z, -Z, which is BoxGeometry's face order.
  const faces = [
    { x: u, y: v + td, w: td, h: th },                    // 0: +X (Right)
    { x: u + td + tw, y: v + td, w: td, h: th },          // 1: -X (Left)
    { x: u + td, y: v, w: tw, h: td },                    // 2: +Y top
    { x: u + td + tw, y: v, w: tw, h: td },               // 3: -Y bottom
    { x: u + td, y: v + td, w: tw, h: th },               // 4: +Z front
    { x: u + td + tw + td, y: v + td, w: tw, h: th }      // 5: -Z back
  ];
  const uvs = geo.attributes.uv;
  for (let f = 0; f < 6; f++) {
    const r = faces[f];
    const u0 = r.x / texW, u1 = (r.x + r.w) / texW;
    const v1 = 1 - r.y / texH, v0 = 1 - (r.y + r.h) / texH;
    const b = f * 4;
    uvs.setXY(b + 0, u0, v1); uvs.setXY(b + 1, u1, v1);
    uvs.setXY(b + 2, u0, v0); uvs.setXY(b + 3, u1, v0);
  }
  uvs.needsUpdate = true;
  return geo;
}
