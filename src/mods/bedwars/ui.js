// Bed Wars on screen: the lobby (mode, pace, map theme, teams), the titles, the scoreboard at the side as Hypixel's reads
// (the next event, each team with a tick for its bed, a cross once it is gone or the number still alive), the Item Shop
// and Team Upgrades windows, and the end. As SkyWars' screen (../skywars/ui.js): one root that leaves with the mod, and
// text set with textContent, never HTML, since names come from other players.
import { TEAMS, MODES, MODE_IDS, teamById } from './teams.js';
import { THEMES, THEME_IDS } from './arena.js';
import { ITEM_SHOP, CATEGORIES, UPGRADES, TRAPS, RESOURCE_NAMES, priceOf, whyNot, upgradeCost, trapCost, resourcesOf, canAfford, PICKAXES, AXES } from './shop.js';

const CSS = `
.bw-root { position: fixed; inset: 0; pointer-events: none; z-index: 60; font-family: 'Minecraft', 'Press Start 2P', monospace; color: #fff; }
.bw-root .bw-panel { pointer-events: auto; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); min-width: 360px;
  max-width: min(94vw, 640px); max-height: 92vh; overflow-y: auto; background: rgba(12, 10, 18, 0.94); border: 2px solid #ff5555; border-radius: 10px;
  padding: 16px 18px; box-shadow: 0 0 24px rgba(255, 85, 85, 0.35); text-align: center; }
.bw-root .bw-panel.bw-corner { top: 16px; left: auto; right: 16px; transform: none; min-width: 260px; max-width: 320px; }
.bw-root h2 { margin: 0 0 8px; color: #ff5555; font-size: 20px; letter-spacing: 1px; }
.bw-root .bw-code { font-size: 40px; letter-spacing: 10px; color: #ffff55; margin: 2px 0 6px; }
.bw-root .bw-hint { font-size: 12px; color: #cbd5e1; line-height: 1.5; margin: 6px 0; }
.bw-root .bw-label { font-size: 11px; color: #94a3b8; margin-top: 10px; text-transform: uppercase; letter-spacing: 1px; }
.bw-root .bw-row { display: flex; gap: 6px; justify-content: center; margin-top: 6px; flex-wrap: wrap; }
.bw-root button { pointer-events: auto; font: inherit; font-size: 12px; padding: 7px 11px; border-radius: 6px; border: 2px solid #7f1d1d;
  background: #991b1b; color: #fff; cursor: pointer; }
.bw-root button[aria-pressed="true"] { background: #16a34a; border-color: #22c55e; }
.bw-root button:disabled { background: #334155; border-color: #475569; color: #94a3b8; cursor: not-allowed; }
.bw-root .bw-teams { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; margin-top: 8px; text-align: left; }
.bw-root .bw-team { border: 2px solid; border-radius: 6px; padding: 6px 8px; font-size: 12px; background: rgba(0,0,0,0.35); }
.bw-root .bw-team .bw-team-name { font-weight: bold; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.bw-root .bw-team button { font-size: 10px; padding: 3px 7px; }
.bw-root .bw-team .bw-member { color: #e5e7eb; }
.bw-root .bw-reason { font-size: 12px; color: #fca5a5; min-height: 16px; margin-top: 6px; }
.bw-root .bw-title { position: absolute; top: 30%; left: 0; right: 0; text-align: center; font-size: 64px; color: #ff5555;
  text-shadow: 4px 4px 0 #3f0000; opacity: 0; transition: opacity 0.15s; }
.bw-root .bw-title.bw-show { opacity: 1; }
.bw-root .bw-subtitle { position: absolute; top: calc(30% + 80px); left: 0; right: 0; text-align: center; font-size: 20px; color: #f8fafc; text-shadow: 2px 2px 0 #000; }
.bw-root .bw-board { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); min-width: 200px; background: rgba(0, 0, 0, 0.45);
  padding: 8px 10px; font-size: 13px; line-height: 1.65; }
.bw-root .bw-board .bw-board-title { color: #ffff55; text-align: center; font-size: 15px; margin-bottom: 4px; }
.bw-root .bw-board .bw-gap { height: 8px; }
.bw-root .bw-shop { width: min(94vw, 720px); }
.bw-root .bw-tabs { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; margin-bottom: 8px; }
.bw-root .bw-items { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; text-align: left; }
.bw-root .bw-item { display: flex; flex-direction: column; gap: 3px; align-items: flex-start; text-align: left; background: #1f2937; border-color: #374151; min-height: 62px; }
.bw-root .bw-item .bw-cost { font-size: 11px; }
.bw-root .bw-item .bw-why { font-size: 10px; color: #fca5a5; }
.bw-root .bw-item.bw-ok { border-color: #22c55e; }
.bw-root .bw-have { font-size: 12px; margin: 4px 0 8px; }
.bw-root .bw-hidden { display: none !important; }
`;
const RES_COLOR = { iron: '#e5e7eb', gold: '#ffaa00', diamond: '#55ffff', emerald: '#55ff55' };
const ROMAN = ['', 'I', 'II', 'III', 'IV'];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
const clock = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const ONE = { iron: 'Iron', gold: 'Gold', diamond: 'Diamond', emerald: 'Emerald' };
const costText = (price) => Object.entries(price ?? {}).map(([r, n]) => `${n} ${n === 1 ? ONE[r] : RESOURCE_NAMES[r]}`).join(' + ');

export function createBedWarsUi(manager) {
  if (typeof document === 'undefined') return null;
  const root = el('div', 'bw-root');
  root.id = 'bedwars-root';
  const style = el('style');
  style.textContent = CSS;
  root.append(style);

  // --- the lobby ---------------------------------------------------------------------------------------------
  const lobby = el('div', 'bw-panel');
  lobby.id = 'bedwars-lobby';
  const codeLabel = el('div', 'bw-hint', 'Friends join with this code (Join on the start screen):');
  const code = el('div', 'bw-code', '····');
  code.id = 'bedwars-code';
  const hint = el('div', 'bw-hint', 'Protect your bed, destroy the others. While your bed stands you respawn; without it, your next death is final. Last team standing wins.');
  const hostBlock = el('div');
  const row = (label, ids, names, pick) => {
    const r = el('div', 'bw-row');
    const buttons = ids.map((id) => { const b = el('button', null, names(id)); b.type = 'button'; b.dataset.id = id; b.onclick = () => pick(id); r.append(b); return b; });
    hostBlock.append(el('div', 'bw-label', label), r);
    return buttons;
  };
  const modeButtons = row('Mode', MODE_IDS, (id) => `${MODES[id].name}`, (id) => manager.chooseMode(id));
  const paceButtons = row('Pace', ['normal', 'fast'], (id) => (id === 'normal' ? 'Normal (Hypixel times)' : 'Fast (half)'), (id) => manager.choosePace(id));
  const themeButtons = row('Map', THEME_IDS, (id) => THEMES[id].name, (id) => manager.chooseTheme(id));
  const teamsLabel = el('div', 'bw-label', 'Teams');
  const teams = el('div', 'bw-teams');
  teams.id = 'bedwars-teams';
  const start = el('button', null, 'Start');
  start.id = 'bedwars-start';
  start.type = 'button';
  start.onclick = () => manager.requestStart();
  const startRow = el('div', 'bw-row');
  startRow.append(start);
  const reason = el('div', 'bw-reason');
  reason.id = 'bedwars-start-reason';
  lobby.append(el('h2', null, 'Bed Wars'), codeLabel, code, hint, hostBlock, teamsLabel, teams, startRow, reason);

  // --- titles, scoreboard, end --------------------------------------------------------------------------------
  const title = el('div', 'bw-title');
  title.id = 'bedwars-title';
  const subtitle = el('div', 'bw-subtitle');
  const board = el('div', 'bw-board bw-hidden');
  board.id = 'bedwars-board';
  const end = el('div', 'bw-panel bw-hidden');
  end.id = 'bedwars-end';
  const endTitle = el('h2');
  const endList = el('div', 'bw-hint');
  const again = el('button', null, 'Play again');
  again.id = 'bedwars-again';
  again.type = 'button';
  again.onclick = () => manager.requestReset();
  const endWait = el('div', 'bw-hint', 'Waiting for the host to start another game…');
  const endRow = el('div', 'bw-row');
  endRow.append(again);
  end.append(endTitle, endList, endRow, endWait);

  // --- the shops ----------------------------------------------------------------------------------------------
  const shop = el('div', 'bw-panel bw-shop bw-hidden');
  shop.id = 'bedwars-shop';
  const shopTitle = el('h2');
  const have = el('div', 'bw-have');
  const tabs = el('div', 'bw-tabs');
  const items = el('div', 'bw-items');
  items.id = 'bedwars-shop-items';
  const close = el('button', null, 'Close (Esc)');
  close.type = 'button';
  close.onclick = () => api.closeShop();
  const closeRow = el('div', 'bw-row');
  closeRow.append(close);
  shop.append(shopTitle, have, tabs, items, closeRow);
  let shopKind = null;
  let category = 'blocks';
  const onKey = (e) => { if (e.code === 'Escape' && shopKind) { e.stopPropagation(); api.closeShop(); } };
  window.addEventListener('keydown', onKey, true);

  root.append(lobby, title, subtitle, board, end, shop);
  document.body.append(root);
  let titleTimer = null;

  const shopButton = (name, price, why, onclick, sub = '') => {
    const b = el('button', `bw-item${why ? '' : ' bw-ok'}`);
    b.type = 'button';
    b.append(el('span', null, name));
    if (sub) b.append(el('span', 'bw-cost', sub));
    const c = el('span', 'bw-cost', price ? costText(price) : '—');
    const first = Object.keys(price ?? {})[0];
    if (first) c.style.color = RES_COLOR[first];
    b.append(c);
    if (why) b.append(el('span', 'bw-why', why));
    b.onclick = onclick;
    return b;
  };

  const renderShop = () => {
    if (!shopKind) return;
    const inv = manager.game.inventory;
    const res = inv ? resourcesOf(inv) : {};
    have.replaceChildren(...Object.entries(res).map(([r, n]) => { const s = el('span', null, `${n} ${RESOURCE_NAMES[r]}   `); s.style.color = RES_COLOR[r]; return s; }));
    if (shopKind === 'items') {
      shopTitle.textContent = 'Item Shop';
      tabs.replaceChildren(...CATEGORIES.map(([id, name]) => {
        const b = el('button', null, name);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(id === category));
        b.onclick = () => { category = id; renderShop(); };
        return b;
      }));
      const ctx = { inv, kit: manager.kit, group: manager.group, mode: manager.state?.mode };
      items.replaceChildren(...ITEM_SHOP.filter((e) => e.category === category).map((entry) => {
        const why = inv ? whyNot(entry, ctx) : 'No inventory';
        let name = entry.count ? `${entry.name} x${entry.count}` : entry.name;
        if (entry.kind === 'tool') {
          const next = (entry.tool === 'pickaxe' ? PICKAXES : AXES)[(manager.kit[entry.tool] ?? 0) + 1];
          name = next ? next.id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : `${entry.name} (max)`;
        }
        return shopButton(name, priceOf(entry, manager.kit, manager.group), why, () => { manager.buyItem(entry.key); renderShop(); });
      }));
    } else {
      shopTitle.textContent = 'Team Upgrades';
      tabs.replaceChildren();
      const team = manager.myTeam();
      const up = team?.upgrades ?? {};
      const list = Object.entries(UPGRADES).map(([key, def]) => {
        const level = up[key] ?? 0;
        const max = level >= def.max;
        const cost = max ? null : upgradeCost(key, level + 1, manager.group);
        const why = max ? 'Maxed' : inv && !canAfford(inv, { diamond: cost }) ? 'Not enough diamonds' : null;
        const label = def.levels ? (max ? def.levels[def.max - 1] : def.levels[level]) : `${def.name}${def.max > 1 ? ` ${ROMAN[Math.min(def.max, level + 1)]}` : ''}`;
        return shopButton(label, cost ? { diamond: cost } : null, why, () => { manager.buyUpgrade(key); setTimeout(renderShop, 150); }, def.desc);
      });
      const queued = team?.traps ?? [];
      const trapCostNow = trapCost(queued.length);
      const traps = Object.entries(TRAPS).map(([key, def]) => {
        const why = trapCostNow === null ? 'Trap queue full' : inv && !canAfford(inv, { diamond: trapCostNow }) ? 'Not enough diamonds' : null;
        return shopButton(def.name, trapCostNow ? { diamond: trapCostNow } : null, why, () => { manager.buyTrap(key); setTimeout(renderShop, 150); }, def.desc);
      });
      const queue = el('div', 'bw-hint', `Trap queue: ${queued.length ? queued.map((t) => TRAPS[t]?.name).join(', ') : 'empty'} (${queued.length}/3)`);
      queue.style.gridColumn = '1 / -1';
      items.replaceChildren(...list, queue, ...traps);
    }
  };

  const api = {
    root,
    title(text, sub = '', seconds = 1.2, color = '#ff5555') {
      title.textContent = text;
      title.style.color = color;
      subtitle.textContent = sub;
      title.classList.add('bw-show');
      clearTimeout(titleTimer);
      titleTimer = setTimeout(() => { title.classList.remove('bw-show'); subtitle.textContent = ''; }, seconds * 1000);
    },
    setCode(text) { code.textContent = text || '····'; },
    openShop(kind) {
      shopKind = kind;
      shop.classList.remove('bw-hidden');
      renderShop();
      manager.render();
    },
    closeShop() {
      if (!shopKind) return;
      shopKind = null;
      shop.classList.add('bw-hidden');
      manager.render();
      try { manager.game.renderer?.domElement?.requestPointerLock?.(); } catch { /* the next click takes it */ }
    },
    refreshShop: renderShop,
    get shopOpen() { return shopKind; },
    render(state, { isHost, myId, startCheck, error }) {
      const players = state?.players ?? [];
      const phase = state?.phase ?? 'lobby';
      const me = players.find((p) => p.id === myId);
      lobby.classList.toggle('bw-hidden', phase !== 'lobby');
      lobby.classList.toggle('bw-corner', !isHost);
      for (const n of [codeLabel, code, hostBlock, startRow]) n.classList.toggle('bw-hidden', !isHost);
      for (const b of modeButtons) b.setAttribute('aria-pressed', String(state?.mode === b.dataset.id));
      for (const b of paceButtons) b.setAttribute('aria-pressed', String(state?.pace === b.dataset.id));
      for (const b of themeButtons) b.setAttribute('aria-pressed', String(state?.map?.theme === b.dataset.id));
      const size = MODES[state?.mode]?.size ?? 1;
      teams.replaceChildren(...(state?.teams ?? []).map((t) => {
        const team = teamById(t.id);
        const card = el('div', 'bw-team');
        card.style.borderColor = team.color;
        const head = el('div', 'bw-team-name');
        const name = el('span', null, `${team.name} (${players.filter((p) => p.team === t.id).length}/${size})`);
        name.style.color = team.color;
        head.append(name);
        if (me && me.team !== t.id) {
          const join = el('button', null, 'Join');
          join.type = 'button';
          join.onclick = () => manager.chooseTeam(t.id);
          head.append(join);
        }
        card.append(head, ...players.filter((p) => p.team === t.id).map((p) => el('div', 'bw-member', `${p.name}${p.id === myId ? ' (you)' : ''}`)));
        return card;
      }));
      const watching = players.filter((p) => !p.team);
      if (watching.length) teams.append(el('div', 'bw-hint', `Watching: ${watching.map((p) => p.name).join(', ')}`));
      start.disabled = !startCheck?.ok;
      reason.textContent = error || (isHost ? startCheck?.reason ?? '' : `Waiting for the host to start… (${players.length} player${players.length === 1 ? '' : 's'})`);

      // The scoreboard.
      const inMatch = phase === 'countdown' || phase === 'playing';
      board.classList.toggle('bw-hidden', !inMatch);
      if (inMatch) {
        const lines = [el('div', 'bw-board-title', 'BED WARS')];
        lines.push(el('div', null, phase === 'countdown' ? `Starting in ${state.countdown}` : state.next ? `${state.next.label} in ${clock(state.next.in)}` : 'Game ending'));
        lines.push(el('div', 'bw-gap'));
        for (const t of state.teams ?? []) {
          const team = teamById(t.id);
          const alive = players.filter((p) => p.team === t.id && p.alive).length;
          const line = el('div');
          const letter = el('span', null, `${team.letter} `);
          letter.style.color = team.color;
          const mark = t.eliminated ? '✗' : t.bed ? '✓' : String(alive);
          const status = el('span', null, mark);
          status.style.color = t.eliminated ? '#ff5555' : t.bed ? '#55ff55' : '#ffff55';
          line.append(letter, el('span', null, `${team.name}: `), status, el('span', null, me?.team === t.id ? ' YOU' : ''));
          lines.push(line);
        }
        lines.push(el('div', 'bw-gap'));
        lines.push(el('div', null, `Kills: ${me?.kills ?? 0}`), el('div', null, `Final Kills: ${me?.finalKills ?? 0}`), el('div', null, `Beds Broken: ${me?.beds ?? 0}`));
        board.replaceChildren(...lines);
      }

      end.classList.toggle('bw-hidden', phase !== 'ended');
      if (phase === 'ended') {
        const winner = teamById(state.winner);
        endTitle.textContent = winner ? `${winner.name} Team wins!` : 'Draw: time ran out';
        endTitle.style.color = winner?.color ?? '#ff5555';
        const ranked = [...players].filter((p) => p.team).sort((a, b) => (b.finalKills * 3 + b.kills + b.beds * 2) - (a.finalKills * 3 + a.kills + a.beds * 2));
        endList.replaceChildren(...ranked.map((p) => el('div', null, `${p.name} (${teamById(p.team)?.name}): ${p.kills} kills, ${p.finalKills} final kills, ${p.beds} beds`)));
        endRow.classList.toggle('bw-hidden', !isHost);
        endWait.classList.toggle('bw-hidden', isHost);
      }
      if (shopKind && (phase !== 'playing' || !me?.alive)) api.closeShop();
      else if (shopKind) renderShop();
    },
    needsPointer(state, isHost) {
      const phase = state?.phase ?? 'lobby';
      // In the lobby everyone picks a team, so everyone needs the mouse.
      return Boolean(shopKind) || phase === 'lobby' || phase === 'ended';
    },
    dispose() {
      clearTimeout(titleTimer);
      window.removeEventListener('keydown', onKey, true);
      root.remove();
    },
  };
  return api;
}
