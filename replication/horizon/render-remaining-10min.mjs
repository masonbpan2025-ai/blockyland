import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const slash = (p) => p.replaceAll('\\', '/');
const repo = path.resolve(import.meta.dirname, '..', '..');
const runDir = path.join(repo, 'replication', 'runs', 'hz-gemini10');
const outDir = path.join(repo, 'outputs', 'horizon-gemini10', 'full-10min');
const framesDir = path.join(runDir, 'captured_frames');
const anglesDir = path.join(framesDir, 'angles');
const broadcastDir = path.join(framesDir, 'broadcast');
const narrationDir = slash(path.join(repo, 'public', 'cinema-replication', 'hz-gemini10', 'narration'));

const font = "fontfile='C\\:/Windows/Fonts/arial.ttf'";

async function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('exit', (c) => c === 0 ? resolve() : reject(new Error(`${cmd} exited with code ${c}`)));
  });
}

async function main() {
  console.log('--- Step 1: Rendering Full 10-Min 4-Way Multi-Camera Comparison Movie ---');
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

  console.log('\n--- Step 2: Rendering Full 10-Min Option B Esports Broadcast Movie ---');
  const bInput = slash(path.join(broadcastDir, 'b_%05d.png'));
  const bOut = slash(path.join(outDir, 'option-b', 'horizon-gemini10-full-broadcast.mp4'));

  // Assemble full commentary timeline for 600s
  const commentaryCues = [
    { at: 0.2, clip: 'h1.mp3' },
    { at: 5.4, clip: 'h2.mp3' },
    { at: 10.2, clip: 'h3.mp3' },
    { at: 15.6, clip: 'n01.mp3' },
    { at: 26.6, clip: 'n02.mp3' },
    { at: 37.3, clip: 'n03.mp3' },
    { at: 45.4, clip: 'n04.mp3' },
    { at: 90.4, clip: 'n05.mp3' },
    { at: 96.0, clip: 'n06.mp3' },
    { at: 140.4, clip: 'n07.mp3' },
    { at: 222.3, clip: 'n08.mp3' },
    { at: 227.5, clip: 'n09.mp3' },
    { at: 235.4, clip: 'n10.mp3' },
    { at: 238.5, clip: 'n11.mp3' },
    { at: 312.4, clip: 'n12.mp3' },
    { at: 422.4, clip: 'n13.mp3' },
    { at: 427.8, clip: 'n14.mp3' },
    { at: 512.4, clip: 'n15.mp3' },
    { at: 516.5, clip: 'n16.mp3' },
    { at: 530.6, clip: 'n17.mp3' },
    { at: 570.0, clip: 'n18.mp3' },
    { at: 580.0, clip: 'n19.mp3' },
    { at: 590.0, clip: 'n20.mp3' },
    { at: 596.0, clip: 'n21.mp3' }
  ];

  const audioListLines = [];
  let currentSec = 0;
  for (let i = 0; i < commentaryCues.length; i++) {
    const cue = commentaryCues[i];
    const silenceGap = cue.at - currentSec;
    if (silenceGap > 0.05) {
      const silFile = slash(path.join(broadcastDir, `sil_${i}.mp3`));
      await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', silenceGap.toFixed(2), '-c:a', 'libmp3lame', silFile]);
      audioListLines.push(`file '${silFile}'`);
      currentSec += silenceGap;
    }
    const clipPath = slash(path.join(narrationDir, cue.clip));
    audioListLines.push(`file '${clipPath}'`);
    currentSec += 4.5;
  }
  if (currentSec < 600) {
    const endSil = slash(path.join(broadcastDir, 'sil_end.mp3'));
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', (600 - currentSec).toFixed(2), '-c:a', 'libmp3lame', endSil]);
    audioListLines.push(`file '${endSil}'`);
  }

  const broadcastAudioList = slash(path.join(broadcastDir, 'full_broadcast_audio.txt'));
  writeFileSync(broadcastAudioList, audioListLines.join('\n'));

  const fullAudio = slash(path.join(broadcastDir, 'full_broadcast_audio.mp3'));
  await run('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', broadcastAudioList, '-c', 'copy', fullAudio]);

  console.log('Rendering 10-Minute Option B Broadcast Video...');
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

  console.log('ALL REMAINING MOVIES RENDERED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Render error:', err);
  process.exit(1);
});

