import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readSpongeSchematic } from '../../src/io/codecs.js';
import { ROOT, OUTPUT } from './generate.mjs';

const java=process.env.BLOCKYBUILDER_JAVA||path.join(ROOT,'.cache/blockybuilder-tools/jre25/jdk-25.0.4.1+1-jre/bin/java.exe');
const jar=process.env.BLOCKYBUILDER_WORLDEDIT||path.join(ROOT,'.cache/blockybuilder-tools/worldedit-cli.jar');
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'tests/fixtures/minecraft/blocks-1.21.4.json')));
const manifest=JSON.parse(fs.readFileSync(path.join(OUTPUT,'manifest.json')));
const work=path.join(ROOT,'.cache/blockybuilder-tools/verification');fs.mkdirSync(work,{recursive:true});
const evidence=path.join(OUTPUT,'verification');fs.mkdirSync(evidence,{recursive:true});
const normalize=s=>{const props={...registry[s.name.slice(10)][1],...s.properties};return s.name+'['+Object.entries(props).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join(',')+']';};
const reports=[];
const previous=fs.existsSync(path.join(evidence,'worldedit.json'))?JSON.parse(fs.readFileSync(path.join(evidence,'worldedit.json'))):{results:[]};
for(const item of manifest.items){
  const file=path.join(OUTPUT,item.file),bytes=fs.readFileSync(file),hash=createHash('sha256').update(bytes).digest('hex');
  const verified=previous.results.find(r=>r.id===item.id&&r.status==='passed'&&r.sha256===hash);if(verified&&!process.argv.includes('--all')){reports.push({...verified,checkedAt:verified.checkedAt||previous.checkedAt});console.log(`${item.id}: unchanged verified SHA-256`);continue;}
  const {structure:before}=await readSpongeSchematic(bytes);const min=before.main.origin,max=item.size.map((v,i)=>v-1+[min.x,min.y,min.z][i]);
  const commands=path.join(work,`${item.id}.txt`),exportName=`${item.id}_worldedit_roundtrip`;
  fs.writeFileSync(commands,[`//pos1 ${min.x},${min.y},${min.z}`,`//pos2 ${max.join(',')}`,'//count air','//copy',`//schem save -f ${exportName} sponge`,''].join('\n'));
  const roundtrip=path.join(work,'worldedit/schematics',`${exportName}.schem`);if(fs.existsSync(roundtrip))fs.unlinkSync(roundtrip);
  const child=spawn(java,['-Xmx768m','-jar',jar,'-f',file,'-s',commands],{cwd:work,windowsHide:true,stdio:['pipe','pipe','pipe']});let rawLog='';child.stdout.on('data',b=>rawLog+=b);child.stderr.on('data',b=>rawLog+=b);const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
  // Schematic saving is asynchronous. Keep stdin open until the completed export can be decoded.
  const deadline=Date.now()+90000;let complete=false;while(Date.now()<deadline){try{if(fs.statSync(roundtrip).size>30){await readSpongeSchematic(fs.readFileSync(roundtrip));complete=true;break;}}catch{}if(child.exitCode!==null)break;await new Promise(r=>setTimeout(r,150));}
  child.stdin.end('stop\n');const status=await closed;const log=rawLog.replace(/\x1b\[[0-9;]*m/g,'');fs.writeFileSync(path.join(evidence,`${item.id}-worldedit.txt`),log);
  assert(complete,`${item.id}: WorldEdit export did not finish: ${log}`);assert.equal(status,0,`${item.id}: ${log}`);assert(!/Invalid BlockState|replaced with air|An error occurred|Invalid value|Unknown command/i.test(log),log);
  const air=Number(log.match(/Counted: (\d+)/)?.[1]);assert.equal(item.size.reduce((a,b)=>a*b,1)-air,item.nonAir,'WorldEdit non-air count');
  const {structure:after}=await readSpongeSchematic(fs.readFileSync(roundtrip));
  assert.deepEqual(after.main.size,before.main.size);assert.equal(after.main.blocks.length,before.main.blocks.length);
  const expected=new Map(before.main.blocks.map(b=>[`${b.pos.x},${b.pos.y},${b.pos.z}`,normalize(b.state)]));
  for(const b of after.main.blocks)assert.equal(normalize(b.state),expected.get(`${b.pos.x},${b.pos.y},${b.pos.z}`),`${item.id}: state at ${JSON.stringify(b.pos)}`);
  assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,'verification must leave delivery file intact');
  const report={id:item.id,author:manifest.author,sha256:hash,status:'passed',tool:'Official WorldEdit CLI 7.4.7-SNAPSHOT, build 7652',target:'Java 1.21.4, DataVersion 4189',nonAir:after.main.blocks.length,dimensions:item.size,checks:['Loaded by WorldEdit without invalid palette warnings','Full bounds non-air count matched','Exported by WorldEdit as Sponge v3','Every non-air position and complete block state matched after export'],scope:'WorldEdit CLI schematic import and round-trip; not a Minecraft client playtest'};
  report.checkedAt=new Date().toISOString();reports.push(report);console.log(`${item.id}: WorldEdit PASS, ${report.nonAir} positions and block states matched`);
}
fs.writeFileSync(path.join(evidence,'worldedit.json'),JSON.stringify({author:manifest.author,checkedAt:new Date().toISOString(),results:reports},null,2));
