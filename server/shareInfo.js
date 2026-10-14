import os from 'node:os';

/**
 * The addresses other computers on the same network can reach this server at.
 *
 * `localhost` is useless in a link: the friend's browser would look for a game on the friend's own computer. When
 * the game is served from a laptop, the address a friend on the same Wi-Fi can use is the laptop's LAN address.
 * Private ranges only -- a public address is the operator's to publish, and the browser already knows it.
 *
 * @param {number} port
 * @param {object} [options]
 * @param {() => Record<string, Array<{address: string, family: string|number, internal: boolean}>>} [options.interfaces]
 * @param {string} [options.protocol]
 * @returns {Array<{address: string, url: string, name: string}>}
 */
export function lanAddresses(port, { interfaces = os.networkInterfaces, protocol = 'http' } = {}) {
  const out = [];
  for (const [name, list] of Object.entries(interfaces() ?? {})) {
    for (const entry of list ?? []) {
      const family = typeof entry.family === 'number' ? `IPv${entry.family}` : entry.family;
      if (family !== 'IPv4' || entry.internal) continue;
      if (!isPrivateIPv4(entry.address)) continue;
      out.push({ name, address: entry.address, url: `${protocol}://${entry.address}:${port}/` });
    }
  }
  // The usual home networks first: 192.168 before the 10 and 172 ranges that VPNs and containers favour.
  const rank = (a) => (a.startsWith('192.168.') ? 0 : a.startsWith('10.') ? 1 : 2);
  return out.sort((a, b) => rank(a.address) - rank(b.address) || a.address.localeCompare(b.address));
}

/** RFC 1918 private ranges, and link-local addresses are left out. */
export function isPrivateIPv4(address) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  return a === 172 && b >= 16 && b <= 31;
}
