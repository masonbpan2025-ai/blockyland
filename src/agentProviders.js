// Multi-vendor LLM provider layer for the in-game World Agent terminal.
//
// The agent plans against one JSON schema regardless of vendor, so this module
// owns everything vendor specific:
//   * the catalogue of vendors and selectable models
//   * which model / API key is active, persisted per vendor in localStorage
//   * request body assembly for each wire protocol
//   * extracting the assistant text + reasoning from each response shape
//
// It is deliberately free of DOM and three.js imports so the Node test runner
// can exercise it directly.

export const DEFAULT_VENDOR = 'deepseek';
export const STORAGE_PREFIX = 'mc_agent_';
export const LEGACY_GEMINI_KEY_STORAGE = 'gemini_api_key';
export const REASONSING_EFFORTS = ['minimal', 'low', 'medium', 'high', 'max'];

const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

function readEnv(name) {
  // Vite replaces import.meta.env at build time; plain Node leaves it undefined.
  try {
    const env = import.meta.env;
    return env && typeof env === 'object' ? env[name] : undefined;
  } catch {
    return undefined;
  }
}

function getStore() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Vendors and their selectable models.
 *
 * `effort` is only meaningful for vendors whose models accept a reasoning
 * effort control. DeepSeek enables thinking mode by default at `high`.
 */
export const VENDORS = {
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    vendorName: 'Google Gemini',
    docsLabel: 'aistudio.google.com',
    docsUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIzaSy...',
    keyHint: 'Create a key in Google AI Studio.',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
    models: [
      { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'Default. Latest flagship, fast & strong on agentic tasks.' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro (preview)', note: 'Deepest reasoning, slower.' },
      { id: 'gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'Previous generation Flash.' }
    ],
    defaultModel: 'gemini-3.8-flash',
    envVar: 'VITE_GEMINI_MODEL',
    supportsEffort: false,
    supportsImages: true
  },
  deepseek: {
    id: 'deepseek',
    label: 'DeepSeek',
    vendorName: 'DeepSeek',
    docsLabel: 'platform.deepseek.com',
    docsUrl: 'https://platform.deepseek.com/api_keys',
    keyPlaceholder: 'sk-...',
    keyHint: 'Create a key on the DeepSeek platform.',
    endpoint: 'https://api.deepseek.com/chat/completions',
    models: [
      { id: 'deepseek-flash', label: 'DeepSeek-V4.1-Flash', note: 'Default. Native vision, thinking mode on by default.' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro', note: 'Legacy alias, currently served by V4.1-Flash.' }
    ],
    defaultModel: 'deepseek-flash',
    defaultEffort: 'high',
    envVar: 'VITE_DEEPSEEK_MODEL',
    supportsEffort: true,
    supportsImages: true
  },
  chatgpt: {
    id: 'chatgpt',
    label: 'ChatGPT',
    vendorName: 'OpenAI ChatGPT',
    docsLabel: 'platform.openai.com',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
    keyHint: 'Create a key on the OpenAI platform.',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o', note: 'Recommended. Official OpenAI flagship multimodal model.' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini', note: 'Fast, affordable, vision-capable.' },
      { id: 'o3-mini', label: 'o3-mini', note: 'OpenAI advanced reasoning model.' },
      { id: 'gpt-6-astra', label: 'GPT-6 Astra', note: 'Default. Most capable OpenAI model.' },
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol', note: 'Balances intelligence and cost.' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna', note: 'Cheapest, best for high volume.' }
    ],
    defaultModel: 'gpt-6-astra',
    defaultEffort: 'medium',
    envVar: 'VITE_OPENAI_MODEL',
    supportsEffort: true,
    supportsImages: true
  },
  // Anthropic's Messages API. Browsers may call it directly when the request carries
  // `anthropic-dangerous-direct-browser-access`, which is how a player's own key is used here.
  claude: {
    id: 'claude',
    label: 'Claude',
    vendorName: 'Anthropic Claude',
    docsLabel: 'console.anthropic.com',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    billingUrl: 'https://console.anthropic.com/settings/billing',
    keyPlaceholder: 'sk-ant-...',
    keyHint: 'Create a key in the Anthropic Console.',
    endpoint: 'https://api.anthropic.com/v1/messages',
    apiVersion: '2023-06-01',
    models: [
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'Default. Fast and strong at building and spatial reasoning.' },
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'Most capable, for large or intricate builds. Slower.' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fastest and cheapest, good for quick questions.' },
      { id: 'claude-fable-5-1', label: 'Claude Fable 5.1', note: 'Creative writing and storytelling.' }
    ],
    defaultModel: 'claude-sonnet-5-5',
    defaultEffort: 'medium',
    envVar: 'VITE_CLAUDE_MODEL',
    supportsEffort: true,
    supportsImages: true
  }
};

/** Claude's effort levels; the terminal's "minimal" is Claude's "low". */
export function claudeEffort(effort) {
  const value = normalizeEffort(effort, 'medium');
  return value === 'minimal' ? 'low' : value;
}

export const VENDOR_IDS = Object.keys(VENDORS);

export function getVendor(id) {
  return VENDORS[id] || null;
}

export function getVendorLabel(id) {
  return VENDORS[id]?.label || String(id || 'Agent');
}

export function getVendorModels(id) {
  return (VENDORS[id]?.models || []).slice();
}

export function isKnownVendorModel(vendorId, modelId) {
  return getVendorModels(vendorId).some(model => model.id === modelId);
}

export function getDefaultModel(vendorId) {
  return VENDORS[vendorId]?.defaultModel || '';
}

export function getDefaultEffort(vendorId) {
  return VENDORS[vendorId]?.defaultEffort || '';
}

export function supportsEffort(vendorId) {
  return !!VENDORS[vendorId]?.supportsEffort;
}

export function normalizeVendor(id, fallback = DEFAULT_VENDOR) {
  return VENDORS[id] ? id : fallback;
}

export function normalizeEffort(effort, fallback = '') {
  const value = String(effort || '').trim().toLowerCase();
  if (REASONSING_EFFORTS.includes(value)) return value;
  return fallback;
}

export function resolveModel(vendorId, storedModel) {
  const vendor = VENDORS[vendorId];
  if (!vendor) return '';
  if (vendorId === 'gemini' && (!storedModel || /^gemini-[12]\./i.test(storedModel))) {
    return vendor.defaultModel;
  }
  if (isKnownVendorModel(vendorId, storedModel)) return storedModel;
  // A model the built-in list does not know is still the player's choice: one picked from the vendor's live list
  // (newer than this file) or typed as a custom id. It used to be discarded on reload. If the vendor has retired
  // it, the agent replaces it on the first failed request (agentModelCatalog.js).
  const stored = String(storedModel || '').trim();
  if (stored && /^[\w.:/-]{2,128}$/.test(stored)) return stored;
  const override = readEnv(vendor.envVar);
  if (override) return override;
  return vendor.defaultModel;
}

export function resolveEffort(vendorId, storedEffort) {
  const vendor = VENDORS[vendorId];
  if (!vendor || !vendor.supportsEffort) return '';
  const normalized = normalizeEffort(storedEffort, '');
  if (normalized) return normalized;
  return normalizeEffort(vendor.defaultEffort, 'high');
}

// --- Settings persistence ---------------------------------------------------

export class AgentSettings {
  constructor(store = getStore(), vendorOverride = null) {
    this.store = store;
    const stored = this.store ? this.store.getItem(`${STORAGE_PREFIX}vendor`) : null;
    this.vendor = normalizeVendor(vendorOverride || stored);
    this.models = {};
    this.keys = {};
    this.efforts = {};
    for (const id of VENDOR_IDS) {
      this.models[id] = resolveModel(id, this.store ? this.store.getItem(`${STORAGE_PREFIX}model_${id}`) : null);
      this.keys[id] = (this.store ? this.store.getItem(`${STORAGE_PREFIX}key_${id}`) : '') || this.#legacyKey(id);
      this.efforts[id] = resolveEffort(id, this.store ? this.store.getItem(`${STORAGE_PREFIX}effort_${id}`) : null);
    }
  }

  #legacyKey(vendorId) {
    if (vendorId !== 'gemini' || !this.store) return '';
    const legacy = this.store.getItem(LEGACY_GEMINI_KEY_STORAGE);
    return legacy || '';
  }

  modelFor(vendorId = this.vendor) {
    return this.models[vendorId] || resolveModel(vendorId, null);
  }

  effortFor(vendorId = this.vendor) {
    return this.efforts[vendorId] ?? resolveEffort(vendorId, null);
  }

  keyFor(vendorId = this.vendor) {
    return this.keys[vendorId] || '';
  }

  /** Whether to move to a newer model of the chosen family as soon as the vendor lists one. Off by default. */
  autoUpgradeFor(vendorId = this.vendor) {
    if (this.autoUpgrade && vendorId in this.autoUpgrade) return this.autoUpgrade[vendorId];
    try {
      return this.store?.getItem(`${STORAGE_PREFIX}autoupgrade_${vendorId}`) === '1';
    } catch {
      return false;
    }
  }

  setAutoUpgrade(vendorId, enabled) {
    if (!VENDORS[vendorId]) return false;
    (this.autoUpgrade ||= {})[vendorId] = !!enabled;
    try {
      if (enabled) this.store?.setItem(`${STORAGE_PREFIX}autoupgrade_${vendorId}`, '1');
      else this.store?.removeItem(`${STORAGE_PREFIX}autoupgrade_${vendorId}`);
    } catch {
      // Unavailable storage: the preference lasts for this session only.
    }
    return !!enabled;
  }

  setVendor(vendorId) {
    this.vendor = normalizeVendor(vendorId, this.vendor || DEFAULT_VENDOR);
    if (this.store) this.store.setItem(`${STORAGE_PREFIX}vendor`, this.vendor);
    return this.vendor;
  }

  setModel(vendorId, modelId) {
    if (!VENDORS[vendorId]) return '';
    const value = String(modelId || '').trim();
    if (!value) return this.models[vendorId];
    this.models[vendorId] = value;
    if (this.store) this.store.setItem(`${STORAGE_PREFIX}model_${vendorId}`, value);
    return value;
  }

  setEffort(vendorId, effort) {
    if (!VENDORS[vendorId]) return '';
    const value = normalizeEffort(effort, VENDORS[vendorId].defaultEffort || '');
    this.efforts[vendorId] = value;
    if (this.store) this.store.setItem(`${STORAGE_PREFIX}effort_${vendorId}`, value);
    return value;
  }

  setKey(vendorId, key) {
    if (!VENDORS[vendorId]) return '';
    const value = String(key || '').trim();
    this.keys[vendorId] = value;
    if (this.store) {
      if (value) {
        this.store.setItem(`${STORAGE_PREFIX}key_${vendorId}`, value);
      } else {
        this.store.removeItem(`${STORAGE_PREFIX}key_${vendorId}`);
      }
      if (vendorId === 'gemini') this.store.removeItem(LEGACY_GEMINI_KEY_STORAGE);
    }
    return value;
  }

  toJSON() {
    return { vendor: this.vendor, models: { ...this.models }, efforts: { ...this.efforts } };
  }
}

// --- Request assembly -------------------------------------------------------

export const DEFAULT_IMAGE_PROMPT = 'Describe what the player is looking at.';
export const DEFAULT_VIEW_PROMPT = 'This is a live screenshot of the player\'s current first-person view.';

// Reasoning tokens are billed against max_tokens, so a small budget lets a
// thinking model spend everything on its chain of thought and emit no JSON.
// DeepSeek's own default is 64K in thinking mode; the cap there is 384K.
export const MAX_OUTPUT_TOKENS = Object.freeze({
  chatgpt: 32768,
  deepseek: 65536,
  // Claude 5 models write up to 64K tokens in a streamed reply, and a large build needs it: a medieval town
  // spent all of a 16K budget before its plan arrived. A model with a lower ceiling says so, and the agent
  // retries at that ceiling (worldAgent.js).
  claude: 64000
});

/** Claude's budget with thinking off: the whole budget goes to the plan itself. */
export const CLAUDE_PLAIN_OUTPUT_TOKENS = 32000;

/** Token budget used for a vendor/model/thinking combination. */
export function getMaxOutputTokens(vendorId, { thinking = false } = {}) {
  // Claude's thinking tokens count against max_tokens too, so it gets the larger budget only while thinking.
  if (vendorId === 'claude') return thinking ? MAX_OUTPUT_TOKENS.claude : CLAUDE_PLAIN_OUTPUT_TOKENS;
  if (vendorId !== 'deepseek') return MAX_OUTPUT_TOKENS[vendorId] || 16384;
  // 8K when thinking is off, 64K (DeepSeek's documented default) when it is on.
  return thinking ? MAX_OUTPUT_TOKENS.deepseek : 8192;
}

function toDataUrl({ mimeType, base64 }) {
  return `data:${mimeType || 'image/png'};base64,${base64}`;
}

/**
 * Compress screenshots so a chat-turn payload stays small. Images are a context
 * hint, not the primary payload, so we cap the long edge and JPEG-encode.
 */
export function encodeScreenshotDataUrl(canvas, { maxWidth = 1024, quality = 0.72 } = {}) {
  if (!canvas || typeof canvas.width !== 'number' || canvas.width <= 0) return null;

  const scale = Math.min(1, maxWidth / canvas.width);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  let dataUrl;

  if (typeof document !== 'undefined' && document.createElement) {
    const target = document.createElement('canvas');
    target.width = width;
    target.height = height;
    const ctx = target.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(canvas, 0, 0, width, height);
    dataUrl = target.toDataURL('image/jpeg', quality);
  } else if (typeof canvas.toDataURL === 'function') {
    // Headless/test path: use the canvas as-is.
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  } else {
    return null;
  }

  const base64 = String(dataUrl).split(',')[1];
  if (!base64) return null;
  return { mimeType: 'image/jpeg', base64 };
}

function buildGeminiContents(history, turn) {
  const contents = history
    .filter(item => item && item.text)
    .map(item => ({ role: item.role === 'user' ? 'user' : 'model', parts: [{ text: item.text }] }));

  const parts = [];
  for (const attachment of turn.images) {
    parts.push({ inlineData: { mimeType: attachment.mimeType || 'image/png', data: attachment.base64 } });
    parts.push({ text: attachment.caption || DEFAULT_VIEW_PROMPT });
  }
  parts.push({ text: turn.prompt });
  contents.push({ role: 'user', parts });
  return contents;
}

function buildChatMessages(history, turn) {
  const systemPrompt = turn.systemPrompt;
  const messages = [{ role: 'system', content: systemPrompt }];
  for (const item of history) {
    if (!item || !item.text) continue;
    messages.push({ role: item.role === 'user' ? 'user' : 'assistant', content: item.text });
  }
  if (turn.images.length === 0) {
    messages.push({ role: 'user', content: turn.prompt });
  } else {
    const blocks = [];
    for (const attachment of turn.images) {
      blocks.push({ type: 'image_url', image_url: { url: toDataUrl(attachment), detail: 'high' } });
      if (attachment.caption) blocks.push({ type: 'text', text: attachment.caption });
    }
    blocks.push({ type: 'text', text: turn.prompt });
    messages.push({ role: 'user', content: blocks });
  }
  return messages;
}

/**
 * Claude's message list. The Messages API takes the system prompt separately, wants the conversation to open
 * with a user turn, and expects roles to alternate, so earlier turns are merged where the history has two of
 * the same role in a row (a failed turn is stored as user + assistant, but an interrupted one may not be).
 */
function buildClaudeMessages(history, turn) {
  const messages = [];
  const push = (role, content) => {
    const last = messages.at(-1);
    if (last && last.role === role) {
      last.content = [...last.content, ...content];
    } else {
      messages.push({ role, content });
    }
  };
  for (const item of history) {
    if (!item || !item.text) continue;
    const role = item.role === 'user' ? 'user' : 'assistant';
    if (!messages.length && role === 'assistant') continue;
    push(role, [{ type: 'text', text: item.text }]);
  }
  const blocks = [];
  for (const attachment of turn.images) {
    blocks.push({ type: 'image', source: { type: 'base64', media_type: attachment.mimeType || 'image/png', data: attachment.base64 } });
    if (attachment.caption) blocks.push({ type: 'text', text: attachment.caption });
  }
  blocks.push({ type: 'text', text: turn.prompt });
  push('user', blocks);
  return messages;
}

/**
 * Build the HTTP request descriptor for one agent turn.
 *
 * `maxOutputTokens` overrides the per-vendor budget, which exists so a retry
 * can shrink the request when a thinking model ran out of room.
 *
 * @returns {{vendor:string, model:string, effort:string, url:string, headers:Object, body:Object}}
 */
export function buildAgentRequest({
  vendor,
  model,
  effort,
  apiKey,
  systemPrompt,
  history = [],
  prompt,
  images = [],
  maxOutputTokens,
  thinking,
  stream = false
}) {
  const vendorId = normalizeVendor(vendor);
  const config = VENDORS[vendorId];
  if (!config) throw new Error(`Unknown agent vendor: ${vendor}`);
  if (!model) throw new Error(`No model configured for ${config.label}`);

  const turn = { prompt: String(prompt ?? ''), systemPrompt, images: (images || []).filter(Boolean) };
  const activeEffort = config.supportsEffort ? resolveEffort(vendorId, effort) : '';
  const thinkingEnabled = typeof thinking === 'boolean' ? thinking : vendorId === 'deepseek';

  if (vendorId === 'gemini') {
    const action = stream ? ':streamGenerateContent?alt=sse' : ':generateContent';
    const url = config.endpoint.replace(':generateContent', action).replace('{model}', encodeURIComponent(model));
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: buildGeminiContents(history, turn),
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
    };
    return {
      vendor: vendorId,
      model,
      effort: '',
      stream,
      url,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey || '' },
      body
    };
  }

  if (vendorId === 'claude') {
    // Claude thinks when asked to: adaptive thinking lets the model decide how much, and the effort level sets how
    // hard it works overall. The thinking toggle in Settings defaults to on for Claude, as it does for DeepSeek.
    const claudeThinking = typeof thinking === 'boolean' ? thinking : true;
    const body = {
      model,
      max_tokens: maxOutputTokens || getMaxOutputTokens('claude', { thinking: claudeThinking }),
      system: systemPrompt,
      messages: buildClaudeMessages(history, turn),
      stream
    };
    // Off must be said, not implied: with the field left out a model may still think, and the "no thinking"
    // retry for the medieval town spent its whole budget reasoning anyway.
    body.thinking = claudeThinking ? { type: 'adaptive' } : { type: 'disabled' };
    if (activeEffort) body.output_config = { effort: claudeEffort(activeEffort) };
    return {
      vendor: vendorId,
      model,
      effort: activeEffort ? claudeEffort(activeEffort) : '',
      stream,
      url: config.endpoint,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey || '',
        'anthropic-version': config.apiVersion,
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body
    };
  }

  const budget = maxOutputTokens || getMaxOutputTokens(vendorId, { thinking: thinkingEnabled });
  const body = {
    model,
    messages: buildChatMessages(history, turn),
    response_format: { type: 'json_object' },
    stream
  };
  if (vendorId === 'chatgpt') {
    body.max_completion_tokens = budget;
    const isStandardModel = /^gpt-[34]/i.test(model);
    if (activeEffort && !isStandardModel) body.reasoning_effort = activeEffort;
  } else if (vendorId === 'deepseek') {
    body.max_tokens = budget;
    body.thinking = { type: thinkingEnabled ? 'enabled' : 'disabled' };
    // reasoning_effort doubles as the thinking switch, so drop it when off.
    if (activeEffort && thinkingEnabled) body.reasoning_effort = activeEffort;
  }

  return {
    vendor: vendorId,
    model,
    effort: thinkingEnabled ? activeEffort : '',
    stream,
    url: config.endpoint,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey || ''}`
    },
    body
  };
}

// --- Response parsing ------------------------------------------------------

/** Pull assistant text (and any reasoning trace) out of a vendor response. */
export function extractAgentText(vendor, data) {
  const vendorId = normalizeVendor(vendor);

  if (vendorId === 'claude') {
    const blocks = Array.isArray(data?.content) ? data.content : [];
    return {
      text: blocks.filter(b => b?.type === 'text').map(b => b.text || '').join(''),
      reasoning: blocks.filter(b => b?.type === 'thinking').map(b => b.thinking || '').join('\n'),
      finishReason: data?.stop_reason || '',
      usage: data?.usage || null
    };
  }

  if (vendorId === 'gemini') {
    const candidate = data?.candidates?.[0];
    const parts = candidate?.content?.parts || [];
    const text = parts
      .filter(part => !part?.thought)
      .map(part => part?.text || '')
      .join('');
    return {
      text,
      reasoning: '',
      finishReason: candidate?.finishReason || '',
      usage: data?.usageMetadata || null
    };
  }

  const choice = data?.choices?.[0];
  return {
    text: choice?.message?.content || '',
    reasoning: choice?.message?.reasoning_content || choice?.message?.reasoning || '',
    finishReason: choice?.finish_reason || '',
    usage: data?.usage || null
  };
}

/**
 * Pull one streaming chunk apart into reasoning and answer text.
 *
 * OpenAI-compatible vendors (DeepSeek, ChatGPT) send `choices[0].delta`; Gemini
 * sends `candidates[0].content.parts`. DeepSeek emits its chain of thought as
 * `reasoning_content` deltas before any `content` arrives, which is what makes
 * live "it is still working" feedback possible.
 */
export function extractStreamDelta(vendor, data, side = {}) {
  const vendorId = normalizeVendor(vendor);
  let reasoning = '';
  let content = '';

  if (vendorId === 'claude') {
    // Server-sent events: content_block_delta carries text or thinking, message_delta the stop reason and the
    // output token count, and an `error` event reports an overload or failure mid-stream.
    if (data?.type === 'content_block_delta') {
      if (data.delta?.type === 'text_delta') content = data.delta.text || '';
      else if (data.delta?.type === 'thinking_delta') reasoning = data.delta.thinking || '';
    }
    return {
      reasoning,
      content,
      finishReason: data?.type === 'message_delta' ? (data.delta?.stop_reason || '') : '',
      usage: data?.type === 'message_delta' ? (data.usage || null) : data?.type === 'message_start' ? (data.message?.usage || null) : null,
      error: data?.type === 'error' ? (data.error?.message || data.error?.type || 'stream error') : null
    };
  }

  if (vendorId === 'gemini') {
    const candidate = data?.candidates?.[0];
    const combined = `${side.content || ''}${side.reasoning || ''}`;
    const totals = { reasoning: 0, content: 0 };
    for (const part of candidate?.content?.parts || []) {
      if (!part) continue;
      const text = part.text || '';
      if (part.thought) {
        const delta = text.startsWith(combined) ? text.slice(combined.length) : text;
        reasoning += delta;
        totals.reasoning += text.length;
      } else {
        const delta = text.startsWith(side.content || '') ? text.slice((side.content || '').length) : text;
        content += delta;
        totals.content += text.length;
      }
    }
    // Gemini repeats accumulated text per chunk, so remember what we have seen.
    if (totals.reasoning) side.reasoning = (side.reasoning || '') + reasoning;
    if (totals.content) side.content = (side.content || '') + content;
    return {
      reasoning,
      content,
      finishReason: candidate?.finishReason || '',
      usage: data?.usageMetadata || null
    };
  }

  const choice = data?.choices?.[0];
  const delta = choice?.delta || {};
  return {
    reasoning: delta.reasoning_content || delta.reasoning || '',
    content: delta.content || '',
    finishReason: choice?.finish_reason || '',
    usage: data?.usage || null
  };
}

/**
 * True when the model stopped because it ran out of output tokens. This is the
 * failure mode where a thinking model spends the whole budget on its chain of
 * thought and its `content` never arrives.
 */
export function isTokenExhausted({ finishReason, usage } = {}) {
  if (finishReason === 'length' || finishReason === 'MAX_TOKENS' || finishReason === 'max_tokens') return true;
  if (finishReason === 'incomplete') return true;
  const reasoningTokens = usage?.completion_tokens_details?.reasoning_tokens;
  const generated = usage?.completion_tokens;
  return typeof reasoningTokens === 'number'
    && typeof generated === 'number'
    && generated > 0
    && reasoningTokens >= generated;
}

/** Strip markdown fences and parse the planner JSON. */
export function parseAgentPlanJson(text) {
  if (!text || !String(text).trim()) {
    throw new Error('Empty response from the language model');
  }
  const cleaned = String(text).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

/** Remove trailing commas before a closing brace/bracket, which JSON forbids. */
function stripTrailingCommas(text) {
  let out = String(text);
  let previous;
  do {
    previous = out;
    out = out.replace(/,\s*([}\]])/g, '$1');
  } while (out !== previous);
  return out;
}

/**
 * Close whatever braces and brackets are still open, dropping any half-written
 * trailing value so the result is parseable.
 *
 * Streaming responses can be cut off mid-object — the model runs out of tokens
 * with `finish_reason: "length"` — and throwing the whole plan away is wasteful
 * when a single `}` is all that is missing.
 */
function closeUnbalanced(text) {
  const stack = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') stack.pop();
  }

  let candidate = text;
  if (inString) candidate += '"';
  // A dangling separator or key leaves the tail invalid; drop back to the last
  // safe boundary before closing the remaining containers. The `:?` also covers
  // a trailing key with no value at all, e.g. `{"action":"build","name"`.
  candidate = candidate.replace(/,\s*$/, '');
  candidate = candidate.replace(/,\s*"[^"]*"\s*:?\s*$/, '');
  candidate = candidate.replace(/:\s*$/, ': null');
  candidate = stripTrailingCommas(candidate);

  for (let i = stack.length - 1; i >= 0; i--) {
    candidate += stack[i] === '{' ? '}' : ']';
  }
  return candidate;
}

/**
 * Parse a planner reply, recovering from a truncated tail when possible.
 *
 * @returns {{plan: object|null, repaired: boolean, error: Error|null}}
 *   `repaired: true` means the text was incomplete and had to be closed; the
 *   caller should tell the user the result may be partial.
 */
/**
 * Make sure a parsed reply has an action.
 *
 * Models answering a question often emit the "message" shape but omit the
 * `action` field, e.g. `{"explanation":"You are standing on grass..."}`. That is a
 * complete answer, yet the validator rejected it with "Unsupported action:
 * undefined". Anything carrying explanation-style text and no world action is
 * treated as the message it plainly is.
 *
 * @returns {object|null} the normalised plan, or null when there is nothing usable
 */
export function normalizePlanShape(plan) {
  if (!plan || typeof plan !== 'object') return plan ?? null;

  // A bare array is a list of steps: the model returned the contents of a "multi"
  // plan without its wrapper. Its reasoning often says "multi steps: ..." while the
  // JSON it emits is just the steps.
  if (Array.isArray(plan)) {
    if (plan.length === 0) return plan;
    if (plan.every(step => step && typeof step === 'object' && !Array.isArray(step))) {
      return { action: 'multi', steps: plan.slice(0, 16), explanation: 'Multiple steps' };
    }
    return plan;
  }

  if (typeof plan.action === 'string' && plan.action.trim()) return plan;

  // Some replies wrap the plan in an envelope: { "plan": {...} } or { "response": {...} }.
  for (const key of ['plan', 'agentPlan', 'result']) {
    const nested = plan[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = normalizePlanShape(nested);
      if (inner && typeof inner === 'object' && !Array.isArray(inner) && typeof inner.action === 'string') return inner;
    }
  }

  // "steps" without an action is a multi plan that lost its wrapper.
  if (Array.isArray(plan.steps) && plan.steps.length) {
    return { ...plan, action: 'multi' };
  }

  // An action-less reply is conversational. Recover the text from whichever field
  // the model chose and present it as a message.
  for (const field of ['explanation', 'message', 'reply', 'answer', 'text', 'response', 'content', 'description', 'summary']) {
    const value = plan[field];
    if (typeof value === 'string' && value.trim()) {
      return { ...plan, action: 'message', explanation: value.trim() };
    }
  }

  // No action and no text: leave it to the validator to reject, since it is
  // genuinely unusable rather than merely chatty.
  return plan;
}

/** Describe a reply's shape, for a useful error when nothing could be salvaged. */
export function describePlanShape(plan) {
  if (plan === null) return 'null';
  if (Array.isArray(plan)) return `array(${plan.length})`;
  if (typeof plan !== 'object') return typeof plan;
  const keys = Object.keys(plan);
  const action = 'action' in plan ? ` action=${JSON.stringify(plan.action)}` : ' with no action field';
  return `object{${keys.slice(0, 10).join(', ') || 'empty'}}${action}`;
}

export function parsePlanWithRecovery(text) {
  const raw = String(text ?? '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (!raw) {
    return { plan: null, repaired: false, prose: false, error: new Error('Empty response from the language model') };
  }

  try {
    return { plan: normalizePlanShape(JSON.parse(raw)), repaired: false, prose: false, error: null };
  } catch (firstError) {
    try {
      const repairedPlan = normalizePlanShape(JSON.parse(closeUnbalanced(raw)));
      return { plan: repairedPlan, repaired: true, prose: false, error: null };
    } catch {
      // Not JSON and not repairable. Keep the model's own words: for a question
      // like "what's in front of me?" the prose IS the answer, and replacing it
      // with a parsing complaint helps nobody.
      const prose = raw.replace(/^```[a-z]*\s*/i, '').trim();
      if (prose) {
        return { plan: { action: 'message', explanation: prose }, repaired: false, prose: true, error: null };
      }
      // Report the original failure: it points at the real problem, whereas the
      // repair attempt only reports its own closing braces.
      return { plan: null, repaired: false, prose: false, error: firstError };
    }
  }
}
