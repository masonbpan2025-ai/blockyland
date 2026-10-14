// Regenerates src/mobWikiData.js from https://minecraft.wiki (MediaWiki API, wikitext).
//
//   node scripts/generate-mob-wiki-data.mjs
//
// For every mob the Mob Inspector can show, it records what the wiki's infobox and Drops section state for Java
// Edition: health, behaviour class, hitbox, drops and experience. The Inspector's showcase scenarios and
// tests/mobWikiParity.test.js assert against this file, so a behaviour change has to be checked against the wiki
// rather than against the previous code.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The mob list is read from the source text, not imported: importing mobDebugSession would load the whole engine,
// which itself imports the file this script is about to write.
const DEBUG_MOBS = fs.readFileSync(path.join(root, 'src', 'mobDebugSession.js'), 'utf8').match(/DEBUG_MOBS\s*=\s*'([^']+)'/)[1].split(' ');

// Wiki page titles that are not simply the id in Title Case.
const TITLE = { killer_bunny: 'Rabbit', ender_dragon: 'Ender Dragon' };
const title = (id) => TITLE[id] || id.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');

// Infoboxes whose markup the parser cannot read. Each value is stated on the mob's wiki page; they only fill a gap
// and never replace something the parser found.
const OVERRIDES = {
  hoglin: { health: [40] }, dolphin: { health: [10] }, polar_bear: { health: [30] },
  illusioner: { size: { height: 1.95, width: 0.6 }, sizes: [{ height: 1.95, width: 0.6 }] },
  happy_ghast: { size: { height: 4, width: 4 }, sizes: [{ height: 4, width: 4 }] },
  phantom: { size: { height: 0.5, width: 0.9 }, sizes: [{ height: 0.5, width: 0.9 }] },
  giant: { behavior: 'Hostile' }
};

const strip = (s) => s.replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/<[^>]+>/g, ' ').replace(/'''?/g, '').replace(/\s+/g, ' ').trim();

function infoboxField(info, key) {
  const m = info.match(new RegExp(String.raw`\n\|\s*${key}\s*=([\s\S]*?)(?=\n\|\s*\w+\s*=|$)`));
  return m ? m[1].trim() : '';
}

function parse(id, text) {
  const start = text.indexOf('{{Infobox entity');
  const info = start < 0 ? '' : text.slice(start, text.indexOf('\n}}', start));
  const health = [...infoboxField(info, 'health').matchAll(/\{\{hp\|([\d.]+)/g)].map(m => +m[1]);
  const behavior = strip(infoboxField(info, 'behavior'));
  const mobtype = [...infoboxField(info, 'mobtype').matchAll(/EntityLink\|([^}|]+)/g)].map(m => m[1].trim());

  // Hitbox: the first "Height ... Width" pair is the Java adult.
  const size = infoboxField(info, 'size');
  const dims = [...size.matchAll(/Height:\s*([\d.]+)\s*blocks?\s*<br\s*\/?>\s*Width:\s*([\d.]+)/gi)].map(m => ({ height: +m[1], width: +m[2] }));
  const baby = /baby/i.test(size) ? dims.find((d, i) => i > 0 && size.slice(0, size.indexOf(`Height: ${d.height}`)).match(/baby/i)) : null;

  // Drops: Java lines only (a DropLine marked edition=bedrock is skipped).
  const sec = text.slice(text.indexOf('== Drops =='), text.indexOf('\n== ', text.indexOf('== Drops ==') + 5) > 0 ? text.indexOf('\n== ', text.indexOf('== Drops ==') + 5) : undefined);
  const drops = [...sec.matchAll(/\{\{DropLine\|([^\n]*)\}\}/g)]
    .filter(m => !/edition\s*=\s*bedrock/i.test(m[1]))
    .map(m => (m[1].match(/name\s*=\s*([^|}]+)/) || [])[1]?.trim())
    .filter(Boolean);
  // Experience on death: the first line about killing, never the breeding line above it.
  const xpLine = sec.split('\n').find(l => /\{\{xp\|/i.test(l) && /kill|slain|dies|death|defeat/i.test(l) && !/breed/i.test(l));
  const xp = xpLine && xpLine.match(/\{\{xp\|(\d+)(?:\|(\d+))?\}\}/i);
  // Entity tags (the vanilla `fall_damage_immune`, `burn_in_daylight`, `can_breathe_under_water`, ...).
  const tags = [...new Set([...text.matchAll(/entitytags\s*=\s*([^|}\n]*)/g)].flatMap(m => m[1].split(',').map(t => t.trim()).filter(t => /^[a-z_]+$/.test(t))))];

  // Fall damage: immune, or a larger safe distance / a fraction / a flat reduction. Most mobs: 3 free blocks.
  const fall = { immune: tags.includes('fall_damage_immune') || /(immune to|cannot be hurt by|do(?:es)? not take|take(?:s)? no|no) (?:both )?(?:\[\[drowning\]\] and )?\[?\[?fall(?:ing)? damage/i.test(text) };
  const safe = text.match(/safely fall (\d+) blocks/i);
  if (safe) fall.safeBlocks = +safe[1];
  if (/half of the normal fall damage \(rounded up\)/i.test(text)) { fall.factor = 0.5; fall.round = 'up'; }
  else if (/half of the normal fall damage \(rounded down\)/i.test(text)) { fall.factor = 0.5; fall.round = 'down'; }
  const less = text.match(/take(?:s)? \{\{hp\|(\d+)\}\} less (?:\[\[fall damage|damage from falling)/i);
  if (less) fall.reduction = +less[1];

  // Knockback resistance: the largest percentage the infobox states (100% = immune).
  const kb = [...infoboxField(info, 'knockbackresistance').matchAll(/(\d+(?:\.\d+)?)%/g)].map(m => +m[1] / 100);

  // Melee damage per difficulty, only where the infobox states one clean Easy / Normal / Hard triple (no ranges,
  // no armed-vs-unarmed split). Mobs with those are covered by hand-written scenarios.
  const dmg = infoboxField(info, 'damage').match(/Easy:\s*\{\{hp\|([\d.]+)\}\}\s*(?:<br[^>]*>)?\s*Normal:\s*\{\{hp\|([\d.]+)\}\}\s*(?:<br[^>]*>)?\s*Hard:\s*\{\{hp\|([\d.]+)\}\}/);

  return {
    health, behavior, mobtype, tags, fall,
    meleeDamage: dmg ? { easy: +dmg[1], normal: +dmg[2], hard: +dmg[3] } : null,
    knockbackResistance: kb.length ? Math.max(...kb) : 0,
    size: dims[0] || null,
    sizes: dims,
    babySize: baby || null,
    drops: [...new Set(drops)],
    xp: xp ? [+xp[1], +(xp[2] ?? xp[1])] : null
  };
}

const out = {};
for (const id of DEBUG_MOBS) {
  const url = `https://minecraft.wiki/api.php?action=parse&page=${encodeURIComponent(title(id).replace(/ /g, '_'))}&prop=wikitext&format=json`;
  const res = await fetch(url, { headers: { 'user-agent': 'mob-parity-audit/1.0' } });
  const text = (await res.json())?.parse?.wikitext?.['*'];
  if (!text) { console.warn(`no wiki page for ${id}`); continue; }
  out[id] = { ...parse(id, text) };
  const fix = OVERRIDES[id];
  if (fix) for (const [k, v] of Object.entries(fix)) if (!out[id][k] || (Array.isArray(out[id][k]) && !out[id][k].length)) out[id][k] = v;
  process.stdout.write('.');
}

const body = `// GENERATED FILE - do not edit by hand. Regenerate with: node scripts/generate-mob-wiki-data.mjs
//
// Java Edition facts from minecraft.wiki: health, behaviour class, hitbox, drops and experience per mob.
export const MOB_WIKI_DATA = ${JSON.stringify(out, null, 2)};

// Small views of the table that the game itself reads, so the engine does not import the whole table.
/** Fall-damage rule per mob: { immune } or the larger safe distance / fraction / flat reduction. */
export const MOB_FALL_RULES = ${JSON.stringify(Object.fromEntries(Object.entries(out).map(([id, m]) => [id, m.fall])), null, 2)};
/** Melee damage per difficulty where the infobox states one clean Easy / Normal / Hard figure. */
export const MOB_MELEE_DAMAGE = ${JSON.stringify(Object.fromEntries(Object.entries(out).filter(([, m]) => m.meleeDamage).map(([id, m]) => [id, m.meleeDamage])))};
/** Knockback resistance (0-1) per mob: 0 where the wiki states none. */
export const MOB_KNOCKBACK_RESISTANCE = ${JSON.stringify(Object.fromEntries(Object.entries(out).map(([id, m]) => [id, m.knockbackResistance || 0])))};
/** Experience for a kill by a player or tamed wolf: [min, max]. */
export const MOB_KILL_XP = ${JSON.stringify(Object.fromEntries(Object.entries(out).filter(([, m]) => m.xp).map(([id, m]) => [id, m.xp])))};
/** Mobs carrying the \`can_breathe_under_water\` tag: they never drown. */
export const MOB_BREATHES_UNDERWATER = ${JSON.stringify(Object.entries(out).filter(([, m]) => m.tags.includes('can_breathe_under_water')).map(([id]) => id))};
`;
fs.writeFileSync(path.join(root, 'src', 'mobWikiData.js'), body);
console.log(`\nwrote ${Object.keys(out).length} mobs`);
