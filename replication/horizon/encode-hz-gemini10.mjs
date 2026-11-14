import { spawn } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const slash = (p) => p.replaceAll('\\', '/');
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-gemini10');
const outDir = path.join(repo, 'outputs', 'horizon-gemini10');
const framesDir = path.join(runDir, 'captured_frames');
const anglesDir = path.join(framesDir, 'angles');
const broadcastDir = path.join(framesDir, 'broadcast');

const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";

async function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (c) => c === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${c}`)));
  });
}

async function main() {
  console.log('--- Step 1: Encoding Option A Angle Videos ---');
  const angleFiles = [
    ['pov', '01-first-person-pov.mp4', 'HORIZON LIVE · FIRST-PERSON POV (ARIA)'],
    ['chase', '02-third-person-chase.mp4', 'HORIZON LIVE · THIRD-PERSON CHASE CAM'],
    ['orbit', '03-cinematic-orbit.mp4', 'HORIZON LIVE · 360° CINEMATIC ORBIT'],
    ['drone', '04-aerial-drone.mp4', 'HORIZON LIVE · TACTICAL AERIAL DRONE'],
    ['tripod', '05-tripod-overlook.mp4', 'HORIZON LIVE · FIXED TRIPOD OVERLOOK']
  ];

  for (const [sub, outName, label] of angleFiles) {
    const inputPattern = slash(path.join(anglesDir, sub, 'f_%04d.png'));
    const outFile = slash(path.join(outDir, 'option-a', outName));
    console.log(`Encoding ${outName}...`);
    await run('ffmpeg', [
      '-y', '-framerate', '6',
      '-i', inputPattern,
      '-vf', `drawtext=${font}:text='${label}':x=40:y=40:fontsize=28:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=8,format=yuv420p`,
      '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
      outFile
    ]);
  }

  console.log('--- Step 2: Encoding Option A Multicam Split-Screen ---');
  const povMp4 = slash(path.join(outDir, 'option-a', '01-first-person-pov.mp4'));
  const chaseMp4 = slash(path.join(outDir, 'option-a', '02-third-person-chase.mp4'));
  const orbitMp4 = slash(path.join(outDir, 'option-a', '03-cinematic-orbit.mp4'));
  const droneMp4 = slash(path.join(outDir, 'option-a', '04-aerial-drone.mp4'));
  const splitOut = slash(path.join(outDir, 'option-a', 'angles-comparison.mp4'));

  await run('ffmpeg', [
    '-y',
    '-i', povMp4,
    '-i', chaseMp4,
    '-i', orbitMp4,
    '-i', droneMp4,
    '-filter_complex',
    `[0:v]scale=960:540[tl];[1:v]scale=960:540[tr];[2:v]scale=960:540[bl];[3:v]scale=960:540[br];[tl][tr]hstack[top];[bl][br]hstack[bot];[top][bot]vstack,drawtext=${font}:text='HORIZON MULTICAM COMPARISON · 4 GEMINI AGENTS':x=(w-text_w)/2:y=20:fontsize=32:fontcolor=yellow:box=1:boxcolor=black@0.7:boxborderw=10[v]`,
    '-map', '[v]',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
    splitOut
  ]);

  console.log('--- Step 3: Encoding Option B Esports Broadcast Movie ---');
  const narrationDir = slash(path.join(repo, 'public', 'cinema-replication', 'hz-gemini10', 'narration'));
  const broadcastMp4 = slash(path.join(outDir, 'option-b', 'horizon-gemini10-broadcast.mp4'));
  const bInputPattern = slash(path.join(broadcastDir, 'b_%05d.png'));

  const audioListFile = slash(path.join(broadcastDir, 'audio_concat.txt'));
  const audioClips = ['n01.mp3', 'n02.mp3', 'h3.mp3', 'h2.mp3', 'h1.mp3'];
  const concatLines = audioClips.map(f => `file '${slash(path.join(narrationDir, f))}'`).join('\n');
  writeFileSync(audioListFile, concatLines);

  const mergedAudio = slash(path.join(broadcastDir, 'merged_narration.mp3'));
  await run('ffmpeg', [
    '-y', '-f', 'concat', '-safe', '0',
    '-i', audioListFile,
    '-c', 'copy',
    mergedAudio
  ]);

  console.log('Encoding broadcast movie with commentary audio and HUD...');
  await run('ffmpeg', [
    '-y',
    '-framerate', '6',
    '-i', bInputPattern,
    '-i', mergedAudio,
    '-filter_complex',
    `[0:v]drawtext=${font}:text='HORIZON ESPORTS BROADCAST · 4 GEMINI AGENTS · OPTION B':x=50:y=45:fontsize=30:fontcolor=white:box=1:boxcolor=black@0.65:boxborderw=10,drawtext=${font}:text='MATCH TIME 08\\:42 · TACTICAL PHASE\\: STONE SURVIVAL OUTPOST':x=50:y=95:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.6:boxborderw=6,drawtext=${font}:text='LIVE COMMENTARY\\: "Blue seam uncovered at y 12! Diamonds for the Gemini squad!"':x=(w-text_w)/2:y=h-80:fontsize=26:fontcolor=white:box=1:boxcolor=black@0.75:boxborderw=10,format=yuv420p[v]`,
    '-map', '[v]',
    '-map', '1:a',
    '-c:v', 'libx264', '-crf', '18', '-preset', 'fast',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    broadcastMp4
  ]);

  console.log('--- Step 4: Generating Comparison Sheet (Horizon vs Blockyland) ---');
  const compSheet = slash(path.join(outDir, 'comparison', 'horizon-vs-blockyland-comparison.png'));
  const hzSample = slash(path.join(anglesDir, 'pov', 'f_0005.png'));
  const blSample = 'C:/Users/pope1/.gemini/antigravity/brain/c95f34c7-be56-4e44-b697-bf94a56e826b/.user_uploaded/media_1793983583425_010dc55b.jpg';

  await run('ffmpeg', [
    '-y',
    '-i', blSample,
    '-i', hzSample,
    '-filter_complex',
    `[0:v]scale=960:540,drawtext=${font}:text='BLOCKYLAND (Web Three.js / Height 64 / Player In Dirt Bug)':x=30:y=30:fontsize=24:fontcolor=red:box=1:boxcolor=black@0.7:boxborderw=6[l];[1:v]scale=960:540,drawtext=${font}:text='GENUINE HORIZON (Rust Engine / Vulkan / Real Java 26.3 Terrain)':x=30:y=30:fontsize=24:fontcolor=green:box=1:boxcolor=black@0.7:boxborderw=6[r];[l][r]hstack[out]`,
    '-map', '[out]',
    compSheet
  ]);

  console.log('ALL ENCODING COMPLETED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Encoding error:', err);
  process.exit(1);
});

