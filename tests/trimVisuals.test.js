// How an armour trim looks, pinned without a browser.
//
// Reference: https://minecraft.wiki/w/Smithing and https://minecraft.wiki/w/Armor_Trim. The wiki documents the
// appearance in outline -- a pattern drawn over the armour in the trim material's colour, any piece taking any
// pattern, and "if the armor material matches the trim material, the palette is slightly darker" -- and publishes
// no textures or palette values. These tests pin that outline and the game's own drawings; the browser suite
// (`e2e/smithCommand.pw.js`) checks the same things on real icons, through the bot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ITEMS } from '../src/blocks.js';
import { TRIM_PATTERNS, TRIM_MATERIALS, calculateSmithingResult } from '../src/smithing.js';
import {
  TRIM_MOTIFS, TRIM_DOLL_MOTIFS, MOTIF_SIZE, TRIM_SLOTS, MATCHING_DARKER_FACTOR,
  relativeLuminance, contrastRatio, TRIM_DARKER_COLORS, trimEdgeCells, trimEdgeColor, dollArmourColor,
  armourSlotOf, armourOwnTrimMaterial, trimMatchesArmour, trimColorFor, hexToRgb, rgbToHex,
  motifCells, iconTrimCells, applyTrimToImage, dollTrimCells, dollTrimSvg, trimTooltipLine,
} from '../src/trimVisuals.js';
import { renderPlayerDollSVG } from '../src/playerDoll.js';

const read = (p) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

const ARMOUR = Object.keys(ITEMS).filter((id) => ITEMS[id].armorSlot && TRIM_SLOTS.includes(ITEMS[id].armorSlot));
const PATTERNS = Object.values(TRIM_PATTERNS);
const trimOf = (pattern, material) => ({ pattern, material });

/** A fully opaque RGBA image of the given size, transparent where `hole(x, y)` says so. */
function image(size, hole = () => false) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      if (hole(x, y)) continue;
      data[i] = 100; data[i + 1] = 100; data[i + 2] = 100; data[i + 3] = 255;
    }
  }
  return { width: size, height: size, data };
}
const pixel = (img, x, y) => [...img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];

// --- the 18 drawings ------------------------------------------------------------

test('there is a drawing for each of the 18 patterns, and for nothing else', () => {
  assert.deepEqual(Object.keys(TRIM_MOTIFS).sort(), [...PATTERNS].sort());
  assert.equal(PATTERNS.length, 18);
});

test('every drawing is a 5 x 5 picture of painted and empty cells', () => {
  for (const [pattern, rows] of Object.entries(TRIM_MOTIFS)) {
    assert.equal(rows.length, MOTIF_SIZE, `${pattern} has ${MOTIF_SIZE} rows`);
    for (const row of rows) {
      assert.equal(row.length, MOTIF_SIZE, `${pattern} rows are ${MOTIF_SIZE} wide`);
      assert.match(row, /^[#.]+$/, `${pattern} uses only # and .`);
    }
    assert.ok(motifCells(pattern).length >= 8, `${pattern} paints enough cells to be seen`);
    assert.ok(motifCells(pattern).length <= 20, `${pattern} leaves room for the armour to show through`);
  }
});

test('no two patterns draw the same picture, so a template choice is always visible', () => {
  const seen = new Map();
  for (const [pattern, rows] of Object.entries(TRIM_MOTIFS)) {
    const key = rows.join('/');
    assert.ok(!seen.has(key), `${pattern} repeats ${seen.get(key)}`);
    seen.set(key, pattern);
  }
});

// --- where a trim goes ----------------------------------------------------------

test('armour is recognised by the slot the item table gives it, and nothing else is', () => {
  assert.ok(ARMOUR.length >= 25, 'the game has its full set of armour pieces');
  assert.equal(armourSlotOf('iron_helmet'), 'head');
  assert.equal(armourSlotOf('diamond_chestplate'), 'chest');
  assert.equal(armourSlotOf('golden_leggings'), 'legs');
  assert.equal(armourSlotOf('netherite_boots'), 'feet');
  assert.equal(armourSlotOf('turtle_helmet'), 'head', 'the turtle shell takes a trim, as the wiki shows');
  for (const id of ['diamond_sword', 'elytra', 'shield', 'stick', 'not_an_item', null, undefined]) {
    assert.equal(armourSlotOf(id), null, `${String(id)} is not trimmable armour`);
  }
});

test('every armour piece has somewhere on its icon for every pattern', () => {
  for (const id of ARMOUR) {
    for (const pattern of PATTERNS) {
      assert.ok(iconTrimCells(id, pattern).length >= 8, `${pattern} on ${id}`);
    }
  }
  assert.deepEqual(iconTrimCells('diamond_sword', 'bolt'), [], 'a sword has no trim placement');
  assert.deepEqual(iconTrimCells('iron_helmet', 'nonsense'), [], 'an unknown pattern draws nothing');
});

test('every slot has somewhere on the doll for every pattern', () => {
  for (const slot of TRIM_SLOTS) {
    for (const pattern of PATTERNS) {
      assert.ok(dollTrimCells(slot, pattern).length >= 4, `${pattern} on the doll's ${slot}`);
    }
  }
});

test('a drawing stays inside the 16 x 16 icon, wherever it is placed', () => {
  for (const id of ARMOUR) {
    for (const pattern of PATTERNS) {
      for (const { x, y } of iconTrimCells(id, pattern)) {
        assert.ok(x >= 0 && x < 16 && y >= 0 && y < 16, `${pattern} on ${id} at ${x},${y}`);
      }
    }
  }
});

test('a drawing stays inside the 16 x 32 doll, wherever it is placed', () => {
  for (const slot of TRIM_SLOTS) {
    for (const pattern of PATTERNS) {
      for (const { x, y } of dollTrimCells(slot, pattern)) {
        assert.ok(x >= 0 && x < 16 && y >= 0 && y < 32, `${pattern} on ${slot} at ${x},${y}`);
      }
    }
  }
});

// --- colour, and the darker palette ---------------------------------------------

test('a trim takes its material\'s colour', () => {
  for (const [material, { color }] of Object.entries(TRIM_MATERIALS)) {
    assert.equal(trimColorFor('leather_chestplate', trimOf('bolt', material)), color.toLowerCase(), material);
  }
});

test('armour made of a trim material has a darker palette when trimmed with that material', () => {
  // The wiki: "Gold, iron, diamond, and netherite armor can be trimmed with their respective material",
  // and "If the armor material matches the trim material, the palette is slightly darker".
  const pairs = [
    ['golden_chestplate', 'gold_ingot'], ['iron_helmet', 'iron_ingot'],
    ['diamond_leggings', 'diamond'], ['netherite_boots', 'netherite_ingot'],
  ];
  for (const [id, material] of pairs) {
    const trim = trimOf('eye', material);
    assert.equal(trimMatchesArmour(id, trim), true, `${id} with ${material} matches`);
    const plain = hexToRgb(TRIM_MATERIALS[material].color);
    const darker = hexToRgb(trimColorFor(id, trim));
    for (let c = 0; c < 3; c++) {
      assert.ok(darker[c] < plain[c] || plain[c] === 0, `${id}: channel ${c} is darker`);
      
    }
    const luminanceRatio=relativeLuminance(trimColorFor(id,trim))/relativeLuminance(TRIM_MATERIALS[material].color);
    assert.ok(Math.abs(luminanceRatio-MATCHING_DARKER_FACTOR)<.015, `${id}: gentler darkening in linear light`);
  }
});

test('every other pairing keeps the material\'s own colour', () => {
  // Armour with no trim material of its own never matches, and matching is per material, not per armour type.
  for (const id of ['leather_chestplate', 'chainmail_helmet', 'turtle_helmet']) {
    assert.equal(armourOwnTrimMaterial(id), null, `${id} has no material of its own`);
    for (const material of Object.keys(TRIM_MATERIALS)) {
      assert.equal(trimMatchesArmour(id, trimOf('rib', material)), false, `${id} + ${material}`);
    }
  }
  assert.equal(trimMatchesArmour('golden_chestplate', trimOf('rib', 'iron_ingot')), false, 'gold armour, iron trim');
  assert.equal(trimMatchesArmour('iron_chestplate', trimOf('rib', 'gold_ingot')), false, 'iron armour, gold trim');
  assert.equal(trimColorFor('iron_chestplate', trimOf('rib', 'gold_ingot')), '#deb12d');
  assert.equal(armourOwnTrimMaterial('diamond_sword'), null, 'a sword is not armour');
});

test('the colour is read from the material, so an old record with a stale colour still draws in the current palette', () => {
  const stale = { pattern: 'bolt', material: 'emerald', color: '#000000' };
  assert.equal(trimColorFor('iron_chestplate', stale), TRIM_MATERIALS.emerald.color.toLowerCase());
  assert.equal(trimColorFor('iron_chestplate', { pattern: 'bolt', material: 'unobtainium' }), null, 'an unknown material has no colour');
});

test('hex and rgb round-trip', () => {
  assert.deepEqual(hexToRgb('#11A036'), [17, 160, 54]);
  assert.equal(rgbToHex([17, 160, 54]), '#11a036');
  assert.equal(hexToRgb('nope'), null);
  assert.equal(rgbToHex([300, -5, 0]), '#ff0000', 'out-of-range channels clamp');
});

// --- painting an icon -----------------------------------------------------------

test('a trim is painted exactly where the drawing is, in the trim colour', () => {
  const img = image(16);
  const trim = trimOf('sentry', 'gold_ingot');
  const painted = applyTrimToImage(img, 'iron_chestplate', trim, {outline:false});
  const cells = iconTrimCells('iron_chestplate', 'sentry');
  assert.equal(painted, cells.length, 'every cell of the drawing lands on opaque pixels here');
  const [r, g, b] = hexToRgb('#deb12d');
  for (const { x, y } of cells) assert.deepEqual(pixel(img, x, y), [r, g, b, 255], `${x},${y}`);
  const inside = new Set(cells.map(({ x, y }) => `${x},${y}`));
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      if (!inside.has(`${x},${y}`)) assert.deepEqual(pixel(img, x, y), [100, 100, 100, 255], `${x},${y} untouched`);
    }
  }
});

test('a trim never paints a pixel the icon does not already paint', () => {
  // Transparent parts of an icon -- the neck opening, the gap between the legs -- stay transparent.
  const img = image(16, (x) => x >= 5 && x <= 9);
  const painted = applyTrimToImage(img, 'iron_chestplate', trimOf('snout', 'emerald'));
  assert.equal(painted, 0, 'the drawing sits entirely over the hole, so nothing is painted');
  for (let y = 0; y < 16; y++) for (let x = 5; x <= 9; x++) assert.equal(pixel(img, x, y)[3], 0, `${x},${y} stays transparent`);
});

test('a larger icon gets a proportionally larger drawing', () => {
  const small = image(16);
  const large = image(32);
  const trim = trimOf('bolt', 'redstone');
  const a = applyTrimToImage(small, 'diamond_helmet', trim);
  const b = applyTrimToImage(large, 'diamond_helmet', trim);
  assert.equal(b, a * 4, 'a 32 x 32 icon paints four pixels for every one on a 16 x 16 icon');
});

test('painting a non-armour item, an unknown pattern or an unknown material changes nothing', () => {
  for (const [id, trim] of [
    ['diamond_sword', trimOf('bolt', 'gold_ingot')],
    ['iron_helmet', trimOf('nonsense', 'gold_ingot')],
    ['iron_helmet', trimOf('bolt', 'unobtainium')],
  ]) {
    const img = image(16);
    assert.equal(applyTrimToImage(img, id, trim), 0, `${id} ${trim.pattern} ${trim.material}`);
    assert.ok(img.data.every((v, i) => i % 4 === 3 ? v === 255 : v === 100), 'the image is unchanged');
  }
  assert.equal(applyTrimToImage(null, 'iron_helmet', trimOf('bolt', 'gold_ingot')), 0, 'no image is not an error');
});

test('two different patterns paint two different icons', () => {
  const painted = new Map();
  for (const pattern of PATTERNS) {
    const img = image(16);
    applyTrimToImage(img, 'iron_chestplate', trimOf(pattern, 'gold_ingot'));
    const key = Buffer.from(img.data).toString('base64');
    assert.ok(!painted.has(key), `${pattern} paints the same icon as ${painted.get(key)}`);
    painted.set(key, pattern);
  }
});

// --- the doll -------------------------------------------------------------------

test('a trimmed piece adds a trim group to the doll, an untrimmed one adds nothing', () => {
  assert.equal(dollTrimSvg('chest', { id: 'iron_chestplate' }), '');
  assert.equal(dollTrimSvg('chest', null), '');
  const svg = dollTrimSvg('chest', { id: 'iron_chestplate', trim: trimOf('rib', 'gold_ingot') });
  assert.match(svg, /id="trim-chest"/);
  assert.match(svg, /data-pattern="rib"/);
  assert.match(svg, /data-material="gold_ingot"/);
  assert.match(svg, /data-color="#deb12d"/);
  assert.equal((svg.match(/<rect /g) ?? []).length, dollTrimCells('chest', 'rib').length, 'one rect per painted cell');
});

test('the doll draws the trim on top of the armour, and only for pieces that have one', () => {
  const trim = trimOf('vex', 'lapis_lazuli');
  const svg = renderPlayerDollSVG({
    head: { id: 'iron_helmet', trim },
    chest: { id: 'iron_chestplate' },
    legs: { id: 'iron_leggings', trim },
    feet: null,
  });
  assert.match(svg, /id="trim-head"/);
  assert.doesNotMatch(svg, /id="trim-chest"/, 'the plain chestplate has no trim');
  assert.match(svg, /id="trim-legs"/);
  assert.doesNotMatch(svg, /id="trim-feet"/);
  assert.ok(svg.indexOf('id="armor-head"') < svg.indexOf('id="trim-head"'), 'the trim comes after the armour it decorates');
  assert.ok(svg.indexOf('id="armor-legs"') < svg.indexOf('id="trim-legs"'));
  assert.doesNotMatch(renderPlayerDollSVG({ chest: { id: 'iron_chestplate' } }), /trim-/, 'no trim anywhere when none is recorded');
});

test('what the smithing table makes is what the doll draws', () => {
  const made = calculateSmithingResult(
    { id: 'wild_armor_trim_smithing_template' }, { id: 'diamond_boots', count: 1 }, { id: 'amethyst_shard' },
  );
  assert.equal(made.valid, true);
  const svg = renderPlayerDollSVG({ feet: made.result });
  assert.match(svg, /id="trim-feet" data-pattern="wild" data-material="amethyst_shard"/);
});

// --- the tooltip ----------------------------------------------------------------

test('the tooltip names the pattern and the material, and is empty when there is no trim', () => {
  assert.equal(trimTooltipLine({ id: 'iron_chestplate', trim: trimOf('sentry', 'gold_ingot') }), 'Sentry Armor Trim · Gold Material');
  assert.equal(trimTooltipLine({ id: 'iron_chestplate', trim: trimOf('wayfinder', 'quartz') }), 'Wayfinder Armor Trim · Nether Quartz Material');
  assert.equal(trimTooltipLine({ id: 'iron_chestplate' }), '');
  assert.equal(trimTooltipLine(null), '');
  assert.equal(trimTooltipLine({ id: 'iron_chestplate', trim: trimOf('nonsense', 'gold_ingot') }), '', 'an unknown pattern says nothing');
});

// --- the wiring -----------------------------------------------------------------

test('every place that draws an item icon from a stack decorates it with the trim', () => {
  const ui = read('src/ui.js');
  assert.match(ui, /import \{ decorateTrimIcon \} from '\.\/trimIcon\.js'/);
  const render = ui.slice(ui.indexOf('  renderSlotContent(slotEl, item) {'), ui.indexOf('  bindFloatingCursor() {'));
  assert.match(render, /decorateTrimIcon\(img, item\)/, 'the slot renderer shared by every grid');
  const hotbar = ui.slice(ui.indexOf('slot.className = \'hotbar-slot\''), ui.indexOf('// Off-hand HUD slot update'));
  assert.match(hotbar, /decorateTrimIcon\(img, item\)/, 'the hotbar');
  const cursor = ui.slice(ui.indexOf('  updateFloatingCursor() {'), ui.indexOf('  updateFloatingCursor() {') + 2200);
  assert.match(cursor, /decorateTrimIcon\(icon, this\.inv\.cursorItem\)/, 'the stack on the cursor');
});

test('the tooltip suffix carries the trim whether or not advanced tooltips are on', () => {
  const ui = read('src/ui.js');
  const at = ui.indexOf('  advancedTooltipSuffix(item) {');
  const body = ui.slice(at, ui.indexOf('\n  }\n', at));
  assert.match(body, /trimTooltipLine\(item\)/);
  assert.doesNotMatch(body.split('const advanced')[0], /if \(!this\.advancedTooltips\) return/, 'the trim is not gated behind advanced tooltips');
});

test('both armour-slot tooltips add the trim', () => {
  const ui = read('src/ui.js');
  const sites = ui.split('let desc = `Armor: +${meta.armor || 0}`;').slice(1);
  assert.equal(sites.length, 2, 'the inventory and the creative view each have an armour tooltip');
  for (const site of sites) assert.match(site.slice(0, 400), /trimTooltipLine\(item\)/);
});

test('the doll imports the trim drawing rather than carrying its own', () => {
  assert.match(read('src/playerDoll.js'), /import \{ dollTrimSvg \} from '\.\/trimVisuals\.js'/);
});


test('icon designs remain distinct under every rotation and mirror',()=>{
  const seen=new Map();const rotate=rows=>rows[0].split('').map((_,x)=>rows.map(r=>r[x]).reverse().join(''));
  for(const [name,rows] of Object.entries(TRIM_MOTIFS)){
    let rotated=rows;
    for(let turn=0;turn<4;turn++){
      for(const transform of [rotated,rotated.map(r=>r.split('').reverse().join(''))]){
        const key=transform.join('/');assert.ok(!seen.has(key)||seen.get(key)===name,`${name} is a transformed ${seen.get(key)}`);seen.set(key,name);
      }
      rotated=rotate(rotated);
    }
  }
});

test('compact doll designs have complete, distinct purpose-drawn glyphs',()=>{
  for(const slot of TRIM_SLOTS){
    const designs=TRIM_DOLL_MOTIFS[slot];assert.deepEqual(Object.keys(designs).sort(),[...PATTERNS].sort());
    assert.equal(new Set(Object.values(designs).map(r=>r.join('/'))).size,18);
    for(const [pattern,rows] of Object.entries(designs)){
      assert.equal(rows.length,slot==='chest'?5:3);
      for(const row of rows)assert.match(row,slot==='feet'?/^[#.]{4}$/:/^[#.]{5}$/);
      const id=slot==='head'?'turtle_helmet':`netherite_${{chest:'chestplate',legs:'leggings',feet:'boots'}[slot]}`;
      for(const c of dollTrimCells(slot,pattern))assert.ok(dollArmourColor(slot,{id},c.x,c.y),`${slot}/${pattern} never draws onto skin`);
    }
  }
});

test('the eleven darker palettes reduce luminance gently, rather than crushing shadows',()=>{
  assert.equal(Object.keys(TRIM_DARKER_COLORS).length,11);
  for(const [id,color] of Object.entries(TRIM_DARKER_COLORS)){
    const ratio=relativeLuminance(color)/relativeLuminance(TRIM_MATERIALS[id].color);
    assert.ok(ratio>.76&&ratio<.8,id);
  }
  assert.equal(contrastRatio('#000000','#ffffff'),21);
});

test('contrast edges stay on opaque armour, preserve alpha and enclosed negative space',()=>{
  const img=image(16);for(let i=0;i<img.data.length;i+=4){img.data[i]=66;img.data[i+1]=58;img.data[i+2]=64;img.data[i+3]=i%12===0?100:255;}
  const original=Uint8ClampedArray.from(img.data);applyTrimToImage(img,'netherite_chestplate',trimOf('eye','netherite_ingot'));
  let edges=0;const glyph=new Set(iconTrimCells('netherite_chestplate','eye').map(c=>`${c.x},${c.y}`));
  for(let i=0;i<img.data.length;i+=4){
    assert.equal(img.data[i+3],original[i+3]);
    if(!glyph.has(`${i/4%16},${Math.floor(i/4/16)}`)&&img.data[i]!==original[i]){
      edges++;assert.ok(contrastRatio(rgbToHex([...img.data.slice(i,i+3)]),rgbToHex([...original.slice(i,i+3)]))>=3);
    }
  }
  assert.ok(edges>0);assert.deepEqual(pixel(img,6,7),[...original.slice((7*16+6)*4,(7*16+6)*4+4)],'eye cutout remains armour');
  const hole=image(16,()=>true);applyTrimToImage(hole,'netherite_chestplate',trimOf('eye','netherite_ingot'));assert.ok(hole.data.every(n=>n===0));
  assert.ok(!trimEdgeCells([{x:1,y:1}]).some(c=>c.x===1&&c.y===1));
  for(let v=0;v<=255;v++)assert.ok(contrastRatio(trimEdgeColor(rgbToHex([v,v,v])),rgbToHex([v,v,v]))>=3);
});


test('boot icon placements preserve the full vertical motif on the real four-column shafts',()=>{
  const seen=new Set();
  for(const pattern of PATTERNS){
    const img=image(16,(x,y)=>!(y>=7&&y<14&&((x>=3&&x<=6)||(x>=9&&x<=12))));
    applyTrimToImage(img,'leather_boots',trimOf(pattern,'gold_ingot'));
    const key=Buffer.from(img.data).toString('base64');assert.ok(!seen.has(key),pattern);seen.add(key);
    const ys=iconTrimCells('leather_boots',pattern).map(c=>c.y);assert.ok(Math.min(...ys)>=8&&Math.max(...ys)<=12);
  }
});


test('compact glyphs also avoid rotated or mirrored duplicates within each slot',()=>{
  const rotate=rows=>rows[0].split('').map((_,x)=>rows.map(r=>r[x]).reverse().join(''));
  for(const [slot,motifs] of Object.entries(TRIM_DOLL_MOTIFS)){
    const seen=new Map();
    for(const [name,rows] of Object.entries(motifs)){
      let a=rows;for(let i=0;i<4;i++){
        for(const b of [a,a.map(r=>r.split('').reverse().join(''))]){
          const key=b.join('/');assert.ok(!seen.has(key)||seen.get(key)===name,`${slot}/${name} is a transformed ${seen.get(key)}`);seen.set(key,name);
        }a=rotate(a);
      }
    }
  }
});
