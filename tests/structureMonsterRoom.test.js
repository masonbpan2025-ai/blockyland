// Monster rooms: the wiki's placement test, room, chests, spawner odds and mossy floor. Card MR1-MR5 + W1 runs in
// tests/structureWikiCards.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { tryMonsterRoom, buildMonsterRoom, generateMonsterRoom, realizeMonsterRoom, MONSTER_ROOM_LOOT } from '../src/worldgen/generators/monsterRoom.js';
import { LegacyRandom } from '../src/worldgen/random.js';
import { StructureTemplate } from '../src/worldgen/template.js';
import { BLOCKS } from '../src/blocks.js';

// Solid rock with a two-high tunnel along z = 0 at y 10-11.
const tunnel = (x, y, z) => !(z === 0 && (y === 10 || y === 11));
const rock = () => true;

test('the ground test: solid floor and ceiling, 1-5 openings', () => {
  assert.equal(tryMonsterRoom(new LegacyRandom(1n), rock, 0, 10, 4), null, 'no opening: no room');
  let found = 0;
  for (let s = 0; s < 40; s++) {
    const room = tryMonsterRoom(new LegacyRandom(BigInt(s)), tunnel, 0, 10, 3);
    if (!room) continue;
    found++;
    assert.ok([2, 3].includes(room.rx) && [2, 3].includes(room.rz));
  }
  assert.ok(found > 0);
  // A tunnel through the middle of the room's wall line gives more than 5 openings for a 9-wide room's long wall.
  const open = (x, y, z) => !((y === 10 || y === 11) && Math.abs(z) <= 4 && Math.abs(x) <= 4);
  assert.equal(tryMonsterRoom(new LegacyRandom(3n), open, 0, 10, 0), null, 'too many openings');
});

test('the room: 7 or 9 wide, spawner in the middle, chests against one wall, mostly mossy floor, mob odds', () => {
  const mobs = { zombie: 0, skeleton: 0, spider: 0 };
  let mossy = 0; let floor = 0;
  for (let s = 0; s < 400; s++) {
    const room = tryMonsterRoom(new LegacyRandom(BigInt(s) * 7919n), tunnel, 0, 10, 3);
    if (!room) continue;
    mobs[room.mob]++;
    const t = new StructureTemplate(buildMonsterRoom(room), 'r');
    const at = (n) => t.blocks.filter((b) => t.palette[b.state].name === `minecraft:${n}`);
    const [spawner] = at('spawner');
    assert.deepEqual(spawner.pos, [room.rx + 1, 1, room.rz + 1]);
    assert.ok(at('chest').length <= 2);
    for (const c of at('chest')) assert.equal(c.nbt.LootTable, MONSTER_ROOM_LOOT);
    for (const b of t.blocks.filter((x) => x.pos[1] === 0)) { floor++; if (t.palette[b.state].name === 'minecraft:mossy_cobblestone') mossy++; }
  }
  const total = mobs.zombie + mobs.skeleton + mobs.spider;
  assert.ok(total > 100);
  assert.ok(Math.abs(mobs.zombie / total - 0.5) < 0.1 && Math.abs(mobs.skeleton / total - 0.25) < 0.1, JSON.stringify(mobs));
  assert.ok(Math.abs(mossy / floor - 0.75) < 0.03, `${mossy}/${floor} mossy`);
});

test('a chunk plans its rooms from the ground; the spawner goes to the world with its mob', () => {
  const ctx = { solidAt: (x, y, z) => !(((z % 16) + 16) % 16 === 5 && (y === 10 || y === 11)) && y < 40 };
  let start = null;
  for (let c = 0; c < 50 && !start; c++) start = generateMonsterRoom({ seed: 1, chunkX: c, chunkZ: 0, structureId: 'monster_room', context: ctx });
  assert.ok(start);
  const spawners = [];
  const r = realizeMonsterRoom(start, (x, y, z, id, meta) => { if (meta.spawner) spawners.push(meta.spawner); return true; }, BLOCKS);
  assert.deepEqual(r.missingBlocks, []);
  assert.deepEqual(spawners, start.meta.mobs);
});
