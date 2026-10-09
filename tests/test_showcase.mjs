import http from 'http';
import fs from 'fs';

async function main() {
  const tabs = await new Promise((resolve, reject) => {
    http.get('http://127.0.0.1:9222/json', res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', reject);
  });
  const tab = tabs.find(t => t.url && t.url.includes('mob-debug.html'));
  if (!tab) { console.error('No tab found'); return; }

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const msgId = id++;
    const handler = (data) => {
      const msg = JSON.parse(data);
      if (msg.id === msgId) {
        ws.off('message', handler);
        resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await new Promise(r => ws.on('open', r));

  // Reload page so clean cache & latest assets are loaded
  await send('Page.reload', { ignoreCache: true });
  await new Promise(r => setTimeout(r, 2000));

  // Start showcase
  await send('Runtime.evaluate', {
    expression: `
      (function() {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Run showcase'));
        if (btn) btn.click();
      })()
    `
  });

  // Wait 3.5 seconds for breeding to happen (feeding + courtship + baby)
  await new Promise(r => setTimeout(r, 3500));

  // Capture screenshot
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/pope1/.gemini/antigravity-ide/brain/27fea6c1-6d92-4906-97f3-72eb1e21bd6c/.tempmediaStorage/rabbit_showcase_fixed.png', Buffer.from(shot.data, 'base64'));
  console.log('Screenshot saved!');
  ws.close();
}
main().catch(console.error);
