import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { reachedRegistration } from './helpers/multiplayerProbe.js';
import { parseServerAddress } from '../src/multiplayer/serverAddress.js';
const defaults = [ ['PikaNetwork','top.pika.host'], ['JartexNetwork','topt.jartex.fun'], ['MineBerry','go.mineberry.org'], ['ExtremeCraft','top.extremecraft.net'], ['Herobrine','herobrine.org'] ];
const candidates = process.argv.slice(2).filter(arg => !arg.startsWith('--')).map(arg => arg.includes('=') ? arg.split('=') : [arg,arg]);
if (!candidates.length) candidates.push(...defaults);
const version = process.argv.find(arg => arg.startsWith('--version='))?.slice(10) || '1.21.4';
if (!/^1\.\d{1,2}(?:\.\d{1,2})?$/.test(version)) throw new Error('Use a Minecraft version such as 1.21.4.');
for (const [,address] of candidates) parseServerAddress(address);
const gameUrl = process.env.MULTIPLAYER_GAME_URL || 'http://127.0.0.1:3020';
const health = await (await fetch(gameUrl + '/api/multiplayer/health')).json();
if (!health.ready || !health.clientUrl) throw new Error('Start the installed multiplayer client before running live browser checks.');
await fs.mkdir('.cache', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [name,address] of candidates) {
    console.log('TESTING', name, address);
    const result = { name, address, version, errors: [], logs: [] };
    try {
      const response = await fetch(gameUrl+'/api/multiplayer/status?address='+encodeURIComponent(address), {signal:AbortSignal.timeout(12000)});
      result.status = await response.json();
    } catch(error) { result.statusError = error.message; }
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(error.message));
    page.on('console', message => { if (/connect|kick|error/i.test(message.text())) result.logs.push(message.text().slice(0,500)); });
    try {
      const url = new URL(health.clientUrl);
      for (const [key,value] of Object.entries({ip:address,name,version:result.version,username:'CodexChk'+Math.floor(Math.random()*900000),proxy:url.origin})) url.searchParams.set(key,value);
      await page.goto(url.href, {waitUntil:'domcontentloaded',timeout:45000});
      await page.getByRole('button',{name:'Connect',exact:true}).click({timeout:45000});
      const started = Date.now();
      while (Date.now()-started<40000) {
        await page.waitForTimeout(1000);
        result.text = await page.locator('body').innerText();
        if (reachedRegistration(result.text, result.errors) || /Disconnected|Connection failed|Failed to connect|Cannot open TCP/i.test(result.text) || result.errors.length) break;
      }
      if (reachedRegistration(result.text, result.errors)) {
        await page.waitForTimeout(5000);
        result.text = await page.locator('body').innerText();
        result.connected = reachedRegistration(result.text, result.errors);
      } else result.connected = false;
      const fileName = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
      await page.screenshot({path:'.cache/'+fileName+'-'+version+'-checked.png'});
    } catch(error) { result.failure = error.message; result.connected = false; }
    await context.close();
    results.push(result);
    await fs.writeFile('.cache/server-check-results-' + version + '.json',JSON.stringify(results,null,2));
    console.log('RESULT', JSON.stringify({ name, address, version, registrationReached: result.connected, failure: result.failure || result.statusError || result.status?.error, errors: result.errors, text: result.text?.slice(0,300) }));
  }
} finally { await browser.close(); }

