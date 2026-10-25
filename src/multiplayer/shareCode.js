// Room codes and share links.
//
// A shared world is reached by its code: typed on the start screen's Join, or in a link,
// `https://<game site>/?join=<code>`. The code is four digits, short enough to read out across a room.
//
// Four digits are 10,000 codes, few enough to guess. The introduction service therefore lets one address try only a
// few wrong codes a minute (server/shareRendezvous.js, cloudflare/share), which makes running through them take most
// of a day; and a host whose new code is already in use is given another (ShareSession.registerRoom).

/** Digits only. */
export const ROOM_ALPHABET = '0123456789';
export const ROOM_CODE_LENGTH = 4;
export const JOIN_PARAM = 'join';

const CONFUSABLE = { i: '1', l: '1', o: '0' };

/**
 * Make a new room code.
 * @param {(bytes: Uint8Array) => Uint8Array} [fillRandom] fills the array with random bytes; defaults to Web Crypto
 */
export function generateRoomCode(fillRandom = (bytes) => globalThis.crypto.getRandomValues(bytes)) {
  let code = '';
  // A byte below 250 is one of 25 equal runs of ten, so every digit is equally likely; a byte above is drawn again.
  for (let draws = 0; code.length < ROOM_CODE_LENGTH && draws < 64; draws++) {
    for (const byte of fillRandom(new Uint8Array(ROOM_CODE_LENGTH))) {
      if (byte < 250 && code.length < ROOM_CODE_LENGTH) code += ROOM_ALPHABET[byte % 10];
    }
  }
  return code.padEnd(ROOM_CODE_LENGTH, '0');
}

/**
 * The canonical form of whatever a person typed or pasted: no spaces or dashes, and the letters that look like digits
 * read as those digits (I and L as 1, O as 0). Returns '' for anything that is not a string.
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
