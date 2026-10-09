import { spawn } from 'child_process';

const port = 9234;
const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=' + port,
  '--no-first-run',
  '--user-data-dir=.chrome-temp'
]);

try {
  let wsUrl = null;
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/version');
      const data = await res.json();
      wsUrl = data.webSocketDebuggerUrl;
      if (wsUrl) break;
    } catch {}
  }
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);
  let id = 1;
  function send(method, params = {}) {
    return new Promise(resolve => {
      const msgId = id++;
      const handler = e => {
        const res = JSON.parse(e.data);
        if (res.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(res.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  const { targetId } = await send('Target.createTarget', { url: 'http://localhost:3000/mob-debug.html?mob=chicken' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  function sendSession(method, params = {}) {
    return new Promise(resolve => {
      const msgId = id++;
      const handler = e => {
        const res = JSON.parse(e.data);
        if (res.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(res.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });
  }
  await new Promise(r => setTimeout(r, 1200));
  const evalRes = await sendSession('Runtime.evaluate', {
    expression: `
      (() => {
        const mob = window.__debugSession?.mob;
        if (!mob) return 'no mob';
        const canvas = document.createElement('canvas');
        const img = mob.mat.map.image;
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        let legPixels = [];
        for (let y = 0; y < 8; y++) {
          for (let x = 26; x < 38; x++) {
            const i = (y * img.width + x) * 4;
            if (data[i+3] > 0) legPixels.push({x, y, r: data[i], g: data[i+1], b: data[i+2], a: data[i+3]});
          }
        }
        return {
          imgW: img.width,
          imgH: img.height,
          legPixelsCount: legPixels.length,
          sampleLeg: legPixels.slice(0, 5),
          leftLegPos: mob.leftLeg?.position,
          leftLegVis: mob.leftLeg?.visible,
          rightLegPos: mob.rightLeg?.position
        };
      })()
    `,
    returnByValue: true
  });
  console.log('Result:', JSON.stringify(evalRes.result.value, null, 2));
} finally {
  chrome.kill();
}
