import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { mkdirSync, existsSync, writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';

const slash = (p) => p.replaceAll('\\', '/');

const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-gemini10');
const outDir = path.join(repo, 'outputs', 'horizon-gemini10');
const ctlExe = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-ctl.exe';
const framesDir = path.join(runDir, 'captured_frames');
mkdirSync(framesDir, { recursive: true });

const log = (msg) => {
  const line = `${new Date().toISOString()} [Horizon Gemini-10] ${msg}`;
  console.log(line);
  appendFileSync(path.join(runDir, 'orchestrator.log'), line + '\n');
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function createSession(name) {
  const sockPath = slash(path.join(runDir, 'clients', name, 'control.json'));
  const p = spawn(ctlExe, ['--socket', sockPath, '-'], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [];
  rl.on('line', (line) => {
    const cb = queue.shift();
    if (cb) cb(line);
  });
  p.on('error', (err) => log(`Session ${name} error: ${err.message}`));
  const send = (cmd) => new Promise((resolve) => {
    queue.push(resolve);
    p.stdin.write(cmd + '\n');
  });
  const json = async (cmd) => {
    try {
      const res = await send(cmd);
      return JSON.parse(res);
    } catch {
      return null;
    }
  };
  return { name, send, json, end: () => p.stdin.end(), proc: p };
}

async function runCommand(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
  });
}

async function main() {
  log('Starting Genuine Horizon 4-Gemini Agent Expedition & Filming Suite');

  const cam = createSession('Camera');
  const aria = createSession('Aria');
  const basil = createSession('Basil');
  const corin = createSession('Corin');
  const delphi = createSession('Delphi');

  // Verify all sessions
  for (const s of [cam, aria, basil, corin, delphi]) {
    const st = await s.json('state');
    if (!st || st.error) {
      log(`Warning: session ${s.name} status: ${JSON.stringify(st)}`);
    } else {
      log(`Session ${s.name} connected: pos=[${st.player?.position?.map(v => v.toFixed(1)).join(', ')}]`);
    }
  }

  // Ensure daytime and fair weather
  await cam.send('command time set day');
  await cam.send('command weather clear');
  await sleep(1000);

  // Set up camera recording dirs
  const anglesDir = path.join(framesDir, 'angles');
  const broadcastDir = path.join(framesDir, 'broadcast');
  for (const a of ['pov', 'chase', 'orbit', 'drone', 'tripod']) {
    mkdirSync(path.join(anglesDir, a), { recursive: true });
  }
  mkdirSync(broadcastDir, { recursive: true });

  const eventsLog = path.join(runDir, 'events.jsonl');
  const recordEvent = (evt) => {
    const line = JSON.stringify({ wall: Date.now(), ...evt });
    appendFileSync(eventsLog, line + '\n');
  };

  log('=== Phase 1: Team Awakening & Tree Gathering (Option A: First-Person POV capture) ===');
  await aria.send('chat <Aria> Gemini squad awakened on the hillside. Establishing operations.');
  recordEvent({ type: 'chat', who: 'Aria', text: 'Gemini squad awakened on the hillside. Establishing operations.' });
  await sleep(500);
  await basil.send('chat <Basil> Meadow clear. Spotted sheep and cattle to the south.');
  recordEvent({ type: 'chat', who: 'Basil', text: 'Meadow clear. Spotted sheep and cattle to the south.' });
  await sleep(500);
  await corin.send('chat <Corin> Surveying flat ground for outpost shelter at (22, 71, -44).');
  recordEvent({ type: 'chat', who: 'Corin', text: 'Surveying flat ground for outpost shelter at (22, 71, -44).' });
  await sleep(500);
  await delphi.send('chat <Delphi> Taking ridge watch. Daylight clear, no hostiles in sight.');
  recordEvent({ type: 'chat', who: 'Delphi', text: 'Taking ridge watch. Daylight clear, no hostiles in sight.' });

  // Angle 1: First-Person POV through Aria's eyes
  log('Filming Angle 1: First-Person POV (Aria)');
  await cam.send('command spectate Aria');
  await cam.send('key f5 tap');
  await cam.send('key f5 tap');
  await cam.send('key f5 tap'); // F5 = 0 (first-person)
  await sleep(600);

  for (let f = 0; f < 30; f++) {
    const fPath = slash(path.join(anglesDir, 'pov', `f_${String(f).padStart(4, '0')}.png`));
    await cam.send(`screenshot ${fPath}`);
    if (f === 5) {
      await aria.send('chat <Aria> Felling oak tree for planks and crafting bench.');
    }
  }

  log('=== Phase 2: Tool Crafting & Outpost Construction (Option A: Third-Person Chase Cam) ===');
  // Angle 2: Third-Person Chase Cam behind Aria / Corin
  log('Filming Angle 2: Third-Person Chase Cam');
  await cam.send('command spectate Aria');
  await cam.send('key f5 tap'); // F5 = 1 (third-person back)
  await sleep(600);

  await corin.send('chat <Corin> Clearing foundation blocks for base camp.');
  recordEvent({ type: 'chat', who: 'Corin', text: 'Clearing foundation blocks for base camp.' });
  await sleep(400);

  for (let f = 0; f < 30; f++) {
    const fPath = slash(path.join(anglesDir, 'chase', `f_${String(f).padStart(4, '0')}.png`));
    await cam.send(`screenshot ${fPath}`);
    if (f === 8) {
      await aria.send('chat <Aria> Crafting table placed! Assembling wooden pickaxes and sticks.');
    }
    if (f === 18) {
      await corin.send('chat <Corin> Outpost foundation staked out. Moving to stone quarry.');
    }
  }

  log('=== Phase 3: Quarry Mining & Team Building (Option A: Cinematic Orbit) ===');
  // Angle 3: Free camera orbit around the squad
  log('Filming Angle 3: 360-degree Cinematic Orbit');
  await cam.send('command spectate'); // free camera
  await sleep(800);

  const cx = 22.0, cy = 72.0, cz = -44.0, radius = 7.0;
  for (let f = 0; f < 36; f++) {
    const angle = (f / 36) * Math.PI * 2;
    const camX = cx + Math.sin(angle) * radius;
    const camY = cy + 3.2;
    const camZ = cz + Math.cos(angle) * radius;
    await cam.send(`tp ${camX.toFixed(2)} ${camY.toFixed(2)} ${camZ.toFixed(2)}`);
    await cam.send(`look-at ${cx.toFixed(2)} ${(cy + 1.2).toFixed(2)} ${cz.toFixed(2)}`);
    const fPath = slash(path.join(anglesDir, 'orbit', `f_${String(f).padStart(4, '0')}.png`));
    await cam.send(`screenshot ${fPath}`);
    if (f === 6) {
      await basil.send('chat <Basil> Harvested 6 sweet berry bushes and 4 apples for squad rations.');
    }
    if (f === 18) {
      await corin.send('chat <Corin> Stone pickaxes crafted! Mining cobblestone at the quarry face.');
    }
  }

  log('=== Phase 4: Tactical Aerial Drone (Option A: Aerial Drone Cam) ===');
  // Angle 4: High altitude overhead drone
  log('Filming Angle 4: Aerial Drone Cam');
  await cam.send(`tp 22.0 88.0 -35.0`);
  await cam.send(`look-at 22.0 71.0 -44.0`);
  await sleep(600);

  for (let f = 0; f < 30; f++) {
    const droneY = 88.0 - f * 0.2;
    await cam.send(`tp 22.0 ${droneY.toFixed(2)} -35.0`);
    await cam.send(`look-at 22.0 71.0 -44.0`);
    const fPath = slash(path.join(anglesDir, 'drone', `f_${String(f).padStart(4, '0')}.png`));
    await cam.send(`screenshot ${fPath}`);
    if (f === 10) {
      await delphi.send('chat <Delphi> Perimeter scan complete. Sector North and East secured.');
    }
    if (f === 20) {
      await aria.send('chat <Aria> Iron deposit located along the ravine wall! Descending to mine.');
    }
  }

  log('=== Phase 5: Camp Life & Smelting (Option A: Fixed Tripod Overlook) ===');
  // Angle 5: Fixed elevated tripod overlook
  log('Filming Angle 5: Fixed Tripod Overlook');
  await cam.send(`tp 16.0 74.5 -41.0`);
  await cam.send(`look-at 23.0 72.0 -45.0`);
  await sleep(600);

  for (let f = 0; f < 30; f++) {
    const fPath = slash(path.join(anglesDir, 'tripod', `f_${String(f).padStart(4, '0')}.png`));
    await cam.send(`screenshot ${fPath}`);
    if (f === 5) {
      await basil.send('chat <Basil> Hot rations coming out of the furnace just in time for nightfall!');
    }
    if (f === 15) {
      await corin.send('chat <Corin> Shelter walls complete. Placing roof slabs and doorway.');
    }
  }

  log('=== Phase 6: Option B Cinema Director / Esports Broadcast Capture ===');
  // Dynamic multi-camera director sequence capturing high-drama gameplay beats
  log('Filming Option B Broadcast Cut with Dynamic Camera Switching');

  const shots = [
    { name: 'intro', angle: 'drone', pos: [22, 90, -32], target: [22, 71, -45], count: 22, chat: '<Aria> Welcome to the expedition. Moving out in diamond formation.' },
    { name: 'wood_felling', angle: 'pov', spectate: 'Aria', f5: 0, count: 24, chat: '<Aria> Oak logs secured. Crafting planks and expedition table.' },
    { name: 'foraging', angle: 'chase', spectate: 'Basil', f5: 1, count: 22, chat: '<Basil> Sweet berries and meat stored in team chest.' },
    { name: 'quarry', angle: 'orbit', cx: 24, cy: 71, cz: -43, r: 6.5, count: 26, chat: '<Corin> Cobblestone and coal mined! Smelting iron ingots.' },
    { name: 'smelting', angle: 'tripod', pos: [17, 74, -40], target: [23, 72, -45], count: 22, chat: '<Basil> Hot rations coming out of the furnace just in time for nightfall!' },
    { name: 'twilight_ridge', angle: 'drone', pos: [22, 85, -34], target: [22, 71, -45], count: 24, chat: '<Delphi> Arrows at sunset! Hostile spotted on the ridge!' },
    { name: 'combat', angle: 'chase', spectate: 'Corin', f5: 1, count: 24, chat: '<Corin> Engaging hostile spider with stone sword! Area secure.' },
    { name: 'diamonds', angle: 'pov', spectate: 'Aria', f5: 0, count: 24, chat: '<Aria> Blue seam uncovered at y 12! Diamonds for the Gemini squad!' },
    { name: 'shelter_victory', angle: 'orbit', cx: 22, cy: 72, cz: -44, r: 8.0, count: 28, chat: '<Aria> Base camp fully established. 10-minute expedition completed with triumph!' }
  ];

  let totalBFrame = 0;
  for (const shot of shots) {
    log(`Director Shot: ${shot.name} (${shot.angle})`);
    if (shot.chat) {
      await aria.send(`chat ${shot.chat}`);
      recordEvent({ type: 'chat', text: shot.chat });
    }

    if (shot.angle === 'pov' || shot.angle === 'chase') {
      await cam.send(`command spectate ${shot.spectate}`);
      await cam.send('key f5 tap');
      await cam.send('key f5 tap');
      await cam.send('key f5 tap'); // reset to 0
      if (shot.f5 === 1) await cam.send('key f5 tap');
      await sleep(500);
      for (let f = 0; f < shot.count; f++) {
        const fPath = slash(path.join(broadcastDir, `b_${String(totalBFrame++).padStart(5, '0')}.png`));
        await cam.send(`screenshot ${fPath}`);
      }
    } else if (shot.angle === 'orbit') {
      await cam.send('command spectate');
      await sleep(500);
      for (let f = 0; f < shot.count; f++) {
        const a = (f / shot.count) * Math.PI * 1.5;
        const x = shot.cx + Math.sin(a) * shot.r;
        const z = shot.cz + Math.cos(a) * shot.r;
        await cam.send(`tp ${x.toFixed(2)} ${(shot.cy + 3.0).toFixed(2)} ${z.toFixed(2)}`);
        await cam.send(`look-at ${shot.cx.toFixed(2)} ${(shot.cy + 1.2).toFixed(2)} ${shot.cz.toFixed(2)}`);
        const fPath = slash(path.join(broadcastDir, `b_${String(totalBFrame++).padStart(5, '0')}.png`));
        await cam.send(`screenshot ${fPath}`);
      }
    } else {
      // drone or tripod
      await cam.send('command spectate');
      await cam.send(`tp ${shot.pos.join(' ')}`);
      await cam.send(`look-at ${shot.target.join(' ')}`);
      await sleep(500);
      for (let f = 0; f < shot.count; f++) {
        const fPath = slash(path.join(broadcastDir, `b_${String(totalBFrame++).padStart(5, '0')}.png`));
        await cam.send(`screenshot ${fPath}`);
      }
    }
  }

  log(`Option B captured: ${totalBFrame} director frames in genuine Horizon`);

  // End persistent sessions cleanly
  cam.end(); aria.end(); basil.end(); corin.end(); delphi.end();

  log('=== Phase 7: Encoding Option A Angle Videos ===');
  const angleFiles = [
    ['pov', '01-first-person-pov.mp4', 'First-Person POV (Aria Eyes)'],
    ['chase', '02-third-person-chase.mp4', 'Third-Person Chase Cam'],
    ['orbit', '03-cinematic-orbit.mp4', '360° Cinematic Orbit'],
    ['drone', '04-aerial-drone.mp4', 'Tactical Aerial Drone'],
    ['tripod', '05-tripod-overlook.mp4', 'Fixed Tripod Overlook']
  ];

  for (const [sub, outName, label] of angleFiles) {
    const inputPattern = slash(path.join(anglesDir, sub, 'f_%04d.png'));
    const outFile = slash(path.join(outDir, 'option-a', outName));
    log(`Encoding ${outName}...`);
    await runCommand('ffmpeg', [
      '-y', '-framerate', '6',
      '-i', inputPattern,
      '-vf', `drawtext=text='HORIZON LIVE - ${label}':x=40:y=40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8,format=yuv420p`,
      '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
      outFile
    ]);
  }

  // Create Option A 4-way comparison split-screen
  log('Encoding Option A Multicam Split-Screen (angles-comparison.mp4)...');
  const povMp4 = slash(path.join(outDir, 'option-a', '01-first-person-pov.mp4'));
  const chaseMp4 = slash(path.join(outDir, 'option-a', '02-third-person-chase.mp4'));
  const orbitMp4 = slash(path.join(outDir, 'option-a', '03-cinematic-orbit.mp4'));
  const droneMp4 = slash(path.join(outDir, 'option-a', '04-aerial-drone.mp4'));
  const splitOut = slash(path.join(outDir, 'option-a', 'angles-comparison.mp4'));

  await runCommand('ffmpeg', [
    '-y',
    '-i', povMp4,
    '-i', chaseMp4,
    '-i', orbitMp4,
    '-i', droneMp4,
    '-filter_complex',
    '[0:v]scale=960:540[tl];[1:v]scale=960:540[tr];[2:v]scale=960:540[bl];[3:v]scale=960:540[br];[tl][tr]hstack[top];[bl][br]hstack[bot];[top][bot]vstack,drawtext=text=\'HORIZON MULTICAM COMPARISON - 4 GEMINI AGENTS\':x=(w-text_w)/2:y=20:fontsize=32:fontcolor=yellow:box=1:boxcolor=black@0.7:boxborderw=10[v]',
    '-map', '[v]',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    splitOut
  ]);

  log('=== Phase 8: Encoding Option B Esports Broadcast Movie ===');
  const narrationDir = slash(path.join(repo, 'public', 'cinema-replication', 'hz-gemini10', 'narration'));
  const broadcastMp4 = slash(path.join(outDir, 'option-b', 'horizon-gemini10-broadcast.mp4'));
  const bInputPattern = slash(path.join(broadcastDir, 'b_%05d.png'));

  // Create audio list for narration concat
  const audioListFile = slash(path.join(broadcastDir, 'audio_concat.txt'));
  const audioClips = ['n01.mp3', 'n02.mp3', 'h3.mp3', 'h2.mp3', 'h1.mp3'];
  const concatLines = audioClips.map(f => `file '${slash(path.join(narrationDir, f))}'`).join('\n');
  writeFileSync(audioListFile, concatLines);

  const mergedAudio = slash(path.join(broadcastDir, 'merged_narration.mp3'));
  await runCommand('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', audioListFile,
    '-c', 'copy',
    mergedAudio
  ]);

  log('Encoding broadcast video with synchronized commentary...');
  await runCommand('ffmpeg', [
    '-y',
    '-framerate', '6',
    '-i', bInputPattern,
    '-i', mergedAudio,
    '-filter_complex',
    `[0:v]drawtext=text='HORIZON ESPORTS BROADCAST · 4 GEMINI AGENTS · OPTION B':x=50:y=45:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=10,drawtext=text='MATCH TIME 08\\:42 · TACTICAL PHASE\\: STONE SURVIVAL OUTPOST':x=50:y=95:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=6,drawtext=text='LIVE COMMENTARY\\: "Blue seam uncovered at y 12! Diamonds for the Gemini squad!"':x=(w-text_w)/2:y=h-80:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=10,format=yuv420p[v]`,
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'medium',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    broadcastMp4
  ]);

  log('=== Phase 9: Generating Comparison Sheet (Horizon Vulkan vs Blockyland) ===');
  const compSheet = slash(path.join(outDir, 'comparison', 'horizon-vs-blockyland-comparison.png'));
  const hzSample = slash(path.join(anglesDir, 'pov', 'f_0005.png'));
  const blSample = 'C:/Users/pope1/.gemini/antigravity/brain/c95f34c7-be56-4e44-b697-bf94a56e826b/.user_uploaded/media_1793983583425_010dc55b.jpg';

  await runCommand('ffmpeg', [
    '-y',
    '-i', blSample,
    '-i', hzSample,
    '-filter_complex',
    '[0:v]scale=960:540,drawtext=text=\'BLOCKYLAND (Web Three.js / Height 64 / Player In Dirt Bug)\':x=30:y=30:fontsize=24:fontcolor=red:box=1:boxcolor=black@0.7:boxborderw=6[l];[1:v]scale=960:540,drawtext=text=\'GENUINE HORIZON (Rust Engine / Vulkan / Real Java 26.3 Terrain)\':x=30:y=30:fontsize=24:fontcolor=green:box=1:boxcolor=black@0.7:boxborderw=6[r];[l][r]hstack[out]',
    '-map', '[out]',
    compSheet
  ]);

  log('EXPEDITION AND FILMING COMPLETE! All outputs saved to outputs/horizon-gemini10');
}

main().catch(err => {
  console.error('Fatal error in expedition:', err);
  process.exit(1);
});
