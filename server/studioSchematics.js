import fs from 'fs';
import path from 'path';

export const STUDIO_SCHEMATICS_DIR = 'build_studio_schematics';
const ENDPOINT = '/api/studio-schematics';
// A schematic is a small file (the largest library builds are a few MB); this is only a guard against an
// accidental giant body filling the dev machine's disk.
const MAX_BODY_BYTES = 64 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('schematic too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/**
 * Serve (and accept writes in) build_studio_schematics/ for Building Studio (src/studioSchematicWatch.js).
 *
 * - `GET /api/studio-schematics` lists the folder's .schem files with mtime and size, which is all the client needs
 *   to notice a change.
 * - `GET /api/studio-schematics/<name>` returns one file's bytes.
 * - `PUT /api/studio-schematics/<name>` writes one file, which is how Save creates the .schem file the studio then
 *   watches. (POST is accepted too, for the same reason.)
 *
 * Only top-level .schem files are served: the name is reduced to its basename, so `..` cannot leave the folder.
 * A static build has neither route, which is how the client knows to ask the player for a folder instead.
 */
export function createStudioSchematicsMiddleware(dir) {
  return (req, res, next) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const isEndpoint = url.pathname === ENDPOINT || url.pathname.startsWith(`${ENDPOINT}/`);
    if (!isEndpoint) { next(); return; }
    if (!['GET', 'PUT', 'POST'].includes(req.method)) { next(); return; }
    res.setHeader('Cache-Control', 'no-store');
    fs.mkdirSync(dir, { recursive: true });

    if (url.pathname === ENDPOINT) {
      if (req.method !== 'GET') { sendJson(res, 405, { error: 'Use /api/studio-schematics/<name>' }); return; }
      const files = [];
      for (const name of fs.readdirSync(dir)) {
        if (!/\.schem$/i.test(name)) continue;
        const stat = fs.statSync(path.join(dir, name));
        if (stat.isFile()) files.push({ name, mtime: stat.mtimeMs, size: stat.size });
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ path: dir, files }));
      return;
    }

    const name = path.basename(decodeURIComponent(url.pathname.slice(ENDPOINT.length + 1)));
    if (!/\.schem$/i.test(name)) { sendJson(res, 404, { error: 'Schematic not found' }); return; }
    const fullPath = path.join(dir, name);

    if (req.method === 'GET') {
      if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
        sendJson(res, 404, { error: 'Schematic not found' });
        return;
      }
      res.setHeader('Content-Type', 'application/octet-stream');
      res.end(fs.readFileSync(fullPath));
      return;
    }

    // PUT / POST: the browser's Save writes the studio's .schem into the watched folder. Requiring the binary
    // content type keeps a cross-site form post (which cannot set it without a CORS preflight) from writing here.
    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim();
    if (contentType !== 'application/octet-stream') {
      sendJson(res, 415, { error: 'Expected an application/octet-stream schematic' });
      return;
    }
    readBody(req).then((body) => {
      if (body.length === 0) { sendJson(res, 400, { error: 'Empty schematic' }); return; }
      fs.writeFileSync(fullPath, body);
      const stat = fs.statSync(fullPath);
      sendJson(res, 200, { name, size: stat.size, mtime: stat.mtimeMs });
    }).catch((error) => {
      sendJson(res, error.message === 'schematic too large' ? 413 : 500, { error: error.message });
    });
  };
}

export function studioSchematicsPlugin({ dir = path.resolve(process.cwd(), STUDIO_SCHEMATICS_DIR) } = {}) {
  const attach = (server) => { server.middlewares.use(createStudioSchematicsMiddleware(dir)); };
  return {
    name: 'building-studio-schematics',
    configureServer: attach,
    configurePreviewServer: attach,
  };
}
