#!/usr/bin/env node
// Unified 10-minute (600 s) Horizon server, 4-client launcher, window arranger, and 30 fps live recorder
// for 4 Gemini agents (Aria, Basil, Corin, Delphi) playing real Minecraft 26.3 in Horizon.

import { spawn, execFileSync, execFile } from 'node:child_process';
import readline from 'node:readline';
import { mkdirSync, appendFileSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const seconds = Number(arg('seconds', 600));
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-gemini4');
const serverDir = path.join(runDir, 'server');
const out = path.join(runDir, 'film');
mkdirSync(out, { recursive: true });

const H_DIR = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981';
const exe = path.join(H_DIR, 'horizon-ctl.exe');
const srvExe = path.join(H_DIR, 'horizon-server.exe');
const NAMES = ['Aria', 'Basil', 'Corin', 'Delphi'];
const PORT = 25595;

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
[DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
'@
[Win32.Wnd]::SetProcessDPIAware() | Out-Null
$proc = Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($proc -and $proc.MainWindowHandle -ne 0) {
  $h = $proc.MainWindowHandle
  [Win32.Wnd]::ShowWindow($h, 9) | Out-Null
  [Win32.Wnd]::SetWindowText($h, '${title}') | Out-Null
  [Win32.Wnd]::SetWindowPos($h, [IntPtr]::Zero, ${x}, ${y}, 940, 500, 0x0040) | Out-Null
  Write-Output "OK"
}
`;
  return execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString().trim();
}

async function main() {
  log('1. Starting dedicated Horizon server on 127.0.0.1:25595...');
  const srvProc = spawn(srvExe, ['--dir', serverDir, 'run'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    try {
      const st = execFileSync(srvExe, ['--dir', serverDir, 'status']).toString();
      if (st.includes('Running')) {
        log(`Server ready: ${st.trim().replace(/\s+/g, ' ')}`);
        break;
      }
    } catch {}
  }

  const baseOptsPath = path.join(repo, 'replication', 'runs', 'hz-film', 'clients', 'Aria', 'options.txt');
  const baseOpts = readFileSync(baseOptsPath, 'utf8')
    .replace(/tutorialStep:\w+/, 'tutorialStep:none')
    .replace(/pauseOnLostFocus:\w+/, 'pauseOnLostFocus:false')
    .replace(/onboardAccessibility:\w+/, 'onboardAccessibility:false')
    .replace(/skipMultiplayerWarning:\w+/, 'skipMultiplayerWarning:true')
    .replace(/renderDistance:\d+/, 'renderDistance:5');

  const grid = [
    { name: 'Aria', x: 0, y: 0 },
    { name: 'Basil', x: 960, y: 0 },
    { name: 'Corin', x: 0, y: 510 },
    { name: 'Delphi', x: 960, y: 510 }
  ];

  log('2. Launching 4 Horizon clients and arranging 2x2 windows...');
  for (const g of grid) {
    const pdir = path.join(runDir, 'clients', g.name);
    mkdirSync(pdir, { recursive: true });
    writeFileSync(path.join(pdir, 'options.txt'), baseOpts);
    const sock = path.join(pdir, 'control.json');

    const beforePids = new Set(getClientPids());
    execFileSync(exe, [
      '--socket', sock, 'launch', '--wait',
      '--server', `127.0.0.1:${PORT}`, '--name', g.name,
      '--width', '600', '--height', '300', '--render-distance', '5',
      '--player-dir', pdir
    ], { stdio: 'pipe', timeout: 120000 });

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
    if (st?.screen) {
      await ctl[n].send('close');
    }
    log(`${n} initial state: pos=${JSON.stringify(st?.player?.position)} hp=${st?.player?.health}`);
  }

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

        if (tick % 2 === 0) {
          const st = await ctl[n].json('state');
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
              held: st.player.held_item,
              screen: st.screen?.title || st.screen?.kind || null
            }) + '\n');
          }
        }
      }
      await sleep(2000);
    }
  })();

  const SCHEDULE = [
    [75, 'Aria'],
    [165, 'Basil'],
    [255, 'Corin'],
    [345, 'Delphi'],
    [435, 'Aria'],
    [515, 'Corin']
  ];

  const t0 = Date.now();
  const views = [];
  writeFileSync(path.join(out, 'run-meta.json'), JSON.stringify({ startWall: t0, seconds, names: NAMES }, null, 2));

  log(`READY FOR AGENTS: starting ${seconds}s 4-window capture for ${NAMES.join(', ')}`);
  const filming = NAMES.map(n => film(n, seconds));
  const deadline = t0 + seconds * 1000;

  for (const [atSec, who] of SCHEDULE) {
    const wait = t0 + atSec * 1000 - Date.now();
    if (wait > 0) await sleep(wait);
    if (Date.now() > deadline - 30000) break;

    const st = await ctl[who].json('state');
    const hasScreen = Boolean(st?.screen);
    if (!hasScreen) {
      await ctl[who].send('key f5 tap');
      views.push({ t: +((Date.now() - t0) / 1000).toFixed(1), who, view: 'third person behind' });
      log(`${who}: third person behind`);
      await sleep(14000);
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
  await sleep(2500);
  for (const n of NAMES) {
    await ctl[n].send('quit');
    ctl[n].end();
  }
  srvProc.kill();
  log('film-gemini4: done');
  process.exit(0);
}

main().catch(err => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
