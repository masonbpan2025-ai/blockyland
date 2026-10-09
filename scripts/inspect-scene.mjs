import { spawn } from 'child_process';
import path from 'path';

async function main() {
  const mob = process.argv[2] || 'vindicator';
  const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
    '--headless=new',
    '--remote-debugging-port=9228',
    '--no-first-run',
    '--user-data-dir=' + path.resolve('.chrome-inspect-profile')
  ]);

  try {
    let wsUrl = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const res = await fetch('http://127.0.0.1:9228/json/version');
        const data = await res.json();
        wsUrl = data.webSocketDebuggerUrl;
        if (wsUrl) break;
      } catch {}
    }

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

    const { targetId } = await send('Target.createTarget', { url: `http://localhost:3000/mob-debug.html?mob=${mob}` });
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

    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        console.log('CONSOLE:', msg.params.type, msg.params.args.map(a => a.value || a.description));
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        console.log('EXCEPTION:', JSON.stringify(msg.params.exceptionDetails, null, 2));
      }
    });

    await sendSession('Runtime.enable');
    await sendSession('Page.enable');
    await new Promise(r => setTimeout(r, 6000));

    const evalRes = await sendSession('Runtime.evaluate', {
      expression: `
        (() => {
          const mob = window.__lastDebugMob || document.querySelector('#view');
          const scene = window.__debugScene;
          // Find the mob in the scene:
          function dump(obj) {
            return {
              name: obj.name,
              type: obj.type,
              visible: obj.visible,
              pos: [obj.position.x, obj.position.y, obj.position.z],
              mat: obj.material ? {
                color: obj.material.color?.getHexString(),
                map: !!obj.material.map,
                imageWidth: obj.material.map?.image?.width,
                transparent: obj.material.transparent,
                opacity: obj.material.opacity,
                alphaTest: obj.material.alphaTest
              } : null,
              children: (obj.children || []).map(dump)
            };
          }
          const canvas = document.querySelector('canvas');
          return window.__mobInspectDump ? window.__mobInspectDump() : {
            error: 'no helper',
            domCanvas: !!canvas
          };
        })()
      `,
      returnByValue: true
    });
    console.log('Result for ' + mob + ':', JSON.stringify(evalRes?.result?.value, null, 2));

    ws.close();
  } finally {
    chrome.kill();
  }
}

main().catch(console.error);
