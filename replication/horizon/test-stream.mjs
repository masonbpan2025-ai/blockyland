import { spawn } from 'node:child_process';
import readline from 'node:readline';

const exe = 'C:/Users/pope1/AppData/Roaming/horizon-launcher/versions/nightly-2026-11-05-66f3981/horizon-ctl.exe';
const p = spawn(exe, ['--socket', 'replication/runs/hz-gemini10/clients/Camera/control.json', '-']);
const rl = readline.createInterface({ input: p.stdout });
const queue = [];
rl.on('line', l => queue.shift()?.(l));
const send = (c) => new Promise(r => { queue.push(r); p.stdin.write(c + '\n'); });

const t0 = Date.now();
for (let i = 0; i < 10; i++) {
  await send(`screenshot replication/runs/hz-gemini10/stream_${i}.png`);
}
const elapsed = Date.now() - t0;
console.log(`10 frames took ${elapsed} ms (${(10000 / elapsed).toFixed(1)} fps)`);
p.stdin.end();

