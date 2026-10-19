// Live .schem sync for Building Studio: poll a folder and hand each changed schematic to the Studio.
//
// Two sources, one watcher:
//   - the dev (and preview) server's build_studio_schematics/ folder, at /api/studio-schematics -- the default when the
//     game runs locally, so an agent writing into the project needs no setup at all;
//   - a folder the player picks with the File System Access API -- the only way a deployed (static) build can read a
//     local path. The handle is kept in IndexedDB so the choice survives a reload.
//
// Both are polled rather than pushed: a static build has no server to push from, and polling one small folder once a
// second costs nothing. A file is read only once its size and mtime have held still for a whole poll, because a
// generator may still be writing it; a file that fails to parse is retried on the next change rather than dropped.
// Both sources also write: Save puts the studio's current build into the same folder and then watches it.

export const DEV_SCHEMATICS_ENDPOINT = '/api/studio-schematics';
export const DEV_SCHEMATICS_FOLDER = 'build_studio_schematics';
const SCHEM_PATTERN = /\.schem$/i;

/** The dev server's watched folder. `probe()` is false on a static build, where the endpoint does not exist. */
export class DevServerSchematicSource {
  constructor({ fetchImpl = globalThis.fetch?.bind(globalThis), base = '' } = {}) {
    this.fetch = fetchImpl;
    this.base = base;
    this.kind = 'dev-server';
    this.label = `${DEV_SCHEMATICS_FOLDER}/`;
  }

  async probe() {
    try {
      const listing = await this.list();
      return Array.isArray(listing);
    } catch {
      return false;
    }
  }

  async list() {
    const res = await this.fetch(`${this.base}${DEV_SCHEMATICS_ENDPOINT}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`listing failed: ${res.status}`);
    // A static host answers unknown paths with index.html; only the real endpoint returns this shape.
    const body = await res.json();
    if (!body || !Array.isArray(body.files)) throw new Error('not a schematic listing');
    if (body.path) this.path = body.path;
    return body.files.filter((f) => SCHEM_PATTERN.test(f.name)).map((f) => ({ name: f.name, stamp: `${f.mtime}:${f.size}`, mtime: f.mtime, size: f.size }));
  }

  async read(name) {
    const res = await this.fetch(`${this.base}${DEV_SCHEMATICS_ENDPOINT}/${encodeURIComponent(name)}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`read failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Save a file into the folder the dev server watches. */
  async write(name, bytes) {
    const res = await this.fetch(`${this.base}${DEV_SCHEMATICS_ENDPOINT}/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: bytes
    });
    if (!res.ok) throw new Error(`save failed: ${res.status}`);
  }

  async exists(name) {
    const wanted = String(name).toLowerCase();
    return (await this.list()).some((f) => f.name.toLowerCase() === wanted);
  }
}

/** A folder the player chose, read through its FileSystemDirectoryHandle. */
export class DirectorySchematicSource {
  constructor(handle, { writable = true } = {}) {
    this.handle = handle;
    this.kind = 'directory';
    this.label = `${handle.name}/`;
    this.writable = writable;
  }

  async list() {
    const out = [];
    for await (const entry of this.handle.values()) {
      if (entry.kind !== 'file' || !SCHEM_PATTERN.test(entry.name)) continue;
      const file = await entry.getFile();
      out.push({ name: entry.name, stamp: `${file.lastModified}:${file.size}`, mtime: file.lastModified, size: file.size });
    }
    return out;
  }

  async read(name) {
    const file = await (await this.handle.getFileHandle(name)).getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  /** Write a file into the chosen folder (the picker asked for read/write access). */
  async write(name, bytes) {
    if (!this.writable) throw new Error(`${this.label} was opened read-only`);
    const handle = await this.handle.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    await writable.write(bytes);
    await writable.close();
  }

  async exists(name) {
    try {
      await this.handle.getFileHandle(name);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Poll a source and call `onChange(name, bytes)` once per settled change.
 *
 * Files already in the folder when watching starts are the baseline and are not imported. A new or changed file is
 * read on the first poll where its stamp matches the previous poll's. If reading or `onChange` throws (say, a truncated
 * gzip), the error is reported and that stamp is not tried again; the file's next write is.
 */
export class SchematicWatcher {
  constructor({ source, onChange, onStatus = () => {}, intervalMs = 1000, setIntervalImpl = (fn, ms) => setInterval(fn, ms), clearIntervalImpl = (id) => clearInterval(id) }) {
    this.source = source;
    this.onChange = onChange;
    this.onStatus = onStatus;
    this.intervalMs = intervalMs;
    // Kept as arrows, not bare window.setInterval: called as a method it throws "Illegal invocation" in browsers.
    this.setInterval = setIntervalImpl;
    this.clearInterval = clearIntervalImpl;
    this.handled = new Map();  // name -> stamp already delivered (or baseline)
    this.pending = new Map();  // name -> stamp seen on the last poll, waiting to settle
    this.timer = null;
    this.polling = false;
    this.started = false;
  }

  async start() {
    this.stop();
    const files = await this.source.list();
    this.handled = new Map(files.map((f) => [f.name, f.stamp]));
    this.pending.clear();
    this.started = true;
    this.timer = this.setInterval(() => { void this.poll(); }, this.intervalMs);
    this.onStatus({ state: 'watching', source: this.source, count: files.length });
  }

  stop() {
    if (this.timer !== null) this.clearInterval(this.timer);
    this.timer = null;
    this.started = false;
  }

  /**
   * Treat a file's current stamp as already handled.
   *
   * Saving writes the studio's own copy of the file; without this the watcher would deliver that write back as an
   * external change one poll later. Best-effort: a failed listing just means one redundant (but harmless) reload.
   */
  async settle(name) {
    try {
      const files = await this.source.list();
      const file = files.find((f) => f.name === name);
      if (file) {
        this.handled.set(name, file.stamp);
        this.pending.delete(name);
      }
    } catch { /* the next poll may deliver one redundant reload */ }
  }

  /** One poll. Public so tests (and a manual "check now") can drive it without timers. */
  async poll() {
    if (this.polling) return [];
    this.polling = true;
    const delivered = [];
    try {
      const files = await this.source.list();
      const present = new Set();
      for (const { name, stamp } of files) {
        present.add(name);
        if (this.handled.get(name) === stamp) { this.pending.delete(name); continue; }
        if (this.pending.get(name) !== stamp) { this.pending.set(name, stamp); continue; }
        // Unchanged since the last poll: the writer is done.
        this.pending.delete(name);
        try {
          const bytes = await this.source.read(name);
          await this.onChange(name, bytes);
          this.handled.set(name, stamp);
          delivered.push(name);
        } catch (error) {
          this.handled.set(name, stamp); // do not retry the same broken bytes every second
          this.onStatus({ state: 'error', source: this.source, name, error });
        }
      }
      for (const name of [...this.handled.keys()]) if (!present.has(name)) this.handled.delete(name);
      for (const name of [...this.pending.keys()]) if (!present.has(name)) this.pending.delete(name);
    } catch (error) {
      this.onStatus({ state: 'error', source: this.source, error });
    } finally {
      this.polling = false;
    }
    return delivered;
  }
}

// --- remembering the chosen folder (deployed builds) ---------------------------------------------------------------

const DB_NAME = 'building-studio';
const STORE = 'handles';
const KEY = 'live-schematic-folder';

function openDb(idb = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!idb) { reject(new Error('IndexedDB unavailable')); return; }
    const req = idb.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFolderHandle(handle) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch { /* remembering is a convenience; watching still works this session */ }
}

export async function loadFolderHandle() {
  try {
    const db = await openDb();
    const handle = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return handle;
  } catch {
    return null;
  }
}

export const canPickFolder = () => typeof globalThis.showDirectoryPicker === 'function';
