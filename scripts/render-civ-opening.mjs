// Render the opening of 1500 Cartoon Players Simulate Civilization (title to the war room, until Frieza first
// appears at the ice palace) as outputs/civ-1500/civ-1500-clip.mp4, at full export quality, with its review frames
// and continuity check. About 2.5 minutes of film, so fixes to the opening can be checked in motion quickly.
//   node scripts/render-civ-opening.mjs            # the clip
//   node scripts/render-civ-opening.mjs --preview  # review frames and the continuity check only
import { spawn } from 'node:child_process';
import { SCENE } from '../src/cinema/civStory.js';

const args = ['scripts/render-film.mjs', '--movie=civ-1500', '--from=0', `--to=${SCENE.icepalace[0]}`, ...process.argv.slice(2).filter(a => a === '--preview')];
const run = spawn(process.execPath, args, { stdio: 'inherit' });
run.on('close', code => process.exit(code ?? 1));
