// node scripts/generate-systems-wiki-data.mjs
//
// The facts the game-systems audit (src/systemsWikiAudit.js) checks, from the Minecraft Wiki pages saved by
// scripts/fetch-system-wiki.mjs, into src/systemsWikiData.js: villager and wandering-trader trades (the Trading
// page's rendered tables), brewing recipes and potion durations, enchantments, effects, smithing recipes, the Java
// command list and redstone component facts. Java Edition only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DIR = 'docs/block-item-audit/wiki/systems';
const page = (name) => JSON.parse(readFileSync(`${DIR}/${name}.json`, 'utf8'));
const revisions = {};
const textOf = (html) => html.replace(/<sup[\s\S]*?<\/sup>/g, '').replace(/<br\s*\/?>/g, ' | ').replace(/<[^>]+>/g, '')
  .replace(/&#160;|&nbsp;/g, ' ').replace(/&#8211;|&ndash;/g, '–').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();

async function rendered(title, file) {
  const path = `${DIR}/${file}.json`;
  if (!existsSync(path)) {
    const url = `https://minecraft.wiki/api.php?${new URLSearchParams({ action: 'parse', page: title, prop: 'text|revid', format: 'json', formatversion: '2' })}`;
    writeFileSync(path, JSON.stringify(await (await fetch(url, { headers: { 'User-Agent': 'MinecraftInBrowserParityAudit/1.0' } })).json()));
  }
  const json = JSON.parse(readFileSync(path, 'utf8'));
  revisions[title] = json.parse.revid;
  return json.parse.text;
}

/** The rows of the first table after a heading id, as arrays of cell texts, with rowspans carried down. */
function tableAfter(html, headingId) {
  const at = html.indexOf(`id="${headingId}"`);
  if (at < 0) return [];
  const start = html.indexOf('<table', at); const end = html.indexOf('</table>', start);
  const out = []; const carry = [];
  for (const tr of html.slice(start, end).split(/<tr[\s>]/).slice(1)) {
    const cells = [...tr.matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((m) => ({ tag: m[1], attrs: m[2], text: textOf(m[3]) }));
    if (!cells.length || cells.every((c) => c.tag === 'th' && !/rowspan/.test(c.attrs) && out.length === 0 && /Level|Villager|Probability|JE|BE/.test(c.text))) continue;
    if (cells.every((c) => c.tag === 'th') && /JE|BE|Probability|wants/.test(cells.map((c) => c.text).join(' '))) continue;
    // A leading <th> is the group (level, or the wandering trader's section), carried down its rowspan.
    let group = carry[0];
    if (cells[0].tag === 'th') { group = cells.shift().text; const span = Number(/rowspan="(\d+)"/.exec(tr)?.[1] ?? 1); carry[0] = group; carry[1] = span; }
    out.push([group, ...cells.map((c) => c.text)]);
  }
  return out;
}

/** "5–64 × Emerald | + Book" -> [{name: 'Emerald', min: 5, max: 64}, {name: 'Book', min: 1, max: 1}]. */
function stacks(text) {
  return text.split(/\s*\|\s*\+?\s*|\s+\+\s+/).filter(Boolean).map((part) => {
    const m = /^(?:(\d+)(?:\s*[–-]\s*(\d+))?\s*×\s*)?(.+)$/.exec(part.trim());
    const min = m[1] ? Number(m[1]) : 1;
    return { name: m[3].replace(/^\+\s*/, '').trim(), min, max: m[2] ? Number(m[2]) : min };
  });
}

// --- trading ---------------------------------------------------------------------------------------------------
const tradingHtml = await rendered('Trading', 'Trading_rendered');
const PROFESSIONS = ['Armorer', 'Butcher', 'Cartographer', 'Cleric', 'Farmer', 'Fisherman', 'Fletcher', 'Leatherworker', 'Librarian', 'Mason', 'Shepherd', 'Toolsmith', 'Weaponsmith'];
const LEVELS = { Novice: 1, Apprentice: 2, Journeyman: 3, Expert: 4, Master: 5 };
const trades = [];
for (const profession of PROFESSIONS) {
  for (const row of tableAfter(tradingHtml, profession)) {
    const [level, je, , wants, gives, stock, xp, mult] = row;
    if (!LEVELS[level] || !wants || /^0%$/.test(je)) continue; // a Bedrock-only offer has no Java chance
    let wanted = stacks(wants);
    // The librarian's "Book and Quill + Book and Quill": the page's footnote, "book and quill trade is always
    // discounted to 1 since books are unstackable" -- so the price a Java player pays is one.
    if (wanted.length === 2 && wanted[0].name === wanted[1].name && /book and quill trade is always discounted to 1/i.test(textOf(tradingHtml))) wanted = [wanted[0]];
    trades.push({ trader: profession.toLowerCase(), level: LEVELS[level], wants: wanted, gives: stacks(gives)[0], stock: Number(stock), xp: Number(xp), multiplier: Number(mult) });
  }
}
for (const row of tableAfter(tradingHtml, 'Wandering_Trader_offers')) {
  const [group, je, , wants, gives, stock] = row;
  if (!wants || /^0%$/.test(je)) continue;
  trades.push({ trader: 'wandering_trader', group, wants: stacks(wants), gives: stacks(gives)[0], stock: Number(stock) });
}

// --- brewing ---------------------------------------------------------------------------------------------------
// The Brewing page's "Brewing recipes" tables: per potion, each recipe (a brewing-stand picture: the ingredient in
// the input slot, the potions it works on in the bottle slots), its duration, and its extended and enhanced forms.
const brewingHtml = await rendered('Brewing', 'Brewing_rendered');
const titles = (html) => [...html.matchAll(/<a href="[^"]*" title="([^"]+)"/g)].map((m) => m[1].replace(/&#39;/g, "'"));
const durationOf = (text) => /\(\s*(\d+:\d\d)/.exec(text)?.[1] ?? null; // the first is Java's ("1:30 | 2:00")
function recipesIn(cellHtml) {
  return cellHtml.split(/mcui-Brewing/).slice(1).map((ui) => {
    const input = ui.slice(ui.indexOf('mcui-input'), ui.indexOf('mcui-output'));
    // An animated slot cycles through every ingredient that works.
    return { ingredients: [...new Set(titles(input))], bases: [...new Set(titles(ui.slice(ui.indexOf('mcui-output'))))] };
  }).filter((r) => r.ingredients.length);
}
const brewing = [];
const startAt = brewingHtml.indexOf('id="Base_potions"'); const stopAt = brewingHtml.indexOf('id="Bedrock_Edition_exclusive_recipes"');
for (const table of brewingHtml.slice(startAt, stopAt).split('<table').slice(1)) {
  for (const tr of table.slice(0, table.indexOf('</table>')).split(/<tr[\s>]/).slice(1)) {
    const cells = [...tr.matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[3]);
    if (cells.length < 3 || !/mcui-Brewing/.test(cells[1])) continue;
    const name = titles(cells[0])[0];
    const formOf = (html) => (/^\s*—\s*$/.test(textOf(html)) || !html ? null : { duration: durationOf(textOf(html)) });
    brewing.push({ potion: name, duration: durationOf(textOf(cells[0])), recipes: recipesIn(cells[1]),
      ...(cells.length >= 5 ? { extended: formOf(cells[2]), enhanced: formOf(cells[3]) } : {}) });
  }
}

// --- enchanting ------------------------------------------------------------------------------------------------
// The Enchantment page's "List of enchantments" (identifier, what it conflicts with, maximum level), and the
// Enchanting table mechanics page's "Receivable enchantments" table (per item: the enchantments an enchanting
// table offers it, each with its weight and per-level cost range). A row marked Bedrock-only or Combat Test only
// is left out.
const enchantmentHtml = await rendered('Enchantment', 'Enchantment_rendered');
const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
const enchantments = [];
/** The items an item column links, leaving out one marked "[BE only]" (each sits in its own nowrap span). */
function javaItems(cellHtml = '') {
  const java = cellHtml.replace(/<span class="nowrap">(?:(?!<span class="nowrap">)[\s\S])*?only applies to Bedrock Edition[\s\S]*?<\/sup><\/span>/g, '');
  return [...new Set(titles(java).filter((t) => !/Edition$/.test(t)))];
}
{
  const at = enchantmentHtml.indexOf('id="List_of_enchantments"');
  const start = enchantmentHtml.indexOf('<table', at);
  const table = enchantmentHtml.slice(start, enchantmentHtml.indexOf('</table>', start));
  for (const tr of table.split(/<tr[\s>]/).slice(2)) {
    const cells = [...tr.matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[3]);
    if (cells.length < 5) continue;
    if (/only applies to (Bedrock|JE Combat Tests) Edition/.test(cells[0] + cells[1])) continue;
    enchantments.push({ name: titles(cells[0])[0], id: textOf(cells[1]), incompatible: textOf(cells[3]).split(/,\s*/).filter((t) => t && t !== '—'), maxLevel: ROMAN[textOf(cells[4])] ?? Number(textOf(cells[4])),
      primary: javaItems(cells[5]), secondary: javaItems(cells[6]) });
  }
}
const mechanics = page('Enchanting_mechanics');
revisions['Enchanting table mechanics'] = mechanics.revid;
const offers = []; // {items: ['Helmet'], name, weight, costs: [[min, max], ...]}
{
  const body = mechanics.text.slice(mechanics.text.indexOf('== Receivable enchantments'));
  const table = body.slice(body.indexOf('{|'), body.indexOf('\n|}'));
  let items = [];
  for (const row of table.split(/\n\|-/).slice(1)) {
    const lines = row.trim().split('\n').filter((l) => l.trim());
    for (const line of lines) {
      if (/rowspan=\d+\s*\|\s*\{\{ItemLink/.test(line)) { items = [...line.matchAll(/\{\{ItemLink\|([^}|]+)/g)].map((m) => m[1]); continue; }
      if (!/\[\[/.test(line)) continue;
      if (/\{\{only\|(be|JE Combat Tests)/i.test(line)) continue;
      const cells = line.replace(/^\|\|?\s*/, '').split('||').map((c) => c.trim());
      const name = /\[\[([^\]|]+)/.exec(cells[0])[1];
      // The compatibility cell is absent on rows a rowspan covers: the weight is the first plain number.
      const rest = cells.slice(1).filter((c) => !/\{\{Tc/.test(c));
      const weightAt = rest.findIndex((c) => /^\d+$/.test(c));
      const costs = rest.slice(weightAt + 1).filter((c) => /\d+–\d+/.test(c)).map((c) => c.split('–').map(Number));
      offers.push({ items, name, weight: Number(rest[weightAt]), costs });
    }
  }
}

// --- effects ---------------------------------------------------------------------------------------------------
// The Effect page's "List of effects" (name, identifier, type) and its potency table ("Scales with potency?").
// A row the page marks as another edition's or as upcoming keeps that note, so the audit can leave it out.
const effectHtml = await rendered('Effect', 'Effect_rendered');
const effects = [];
{
  const at = effectHtml.indexOf('id="List_of_effects"');
  const start = effectHtml.indexOf('<table', at);
  const table = effectHtml.slice(start, effectHtml.indexOf('</table>', start));
  for (const tr of table.split(/<tr[\s>]/).slice(1)) {
    const cells = [...tr.matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((m) => m[3]);
    if (cells.length < 5 || !/<code>|^[a-z_]+$/.test(textOf(cells[2]))) continue;
    const marks = [...cells[1].matchAll(/title="This (?:statement|feature) (?:only applies to|is) ([^"]+)"/g)].map((m) => m[1]); if (/applies only to upcoming versions/.test(cells[1])) marks.push('upcoming');
    effects.push({ name: textOf(cells[1]).replace(/\s*\|\s*$/, '').replace(/[​‌]|&#x200b;|&#8204;/g, '').trim(), id: textOf(cells[2]), type: textOf(cells[4]), ...(marks.length ? { only: marks.join('; ') } : {}) });
  }
  const potencyAt = effectHtml.indexOf('Scales with potency');
  const pStart = effectHtml.lastIndexOf('<table', potencyAt);
  const pTable = effectHtml.slice(pStart, effectHtml.indexOf('</table>', pStart));
  for (const tr of pTable.split(/<tr[\s>]/).slice(2)) {
    const cells = [...tr.matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((m) => textOf(m[3]).replace(/[​‌]|&#x200b;|&#8204;/g, '').trim());
    const e = effects.find((x) => x.name === cells[0]);
    if (e && cells[1]) e.scalesWithPotency = /^Yes/.test(cells[1]);
  }
}

// --- smithing --------------------------------------------------------------------------------------------------
// The Smithing page: each upgrade ({{Smithing}} with template, base, addition, result), the trim templates and
// materials it lists, and the trimming example's base/material pairs.
const smithingPage = page('Smithing');
revisions.Smithing = smithingPage.revid;
const smithing = { upgrades: [], templates: [], materials: [], trimExamples: [] };
{
  const text = smithingPage.text;
  for (const m of text.matchAll(/\{\{Smithing\s*\n([\s\S]*?)\}\}/g)) {
    const positional = m[1].split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|') && !/^\|\s*\w+\s*=/.test(l)).map((l) => l.slice(1).trim());
    if (positional.length < 4) continue;
    const [template, base, addition, result] = positional;
    if (/^Netherite Upgrade$/.test(template)) smithing.upgrades.push({ template, base, addition, result });
    else if (/^Any Armor Trim/.test(template)) {
      const bases = base.split(/\s*;\s*/); const adds = addition.split(/\s*;\s*/);
      bases.forEach((b, i) => smithing.trimExamples.push({ base: b, material: adds[i] }));
    }
  }
  const listAfter = (heading) => {
    const at = text.indexOf(heading);
    const block = text.slice(at, text.indexOf('\n\n', at + heading.length + 2));
    return [...block.matchAll(/\{\{ItemLink\|([^}|]+)/g)].map((x) => x[1]);
  };
  smithing.templates = listAfter('==== Template ====');
  smithing.materials = listAfter('==== Material ====');
}

// --- commands --------------------------------------------------------------------------------------------------
// The Commands page's "Available in Java Edition" table (name, OP level, multiplayer only), and the Java version
// that added each, from the page's "Command additions and changes" history.
const commandsHtml = await rendered('Commands', 'Commands_rendered');
const commandsPage = page('Commands');
revisions['Commands (source)'] = commandsPage.revid;
const commands = [];
{
  const at = commandsHtml.indexOf('id="Available_in_Java_Edition"');
  const start = commandsHtml.indexOf('<table', at);
  const table = commandsHtml.slice(start, commandsHtml.indexOf('</table>', start));
  for (const tr of table.split(/<tr[\s>]/).slice(2)) {
    const cells = [...tr.matchAll(/<(t[hd])([^>]*)>([\s\S]*?)<\/t[hd]>/g)].map((m) => textOf(m[3]));
    if (!/^\//.test(cells[0] ?? '')) continue;
    commands.push({ name: cells[0].slice(1), level: Number.parseInt(cells[2], 10), multiplayerOnly: /Yes/.test(cells[3]), singleplayerOnly: /SP only/.test(cells[3]) });
  }
  const history = commandsPage.text.slice(commandsPage.text.indexOf('=== Command additions and changes'), commandsPage.text.indexOf("==== ''Bedrock Edition''", commandsPage.text.indexOf('=== Command additions and changes')));
  let version = '';
  for (const line of history.split('\n')) {
    const v = /HistoryLine\|[^|]*\|([^|}]+)/.exec(line);
    if (/HistoryLine\|java/.test(line)) version = /HistoryLine\|java ([a-z]+)/.exec(line)?.[1] ?? '';
    else if (v && v[1].trim() && !/=/.test(v[1])) version = v[1].trim();
    if (!/Added/.test(line)) continue;
    const added = line.slice(line.indexOf('Added'));
    for (const m of added.matchAll(/\{\{(?:Command|cmd)\|([a-z-]+)/gi)) {
      const c = commands.find((x) => x.name === m[1].toLowerCase());
      if (c && !c.added) c.added = version;
    }
  }
  // Two the history table does not settle: /test was added in 1.15 "only available in IDE environment" and became
  // "accessible through normal gameplay" in 1.21.5; /stopwatch's own page: "1.21.11 ... Added /stopwatch".
  commands.find((c) => c.name === 'test').added = '1.21.5';
  commands.find((c) => c.name === 'stopwatch').added = '1.21.11';
}

// --- redstone --------------------------------------------------------------------------------------------------
// One number (or two) per component, read out of the component's page with the sentence that states it; a page
// reworded so the pattern no longer matches stops the generator rather than producing a stale fact.
const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const num = (s) => WORDS[String(s).toLowerCase()] ?? Number(s);
const REDSTONE_FACTS = [
  ['dustRange', 'Redstone_Dust', /power signal\]\] up to (\d+) blocks in distance/],
  ['repeaterInitialDelayGameTicks', 'Redstone_Repeater', /When initially placed, a redstone repeater has a delay of \{\{convert\|(\d+)\|game tick/],
  ['repeaterDelays', 'Redstone_Repeater', /\{\{bst\|delay\|1\|([\d,]+)\|/],
  ['comparatorDelayGameTicks', 'Redstone_Comparator', /outputs the same signal strength as its rear input, with a (\d+) game tick delay/],
  ['torchDelayGameTicks', 'Redstone_Torch', /A redstone torch takes (\d+) game ticks/],
  ['torchBurnout', 'Redstone_Torch', /turn off more than (\w+) times in (\d+) game ticks/],
  ['pistonPushLimit', 'Piston', /pushes at most (\d+) blocks/],
  ['observerPulseGameTicks', 'Observer', /signal strength 15 for (\d+) \[\[game tick\]\]s/],
  ['buttonGameTicks', 'Button', /A stone button stays on for (\d+) \[\[tick\]\]s \(1 second\), while a wooden button stays on for (\d+) ticks/],
  ['plateCheckGameTicks', 'Pressure_Plate', /(\d+) game ticks for weighted pressure plates and\s+(\d+) game ticks for other pressure plates/],
  ['lightPlate', 'Light_Weighted_Pressure_Plate', /signal strength\]\] that is equal to the amount of entities on top of them, up to a maximum power level of (\d+)/],
  ['heavyPlate', 'Heavy_Weighted_Pressure_Plate', /equal to \{\{frac\|1\|(\d+)\}\}\s+of the amount of entities on top of them \(rounded up/],
  ['dropperDelayGameTicks', 'Dropper', /dropper waits \{\{convert\|(\d+)\|game tick/],
  ['hopperCooldownGameTicks', 'Hopper', /cooldown period that lasts (\d+) game ticks/],
  ['noteBlockPitches', 'Note_Block', /(\d+) different pitches per instrument/],
  ['targetGameTicks', 'Target', /emits redstone power for \{\{convert\|(\d+)\|gt\|s\}\}\. \[\[Arrow\]\]s and \[\[trident\]\]s instead cause the target to emit power for \{\{convert\|(\d+)\|gt/],
  ['lightningRodGameTicks', 'Lightning_Rod', /at level 15 for (\d+) game ticks/],
  ['containerFormula', 'Redstone_Comparator', /signal strength = floor\(1 \+ \(\(sum of all slots' fullnesses\) ÷ \(number of slots in container\)\) × (\d+)\)/],
];
const redstone = {};
for (const [field, file, pattern] of REDSTONE_FACTS) {
  const p = page(file);
  revisions[p.title] = p.revid;
  const m = pattern.exec(p.text);
  if (!m) throw new Error(`redstone fact ${field}: the ${p.title} page no longer says ${pattern}`);
  const values = m.slice(1).map((v) => (/,/.test(v) ? v.split(',').map(Number) : num(v)));
  redstone[field] = { value: values.length === 1 ? values[0] : values, page: p.title, quote: m[0].replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').replace(/\{\{convert\|(\d+)\|(game tick|gt)(\|[^}]*\}\})?/g, '$1 game ticks').replace(/\{\{bst\|delay\|1\|([\d,]+)\|/, 'delay: $1 (redstone ticks)').replace(/\{\{frac\|1\|(\d+)\}\}/, '1/$1') };
}

// --- advancements ----------------------------------------------------------------------------------------------
// The Advancement page's {{AdvancementRow}}s: title, description, parent (by title) and the resource id.
const advancementPage = page('Advancement');
revisions.Advancement = advancementPage.revid;
const advancements = [];
/** Each {{AdvancementRow ...}} with its braces balanced (a requirement cell nests templates), as its top-level lines. */
function advancementRows(text) {
  const out = [];
  let at = text.indexOf('{{AdvancementRow');
  while (at >= 0) {
    let depth = 0; let i = at; const lines = []; let line = '';
    for (; i < text.length - 1; i++) {
      if (text[i] === '{' && text[i + 1] === '{') { depth++; line += '{{'; i++; continue; }
      if (text[i] === '}' && text[i + 1] === '}') { depth--; if (!depth) break; line += '}}'; i++; continue; }
      if (text[i] === '\n') { if (depth === 1) { lines.push(line); line = ''; } else line += ' '; continue; }
      line += text[i];
    }
    lines.push(line);
    out.push(lines.map((l) => l.trim()).filter((l) => l.startsWith('|')));
    at = text.indexOf('{{AdvancementRow', i);
  }
  return out;
}
for (const lines of advancementRows(advancementPage.text)) {
  const named = Object.fromEntries(lines.filter((l) => /^\|\s*\w+\s*=/.test(l)).map((l) => { const [k, ...v] = l.slice(1).split('='); return [k.trim(), v.join('=').trim()]; }));
  const positional = lines.filter((l) => !/^\|\s*\w+\s*=/.test(l)).map((l) => l.slice(1).trim());
  // The id cell; a challenge row has a reward cell after it.
  const id = positional.find((p) => /^(story|nether|end|adventure|husbandry)\/[a-z0-9_]+$/.test(p));
  if (!/^(story|nether|end|adventure|husbandry)\/[a-z0-9_]+$/.test(id ?? '')) continue;
  const clean = (s) => String(s ?? '').replace(/\[\[(?:[^\]|]*\|)?([^\]]+)\]\]/g, '$1').replace(/'''?|<[^>]+>/g, '').trim();
  advancements.push({ id, title: clean(named.title), description: clean(positional[1]), parent: clean(positional[2]) === '—' ? null : clean(positional[2]) });
}

// --- particles -------------------------------------------------------------------------------------------------
// Particles (Java Edition): the JE column of the ID table. A JE cell may span several Bedrock rows (rowspan), so
// a row whose first cell is a code cell starts a JE id only while no earlier JE cell still spans it.
const particlePage = page('Particles_Java');
revisions['Particles (Java Edition)'] = particlePage.revid;
const particles = new Set();
{
  // The page splits the particles over several tables (by category); every one has the same two ID columns.
  let spanLeft = 0;
  // Every row of every table: the tables nest (a cell holds one), so their boundaries are not cut on; only a table
  // row begins with a {{code}} cell.
  const body = particlePage.text.slice(particlePage.text.indexOf('{|'));
  const rows = body.split(/\n\|-/).slice(1).map((r) => r.split(/\n\|\}/)[0]);
  for (const row of rows) {
    const cells = row.split(/\n\||\|\|/).map((c) => c.trim()).filter(Boolean);
    const first = cells[0] ?? '';
    const code = /\{\{code\|([a-z0-9_]+)\}\}/.exec(first);
    if (spanLeft > 0) { spanLeft--; continue; }
    if (!code) continue;
    particles.add(code[1]);
    const span = /rowspan="?(\d+)/.exec(first);
    spanLeft = span ? Number(span[1]) - 1 : 0;
  }
}

// --- write ---------------------------------------------------------------------------------------------------
const out = `// GENERATED by scripts/generate-systems-wiki-data.mjs from the Minecraft Wiki (Java Edition) -- do not edit by hand.
// Page revisions: ${JSON.stringify(revisions)}

/** Every Java trade on the Trading page: a villager profession's (with its level, stock, experience and price multiplier) or the wandering trader's. */
export const WIKI_TRADES = [
${trades.map((t) => `  ${JSON.stringify(t)},`).join('\n')}
];

/** The Brewing page's recipe tables: each potion's recipes (ingredient + the potions it is brewed into), its duration and its extended and enhanced forms' durations (Java's; null where there is none). */
export const WIKI_BREWING = [
${brewing.map((b) => `  ${JSON.stringify(b)},`).join('\n')}
];

/** The Enchantment page's list (Java rows): identifier, the enchantments it cannot share an item with, maximum level. */
export const WIKI_ENCHANTMENTS = [
${enchantments.map((e) => `  ${JSON.stringify(e)},`).join('\n')}
];

/** Enchanting table mechanics, "Receivable enchantments": what an enchanting table offers each item, with weight and per-level cost ranges. */
export const WIKI_TABLE_OFFERS = [
${offers.map((o) => `  ${JSON.stringify(o)},`).join('\n')}
];

/** The Effect page's list: name, identifier, type (Positive / Negative / Neutral), whether a higher level changes it, and any edition note. */
export const WIKI_EFFECTS = [
${effects.map((e) => `  ${JSON.stringify(e)},`).join('\n')}
];

/** The Smithing page: netherite upgrades, the armor trim templates and materials, and its trimming example's pairs. */
export const WIKI_SMITHING = ${JSON.stringify(smithing, null, 2)};

/** The Commands page's Java commands: OP level, whether multiplayer (or singleplayer) only, and the version that added each. */
export const WIKI_COMMANDS = [
${commands.map((c) => `  ${JSON.stringify(c)},`).join('\n')}
];

/** Redstone component facts, each with the page and the sentence it was read from. Durations are in game ticks. */
export const WIKI_REDSTONE = ${JSON.stringify(redstone, null, 2)};

/** The Advancement page's Java advancements: resource id, title, description and parent's title. */
export const WIKI_ADVANCEMENTS = [
${advancements.map((a) => `  ${JSON.stringify(a)},`).join('\n')}
];

/** Particles (Java Edition): every Java particle id. */
export const WIKI_PARTICLES = ${JSON.stringify([...particles].sort())};
`;
writeFileSync('src/systemsWikiData.js', out);
console.log(`trades ${trades.length}, potions ${brewing.length}, enchantments ${enchantments.length}, table offers ${offers.length}, effects ${effects.length}, smithing ${smithing.upgrades.length}+${smithing.templates.length}+${smithing.materials.length}, commands ${commands.length}, redstone facts ${Object.keys(redstone).length}, advancements ${advancements.length}, particles ${particles.size}`);
