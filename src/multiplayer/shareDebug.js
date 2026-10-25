import { ShareSession } from './shareSession.js';
import { parseIceServers, ICE_STORAGE_KEY } from './peerLink.js';
import { ResilientPeerLink } from './resilientPeerLink.js';

const $ = (id) => document.getElementById(id);
let stored;
try { stored = localStorage.getItem(ICE_STORAGE_KEY); } catch { /* blocked storage uses defaults */ }
const iceServers = parseIceServers(window.MC_ICE_SERVERS) ?? parseIceServers(stored);
const links = [];
const session = new ShareSession({
  peerFactory: (options) => {
    const link = new ResilientPeerLink({ ...options, ...(iceServers ? { iceServers } : {}) });
    links.push(link);
    return link;
  },
});
const events = [];
let failure = null;
let role = 'none';
for (const event of ['room_hosted', 'room_joined', 'peer_joined', 'peer_left', 'host_disconnected', 'signalling_lost']) {
  session.on(event, () => {
    events.push(event);
    if (events.length > 30) events.shift();
    if (event === 'peer_joined' || event === 'room_joined') $('status').textContent = 'Connected. The connection and game handshake both succeeded.';
    render();
  });
}
function report() {
  return {
    role, connected: session.connected, peers: session.peers.size, failure, events,
    connections: links.map((link) => link.finalDiagnostics ?? link.getDiagnostics()),
  };
}
function render() { $('report').textContent = JSON.stringify(report(), null, 2); }
function reset(nextRole) {
  session.disconnect(true);
  links.length = 0;
  events.length = 0;
  failure = null;
  role = nextRole;
  $('guest-link').hidden = true;
  $('status').textContent = 'Connecting…';
  render();
}
function failed(error) {
  // A native browser exception can include a configured server address; keep only our error category in copied reports.
  const codes = ['bad_code', 'room_not_found', 'room_full', 'room_busy', 'too_many_codes', 'signalling_unreachable', 'connect_failed', 'connect_timeout', 'version_mismatch'];
  failure = { code: codes.includes(error.code) ? error.code : 'unknown' };
  $('status').textContent = `Connection failed: ${error.message}`;
  render();
}
$('host').onclick = async () => {
  reset('host');
  try {
    const { roomId } = await session.hostRoom('Connection test');
    const url = new URL(location.href);
    url.searchParams.set('room', roomId);
    $('room').value = roomId;
    $('guest-link').href = url.href;
    $('guest-link').hidden = false;
    $('status').textContent = `Test room ${roomId} is ready. Keep this tab open and open the guest test tab.`;
    render();
  } catch (error) { failed(error); }
};
async function join() {
  reset('guest');
  try { await session.joinRoom($('room').value, 'Connection test guest'); render(); }
  catch (error) { failed(error); }
}
$('join').onclick = join;
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(report(), null, 2)); $('copy').textContent = 'Report copied'; }
  catch { $('status').textContent = 'Select and copy the report below.'; }
};
window.addEventListener('pagehide', () => session.disconnect(true));
setInterval(render, 1000);
render();
const code = new URLSearchParams(location.search).get('room');
if (code) { $('room').value = code; void join(); }
