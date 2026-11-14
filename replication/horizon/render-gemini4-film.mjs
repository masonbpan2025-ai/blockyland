#!/usr/bin/env node
// Post-production script for the 10-minute 4-Gemini-agent Horizon run (replication/runs/hz-gemini4/film).
// All captions, item milestone banners, and stats are derived strictly from the real events.jsonl
// and <Name>-transcript.jsonl recorded during live play (per HORIZON_FILMING.md "The one rule").

import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const slash = p => p.replaceAll('\\', '/');
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-gemini4');
const filmDir = path.join(runDir, 'film');
const outDir = path.join(repo, 'outputs', 'horizon-gemini4-10min');
mkdirSync(outDir, { recursive: true });

const NAMES = ['Aria', 'Basil', 'Corin', 'Delphi'];
const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', c => c === 0 ? resolve() : reject(new Error(`${cmd} exited with ${c}`)));
  });
}

function escapeDrawtext(str) {
  return String(str || '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, '')
    .replace(/%/g, '\\%')
    .replace(/,/g, '\\,')
    .replace(/\[/g, '(')
    .replace(/\]/g, ')')
    .replace(/;/g, '\\;')
    .trim();
}

function getDuration(mp4) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', mp4
    ]).toString().trim();
    return Number(out) || 0;
  } catch {
    return 0;
  }
}

async function main() {
  console.log('=== 1. Loading Real Event Log & Agent Transcripts ===');
  const meta = JSON.parse(readFileSync(path.join(filmDir, 'run-meta.json'), 'utf8'));
  const t0 = meta.startWall;
  const totalSec = meta.seconds || 600;

  const rawEvents = existsSync(path.join(filmDir, 'events.jsonl'))
    ? readFileSync(path.join(filmDir, 'events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    : [];

  // Deduplicate broadcast chat messages (since all 4 clients receive each chat packet)
  const seenChats = new Set();
  const chats = [];
  const itemEvents = [];
  const deathEvents = [];

  for (const e of rawEvents) {
    const relSec = Math.max(0, (e.wall - t0) / 1000);
    if (e.event === 'chat' && e.text) {
      const key = `${Math.floor(relSec / 3)}:${e.text}`;
      if (!seenChats.has(key)) {
        seenChats.add(key);
        chats.push({ t: +relSec.toFixed(1), text: e.text, player: e.player });
      }
    } else if (e.event === 'item' && e.delta > 0 && e.item) {
      itemEvents.push({ t: +relSec.toFixed(1), player: e.player, item: e.item.replace('minecraft:', ''), delta: e.delta });
    } else if (e.event === 'death') {
      deathEvents.push({ t: +relSec.toFixed(1), player: e.player, text: e.text || `${e.player} died` });
    }
  }

  // First time each player acquires key survival items
  const seenMilestones = new Set();
  const milestones = [];
  const KEY_ITEMS = new Set([
    'oak_log', 'birch_log', 'spruce_log', 'cherry_log',
    'oak_planks', 'birch_planks', 'spruce_planks',
    'crafting_table', 'stick',
    'wooden_pickaxe', 'wooden_axe', 'wooden_sword',
    'cobblestone', 'stone_pickaxe', 'stone_axe', 'stone_sword',
    'coal', 'charcoal', 'torch', 'furnace', 'raw_iron', 'iron_ingot', 'iron_pickaxe'
  ]);
  for (const it of itemEvents) {
    const mKey = `${it.player}:${it.item}`;
    if (KEY_ITEMS.has(it.item) && !seenMilestones.has(mKey)) {
      seenMilestones.add(mKey);
      milestones.push({ t: it.t, player: it.player, item: it.item, delta: it.delta });
    }
  }

  // Count tool calls per agent from transcripts
  const transcriptStats = {};
  for (const n of NAMES) {
    const tf = path.join(filmDir, `${n}-transcript.jsonl`);
    const lines = existsSync(tf) ? readFileSync(tf, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];
    const byCmd = {};
    for (const l of lines) byCmd[l.cmd] = (byCmd[l.cmd] || 0) + 1;
    transcriptStats[n] = { totalCalls: lines.length, byCmd };
  }

  console.log(`Loaded ${chats.length} unique chat lines, ${itemEvents.length} item pickup events, ${milestones.length} first-item milestones, ${deathEvents.length} deaths.`);

  // Step 2: Ensure Aria.mp4 is encoded from aria_frames if needed
  const ariaMp4 = path.join(filmDir, 'Aria.mp4');
  const ariaFramesDir = path.join(filmDir, 'aria_frames');
  if (existsSync(ariaFramesDir)) {
    const pngs = readdirSync(ariaFramesDir).filter(f => f.endsWith('.png'));
    if (pngs.length > 0 && getDuration(ariaMp4) < 30) {
      const targetDur = getDuration(path.join(filmDir, 'Basil.mp4')) || totalSec;
      const inFps = Math.max(0.5, pngs.length / targetDur).toFixed(3);
      console.log(`Encoding Aria.mp4 from ${pngs.length} Vulkan frames at ${inFps} fps -> 30 fps (${targetDur.toFixed(1)}s)...`);
      await run('ffmpeg', [
        '-y', '-framerate', String(inFps),
        '-i', slash(path.join(ariaFramesDir, 'f_%05d.png')),
        '-vf', 'scale=940:500,fps=30,format=yuv420p',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
        slash(ariaMp4)
      ]);
    }
  }

  // Step 3: Build Drawtext filter for real chat captions and real item milestones
  const hudFilters = [
    `drawtext=${font}:text='HORIZON 26.3 LIVE · 4 GEMINI AGENTS (REAL MCP/CLI PLAY)':x=(w-text_w)/2:y=14:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='TIME %{pts\\:gmtime\\:0\\:%M\\\\\\:%S}':x=(w-text_w)/2:y=52:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6`
  ];

  // Add real chat captions (non-overlapping 6s windows)
  let lastChatEnd = -1;
  for (const c of chats.slice(0, 45)) {
    const start = Math.max(c.t, lastChatEnd + 0.2);
    const end = start + 5.5;
    lastChatEnd = end;
    const safeText = escapeDrawtext(c.text.slice(0, 95));
    if (safeText) {
      hudFilters.push(
        `drawtext=${font}:text='${safeText}':enable='between(t\\,${start.toFixed(1)}\\,${end.toFixed(1)})':x=(w-text_w)/2:y=h-52:fontsize=23:fontcolor=white:box=1:boxcolor=black@0.8:boxborderw=8`
      );
    }
  }

  // Add real milestone banners (non-overlapping 4.5s windows)
  let lastMileEnd = -1;
  for (const m of milestones.slice(0, 35)) {
    const start = Math.max(m.t, lastMileEnd + 0.2);
    const end = start + 4.2;
    lastMileEnd = end;
    const safeMile = escapeDrawtext(`MILESTONE: ${m.player} acquired ${m.item} (+${m.delta})`);
    hudFilters.push(
      `drawtext=${font}:text='${safeMile}':enable='between(t\\,${start.toFixed(1)}\\,${end.toFixed(1)})':x=(w-text_w)/2:y=92:fontsize=22:fontcolor=0x55FF55:box=1:boxcolor=black@0.8:boxborderw=7`
    );
  }

  // Step 4: Render the 2x2 Quad Multiview 10-minute MP4
  const quadOut = path.join(filmDir, 'gemini4-quad-10min.mp4');
  console.log('=== 2. Rendering 4-Agent Quad Split-Screen Film (gemini4-quad-10min.mp4) ===');
  const filterComplex = [
    `[0:v]scale=960:540,drawtext=${font}:text='ARIA (Ore & Tools Lead)':x=24:y=20:fontsize=22:fontcolor=0x66CCFF:box=1:boxcolor=black@0.7:boxborderw=6[tl]`,
    `[1:v]scale=960:540,drawtext=${font}:text='BASIL (Forager & Camp)':x=24:y=20:fontsize=22:fontcolor=0x77FF77:box=1:boxcolor=black@0.7:boxborderw=6[tr]`,
    `[2:v]scale=960:540,drawtext=${font}:text='CORIN (Quarry & Outpost)':x=24:y=20:fontsize=22:fontcolor=0xFFCC66:box=1:boxcolor=black@0.7:boxborderw=6[bl]`,
    `[3:v]scale=960:540,drawtext=${font}:text='DELPHI (Scout & Perimeter)':x=24:y=20:fontsize=22:fontcolor=0xFF88CC:box=1:boxcolor=black@0.7:boxborderw=6[br]`,
    `[tl][tr]hstack[top];[bl][br]hstack[bot];[top][bot]vstack[grid]`,
    `[grid]${hudFilters.join(',')},format=yuv420p[v]`
  ].join(';');

  const filterScriptPath = path.join(filmDir, 'quad_filter.txt');
  writeFileSync(filterScriptPath, filterComplex);

  await run('ffmpeg', [
    '-y',
    '-i', slash(path.join(filmDir, 'Aria.mp4')),
    '-i', slash(path.join(filmDir, 'Basil.mp4')),
    '-i', slash(path.join(filmDir, 'Corin.mp4')),
    '-i', slash(path.join(filmDir, 'Delphi.mp4')),
    '-filter_complex_script', slash(filterScriptPath),
    '-map', '[v]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21',
    slash(quadOut)
  ]);

  copyFileSync(quadOut, path.join(outDir, 'gemini4-quad-10min.mp4'));
  for (const n of NAMES) {
    copyFileSync(path.join(filmDir, `${n}.mp4`), path.join(outDir, `${n}.mp4`));
  }

  // Step 5: Extract Stills Contact Sheet
  console.log('=== 3. Extracting Stills Contact Sheet ===');
  const dur = Math.max(60, Math.floor(getDuration(quadOut)));
  const sampleTimes = [30, Math.floor(dur * 0.3), Math.floor(dur * 0.6), Math.max(40, dur - 30)];
  const stillPaths = [];
  for (let i = 0; i < sampleTimes.length; i++) {
    const sp = path.join(outDir, `still_${i + 1}_${sampleTimes[i]}s.png`);
    await run('ffmpeg', ['-y', '-ss', String(sampleTimes[i]), '-i', slash(quadOut), '-frames:v', '1', slash(sp)]);
    stillPaths.push(sp);
  }
  const contactSheet = path.join(outDir, 'stills.png');
  await run('ffmpeg', [
    '-y',
    '-i', slash(stillPaths[0]),
    '-i', slash(stillPaths[1]),
    '-i', slash(stillPaths[2]),
    '-i', slash(stillPaths[3]),
    '-filter_complex', '[0:v]scale=960:540[a];[1:v]scale=960:540[b];[2:v]scale=960:540[c];[3:v]scale=960:540[d];[a][b]hstack[top];[c][d]hstack[bot];[top][bot]vstack[out]',
    '-map', '[out]',
    slash(contactSheet)
  ]);

  // Step 6: Write verifiable run-summary.md
  const summaryLines = [
    '# Horizon 26.3 — 4 Gemini Agents 10-Minute Live Gameplay & Film Summary',
    '',
    `- **Run folder**: \`replication/runs/hz-gemini4/film/\``,
    `- **Published outputs**: \`outputs/horizon-gemini4-10min/\``,
    `- **Server**: \`127.0.0.1:25595\` (world \`GeminiFilm\`, seed \`20261103\`, \`spawn-protection = 0\`)`,
    `- **Duration**: ${dur} seconds (${(dur / 60).toFixed(1)} minutes)`,
    '',
    '## Agent Tool Call Counts (from `<Name>-transcript.jsonl`)',
    '',
    '| Agent | Total CLI Tool Calls | Top Commands |',
    '| --- | --- | --- |'
  ];

  for (const n of NAMES) {
    const st = transcriptStats[n];
    const top = Object.entries(st.byCmd).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} (${v})`).join(', ');
    summaryLines.push(`| **${n}** | ${st.totalCalls} | ${top} |`);
  }

  summaryLines.push('', '## First-Time Item Milestones (from `events.jsonl`)', '');
  for (const m of milestones) {
    summaryLines.push(`- **${m.t.toFixed(1)}s** — **${m.player}** acquired \`${m.item}\` (+${m.delta})`);
  }

  summaryLines.push('', '## Verbatim Team Chat Log (from `events.jsonl`)', '');
  for (const c of chats) {
    summaryLines.push(`- **[${c.t.toFixed(1)}s]** ${c.text}`);
  }

  writeFileSync(path.join(outDir, 'run-summary.md'), summaryLines.join('\n') + '\n');
  console.log('=== Post-Production Complete! ===');
}

main().catch(err => {
  console.error('Render error:', err);
  process.exit(1);
});

