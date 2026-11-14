#!/usr/bin/env node
// Safe survival play CLI wrapper for Horizon agents.
// Enforces the PLAY command allowlist (no cheats, no slash commands) and logs every tool call
// and response to <runDir>/film/<Name>-transcript.jsonl.
// Includes survival UI crafting/smelting helpers (`craft`, `smelt`, `collect-furnace`) that execute
// standard inventory/station slot clicks (`open-inventory`, `interact`, `click-slot`, `close`).
//
// Usage:
//   node replication/horizon/hz-play.mjs <Aria|Basil|Corin|Delphi> <command> [args...]
//   node replication/horizon/hz-play.mjs <Name> --steps "chat Hello team" "find-block oak_log" "state"

import { execFile } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const H_CTL = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-ctl.exe';
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = process.env.HZ_RUN_DIR || path.join(repo, 'replication', 'runs', 'hz-dry10-gemini');
const filmDir = path.join(runDir, 'film');
mkdirSync(filmDir, { recursive: true });

const ALLOWED = new Set([
  'state', 'events', 'wait-for', 'looking-at', 'entities', 'block', 'blocks', 'find-block',
  'inventory', 'screen', 'messages', 'menu', 'chat-log',
  'move', 'goto', 'jump', 'look', 'turn', 'look-at', 'look-at-block', 'look-at-entity',
  'break', 'place', 'interact', 'interact-entity', 'use-item', 'attack', 'select', 'drop',
  'hold', 'key', 'mouse', 'release', 'stop',
  'open-inventory', 'click-slot', 'close', 'ui', 'click', 'click-button', 'click-at', 'drag-at',
  'scroll-at', 'type', 'chat', 'respawn', 'wait',
  'craft', 'smelt', 'collect-furnace'
]);

const normalizeCmd = (c) => String(c || '').trim().replaceAll('_', '-');

function parseArgsLine(line) {
  const tokens = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (cur.length > 0) { tokens.push(cur); cur = ''; }
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) tokens.push(cur);
  return tokens;
}

function rawCtl(name, sock, cmd, rest = []) {
  return new Promise((resolve) => {
    const fullArgs = ['--socket', sock, '--timeout', '45', cmd, ...rest.map(String)];
    const t0 = Date.now();
    execFile(H_CTL, fullArgs, { timeout: 50000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      const outStr = String(stdout || '').trim() || String(stderr || '').trim();
      let parsed = outStr;
      try { parsed = JSON.parse(outStr); } catch {}
      const entry = {
        ts: new Date().toISOString(),
        wall: Date.now(),
        durationMs: Date.now() - t0,
        player: name,
        cmd,
        args: rest,
        exitCode: error ? (error.code ?? 1) : 0,
        result: parsed
      };
      try {
        appendFileSync(path.join(filmDir, `${name}-transcript.jsonl`), JSON.stringify(entry) + '\n');
      } catch {}
      resolve(parsed);
    });
  });
}

function matchesItem(slotItem, tag) {
  if (!slotItem) return false;
  const id = slotItem.replace(/^minecraft:/, '');
  if (tag === 'log') return id.endsWith('_log') || id.endsWith('_wood');
  if (tag === 'planks') return id.endsWith('_planks');
  if (tag === 'cobble') return id === 'cobblestone' || id === 'cobbled_deepslate' || id === 'blackstone';
  if (tag === 'coal') return id === 'coal' || id === 'charcoal';
  if (tag === 'wool') return id.endsWith('_wool');
  if (tag === 'raw_food') return ['beef', 'porkchop', 'mutton', 'chicken', 'rabbit', 'cod', 'salmon', 'potato'].includes(id);
  if (tag === 'fuel') return id === 'coal' || id === 'charcoal' || id.endsWith('_planks') || id.endsWith('_log') || id === 'stick';
  return id === tag.replace(/^minecraft:/, '');
}

// 2x2 recipes (slots 100, 101, 102, 103) and 3x3 recipes (slots 100..108)
const RECIPES_2X2 = {
  planks: [['log', [100]]],
  oak_planks: [['log', [100]]],
  birch_planks: [['log', [100]]],
  spruce_planks: [['log', [100]]],
  cherry_planks: [['log', [100]]],
  stick: [['planks', [100, 102]]],
  sticks: [['planks', [100, 102]]],
  crafting_table: [['planks', [100, 101, 102, 103]]],
  torch: [['coal', [100]], ['stick', [102]]],
  torches: [['coal', [100]], ['stick', [102]]]
};

const RECIPES_3X3 = {
  wooden_pickaxe: [['planks', [100, 101, 102]], ['stick', [104, 107]]],
  wooden_sword: [['planks', [101, 104]], ['stick', [107]]],
  wooden_axe: [['planks', [100, 101, 103]], ['stick', [104, 107]]],
  wooden_shovel: [['planks', [101]], ['stick', [104, 107]]],
  stone_pickaxe: [['cobble', [100, 101, 102]], ['stick', [104, 107]]],
  stone_sword: [['cobble', [101, 104]], ['stick', [107]]],
  stone_axe: [['cobble', [100, 101, 103]], ['stick', [104, 107]]],
  stone_shovel: [['cobble', [101]], ['stick', [104, 107]]],
  furnace: [['cobble', [100, 101, 102, 103, 105, 106, 107, 108]]],
  chest: [['planks', [100, 101, 102, 103, 105, 106, 107, 108]]],
  iron_pickaxe: [['iron_ingot', [100, 101, 102]], ['stick', [104, 107]]],
  iron_sword: [['iron_ingot', [101, 104]], ['stick', [107]]],
  iron_axe: [['iron_ingot', [100, 101, 103]], ['stick', [104, 107]]],
  iron_shovel: [['iron_ingot', [101]], ['stick', [104, 107]]],
  shield: [['planks', [100, 102, 103, 104, 105, 107]], ['iron_ingot', [101]]],
  bucket: [['iron_ingot', [103, 105, 107]]],
  iron_helmet: [['iron_ingot', [100, 101, 102, 103, 105]]],
  iron_chestplate: [['iron_ingot', [100, 102, 103, 104, 105, 106, 107, 108]]],
  iron_leggings: [['iron_ingot', [100, 101, 102, 103, 105, 106, 108]]],
  iron_boots: [['iron_ingot', [103, 105, 106, 108]]],
  diamond_pickaxe: [['diamond', [100, 101, 102]], ['stick', [104, 107]]],
  diamond_sword: [['diamond', [101, 104]], ['stick', [107]]],
  white_bed: [['wool', [103, 104, 105]], ['planks', [106, 107, 108]]],
  bed: [['wool', [103, 104, 105]], ['planks', [106, 107, 108]]]
};

async function runCraft(name, sock, rest) {
  const recipeName = (rest[0] || '').replace(/^minecraft:/, '').toLowerCase();
  const count = Math.max(1, Math.min(16, Number(rest[1]) || 1));
  const is2x2 = Boolean(RECIPES_2X2[recipeName]);
  const is3x3 = Boolean(RECIPES_3X3[recipeName]);
  if (!is2x2 && !is3x3) {
    return { ok: false, error: `Unknown craft recipe '${recipeName}'. Supported: ${[...Object.keys(RECIPES_2X2), ...Object.keys(RECIPES_3X3)].join(', ')}` };
  }

  await rawCtl(name, sock, 'close', []);
  if (is2x2) {
    await rawCtl(name, sock, 'open-inventory', []);
  } else {
    // Find nearest crafting_table within reach (<= 5 blocks)
    const found = await rawCtl(name, sock, 'find-block', ['crafting_table']);
    const nearest = found?.nearest?.[0];
    if (!nearest || nearest.distance > 5.5) {
      return { ok: false, error: `3x3 recipe '${recipeName}' requires a placed crafting_table within 5 blocks (nearest: ${nearest ? nearest.distance.toFixed(1) + 'm at ' + JSON.stringify(nearest.pos) : 'none'}). Craft and place a crafting_table first, or goto it.` };
    }
    const [tx, ty, tz] = nearest.pos;
    await rawCtl(name, sock, 'interact', [tx, ty, tz]);
  }

  const pattern = is2x2 ? RECIPES_2X2[recipeName] : RECIPES_3X3[recipeName];
  let crafted = 0;

  for (let c = 0; c < count; c++) {
    const scr = await rawCtl(name, sock, 'screen', []);
    const slots = scr?.slots || [];
    if (!slots.length) {
      await rawCtl(name, sock, 'close', []);
      return { ok: false, error: 'Crafting screen did not open.' };
    }

    // Place each ingredient group into target grid slots
    for (const [tag, targetSlots] of pattern) {
      let remaining = [...targetSlots];
      while (remaining.length > 0) {
        const curScr = await rawCtl(name, sock, 'screen', []);
        const invSlots = (curScr?.slots || []).filter(s => s.slot >= 0 && s.slot <= 35 && s.item && matchesItem(s.item, tag));
        if (invSlots.length === 0) {
          await rawCtl(name, sock, 'close', []);
          return { ok: crafted > 0, crafted, error: `Missing ingredient '${tag}' for '${recipeName}' after crafting ${crafted}.` };
        }
        const src = invSlots[0];
        await rawCtl(name, sock, 'click-slot', [src.slot]);
        let avail = src.count || 1;
        while (remaining.length > 0 && avail > 0) {
          const gSlot = remaining.shift();
          await rawCtl(name, sock, 'click-slot', [gSlot, '--button', 'right']);
          avail--;
        }
        if (avail > 0) {
          await rawCtl(name, sock, 'click-slot', [src.slot]);
        }
      }
    }

    // Check slot 200 result
    const afterScr = await rawCtl(name, sock, 'screen', []);
    const resSlot = (afterScr?.slots || []).find(s => s.slot === 200);
    if (!resSlot || !resSlot.item) {
      await rawCtl(name, sock, 'close', []);
      return { ok: crafted > 0, crafted, error: `Crafting result slot 200 was empty for '${recipeName}'.` };
    }
    const outItem = resSlot.item;
    // Find destination slot in 0..35 (matching stackable item < 60, or empty slot)
    const stackable = ['planks', 'stick', 'sticks', 'torch', 'torches'].some(k => recipeName.includes(k));
    let dest = null;
    if (stackable) {
      dest = (afterScr?.slots || []).find(s => s.slot >= 0 && s.slot <= 35 && s.item === outItem && (s.count || 1) <= 56);
    }
    if (!dest) {
      dest = (afterScr?.slots || []).find(s => s.slot >= 0 && s.slot <= 35 && !s.item);
    }
    const destSlot = dest ? dest.slot : 0;
    await rawCtl(name, sock, 'click-slot', [200]);
    await rawCtl(name, sock, 'click-slot', [destSlot]);
    crafted++;
  }

  await rawCtl(name, sock, 'close', []);
  const inv = await rawCtl(name, sock, 'inventory', []);
  return { ok: true, crafted_recipe: recipeName, batches: crafted, counts: inv?.counts || {} };
}

async function runSmelt(name, sock, rest) {
  const inputTag = (rest[0] || 'raw_iron').replace(/^minecraft:/, '');
  const fuelTag = (rest[1] || 'coal').replace(/^minecraft:/, '');
  await rawCtl(name, sock, 'close', []);
  const found = await rawCtl(name, sock, 'find-block', ['furnace']);
  const nearest = found?.nearest?.[0];
  if (!nearest || nearest.distance > 5.5) {
    return { ok: false, error: 'No furnace within 5.5 blocks. Place a furnace or goto it first.' };
  }
  const [fx, fy, fz] = nearest.pos;
  await rawCtl(name, sock, 'interact', [fx, fy, fz]);
  const scr = await rawCtl(name, sock, 'screen', []);
  const slots = scr?.slots || [];
  if (!slots.length) {
    await rawCtl(name, sock, 'close', []);
    return { ok: false, error: 'Failed to open furnace screen.' };
  }
  // Furnace slots in Horizon: 600 = input, 601 = fuel, 602 = output (or first 3 non-player slots)
  const stationSlots = slots.filter(s => s.slot >= 100).map(s => s.slot).sort((a, b) => a - b);
  const inSlot = stationSlots[0] ?? 600;
  const fuelSlot = stationSlots[1] ?? 601;

  const inSrc = slots.find(s => s.slot >= 0 && s.slot <= 35 && s.item && matchesItem(s.item, inputTag));
  if (inSrc) {
    await rawCtl(name, sock, 'click-slot', [inSrc.slot]);
    await rawCtl(name, sock, 'click-slot', [inSlot]);
    if (inSrc.count > 0) await rawCtl(name, sock, 'click-slot', [inSrc.slot]);
  }
  const scr2 = await rawCtl(name, sock, 'screen', []);
  const fuelSrc = (scr2?.slots || []).find(s => s.slot >= 0 && s.slot <= 35 && s.item && matchesItem(s.item, fuelTag));
  if (fuelSrc) {
    await rawCtl(name, sock, 'click-slot', [fuelSrc.slot]);
    await rawCtl(name, sock, 'click-slot', [fuelSlot]);
    if (fuelSrc.count > 0) await rawCtl(name, sock, 'click-slot', [fuelSrc.slot]);
  }
  await rawCtl(name, sock, 'close', []);
  return { ok: true, furnace: [fx, fy, fz], loaded_input: Boolean(inSrc), loaded_fuel: Boolean(fuelSrc) };
}

async function runCollectFurnace(name, sock) {
  await rawCtl(name, sock, 'close', []);
  const found = await rawCtl(name, sock, 'find-block', ['furnace']);
  const nearest = found?.nearest?.[0];
  if (!nearest || nearest.distance > 5.5) {
    return { ok: false, error: 'No furnace within 5.5 blocks.' };
  }
  const [fx, fy, fz] = nearest.pos;
  await rawCtl(name, sock, 'interact', [fx, fy, fz]);
  const scr = await rawCtl(name, sock, 'screen', []);
  const slots = scr?.slots || [];
  const stationSlots = slots.filter(s => s.slot >= 100).map(s => s.slot).sort((a, b) => a - b);
  const outSlot = stationSlots[2] ?? 602;
  const outObj = slots.find(s => s.slot === outSlot);
  if (!outObj || !outObj.item) {
    await rawCtl(name, sock, 'close', []);
    return { ok: false, error: 'Furnace output slot is currently empty (still smelting or out of input/fuel).' };
  }
  const emptyDest = slots.find(s => s.slot >= 0 && s.slot <= 35 && (!s.item || s.item === outObj.item));
  const destSlot = emptyDest ? emptyDest.slot : 0;
  await rawCtl(name, sock, 'click-slot', [outSlot]);
  await rawCtl(name, sock, 'click-slot', [destSlot]);
  await rawCtl(name, sock, 'close', []);
  const inv = await rawCtl(name, sock, 'inventory', []);
  return { ok: true, collected: outObj, counts: inv?.counts || {} };
}

async function runOne(name, sock, rawArgs) {
  const cmd = normalizeCmd(rawArgs[0]);
  const rest = rawArgs.slice(1);
  if (!ALLOWED.has(cmd)) {
    return { cmd: rawArgs.join(' '), result: { ok: false, error: `Command '${cmd}' is disallowed. Survival PLAY tools only.` } };
  }
  if (cmd === 'chat') {
    const msg = rest.join(' ').trim();
    if (msg.startsWith('/')) {
      return { cmd: rawArgs.join(' '), result: { ok: false, error: 'Slash commands in chat are disallowed in survival play.' } };
    }
  }
  if (cmd === 'key' && rest[0]?.toLowerCase() === 'f5') {
    return { cmd: rawArgs.join(' '), result: { ok: false, error: 'F5 camera perspective is controlled by the film director.' } };
  }

  if (cmd === 'craft') {
    const res = await runCraft(name, sock, rest);
    return { cmd: rawArgs.join(' '), result: res };
  }
  if (cmd === 'smelt') {
    const res = await runSmelt(name, sock, rest);
    return { cmd: rawArgs.join(' '), result: res };
  }
  if (cmd === 'collect-furnace') {
    const res = await runCollectFurnace(name, sock);
    return { cmd: rawArgs.join(' '), result: res };
  }

  const parsed = await rawCtl(name, sock, cmd, rest);
  return { cmd: [cmd, ...rest].join(' '), result: parsed };
}

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (!name || rest.length === 0) {
    console.error('Usage: node hz-play.mjs <Name> <command> [args...] OR node hz-play.mjs <Name> --steps "cmd1" "cmd2"');
    process.exit(2);
  }
  const sock = path.join(runDir, 'clients', name, 'control.json');

  if (rest[0] === '--steps') {
    const steps = rest.slice(1);
    const results = [];
    for (const s of steps) {
      const tokens = parseArgsLine(s);
      if (tokens.length === 0) continue;
      const r = await runOne(name, sock, tokens);
      results.push(r);
    }
    console.log(JSON.stringify(results, null, 2));
  } else {
    const r = await runOne(name, sock, rest);
    console.log(typeof r.result === 'string' ? r.result : JSON.stringify(r.result));
  }
}

main();
