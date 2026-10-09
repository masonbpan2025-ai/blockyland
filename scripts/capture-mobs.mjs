import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export async function captureMob(mobName, outputPath, options = {}) {
  const port = options.port || 9225;
  const profileDir = path.resolve(`.chrome-profile-${mobName}`);
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    '--no-first-run',
    `--user-data-dir=${profileDir}`
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 35; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch(`http://127.0.0.1:${port}/json/version`);
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        if (wsUrl) break;
      } catch {}
    }

    if (!wsUrl) throw new Error('Could not connect to Chrome CDP');

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
        ws.send(JSON.stringify({ id: msgId, sessionId, method, params }));
      });
    }

    await sendSession('Runtime.enable');
    await sendSession('Page.enable');
    await sendSession('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
      mobile: false
    });

    // Wait until loaded and scene is running
    for (let i = 0; i < 40; i++) {
      const evalRes = await sendSession('Runtime.evaluate', {
        expression: "document.getElementById('badge')?.textContent"
      });
      const val = evalRes?.result?.value;
      if (val && !val.includes('Loading')) {
        break;
      }
      await new Promise(r => setTimeout(r, 300));
    }

    // Optionally switch to 3/4 view for better angle if requested
    if (options.threeQuarter) {
      await sendSession('Runtime.evaluate', {
        expression: "Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('3/4'))?.click()"
      });
      await new Promise(r => setTimeout(r, 300));
    }

    // Wait for textures to be fully rendered
    await new Promise(r => setTimeout(r, 1200));

    const shot = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, Buffer.from(shot.data, 'base64'));
    console.log(`Successfully saved screenshot to ${outputPath}`);

    ws.close();
  } finally {
    chrome.kill();
    try {
      fs.rmSync(profileDir, { recursive: true, force: true });
    } catch {}
  }
}

// CLI usage: node scripts/capture-mobs.mjs panda [output.png]
if (process.argv[1] && process.argv[1].endsWith('capture-mobs.mjs')) {
  const mob = process.argv[2] || 'panda';
  const out = process.argv[3] || `${mob}_preview.png`;
  captureMob(mob, out, { threeQuarter: true }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
