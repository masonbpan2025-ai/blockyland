// Text on signs: draws the lines a sign's block entity carries (world.structureOrientations[key].signText) as a
// canvas-textured plane on the board, front and back, turned with the sign.
//
// The text is not part of the chunk mesh: it changes far less often than chunks rebuild, and a canvas per sign
// is simpler as its own mesh. The board positions below match the shapes in slab.js (createWallSignGeometry,
// createSignGeometry, createHangingSignGeometry), which are drawn facing north before they are turned.
import * as THREE from 'three';
import { BLOCK_DEFS } from './blocks.js';
import { STAIR_ROTATIONS } from './slab.js';

// Minecraft's sign text colours (DyeColor text colours).
const TEXT_COLOURS = {
  white: '#ffffff', orange: '#ff681f', magenta: '#ff00ff', light_blue: '#9ac0cd', yellow: '#ffff00', lime: '#bfff00',
  pink: '#ff69b4', gray: '#808080', light_gray: '#d3d3d3', cyan: '#00ffff', purple: '#a020f0', blue: '#0000ff',
  brown: '#8b4513', green: '#00ff00', red: '#ff0000', black: '#000000'
};

// Board rectangles in sixteenths, north-facing model: x and y extents, and the z of the front (north) and back faces.
const BOARDS = {
  wall: { x0: 2, x1: 14, y0: 8, y1: 14, front: 14, back: null },
  standing: { x0: 2, x1: 14, y0: 8, y1: 14, front: 6.5, back: 7.5 },
  hanging: { x0: 3, x1: 13, y0: 2, y1: 12, front: 7.5, back: 8.5 }
};
const LIFT = 0.002; // off the board, so the text never z-fights with the wood

function boardKind(def) {
  if (def?.wallSign) return 'wall';
  if (def?.hangingSign) return 'hanging';
  if (def?.sign) return 'standing';
  return null;
}

/** A canvas texture with up to four centred lines, sized to the board. */
function textTexture(face, widthUnits, heightUnits) {
  const scale = 256;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(widthUnits * scale);
  canvas.height = Math.round(heightUnits * scale);
  const ctx = canvas.getContext('2d');
  const lineHeight = canvas.height / 4.4;
  ctx.font = `${Math.round(lineHeight * 0.78)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const colour = TEXT_COLOURS[face.color] ?? TEXT_COLOURS.black;
  face.lines.slice(0, 4).forEach((line, i) => {
    const y = canvas.height / 2 + (i - 1.5) * lineHeight;
    if (face.glowing) {
      ctx.lineWidth = Math.max(2, lineHeight * 0.12);
      ctx.strokeStyle = face.color === 'black' ? '#f0ebcc' : '#000000';
      ctx.strokeText(line, canvas.width / 2, y, canvas.width * 0.94);
    }
    ctx.fillStyle = colour;
    ctx.fillText(line, canvas.width / 2, y, canvas.width * 0.94);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** One face's plane, in block-local coordinates centred on the block (the group turns it with the sign). */
function facePlane(face, board, back) {
  const w = (board.x1 - board.x0) / 16, h = (board.y1 - board.y0) / 16;
  const material = face.glowing
    ? new THREE.MeshBasicMaterial({ map: textTexture(face, w, h), transparent: true, depthWrite: false })
    : new THREE.MeshLambertMaterial({ map: textTexture(face, w, h), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set((board.x0 + board.x1) / 32 - 0.5, (board.y0 + board.y1) / 32, back ? board.back / 16 - 0.5 + LIFT : board.front / 16 - 0.5 - LIFT);
  if (!back) mesh.rotation.y = Math.PI; // a plane faces +Z; the front faces north (-Z)
  mesh.renderOrder = 2;
  return mesh;
}

export class SignTextRenderer {
  constructor(game) {
    this.game = game;
    this.meshes = new Map(); // key -> { group, source, dir, id }
    this.dirty = true;
    this.elapsed = 0;
  }

  /** Something changed (a sign was placed or loaded): draw on the next update. */
  refresh() { this.dirty = true; }

  /** Called every frame. Rechecks twice a second as well, which is how a broken sign's text goes away. */
  update(dt = 0) {
    this.elapsed += dt;
    if (!this.dirty && this.elapsed < 0.5) return;
    this.dirty = false;
    this.elapsed = 0;
    this.sync();
  }

  sync() {
    const scene = this.game?.scene;
    const orientations = this.game?.world?.structureOrientations;
    if (!scene || !orientations || typeof document === 'undefined') return;
    const seen = new Set();
    for (const [key, o] of orientations) {
      if (!o?.signText) continue;
      seen.add(key);
      const current = this.meshes.get(key);
      if (current && current.source === o.signText && current.dir === o.dir && current.id === o.id) continue;
      if (current) this.remove(key);
      this.add(key, o);
    }
    for (const key of [...this.meshes.keys()]) if (!seen.has(key)) this.remove(key);
  }

  add(key, o) {
    const board = BOARDS[boardKind(BLOCK_DEFS[o.id])];
    if (!board) return;
    const group = new THREE.Group();
    group.position.set(o.x + 0.5, o.y, o.z + 0.5);
    group.rotation.y = STAIR_ROTATIONS[o.dir ?? 3] || 0;
    if (o.signText.front) group.add(facePlane(o.signText.front, board, false));
    if (o.signText.back && board.back !== null) group.add(facePlane(o.signText.back, board, true));
    this.game.scene.add(group);
    this.meshes.set(key, { group, source: o.signText, dir: o.dir, id: o.id });
  }

  remove(key) {
    const entry = this.meshes.get(key);
    if (!entry) return;
    this.game.scene?.remove(entry.group);
    entry.group.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.dispose();
      child.material.map?.dispose();
      child.material.dispose();
    });
    this.meshes.delete(key);
  }
}
