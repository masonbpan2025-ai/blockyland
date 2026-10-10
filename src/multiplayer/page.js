import { parseServerAddress, buildClientUrl } from './serverAddress.js';
import { SERVER_PRESETS } from './serverDirectory.js';

export function bindMultiplayerPage(document, { fetch = globalThis.fetch, navigate = url => { globalThis.location.href = url; } } = {}) {
  const form = document.getElementById('multiplayer-form');
  const status = document.getElementById('multiplayer-status');
  const connect = document.getElementById('connect-server');
  const check = document.getElementById('check-server');
  let pending = false;
  const fields = () => ({
    name: document.getElementById('server-name').value,
    address: document.getElementById('server-address').value,
    version: document.getElementById('server-version').value,
    username: document.getElementById('offline-username').value,
  });
  const report = (message, error = false) => { status.textContent = message; status.dataset.error = String(error); };
  const request = async url => {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  };
  const health = async () => {
    const data = await request('/api/multiplayer/health');
    if (!data.ready) throw new Error('Install the multiplayer client with npm run multiplayer:setup, then retry.');
    return data;
  };
  const run = async action => {
    if (pending) return;
    pending = true;
    connect.disabled = check.disabled = true;
    try { await action(); }
    catch (error) { report(error.message, true); }
    finally { pending = false; connect.disabled = check.disabled = false; }
  };
  const clearSelection = () => {
    for (const preset of SERVER_PRESETS) document.getElementById(preset.id).setAttribute('aria-pressed', 'false');
    document.getElementById('account-note').textContent = 'Offline servers accept a player name. Some servers require in-game registration or a Microsoft account.';
  };
  for (const preset of SERVER_PRESETS) {
    document.getElementById(preset.id).addEventListener('click', () => {
      clearSelection();
      document.getElementById(preset.id).setAttribute('aria-pressed', 'true');
      document.getElementById('server-name').value = preset.name;
      document.getElementById('server-address').value = preset.address;
      document.getElementById('server-version').value = preset.version;
      document.getElementById('account-note').textContent = preset.note;
      report(`${preset.name} selected. Java address: ${preset.address}`);
    });
  }
  for (const id of ['server-name', 'server-address']) document.getElementById(id).addEventListener('input', clearSelection);
  check.addEventListener('click', () => run(async () => {
    const server = parseServerAddress(fields().address);
    report(`Checking ${server.address}…`);
    const data = await request(`/api/multiplayer/status?address=${encodeURIComponent(server.address)}`);
    report(`${server.address} is reachable — ${data.version?.name || 'Java Edition'}, ${data.players?.online ?? '?'} players online. Server status does not verify account login.`);
  }));
  form.addEventListener('submit', event => {
    event.preventDefault();
    return run(async () => {
      const values = fields();
      parseServerAddress(values.address);
      report('Opening multiplayer client…');
      const data = await health();
      navigate(buildClientUrl(data.clientUrl, values));
    });
  });
  const ready = run(async () => { await health(); report('Multiplayer ready. Choose a server or enter your own Java address.'); });
  return { ready };
}

if (typeof document !== 'undefined' && document.getElementById?.('multiplayer-form')) bindMultiplayerPage(document);
