// SkyWars on screen: the lobby, the 3-2-1 titles, the scoreboard at the side, and the end of a match. Everything
// lives under one root that leaves with the mod. Text is set with textContent, never HTML, since names come from
// other players.
import { TEMPLATES, TEMPLATE_IDS } from './templates.js';
import { packsFor, PACKS } from './packs.js';

const CSS = `
.skywars-root { position: fixed; inset: 0; pointer-events: none; z-index: 60; font-family: 'Minecraft', 'Press Start 2P', monospace; color: #fff; }
.skywars-root .sw-panel { pointer-events: auto; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  min-width: 340px; max-width: min(92vw, 520px); max-height: 92vh; overflow-y: auto; background: rgba(9, 13, 22, 0.92); border: 2px solid #38bdf8; border-radius: 10px;
  padding: 18px 20px; box-shadow: 0 0 24px rgba(56, 189, 248, 0.35); text-align: center; }
.skywars-root .sw-panel.sw-corner { top: 16px; left: auto; right: 16px; transform: none; min-width: 240px; }
.skywars-root h2 { margin: 0 0 10px; color: #7dd3fc; font-size: 20px; letter-spacing: 1px; }
.skywars-root .sw-code-label { font-size: 12px; color: #94a3b8; margin-top: 4px; }
.skywars-root .sw-code { font-size: 44px; letter-spacing: 10px; color: #facc15; margin: 4px 0 8px; }
.skywars-root .sw-hint { font-size: 12px; color: #cbd5e1; line-height: 1.5; margin: 6px 0; }
.skywars-root .sw-players { list-style: none; padding: 0; margin: 10px 0; text-align: left; font-size: 14px; }
.skywars-root .sw-players li { padding: 4px 8px; border-bottom: 1px solid rgba(148, 163, 184, 0.2); display: flex; justify-content: space-between; gap: 8px; }
.skywars-root .sw-players li.sw-out { color: #64748b; text-decoration: line-through; }
.skywars-root .sw-row { display: flex; gap: 8px; justify-content: center; margin-top: 10px; flex-wrap: wrap; }
.skywars-root button { pointer-events: auto; font: inherit; font-size: 14px; padding: 9px 16px; border-radius: 6px; border: 2px solid #0ea5e9;
  background: #0369a1; color: #fff; cursor: pointer; }
.skywars-root button:disabled { background: #334155; border-color: #475569; color: #94a3b8; cursor: not-allowed; }
.skywars-root button.sw-mode[aria-pressed="true"], .skywars-root button.sw-map[aria-pressed="true"], .skywars-root button.sw-pack[aria-pressed="true"] { background: #16a34a; border-color: #22c55e; }
.skywars-root .sw-label { font-size: 11px; color: #94a3b8; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }
.skywars-root .sw-row.sw-tight { margin-top: 4px; gap: 6px; }
.skywars-root .sw-row.sw-tight button { font-size: 12px; padding: 6px 10px; }
.skywars-root .sw-map-info { font-size: 11px; color: #cbd5e1; line-height: 1.5; margin: 6px 0 0; min-height: 30px; }
.skywars-root .sw-reason { font-size: 12px; color: #fca5a5; min-height: 16px; margin-top: 6px; }
.skywars-root .sw-title { position: absolute; top: 34%; left: 0; right: 0; text-align: center; font-size: 72px; color: #facc15;
  text-shadow: 4px 4px 0 #3f2a00; opacity: 0; transition: opacity 0.15s; }
.skywars-root .sw-title.sw-show { opacity: 1; }
.skywars-root .sw-subtitle { position: absolute; top: calc(34% + 86px); left: 0; right: 0; text-align: center; font-size: 20px; color: #f8fafc; text-shadow: 2px 2px 0 #000; }
.skywars-root .sw-board { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); min-width: 190px; background: rgba(0, 0, 0, 0.45);
  padding: 8px 10px; font-size: 13px; line-height: 1.7; }
.skywars-root .sw-board .sw-board-title { color: #facc15; text-align: center; font-size: 15px; margin-bottom: 4px; }
.skywars-root .sw-hidden { display: none !important; }
`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const clock = (seconds) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`;

export function createSkyWarsUi(manager) {
  if (typeof document === 'undefined') return null;
  const root = el('div', 'skywars-root');
  root.id = 'skywars-root';
  const style = el('style');
  style.textContent = CSS;
  root.append(style);

  // The lobby.
  const lobby = el('div', 'sw-panel');
  lobby.id = 'skywars-lobby';
  const lobbyTitle = el('h2', null, 'SkyWars');
  const codeLabel = el('div', 'sw-code-label', 'Friends join with this code (Join on the start screen):');
  const code = el('div', 'sw-code', '····');
  code.id = 'skywars-code';
  const hint = el('div', 'sw-hint', 'Each player gets an island. Be the last one alive: loot your chests, bridge across, and knock the others into the void.');
  const list = el('ul', 'sw-players');
  list.id = 'skywars-players';
  // The map: a template, then one of its data packs; New islands generates the same map again, differently.
  const mapLabel = el('div', 'sw-label', 'Map');
  const maps = el('div', 'sw-row sw-tight');
  maps.id = 'skywars-maps';
  const mapButtons = TEMPLATE_IDS.map((id) => {
    const b = el('button', 'sw-map', TEMPLATES[id].name);
    b.type = 'button';
    b.dataset.template = id;
    b.onclick = () => manager.chooseMap(id);
    maps.append(b);
    return b;
  });
  const packLabel = el('div', 'sw-label', 'Theme (data pack)');
  const packs = el('div', 'sw-row sw-tight');
  packs.id = 'skywars-packs';
  let packsShownFor = null;
  const mapInfo = el('div', 'sw-map-info');
  mapInfo.id = 'skywars-map-info';
  const reroll = el('button', null, 'New islands');
  reroll.id = 'skywars-reroll';
  reroll.type = 'button';
  reroll.onclick = () => manager.newIslands();
  const rerollRow = el('div', 'sw-row sw-tight');
  rerollRow.append(reroll);
  const mapBlock = el('div');
  mapBlock.append(mapLabel, maps, packLabel, packs, mapInfo, rerollRow);
  const guestMap = el('div', 'sw-hint');
  guestMap.id = 'skywars-guest-map';
  const modeLabel = el('div', 'sw-label', 'Loot');
  const modes = el('div', 'sw-row');
  const modeButtons = ['normal', 'insane'].map((mode) => {
    const b = el('button', 'sw-mode', mode === 'normal' ? 'Normal' : 'Insane');
    b.type = 'button';
    b.dataset.mode = mode;
    b.onclick = () => manager.chooseMode(mode);
    modes.append(b);
    return b;
  });
  const start = el('button', null, 'Start');
  start.id = 'skywars-start';
  start.type = 'button';
  start.onclick = () => manager.requestStart();
  const startRow = el('div', 'sw-row');
  startRow.append(start);
  const reason = el('div', 'sw-reason');
  reason.id = 'skywars-start-reason';
  lobby.append(lobbyTitle, codeLabel, code, hint, list, mapBlock, guestMap, modeLabel, modes, startRow, reason);

  // Titles.
  const title = el('div', 'sw-title');
  title.id = 'skywars-title';
  const subtitle = el('div', 'sw-subtitle');
  subtitle.id = 'skywars-subtitle';

  // Scoreboard.
  const board = el('div', 'sw-board sw-hidden');
  board.id = 'skywars-board';

  // End of a match.
  const end = el('div', 'sw-panel sw-hidden');
  end.id = 'skywars-end';
  const endTitle = el('h2');
  const endList = el('ul', 'sw-players');
  const again = el('button', null, 'Play again');
  again.id = 'skywars-again';
  again.type = 'button';
  again.onclick = () => manager.requestReset();
  const endWait = el('div', 'sw-hint', 'Waiting for the host to start another game…');
  const endRow = el('div', 'sw-row');
  endRow.append(again);
  end.append(endTitle, endList, endRow, endWait);

  root.append(lobby, title, subtitle, board, end);
  document.body.append(root);

  let titleTimer = null;
  const fillPlayers = (ul, players, { kills = false } = {}) => {
    ul.replaceChildren(...players.map((p) => {
      const li = el('li', p.alive === false && kills ? 'sw-out' : '');
      li.append(el('span', null, `${p.name}${p.id === manager.myId ? ' (you)' : ''}`),
        el('span', null, kills ? `${p.kills} kill${p.kills === 1 ? '' : 's'}` : p.slot === null ? 'watching' : `island ${p.slot + 1}`));
      return li;
    }));
  };

  return {
    root,
    /** Show a big title for a moment, as /title does. */
    title(text, sub = '', seconds = 1.2) {
      title.textContent = text;
      subtitle.textContent = sub;
      title.classList.add('sw-show');
      clearTimeout(titleTimer);
      titleTimer = setTimeout(() => { title.classList.remove('sw-show'); subtitle.textContent = ''; }, seconds * 1000);
    },
    setCode(text) { code.textContent = text || '····'; },
    render(state, { isHost, myId, startCheck, error, mapName = '' }) {
      const players = state?.players ?? [];
      const phase = state?.phase ?? 'lobby';
      // The lobby: a panel in the middle for the host, who starts the game; a corner card for everyone else.
      lobby.classList.toggle('sw-hidden', phase !== 'lobby');
      lobby.classList.toggle('sw-corner', !isHost);
      codeLabel.classList.toggle('sw-hidden', !isHost);
      code.classList.toggle('sw-hidden', !isHost);
      modes.classList.toggle('sw-hidden', !isHost);
      modeLabel.classList.toggle('sw-hidden', !isHost);
      mapBlock.classList.toggle('sw-hidden', !isHost);
      guestMap.classList.toggle('sw-hidden', isHost);
      guestMap.textContent = mapName ? `Map: ${mapName}` : '';
      const map = state?.map ?? {};
      for (const b of mapButtons) b.setAttribute('aria-pressed', String(map.template === b.dataset.template));
      if (packsShownFor !== map.template) {
        packsShownFor = map.template;
        packs.replaceChildren(...packsFor(map.template).map((pack) => {
          const b = el('button', 'sw-pack', pack.name);
          b.type = 'button';
          b.dataset.pack = pack.id;
          b.title = pack.description;
          b.onclick = () => manager.chooseMap(map.template, pack.id);
          return b;
        }));
      }
      for (const b of packs.children) b.setAttribute('aria-pressed', String(map.pack === b.dataset.pack));
      const template = TEMPLATES[map.template];
      const pack = PACKS.get(map.pack);
      mapInfo.textContent = template && pack ? `${template.description} ${pack.description}` : '';
      startRow.classList.toggle('sw-hidden', !isHost);
      fillPlayers(list, players);
      for (const b of modeButtons) b.setAttribute('aria-pressed', String(state?.mode === b.dataset.mode));
      start.disabled = !startCheck?.ok;
      reason.textContent = error || (isHost ? startCheck?.reason ?? '' : `Waiting for the host to start… (${players.length} player${players.length === 1 ? '' : 's'})`);
      // The scoreboard while a match runs.
      const me = players.find((p) => p.id === myId);
      const inMatch = phase === 'countdown' || phase === 'playing';
      board.classList.toggle('sw-hidden', !inMatch);
      if (inMatch) {
        const left = players.filter((p) => p.alive).length;
        const next = state.nextRefill !== null ? `Refill in ${clock(state.nextRefill - state.elapsed)}` : `Ends in ${clock(state.timeLimit - state.elapsed)}`;
        board.replaceChildren(el('div', 'sw-board-title', 'SKYWARS'), el('div', null, `Players left: ${left}`),
          el('div', null, `Kills: ${me?.kills ?? 0}`), el('div', null, phase === 'playing' ? next : `Starting in ${state.countdown}`),
          el('div', null, `Mode: ${state.mode === 'insane' ? 'Insane' : 'Normal'}`), el('div', null, mapName), el('div', null, me && !me.alive ? 'You are watching' : ''));
      }
      // The end.
      end.classList.toggle('sw-hidden', phase !== 'ended');
      if (phase === 'ended') {
        const winner = players.find((p) => p.id === state.winner);
        endTitle.textContent = winner ? (winner.id === myId ? 'Victory!' : `${winner.name} won!`) : 'Draw: time ran out';
        fillPlayers(endList, [...players].sort((a, b) => b.kills - a.kills), { kills: true });
        endRow.classList.toggle('sw-hidden', !isHost);
        endWait.classList.toggle('sw-hidden', isHost);
      }
    },
    /** Whether the panel needs the mouse (the host's lobby, the end screen). */
    needsPointer(state, isHost) {
      return (isHost && (state?.phase ?? 'lobby') === 'lobby') || state?.phase === 'ended';
    },
    dispose() {
      clearTimeout(titleTimer);
      root.remove();
    },
  };
}
