// A slow thinker's model: DeepSeek, through its Anthropic-compatible Messages API (the endpoint the arena's DeepSeek lab
// already uses). The key is read from DEEPSEEK_API_KEY (or, on Windows, the user's environment) and never logged.
import { spawnSync } from 'node:child_process';

export function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  if (process.platform !== 'win32') return null;
  try { return spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY','User')"]).stdout.toString().trim() || null; } catch { return null; }
}

/**
 * `ask(system, user)` for SlowThinker: one message, the model's text back. Each call is timed out after `timeoutMs`;
 * `usage` collects the tokens spent. `thinking: false` turns the model's reasoning off: on a plan-sized question an
 * answer comes in about 2 s instead of 5-35 s, at the cost of the reasoning (plannerLab.mjs --thinking off measures both).
 */
export function createDeepSeekAsk({ model = 'deepseek-flash', maxTokens = 8000, timeoutMs = 60000, key = deepseekKey(), endpoint = 'https://api.deepseek.com/anthropic/v1/messages', usage = { calls: 0, input: 0, output: 0 }, thinking = true } = {}) {
  if (!key) throw new Error('DEEPSEEK_API_KEY is not set');
  const ask = async (system, user) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }], ...(thinking ? {} : { thinking: { type: 'disabled' } }) }),
      });
      if (!res.ok) throw new Error(`DeepSeek answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const body = await res.json();
      usage.calls++; usage.input += body.usage?.input_tokens ?? 0; usage.output += body.usage?.output_tokens ?? 0;
      return (body.content ?? []).filter((c) => c.type === 'text').map((c) => c.text).join('\n');
    } finally { clearTimeout(timer); }
  };
  ask.usage = usage;
  return ask;
}
