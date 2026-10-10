import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { CLIENT_REVISION } from '../server/multiplayer.js';

const directory = path.resolve('.multiplayer-client');
const git = args => execFileSync('git', args, { stdio: 'inherit' });
if (!fs.existsSync(path.join(directory, '.git'))) {
  fs.mkdirSync(directory, { recursive: true });
  git(['init', directory]);
  git(['-C', directory, 'remote', 'add', 'origin', 'https://github.com/zardoy/minecraft-web-client.git']);
}
git(['-C', directory, 'fetch', '--depth', '1', 'origin', CLIENT_REVISION]);
git(['-C', directory, 'checkout', '--detach', CLIENT_REVISION]);
console.log(`Installed multiplayer client ${CLIENT_REVISION}. Run npm run dev or npm run preview.`);
