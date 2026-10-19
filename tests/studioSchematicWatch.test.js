import { describe, it, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { SchematicWatcher, DevServerSchematicSource } from '../src/studioSchematicWatch.js';
import { createStudioSchematicsMiddleware } from '../server/studioSchematics.js';
import { BuildingStudioManager, STUDIO_GROUND_Y } from '../src/buildingStudio.js';
import { BuildingLibrary } from '../src/buildingLibrary.js';
import { BLOCKS } from '../src/blocks.js';
import { writeSpongeSchematic } from '../src/io/codecs.js';
import { CanonicalStructure, CanonicalRegion, CanonicalBlockState } from '../src/io/canonical.js';

/** An in-memory folder: set(name, bytes) bumps the stamp the way a real write bumps mtime. */
function fakeSource() {
  const files = new Map();
  let clock = 0;
  return {
    label: 'fake/',
    reads: [],
    set(name, bytes) { files.set(name, { bytes, stamp: String(++clock) }); },
    remove(name) { files.delete(name); },
    async list() { return [...files].map(([name, f]) => ({ name, stamp: f.stamp })); },
    async read(name) { this.reads.push(name); return files.get(name).bytes; }
  };
}

/** An in-memory folder that also accepts Save's writes. */
function writableSource() {
  const files = new Map();
  let clock = 0;
  return {
    label: 'test/',
    files,
    set(name, bytes) { files.set(name, { bytes, stamp: String(++clock) }); },
    async list() { return [...files].map(([name, f]) => ({ name, stamp: f.stamp, size: f.bytes.length, mtime: 1 })); },
    async read(name) { return files.get(name).bytes; },
    async write(name, bytes) { files.set(name, { bytes, stamp: String(++clock) }); },
    async exists(name) { return files.has(name); }
  };
}

const watcherFor = (source, onChange, onStatus) =>
  new SchematicWatcher({ source, onChange, onStatus, setIntervalImpl: () => 1, clearIntervalImpl: () => {} });

async function schemBytes(blocks) {
  const region = new CanonicalRegion({
    name: 'main',
    size: { x: 4, y: 4, z: 4 },
    blocks: blocks.map(([x, y, z, name]) => ({ pos: { x, y, z }, state: new CanonicalBlockState(`minecraft:${name}`) }))
  });
  const structure = new CanonicalStructure({ name: 'test', regions: [region], source: { format: 'test', edition: 'java' } });
  return writeSpongeSchematic(structure, { version: 2 });
}

describe('SchematicWatcher', () => {
  it('treats files present at start as the baseline and does not import them', async () => {
    const source = fakeSource();
    source.set('old.schem', new Uint8Array([1]));
    const seen = [];
    const watcher = watcherFor(source, (name) => seen.push(name));
    await watcher.start();
    await watcher.poll();
    await watcher.poll();
    assert.deepEqual(seen, []);
  });

  it('delivers a change only after its stamp holds still for one poll', async () => {
    const source = fakeSource();
    const seen = [];
    const watcher = watcherFor(source, (name, bytes) => seen.push([name, bytes[0]]));
    await watcher.start();

    source.set('castle.schem', new Uint8Array([1]));
    assert.deepEqual(await watcher.poll(), [], 'first sighting waits: the writer may not be done');
    source.set('castle.schem', new Uint8Array([2]));
    assert.deepEqual(await watcher.poll(), [], 'still changing');
    assert.deepEqual(await watcher.poll(), ['castle.schem']);
    assert.deepEqual(seen, [['castle.schem', 2]]);
    assert.deepEqual(await watcher.poll(), [], 'an unchanged file is not delivered twice');
  });

  it('reports a file that fails to import once, then tries its next write', async () => {
    const source = fakeSource();
    const errors = [];
    let fail = true;
    const seen = [];
    const watcher = watcherFor(source, (name) => { if (fail) throw new Error('truncated'); seen.push(name); }, (s) => { if (s.state === 'error') errors.push(s.name); });
    await watcher.start();

    source.set('a.schem', new Uint8Array([1]));
    await watcher.poll();
    await watcher.poll();
    await watcher.poll();
    assert.deepEqual(errors, ['a.schem'], 'the same broken bytes are not retried every second');

    fail = false;
    source.set('a.schem', new Uint8Array([2]));
    await watcher.poll();
    await watcher.poll();
    assert.deepEqual(seen, ['a.schem']);
  });

  it('forgets deleted files, so a file written again under the same name is picked up', async () => {
    const source = fakeSource();
    const seen = [];
    const watcher = watcherFor(source, (name) => seen.push(name));
    source.set('b.schem', new Uint8Array([1]));
    await watcher.start();
    source.remove('b.schem');
    await watcher.poll();
    source.set('b.schem', new Uint8Array([1]));
    await watcher.poll();
    await watcher.poll();
    assert.deepEqual(seen, ['b.schem']);
  });

  it('settle() treats the studio’s own save as handled, so it is not delivered back', async () => {
    const source = fakeSource();
    const seen = [];
    const watcher = watcherFor(source, (name) => seen.push(name));
    await watcher.start();
    source.set('saved.schem', new Uint8Array([9]));
    await watcher.settle('saved.schem');
    await watcher.poll();
    await watcher.poll();
    assert.deepEqual(seen, [], 'the write the studio just made is not an external change');
  });
});

describe('build_studio_schematics dev server routes', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-schem-'));
  fs.writeFileSync(path.join(dir, 'tower.schem'), Buffer.from([7, 8, 9]));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'not a schematic');
  fs.writeFileSync(path.join(path.dirname(dir), 'secret.schem'), 'outside');
  const middleware = createStudioSchematicsMiddleware(dir);
  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(path.join(path.dirname(dir), 'secret.schem'), { force: true });
  });

  function request(url) {
    return new Promise((resolve) => {
      const res = {
        statusCode: 200, headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(body) { resolve({ status: this.statusCode, headers: this.headers, body: Buffer.from(body ?? '') }); }
      };
      middleware({ url, method: 'GET', headers: { host: 'localhost' } }, res, () => resolve({ status: 'next' }));
    });
  }

  /** Drive a body-carrying request through the middleware (Save writes this way). */
  function writeRequest(url, bytes, method = 'PUT', contentType = 'application/octet-stream') {
    return new Promise((resolve) => {
      const res = {
        statusCode: 200, headers: {},
        setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
        end(body) { resolve({ status: this.statusCode, headers: this.headers, body: Buffer.from(body ?? '') }); }
      };
      const listeners = {};
      const req = {
        url, method, headers: { host: 'localhost', 'content-type': contentType },
        on(type, fn) { (listeners[type] ||= []).push(fn); return this; },
        destroy() {}
      };
      middleware(req, res, () => resolve({ status: 'next' }));
      setTimeout(() => {
        for (const fn of listeners.data || []) fn(Buffer.from(bytes));
        for (const fn of listeners.end || []) fn();
      }, 0);
    });
  }

  it('lists only .schem files with mtime and size', async () => {
    const res = await request('/api/studio-schematics');
    const body = JSON.parse(res.body.toString());
    assert.deepEqual(body.files.map((f) => f.name), ['tower.schem']);
    assert.equal(body.files[0].size, 3);
    assert.equal(res.headers['cache-control'], 'no-store');
  });

  it('serves a file by name and refuses to leave the folder', async () => {
    assert.deepEqual([...(await request('/api/studio-schematics/tower.schem')).body], [7, 8, 9]);
    assert.equal((await request('/api/studio-schematics/..%2Fsecret.schem')).status, 404);
    assert.equal((await request('/api/studio-schematics/notes.txt')).status, 404);
  });

  it('writes a .schem into the folder, which Save relies on', async () => {
    const res = await writeRequest('/api/studio-schematics/created.schem', [1, 2, 3]);
    assert.equal(res.status, 200);
    assert.equal(JSON.parse(res.body.toString()).name, 'created.schem');
    assert.deepEqual([...(await request('/api/studio-schematics/created.schem')).body], [1, 2, 3]);
    const list = JSON.parse((await request('/api/studio-schematics')).body.toString());
    assert.ok(list.files.some((f) => f.name === 'created.schem'));
    fs.rmSync(path.join(dir, 'created.schem'), { force: true });
  });

  it('refuses to write anything that is not a .schem file', async () => {
    const res = await writeRequest('/api/studio-schematics/..%2Fescape.schem', [1]);
    // path.basename keeps every write inside the folder.
    assert.equal(res.status, 200);
    assert.ok(fs.existsSync(path.join(dir, 'escape.schem')));
    assert.equal(fs.existsSync(path.join(path.dirname(dir), 'escape.schem')), false);
    fs.rmSync(path.join(dir, 'escape.schem'), { force: true });
    assert.equal((await writeRequest('/api/studio-schematics/notes.txt', [1])).status, 404);
  });

  it('refuses a write that is not sent as binary data', async () => {
    const res = await writeRequest('/api/studio-schematics/form.schem', [1], 'PUT', 'text/plain');
    assert.equal(res.status, 415);
    assert.equal(fs.existsSync(path.join(dir, 'form.schem')), false);
  });

  it('leaves other routes alone', async () => {
    assert.equal((await request('/api/saves')).status, 'next');
    assert.equal((await writeRequest('/api/saves', [1], 'POST')).status, 'next');
  });

  it('is what DevServerSchematicSource reads and writes', async () => {
    const fetchImpl = async (url, options = {}) => {
      const res = options.method === 'PUT' ? await writeRequest(url, options.body) : await request(url);
      return { ok: res.status === 200, status: res.status, json: async () => JSON.parse(res.body.toString()), arrayBuffer: async () => res.body };
    };
    const source = new DevServerSchematicSource({ fetchImpl });
    assert.equal(await source.probe(), true);
    assert.deepEqual((await source.list()).map((f) => f.name), ['tower.schem']);
    assert.deepEqual([...(await source.read('tower.schem'))], [7, 8, 9]);

    await source.write('from_source.schem', new Uint8Array([4, 5]));
    assert.equal(await source.exists('from_source.schem'), true);
    assert.equal(await source.exists('nope.schem'), false);
    assert.deepEqual([...(await source.read('from_source.schem'))], [4, 5]);
    fs.rmSync(path.join(dir, 'from_source.schem'), { force: true });
  });

  it('probe is false on a static host that answers with index.html', async () => {
    const source = new DevServerSchematicSource({ fetchImpl: async () => ({ ok: true, json: async () => { throw new SyntaxError('<!doctype'); } }) });
    assert.equal(await source.probe(), false);
  });
});

describe('Building Studio live schematic updates', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('overwrites the same library building on each change and redraws it in place', async () => {
    const placed = new Map();
    const world = { setVoxel: (x, y, z, id) => { if (id === BLOCKS.AIR) placed.delete(`${x},${y},${z}`); else placed.set(`${x},${y},${z}`, id); } };
    const studio = new BuildingStudioManager({ world });
    const before = BuildingLibrary.getAllBuildings().length;

    const first = await studio.applyLiveSchematic('live_tower.schem', await schemBytes([[0, 0, 0, 'stone'], [0, 1, 0, 'stone']]));
    assert.equal(studio.currentBuilding.id, first.id, 'a new file is shown');
    assert.equal(placed.size, 2);

    const second = await studio.applyLiveSchematic('live_tower.schem', await schemBytes([[0, 0, 0, 'oak_planks'], [0, 1, 0, 'oak_planks'], [0, 2, 0, 'oak_planks']]));
    assert.equal(second.id, first.id, 'the same building, not a copy');
    assert.equal(BuildingLibrary.getAllBuildings().length, before + 1);
    assert.equal(placed.size, 3, 'the old voxels are cleared and the new ones drawn');
    assert.ok([...placed.values()].every((id) => id === BLOCKS.OAK_PLANKS));

    BuildingLibrary.deleteBuilding(first.id);
  });

  it('rejects a schematic with no placeable blocks, so the watcher reports it', async () => {
    const studio = new BuildingStudioManager({ world: { setVoxel() {} } });
    await assert.rejects(studio.applyLiveSchematic('empty.schem', await schemBytes([])), /no placeable blocks/);
  });

  it('saves the build as a .schem file, watches only that file, and reloads an agent rewrite', async () => {
    const placed = new Map();
    const world = { setVoxel: (x, y, z, id) => { if (id === BLOCKS.AIR) placed.delete(`${x},${y},${z}`); else placed.set(`${x},${y},${z}`, id); } };
    const studio = new BuildingStudioManager({ world });
    const source = writableSource();
    studio.source = source;
    studio.liveWatcher = watcherFor(source, (name, bytes) => studio.handleWatchedFileChange(name, bytes));
    await studio.liveWatcher.start();

    studio.adoptCustomBuild({
      name: 'Live Tower',
      blocks: [
        { x: 0, y: STUDIO_GROUND_Y, z: 8, id: BLOCKS.STONE },
        { x: 0, y: STUDIO_GROUND_Y + 1, z: 8, id: BLOCKS.STONE }
      ]
    });

    const filename = await studio.writeSchematicFile('live_tower.schem', 'Live Tower');
    assert.equal(filename, 'live_tower.schem');
    assert.ok(source.files.has('live_tower.schem'), 'Save writes the file into the studio folder');
    assert.equal(studio.activeFile, 'live_tower.schem', 'the saved file is the one the studio watches');
    assert.ok(BuildingLibrary.getBuilding('Live Tower'), 'the build stays placeable from the library');

    // A rewrite by an agent (different blocks) is read back and redrawn in place.
    source.set('live_tower.schem', await schemBytes([
      [0, 0, 0, 'oak_planks'], [0, 1, 0, 'oak_planks'], [0, 2, 0, 'oak_planks']
    ]));
    assert.deepEqual(await studio.liveWatcher.poll(), [], 'the writer may still be busy');
    assert.deepEqual(await studio.liveWatcher.poll(), ['live_tower.schem']);
    assert.equal(placed.size, 3, 'the new file is rendered');
    assert.ok([...placed.values()].every((id) => id === BLOCKS.OAK_PLANKS));

    // Another file changing in the same folder must not replace what is on screen.
    const before = studio.currentBuilding;
    source.set('someone_else.schem', await schemBytes([[0, 0, 0, 'glass']]));
    await studio.liveWatcher.poll();
    await studio.liveWatcher.poll();
    assert.equal(studio.currentBuilding, before, 'only the studio’s own file reloads');
    assert.equal(studio.activeFile, 'live_tower.schem');

    const mapped = studio.liveBuildingIds.get('live_tower.schem');
    if (mapped) BuildingLibrary.deleteBuilding(mapped);
  });
});

/** A fetch implementation backed by the real dev-server middleware: files really land in `dir`. */
function middlewareFetch(dir) {
  const middleware = createStudioSchematicsMiddleware(dir);
  const run = (url, { method = 'GET', body } = {}) => new Promise((resolve) => {
    const res = {
      statusCode: 200, headers: {},
      setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
      end(data) { resolve({ status: this.statusCode, headers: this.headers, body: Buffer.from(data ?? '') }); }
    };
    const listeners = {};
    const req = {
      url, method, headers: { host: 'localhost', 'content-type': 'application/octet-stream' },
      on(type, fn) { (listeners[type] ||= []).push(fn); return this; },
      destroy() {}
    };
    middleware(req, res, () => resolve({ status: 'next' }));
    setTimeout(() => {
      if (body !== undefined) for (const fn of listeners.data || []) fn(Buffer.from(body));
      for (const fn of listeners.end || []) fn();
    }, 0);
  });
  return async (url, options = {}) => {
    const res = await run(url, { method: options.method || 'GET', body: options.body });
    return {
      ok: res.status === 200,
      status: res.status,
      json: async () => JSON.parse(res.body.toString()),
      arrayBuffer: async () => res.body
    };
  };
}

/** .schem bytes for a list of [x, y, z, block] entries, as an agent writing the file would produce. */
async function buildingSchem(size, list, name = 'agent build') {
  const region = new CanonicalRegion({
    name: 'main',
    origin: { x: 0, y: 0, z: 0 },
    size,
    blocks: list.map(([x, y, z, block]) => ({ pos: { x, y, z }, state: new CanonicalBlockState(`minecraft:${block}`) }))
  });
  const structure = new CanonicalStructure({
    name,
    regions: [region],
    source: { format: 'sponge-schem-v3', edition: 'java', dataVersion: 4189 }
  });
  return writeSpongeSchematic(structure, { version: 3 });
}

/** A 5x4x5 house: stone brick floor, plank walls with a front door and a window, brick roof. */
function houseBlocks() {
  const map = new Map();
  const put = (x, y, z, block) => map.set(`${x},${y},${z}`, [x, y, z, block]);
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) put(x, 0, z, 'stone_bricks');
  for (let y = 1; y <= 2; y++) {
    for (let x = 0; x < 5; x++) {
      for (let z = 0; z < 5; z++) {
        if (x !== 0 && x !== 4 && z !== 0 && z !== 4) continue;
        if (z === 0 && x === 2 && y === 1) continue; // front door
        if (z === 0 && x === 1 && y === 2) { put(x, y, z, 'glass'); continue; } // window
        put(x, y, z, 'oak_planks');
      }
    }
  }
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) put(x, 3, z, 'bricks');
  return [...map.values()];
}

describe('Building Studio: a saved .schem edited on disk reloads the new building', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.clear();
  });

  it('saves through the dev-server route, then shows two buildings an agent writes to that file', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-live-'));
    const voxels = new Map();
    const world = {
      setVoxel(x, y, z, id) {
        const key = `${x},${y},${z}`;
        if (id === BLOCKS.AIR) voxels.delete(key);
        else voxels.set(key, id);
      },
      getVoxel(x, y, z) { return voxels.get(`${x},${y},${z}`) ?? BLOCKS.AIR; }
    };
    const studio = new BuildingStudioManager({ world });
    const source = new DevServerSchematicSource({ fetchImpl: middlewareFetch(dir) });
    studio.source = source;
    studio.liveWatcher = watcherFor(source, (name, bytes) => studio.handleWatchedFileChange(name, bytes));
    await studio.liveWatcher.start();

    try {
      studio.adoptCustomBuild({
        name: 'Disk House',
        blocks: [
          { x: 0, y: STUDIO_GROUND_Y, z: 8, id: BLOCKS.STONE },
          { x: 1, y: STUDIO_GROUND_Y, z: 8, id: BLOCKS.STONE }
        ]
      });
      await studio.writeSchematicFile('disk_house.schem', 'Disk House');
      const file = path.join(dir, 'disk_house.schem');
      assert.ok(fs.existsSync(file), 'Save wrote the file through the real dev-server route');
      assert.equal(studio.activeFile, 'disk_house.schem');

      // First agent edit, written straight to the file: a 3-block plank wall.
      fs.writeFileSync(file, await buildingSchem(
        { x: 3, y: 1, z: 1 },
        [[0, 0, 0, 'oak_planks'], [1, 0, 0, 'oak_planks'], [2, 0, 0, 'oak_planks']],
        'wall'
      ));
      assert.deepEqual(await studio.liveWatcher.poll(), [], 'the writer may still be busy');
      assert.deepEqual(await studio.liveWatcher.poll(), ['disk_house.schem']);
      assert.equal(studio.placedVoxels.length, 3, 'the studio rendered the edited file');
      assert.equal(world.getVoxel(-1, STUDIO_GROUND_Y, 8), BLOCKS.OAK_PLANKS);
      assert.equal(world.getVoxel(0, STUDIO_GROUND_Y, 8), BLOCKS.OAK_PLANKS);
      assert.equal(world.getVoxel(1, STUDIO_GROUND_Y, 8), BLOCKS.OAK_PLANKS);
      assert.match(studio.currentBuilding.description, /3 voxels/);

      // Second agent edit, through the same save endpoint the dev server exposes: a house.
      await source.write('disk_house.schem', await buildingSchem({ x: 5, y: 4, z: 5 }, houseBlocks(), 'house'));
      await studio.liveWatcher.poll();
      await studio.liveWatcher.poll();
      assert.equal(studio.placedVoxels.length, 81, 'the house replaced the wall');
      assert.equal(world.getVoxel(0, STUDIO_GROUND_Y, 8), BLOCKS.STONE_BRICKS, 'floor');
      assert.equal(world.getVoxel(-1, STUDIO_GROUND_Y + 2, 6), BLOCKS.GLASS, 'window');
      assert.equal(world.getVoxel(0, STUDIO_GROUND_Y + 1, 6), BLOCKS.AIR, 'door gap');
      assert.equal(world.getVoxel(-2, STUDIO_GROUND_Y + 3, 6), BLOCKS.BRICKS, 'roof');
      assert.match(studio.currentBuilding.description, /81 voxels/);

      const mappedId = studio.liveBuildingIds.get('disk_house.schem');
      const entries = BuildingLibrary.getAllBuildings().filter((b) => b.id === mappedId);
      assert.equal(entries.length, 1, 'the same file stays one library building across edits');
      assert.match(entries[0].description, /81 voxels/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
      const mapped = studio.liveBuildingIds.get('disk_house.schem');
      if (mapped) BuildingLibrary.deleteBuilding(mapped);
    }
  });
});
