// Armour must sit clear of the body it covers, or the two flicker (z-fighting) as the camera moves: Java draws armour
// one pixel (1/16 block) outside the body part (HumanoidArmorModel, CubeDeformation 1.0; the leggings 0.5), and the
// skin's outer layer only a quarter or half a pixel out, so no armour face ever lies in the plane of a skin face and no
// skin pokes through armour by a sliver. Checked on the player model the game and the films draw (src/playerModel.js),
// standing at rest, where every box is aligned with the axes.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPlayerModel } from '../src/playerModel.js';

const SAME_PLANE = 1 / 128; // closer than this, two parallel faces fight for the same pixels at a distance
const SLIVER = 1 / 16;      // skin out past armour by less than a pixel is a poke-through, not a limb going on

function boxesOf(model) {
  model.updateMatrixWorld(true);
  const out = [];
  model.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    o.geometry.computeBoundingBox();
    const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
    let armour = false, part = '';
    for (let p = o; p; p = p.parent) { if (/^armor_/.test(p.name)) { armour = true; part = p.name; } }
    out.push({ mesh: o, box: b, armour, part, name: `${part || 'skin'}#${out.length}` });
  });
  return out;
}

const AXES = ['x', 'y', 'z'];
const overlapArea = (a, b, axis) => {
  const [u, v] = AXES.filter((k) => k !== axis);
  const du = Math.min(a.max[u], b.max[u]) - Math.max(a.min[u], b.min[u]);
  const dv = Math.min(a.max[v], b.max[v]) - Math.max(a.min[v], b.min[v]);
  return du > 1e-4 && dv > 1e-4 ? du * dv : 0;
};

/** Faces of two boxes in one plane, facing the same way, overlapping: they fight. */
function sharedFaces(a, b) {
  const found = [];
  for (const axis of AXES) {
    if (!overlapArea(a.box, b.box, axis)) continue;
    for (const side of ['min', 'max']) {
      if (Math.abs(a.box[side][axis] - b.box[side][axis]) < SAME_PLANE) found.push(`${side} ${axis} at ${a.box[side][axis].toFixed(4)}`);
    }
  }
  return found;
}

/** A skin box whose cross-section lies inside the armour's and which sticks out past it by a sliver. */
function pokesThrough(skin, armour) {
  const found = [];
  for (const axis of AXES) {
    const [u, v] = AXES.filter((k) => k !== axis);
    const inside = [u, v].every((k) => skin.box.min[k] >= armour.box.min[k] - 1e-4 && skin.box.max[k] <= armour.box.max[k] + 1e-4);
    const overlaps = skin.box.max[axis] > armour.box.min[axis] && skin.box.min[axis] < armour.box.max[axis];
    if (!inside || !overlaps) continue;
    const out = { max: skin.box.max[axis] - armour.box.max[axis], min: armour.box.min[axis] - skin.box.min[axis] };
    for (const side of ['min', 'max']) if (out[side] > 1e-4 && out[side] < SLIVER) found.push(`${side} ${axis} by ${out[side].toFixed(4)}`);
  }
  return found;
}

const FULL_SET = { head: { id: 'iron_helmet' }, chest: { id: 'iron_chestplate' }, legs: { id: 'iron_leggings' }, feet: { id: 'iron_boots' } };
const TRIMMED = Object.fromEntries(Object.entries(FULL_SET).map(([k, v]) => [k, { ...v, trim: { pattern: 'coast', material: 'gold' } }]));

for (const modelType of ['default', 'slim']) {
  const LEATHER = { head: { id: 'leather_helmet' }, chest: { id: 'leather_chestplate' }, legs: { id: 'leather_leggings' }, feet: { id: 'leather_boots' } };
  const TURTLE = { ...FULL_SET, head: { id: 'turtle_helmet' } };
  for (const [label, armour] of [['iron', FULL_SET], ['trimmed iron', TRIMMED], ['leather', LEATHER], ['turtle-shell and iron', TURTLE]]) {
    test(`${label} armour on a ${modelType === 'slim' ? 'slim (Alex)' : 'wide (Steve)'} player shares no face with the body and lets none poke through`, () => {
      const model = createPlayerModel({ modelType, followEquippedSkin: false });
      model.updateArmor(armour);
      const boxes = boxesOf(model);
      const skin = boxes.filter((b) => !b.armour), worn = boxes.filter((b) => b.armour);
      assert.ok(worn.length >= 8, 'the armour was put on');
      const problems = [];
      for (const a of worn) {
        for (const s of skin) {
          for (const f of sharedFaces(a, s)) problems.push(`${a.name} shares a face with ${s.name}: ${f}`);
          for (const f of pokesThrough(s, a)) problems.push(`${s.name} pokes through ${a.name}: ${f}`);
        }
        for (const b of worn) {
          // Two pieces of one material in one plane look the same whichever wins: only different colours flicker.
          if (b === a || b.part !== a.part || boxes.indexOf(b) < boxes.indexOf(a) || b.mesh.material === a.mesh.material) continue;
          for (const f of sharedFaces(a, b)) problems.push(`${a.name} shares a face with ${b.name}: ${f}`);
        }
      }
      assert.deepEqual(problems, []);
    });
  }
}

test('the chestplate covers the top of the shoulder by at least half a pixel over the sleeve', () => {
  const model = createPlayerModel({ followEquippedSkin: false });
  model.updateArmor({ chest: { id: 'iron_chestplate' } });
  const boxes = boxesOf(model);
  const arm = model.rightArm ?? model.children.find((c) => c.position.x > 0.3);
  const top = (list) => Math.max(...list.map((b) => b.box.max.y));
  const armSkin = boxes.filter((b) => !b.armour && arm && b.mesh.parent === arm);
  const pauldron = boxes.filter((b) => b.part === 'armor_chestplate_rightArm');
  assert.ok(armSkin.length && pauldron.length);
  assert.ok(top(pauldron) - top(armSkin) >= 1 / 32, `armour top ${top(pauldron)} vs sleeve top ${top(armSkin)}`);
});
