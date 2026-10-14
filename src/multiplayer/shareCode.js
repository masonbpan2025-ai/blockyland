// Room codes and share links.
//
// A shared world is reached by a link and nothing else: `https://<game site>/?join=<code>`. The code is the only
// secret, so it is long enough that nobody can guess a live one, and it is written in an alphabet with no
// look-alike characters so it survives being read aloud or retyped.

/** Crockford's base32: digits and letters with no I, L, O or U, so a code cannot be misread. */
export const ROOM_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
/** 8 characters of 5 bits is 40 bits: about a trillion codes, so a guess finds nothing. */
export const ROOM_CODE_LENGTH = 8;
export const JOIN_PARAM = 'join';

const CONFUSABLE = { i: '1', l: '1', o: '0' };

/**
 * Make a new room code.
 * @param {(bytes: Uint8Array) => Uint8Array} [fillRandom] fills the array with random bytes; defaults to Web Crypto
 */
export function generateRoomCode(fillRandom = (bytes) => globalThis.crypto.getRandomValues(bytes)) {
  const bytes = fillRandom(new Uint8Array(ROOM_CODE_LENGTH));
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_ALPHABET[bytes[i] & 31];
  return code;
}

/**
 * The canonical form of whatever a person typed or pasted: lower case, no spaces or dashes, and the characters
 * the alphabet leaves out mapped to the ones it uses (I and L to 1, O to 0). Returns '' for anything that is
 * not a string.
 */
export function normalizeRoomCode(value) {
  if (typeof value !== 'string') return '';
  return [...value.trim().toLowerCase().replace(/[\s-]+/g, '')].map((ch) => CONFUSABLE[ch] ?? ch).join('');
}

/** Is this a well-formed room code? */
export function isValidRoomCode(value) {
  if (typeof value !== 'string' || value.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of value) if (!ROOM_ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * The link a host sends to friends.
 *
 * @param {string|URL} pageUrl the address the host is playing at
 * @param {string} code the room code
 * @param {Record<string,string>} [extra] query parameters to carry, such as a custom signalling address
 */
export function buildShareUrl(pageUrl, code, extra = {}) {
  const url = new URL(typeof pageUrl === 'string' ? pageUrl : pageUrl.href);
  // A fresh query: the host's own settings (a join code from an earlier session, a debug flag) must not leak
  // into the link.
  url.search = '';
  url.hash = '';
  url.searchParams.set(JOIN_PARAM, code);
  for (const [key, value] of Object.entries(extra)) if (value) url.searchParams.set(key, value);
  return url.href;
}

/**
 * The room code a link asks to join, or null.
 *
 * @param {string} search `location.search`, or a whole URL
 * @returns {string|null} the normalised code, null when there is none or it is malformed
 */
export function parseJoinCode(search) {
  if (typeof search !== 'string' || !search) return null;
  let params;
  try {
    params = search.includes('://') ? new URL(search).searchParams : new URLSearchParams(search);
  } catch {
    return null;
  }
  const code = normalizeRoomCode(params.get(JOIN_PARAM) ?? '');
  return isValidRoomCode(code) ? code : null;
}

/**
 * Is this address one only the host's own computer can open? A link to it is useless to anyone else.
 * @param {string|URL} pageUrl
 */
export function isLocalOnlyAddress(pageUrl) {
  let host;
  try {
    host = new URL(typeof pageUrl === 'string' ? pageUrl : pageUrl.href).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1' || host.endsWith('.localhost');
}
