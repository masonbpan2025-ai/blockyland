// What Bed Wars draws in the world beyond blocks: the holograms over generators and shopkeepers ("Diamond", "Tier II",
// "Spawns in 12 seconds"), the spinning diamond and emerald blocks over their generators, the piles of iron, gold,
// diamonds and emeralds waiting to be picked up, and a primed TNT block flashing before it goes off.
import * as THREE from 'three';
import { BLOCKS } from '../../blocks.js';

/** A floating label of one or more lines, coloured per line, redrawn only when its text changes. */
export function textSprite(lines = [], { scale = 1 } = {}) {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
  sprite.renderOrder = 998;
  sprite.userData.key = '';
  sprite.setLines = (list) => {
    const key = JSON.stringify(list);
    if (key === sprite.userData.key) return;
    sprite.userData.key = key;
    const rows = list.length || 1;
    sprite.scale.set(2.6 * scale, 0.42 * rows * scale, 1);
    if (!canvas) return;
    canvas.width = 512; canvas.height = 80 * rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = 'bold 44px "Minecraft", "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    list.forEach(([text, color], i) => {
      const y = 40 + i * 80;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(text, 259, y + 3);
      ctx.fillStyle = color ?? '#ffffff';
      ctx.fillText(text, 256, y);
    });
    sprite.material.map?.dispose();
    sprite.material.map = new THREE.CanvasTexture(canvas);
    sprite.material.needsUpdate = true;
  };
  sprite.setLines(lines);
  return sprite;
}

const ITEM_OF = { iron: 'iron_ingot', gold: 'gold_ingot', diamond: 'diamond', emerald: 'emerald' };
const NAMES = { diamond: ['Diamond', '#55ffff'], emerald: ['Emerald', '#55ff55'] };
const ROMAN = ['', 'I', 'II', 'III'];

/** One generator: its hologram and spinning block (diamond, emerald), and the pile on it. */
export class GeneratorView {
  constructor(game, gen) {
    this.game = game;
    this.gen = gen; // { id, kind, x, y, z }
    this.group = new THREE.Group();
    this.group.position.set(gen.x, gen.y, gen.z);
    this.piles = new Map(); // resource -> { object, label, count }
    this.time = Math.random() * 6;
    if (gen.kind !== 'forge') {
      this.label = textSprite([]);
      this.label.position.y = 4.2;
      this.group.add(this.label);
      const visuals = game.entities?.itemVisuals;
      this.block = visuals?.create ? visuals.create(gen.kind === 'diamond' ? BLOCKS.DIAMOND_BLOCK : BLOCKS.EMERALD_BLOCK, true, 0.7)
        : new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshLambertMaterial({ color: gen.kind === 'diamond' ? 0x55ffff : 0x55ff55 }));
      this.block.position.y = 3;
      this.group.add(this.block);
    }
    game.scene?.add(this.group);
  }

  /** The generator as the host last said: its pile, its tier, and when the next one comes. */
  update(state, dt) {
    this.time += dt;
    if (this.block) { this.block.rotation.y = this.time * 1.6; this.block.position.y = 3 + Math.sin(this.time * 2) * 0.15; }
    if (this.label && state) {
      const [name, color] = NAMES[this.gen.kind];
      this.label.setLines([[`Tier ${ROMAN[state.tier ?? 1]}`, '#ffff55'], [name, color], [`Spawns in ${state.next ?? 0} seconds`, '#ffff55']]);
    }
    for (const resource of Object.keys(ITEM_OF)) {
      const count = state?.stock?.[resource] ?? 0;
      let pile = this.piles.get(resource);
      if (count > 0 && !pile) {
        const visuals = this.game.entities?.itemVisuals;
        const object = visuals?.create ? visuals.create(ITEM_OF[resource], false, 0.36) : new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
        const label = textSprite([], { scale: 0.45 });
        this.group.add(object, label);
        pile = { object, label, count: -1 };
        this.piles.set(resource, pile);
      } else if (count === 0 && pile) {
        this.removePile(resource);
        continue;
      }
      if (!pile) continue;
      const order = ['iron', 'gold', 'diamond', 'emerald'].filter((r) => this.piles.has(r)).indexOf(resource);
      const offset = (order - (this.piles.size - 1) / 2) * 0.55;
      pile.object.position.set(offset, 0.35 + Math.sin(this.time * 2.4 + order) * 0.08, 0);
      pile.object.rotation.y = this.time * 1.2;
      pile.label.position.set(offset, 0.95, 0);
      if (pile.count !== count) { pile.count = count; pile.label.setLines([[`x${count}`, '#ffffff']]); }
    }
  }

  removePile(resource) {
    const pile = this.piles.get(resource);
    if (!pile) return;
    const visuals = this.game.entities?.itemVisuals;
    if (visuals?.release) visuals.release(pile.object); else pile.object.removeFromParent();
    pile.label.removeFromParent();
    pile.label.material.map?.dispose();
    pile.label.material.dispose();
    this.piles.delete(resource);
  }

  dispose() {
    for (const resource of [...this.piles.keys()]) this.removePile(resource);
    if (this.block) { const visuals = this.game.entities?.itemVisuals; if (visuals?.release) visuals.release(this.block); else this.block.removeFromParent(); }
    if (this.label) { this.label.material.map?.dispose(); this.label.material.dispose(); }
    this.group.removeFromParent();
  }
}

/** A lit TNT block: flashing white, swelling just before it explodes. */
export function primedTntMesh(game) {
  const visuals = game.entities?.itemVisuals;
  const mesh = visuals?.create ? visuals.create(BLOCKS.TNT, true, 0.98) : new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.98, 0.98), new THREE.MeshLambertMaterial({ color: 0xdb2b2b }));
  const flash = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 1.0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  const group = new THREE.Group();
  group.add(mesh, flash);
  group.userData.flash = flash;
  group.userData.release = () => {
    if (visuals?.release) visuals.release(mesh);
    flash.geometry.dispose(); flash.material.dispose();
    group.removeFromParent();
  };
  return group;
}

/** A fireball in flight: a glowing orange ball. */
export function fireballMesh() {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff7a1a }));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, depthWrite: false }));
  mesh.add(glow);
  return mesh;
}
