import test from 'node:test';
import assert from 'node:assert/strict';
import { bindMultiplayerPage } from '../src/multiplayer/page.js';
import { SERVER_PRESETS } from '../src/multiplayer/serverDirectory.js';

function fixture(fetch) {
  const elements = Object.fromEntries(['multiplayer-form', 'multiplayer-status', 'connect-server', 'check-server', ...SERVER_PRESETS.map(preset => preset.id), 'account-note', 'server-name', 'server-address', 'server-version', 'offline-username'].map(id => [id, {
    value: '', dataset: {}, handlers: {}, disabled: false,
    addEventListener(name, handler) { this.handlers[name] = handler; },
    setAttribute(name, value) { this[name] = value; },
    fire(name) { return this.handlers[name]({ preventDefault() {} }); },
  }]));
  elements['server-address'].value = 'gateway.arch.mc';
  elements['server-version'].value = '1.21.4';
  const navigations = [];
  const binding = bindMultiplayerPage({ getElementById: id => elements[id] }, { fetch, navigate: url => navigations.push(url) });
  return { elements, navigations, ...binding };
}
const response = data => ({ ok: true, json: async () => data });

test('community presets select Java endpoints and retain the offline player name', async () => {
  const f = fixture(async () => response({ ready: true, clientUrl: 'http://localhost:3001/' }));
  await f.ready;
  f.elements['offline-username'].value = 'MyPlayer';
  for (const preset of SERVER_PRESETS) {
    f.elements[preset.id].fire('click');
    assert.equal(f.elements['server-name'].value, preset.name);
    assert.equal(f.elements['server-address'].value, preset.address);
    assert.equal(f.elements['offline-username'].value, 'MyPlayer');
    assert.equal(f.elements[preset.id]['aria-pressed'], 'true');
    await f.elements['multiplayer-form'].fire('submit');
    assert.equal(new URL(f.navigations.at(-1)).searchParams.get('ip'), preset.address);
  }
  f.elements['server-address'].fire('input');
  assert.ok(SERVER_PRESETS.every(preset => f.elements[preset.id]['aria-pressed'] === 'false'));
});

test('service readiness and submit navigate to the actual local client', async () => {
  const f = fixture(async () => response({ ready: true, clientUrl: 'http://localhost:3001/' }));
  await f.ready;
  await f.elements['multiplayer-form'].fire('submit');
  assert.equal(new URL(f.navigations[0]).searchParams.get('ip'), 'gateway.arch.mc');
  assert.equal(f.elements['connect-server'].disabled, false);
});
test('missing runtime is actionable and never launches a fake connection', async () => {
  const f = fixture(async () => response({ ready: false }));
  await f.ready;
  await f.elements['multiplayer-form'].fire('submit');
  assert.match(f.elements['multiplayer-status'].textContent, /multiplayer:setup/);
  assert.equal(f.navigations.length, 0);
});
test('validation failures and HTTP errors appear as text and allow retry', async () => {
  const f = fixture(async url => url.endsWith('/health') ? response({ ready: true }) : ({ ok: false, json: async () => ({ error: 'Server refused connection' }) }));
  await f.ready;
  f.elements['server-address'].value = 'https://invalid';
  await f.elements['multiplayer-form'].fire('submit');
  assert.equal(f.navigations.length, 0);
  f.elements['server-address'].value = 'example.com';
  await f.elements['check-server'].fire('click');
  assert.equal(f.elements['multiplayer-status'].textContent, 'Server refused connection');
  assert.equal(f.elements['check-server'].disabled, false);
});
test('server status is not reported as a successful login', async () => {
  const f = fixture(async url => response(url.endsWith('/health') ? { ready: true } : { version: { name: 'Fixture' }, players: { online: 123 } }));
  await f.ready;
  f.elements['offline-username'].value = 'Offline';
  f.elements['archmc-preset'].fire('click');
  assert.equal(f.elements['offline-username'].value, 'Offline');
  await f.elements['check-server'].fire('click');
  assert.match(f.elements['multiplayer-status'].textContent, /123 players/);
  assert.match(f.elements['multiplayer-status'].textContent, /does not verify account login/);
});
