// How an armour trim LOOKS: the 18 pattern drawings, where each sits on each armour piece, and the colour it takes.
//
// `smithing.js` decides what a trim IS (a pattern and a material recorded on the item). This file draws it.
// The wiki (https://minecraft.wiki/w/Smithing and /w/Armor_Trim) documents the appearance only in outline: a
// trim is a pattern drawn over the armour in the colour of its material, any armour piece takes any pattern,
// and "if the armor material matches the trim material, the palette is slightly darker" -- that last rule is
// why gold, iron, diamond and netherite armour trimmed with their own material read darker than the rest.
// The drawings are original engravings for this game, not copied texture assets.
// Palette values and contrast edges are our own design choices, not wiki-specified colours.
//
// Nothing here touches the DOM or a renderer, so the same code that decorates an icon in the browser is the code
// the tests run on a plain RGBA buffer.
import { TRIM_MOTIFS, TRIM_DOLL_MOTIFS } from './trimMotifs.js';
import { ARMOR_PALETTES, getArmorMaterial } from './armourPalettes.js';
import { ITEMS } from './blocks.js';
import { TRIM_MATERIALS, TRIM_PATTERNS, trimOf } from './smithing.js';

/** Every pattern is drawn on a 5 x 5 grid; `#` is a painted pixel. */
export const MOTIF_SIZE = 5;

/**
 * The 18 pattern drawings, keyed by the bare pattern name `smithing.js` records on the item.
 *
 * Each one is a small picture of what its name stands for rather than a vanilla texture: bolt is a lightning
 * stroke, eye is an eye, snout is a piglin's wide nose with its two nostrils, rib is a ribcage, and so on.
 * They are all distinct, which a test pins, because two patterns that drew the same would make a smithing
 * template choice invisible.
 */
export { TRIM_MOTIFS, TRIM_DOLL_MOTIFS, TRIM_DESCRIPTIONS } from './trimMotifs.js';

/** The four slots an armour piece can occupy, the same names `armorSlot` uses in the item table. */
export const TRIM_SLOTS = ['head', 'chest', 'legs', 'feet'];

/** The slot an item is worn in, or null for anything that is not armour. */
export function armourSlotOf(itemId) {
  const slot = ITEMS[itemId]?.armorSlot;
  return TRIM_SLOTS.includes(slot) ? slot : null;
}

/**
 * Where a pattern is stamped on a 16 x 16 item icon: top-left corner of the 5 x 5 drawing, per slot.
 *
 * Chosen against the real icons' silhouettes, so each drawing lands on the body of the piece (the helmet's
 * brow, the chestplate's chest, the leggings' waist, the toe of each boot). A pixel that falls on a
 * transparent part of the icon -- the gap between the legs, the neck opening -- is never painted: the trim
 * stays inside the armour.
 */
const ICON_ANCHORS = {
  head: [[5, 5]],
  chest: [[5, 5]],
  legs: [[5, 3]],
  feet: [[2, 8], [9, 8]],
};

/** The turtle shell is a shorter piece than a helmet, so its drawing sits higher. */
const ICON_ANCHOR_OVERRIDES = { turtle_helmet: [[5, 3]] };

/**
 * Where a purpose-drawn glyph is stamped on the 16 x 32 player doll.
 * Helmet and belt use 5 x 3 summaries; each boot uses 4 x 3 to fit its actual silhouette.
 */
const DOLL_PLACEMENTS = {
  head:[[5,0]], chest:[[5,10]], legs:[[5,19]], feet:[[4,28],[8,28]],
};

/**
 * Which trim material an armour piece is made of, when it is one a trim can be made from.
 *
 * Only iron, gold, diamond and netherite armour have a trim material of their own -- the wiki: "Gold, iron,
 * diamond, and netherite armor can be trimmed with their respective material". Leather, chainmail and the turtle
 * shell have none, so a trim on them is never "matching".
 */
const ARMOUR_OWN_MATERIAL = {
  iron_: 'iron_ingot',
  golden_: 'gold_ingot',
  diamond_: 'diamond',
  netherite_: 'netherite_ingot',
};

export function armourOwnTrimMaterial(itemId) {
  const id = String(itemId ?? '');
  if (!armourSlotOf(id)) return null;
  for (const [prefix, material] of Object.entries(ARMOUR_OWN_MATERIAL)) {
    if (id.startsWith(prefix)) return material;
  }
  return null;
}

/** True when a trim is made of the same material as the armour it is on, which is what darkens its palette. */
export function trimMatchesArmour(itemId, trim) {
  return Boolean(trim?.material) && armourOwnTrimMaterial(itemId) === trim.material;
}

/**
 * How much darker a matching trim is. The wiki says only "slightly darker" and publishes no values, so this is
 * the game's approximation: linear-light luminance at 78 per cent, preserving the hue. Contrast edges handle dark backgrounds.
 */
export const MATCHING_DARKER_FACTOR = 0.78;

/** `#rrggbb` as three channels. */
export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  return `#${[r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('')}`;
}

const toLinear = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const toSrgb = c => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
export function relativeLuminance(hex) {
  const rgb = hexToRgb(hex);
  return rgb ? rgb.map(c=>toLinear(c/255)).reduce((l,c,i)=>l+c*[0.2126,0.7152,0.0722][i],0) : null;
}
export function contrastRatio(a, b) {
  const x=relativeLuminance(a),y=relativeLuminance(b);
  return x===null || y===null ? 0 : (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function darkerTrimColor(hex) {
  const rgb=hexToRgb(hex);
  return rgb ? rgbToHex(rgb.map(c=>toSrgb(toLinear(c/255)*MATCHING_DARKER_FACTOR)*255)) : null;
}
export const TRIM_DARKER_COLORS = Object.fromEntries(Object.entries(TRIM_MATERIALS).map(([id,m])=>[id,darkerTrimColor(m.color)]));
export const TRIM_CONTRAST_TARGET = 3;
const EDGE_INKS = ['#10131c','#fff8e8'];
export function trimEdgeColor(background) {
  return EDGE_INKS.reduce((best,c)=>contrastRatio(c,background)>contrastRatio(best,background)?c:best);
}

// Only the exterior outline is eligible. Enclosed eye/nostril/spiral gaps
// remain the original armour, and filled motif pixels are never overwritten.
export function trimEdgeCells(cells) {
  if(!cells.length)return [];
  const key=(x,y)=>`${x},${y}`,filled=new Set(cells.map(c=>key(c.x,c.y)));
  const left=Math.min(...cells.map(c=>c.x))-1,right=Math.max(...cells.map(c=>c.x))+1;
  const top=Math.min(...cells.map(c=>c.y))-1,bottom=Math.max(...cells.map(c=>c.y))+1;
  const queue=[{x:left,y:top}],visited=new Set([key(left,top)]),edges=[];
  const directions=[[1,0],[-1,0],[0,1],[0,-1]];
  for(let i=0;i<queue.length;i++){
    const p=queue[i];let adjacent=false;
    for(const [dx,dy] of directions){
      const x=p.x+dx,y=p.y+dy,k=key(x,y);
      if(filled.has(k)){adjacent=true;continue;}
      if(x<left||x>right||y<top||y>bottom||visited.has(k))continue;
      visited.add(k);queue.push({x,y});
    }
    if(adjacent)edges.push(p);
  }
  return edges;
}

/**
 * The colour a trim is drawn in on a given armour piece.
 *
 * The material's own palette colour, or the darker one when the armour is made of that material. The colour is
 * looked up from the material id rather than read off the trim record's `color`, so a trim saved before a palette
 * change still draws in the current palette.
 */
export function trimColorFor(itemId, trim) {
  const base = TRIM_MATERIALS[trim?.material]?.color ?? trim?.color ?? null;
  const rgb = hexToRgb(base);
  if (!rgb) return null;
  if (!trimMatchesArmour(itemId, trim)) return rgbToHex(rgb);
  return TRIM_DARKER_COLORS[trim.material] ?? darkerTrimColor(base);
}

/** The painted cells of a pattern's drawing, as `{x, y}` in the 5 x 5 grid. */
export function motifCells(pattern) {
  const rows = TRIM_MOTIFS[pattern];
  if (!rows) return [];
  const cells = [];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') cells.push({ x, y }); }));
  return cells;
}

/** Every cell of a pattern's drawing, in the 16 x 16 icon grid, before the icon's silhouette trims it. */
export function iconTrimCells(itemId, pattern) {
  const slot = armourSlotOf(itemId);
  if (!slot || !TRIM_MOTIFS[pattern]) return [];
  const anchors = ICON_ANCHOR_OVERRIDES[itemId] ?? ICON_ANCHORS[slot];
  const cells = [];
  for (const [ax, ay] of anchors) {
    for (const { x, y } of motifCells(pattern)) cells.push({ x: ax + x, y: ay + y });
  }
  return cells;
}

/**
 * Paint a trim onto an item icon, in place.
 *
 * @param {{width: number, height: number, data: Uint8ClampedArray|number[]}} image an RGBA image of the armour icon
 * @param {string} itemId the armour piece
 * @param {object} trim the trim recorded on it
 * @returns {number} how many pixels were painted
 *
 * The icon is a 16 x 16 grid scaled up by whole numbers, so a larger icon gets a larger drawing. Only pixels the
 * icon already paints (alpha above zero) take the trim, which keeps it on the armour.
 */
export function applyTrimToImage(image, itemId, trim, { outline = true } = {}) {
  const rgb = hexToRgb(trimColorFor(itemId, trim));
  if (!rgb || !image?.data) return 0;
  const scale = Math.max(1, Math.round(image.width / 16));
  const cells=iconTrimCells(itemId, trim.pattern);
  const paintedCells=cells.filter(({x,y})=>{
    for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
      const px=x*scale+dx,py=y*scale+dy;
      if(px>=0&&py>=0&&px<image.width&&py<image.height&&image.data[(py*image.width+px)*4+3])return true;
    }
    return false;
  });
  if(outline){
    const fill=rgbToHex(rgb), directions=[[1,0],[-1,0],[0,1],[0,-1]];
    const needsEdge=new Set(paintedCells.filter(({x,y})=>{
      const i=((y*scale)*image.width+x*scale)*4;
      return contrastRatio(fill,rgbToHex([...image.data.slice(i,i+3)]))<TRIM_CONTRAST_TARGET;
    }).map(({x,y})=>`${x},${y}`));
    for(const {x,y} of trimEdgeCells(paintedCells)){
      if(!directions.some(([dx,dy])=>needsEdge.has(`${x+dx},${y+dy}`)))continue;
      for(let dy=0;dy<scale;dy++)for(let dx=0;dx<scale;dx++){
        const px=x*scale+dx,py=y*scale+dy;
        if(px<0||py<0||px>=image.width||py>=image.height)continue;
        const i=(py*image.width+px)*4;if(!image.data[i+3])continue;
        const ink=hexToRgb(trimEdgeColor(rgbToHex([...image.data.slice(i,i+3)])));
        for(let c=0;c<3;c++)image.data[i+c]=ink[c];
      }
    }
  }
  let painted = 0;
  for (const { x, y } of cells) {
    for (let dy = 0; dy < scale; dy++) {
      for (let dx = 0; dx < scale; dx++) {
        const px = x * scale + dx;
        const py = y * scale + dy;
        if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
        const i = (py * image.width + px) * 4;
        if (image.data[i + 3] === 0) continue;
        image.data[i] = rgb[0];
        image.data[i + 1] = rgb[1];
        image.data[i + 2] = rgb[2];
        // Preserve the icon's original alpha, including antialiased silhouettes.
        painted++;
      }
    }
  }
  return painted;
}

/** The painted cells of a pattern on the player doll for one slot, in the doll's 16 x 32 grid. */
export function dollTrimCells(slot, pattern) {
  const placements = DOLL_PLACEMENTS[slot];
  const rows = TRIM_DOLL_MOTIFS[slot]?.[pattern];
  if (!placements || !rows) return [];
  const cells=[];
  for (const [ox,oy] of placements) rows.forEach((row,y)=>[...row].forEach((c,x)=>{
    if(c==='#')cells.push({x:ox+x,y:oy+y});
  }));
  return cells;
}

/**
 * The SVG group that draws a trim over one armour piece on the doll, or '' when the piece has no trim.
 *
 * `data-pattern` and `data-material` are there so a test (and the bot) can read what is drawn without
 * measuring pixels.
 */
export function dollTrimSvg(slot, item) {
  const trim = trimOf(item);
  if (!trim) return '';
  const color = trimColorFor(item.id, trim);
  const cells = dollTrimCells(slot, trim.pattern);
  if (!color || !cells.length) return '';
  const rects = cells.map(({ x, y }) => `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}" />`).join('');
  const needsEdge=new Set(cells.filter(c=>contrastRatio(color,dollArmourColor(slot,item,c.x,c.y))<TRIM_CONTRAST_TARGET).map(c=>`${c.x},${c.y}`));
  const paths=trimEdgeCells(cells).filter(c=>[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>needsEdge.has(`${c.x+dx},${c.y+dy}`))).map(c=>{
    const background=dollArmourColor(slot,item,c.x,c.y);
    return background ? `<path d="M${c.x} ${c.y}h1v1h-1z" fill="${trimEdgeColor(background)}" />` : '';
  }).join('');
  return `<g id="trim-${slot}" data-pattern="${trim.pattern}" data-material="${trim.material}" data-color="${color}"><g data-trim-edge="true">${paths}</g>${rects}</g>`;
}

// Coverage/shading of the existing front-view doll's armour rectangles, in draw order.
export function dollArmourColor(slot,item,x,y){
  const p=ARMOR_PALETTES[getArmorMaterial(item)];if(!p)return null;
  const regions={
    head:[[3,0,10,2,'main'],[6,0,4,1,'light'],[3,2,2,5,'main'],[11,2,2,5,'dark'],[5,2,6,1,'main'],[7,3,2,2,'dark'],[4,7,8,1,'main']],
    chest:[[0,8,4,5,'main'],[0,8,4,1,'light'],[12,8,4,5,'dark'],[12,8,4,1,'main'],[4,8,8,11,'main'],[7,8,2,2,null],[5,10,2,6,'light'],[9,10,2,6,'dark'],[4,18,8,1,'dark']],
    legs:[[4,19,8,3,'main'],[7,19,2,2,'light'],[4,22,4,6,'main'],[4,25,3,2,'light'],[8,22,4,6,'dark'],[9,25,3,2,'main']],
    feet:[[3,27,5,1,'light'],[4,28,4,4,'main'],[3,30,5,2,'dark'],[8,27,5,1,'main'],[8,28,4,4,'dark'],[8,30,5,2,'accent']],
  };
  let color=null;
  for(const [ox,oy,w,h,role] of regions[slot] || [])if(x>=ox&&x<ox+w&&y>=oy&&y<oy+h)color=role?p[role]:null;
  return color;
}

const title = (word) => String(word).charAt(0).toUpperCase() + String(word).slice(1);

/** The tooltip text for a trim, or '' when the item has none. */
export function trimTooltipLine(item) {
  const trim = trimOf(item);
  if (!trim || !TRIM_PATTERNS[`${trim.pattern}_armor_trim_smithing_template`]) return '';
  const material = TRIM_MATERIALS[trim.material]?.name ?? trim.name ?? trim.material;
  return `${title(trim.pattern)} Armor Trim · ${material} Material`;
}
