// The arena's eyes inside one player's game tab. Evaluated in the page (match.mjs injects it as text), it installs
// `window.__arena`, which reports what this player's own screen shows -- and nothing a human at that screen could not
// see -- and does the screen clicks the input layer asks for.
//
// What counts as "seen" (agentArena/docs/agent-rules.md, Perception):
//   - the player's own HUD: health, hunger, armour, effects, the hotbar, the held item; the inventory, which the player
//     can open at any time; coordinates (Minecraft's F3 screen shows them);
//   - other players inside the camera's view whose body is not hidden behind blocks, or whose name tag shows (Java draws
//     a name tag through walls unless the player sneaks); players out of view but within earshot are "heard": a rough
//     position only;
//   - the blocks of the arena (every block is in plain sight from somewhere on a sky map), and every change to them that
//     this client has been sent;
//   - the open screen (chest, inventory, shop) with what it shows; chat lines, on-screen titles and the scoreboard.
(() => {
  if (window.__arena?.version === 1) return 'ready';
  const g = window.game;
  const A = window.__arena = { version: 1, chat: [], blockChanges: [], hurt: [], lastHealth: null, names: null, ids: null };

  const round = (v, n = 2) => Math.round(v * 10 ** n) / 10 ** n;
  const vec = (v, n = 2) => (v ? { x: round(v.x, n), y: round(v.y, n), z: round(v.z, n) } : null);
  const now = () => performance.now() / 1000;

  A.init = async () => {
    const m = await import('/src/blocks.js');
    A.names = new Map(Object.entries(m.BLOCKS).map(([k, v]) => [v, k.toLowerCase()]));
    A.ids = Object.fromEntries([...A.names].map(([id, name]) => [name, id]));
    // Chat: every line the chat box shows.
    const box = g.ui?.chatMessages;
    if (box && !A.chatObserver) {
      A.chatObserver = new MutationObserver((records) => {
        for (const r of records) for (const n of r.addedNodes) {
          const text = n.textContent?.trim();
          if (text) A.chat.push({ t: now(), text });
        }
        if (A.chat.length > 400) A.chat.splice(0, A.chat.length - 400);
      });
      A.chatObserver.observe(box, { childList: true });
    }
    // What the other players' games send of them (held item, armour, sneaking...), as this client receives it.
    const rp = g.worldSync?.remotePlayers;
    if (rp && !rp.__arenaHooked) {
      const original = rp.updatePeerState.bind(rp);
      rp.updatePeerState = (peerId, state) => {
        const r = original(peerId, state);
        const peer = rp.remotePlayers.get(peerId);
        if (peer) peer.__arenaState = { ...(peer.__arenaState ?? {}), ...state, at: now() };
        return r;
      };
      rp.__arenaHooked = true;
    }
    A.hookWorld();
    return { blocks: A.names.size };
  };

  /**
   * Practice games only (agentArena/practice.mjs): put this player where its setup says, with the items it says.
   * spec: { clear, at: {x, y, z}, yaw, give: [{ item, count }], armor: { head, chest, legs, feet } } (all optional).
   */
  A.practiceSetup = (spec) => {
    const p = g.player, inv = g.inventory, done = [];
    if (spec.clear) { inv.hotbar.fill(null); inv.storage.fill(null); for (const k of Object.keys(inv.armor)) inv.armor[k] = null; inv.offhand = null; done.push('cleared'); }
    const stackOf = (item, count = 1) => (A.ids[item] !== undefined ? { id: A.ids[item], isBlock: true, count } : { id: item, isBlock: false, count });
    for (const { item, count = 1 } of spec.give ?? []) {
      const s = stackOf(item, count);
      done.push(`${item} x${count}: ${inv.addItem(s.id, s.isBlock, s.count) === false ? 'no room' : 'given'}`);
    }
    for (const [slot, item] of Object.entries(spec.armor ?? {})) if (item && slot in inv.armor) { inv.armor[slot] = stackOf(item); done.push(`wearing ${item}`); }
    if (spec.at) {
      p.position.set(spec.at.x, spec.at.y, spec.at.z);
      p.velocity?.set?.(0, 0, 0);
      if (typeof spec.yaw === 'number') p.yaw = spec.yaw;
      done.push(`moved to ${spec.at.x} ${spec.at.y} ${spec.at.z}`);
    }
    g.ui?.updateHotbar?.();
    return done;
  };

  A.blockName = (id) => (id === 0 ? 'air' : A.names?.get(id) ?? `block_${id}`);
  A.itemName = (stack) => {
    if (!stack) return null;
    return typeof stack.id === 'number' ? A.blockName(stack.id) : String(stack.id);
  };
  A.stack = (s) => {
    if (!s) return null;
    const out = { item: A.itemName(s), count: s.count ?? 1 };
    if (s.enchantments?.length) out.enchantments = s.enchantments.map((e) => `${e.id ?? e.name}${e.level ? ` ${e.level}` : ''}`);
    if (s.durability !== undefined && s.maxDurability) out.durability = `${s.durability}/${s.maxDurability}`;
    return out;
  };

  /** Every block change this client applies (its own, and the ones the host sends it). */
  A.hookWorld = () => {
    const w = g.world;
    if (!w || w.__arenaHooked) return;
    const original = w.setVoxel.bind(w);
    w.setVoxel = (x, y, z, id, ...rest) => {
      const before = w.getVoxel(x, y, z);
      const r = original(x, y, z, id, ...rest);
      const after = w.getVoxel(x, y, z);
      if (before !== after) {
        A.blockChanges.push([x, y, z, after]);
        if (A.blockChanges.length > 20000) A.blockChanges.splice(0, 10000);
      }
      return r;
    };
    w.__arenaHooked = true;
  };

  A.mode = () => (g.skywars?.active ? 'skywars' : g.bedwars?.active ? 'bedwars' : 'base');
  A.mod = () => (g.skywars?.active ? g.skywars : g.bedwars?.active ? g.bedwars : null);

  /** The arena box: the map's own bounds, else the box around its blocks. */
  A.bounds = () => {
    const arena = A.mod()?.arena;
    if (!arena) return null;
    if (arena.bounds) return arena.bounds;
    let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const key of arena.blocks?.keys?.() ?? []) {
      const [x, y, z] = String(key).split(',').map(Number);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    return Number.isFinite(minX) ? { minX: minX - 2, maxX: maxX + 2, minY: Math.max(0, minY - 2), maxY: Math.min(63, maxY + 8), minZ: minZ - 2, maxZ: maxZ + 2 } : null;
  };

  /** Every non-air block in the arena box, as [x, y, z, id], and the names of the ids. */
  A.dumpBlocks = () => {
    const b = A.bounds();
    if (!b) return null;
    const cells = [];
    for (let x = b.minX; x <= b.maxX; x++) for (let z = b.minZ; z <= b.maxZ; z++) for (let y = b.minY; y <= b.maxY; y++) {
      const id = g.world.getVoxel(x, y, z);
      if (id) cells.push(x, y, z, id);
    }
    A.blockChanges.length = 0;
    return { bounds: b, cells, names: Object.fromEntries(A.names) };
  };

  A.takeBlockChanges = () => { const out = A.blockChanges; A.blockChanges = []; return out; };

  // --- seeing ----------------------------------------------------------------------------------------------------

  const TRANSPARENT = /glass|leaves|water|ladder|torch|flower|grass$|short_grass|poppy|dandelion|dead_bush|vine|carpet|rail|sign|button|lever|pressure_plate|fence|bars|pane|slab|stairs|bed|chest|cobweb/;
  const occludes = (id) => id && !TRANSPARENT.test(A.blockName(id));

  /** Whether the straight line from `a` to `b` is free of opaque blocks (voxel walk). */
  const clearLine = (a, b) => {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    const steps = Math.ceil(len * 4);
    let last = '';
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = Math.floor(a.x + dx * t), y = Math.floor(a.y + dy * t), z = Math.floor(a.z + dz * t);
      const key = `${x},${y},${z}`;
      if (key === last) continue;
      last = key;
      if (occludes(g.world.getVoxel(x, y, z))) return false;
    }
    return true;
  };

  /** Whether a point is inside the camera's view (its frustum), by projecting it. */
  const inView = (pt) => {
    const cam = g.camera;
    cam.updateMatrixWorld?.();
    const v = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
    const cx = v[0] * pt.x + v[4] * pt.y + v[8] * pt.z + v[12];
    const cy = v[1] * pt.x + v[5] * pt.y + v[9] * pt.z + v[13];
    const cz = v[2] * pt.x + v[6] * pt.y + v[10] * pt.z + v[14];
    const x = p[0] * cx + p[4] * cy + p[8] * cz + p[12];
    const y = p[1] * cx + p[5] * cy + p[9] * cz + p[13];
    const w = p[3] * cx + p[7] * cy + p[11] * cz + p[15];
    if (w <= 0) return false;
    return Math.abs(x / w) <= 1.05 && Math.abs(y / w) <= 1.05;
  };

  const HEARING = 16;
  const NAMETAG_RANGE = 64;

  A.players = (eye) => {
    const rp = g.worldSync?.remotePlayers;
    const mod = A.mod();
    const roster = new Map((mod?.state?.players ?? []).map((p) => [p.id, p]));
    const out = [];
    for (const peer of rp?.remotePlayers?.values?.() ?? []) {
      const info = roster.get(peer.peerId);
      if (mod && info && (info.alive === false && !info.dead)) continue; // a spectator: not drawn
      if (peer.dead || peer.avatar?.mesh?.visible === false) continue;
      const pos = peer.currentPos;
      const st = peer.__arenaState ?? {};
      const sneaking = !!peer.isSneaking;
      const head = { x: pos.x, y: pos.y + (sneaking ? 1.3 : 1.6), z: pos.z };
      const body = { x: pos.x, y: pos.y + 0.9, z: pos.z };
      const feet = { x: pos.x, y: pos.y + 0.2, z: pos.z };
      const distance = Math.hypot(pos.x - eye.x, pos.y + 0.9 - eye.y, pos.z - eye.z);
      const framed = inView(head) || inView(body) || inView(feet);
      const bodySeen = framed && (clearLine(eye, head) || clearLine(eye, body) || clearLine(eye, feet));
      const tagSeen = framed && !sneaking && !peer.invisible && distance <= NAMETAG_RANGE;
      const base = { name: peer.name, id: peer.peerId };
      if (info?.team) base.team = info.team;
      if (info?.slot !== undefined && info?.slot !== null) base.slot = info.slot;
      if (bodySeen || tagSeen) {
        out.push({
          ...base, seen: bodySeen ? 'body' : 'nametag', pos: vec(pos), distance: round(distance, 1),
          yaw: round(peer.currentYaw ?? 0, 3), pitch: round(peer.currentPitch ?? 0, 3),
          held: st.activeItem === undefined || st.activeItem === null ? null : (typeof st.activeItem === 'number' ? A.blockName(st.activeItem) : String(st.activeItem?.id ?? st.activeItem)),
          armor: Array.isArray(st.armor) ? st.armor.map((a) => (a ? (typeof a === 'object' ? String(a.id) : String(a)) : null)) : null,
          sneaking, sprinting: !!peer.isSprinting, swinging: !!st.isSwinging && now() - (st.at ?? 0) < 0.4,
          blocking: !!peer.blocking, using: peer.using ?? null, invisible: !!peer.invisible,
        });
      } else if (distance <= HEARING && !peer.invisible) {
        // Footsteps: a rough idea of where, no more.
        out.push({ ...base, seen: 'heard', pos: { x: Math.round(pos.x / 2) * 2, y: Math.round(pos.y), z: Math.round(pos.z / 2) * 2 }, distance: Math.round(distance) });
      }
    }
    return out;
  };

  // --- the open screen ------------------------------------------------------------------------------------------

  const visible = (el) => el && !el.classList.contains('hidden') && !el.classList.contains('bw-hidden') && el.offsetParent !== null;

  A.screen = () => {
    const inv = g.inventory;
    const hotbar = (inv.hotbar ?? []).map(A.stack);
    const storage = (inv.storage ?? []).map(A.stack);
    const chestModal = document.getElementById('chest-modal');
    if (visible(chestModal)) {
      const pos = g.ui.currentChestPos;
      const items = pos ? g.chestManager.getCombinedItems(pos.x, pos.y, pos.z) : [];
      return { kind: 'chest', at: pos ? { ...pos } : null, chest: items.map(A.stack), inventory: storage, hotbar, cursor: A.stack(inv.cursorItem) };
    }
    if (visible(document.getElementById('inventory-modal'))) {
      return { kind: 'inventory', inventory: storage, hotbar, armor: Object.fromEntries(Object.entries(inv.armor).map(([k, v]) => [k, A.stack(v)])), offhand: A.stack(inv.offhand), cursor: A.stack(inv.cursorItem) };
    }
    const shop = document.getElementById('bedwars-shop');
    if (visible(shop)) {
      const title = shop.querySelector('h2')?.textContent ?? '';
      const tabs = [...shop.querySelectorAll('.bw-tabs > button')].map((b) => ({ label: b.textContent, selected: b.getAttribute('aria-pressed') === 'true' }));
      const offers = [...shop.querySelectorAll('#bedwars-shop-items > button')].map((b, i) => {
        const spans = [...b.querySelectorAll('span')].map((s) => s.textContent);
        return { index: i, label: spans[0], cost: b.querySelector('.bw-cost:last-of-type')?.textContent ?? '', canBuy: b.classList.contains('bw-ok'), why: b.querySelector('.bw-why')?.textContent ?? null, note: spans.length > 2 && !b.querySelector('.bw-why') ? spans[1] : null };
      });
      return { kind: /upgrade/i.test(title) ? 'upgrades' : 'shop', title, have: shop.querySelector('.bw-have')?.textContent?.trim() ?? '', tabs, offers };
    }
    const anyModal = document.querySelector('.game-modal:not(.hidden):not(#gemini-modal)');
    if (anyModal) return { kind: 'other', id: anyModal.id };
    if (visible(document.getElementById('pause-menu'))) return { kind: 'pause' };
    const death = document.getElementById('death-overlay');
    if (death && !death.classList.contains('hidden')) return { kind: 'death', text: death.textContent.trim().slice(0, 200) };
    if (g.ui?.isChatOpen) return { kind: 'chat' };
    return { kind: 'none', pointerLocked: !!document.pointerLockElement };
  };

  /** The CSS selector of a slot the input layer clicks: 'chest:3', 'inv:12', 'hotbar:0', 'armor:head', 'offhand',
   *  'craft:0', 'offer:5' (shop item), 'tab:Melee' (shop tab), 'close' (shop close button). */
  A.slotSelector = (id) => {
    const screen = A.screen().kind;
    const [kind, arg] = String(id).split(':');
    const n = Number(arg);
    if (kind === 'chest') return `#chest-slots-grid > .inv-slot:nth-child(${n + 1})`;
    if (kind === 'inv') return screen === 'chest' ? `#chest-storage-grid > .inv-slot:nth-child(${n + 1})` : `#inv-storage-grid > .inv-slot:nth-child(${n + 1})`;
    if (kind === 'hotbar') return screen === 'chest' ? `#chest-hotbar-grid > .inv-slot:nth-child(${n + 1})` : `#inv-hotbar-grid > .inv-slot:nth-child(${n + 1})`;
    if (kind === 'armor') return `#armor-slot-${arg}`;
    if (kind === 'offhand') return '#inv-offhand-slot';
    if (kind === 'offer') return `#bedwars-shop-items > button:nth-child(${n + 1})`;
    if (kind === 'tab') {
      const tabs = [...document.querySelectorAll('#bedwars-shop .bw-tabs > button')];
      const i = tabs.findIndex((b) => b.textContent.toLowerCase() === String(arg).toLowerCase());
      return i >= 0 ? `#bedwars-shop .bw-tabs > button:nth-child(${i + 1})` : null;
    }
    if (kind === 'close') return '#bedwars-shop .bw-row > button';
    return null;
  };

  // --- the scoreboard -------------------------------------------------------------------------------------------

  A.match = () => {
    const mode = A.mode(), mod = A.mod();
    const s = mod?.state;
    if (!s) return { game: mode, phase: null };
    const players = (s.players ?? []).map((p) => {
      const o = { id: p.id, name: p.name, alive: p.alive };
      if (p.team !== undefined) o.team = p.team;
      if (p.slot !== undefined) o.slot = p.slot;
      if (p.kills !== undefined) o.kills = p.kills;
      if (p.finalKills !== undefined) o.finalKills = p.finalKills;
      if (p.beds !== undefined) o.beds = p.beds;
      if (p.dead !== undefined) o.respawning = !!p.dead && p.alive;
      if (p.respawnIn !== undefined && p.respawnIn !== null) o.respawnIn = p.respawnIn;
      return o;
    });
    const me = mod.me?.();
    const out = { game: mode, phase: s.phase, elapsed: s.elapsed ?? 0, countdown: s.countdown ?? 0, winner: s.winner ?? null, endReason: s.endReason ?? null, players, me: me ? { name: me.name, team: me.team ?? null, slot: me.slot ?? null, alive: me.alive } : null };
    if (mode === 'skywars') Object.assign(out, { mode: s.mode, refills: s.refills, nextRefill: s.nextRefill, timeLimit: s.timeLimit });
    if (mode === 'bedwars') {
      Object.assign(out, { mode: s.mode, pace: s.pace, suddenDeath: !!s.suddenDeath, nextEvent: s.next ?? null });
      out.teams = (s.teams ?? []).map((t) => ({ id: t.id, bed: t.bed, eliminated: t.eliminated, upgrades: t.upgrades, traps: t.traps?.length ?? 0 }));
      out.generators = (s.gens ?? []).map((gen) => ({ id: gen.id, stock: gen.stock, tier: gen.tier ?? null, nextIn: gen.next ?? null }));
      if (mod.kit) out.myKit = { ...mod.kit };
    }
    return out;
  };

  /** The map's landmarks: what a player sees standing on it (islands, chests, beds, shopkeepers, generators). */
  A.landmarks = () => {
    const mode = A.mode(), arena = A.mod()?.arena;
    if (!arena) return null;
    const p3 = (v) => (Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v ? { x: v.x, y: v.y, z: v.z } : null);
    if (mode === 'skywars') {
      return {
        spawns: (arena.spawns ?? []).map(p3),
        chests: (arena.chests ?? []).map((c) => ({ x: c.x, y: c.y, z: c.z, kind: c.kind, island: c.slot ?? null })),
        bounds: arena.bounds ?? null, voidY: -4,
      };
    }
    if (mode === 'bedwars') {
      return {
        bases: (arena.bases ?? []).map((b) => ({ team: b.team, spawn: p3(b.spawn), bed: { foot: p3(b.bed?.foot), head: p3(b.bed?.head) }, forge: p3(b.forge), shop: p3(b.shop), upgrades: p3(b.upgrades), chest: p3(b.chest), center: p3(b.center) })),
        diamonds: (arena.diamonds ?? []).map((d) => ({ id: d.id, ...p3(d) })),
        emeralds: (arena.emeralds ?? []).map((d) => ({ id: d.id, ...p3(d) })),
        bounds: A.bounds(), voidY: -4,
      };
    }
    return null;
  };

  // --- one look at the screen -----------------------------------------------------------------------------------

  A.view = () => {
    A.hookWorld();
    const p = g.player, inv = g.inventory;
    const eyeV = g.camera.getWorldPosition ? g.camera.position : p.position;
    const eye = { x: eyeV.x, y: eyeV.y, z: eyeV.z };
    if (A.lastHealth !== null && p.health < A.lastHealth - 1e-6) A.hurt.push({ t: now(), amount: round(A.lastHealth - p.health, 1) });
    A.lastHealth = p.health;
    const tb = g.targetBlock;
    let crosshair = null;
    const dir = { x: -Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * Math.cos(p.pitch) };
    const picked = g.worldSync?.remotePlayers?.pickPlayer?.(eye, dir, 6);
    const blockDist = tb ? Math.hypot(tb.x + 0.5 - eye.x, tb.y + 0.5 - eye.y, tb.z + 0.5 - eye.z) : Infinity;
    if (picked && picked.distance < blockDist) crosshair = { kind: 'player', name: picked.name, distance: round(picked.distance, 2) };
    else if (tb) crosshair = { kind: 'block', x: tb.x, y: tb.y, z: tb.z, face: tb.normal ? { x: Math.round(tb.normal.x), y: Math.round(tb.normal.y), z: Math.round(tb.normal.z) } : null, block: A.blockName(tb.blockId ?? g.world.getVoxel(tb.x, tb.y, tb.z)), distance: round(blockDist, 2) };
    // Bedrock-style bridging (src/bedrockBridging.js; on in SkyWars and Bed Wars): looking down past the edge of the
    // block underfoot, the game outlines the empty place a right click will fill, as a player sees on screen.
    else if (g.bridgeTarget) {
      const b = g.bridgeTarget, s = b.support;
      crosshair = { kind: 'bridge', x: b.x, y: b.y, z: b.z, against: s ? { x: s.x, y: s.y, z: s.z } : null, face: b.normal ? { x: Math.round(b.normal.x), y: Math.round(b.normal.y), z: Math.round(b.normal.z) } : null, distance: round(Math.hypot(b.x + 0.5 - eye.x, b.y + 0.5 - eye.y, b.z + 0.5 - eye.z), 2) };
    }
    const effects = [...(p.statusEffects?.entries?.() ?? [])].map(([id, e]) => ({ id, level: e.level, seconds: round(e.duration ?? 0, 1) }));
    const titles = [...document.querySelectorAll('#bedwars-title.bw-show, #bedwars-subtitle, .sw-title.sw-show, #skywars-title, #skywars-subtitle')]
      .filter((el) => el.offsetParent !== null && el.textContent.trim()).map((el) => el.textContent.trim());
    return {
      me: {
        pos: vec(p.position, 3), vel: vec(p.velocity, 2), eye: vec(eye, 3),
        // The game's yaw runs on past a full turn; shown here in -pi..pi, as a compass would.
        yaw: round(Math.atan2(Math.sin(p.yaw), Math.cos(p.yaw)), 4), pitch: round(p.pitch, 4), onGround: !!p.onGround,
        health: round(p.health, 1), maxHealth: p.maxHealth, absorption: round(p.absorption ?? 0, 1), hunger: round(p.hunger ?? 20, 1),
        armorPoints: typeof inv.getTotalArmorPoints === 'function' ? inv.getTotalArmorPoints() : null,
        effects, sneaking: !!p.isSneaking, sprinting: !!p.isSprinting, dead: !!p.isDead, gamemode: p.gamemode,
        selectedSlot: inv.activeSlot, held: A.stack(inv.hotbar?.[inv.activeSlot]),
        hotbar: (inv.hotbar ?? []).map(A.stack), inventory: (inv.storage ?? []).map(A.stack),
        armor: Object.fromEntries(Object.entries(inv.armor ?? {}).map(([k, v]) => [k, A.stack(v)])), offhand: A.stack(inv.offhand),
        using: g.eating?.useElapsed > 0 ? { item: A.itemName(inv.hotbar?.[inv.activeSlot]), seconds: round(g.eating.useElapsed, 2) } : null,
      },
      crosshair,
      players: A.players(eye),
      screen: A.screen(),
      match: A.match(),
      titles,
      pointerLocked: !!document.pointerLockElement,
    };
  };

  /** Chat lines and hurts since the last call. */
  A.takeNews = () => {
    const out = { chat: A.chat, hurt: A.hurt };
    A.chat = []; A.hurt = [];
    return out;
  };

  /** For the recording: everyone as this (host) client knows them. */
  A.everyone = () => {
    const out = [];
    const p = g.player, inv = g.inventory;
    out.push({ id: 'self', pos: vec(p.position, 2), yaw: round(p.yaw, 3), pitch: round(p.pitch, 3), held: A.itemName(inv.hotbar?.[inv.activeSlot]), health: round(p.health, 1), dead: !!p.isDead });
    for (const peer of g.worldSync?.remotePlayers?.remotePlayers?.values?.() ?? []) {
      const st = peer.__arenaState ?? {};
      out.push({ id: peer.peerId, name: peer.name, pos: vec(peer.targetPos ?? peer.currentPos, 2), yaw: round(peer.targetYaw ?? 0, 3), pitch: round(peer.targetPitch ?? 0, 3), held: st.activeItem ?? null, armor: st.armor ?? null, sneaking: !!peer.isSneaking, swinging: !!st.isSwinging, dead: !!peer.dead });
    }
    return out;
  };

  // --- the film -------------------------------------------------------------------------------------------------

  /** Record what this player's game draws (the 3D view, without the HUD) in the browser, and post it in pieces to
   *  `url`, which appends them to one WebM file. Encoding here keeps the arena's own process free to run the match. */
  A.startVideo = (url, { fps = 30, bitsPerSecond = 3_000_000 } = {}) => {
    if (A.recorder) return 'already';
    const canvas = g.renderer?.domElement;
    if (!canvas?.captureStream) return 'no canvas';
    const stream = canvas.captureStream(fps);
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
    let chain = Promise.resolve();
    A.videoBytes = 0;
    rec.ondataavailable = (e) => {
      if (!e.data?.size) return;
      A.videoBytes += e.data.size;
      chain = chain.then(() => fetch(url, { method: 'POST', body: e.data }).catch(() => {}));
    };
    rec.start(2000);
    A.recorder = rec;
    A.stopVideo = () => new Promise((resolve) => {
      rec.onstop = () => { chain.then(() => resolve(A.videoBytes)); };
      try { rec.stop(); } catch { resolve(A.videoBytes); }
    });
    return mimeType;
  };

  return 'installed';
})();
