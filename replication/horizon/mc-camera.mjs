// Start the official Minecraft Java Edition client (the launcher's "fabric-loader-26.3" profile: Fabric + ReplayMod) as
// a camera player that joins a local server at once, with no launcher and no clicks: the same Java command the
// Minecraft Launcher builds from the version files, with an offline name (the Horizon film server runs in offline mode).
// ReplayMod records the session from the moment it connects, so the recording can be re-filmed from any angle later.
//
//   node replication/horizon/mc-camera.mjs [--name=Camera] [--server=127.0.0.1:25591] [--width=1280] [--height=720] [--print]
//
// The game runs detached; its log is .minecraft/logs/latest.log; ReplayMod saves to .minecraft/replay_recordings when
// the client disconnects. --print shows the command instead of starting it.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const name = arg('name', 'Camera'), server = arg('server', '127.0.0.1:25591');
const width = arg('width', '1280'), height = arg('height', '720'), xmx = arg('xmx', '2G');
const mc = path.join(process.env.APPDATA, '.minecraft');
const VERSION = 'fabric-loader-0.19.5-26.3';
const java = 'C:/Program Files (x86)/Minecraft Launcher/runtime/java-runtime-epsilon/windows-x64/java-runtime-epsilon/bin/javaw.exe';

const read = (v) => JSON.parse(readFileSync(path.join(mc, 'versions', v, `${v}.json`), 'utf8'));
const fabric = read(VERSION), base = read(fabric.inheritsFrom);

// The launcher's rules: an entry applies when its last matching rule allows it (here: Windows x64, no special features).
const applies = (rules) => {
  if (!rules) return true;
  let ok = false;
  for (const r of rules) {
    if (r.features) continue;
    if (r.os && ((r.os.name && r.os.name !== 'windows') || (r.os.arch && r.os.arch !== 'x64' && r.os.arch !== 'x86_64'))) continue;
    ok = r.action === 'allow';
  }
  return ok;
};
const libPath = (l) => l.downloads?.artifact?.path ?? (() => { const [g, a, v, c] = l.name.split(':'); return `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}${c ? `-${c}` : ''}.jar`; })();
// Fabric's libraries come first and win over the game's for the same artifact (two ASMs break the loader).
const seen = new Set(), classpath = [];
for (const l of [...fabric.libraries, ...base.libraries]) {
  if (!applies(l.rules)) continue;
  const [g, a, , c] = l.name.split(':'), key = `${g}:${a}:${c ?? ''}`;
  if (seen.has(key)) continue; seen.add(key);
  const p = path.join(mc, 'libraries', libPath(l));
  if (!existsSync(p)) throw new Error(`missing library ${l.name} (${p}); start the profile once from the Minecraft Launcher`);
  classpath.push(p);
}
classpath.push(path.join(mc, 'versions', base.id, `${base.id}.jar`));

// Minecraft's offline UUID: a name-based (version 3) UUID of "OfflinePlayer:<name>".
const md5 = createHash('md5').update(`OfflinePlayer:${name}`).digest();
md5[6] = (md5[6] & 0x0f) | 0x30; md5[8] = (md5[8] & 0x3f) | 0x80;
const uuid = md5.toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');

const natives = path.join(os.tmpdir(), 'mc-camera-natives'); mkdirSync(natives, { recursive: true });
const vars = {
  natives_directory: natives, launcher_name: 'blockyland-camera', launcher_version: '1', classpath: classpath.join(';'),
  classpath_separator: ';', library_directory: path.join(mc, 'libraries'), version_name: VERSION,
  auth_player_name: name, game_directory: mc, assets_root: path.join(mc, 'assets'), assets_index_name: base.assetIndex.id,
  auth_uuid: uuid, auth_access_token: '0', clientid: '0', auth_xuid: '0', version_type: 'release', user_type: 'legacy',
  resolution_width: width, resolution_height: height, quickPlayMultiplayer: server,
};
const fill = (s) => s.replace(/\$\{(\w+)\}/g, (m, k) => vars[k] ?? m);
const expand = (list, wanted = () => false) => list.flatMap((a) => {
  if (typeof a === 'string') return [fill(a)];
  if (!applies(a.rules) && !wanted(a)) return [];
  return [a.value].flat().map(fill);
});
const jvm = [`-Xmx${xmx}`, ...expand(base.arguments.jvm), ...expand(fabric.arguments?.jvm ?? [])];
// The game's optional arguments: the window size and Quick Play multiplayer (the launcher adds them by feature).
// --server=none starts at the title screen (to open a replay) instead of joining.
const optional = (a) => a.rules?.some(r => r.features?.has_custom_resolution || (server !== 'none' && r.features?.is_quick_play_multiplayer));
const game = [...expand(base.arguments.game.filter(a => typeof a === 'string' || optional(a)), optional), ...expand(fabric.arguments?.game ?? [])];
const command = [java, ...jvm, fabric.mainClass, ...game];

if (process.argv.includes('--print')) { console.log(command.map(c => (c.includes(' ') ? `"${c}"` : c)).join(' ').replace(classpath.join(';'), '<classpath>')); process.exit(0); }
const child = spawn(command[0], command.slice(1), { cwd: mc, detached: true, stdio: 'ignore' });
child.unref();
console.log(`Minecraft (${VERSION}) started as ${name} (pid ${child.pid}), ${server === 'none' ? 'at the title screen' : `joining ${server}`}`);
