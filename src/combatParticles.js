// The particles of a melee hit (pvpCombat.js hitParticles): crit stars, blue enchanted-hit stars, dark damage-indicator
// hearts and the sweep arc, drawn as small pixel-art sprites that face the camera, the way Java Edition shows them.
// They replace the block-fragment cubes a hit used to throw, which made a punched player look like breaking stone.
import * as THREE from 'three';

// 8 x 8 pixel art, one string per row: '#' a lit pixel, '+' a dimmer one.
const ART = {
  crit: ['...#....', '...#....', '...#....', '###+###.', '...#....', '...#....', '...#....', '........'],
  heart: ['........', '.##.##..', '#++#++#.', '#+++++#.', '.#+++#..', '..#+#...', '...#....', '........'],
  sweep: ['........', '..####..', '.#....#.', '#......#', '+......+', '........', '........', '........'],
};

/** Per kind: art, colour, sprite size (blocks), lifetime (s), drag per second, gravity (blocks/s²), and spawn speed. */
export const PARTICLE_STYLE = Object.freeze({
  crit: { art: 'crit', color: 0xf0e6c8, size: 0.12, life: [0.25, 0.5], drag: 7, gravity: 10, speed: 4 },
  enchanted_hit: { art: 'crit', color: 0x5fd7ff, size: 0.12, life: [0.25, 0.5], drag: 7, gravity: 10, speed: 4 },
  damage_indicator: { art: 'heart', color: 0x5a0d0d, size: 0.2, life: [0.8, 1.0], drag: 3, gravity: 1.5, speed: 1.2, rise: 4 },
  sweep_attack: { art: 'sweep', color: 0xf4f4f4, size: 1.0, life: [0.2, 0.2], drag: 0, gravity: 0, speed: 0 },
});

function artTexture(rows) {
  if (typeof document === 'undefined' || !document.createElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 8;
  const g = canvas.getContext?.('2d');
  if (!g || typeof g.fillRect !== 'function') return null;
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    g.fillStyle = c === '#' ? '#ffffff' : '#b8b8b8';
    g.fillRect(x, y, 1, 1);
  }));
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class CombatParticles {
  constructor(scene, { random = Math.random, maxParticles = 600 } = {}) {
    this.scene = scene;
    this.random = random;
    this.maxParticles = maxParticles;
    this.live = [];
    this.materials = new Map();
  }

  material(kind) {
    let m = this.materials.get(kind);
    if (!m) {
      const style = PARTICLE_STYLE[kind];
      const map = artTexture(ART[style.art]);
      m = new THREE.SpriteMaterial({ map, color: style.color, transparent: true, depthWrite: false });
      this.materials.set(kind, m);
    }
    return m;
  }

  /**
   * Show a hit's particles. `bounds` is the target's box: feet at `bounds.x, y, z`, `width` and `height`.
   * `list` is pvpCombat.js hitParticles(); `facing` (a unit vector) places the sweep in front of the attacker.
   */
  spawnHit(bounds, list, { attacker = null, facing = null } = {}) {
    for (const { kind, count } of list) {
      if (!PARTICLE_STYLE[kind]) continue;
      if (kind === 'sweep_attack') {
        if (!attacker || !facing) continue;
        this.spawnOne(kind, new THREE.Vector3(attacker.x + facing.x, attacker.y + 0.9, attacker.z + facing.z), new THREE.Vector3());
        continue;
      }
      const w = bounds.width ?? 0.6, h = bounds.height ?? 1.8;
      for (let i = 0; i < count; i++) {
        const style = PARTICLE_STYLE[kind];
        const at = kind === 'damage_indicator'
          // Java sends them from the middle of the target, spread 0.1 sideways.
          ? new THREE.Vector3(bounds.x + (this.random() - 0.5) * 0.2, bounds.y + h * 0.5, bounds.z + (this.random() - 0.5) * 0.2)
          // The crit emitter picks points across the target's box.
          : new THREE.Vector3(bounds.x + (this.random() - 0.5) * w, bounds.y + this.random() * h, bounds.z + (this.random() - 0.5) * w);
        const v = new THREE.Vector3(this.random() * 2 - 1, this.random() * 2 - 1 + 0.2, this.random() * 2 - 1).multiplyScalar(style.speed);
        if (style.rise) v.y += style.rise;
        this.spawnOne(kind, at, v);
      }
    }
  }

  spawnOne(kind, position, velocity) {
    if (this.live.length >= this.maxParticles) this.remove(0);
    const style = PARTICLE_STYLE[kind];
    const sprite = new THREE.Sprite(this.material(kind));
    sprite.position.copy(position);
    const size = style.size * (0.75 + this.random() * 0.5);
    sprite.scale.set(size, size, size);
    sprite.renderOrder = 10;
    this.scene?.add(sprite);
    const life = style.life[0] + this.random() * (style.life[1] - style.life[0]);
    this.live.push({ kind, sprite, velocity, life, maxLife: life, size });
  }

  remove(index) {
    const [p] = this.live.splice(index, 1);
    // The sprite geometry and materials are shared; only the object leaves the scene.
    this.scene?.remove(p.sprite);
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.life -= dt;
      if (p.life <= 0) { this.remove(i); continue; }
      const style = PARTICLE_STYLE[p.kind];
      const drag = Math.exp(-style.drag * dt);
      p.velocity.multiplyScalar(drag);
      p.velocity.y -= style.gravity * dt;
      p.sprite.position.addScaledVector(p.velocity, dt);
      // They shrink away rather than fade, as Java's do.
      const scale = p.size * Math.max(0.2, p.life / p.maxLife);
      p.sprite.scale.set(scale, scale, scale);
    }
  }

  counts() {
    const out = {};
    for (const p of this.live) out[p.kind] = (out[p.kind] ?? 0) + 1;
    return out;
  }

  dispose() {
    for (let i = this.live.length - 1; i >= 0; i--) this.remove(i);
    for (const m of this.materials.values()) { m.map?.dispose(); m.dispose(); }
    this.materials.clear();
  }
}
