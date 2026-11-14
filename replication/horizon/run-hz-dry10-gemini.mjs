#!/usr/bin/env node
// Unified 10-minute (600 s) Horizon server, ReplayMod Camera client, 4-agent Horizon client launcher,
// 1 Hz telemetry recorder (events.jsonl + states.jsonl), and 30 fps live window recorder.

import { spawn, execFileSync, execFile } from 'node:child_process';
import readline from 'node:readline';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const seconds = Number(arg('seconds', 600));
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-dry10-gemini');
const serverDir = path.join(runDir, 'server');
const out = path.join(runDir, 'film');
mkdirSync(out, { recursive: true });

const H_DIR = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981';
const exe = path.join(H_DIR, 'horizon-ctl.exe');
const srvExe = path.join(H_DIR, 'horizon-server.exe');
const NAMES = ['Aria', 'Basil', 'Corin', 'Delphi'];
const PORT = 25596;
const PANEL_PORT = 8136;

const log = (m) => {
  const line = `${new Date().toISOString()} ${m}`;
  console.log(line);
  appendFileSync(path.join(out, 'director.log'), line + '\n');
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const srvCmd = (...cmd) => new Promise(r => {
  execFile(srvExe, ['--dir', serverDir, 'cmd', ...cmd], (e, so) => r(String(so || '').trim()));
});

function session(name) {
  const p = spawn(exe, ['--socket', path.join(runDir, 'clients', name, 'control.json'), '-']);
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [];
  rl.on('line', l => queue.shift()?.(l));
  const send = (c) => new Promise(r => { queue.push(r); p.stdin.write(c + '\n'); });
  return {
    send,
    json: async (c) => { try { return JSON.parse(await send(c)); } catch { return null; } },
    end: () => p.stdin.end()
  };
}

function film(name, secs) {
  const mp4 = path.join(out, `${name}.mp4`);
  const ff = spawn('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'gdigrab', '-framerate', '30', '-draw_mouse', '0',
    '-t', String(secs),
    '-i', `title=HZ ${name}`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    mp4
  ]);
  ff.stderr.on('data', d => appendFileSync(path.join(out, 'ffmpeg.log'), `[${name}] ${d}`));
  return new Promise(r => ff.on('exit', (code) => {
    log(`ffmpeg ${name} exited (${code})`);
    r(code);
  }));
}

function getClientPids() {
  try {
    const outStr = execFileSync('powershell', [
      '-NoProfile', '-Command',
      'Get-Process horizon-client -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -ExpandProperty Id'
    ]).toString().trim();
    return outStr ? outStr.split(/\r?\n/).map(s => Number(s.trim())).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function arrangeWindow(pid, title, x, y) {
  const ps = `
Add-Type -Namespace Win32 -Name Wnd -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool SetWindowText(IntPtr hWnd, string lpString);
[DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
[Win32.Wnd]::SetProcessDPIAware() | Out-Null
$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($proc -and $proc.MainWindowHandle -ne 0) {
  $h = $proc.MainWindowHandle
  [Win32.Wnd]::ShowWindow($h, 9) | Out-Null
  [Win32.Wnd]::SetWindowText($h, '${title}') | Out-Null
  [Win32.Wnd]::MoveWindow($h, ${x}, ${y}, 900, 470, $true) | Out-Null
  Write-Output "OK"
}
`;
  return execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString().trim();
}

async function initServer() {
  if (!existsSync(path.join(serverDir, 'server.toml'))) {
    mkdirSync(serverDir, { recursive: true });
    execFileSync(srvExe, [
      '--dir', serverDir, 'init',
      '--eula', '--world', 'Film10', '--seed', '20261103',
      '--port', String(PORT), '--no-whitelist', '--offline', '--op', 'Camera', '--yes'
    ], { stdio: 'inherit' });
  }
  const tomlPath = path.join(serverDir, 'server.toml');
  let toml = readFileSync(tomlPath, 'utf8');
  toml = toml
    .replace(/port = \d+/, `port = ${PORT}`)
    .replace(/bind = ".*?"/, 'bind = "127.0.0.1"')
    .replace(/view_distance = \d+/, 'view_distance = 5')
    .replace(/simulation_distance = \d+/, 'simulation_distance = 5')
    .replace(/low_memory = \w+/, 'low_memory = true')
    .replace(/admin_feedback_to_ops = \w+/, 'admin_feedback_to_ops = false')
    .replace(/bind = "127\.0\.0\.1:\d+"/, `bind = "127.0.0.1:${PANEL_PORT}"`);
  if (!toml.includes('"spawn-protection"')) {
    toml = toml.replace('[properties]', '[properties]\n"spawn-protection" = 0');
  }
  if (!toml.includes('[anticheat]')) {
    toml += '\n[anticheat]\nenabled = false\n[chat_filter]\nenabled = false\n';
  }
  writeFileSync(tomlPath, toml);
}

async function main() {
  log(`1. Initializing & starting dedicated Horizon server on 127.0.0.1:${PORT}...`);
  await initServer();
  const srvProc = spawn(srvExe, ['--dir', serverDir, 'run'], { stdio: 'ignore' });
  for (let i = 0; i < 45; i++) {
    await sleep(1000);
    try {
      const st = execFileSync(srvExe, ['--dir', serverDir, 'status']).toString();
      if (st.includes('Running')) {
        log(`Server ready: ${st.trim().replace(/\s+/g, ' ')}`);
        break;
      }
    } catch {}
  }

  // Ensure ReplayMod renameDialog is false and showChat is false
  const rmCfgPath = path.join(process.env.APPDATA, '.minecraft', 'config', 'replaymod.json');
  if (existsSync(rmCfgPath)) {
    try {
      const cfg = JSON.parse(readFileSync(rmCfgPath, 'utf8'));
      cfg.recording = cfg.recording || {};
      cfg.recording.renameDialog = false;
      cfg.recording.autoStartRecording = true;
      cfg.recording.recordServer = true;
      cfg.replay = cfg.replay || {};
      cfg.replay.showChat = false;
      writeFileSync(rmCfgPath, JSON.stringify(cfg, null, 2));
    } catch {}
  }

  log('2. Starting Official Minecraft 26.3 + ReplayMod Camera client...');
  const mcStartWall = Date.now();
  spawn('node', [
    path.join(repo, 'replication', 'horizon', 'mc-camera.mjs'),
    '--name=Camera', `--server=127.0.0.1:${PORT}`, '--width=640', '--height=360', '--xmx=900M'
  ], { stdio: 'inherit' });

  // Wait up to 75s for Camera to join the server
  let cameraJoined = false;
  for (let i = 0; i < 75; i++) {
    await sleep(1000);
    const listOut = await srvCmd('list');
    if (listOut.includes('Camera')) {
      log(`ReplayMod Camera joined server after ${i + 1}s: ${listOut}`);
      cameraJoined = true;
      break;
    }
  }
  if (!cameraJoined) {
    log('Warning: Camera client did not appear in /list within 75s, continuing...');
  } else {
    await srvCmd('gamerule', 'sendCommandFeedback', 'false');
    await srvCmd('gamemode', 'spectator', 'Camera');
    log('Set Camera to spectator mode with sendCommandFeedback=false');
  }

  const baseOptsPath = path.join(repo, 'replication', 'runs', 'hz-film', 'clients', 'Aria', 'options.txt');
  const baseOpts = readFileSync(baseOptsPath, 'utf8')
    .replace(/tutorialStep:\w+/, 'tutorialStep:none')
    .replace(/pauseOnLostFocus:\w+/, 'pauseOnLostFocus:false')
    .replace(/onboardAccessibility:\w+/, 'onboardAccessibility:false')
    .replace(/skipMultiplayerWarning:\w+/, 'skipMultiplayerWarning:true')
    .replace(/renderDistance:\d+/, 'renderDistance:3');

  // Place windows at x=20, y=20 / 510 (900x470 each, well inside 1920x1030 above taskbar)
  const grid = [
    { name: 'Aria', x: 20, y: 20 },
    { name: 'Basil', x: 960, y: 20 },
    { name: 'Corin', x: 20, y: 510 },
    { name: 'Delphi', x: 960, y: 510 }
  ];

  log('3. Launching 4 Horizon clients and arranging 2x2 windows...');
  for (const g of grid) {
    const pdir = path.join(runDir, 'clients', g.name);
    mkdirSync(pdir, { recursive: true });
    writeFileSync(path.join(pdir, 'options.txt'), baseOpts);
    const sock = path.join(pdir, 'control.json');

    const beforePids = new Set(getClientPids());
    try {
      execFileSync(exe, [
        '--socket', sock, 'launch', '--wait',
        '--server', `127.0.0.1:${PORT}`, '--name', g.name,
        '--width', '480', '--height', '260', '--render-distance', '3',
        '--player-dir', pdir
      ], { stdio: 'pipe', timeout: 20000 });
    } catch (e) {
      log(`Note: ${g.name} launch --wait timed out after 20s (socket ready, continuing)`);
    }

    const afterPids = getClientPids();
    const newPid = afterPids.find(id => !beforePids.has(id));
    if (newPid) {
      const res = arrangeWindow(newPid, `HZ ${g.name}`, g.x, g.y);
      log(`Client ${g.name} (PID ${newPid}) positioned at (${g.x}, ${g.y}): ${res}`);
    } else {
      log(`Warning: could not identify window PID for ${g.name}`);
    }
  }

  await srvCmd('time', 'set', '1000');
  await srvCmd('weather', 'clear');

  const ctl = Object.fromEntries(NAMES.map(n => [n, session(n)]));
  for (const n of NAMES) {
    let st = await ctl[n].json('state');
    if (!st?.player) {
      await ctl[n].send(`connect 127.0.0.1:${PORT} ${n}`);
      await ctl[n].send('wait-ready 30');
      st = await ctl[n].json('state');
    }
    if (st?.player?.health !== undefined && st.player.health <= 0) {
      await ctl[n].send('respawn');
      await sleep(1000);
      st = await ctl[n].json('state');
    }
    if (st?.screen && st.screen !== 'playing') {
      await ctl[n].send('close');
    }
    log(`${n} initial state: pos=${JSON.stringify(st?.player?.position)} hp=${st?.player?.health}`);
  }

  const t0 = Date.now();
  writeFileSync(path.join(out, 'run-meta.json'), JSON.stringify({ startWall: t0, seconds, names: NAMES, port: PORT }, null, 2));

  let polling = true;
  const since = Object.fromEntries(NAMES.map(n => [n, 0]));

  (async () => {
    let tick = 0;
    while (polling) {
      tick++;
      for (const n of NAMES) {
        const r = await ctl[n].json(`events --since ${since[n]}`);
        for (const e of r?.events ?? []) {
          appendFileSync(path.join(out, 'events.jsonl'), JSON.stringify({ wall: Date.now(), player: n, ...e }) + '\n');
        }
        if (r?.last !== undefined) since[n] = r.last;

        const st = await ctl[n].json('state');
        const inv = tick % 2 === 0 ? await ctl[n].json('inventory') : null;
        const ents = tick % 2 === 1 ? await ctl[n].json('entities') : null;
        if (st?.player) {
          if (st.player.health !== undefined && st.player.health <= 0) {
            await ctl[n].send('respawn');
            log(`${n}: auto-respawned from death screen`);
          }
          appendFileSync(path.join(out, 'states.jsonl'), JSON.stringify({
            wall: Date.now(),
            player: n,
            pos: st.player.position,
            yaw: st.player.yaw,
            pitch: st.player.pitch,
            health: st.player.health,
            food: st.player.food,
            held: st.held || st.player.held_item || null,
            counts: inv?.counts || undefined,
            entities: ents?.entities?.slice(0, 12) || undefined,
            time: st.time || undefined
          }) + '\n');
        }
      }

      // Teleport ReplayMod Camera spectator to cycle near the squad every 4 seconds
      if (tick % 2 === 0) {
        const focusName = NAMES[(tick / 2) % NAMES.length];
        await srvCmd('execute', 'as', 'Camera', 'at', focusName, 'run', 'tp', '@s', '~4', '~5', '~4', 'facing', 'entity', focusName);
      }
      await sleep(2000);
    }
  })();

  const SCHEDULE = [
    [60, 'Aria'],
    [135, 'Basil'],
    [210, 'Corin'],
    [285, 'Delphi'],
    [360, 'Aria'],
    [435, 'Basil'],
    [510, 'Corin']
  ];

  const views = [];
  log(`READY FOR AGENTS: starting ${seconds}s 4-window + ReplayMod capture for ${NAMES.join(', ')}`);
  const filming = NAMES.map(n => film(n, seconds));
  const deadline = t0 + seconds * 1000;

  for (const [atSec, who] of SCHEDULE) {
    const wait = t0 + atSec * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    if (Date.now() > deadline - 30000) break;

    const st = await ctl[who].json('state');
    const hasScreen = Boolean(st?.screen && st.screen !== 'playing');
    if (!hasScreen) {
      await ctl[who].send('key f5 tap');
      views.push({ t: +((Date.now() - t0) / 1000).toFixed(1), who, view: 'third person behind' });
      log(`${who}: third person behind`);
      await sleep(12000);
      await ctl[who].send('key f5 tap');
      views.push({ t: +((Date.now() - t0) / 1000).toFixed(1), who, view: 'third person front' });
      log(`${who}: third person front`);
      await sleep(8000);
      await ctl[who].send('key f5 tap');
      views.push({ t: +((Date.now() - t0) / 1000).toFixed(1), who, view: 'first person' });
      log(`${who}: first person`);
    } else {
      log(`${who}: skipped third-person switch at ${atSec}s (menu open)`);
    }
  }

  const left = deadline - Date.now();
  if (left > 0) await sleep(left);

  await Promise.all(filming);
  writeFileSync(path.join(out, 'views.json'), JSON.stringify(views, null, 2));
  polling = false;

  log('Disconnecting ReplayMod Camera so it saves the .mcpr recording...');
  log(`kick: ${await srvCmd('kick', 'Camera', 'Recording finished')}`);
  await sleep(10000);

  // Copy newest .mcpr recording into out/recording.mcpr
  const recDir = path.join(process.env.APPDATA, '.minecraft', 'replay_recordings');
  if (existsSync(recDir)) {
    const mcprs = readdirSync(recDir)
      .filter(f => f.endsWith('.mcpr'))
      .map(f => ({ name: f, full: path.join(recDir, f), mtime: statSync(path.join(recDir, f)).mtimeMs }))
      .filter(f => f.mtime >= mcStartWall)
      .sort((a, b) => b.mtime - a.mtime);
    if (mcprs.length > 0) {
      const destMcpr = path.join(out, 'recording.mcpr');
      copyFileSync(mcprs[0].full, destMcpr);
      log(`Saved ReplayMod recording: ${mcprs[0].name} -> ${destMcpr}`);
    } else {
      log('Warning: no new .mcpr found in .minecraft/replay_recordings after mcStartWall');
    }
  }

  for (const n of NAMES) {
    await ctl[n].send('quit');
    ctl[n].end();
  }
  execFileSync('powershell', ['-NoProfile', '-Command', 'Stop-Process -Name javaw -Force -ErrorAction SilentlyContinue']);
  srvProc.kill();
  log('run-hz-dry10-gemini: done');
  process.exit(0);
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
