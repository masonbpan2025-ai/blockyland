import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const mobsToAudit = process.argv.slice(2);
if (mobsToAudit.length === 0) {
  console.log('Usage: node scripts/audit-batch.mjs <mob1> <mob2> ...');
  process.exit(1);
}

const outDir = path.resolve('audit_images');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

async function run() {
  const port = 9232;
  const profileDir = path.resolve('.chrome-audit-batch');
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
      url: `http://localhost:3000/mob-debug.html?mob=${mobsToAudit[0]}`
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

    // Set viewport
    await sendSession('Emulation.setDeviceMetricsOverride', {
      width: 1024,
      height: 768,
      deviceScaleFactor: 1,
      mobile: false
    });

    for (const mobName of mobsToAudit) {
      console.log(`Auditing ${mobName}...`);
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

      // Wait for textures
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 200));
        const chk = await sendSession('Runtime.evaluate', {
          expression: `
            (() => {
              const mob = window.__debugSession?.mob;
              if (!mob?.mesh) return false;
              let pending = false;
              mob.mesh.traverse(o => {
                if (o.material?.map && (!o.material.map.image || !o.material.map.image.width)) {
                  pending = true;
                }
              });
              return !pending;
            })()
          `,
          returnByValue: true
        });
        if (chk?.result?.value) break;
      }
      await new Promise(r => setTimeout(r, 300));

      // Click 3/4 view
      await sendSession('Runtime.evaluate', {
        expression: `
          Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '3/4 view')?.click()
        `
      });
      await new Promise(r => setTimeout(r, 400));
      const snap34 = await sendSession('Page.captureScreenshot', { format: 'png' });
      const filename34 = path.join(outDir, `${mobName}_34.png`);
      fs.writeFileSync(filename34, Buffer.from(snap34.data, 'base64'));
      console.log(`Saved ${filename34}`);

      // Click Front view
      await sendSession('Runtime.evaluate', {
        expression: `
          Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Front view')?.click()
        `
      });
      await new Promise(r => setTimeout(r, 400));
      const snapFront = await sendSession('Page.captureScreenshot', { format: 'png' });
      const filenameFront = path.join(outDir, `${mobName}_front.png`);
      fs.writeFileSync(filenameFront, Buffer.from(snapFront.data, 'base64'));
      console.log(`Saved ${filenameFront}`);
    }

  } finally {
    chrome.kill();
  }
}

run();
