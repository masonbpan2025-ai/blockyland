// Mining Simulator on screen: the trader's window (sell ores, buy upgrades), the coin count on the inventory screen,
// and the room code. One root that leaves with the mod; text is set with textContent, never HTML, since names come
// from other players.
import {
  ORE_VALUES, ORE_NAMES, PICKAXES, HOUSE_NAMES, MAX_PICKAXE, MAX_HOUSE, SUPERSTICK_COST, SUPERSTICK_DAMAGE,
  pickaxeUpgradeCost, houseUpgradeCost, saleValue,
} from './economy.js';

const CSS = `
.ms-root { position: fixed; inset: 0; pointer-events: none; z-index: 60; font-family: var(--ui-font, system-ui, sans-serif); color: #fff; }
.ms-root .ms-panel { pointer-events: auto; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
  width: min(94vw, 560px); max-height: 92vh; overflow-y: auto; background: rgba(20, 16, 10, 0.95); border: 2px solid #f5b83d;
  border-radius: 10px; padding: 16px 18px; box-shadow: 0 0 24px rgba(245, 184, 61, 0.3); }
.ms-root h2 { margin: 0 0 4px; color: #f5b83d; font-size: 20px; text-align: center; letter-spacing: 1px; }
.ms-root h3 { margin: 14px 0 6px; font-size: 12px; color: #a8a29e; text-transform: uppercase; letter-spacing: 1px; }
.ms-root .ms-coins { text-align: center; font-size: 16px; color: #fde047; margin-bottom: 6px; }
.ms-root .ms-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 7px 9px;
  background: rgba(255,255,255,0.05); border-radius: 6px; margin-top: 5px; font-size: 13px; }
.ms-root .ms-row .ms-sub { font-size: 11px; color: #a8a29e; }
.ms-root button { pointer-events: auto; font: inherit; font-size: 12px; padding: 7px 12px; border-radius: 6px; border: 2px solid #a16207;
  background: #ca8a04; color: #fff; cursor: pointer; white-space: nowrap; }
.ms-root button:disabled { background: #44403c; border-color: #57534e; color: #a8a29e; cursor: not-allowed; }
.ms-root .ms-prices { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 4px; font-size: 12px; color: #e7e5e4; }
.ms-root .ms-reason { min-height: 16px; font-size: 12px; color: #fca5a5; text-align: center; margin-top: 8px; }
.ms-root .ms-close { display: flex; justify-content: center; margin-top: 10px; }
.ms-root .ms-chip { position: absolute; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(0,0,0,0.5);
  padding: 4px 10px; border-radius: 6px; font-size: 12px; color: #fde68a; }
.ms-root .ms-hidden { display: none !important; }
#mining-sim-coins { color: #b45309; font-weight: bold; font-size: 15px; margin: -4px 0 8px; text-align: right; }
.ms-root .ms-coin, #mining-sim-coins .ms-coin { display: inline-block; width: 0.8em; height: 0.8em; border-radius: 50%; background: radial-gradient(circle at 35% 35%, #fef08a, #eab308 60%, #a16207); border: 1px solid #854d0e; vertical-align: -0.05em; margin-right: 0.3em; }
`;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
export const formatCoins = (n) => `${Math.max(0, Math.floor(n || 0)).toLocaleString('en-US')} coin${n === 1 ? '' : 's'}`;

/** A browser-free stand-in, for a game without a document (the tests). */
function headlessUi() {
  return {
    openShop() {}, closeShop() {}, render() {}, refreshCoins() {}, setCode() {}, say() {}, dispose() {},
    get shopOpen() { return false; },
  };
}

export function createMiningUi(manager) {
  if (typeof document === 'undefined') return headlessUi();
  const style = el('style', null, CSS);
  const root = el('div', 'ms-root');
  root.id = 'mining-sim-root';

  const chip = el('div', 'ms-chip ms-hidden');
  chip.id = 'mining-sim-code';

  const shop = el('div', 'ms-panel ms-hidden');
  shop.id = 'mining-sim-shop';
  const coins = el('div', 'ms-coins');
  coins.id = 'mining-sim-shop-coins';
  const sellList = el('div');
  const sellAll = el('button', null, 'Sell all ores');
  sellAll.id = 'mining-sim-sell';
  sellAll.type = 'button';
  sellAll.onclick = () => manager.sellAll();
  const sellRow = el('div', 'ms-row');
  const sellText = el('div');
  sellRow.append(sellText, sellAll);
  const upgrades = el('div');
  const prices = el('div', 'ms-prices');
  for (const [id, value] of Object.entries(ORE_VALUES)) prices.append(el('div', null, `${ORE_NAMES[id]}: ${value}`));
  const reason = el('div', 'ms-reason');
  const close = el('button', null, 'Close (Esc)');
  close.type = 'button';
  close.onclick = () => api.closeShop();
  const closeRow = el('div', 'ms-close');
  closeRow.append(close);
  shop.append(el('h2', null, 'Trader'), coins, el('h3', null, 'Sell'), sellRow, sellList, el('h3', null, 'Buy'), upgrades,
    el('h3', null, 'Ore prices (coins each)'), prices, reason, closeRow);

  root.append(chip, shop);
  document.head.append(style);
  document.body.append(root);

  let open = false;
  const onKey = (e) => { if (e.code === 'Escape' && open) { e.stopPropagation(); api.closeShop(); } };
  window.addEventListener('keydown', onKey, true);

  function buyRow(label, sub, cost, coinsHave, onBuy, id) {
    const row = el('div', 'ms-row');
    const text = el('div');
    text.append(el('div', null, label), el('div', 'ms-sub', sub));
    const button = el('button', null, cost === null ? 'Maxed' : `Buy · ${cost.toLocaleString('en-US')}`);
    button.type = 'button';
    button.id = id;
    button.disabled = cost === null || coinsHave < cost;
    button.onclick = onBuy;
    row.append(text, button);
    return row;
  }

  function renderShop() {
    if (!open) return;
    const me = manager.myRecord();
    const have = me?.coins ?? 0;
    coins.replaceChildren(el('span', 'ms-coin'), `Coins: ${(have).toLocaleString('en-US')}`);
    const carried = manager.oreCounts();
    const { coins: worth, sold } = saleValue(carried);
    sellText.textContent = worth > 0 ? `Your ores are worth ${formatCoins(worth)}` : 'You are not carrying any ores.';
    sellAll.disabled = worth <= 0;
    sellList.replaceChildren(...Object.entries(sold).map(([id, n]) => {
      const row = el('div', 'ms-row');
      row.append(el('div', null, `${ORE_NAMES[id]} × ${n}`), el('div', 'ms-sub', `${(ORE_VALUES[id] * n).toLocaleString('en-US')} coins`));
      return row;
    }));
    const pick = me?.pickaxe ?? 1, house = me?.house ?? 1;
    const pickCost = pickaxeUpgradeCost(pick), houseCost = houseUpgradeCost(house);
    upgrades.replaceChildren(
      buyRow(pick >= MAX_PICKAXE ? PICKAXES[pick].name : `Upgrade to ${PICKAXES[pick + 1].name}`,
        pick >= MAX_PICKAXE ? 'The best pickaxe there is.' : `You have the ${PICKAXES[pick].name}. Better pickaxes mine more ores, faster.`,
        pickCost, have, () => manager.buy('pickaxe'), 'mining-sim-buy-pickaxe'),
      buyRow(house >= MAX_HOUSE ? HOUSE_NAMES[house] : `Upgrade to ${HOUSE_NAMES[house + 1]}`,
        house >= MAX_HOUSE ? 'The biggest house there is.' : `You have the ${HOUSE_NAMES[house]}. A bigger house has more chests.`,
        houseCost, have, () => manager.buy('house'), 'mining-sim-buy-house'),
      buyRow('Superstick', me?.superstick ? 'You own it.' : `Each hit takes ${SUPERSTICK_DAMAGE} health from a player. A kill takes a fifth of their coins.`,
        me?.superstick ? null : SUPERSTICK_COST, have, () => manager.buy('superstick'), 'mining-sim-buy-superstick'),
    );
  }

  const api = {
    openShop() {
      open = true;
      reason.textContent = '';
      shop.classList.remove('ms-hidden');
      try { document.exitPointerLock?.(); } catch { /* none held */ }
      renderShop();
    },
    closeShop() {
      if (!open) return;
      open = false;
      shop.classList.add('ms-hidden');
      try { manager.game.renderer?.domElement?.requestPointerLock?.(); } catch { /* the next click takes it */ }
    },
    get shopOpen() { return open; },
    /** Show a refusal or a confirmation in the shop. */
    say(text) { reason.textContent = text ?? ''; },
    render() {
      renderShop();
      api.refreshCoins();
    },
    /** The coin count on the inventory screen, while it is open. */
    refreshCoins() {
      const modal = document.getElementById('inventory-modal');
      const header = modal?.querySelector('.gui-header');
      if (!header) return;
      let line = document.getElementById('mining-sim-coins');
      if (!line) {
        line = el('div');
        line.id = 'mining-sim-coins';
        header.after(line);
      }
      line.replaceChildren(el('span', 'ms-coin'), `Coins: ${(manager.myRecord()?.coins ?? 0).toLocaleString('en-US')}`);
    },
    setCode(code) {
      chip.textContent = code ? `Mining Simulator · room ${code} (friends join with this code)` : '';
      chip.classList.toggle('ms-hidden', !code);
    },
    dispose() {
      window.removeEventListener('keydown', onKey, true);
      document.getElementById('mining-sim-coins')?.remove();
      root.remove();
      style.remove();
    },
  };
  return api;
}
