export const HYPIXEL = Object.freeze({ name: 'Hypixel', address: 'mc.hypixel.net', version: '1.21.4' });

export function parseServerAddress(value) {
  const input = String(value ?? '').trim();
  // Java server addresses only: protocols, paths and credentials are not addresses.
  const match = /^(\[[0-9a-f:]+\]|[a-z0-9._-]+)(?::([0-9]{1,5}))?$/i.exec(input);
  if (!match) throw new Error('Enter a server hostname or IP, optionally followed by :port.');
  // DNS SRV records may return an absolute hostname with a final root dot.
  const host = match[1].replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
  const port = match[2] ? Number(match[2]) : 25565;
  if (port < 1 || port > 65535) throw new Error('Server port must be between 1 and 65535.');
  if (!host || host.length > 253 || host.startsWith('.') || host.endsWith('.') || host.includes('..')) {
    throw new Error('Enter a valid server hostname.');
  }
  return { host, port, address: `${host.includes(':') ? `[${host}]` : host}${match[2] ? `:${port}` : ''}` };
}

export function buildClientUrl(runtimeUrl, { name, address, version, username }) {
  const server = parseServerAddress(address);
  const url = new URL(runtimeUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Client URL must use HTTP or HTTPS.');
  url.searchParams.set('ip', server.address);
  url.searchParams.set('name', String(name || server.address).trim().slice(0, 64));
  if (version) {
    if (!/^1\.\d{1,2}(?:\.\d{1,2})?$/.test(version)) throw new Error('Enter a Minecraft Java version such as 1.21.4.');
    url.searchParams.set('version', version);
  }
  if (username) {
    if (!/^\w{3,16}$/.test(username)) throw new Error('Offline username must contain 3–16 letters, numbers or underscores.');
    url.searchParams.set('username', username);
  }
  url.searchParams.set('proxy', url.origin);
  // The upstream connect screen lets the player choose their Microsoft account.
  // autoConnect bypasses that choice and would attempt an offline Hypixel login.
  return url.href;
}
