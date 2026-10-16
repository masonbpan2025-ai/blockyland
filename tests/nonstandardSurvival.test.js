// Hardcore and the void (wiki-tutorial play-test, non-standard survival).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normaliseSettings } from '../src/sessionSettings.js';

test('Hardcore is Survival locked to Hard, without a bonus chest', () => {
  const s = normaliseSettings({ gameMode: 'survival', difficulty: 'easy', hardcore: true, bonusChest: true });
  assert.equal(s.hardcore, true); assert.equal(s.difficulty, 'hard'); assert.equal(s.bonusChest, false);
  assert.equal(normaliseSettings({}).hardcore, false);
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player, /if \(this\.game\?\.settings\?\.hardcore\) \{\s*this\.setGameMode\?\.\('spectator'\)/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="world-mode-hardcore"/);
});

test('the void: 4 damage every half second below y -64, ignoring the hurt window, and no teleport back', () => {
  const player = readFileSync(new URL('../src/player.js', import.meta.url), 'utf8');
  assert.match(player, /if \(this\.position\.y < -64\) \{\s*this\.voidDamageTimer[\s\S]{0,140}this\.takeDamage\(4, null, 'void'\)/);
  assert.doesNotMatch(player, /this\.position\.set\(8\.5, 35, 8\.5\)/);
  assert.match(player, /damageType === 'magic' \|\| damageType === 'void'/);
});
