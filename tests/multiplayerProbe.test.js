import test from 'node:test';
import assert from 'node:assert/strict';
import { reachedRegistration } from '../scripts/helpers/multiplayerProbe.js';

test('live probe recognizes registration command variants and existing-account login', () => {
  for (const text of ['Please register with /register <password> <password>', 'Type ▸ /reg [password]', 'Sign in using /login password']) {
    assert.equal(reachedRegistration(text), true);
  }
});

test('status, disconnected sessions and protocol errors are not successful logins', () => {
  for (const text of ['Server reachable, 123 players', 'Loading world chunks', 'You have been disconnected: /register required', 'Connection timed out']) {
    assert.equal(reachedRegistration(text), false);
  }
  assert.equal(reachedRegistration('/reg password', ['Protocol error']), false);
});
