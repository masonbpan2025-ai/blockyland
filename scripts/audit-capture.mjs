import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

async function captureMobViews(mobName) {
  const port = 9231;
  const profileDir = path.resolve(`.chrome-audit-${mobName}`);
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

    // Wait until mob is loaded and textures are ready
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 250));
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
    await new Promise(r => setTimeout(r, 400));

    const dump = await sendSession('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__mobInspectDump())',
      returnByValue: true
    });
    console.log('MOB DUMP:', dump?.result?.value?.slice(0, 500));

    async function takeAngle(label, dirVec) {
      await sendSession('Runtime.evaluate', {
        expression: `
          (() => {
            const h = window.__debugSession.mob?.height || 1.5;
            const dir = new THREE.Vector3(${dirVec[0]}, ${dirVec[1]}, ${dirVec[2]}).normalize();
            const mob = window.__debugSession.mob;
            const box = new THREE.Box3();
            mob.mesh.traverse(o => { if (o.isMesh) box.expandByObject(o); });
            const size = box.getSize(new THREE.Vector3());
            const centre = box.getCenter(new THREE.Vector3());
            const radius = Math.max(size.x, size.y, size.z) * 0.5;
            const dist = Math.max((radius * 1.6) / Math.tan(42 * Math.PI / 360), 1.2);
            window.__debugCamera = window.__debugCamera || mob.mesh.parent;
            // OrbitControls target:
            const controls = window.__debugControls || (window.__controlsRef);
            // Move camera:
            camera.position.copy(centre).addScaledVector(dir, dist);
            controls.target.copy(centre);
            controls.update();
          })()
        `
      });
      await new Promise(r => setTimeout(r, 300));
      const snap = await sendSession('Page.captureScreenshot', { format: 'png' });
      const filename = `audit_${mobName}_${label}.png`;
      fs.writeFileSync(filename, Buffer.from(snap.data, 'base64'));
      console.log(`Saved ${filename}`);
    }

    // 1. Front view
    await sendSession('Runtime.evaluate', {
      expression: `document.getElementById('front')?.click()`
    });
    await new Promise(r => setTimeout(r, 400));
    let snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`audit_${mobName}_front.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved audit_${mobName}_front.png`);

    // 2. 3/4 front view
    await sendSession('Runtime.evaluate', {
      expression: `
        Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '3/4 view')?.click()
      `
    });
    await new Promise(r => setTimeout(r, 400));
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`audit_${mobName}_34.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved audit_${mobName}_34.png`);

    // 3. 3/4 rear view
    await sendSession('Runtime.evaluate', {
      expression: `
        (() => {
          const mob = window.__debugSession.mob;
          const h = mob?.height || 1.5;
          // In mobDebug, fitCamera is in scope or we can position camera relative to target:
          const target = controls.target;
          const v = new THREE.Vector3(-1.2, Math.min(0.5, h * 0.22), -1.25).normalize();
          const dist = camera.position.distanceTo(target);
          camera.position.copy(target).addScaledVector(v, dist);
          controls.update();
        })()
      `
    });
    await new Promise(r => setTimeout(r, 400));
    snap = await sendSession('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(`audit_${mobName}_rear.png`, Buffer.from(snap.data, 'base64'));
    console.log(`Saved audit_${mobName}_rear.png`);

  } finally {
    chrome.kill();
  }
}

const targetMob = process.argv[2] || 'panda';
captureMobViews(targetMob);
