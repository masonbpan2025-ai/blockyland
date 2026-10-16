// The Agent Terminal's model list, kept current from the vendors themselves.
//
// The list used to be fixed in agentProviders.js, so when a vendor released a model (Opus 5.5 becoming Opus 5.6)
// the terminal could not offer it until someone edited the code, and when a vendor retired one the stored choice
// simply failed. Every vendor publishes a "list models" endpoint that takes the same key as chat, so:
//
//   * the list is fetched live with the player's key and cached for a day (listModelsRequest, parseModelList);
//   * the built-in list stays, for its descriptions and as the fallback with no key or no network (mergeModels);
//   * models belong to families (claude-opus 5.5 and 5.6, gemini-flash 3.7 and 3.8), so a newer one in the
//     player's family can be offered, or chosen automatically if they ask for that (newerInFamily);
//   * a model the vendor has retired is replaced by the newest of its family instead of failing (replacementFor).
//
// Free of DOM and network code: the agent does the fetching, the Node tests drive these functions directly.

export const MODEL_CACHE_PREFIX = 'mc_agent_models_';
export const AUTO_UPGRADE_PREFIX = 'mc_agent_autoupgrade_';
export const MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const ENDPOINTS = {
  claude: 'https://api.anthropic.com/v1/models?limit=100',
  chatgpt: 'https://api.openai.com/v1/models',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=200',
  deepseek: 'https://api.deepseek.com/models'
};

/** The HTTP request that lists a vendor's models, with the same authentication as its chat endpoint. */
export function listModelsRequest(vendorId, apiKey, { apiVersion = '2023-06-01' } = {}) {
  const url = ENDPOINTS[vendorId];
  if (!url) return null;
  if (vendorId === 'claude') {
    return { url, headers: { 'x-api-key': apiKey || '', 'anthropic-version': apiVersion, 'anthropic-dangerous-direct-browser-access': 'true' } };
  }
  if (vendorId === 'gemini') return { url, headers: { 'x-goog-api-key': apiKey || '' } };
  return { url, headers: { Authorization: `Bearer ${apiKey || ''}` } };
}

// OpenAI's list holds every kind of model. These are the ones that cannot answer a chat request.
const NOT_CHAT = /embedding|whisper|tts|dall-e|davinci|babbage|moderation|transcribe|audio|realtime|image|search|computer-use|sora|codex-mini|instruct/i;

/** A display label from an id, for models the built-in list has never heard of: claude-opus-5-6 -> Claude Opus 5.6. */
export function labelFromId(id) {
  const { family, version } = parseModelId(id);
  const words = family.split('-').filter(Boolean).map(w => (w.length <= 3 && /^(gpt|o\d?)$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)));
  return version.length ? `${words.join(' ')} ${version.join('.')}` : words.join(' ') || id;
}

/**
 * Normalise one vendor's list response into `{id, label, created}` for chat-capable models, newest first.
 * Anything malformed is skipped rather than thrown: a surprise in the response must not empty the list.
 */
export function parseModelList(vendorId, data) {
  let rows = [];
  if (vendorId === 'gemini') {
    rows = (Array.isArray(data?.models) ? data.models : [])
      .filter(m => !Array.isArray(m?.supportedGenerationMethods) || m.supportedGenerationMethods.includes('generateContent'))
      .map(m => ({ id: String(m?.name || '').replace(/^models\//, ''), label: m?.displayName, created: 0 }))
      .filter(m => /^gemini-/i.test(m.id) && !/embedding|aqa|imagen|tts|image-generation|live/i.test(m.id));
  } else {
    rows = (Array.isArray(data?.data) ? data.data : [])
      .map(m => ({
        id: String(m?.id || ''),
        label: m?.display_name,
        created: m?.created_at ? Date.parse(m.created_at) || 0 : (Number(m?.created) || 0) * 1000
      }));
    if (vendorId === 'chatgpt') rows = rows.filter(m => /^(gpt|o\d|chatgpt)/i.test(m.id) && !NOT_CHAT.test(m.id));
    if (vendorId === 'claude') rows = rows.filter(m => /^claude-/i.test(m.id));
  }
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    out.push({ id: row.id, label: row.label || labelFromId(row.id), created: row.created || 0 });
  }
  return out.sort((a, b) => compareNewest(a, b));
}

/**
 * Split an id into its family and version.
 *
 *   claude-opus-5-5          -> family claude-opus,   version [5, 5]
 *   claude-sonnet-4-5-20250929 -> family claude-sonnet, version [4, 5], snapshot 20250929
 *   gemini-3.8-flash         -> family gemini-flash,  version [3, 8]
 *   gpt-6.1-sol              -> family gpt-sol,       version [6, 1]
 *   deepseek-v4-pro          -> family deepseek-pro,  version [4]
 *
 * Previews and experiments keep a `preview` flag, so a stable choice is never "upgraded" to one.
 */
export function parseModelId(id) {
  const tokens = String(id || '').toLowerCase().split('-').filter(Boolean);
  const family = [];
  const version = [];
  let snapshot = null;
  for (const token of tokens) {
    // A date: 20250929, or the 2024 of 2024-08-06. No model version is in the thousands.
    if (/^\d{8}$/.test(token) || (/^\d{4}$/.test(token) && Number(token) >= 2000)) {
      snapshot = (snapshot ? snapshot + '-' : '') + token;
    } else if (/^\d{2}$/.test(token) && snapshot) {
      snapshot += '-' + token; // the month and day of a 2024-08-06 style date
    } else if (/^v?\d+(\.\d+)*$/.test(token) && !snapshot) {
      version.push(...token.replace(/^v/, '').split('.').map(Number));
    } else {
      family.push(token);
    }
  }
  const preview = family.some(t => /^(preview|exp|experimental|latest|beta|alpha)$/.test(t));
  return { family: family.filter(t => !/^(preview|exp|experimental|latest|beta|alpha)$/.test(t)).join('-'), version, snapshot, preview };
}

function compareVersions(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/** Newest first: by version within a family, then by release date, then by id. */
function compareNewest(a, b) {
  const pa = parseModelId(a.id), pb = parseModelId(b.id);
  if (pa.family === pb.family) {
    const v = compareVersions(pb.version, pa.version);
    if (v) return v;
  }
  if ((b.created || 0) !== (a.created || 0)) return (b.created || 0) - (a.created || 0);
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The newest model in the same family as `current` that is newer than it, or null.
 * A stable model is only ever moved to another stable one; a dated snapshot counts as its base version.
 */
export function newerInFamily(current, models) {
  const mine = parseModelId(current);
  if (!mine.family || !mine.version.length) return null;
  let best = null;
  for (const model of models || []) {
    const other = parseModelId(model.id);
    if (other.family !== mine.family || (other.preview && !mine.preview)) continue;
    if (compareVersions(other.version, mine.version) <= 0) continue;
    if (!best || compareVersions(other.version, parseModelId(best.id).version) > 0) best = model;
  }
  return best;
}

/** For a retired model: the newest available one in its family, else the first listed. */
export function replacementFor(retired, models, fallback = null) {
  const list = (models || []).filter(m => m.id !== retired);
  const mine = parseModelId(retired);
  const family = list.filter(m => parseModelId(m.id).family === mine.family && !parseModelId(m.id).preview);
  const pick = family.sort(compareNewest)[0] || list.find(m => m.id === fallback) || list[0];
  return pick || null;
}

/**
 * The list the dropdown shows. With a live list, that list is the truth (it is what this key can use) and the
 * built-in entries lend it their labels and notes; a model only the live list knows is marked `isNew`. Without
 * one, the built-in list is used as it always was.
 */
export function mergeModels(builtIn, live) {
  const notes = new Map((builtIn || []).map(m => [m.id, m]));
  if (!Array.isArray(live) || !live.length) return (builtIn || []).map(m => ({ ...m, source: 'built-in' }));
  return live.map(m => {
    const known = notes.get(m.id);
    return known
      ? { ...m, label: known.label || m.label, note: known.note, source: 'live' }
      : { ...m, note: m.note || '', isNew: true, source: 'live' };
  });
}

// --- The cache ---------------------------------------------------------------------------------------------

export function readCachedModels(store, vendorId, now = Date.now()) {
  if (!store) return null;
  try {
    const raw = store.getItem(MODEL_CACHE_PREFIX + vendorId);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!Array.isArray(entry?.models)) return null;
    return { models: entry.models, fetchedAt: Number(entry.fetchedAt) || 0, stale: now - (Number(entry.fetchedAt) || 0) > MODEL_CACHE_TTL_MS };
  } catch {
    return null;
  }
}

export function writeCachedModels(store, vendorId, models, now = Date.now()) {
  if (!store) return;
  try {
    store.setItem(MODEL_CACHE_PREFIX + vendorId, JSON.stringify({ fetchedAt: now, models }));
  } catch {
    // A full or blocked store just means the list is fetched again next time.
  }
}

export function clearCachedModels(store, vendorId) {
  try { store?.removeItem(MODEL_CACHE_PREFIX + vendorId); } catch { /* nothing to clear */ }
}

/** True when an HTTP failure means "that model does not exist (any more)", as opposed to a key or quota problem. */
export function isUnknownModelError(status, detail = '') {
  const text = String(detail || '');
  if (/thinking|budget|thinkinglevel|generation_config|generationconfig/i.test(text)) return false;
  if (status === 404) return /model|not[_ ]found/i.test(text) || !text;
  if (status === 400) return /(model|models\/).{0,80}(not found|does not exist|not exist|is not supported|unknown|invalid|deprecated|retired|decommissioned)|unknown model|invalid model|model_not_found|not_found_error/i.test(text);
  return false;
}
