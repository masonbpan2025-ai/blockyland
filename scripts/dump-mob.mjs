import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const mobName = process.argv[2] || 'chicken';
const port = 9235;
const profileDir = path.resolve('.chrome-dump');
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  `--remote-debugging-port=${port}`,
  '--no-first-run',
  `--user-data-dir=${profileDir}`
]);

try {
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
  }
  if (!wsUrl) throw new Error('Chrome remote debugging did not respond');

  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const handler = (event) => {
        const res = JSON.parse(event.data);
        if (res.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(res.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  const { targetId } = await send('Target.createTarget', {
    url: `http://localhost:3000/mob-debug.html?mob=${mobName}`
  });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });

  function sendSession(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const handler = (event) => {
        const res = JSON.parse(event.data);
        if (res.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(res.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });
  }

  // Wait for mob selector
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    const chk = await sendSession('Runtime.evaluate', {
      expression: `!!document.getElementById('mob') && !!window.__mobInspectDump`,
      returnByValue: true
    });
    if (chk?.result?.value) break;
  }

  await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const sel = document.getElementById('mob');
        if (sel) {
          sel.value = '${mobName}';
          sel.dispatchEvent(new Event('change'));
        }
      })()
    `
  });

  await new Promise(r => setTimeout(r, 500));

  const dump = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const mob = window.__debugSession?.mob;
        if (!mob) return { error: 'no mob' };
        const canvas = document.createElement('canvas');
        const img = mob.body.material.map.image;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const rows = [];
        for (let y = 0; y < img.height; y++) {
          let line = '';
          for (let x = 0; x < 40; x++) {
            const idx = (y * img.width + x) * 4;
            const a = data[idx+3];
            const r = data[idx], g = data[idx+1], b = data[idx+2];
            if (a === 0) line += '.';
            else line += '#';
          }
          rows.push(line);
        }
        return rows;
      })()
    `,
    returnByValue: true
  });

  console.log(dump.result.value.map((r, i) => String(i).padStart(2, '0') + ': ' + r).join('\n'));

} finally {
  chrome.kill();
}
