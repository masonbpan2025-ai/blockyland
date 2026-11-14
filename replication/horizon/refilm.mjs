// Re-film a ReplayMod recording (.mcpr) from code: write a camera path into the recording, where ReplayMod loads it as
// the current path when the replay opens (timeline "" in timelines.json, the format of ReplayStudio's
// TimelineSerialization and ReplayMod's simple pathing: a time path, then a position path).
//
//   node replication/horizon/refilm.mjs orbit <recording.mcpr> --center=x,y,z [--from=200] [--seconds=20]
//        [--radius=7] [--height=4] [--sweep=270]
//
// Time path: keyframes { time: video ms, properties: { timestamp: replay ms } }, linear.
// Position path: keyframes { time: video ms, properties: { "camera:position": [x, y, z], "camera:rotation":
// [yaw, pitch, roll] } }, cubic spline. Minecraft's yaw: 0 faces +z (south), 90 faces -x; positive pitch looks down.
import { writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const [shot, file] = process.argv.slice(2);
const arg = (name, fallback) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
if (shot !== 'orbit' || !file || !existsSync(file)) { console.error('usage: node refilm.mjs orbit <recording.mcpr> --center=x,y,z [--from=S] [--seconds=S]'); process.exit(2); }
const [cx, cy, cz] = arg('center', '0,64,0').split(',').map(Number);
const from = Number(arg('from', 200)) * 1000, seconds = Number(arg('seconds', 20)), radius = Number(arg('radius', 7));
const height = Number(arg('height', 4)), sweep = Number(arg('sweep', 270)) * Math.PI / 180;

/** The yaw and pitch that look from `p` at `q`, in Minecraft's convention. */
const lookAt = (p, q) => {
  const dx = q[0] - p[0], dy = q[1] - p[1], dz = q[2] - p[2];
  return [-Math.atan2(dx, dz) * 180 / Math.PI, -Math.atan2(dy, Math.hypot(dx, dz)) * 180 / Math.PI];
};

const steps = 5, video = seconds * 1000, target = [cx, cy + 1, cz];
const positions = [];
let lastYaw = null;
for (let i = 0; i < steps; i++) {
  const t = i / (steps - 1), a = t * sweep;
  const p = [cx + Math.sin(a) * radius, cy + height, cz + Math.cos(a) * radius];
  let [yaw, pitch] = lookAt(p, target);
  // keep the yaw continuous (no jump from 179 to -179), so the spline turns the short way
  if (lastYaw !== null) {
    while (yaw - lastYaw > 180) yaw -= 360;
    while (yaw - lastYaw < -180) yaw += 360;
  }
  lastYaw = yaw;
  positions.push({ time: Math.round(t * video), properties: { 'camera:position': p.map(v => +v.toFixed(3)), 'camera:rotation': [+yaw.toFixed(2), +pitch.toFixed(2), 0] } });
}
const timelines = {
  '': [
    { keyframes: [{ time: 0, properties: { timestamp: from } }, { time: video, properties: { timestamp: from + video } }],
      segments: [0], interpolators: [{ type: 'linear', properties: ['timestamp'] }] },
    { keyframes: positions, segments: positions.slice(1).map(() => 0),
      interpolators: [{ type: 'cubic-spline', properties: ['camera:position', 'camera:rotation'] }] },
  ],
};

// Put timelines.json into the recording (replacing one already there), with .NET's zip support.
const tmp = mkdtempSync(path.join(os.tmpdir(), 'refilm-'));
const json = path.join(tmp, 'timelines.json');
writeFileSync(json, JSON.stringify(timelines));
const ps = `Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem;
$z = [System.IO.Compression.ZipFile]::Open('${path.resolve(file).replace(/'/g, "''")}', 'Update');
$old = $z.GetEntry('timelines.json'); if ($old) { $old.Delete() };
[System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($z, '${json.replace(/'/g, "''")}', 'timelines.json') | Out-Null;
$z.Dispose(); 'ok'`;
console.log(execFileSync('powershell', ['-NoProfile', '-Command', ps]).toString().trim());
console.log(`orbit written into ${path.basename(file)}: replay ${from / 1000}-${(from + video) / 1000} s, ${seconds} s of video, around ${cx},${cy},${cz}`);
for (const k of positions) console.log(`  ${k.time / 1000}s  pos ${k.properties['camera:position'].join(', ')}  yaw/pitch ${k.properties['camera:rotation'].slice(0, 2).join(' / ')}`);
