import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { OUTPUT } from './generate.mjs';

const types={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.txt':'text/plain; charset=utf-8','.schem':'application/octet-stream'};
const server=http.createServer((req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const file=path.resolve(OUTPUT,'.'+(name==='/'?'/index.html':name));if(!file.startsWith(OUTPUT+path.sep)){res.writeHead(403);res.end();return;}if(!fs.statSync(file).isFile())throw Error();res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});fs.createReadStream(file).pipe(res);}catch{res.writeHead(404);res.end('Not found');}});
server.listen(0,'127.0.0.1',()=>console.log(`BlockyBuilder portfolio preview: http://127.0.0.1:${server.address().port}/`));
