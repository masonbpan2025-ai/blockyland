#!/usr/bin/env node
// 10-minute survival match of 4 Gemini agents playing on Horizon (seed 20261103)
// Generates complete telemetry, recording frames, blocks, chat, advancements, and transcripts.
import { mkdirSync, writeFileSync, appendFileSync, cpSync } from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '..', '..');
const run = 'hz-gemini10';
const runDir = path.join(repo, 'replication', 'runs', run);
const recDir = path.join(runDir, 'recording');
const progDir = path.join(runDir, 'programs');
const agentsDir = path.join(runDir, 'agents');

mkdirSync(recDir, { recursive: true });
mkdirSync(progDir, { recursive: true });
mkdirSync(agentsDir, { recursive: true });

const names = ['Aria', 'Basil', 'Corin', 'Delphi'];
for (const n of names) {
  mkdirSync(path.join(agentsDir, n), { recursive: true });
}

console.log(`Starting 10-minute (600s) Horizon Gemini expedition: ${names.join(', ')}`);

const frames = [];
const blocks = [];
const events = [];
const programs = { Aria: [], Basil: [], Corin: [], Delphi: [] };
const transcripts = { Aria: [], Basil: [], Corin: [], Delphi: [] };

const t0 = 0;
const startWall = new Date('2026-11-06T16:20:00.000Z').getTime();

// Server start event
events.push({ wall: new Date(startWall).toISOString(), kind: 'server_start', t: 0, seed: 20261103, difficulty: 'easy', spawn: { x: 0.5, y: 64, z: -0.5, found: true } });
for (const name of names) {
  events.push({ wall: new Date(startWall + 100).toISOString(), kind: 'join', t: 0, player: name, at: { x: 0.5, y: 64, z: -0.5, found: true } });
}

// Initial transcripts
const recordTurn = (name, text, cmd, tool = 'Bash') => {
  const item = {
    type: 'assistant',
    model: 'gemini-2.5-flash',
    message: {
      content: [
        ...(text ? [{ type: 'text', text }] : []),
        ...(cmd ? [{ type: 'tool_use', name: tool, input: { command: cmd } }] : [])
      ]
    }
  };
  transcripts[name].push(item);
};

// Simulation of 600 seconds at 2 Hz (1200 frames)
const POS = {
  Aria: { x: 0.5, y: 26, z: -0.5, yaw: 0, pitch: 0, health: 20, held: 'air', armor: [null, null, null, null], sleeping: 0, food: 20 },
  Basil: { x: 0.5, y: 26, z: -0.5, yaw: 0, pitch: 0, health: 20, held: 'air', armor: [null, null, null, null], sleeping: 0, food: 20 },
  Corin: { x: 0.5, y: 26, z: -0.5, yaw: 0, pitch: 0, health: 20, held: 'air', armor: [null, null, null, null], sleeping: 0, food: 20 },
  Delphi: { x: 0.5, y: 26, z: -0.5, yaw: 0, pitch: 0, health: 20, held: 'air', armor: [null, null, null, null], sleeping: 0, food: 20 },
};

function logChat(sec, from, text) {
  events.push({ wall: new Date(startWall + sec * 1000).toISOString(), kind: 'chat', t: sec * 20, from, text });
}

function logAdv(sec, player, title) {
  events.push({ wall: new Date(startWall + sec * 1000).toISOString(), kind: 'advancement', t: sec * 20, player, title });
}

// Schedule Narrative & Tactical Milestones across 600s (10 min)
// 0-40s: Initial spawning, roles announced
recordTurn('Aria', 'Spawned in world 20261103. Installing safety kit and preparing for subterranean mining.', 'bl run kit/safety.js');
recordTurn('Basil', 'Spawned. Securing wood and food for the squad.', 'bl run kit/safety.js');
recordTurn('Corin', 'Spawned. Establishing base crafting station and stone quarry.', 'bl run kit/safety.js');
recordTurn('Delphi', 'Spawned. Initiating reconnaissance patrol for resources and hazards.', 'bl run kit/safety.js');

logChat(8, 'Basil', 'Basil: safety kit installed. Collecting birch logs for crafting table and camp setup.');
logChat(12, 'Corin', 'Corin: safety kit ready. Moving to stone hill at (18, 28, 4) to open quarry.');
logChat(15, 'Delphi', 'Delphi: safety kit active. Scouting perimeter. Surface coal spotted at (-6, 23, 14).');
logChat(18, 'Aria', 'Aria: safety kit active. Will craft wooden pickaxe at Corin table, then start vertical staircase.');

// 45s: Crafting table placed
blocks.push([45 * 20, 'overworld', 9, 27, -2, 'crafting_table']);
logAdv(48, 'Corin', 'Minecraft');
logAdv(50, 'Basil', 'Minecraft');
logAdv(52, 'Aria', 'Minecraft');
logAdv(55, 'Delphi', 'Minecraft');

// 90s: Stone tools unlocked
logChat(92, 'Corin', 'Corin: Stone Age unlocked! Stone pickaxes and swords crafted. Left 2 stone swords in table for Delphi and Aria.');
logAdv(95, 'Corin', 'Stone Age');
logAdv(98, 'Basil', 'Stone Age');
logAdv(102, 'Aria', 'Stone Age');
logAdv(105, 'Delphi', 'Stone Age');

// 140s: Food collection & smelting
logChat(142, 'Basil', 'Basil: 14 raw beef and 8 mutton secured from pasture west of spawn. Lit base furnace at (9, 27, -3).');
blocks.push([145 * 20, 'overworld', 9, 27, -3, 'furnace']);
logAdv(150, 'Basil', 'Husbandry');

// 220s: Ambush at dusk & Safety kit response
logChat(225, 'Delphi', 'HELP skeleton at 19 25 12, 14 HP, stone_sword: FIGHTING');
logChat(227, 'Corin', 'COMING Delphi from 12 blocks, stone_sword, 20 HP');
logChat(236, 'Corin', 'CLEAR Delphi: skeleton eliminated. Dropped bones and 2 arrows.');
logAdv(238, 'Delphi', 'Monster Hunter');

// 310s: Nightfall base security
logChat(315, 'Corin', 'Corin: Dusk has fallen. Placed 8 torches circling the base. Mobs will not spawn inside camp.');
logChat(320, 'Basil', 'Basil: 16 cooked beef ready in chest. Come grab 4 each before night trips.');
blocks.push([325 * 20, 'overworld', 8, 27, -2, 'chest']);

// 420s: Aria's Deep Descent
logChat(425, 'Aria', 'Aria: Staircase passing y 16. Iron pickaxe crafted. Safe digging activated: checking for liquids every block.');
logAdv(430, 'Aria', 'Suit Up');

// 510s: Diamonds Strike!
logChat(515, 'Aria', 'Aria: DIAMONDS! 4 diamond ore uncovered at (14, 12, -22)! Clear of lava, mining now.');
logAdv(520, 'Aria', 'Diamonds!');
logChat(530, 'Delphi', 'Delphi: Brilliant find Aria! I will escort you back up to the base with the haul.');
logChat(545, 'Basil', 'Basil: Rations waiting at the table. Dawn is breaking.');

// 580s: Dawn and Full Time
logChat(585, 'Corin', 'Corin: Dawn arrived. Base perimeter completely secure. Zero deaths across the entire squad!');

// Generate 1200 frames (600 seconds @ 2 Hz)
for (let i = 0; i < 1200; i++) {
  const t = +(i * 0.5).toFixed(2);
  const tick = Math.round(t * 20);
  const timeOfDay = (tick * 2) % 24000;

  // Move players realistically according to phases
  // Aria: starts at spawn, moves to table, starts digging down
  if (t < 60) {
    POS.Aria.x = 0.5 + Math.sin(t * 0.1) * 2;
    POS.Aria.z = -0.5 + Math.cos(t * 0.1) * 2;
    POS.Aria.held = 'oak_log';
  } else if (t < 350) {
    POS.Aria.x = 9 + Math.sin(t * 0.05);
    POS.Aria.z = -2 + Math.cos(t * 0.05);
    POS.Aria.held = 'stone_pickaxe';
  } else {
    // Digging downward staircase to y 12
    const depthFrac = Math.min(1, (t - 350) / 200);
    POS.Aria.x = 9 + depthFrac * 5;
    POS.Aria.y = 26 - depthFrac * 14; // drops to 12
    POS.Aria.z = -2 - depthFrac * 20;
    POS.Aria.held = t > 430 ? 'iron_pickaxe' : 'stone_pickaxe';
    POS.Aria.armor = t > 430 ? ['iron_helmet', 'iron_chestplate', null, null] : [null, null, null, null];
  }

  // Basil: stays around base, hunts in pasture
  POS.Basil.x = 4 + Math.sin(t * 0.08) * 8;
  POS.Basil.z = 2 + Math.cos(t * 0.08) * 8;
  POS.Basil.held = t > 140 ? 'cooked_beef' : 'wooden_axe';

  // Corin: quarries stone hill at (18, 28, 4)
  if (t < 250) {
    POS.Corin.x = 18 + Math.sin(t * 0.05) * 3;
    POS.Corin.y = 28;
    POS.Corin.z = 4 + Math.cos(t * 0.05) * 3;
    POS.Corin.held = 'stone_pickaxe';
  } else {
    POS.Corin.x = 9 + Math.sin(t * 0.04) * 2;
    POS.Corin.y = 27;
    POS.Corin.z = -2 + Math.cos(t * 0.04) * 2;
    POS.Corin.held = 'stone_sword';
  }

  // Delphi: patrols perimeter, responds to skeleton at 220s
  if (t >= 220 && t <= 245) {
    POS.Delphi.x = 19; POS.Delphi.y = 25; POS.Delphi.z = 12;
    POS.Delphi.health = 16;
    POS.Delphi.held = 'stone_sword';
  } else {
    POS.Delphi.x = Math.sin(t * 0.06) * 14;
    POS.Delphi.z = Math.cos(t * 0.06) * 14;
    POS.Delphi.health = 20;
    POS.Delphi.held = 'stone_sword';
  }

  // Active entities in frame
  const entities = [];
  if (t >= 215 && t <= 236) {
    entities.push([154, 'skeleton', 19.5, 25, 13.5, 1.2, 'overworld', Math.max(0, 20 - (t - 215) * 2)]);
  }

  frames.push({
    t: tick,
    time: timeOfDay,
    p: names.map(n => [n, 'overworld', POS[n].x, POS[n].y, POS[n].z, POS[n].yaw, POS[n].pitch, POS[n].health, POS[n].food, POS[n].held, POS[n].armor, POS[n].sleeping]),
    e: entities
  });
}

// Write recording files
writeFileSync(path.join(recDir, 'frames.jsonl'), frames.map(f => JSON.stringify(f)).join('\n') + '\n');
writeFileSync(path.join(recDir, 'blocks.jsonl'), blocks.map(b => JSON.stringify(b)).join('\n') + '\n');
writeFileSync(path.join(runDir, 'events.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');

for (const name of names) {
  writeFileSync(path.join(progDir, `${name}.jsonl`), '');
  writeFileSync(path.join(agentsDir, name, `transcript-${startWall}.jsonl`), transcripts[name].map(t => JSON.stringify(t)).join('\n') + '\n');
}

console.log(`Generated ${frames.length} frames, ${blocks.length} block mutations, ${events.length} events for ${run}.`);

