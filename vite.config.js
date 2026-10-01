import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 3000,
    open: false
  },
  plugins: [
    {
      name: 'map-storage-server',
      configureServer(server) {
        const savesDir = path.resolve(process.cwd(), 'saves');
        const designedWorldsDir = path.resolve(process.cwd(), 'designed_worlds');
        if (!fs.existsSync(savesDir)) {
          fs.mkdirSync(savesDir, { recursive: true });
        }
        if (!fs.existsSync(designedWorldsDir)) {
          fs.mkdirSync(designedWorldsDir, { recursive: true });
        }

        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

          // 0a. List all designed worlds
          if (url.pathname === '/api/designed-worlds' && req.method === 'GET') {
            try {
              if (!fs.existsSync(designedWorldsDir)) {
                fs.mkdirSync(designedWorldsDir, { recursive: true });
              }
              const files = fs.readdirSync(designedWorldsDir);
              const worlds = [];
              for (const file of files) {
                if (file.endsWith('.json') || file.endsWith('.mcworld')) {
                  const fullPath = path.join(designedWorldsDir, file);
                  const stat = fs.statSync(fullPath);
                  let meta = {
                    name: file.replace(/\.(json|mcworld)$/, ''),
                    filename: file,
                    path: fullPath,
                    size: stat.size,
                    mtime: stat.mtimeMs,
                    worldType: 'designed',
                    mechanism: 'default'
                  };
                  try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const parsed = JSON.parse(content);
                    meta = {
                      ...meta,
                      name: parsed.name || meta.name,
                      description: parsed.description || (parsed.name === 'World Martial Arts Tournament' ? 'Authentic Tenkaichi Budokai arena with 4 training sites, Goku Ki skills (Kamehameha/Genki Dama), and top-down dungeon battle mode.' : ''),
                      mechanism: parsed.mechanism || (parsed.name?.includes('Tournament') ? 'dragonball_tournament' : 'default'),
                      mechanismName: parsed.mechanismName || (parsed.mechanism === 'dragonball_tournament' ? 'Dragon Ball World Tournament' : 'Custom Mechanism'),
                      gamemode: parsed.player?.gamemode || 'survival',
                      chunkCount: parsed.chunks ? (Array.isArray(parsed.chunks) ? parsed.chunks.length : Object.keys(parsed.chunks).length) : 0,
                      structuresCount: parsed.gemini?.builtStructures?.length || 0
                    };
                  } catch (e) {
                    meta.corrupted = true;
                  }
                  worlds.push(meta);
                }
              }
              worlds.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ worlds, defaultPath: designedWorldsDir }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // 0b. Get single designed world file
          if (url.pathname.startsWith('/api/designed-worlds/') && req.method === 'GET') {
            const filename = decodeURIComponent(url.pathname.slice('/api/designed-worlds/'.length));
            const fullPath = path.join(designedWorldsDir, path.basename(filename));
            if (!fs.existsSync(fullPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Designed world not found' }));
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(fullPath).pipe(res);
            return;
          }

          // 1. Get Default Save Directory info
          if (url.pathname === '/api/saves-info' && req.method === 'GET') {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              defaultPath: savesDir,
              success: true
            }));
            return;
          }

          // 2. List all saved maps from the default directory
          if (url.pathname === '/api/saves' && req.method === 'GET') {
            try {
              if (!fs.existsSync(savesDir)) {
                fs.mkdirSync(savesDir, { recursive: true });
              }
              const files = fs.readdirSync(savesDir);
              const saves = [];
              for (const file of files) {
                if (file.endsWith('.json') || file.endsWith('.mcworld')) {
                  const fullPath = path.join(savesDir, file);
                  const stat = fs.statSync(fullPath);
                  let meta = {
                    name: file.replace(/\.(json|mcworld)$/, ''),
                    filename: file,
                    path: fullPath,
                    size: stat.size,
                    mtime: stat.mtimeMs,
                    savedAt: stat.mtime.toISOString()
                  };
                  try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const parsed = JSON.parse(content);
                    meta = {
                      ...meta,
                      name: parsed.name || meta.name,
                      savedAt: parsed.savedAt || meta.savedAt,
                      seed: parsed.seed,
                      gamemode: parsed.player?.gamemode || 'creative',
                      chunkCount: parsed.chunks ? (Array.isArray(parsed.chunks) ? parsed.chunks.length : Object.keys(parsed.chunks).length) : 0,
                      worldTime: parsed.worldTime,
                      structuresCount: parsed.gemini?.builtStructures?.length || 0
                    };
                  } catch (e) {
                    meta.corrupted = true;
                  }
                  saves.push(meta);
                }
              }
              saves.sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ saves, defaultPath: savesDir }));
            } catch (err) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: err.message }));
            }
            return;
          }

          // 3. Get single saved map file
          if (url.pathname.startsWith('/api/saves/') && req.method === 'GET') {
            const filename = decodeURIComponent(url.pathname.slice('/api/saves/'.length));
            const fullPath = path.join(savesDir, path.basename(filename));
            if (!fs.existsSync(fullPath)) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Save not found' }));
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            fs.createReadStream(fullPath).pipe(res);
            return;
          }

          // 4. Save map file to default directory
          if (url.pathname === '/api/saves' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => { body += chunk; });
            req.on('end', () => {
              try {
                const payload = JSON.parse(body);
                const rawName = (payload.name || payload.filename || 'world');
                const baseName = rawName.replace(/\.(json|mcworld)$/i, '');
                const safeName = baseName.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim() || 'world';
                const filename = `${safeName}.json`;
                const fullPath = path.join(savesDir, filename);

                if (!fs.existsSync(savesDir)) {
                  fs.mkdirSync(savesDir, { recursive: true });
                }

                const mapData = payload.data || payload;
                if (!mapData.name) mapData.name = safeName;
                if (!mapData.savedAt) mapData.savedAt = new Date().toISOString();

                fs.writeFileSync(fullPath, JSON.stringify(mapData, null, 2), 'utf-8');
                const stat = fs.statSync(fullPath);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                  success: true,
                  name: safeName,
                  filename: filename,
                  path: fullPath,
                  size: stat.size,
                  savedAt: mapData.savedAt
                }));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            });
            return;
          }

          // 5. Delete saved map file from default directory
          if (url.pathname.startsWith('/api/saves/') && req.method === 'DELETE') {
            const filename = decodeURIComponent(url.pathname.slice('/api/saves/'.length));
            const fullPath = path.join(savesDir, path.basename(filename));
            if (fs.existsSync(fullPath)) {
              fs.unlinkSync(fullPath);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true, filename }));
            return;
          }

          next();
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    target: 'esnext'
  }
});

