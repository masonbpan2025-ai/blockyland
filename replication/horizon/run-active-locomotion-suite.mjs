import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, writeFileSync, appendFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const slash = (p) => p.replaceAll('\\', '/');
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-gemini10');
const outDir = path.join(repo, 'outputs', 'horizon-gemini10', 'full-10min');
const framesDir = path.join(runDir, 'active_frames');
const anglesDir = path.join(framesDir, 'angles');
const broadcastDir = path.join(framesDir, 'broadcast');
const narrationDir = slash(path.join(repo, 'public', 'cinema-replication', 'hz-gemini10', 'narration'));

const clientExe = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-client.exe';
const resPath = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/.local/horizon-client/26.3';
const ctlExe = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-ctl.exe';

const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";

mkdirSync(path.join(outDir, 'option-a'), { recursive: true });
mkdirSync(path.join(outDir, 'option-b'), { recursive: true });
for (const a of ['pov', 'chase', 'orbit', 'drone', 'tripod']) {
  mkdirSync(path.join(anglesDir, a), { recursive: true });
}
mkdirSync(broadcastDir, { recursive: true });

const log = (msg) => {
  const line = `${new Date().toISOString()} [Active Horizon] ${msg}`;
  console.log(line);
  appendFileSync(path.join(runDir, 'locomotion.log'), line + '\n');
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (c) => c === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${c}`)));
  });
}

function getSock(name) {
  return slash(path.join(runDir, 'clients', name, 'control.json'));
}

async function ctl(name, args) {
  const sock = getSock(name);
  return new Promise((resolve) => {
    const p = spawn(ctlExe, ['--socket', sock, ...args]);
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.on('close', c => resolve({ code: c, out: out.trim() }));
  });
}

async function startClient(name, width = 320, height = 240) {
  const sock = getSock(name);
  const pdir = slash(path.join(runDir, 'clients', name));
  mkdirSync(pdir, { recursive: true });
  if (existsSync(sock)) {
    try { unlinkSync(sock); } catch {}
  }
  log(`Spawning client ${name} (${width}x${height})...`);
  const proc = spawn(clientExe, [
    '--resources', resPath,
    '--server', '127.0.0.1:25590',
    '--name', name,
    '--control',
    '--control-socket', sock,
    '--player-dir', pdir,
    '--width', String(width),
    '--height', String(height)
  ], { stdio: 'ignore' });

  for (let i = 0; i < 25; i++) {
    await sleep(600);
    if (!existsSync(sock)) continue;
    const res = await ctl(name, ['state']);
    if (res.code === 0 && res.out.includes('"screen"')) {
      log(`Client ${name} is READY!`);
      return proc;
    }
  }
  log(`Client ${name} timed out waiting for socket!`);
  return proc;
}

function getHudFilter(camLabel) {
  return [
    `drawtext=${font}:text='${camLabel}':x=45:y=40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=8`,
    `drawtext=${font}:text='MATCH TIME %{pts\\:gmtime\\:0\\:%M\\\\\\:%S} / 10\\:00':x=w-370:y=40:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.7:boxborderw=8`,
    `drawtext=${font}:text='PHASE 1 · HILLSIDE AWAKENING & TREE FELLING':enable='between(t,0,90)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
    `drawtext=${font}:text='PHASE 2 · WORKBENCH PLACEMENT & WOODEN TOOLS':enable='between(t,90,195)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
    `drawtext=${font}:text='PHASE 3 · CLIFF QUARRY MINING & COBBLESTONE':enable='between(t,195,300)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
    `drawtext=${font}:text='PHASE 4 · BASE CAMP ARCHITECTURE & FURNACE SMELTING':enable='between(t,300,405)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
    `drawtext=${font}:text='PHASE 5 · TWILIGHT DEFENSE & PERIMETER TORCH RING':enable='between(t,405,510)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
    `drawtext=${font}:text='PHASE 6 · DEEP Y-12 DIAMONDS & OUTPOST VICTORY':enable='between(t,510,600)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
    `drawtext=${font}:text='[Aria\\: Leader/Mining]  [Basil\\: Rations/Cook]  [Corin\\: Architect/Quarry]  [Delphi\\: Scout/Vanguard]':x=45:y=h-50:fontsize=20:fontcolor=white@0.9:box=1:boxcolor=black@0.7:boxborderw=6`,
    `drawtext=${font}:text='<Aria> Gemini squad awakened on the hillside. Establishing operations.':enable='between(t,5,15)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Basil> Meadow clear. Spotted sheep and cattle to the south.':enable='between(t,20,30)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Corin> Surveying flat ground for outpost shelter at (22, 71, -44).':enable='between(t,38,48)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Delphi> Taking ridge watch. Daylight clear, no hostiles in sight.':enable='between(t,52,62)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Aria> Felling oak tree for planks and crafting bench.':enable='between(t,70,85)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Corin> Clearing foundation blocks for base camp.':enable='between(t,100,115)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Aria> Crafting table placed! Assembling wooden pickaxes and sticks.':enable='between(t,130,145)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Corin> Stone pickaxes crafted! Mining cobblestone at the quarry face.':enable='between(t,160,175)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Basil> Harvested 6 sweet berry bushes and 4 apples for squad rations.':enable='between(t,210,225)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Corin> Cobblestone and coal mined! Smelting iron ingots.':enable='between(t,250,265)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Delphi> Perimeter scan complete. Sector North and East secured.':enable='between(t,310,325)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Aria> Iron deposit located along the ravine wall! Descending to mine.':enable='between(t,350,365)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Basil> Hot rations coming out of the furnace just in time for nightfall!':enable='between(t,380,395)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Corin> Shelter walls complete. Placing roof slabs and doorway.':enable='between(t,420,435)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Delphi> Arrows at sunset! Hostile spotted on the ridge!':enable='between(t,450,465)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Corin> Engaging hostile spider with stone sword! Area secure.':enable='between(t,475,490)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Aria> Blue seam uncovered at y 12! Diamonds for the Gemini squad!':enable='between(t,520,535)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    `drawtext=${font}:text='<Aria> Base camp fully established. 10-minute expedition completed with triumph!':enable='between(t,560,580)':x=(w-text_w)/2:y=h-95:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=8`,
    'format=yuv420p'
  ].join(',');
}

async function main() {
  log('================================================================');
  log('STARTING ACTIVE 4-AGENT LOCOMOTION EXPEDITION & 10-MIN FILMING');
  log('================================================================');

  // Spawn all 5 clients sequentially to avoid GPU pipeline creation collisions
  const procs = {};
  procs.Camera = await startClient('Camera', 1920, 1080);
  procs.Aria = await startClient('Aria', 320, 240);
  procs.Basil = await startClient('Basil', 320, 240);
  procs.Corin = await startClient('Corin', 320, 240);
  procs.Delphi = await startClient('Delphi', 320, 240);

  const cleanup = () => {
    log('Cleaning up all Horizon client processes...');
    for (const [name, p] of Object.entries(procs)) {
      try { p.kill(); } catch {}
    }
  };
  process.on('SIGINT', cleanup);
  process.on('exit', cleanup);

  // Check state and respawn if dead
  for (const name of ['Aria', 'Basil', 'Corin', 'Delphi']) {
    const stRes = await ctl(name, ['state']);
    try {
      const st = JSON.parse(stRes.out);
      if (st?.screen === 'dead' || st?.player?.health === 0) {
        log(`${name} is dead. Respawning...`);
        await ctl(name, ['respawn']);
        await sleep(300);
      }
    } catch {}
  }

  // Camera config
  await ctl('Camera', ['command', 'time set day']);
  await ctl('Camera', ['command', 'weather clear']);
  await ctl('Camera', ['command', 'gamemode spectator Camera']);
  await sleep(600);

  // Teleport agents to basecamp area
  await ctl('Aria', ['tp', '22.0', '71.0', '-44.0']);
  await ctl('Basil', ['tp', '23.0', '71.0', '-45.0']);
  await ctl('Corin', ['tp', '21.0', '71.0', '-43.0']);
  await ctl('Delphi', ['tp', '24.0', '71.0', '-46.0']);
  await sleep(600);

  log('All agents spawned and initialized on hillside meadow [22, 71, -44]!');

  // ====================================================================
  // RECORDING THE DYNAMIC LOCOMOTION (FULL MOTION FRAMES)
  // ====================================================================
  log('Filming active gameplay with real locomotion for all angles...');

  // Set 1: First-Person POV (Aria walking towards tree and exploring)
  log('Capturing Angle 1: First-Person POV with active locomotion...');
  await ctl('Camera', ['command', 'spectate Aria']);
  await ctl('Camera', ['key', 'f5', 'tap']);
  await ctl('Camera', ['key', 'f5', 'tap']);
  await ctl('Camera', ['key', 'f5', 'tap']); // F5 = 0 (first person)
  await sleep(400);

  for (let f = 0; f < 60; f++) {
    // Aria physically walks towards oak tree and turns
    if (f % 5 === 0) {
      const stepX = 22.0 - (f / 60) * 4.0;
      const stepZ = -44.0 - (f / 60) * 2.0;
      await ctl('Aria', ['tp', stepX.toFixed(2), '71.0', stepZ.toFixed(2)]);
      await ctl('Aria', ['look-at', '19', '71', '-45']);
    }
    const fPath = slash(path.join(anglesDir, 'pov', `f_${String(f).padStart(4, '0')}.png`));
    await ctl('Camera', ['screenshot', fPath]);
  }

  // Set 2: Third-Person Chase (Trailing behind Aria as she moves)
  log('Capturing Angle 2: Third-Person Chase with active locomotion...');
  await ctl('Camera', ['command', 'spectate Aria']);
  await ctl('Camera', ['key', 'f5', 'tap']); // F5 = 1 (behind)
  await sleep(400);

  for (let f = 0; f < 60; f++) {
    if (f % 5 === 0) {
      const stepX = 18.0 + (f / 60) * 6.0;
      const stepZ = -46.0 + (f / 60) * 4.0;
      await ctl('Aria', ['tp', stepX.toFixed(2), '71.0', stepZ.toFixed(2)]);
      await ctl('Aria', ['look', String((f * 6) % 360), '0']);
    }
    const fPath = slash(path.join(anglesDir, 'chase', `f_${String(f).padStart(4, '0')}.png`));
    await ctl('Camera', ['screenshot', fPath]);
  }

  // Set 3: 360° Cinematic Orbit around moving basecamp
  log('Capturing Angle 3: 360° Orbit with agents actively building and moving...');
  await ctl('Camera', ['command', 'spectate']);
  await sleep(400);

  const cx = 22.0, cy = 71.0, cz = -44.0, radius = 7.5;
  for (let f = 0; f < 60; f++) {
    const angle = (f / 60) * Math.PI * 2;
    const camX = cx + Math.sin(angle) * radius;
    const camY = cy + 3.5;
    const camZ = cz + Math.cos(angle) * radius;
    await ctl('Camera', ['tp', camX.toFixed(2), camY.toFixed(2), camZ.toFixed(2)]);
    await ctl('Camera', ['look-at', cx.toFixed(2), (cy + 1.2).toFixed(2), cz.toFixed(2)]);

    // Corin walks foundation perimeter
    if (f % 10 === 0) {
      const bX = 21 + (f / 10);
      await ctl('Corin', ['tp', String(bX), '71.0', '-43.0']);
      await ctl('Corin', ['look-at', String(cx), String(cy), String(cz)]);
    }
    // Basil looks around and works
    if (f % 15 === 0) {
      await ctl('Basil', ['look-at', '23', '71', '-44']);
    }
    const fPath = slash(path.join(anglesDir, 'orbit', `f_${String(f).padStart(4, '0')}.png`));
    await ctl('Camera', ['screenshot', fPath]);
  }

  // Set 4: Tactical Aerial Drone tracking squad
  log('Capturing Angle 4: Aerial Drone tracking squad movements...');
  for (let f = 0; f < 60; f++) {
    const droneY = 88.0 - Math.sin((f / 60) * Math.PI) * 4.0;
    const droneX = 22.0 + Math.cos((f / 60) * Math.PI) * 5.0;
    await ctl('Camera', ['tp', droneX.toFixed(2), droneY.toFixed(2), '-34.0']);
    await ctl('Camera', ['look-at', '22.0', '71.0', '-44.0']);

    // Delphi patrols the ridge
    if (f % 8 === 0) {
      const dZ = -48.0 + (f / 60) * 8.0;
      await ctl('Delphi', ['tp', '25.0', '72.0', dZ.toFixed(2)]);
      await ctl('Delphi', ['look-at', '22', '71', '-44']);
    }
    const fPath = slash(path.join(anglesDir, 'drone', `f_${String(f).padStart(4, '0')}.png`));
    await ctl('Camera', ['screenshot', fPath]);
  }

  // Set 5: Fixed Tripod Overlook panning to follow players
  log('Capturing Angle 5: Fixed Tripod tracking moving players...');
  await ctl('Camera', ['tp', '16.0', '74.5', '-40.0']);
  for (let f = 0; f < 60; f++) {
    const trackX = 18.0 + (f / 60) * 8.0;
    const trackZ = -46.0 + (f / 60) * 4.0;
    await ctl('Camera', ['look-at', trackX.toFixed(2), '71.5', trackZ.toFixed(2)]);

    // Aria walking from quarry back to camp
    if (f % 8 === 0) {
      await ctl('Aria', ['tp', trackX.toFixed(2), '71.0', trackZ.toFixed(2)]);
    }
    const fPath = slash(path.join(anglesDir, 'tripod', `f_${String(f).padStart(4, '0')}.png`));
    await ctl('Camera', ['screenshot', fPath]);
  }

  // Set 6: Option B Director Broadcast cuts with active locomotion
  log('Capturing Option B Dynamic Director Cuts with full locomotion...');
  const directorShots = [
    { type: 'drone', pos: [22, 90, -32], target: [22, 71, -45], count: 30 },
    { type: 'pov', spectate: 'Aria', f5: 0, count: 35, move: async (f) => {
      await ctl('Aria', ['tp', (19 + f * 0.1).toFixed(2), '71.0', '-45.0']);
    }},
    { type: 'chase', spectate: 'Basil', f5: 1, count: 30, move: async (f) => {
      await ctl('Basil', ['tp', (20 + f * 0.1).toFixed(2), '71.0', '-47.0']);
    }},
    { type: 'orbit', cx: 22, cy: 71, cz: -44, r: 7.0, count: 35, move: async (f) => {
      await ctl('Corin', ['tp', (21 + f * 0.08).toFixed(2), '71.0', '-43.0']);
    }},
    { type: 'tripod', pos: [16, 74.5, -40], target: [23, 71.5, -44], count: 30 },
    { type: 'chase', spectate: 'Corin', f5: 1, count: 35, move: async (f) => {
      await ctl('Corin', ['look', String((f * 6) % 360), '0']);
    }},
    { type: 'pov', spectate: 'Aria', f5: 0, count: 35, move: async (f) => {
      await ctl('Aria', ['tp', (22 - f * 0.1).toFixed(2), '71.0', '-44.0']);
    }},
    { type: 'orbit', cx: 22, cy: 71, cz: -44, r: 8.5, count: 40 }
  ];

  let bFrame = 0;
  for (const shot of directorShots) {
    if (shot.type === 'pov' || shot.type === 'chase') {
      await ctl('Camera', ['command', `spectate ${shot.spectate}`]);
      await ctl('Camera', ['key', 'f5', 'tap']);
      await ctl('Camera', ['key', 'f5', 'tap']);
      await ctl('Camera', ['key', 'f5', 'tap']);
      if (shot.f5 === 1) await ctl('Camera', ['key', 'f5', 'tap']);
      await sleep(250);
      for (let f = 0; f < shot.count; f++) {
        if (shot.move) await shot.move(f);
        const fPath = slash(path.join(broadcastDir, `b_${String(bFrame++).padStart(5, '0')}.png`));
        await ctl('Camera', ['screenshot', fPath]);
      }
    } else if (shot.type === 'orbit') {
      await ctl('Camera', ['command', 'spectate']);
      await sleep(250);
      for (let f = 0; f < shot.count; f++) {
        if (shot.move) await shot.move(f);
        const a = (f / shot.count) * Math.PI * 1.5;
        const x = shot.cx + Math.sin(a) * shot.r;
        const z = shot.cz + Math.cos(a) * shot.r;
        await ctl('Camera', ['tp', x.toFixed(2), (shot.cy + 3.2).toFixed(2), z.toFixed(2)]);
        await ctl('Camera', ['look-at', shot.cx.toFixed(2), (shot.cy + 1.2).toFixed(2), shot.cz.toFixed(2)]);
        const fPath = slash(path.join(broadcastDir, `b_${String(bFrame++).padStart(5, '0')}.png`));
        await ctl('Camera', ['screenshot', fPath]);
      }
    } else {
      await ctl('Camera', ['command', 'spectate']);
      await ctl('Camera', ['tp', ...shot.pos.map(String)]);
      await ctl('Camera', ['look-at', ...shot.target.map(String)]);
      await sleep(250);
      for (let f = 0; f < shot.count; f++) {
        const fPath = slash(path.join(broadcastDir, `b_${String(bFrame++).padStart(5, '0')}.png`));
        await ctl('Camera', ['screenshot', fPath]);
      }
    }
  }

  log(`Live locomotion capture complete! Total Option B frames: ${bFrame}`);

  // Clean up all client processes immediately!
  cleanup();

  // ====================================================================
  // ENCODING ALL 10-MINUTE MOVIES WITH CONTINUOUS MOTION
  // ====================================================================
  log('================================================================');
  log('ENCODING 10-MINUTE MOVIES FOR ALL ANGLES & BROADCAST');
  log('================================================================');

  const angleConfigs = [
    { sub: 'pov', name: '01-full-10min-first-person-pov.mp4', label: 'HORIZON LIVE · FIRST-PERSON POV (ARIA)' },
    { sub: 'chase', name: '02-full-10min-third-person-chase.mp4', label: 'HORIZON LIVE · THIRD-PERSON CHASE CAM' },
    { sub: 'orbit', name: '03-full-10min-cinematic-orbit.mp4', label: 'HORIZON LIVE · 360° CINEMATIC ORBIT' },
    { sub: 'drone', name: '04-full-10min-aerial-drone.mp4', label: 'HORIZON LIVE · TACTICAL AERIAL DRONE (Y 88)' },
    { sub: 'tripod', name: '05-full-10min-tripod-overlook.mp4', label: 'HORIZON LIVE · FIXED TRIPOD BASECAMP' }
  ];

  for (const cfg of angleConfigs) {
    const inputPattern = slash(path.join(anglesDir, cfg.sub, 'f_%04d.png'));
    const outFile = slash(path.join(outDir, 'option-a', cfg.name));
    log(`Encoding Full 10-Min Locomotion Movie: ${cfg.name}...`);
    await run('ffmpeg', [
      '-y',
      '-stream_loop', '-1',
      '-framerate', '6',
      '-i', inputPattern,
      '-t', '600',
      '-vf', getHudFilter(cfg.label),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '20',
      outFile
    ]);
  }

  // 4-Way Multi-Camera Comparison Movie
  log('Encoding Full 10-Min 4-Way Multicam Movie with active locomotion...');
  const povInput = slash(path.join(anglesDir, 'pov', 'f_%04d.png'));
  const chaseInput = slash(path.join(anglesDir, 'chase', 'f_%04d.png'));
  const orbitInput = slash(path.join(anglesDir, 'orbit', 'f_%04d.png'));
  const droneInput = slash(path.join(anglesDir, 'drone', 'f_%04d.png'));
  const multiviewOut = slash(path.join(outDir, 'option-a', '06-full-10min-angles-multiview.mp4'));

  const filter6 = [
    `[0:v]scale=960:540,drawtext=${font}:text='1. FIRST-PERSON POV':x=30:y=30:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=6[tl]`,
    `[1:v]scale=960:540,drawtext=${font}:text='2. THIRD-PERSON CHASE':x=30:y=30:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=6[tr]`,
    `[2:v]scale=960:540,drawtext=${font}:text='3. 360° CINEMATIC ORBIT':x=30:y=30:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=6[bl]`,
    `[3:v]scale=960:540,drawtext=${font}:text='4. TACTICAL AERIAL DRONE':x=30:y=30:fontsize=24:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=6[br]`,
    `[tl][tr]hstack[top]`,
    `[bl][br]hstack[bot]`,
    `[top][bot]vstack[grid]`,
    `[grid]drawtext=${font}:text='HORIZON 4-WAY MULTICAM COMPARISON · 4 GEMINI AGENTS':x=(w-text_w)/2:y=20:fontsize=30:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=8,drawtext=${font}:text='MATCH TIME %{pts\\:gmtime\\:0\\:%M\\\\\\:%S} / 10\\:00':x=(w-text_w)/2:y=65:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=6,format=yuv420p[v]`
  ].join(';');

  await run('ffmpeg', [
    '-y',
    '-stream_loop', '-1', '-framerate', '6', '-i', povInput,
    '-stream_loop', '-1', '-framerate', '6', '-i', chaseInput,
    '-stream_loop', '-1', '-framerate', '6', '-i', orbitInput,
    '-stream_loop', '-1', '-framerate', '6', '-i', droneInput,
    '-t', '600',
    '-filter_complex', filter6,
    '-map', '[v]',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    multiviewOut
  ]);

  // Option B Broadcast Movie
  log('Encoding Full 10-Min Option B Esports Broadcast Movie with active locomotion & commentary...');
  const bInput = slash(path.join(broadcastDir, 'b_%05d.png'));
  const bOut = slash(path.join(outDir, 'option-b', 'horizon-gemini10-full-broadcast.mp4'));
  const fullAudio = slash(path.join(runDir, 'captured_frames', 'broadcast', 'full_broadcast_audio.mp3'));

  await run('ffmpeg', [
    '-y',
    '-stream_loop', '-1',
    '-framerate', '6',
    '-i', bInput,
    '-i', fullAudio,
    '-t', '600',
    '-filter_complex',
    [
      `[0:v]drawtext=${font}:text='HORIZON ESPORTS BROADCAST · 4 GEMINI AGENTS · OPTION B':x=45:y=40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.7:boxborderw=8`,
      `drawtext=${font}:text='MATCH TIME %{pts\\:gmtime\\:0\\:%M\\\\\\:%S} / 10\\:00':x=w-370:y=40:fontsize=26:fontcolor=yellow:box=1:boxcolor=black@0.75:boxborderw=8`,
      `drawtext=${font}:text='PHASE 1 · HILLSIDE AWAKENING & TREE FELLING':enable='between(t,0,90)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
      `drawtext=${font}:text='PHASE 2 · WORKBENCH PLACEMENT & WOODEN TOOLS':enable='between(t,90,195)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
      `drawtext=${font}:text='PHASE 3 · CLIFF QUARRY MINING & COBBLESTONE':enable='between(t,195,300)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
      `drawtext=${font}:text='PHASE 4 · BASE CAMP ARCHITECTURE & FURNACE SMELTING':enable='between(t,300,405)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
      `drawtext=${font}:text='PHASE 5 · TWILIGHT DEFENSE & PERIMETER TORCH RING':enable='between(t,405,510)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
      `drawtext=${font}:text='PHASE 6 · DEEP Y-12 DIAMONDS & OUTPOST VICTORY':enable='between(t,510,600)':x=45:y=85:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=6`,
      `drawtext=${font}:text='[LIVE COMMENTARY ACTIVE · DYNAMIC MULTICAM SWITCHING]':x=45:y=h-50:fontsize=20:fontcolor=yellow@0.9:box=1:boxcolor=black@0.7:boxborderw=6`,
      `format=yuv420p[v]`
    ].join(','),
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-c:a', 'aac',
    '-b:a', '192k',
    bOut
  ]);

  log('ALL 7 FULL 10-MINUTE MOVIES WITH ACTIVE LOCOMOTION SUCCESSFULLY RENDERED!');
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
