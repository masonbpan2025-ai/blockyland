// Parser for the wiki's {{layered blueprint}} drawings (village blueprints, and the Structure pages of other
// structures).
//
// A blueprint is a legend of single characters (`|S=Stripped Oak Log+top`, `|B=White Bed+top foot-rot270`, one per
// line or several on one line) and layers (`|----Layer 2|`, `|----Layers 1-3|`, `|----Layer -1 to -18|`,
// `|----Layer 0 (Ground)|`, `|----Layer 4a|`) each followed by rows of characters. Rows run north to south, columns
// west to east (top-down view). A page can hold several blueprints.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const BLUEPRINT_DIR = 'docs/structure-audit/wiki/Village_Blueprints';

/** "White Bed+top foot-rot270" -> { name: 'white bed', mods: ['top', 'foot'], rot: 270 } */
export function parseLegendValue(raw) {
  let value = raw.replace(/'''|\}\}/g, '').trim();
  let entity = null;
  if (/^EntitySprite:/i.test(value)) { entity = value.replace(/^EntitySprite:/i, '').trim().toLowerCase(); value = ''; }
  const rotMatch = value.match(/-rot(-?\d+)/i);
  let rot = rotMatch ? Number(rotMatch[1]) : 0;
  rot = ((rot % 360) + 360) % 360;
  value = value.replace(/-rot-?\d+/i, '');
  const [namePart, ...modParts] = value.split('+');
  const mods = modParts.join(' ').toLowerCase().replace(/-/g, ' ').split(/\s+/).filter(Boolean);
  if (entity) {
    const [kind, ...extra] = entity.split('+');
    return { name: '', mods: extra.map((m) => m.trim()), rot, entity: kind.trim() };
  }
  return { name: namePart.trim().toLowerCase(), mods, rot, entity };
}

/** A layer title -> { from, to, variant }: "Layer 2", "Layers 1-3", "Layer -1 to -18", "Layer 0 (Ground)", "Layer 4a". */
export function parseLayerTitle(title) {
  // "Layer 2, 3" (a comma list): the same drawing on each listed layer.
  const list = title.match(/Layers?\s*(-?\d+(?:\s*,\s*-?\d+)+)/i);
  if (list) {
    const values = list[1].split(',').map((v) => Number(v.trim()));
    return { from: Math.min(...values), to: Math.max(...values), variant: null, only: values };
  }
  const m = title.match(/Layers?\s*(-?\d+)([a-z])?(?![a-z])\s*(?:(?:-|–|—|to)\s*(-?\d+))?/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = m[3] !== undefined ? Number(m[3]) : a;
  return { from: Math.min(a, b), to: Math.max(a, b), variant: m[2] ?? null };
}

/** Every {{layered blueprint}} on a page. */
export function parseBlueprints(text, title = '') {
  const out = [];
  // The template name is case-insensitive on the wiki ({{Layered blueprint}} on the amethyst geode's page).
  const lower = text.toLowerCase();
  let index = lower.indexOf('{{layered blueprint');
  while (index >= 0) {
    const bp = parseOne(text.slice(index), title);
    if (bp) out.push(bp);
    index = lower.indexOf('{{layered blueprint', index + 10);
  }
  return out;
}

function parseOne(body, title) {
  const lines = body.split('\n');
  const legend = {};
  const layers = [];
  let current = null;
  let name = null;
  const readTokens = (line) => {
    for (const token of line.split('|')) {
      const kv = token.match(/^\s*(name|default)\s*=(.*)$/);
      if (kv) { if (kv[1] === 'name') name = kv[2].trim() || name; continue; }
      const entry = token.match(/^(.)=(.*)$/);
      if (entry && entry[2].trim()) legend[entry[1]] = parseLegendValue(entry[2]);
    }
  };
  readTokens(lines[0].replace(/\{\{layered blueprint/i, ''));
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const head = line.match(/^\|----\s*([^|]*)\|?\s*$/);
    if (head) {
      const parsed = parseLayerTitle(head[1]);
      current = parsed ? { ...parsed, rows: [] } : null;
      if (current) layers.push(current);
      continue;
    }
    if (/^\}\}/.test(line) || /^\{\||^==/.test(line)) break; // a page that forgets its closing braces
    if (!current) {
      if (line.startsWith('|')) readTokens(line.slice(1));
      else if (!name && line.trim()) name = line.trim();
      continue;
    }
    if (!line.startsWith('|')) current.rows.push(line.replace(/\}\}\s*$/, ''));
    if (/\}\}\s*$/.test(line)) break;
  }
  if (!layers.length) return null;
  // Expand ranges. A variant layer ("4a", "4b") keeps its letter; the first variant is the default drawing.
  const expanded = [];
  for (const layer of layers) for (let n = layer.from; n <= layer.to; n++) if (!layer.only || layer.only.includes(n)) expanded.push({ layer: n, variant: layer.variant, rows: layer.rows });
  expanded.sort((a, b) => a.layer - b.layer);
  return { title, name, legend, layers: expanded };
}

/** The first blueprint on a page (village pages hold one). */
export function parseBlueprint(text, title = '') {
  return parseBlueprints(text, title)[0] ?? null;
}

export function loadAllBlueprints(dir = BLUEPRINT_DIR) {
  const all = [];
  for (const type of readdirSync(dir)) {
    for (const file of readdirSync(join(dir, type))) {
      const text = readFileSync(join(dir, type, file), 'utf8');
      const parsed = parseBlueprint(text, `${type}/${file.replace(/\.txt$/, '')}`);
      if (parsed) all.push({ type, file, ...parsed });
    }
  }
  return all;
}

/** Every placed symbol: { x, z, layer, entry } with x = column, z = row. Variant layers other than the first are left out. */
export function cellsOf(bp, { variant = null } = {}) {
  const cells = [];
  const seenLayer = new Map();
  for (const { layer, rows, variant: v } of bp.layers) {
    if (v && variant === null) { if (seenLayer.has(layer) && seenLayer.get(layer) !== v) continue; seenLayer.set(layer, v); }
    if (v && variant !== null && v !== variant) continue;
    rows.forEach((row, z) => {
      [...row].forEach((ch, x) => {
        if (ch === ' ' || !bp.legend[ch]) return;
        cells.push({ x, z, layer, ch, entry: bp.legend[ch] });
      });
    });
  }
  return cells;
}
