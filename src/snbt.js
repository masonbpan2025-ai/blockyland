// Stringified NBT, as the NBT format page describes it (Java Edition): compounds {key: value}, lists [a, b],
// typed arrays [B; 1b, 2b], strings in single or double quotes or bare, and numbers with a type suffix
// (b byte, s short, l long, f float, d double; no suffix: int, or double when it has a point). Booleans are bytes.
// Parsed to plain JS values, with the numeric type kept on a wrapper where it matters for printing.

export class SnbtError extends Error {}

export function parseSnbt(text) {
  let i = 0;
  const s = String(text ?? '');
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const expect = (ch) => { ws(); if (s[i] !== ch) throw new SnbtError(`Expected '${ch}' at ${i}`); i++; };
  const quoted = () => {
    const q = s[i++]; let out = '';
    while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; out += s[i++]; }
    if (s[i] !== q) throw new SnbtError('Unterminated string');
    i++;
    return out;
  };
  const bare = () => { const start = i; while (i < s.length && /[A-Za-z0-9_\-.+]/.test(s[i])) i++; return s.slice(start, i); };
  const scalar = (word) => {
    if (word === 'true') return 1; if (word === 'false') return 0;
    const m = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)([bslfd]?)$/i.exec(word);
    if (m) return Number(m[1]);
    return word; // an unquoted string
  };
  const value = () => {
    ws();
    if (s[i] === '{') {
      i++; const obj = {}; ws();
      if (s[i] === '}') { i++; return obj; }
      for (;;) {
        ws(); const key = s[i] === '"' || s[i] === "'" ? quoted() : bare();
        if (!key) throw new SnbtError(`Expected a key at ${i}`);
        expect(':'); obj[key] = value(); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return obj; }
        throw new SnbtError(`Expected ',' or '}' at ${i}`);
      }
    }
    if (s[i] === '[') {
      i++; ws();
      if (/[BIL]/.test(s[i]) && s[i + 1] === ';') i += 2; // a typed array
      const list = []; ws();
      if (s[i] === ']') { i++; return list; }
      for (;;) {
        list.push(value()); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return list; }
        throw new SnbtError(`Expected ',' or ']' at ${i}`);
      }
    }
    if (s[i] === '"' || s[i] === "'") return quoted();
    const word = bare();
    if (!word) throw new SnbtError(`Unexpected '${s[i] ?? 'end'}' at ${i}`);
    return scalar(word);
  };
  const out = value(); ws();
  if (i < s.length) throw new SnbtError(`Trailing data at ${i}`);
  return out;
}

/** A value back to SNBT text, the way /data get prints it. */
export function toSnbt(v) {
  if (Array.isArray(v)) return `[${v.map(toSnbt).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${/^[A-Za-z0-9_\-.+]+$/.test(k) ? k : JSON.stringify(k)}: ${toSnbt(x)}`).join(', ')}}`;
  if (typeof v === 'string') return JSON.stringify(v);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : `${v}d`;
  if (typeof v === 'boolean') return v ? '1b' : '0b';
  return String(v);
}

/** Read a path ("Inventory[0].id", "Pos[1]", "a.b") out of a value. */
export function getPath(root, path) {
  if (!path) return root;
  let cur = root;
  for (const part of String(path).match(/[^.[\]]+|\[\d+\]/g) ?? []) {
    if (cur === undefined || cur === null) return undefined;
    cur = part.startsWith('[') ? cur[Number(part.slice(1, -1))] : cur[part.replace(/^"|"$/g, '')];
  }
  return cur;
}

/** Write a path in a value, creating compounds on the way. */
export function setPath(root, path, value) {
  const parts = String(path).match(/[^.[\]]+|\[\d+\]/g) ?? [];
  let cur = root;
  parts.forEach((part, n) => {
    const key = part.startsWith('[') ? Number(part.slice(1, -1)) : part;
    if (n === parts.length - 1) cur[key] = value;
    else { cur[key] ??= /^\[/.test(parts[n + 1]) ? [] : {}; cur = cur[key]; }
  });
  return root;
}

/** Remove a path. True when something was there. */
export function removePath(root, path) {
  const parts = String(path).match(/[^.[\]]+|\[\d+\]/g) ?? [];
  const last = parts.pop();
  const parent = parts.length ? getPath(root, parts.join('.')) : root;
  if (!parent) return false;
  const key = last.startsWith('[') ? Number(last.slice(1, -1)) : last;
  if (!(key in parent)) return false;
  if (Array.isArray(parent)) parent.splice(key, 1); else delete parent[key];
  return true;
}
