// The `vec3` package's Vec3, which Mineflayer programs use for every position.
export class Vec3 {
  constructor(x = 0, y = 0, z = 0) { if (typeof x === 'object' && x) { ({ x = 0, y = 0, z = 0 } = Array.isArray(x) ? { x: x[0], y: x[1], z: x[2] } : x); } this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  update(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; }
  floored() { return new Vec3(Math.floor(this.x), Math.floor(this.y), Math.floor(this.z)); }
  floor() { this.x = Math.floor(this.x); this.y = Math.floor(this.y); this.z = Math.floor(this.z); return this; }
  rounded() { return new Vec3(Math.round(this.x), Math.round(this.y), Math.round(this.z)); }
  round() { this.x = Math.round(this.x); this.y = Math.round(this.y); this.z = Math.round(this.z); return this; }
  offset(dx, dy, dz) { return new Vec3(this.x + dx, this.y + dy, this.z + dz); }
  translate(dx, dy, dz) { this.x += dx; this.y += dy; this.z += dz; return this; }
  plus(o) { return this.offset(o.x, o.y, o.z); }
  add(o) { return this.translate(o.x, o.y, o.z); }
  minus(o) { return this.offset(-o.x, -o.y, -o.z); }
  subtract(o) { return this.translate(-o.x, -o.y, -o.z); }
  scaled(s) { return new Vec3(this.x * s, this.y * s, this.z * s); }
  multiply(o) { this.x *= o.x; this.y *= o.y; this.z *= o.z; return this; }
  divide(o) { this.x /= o.x; this.y /= o.y; this.z /= o.z; return this; }
  abs() { return new Vec3(Math.abs(this.x), Math.abs(this.y), Math.abs(this.z)); }
  volume() { return this.x * this.y * this.z; }
  modulus(o) { const m = (a, b) => ((a % b) + b) % b; return new Vec3(m(this.x, o.x), m(this.y, o.y), m(this.z, o.z)); }
  distanceTo(o) { return Math.sqrt(this.distanceSquared(o)); }
  distanceSquared(o) { const dx = o.x - this.x, dy = o.y - this.y, dz = o.z - this.z; return dx * dx + dy * dy + dz * dz; }
  equals(o, e = 0) { return Math.abs(this.x - o.x) <= e && Math.abs(this.y - o.y) <= e && Math.abs(this.z - o.z) <= e; }
  toString() { return `(${this.x}, ${this.y}, ${this.z})`; }
  clone() { return new Vec3(this.x, this.y, this.z); }
  min(o) { return new Vec3(Math.min(this.x, o.x), Math.min(this.y, o.y), Math.min(this.z, o.z)); }
  max(o) { return new Vec3(Math.max(this.x, o.x), Math.max(this.y, o.y), Math.max(this.z, o.z)); }
  norm() { return Math.hypot(this.x, this.y, this.z); }
  dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z; }
  cross(o) { return new Vec3(this.y * o.z - this.z * o.y, this.z * o.x - this.x * o.z, this.x * o.y - this.y * o.x); }
  unit() { const n = this.norm(); return n ? this.scaled(1 / n) : new Vec3(0, 0, 0); }
  normalize() { const n = this.norm(); if (n) { this.x /= n; this.y /= n; this.z /= n; } return this; }
  innerProduct(o) { return this.dot(o); }
  toArray() { return [this.x, this.y, this.z]; }
}
export function vec3(x, y, z) { return new Vec3(x, y, z); }
vec3.Vec3 = Vec3;
