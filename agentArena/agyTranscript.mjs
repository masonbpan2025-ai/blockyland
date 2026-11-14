// What a Gemini player (Antigravity CLI) thought and said, from Antigravity's own record of the conversation
// (~/.gemini/antigravity-cli/conversations/<id>.db, SQLite). The CLI's stream (the turn-*.jsonl transcripts) carries
// only tool steps and each turn's last answer; the model's reasoning and replies are in this store, as protobuf. This
// reads them without a schema: each step's readable text, and the time the step was made (the first protobuf varint
// that is a plausible Unix time, in seconds or milliseconds).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

/** Antigravity's step types, as seen in its store: 14 the user's message, 15 the model's turn, 132 a tool call. */
const MODEL_STEP = 15;

/** Every varint in a protobuf buffer, read loosely (unknown nesting is fine for finding timestamps). */
function* varints(buf) {
  for (let i = 0; i < buf.length; i++) {
    let v = 0, shift = 0, j = i;
    while (j < buf.length && j - i < 10) {
      const b = buf[j++];
      v += (b & 0x7f) * 2 ** shift;
      shift += 7;
      if (!(b & 0x80)) { yield v; break; }
    }
  }
}

/** The step's time, in ms since 1970, from its metadata. */
function stepTime(meta) {
  for (const v of varints(meta)) {
    if (v >= 1.7e9 && v <= 2.1e9) return v * 1000;   // seconds
    if (v >= 1.7e12 && v <= 2.1e12) return v;        // milliseconds
  }
  return null;
}

/** The readable passages in a step's payload: runs of text long enough to be words, not ids. */
function passages(payload) {
  const s = Buffer.from(payload).toString('utf8');
  return (s.match(/[^\x00-\x08\x0b\x0c\x0e-\x1f�]{40,}/g) ?? [])
    .map((t) => t.replace(/^[^A-Za-z"'`*#(\[]+/, '').trim())
    .filter((t) => /[a-z]{3,} [a-z]{2,}/i.test(t) && !/^[A-Za-z0-9_-]{30,}$/.test(t))
    // A tool call's arguments are stored with the turn; they are not the model's words.
    .filter((t) => !/^.?{"/.test(t) && !/"(CommandLine|toolSummary|Path|TargetFile|AbsolutePath|query|Url)":/.test(t));
}

/**
 * The model's thoughts and replies in a conversation, oldest first: [{ at (ms), text }].
 * @param {string} conversationId the id in the player's session.txt
 */
export function agyThoughts(conversationId, { dir = path.join(os.homedir(), '.gemini', 'antigravity-cli', 'conversations') } = {}) {
  const file = path.join(dir, `${conversationId}.db`);
  if (!conversationId || !existsSync(file)) return [];
  let DatabaseSync;
  try { ({ DatabaseSync } = createRequire(import.meta.url)('node:sqlite')); } catch { return []; }
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const out = [];
    for (const r of db.prepare('select idx, step_type, metadata, step_payload from steps order by idx').all()) {
      if (r.step_type !== MODEL_STEP || !r.step_payload) continue;
      const at = r.metadata ? stepTime(Buffer.from(r.metadata)) : null;
      const text = passages(r.step_payload).join('\n').trim();
      if (text) out.push({ at, text });
    }
    return out;
  } finally { db.close(); }
}
