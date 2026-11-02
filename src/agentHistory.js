// Agent History recording and diagnostic persistence.
//
// Records each Agent Terminal turn: the prompt, the plan the built-in presets made and how it went.
//
// Persists turn records so they are immediately accessible on disk:
//   - agent_history.json (recent turns)
//   - agent_history_latest.json (most recent turn)
//   - agent_history/latest.json
// And in the browser runtime:
//   - window.__mc_agent_history__ / window.__mc_agent_history_latest__
//   - localStorage['mc_agent_history'] / localStorage['mc_agent_history_latest']
//   - POST /api/agent-history (dev server middleware)

export const MAX_HISTORY_ITEMS = 50;
export const STORAGE_HISTORY_KEY = 'mc_agent_history';
export const STORAGE_LATEST_KEY = 'mc_agent_history_latest';

// In-memory ring buffer of turns
export const AGENT_HISTORY_MEMORY = [];
export let LAST_TURN_MEMORY = null;

/**
 * Factory for creating a complete agent turn record.
 */
export function createAgentTurnRecord({
  turnId = Date.now(),
  vendor = 'unknown',
  vendorLabel = '',
  model = '',
  effort = '',
  prompt = '',
  offline = false,
  attachments = [],
  hasViewCapture = false
} = {}) {
  const startedAt = Date.now();

  const record = {
    id: `turn_${turnId}_${Math.random().toString(36).slice(2, 7)}`,
    turnId,
    timestamp: new Date(startedAt).toISOString(),
    startedAt,
    finishedAt: null,
    durationMs: 0,
    vendor,
    vendorLabel: vendorLabel || vendor,
    model,
    effort,
    offline,
    prompt,
    attachments: (attachments || []).map(a => ({
      name: a.name || 'image',
      mimeType: a.mimeType || 'image/png',
      size: a.size || undefined
    })),
    hasViewCapture,
    // Request metadata and payload
    request: null,
    // All attempts (initial, retry without thinking, staged retry, replacement model retry, etc.)
    attempts: [],
    // Response metadata and content
    response: null,
    // Parsed and validated plans
    plan: null,
    // Execution outcome
    execution: {
      status: 'pending', // 'pending' | 'completed' | 'failed' | 'rejected'
      error: null,
      explanation: null,
      buildings: []
    },
    // Overall diagnostic error summary
    error: null
  };

  /** Record an error during network, parsing, plan validation, or execution */
  record.recordError = function(err, type = 'runtime') {
    const message = err?.message || String(err || 'Unknown error');
    const stack = err?.stack || undefined;
    const status = err?.status || undefined;

    const errorObj = {
      type, // 'network' | 'http' | 'parse' | 'validation' | 'execution' | 'runtime'
      message,
      stack,
      status,
      timestamp: new Date().toISOString()
    };

    record.error = errorObj;
    if (record.attempts.length > 0 && !record.attempts[record.attempts.length - 1].error) {
      record.attempts[record.attempts.length - 1].error = errorObj;
    }
    return errorObj;
  };

  /** Record offline planning outcome */
  record.recordOfflinePlan = function(plan) {
    record.offline = true;
    record.request = {
      offline: true,
      timestamp: new Date().toISOString(),
      method: 'LOCAL_PLANNER',
      prompt: record.prompt
    };
    record.plan = {
      parsedPlan: plan,
      validatedPlan: plan,
      unreadable: false,
      action: plan?.action || null,
      explanation: plan?.explanation || null,
      error: null
    };
    return record.plan;
  };

  /** Finalize execution outcome */
  record.finalizeExecution = function({
    status = 'completed',
    error = null,
    explanation = null,
    buildings = []
  } = {}) {
    record.finishedAt = new Date().toISOString();
    record.durationMs = Date.now() - record.startedAt;
    record.execution = {
      status,
      error: error ? String(error.message || error) : null,
      explanation,
      buildings: (buildings || []).map(b => ({ id: b.id, name: b.name, type: b.type }))
    };
    if (error && !record.error) {
      record.recordError(error, 'execution');
    }
    return record;
  };

  return record;
}

/**
 * Save turn record to immediate accessible locations:
 *   1. Memory ring buffer (AGENT_HISTORY_MEMORY)
 *   2. window.__mc_agent_history__ (browser runtime)
 *   3. localStorage['mc_agent_history'] & localStorage['mc_agent_history_latest']
 *   4. POST /api/agent-history to Vite server (which writes to agent_history.json & agent_history_latest.json)
 *   5. Direct Node fs write (when running tests or CLI in Node)
 */
export async function saveAgentTurn(turnRecord, options = {}) {
  if (!turnRecord) return null;

  // 1. Update in-memory buffers
  AGENT_HISTORY_MEMORY.push(turnRecord);
  if (AGENT_HISTORY_MEMORY.length > MAX_HISTORY_ITEMS) {
    AGENT_HISTORY_MEMORY.splice(0, AGENT_HISTORY_MEMORY.length - MAX_HISTORY_ITEMS);
  }
  LAST_TURN_MEMORY = turnRecord;

  // 2 & 3. Browser global & localStorage
  if (typeof window !== 'undefined') {
    window.__mc_agent_history__ = AGENT_HISTORY_MEMORY;
    window.__mc_agent_history_latest__ = turnRecord;

    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_LATEST_KEY, JSON.stringify(turnRecord));
        const stored = localStorage.getItem(STORAGE_HISTORY_KEY);
        let list = [];
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) list = parsed;
          } catch {}
        }
        list.push(turnRecord);
        if (list.length > MAX_HISTORY_ITEMS) list = list.slice(-MAX_HISTORY_ITEMS);
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(list));
      }
    } catch {
      // Storage quota or denied access
    }

    // Dev server endpoint
    if (typeof fetch === 'function') {
      try {
        await fetch('/api/agent-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(turnRecord)
        });
      } catch {
        // Dev server might not be running or network offline
      }
    }
  }

  // 4. Node environment: direct file persistence to root workspace
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cwd = options.cwd || process.cwd();
      const historyFile = path.resolve(cwd, 'agent_history.json');
      const latestFile = path.resolve(cwd, 'agent_history_latest.json');
      const dirLatest = path.resolve(cwd, 'agent_history');
      if (!fs.existsSync(dirLatest)) fs.mkdirSync(dirLatest, { recursive: true });
      const dirLatestFile = path.resolve(dirLatest, 'latest.json');

      let list = [];
      if (fs.existsSync(historyFile)) {
        try {
          const raw = fs.readFileSync(historyFile, 'utf8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) list = parsed;
          else if (Array.isArray(parsed.history)) list = parsed.history;
        } catch {}
      }

      list.push(turnRecord);
      if (list.length > MAX_HISTORY_ITEMS) list = list.slice(-MAX_HISTORY_ITEMS);

      fs.writeFileSync(historyFile, JSON.stringify(list, null, 2), 'utf8');
      fs.writeFileSync(latestFile, JSON.stringify(turnRecord, null, 2), 'utf8');
      fs.writeFileSync(dirLatestFile, JSON.stringify(turnRecord, null, 2), 'utf8');
    } catch {
      // Ignore Node fs write failure in read-only sandbox
    }
  }

  return turnRecord;
}

/**
 * Get all agent turn records from memory, localStorage, or disk.
 */
export async function getAgentHistory(options = {}) {
  // If memory has records, return them
  if (AGENT_HISTORY_MEMORY.length > 0 && !options.forceReload) {
    return [...AGENT_HISTORY_MEMORY];
  }

  // In Node environment, check agent_history.json
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cwd = options.cwd || process.cwd();
      const historyFile = path.resolve(cwd, 'agent_history.json');
      if (fs.existsSync(historyFile)) {
        const raw = fs.readFileSync(historyFile, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          AGENT_HISTORY_MEMORY.length = 0;
          AGENT_HISTORY_MEMORY.push(...list);
          if (list.length > 0) LAST_TURN_MEMORY = list[list.length - 1];
          return [...list];
        }
      }
    } catch {}
  }

  // In browser, check localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_HISTORY_KEY);
      if (stored) {
        const list = JSON.parse(stored);
        if (Array.isArray(list)) {
          AGENT_HISTORY_MEMORY.length = 0;
          AGENT_HISTORY_MEMORY.push(...list);
          if (list.length > 0) LAST_TURN_MEMORY = list[list.length - 1];
          return [...list];
        }
      }
    } catch {}
  }

  return [...AGENT_HISTORY_MEMORY];
}

/**
 * Get the most recent turn record.
 */
export async function getLastTurn(options = {}) {
  if (LAST_TURN_MEMORY && !options.forceReload) {
    return LAST_TURN_MEMORY;
  }

  // In Node, check agent_history_latest.json
  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cwd = options.cwd || process.cwd();
      const latestFile = path.resolve(cwd, 'agent_history_latest.json');
      if (fs.existsSync(latestFile)) {
        const raw = fs.readFileSync(latestFile, 'utf8');
        const parsed = JSON.parse(raw);
        LAST_TURN_MEMORY = parsed;
        return parsed;
      }
    } catch {}
  }

  // In browser, check localStorage
  if (typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(STORAGE_LATEST_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        LAST_TURN_MEMORY = parsed;
        return parsed;
      }
    } catch {}
  }

  return AGENT_HISTORY_MEMORY[AGENT_HISTORY_MEMORY.length - 1] || null;
}

/**
 * Clear all agent history from memory, localStorage, and disk.
 */
export async function clearAgentHistory(options = {}) {
  AGENT_HISTORY_MEMORY.length = 0;
  LAST_TURN_MEMORY = null;

  if (typeof window !== 'undefined') {
    delete window.__mc_agent_history__;
    delete window.__mc_agent_history_latest__;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_HISTORY_KEY);
        localStorage.removeItem(STORAGE_LATEST_KEY);
      }
    } catch {}
    if (typeof fetch === 'function') {
      try {
        await fetch('/api/agent-history', { method: 'DELETE' });
      } catch {}
    }
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const cwd = options.cwd || process.cwd();
      const historyFile = path.resolve(cwd, 'agent_history.json');
      const latestFile = path.resolve(cwd, 'agent_history_latest.json');
      const dirLatestFile = path.resolve(cwd, 'agent_history', 'latest.json');
      if (fs.existsSync(historyFile)) fs.unlinkSync(historyFile);
      if (fs.existsSync(latestFile)) fs.unlinkSync(latestFile);
      if (fs.existsSync(dirLatestFile)) fs.unlinkSync(dirLatestFile);
    } catch {}
  }
}

/**
 * Format a turn record as a clean diagnostic summary string.
 */
export function formatTurnDiagnostic(turn) {
  if (!turn) return 'No agent turn record available.';

  const lines = [
    `# Agent Turn Diagnostic: ${turn.id || 'turn'}`,
    `- **Timestamp**: ${turn.timestamp || 'N/A'}`,
    `- **Vendor**: ${turn.vendorLabel || turn.vendor} (${turn.vendor})`,
    `- **Model**: ${turn.model || 'N/A'}${turn.effort ? ` (effort: ${turn.effort})` : ''}`,
    `- **Execution Status**: ${turn.execution?.status?.toUpperCase() || 'UNKNOWN'}`,
    `- **Duration**: ${turn.durationMs ? `${(turn.durationMs / 1000).toFixed(2)}s` : 'N/A'}`,
    `- **User Prompt**: "${turn.prompt || ''}"`,
    ''
  ];

  if (turn.error) {
    lines.push(`## ⚠️ Error Details`);
    lines.push(`- **Type**: ${turn.error.type}`);
    lines.push(`- **Message**: ${turn.error.message}`);
    if (turn.error.status) lines.push(`- **HTTP Status**: ${turn.error.status}`);
    lines.push('');
  }

  if (turn.request) {
    lines.push(`## Outgoing Request`);
    lines.push(`- **URL**: ${turn.request.url || 'N/A'}`);
    lines.push(`- **Method**: ${turn.request.method || 'POST'}`);
    lines.push(`- **Headers**: \`\`\`json\n${JSON.stringify(turn.request.headers || {}, null, 2)}\n\`\`\``);
    lines.push(`- **Payload**: \`\`\`json\n${JSON.stringify(turn.request.body || {}, null, 2)}\n\`\`\``);
    lines.push('');
  }

  if (turn.response) {
    lines.push(`## Incoming Response`);
    lines.push(`- **HTTP Status**: ${turn.response.status} ${turn.response.statusText}`);
    if (turn.response.finishReason) lines.push(`- **Finish Reason**: ${turn.response.finishReason}`);
    if (turn.response.usage) lines.push(`- **Usage**: \`\`\`json\n${JSON.stringify(turn.response.usage, null, 2)}\n\`\`\``);
    if (turn.response.reasoning) {
      lines.push(`### Reasoning Trace`);
      lines.push(turn.response.reasoning);
      lines.push('');
    }
    if (turn.response.rawText) {
      lines.push(`### Raw Text`);
      lines.push(turn.response.rawText);
      lines.push('');
    }
  }

  if (turn.plan) {
    lines.push(`## Resulting Plan`);
    lines.push(`- **Action**: ${turn.plan.action || 'none'}`);
    lines.push(`- **Explanation**: ${turn.plan.explanation || 'none'}`);
    if (turn.plan.validatedPlan) {
      lines.push(`\`\`\`json\n${JSON.stringify(turn.plan.validatedPlan, null, 2)}\n\`\`\``);
    }
    lines.push('');
  }

  return lines.join('\n');
}
