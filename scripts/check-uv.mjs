(async () => {
  const res = await fetch('http://127.0.0.1:9222/json');
  const tabs = await res.json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  let id = 1;
  function send(method, params={}) {
    return new Promise(resolve => {
      const cur = id++;
      const handler = (m) => {
        const d = JSON.parse(m);
        if (d.id === cur) { ws.off('message', handler); resolve(d.result); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id: cur, method, params }));
    });
  }
  await send('Page.navigate', { url: 'http://localhost:3000/mob-debug.html?mob=vindicator' });
  await new Promise(r => setTimeout(r, 1500));
  const evalRes = await send('Runtime.evaluate', {
    expression: `(() => {
      const scene = window.__debugScene;
      let info = [];
      scene.traverse(obj => {
        if (obj.isMesh && obj.geometry && obj.geometry.attributes.uv) {
          const uv = obj.geometry.attributes.uv;
          info.push({ name: obj.name, uvs: Array.from(uv.array).slice(0, 16) });
        }
      });
      return JSON.stringify(info, null, 2);
    })()`
  });
  console.log(evalRes.result.value);
  ws.close();
})();
