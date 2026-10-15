// Keys live only in this page's memory unless the user explicitly encrypts one.
// The passphrase and derived CryptoKey are never retained by this object.
export const VAULT_PREFIX = 'mc_agent_vault_';
const ITERATIONS = 600000;
const encoder = new TextEncoder();
const encode = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
function decode(value, length) {
  if (typeof value !== 'string' || value.length > 16000) throw new Error('Invalid saved vault. Delete it and save the key again.');
  const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (length && bytes.length !== length) throw new Error('Invalid saved vault. Delete it and save the key again.');
  return bytes;
}
function cryptoApi() {
  if (!globalThis.crypto?.subtle) throw new Error('Encrypted keys require HTTPS or localhost and Web Crypto. You can still use a session-only key.');
  return globalThis.crypto;
}
async function derive(passphrase, salt, usage) {
  const crypto = cryptoApi();
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2', hash:'SHA-256', salt, iterations:ITERATIONS}, material,
    {name:'AES-GCM', length:256}, false, [usage]);
}

export class AgentKeyVault {
  constructor(store, vendors) {
    this.store = store; this.vendors = new Set(vendors); this.keys = {}; this.revisions = {};
    this.migratedVendors = []; this.migrationErrors = [];
    for (const vendor of vendors) {
      this.keys[vendor] = '';
      // Retire previous plaintext storage. Keep a recovered key for this page only.
      const oldNames = [`mc_agent_key_${vendor}`, ...(vendor === 'gemini' ? ['gemini_api_key'] : [])];
      try {
        const old = oldNames.map(name => store?.getItem(name)).find(Boolean);
        if (old) {
          if (!this.hasVault(vendor)) this.keys[vendor] = old;
          for (const name of oldNames) store.removeItem(name);
          this.migratedVendors.push(vendor);
        }
      } catch { this.migrationErrors.push(vendor); }
    }
  }
  check(vendor) { if (!this.vendors.has(vendor)) throw new Error('Unknown API key vendor.'); }
  hasVault(vendor) { this.check(vendor); return !!this.store?.getItem(`${VAULT_PREFIX}${vendor}`); }
  keyFor(vendor) { this.check(vendor); return this.keys[vendor] || ''; }
  status(vendor) {
    const remembered = this.hasVault(vendor), active = !!this.keyFor(vendor);
    return {remembered, active, locked:remembered && !active};
  }
  lock(vendor) { this.check(vendor); this.revisions[vendor] = (this.revisions[vendor] || 0) + 1; this.keys[vendor] = ''; }
  delete(vendor) {
    this.lock(vendor);
    this.store?.removeItem(`${VAULT_PREFIX}${vendor}`);
    this.store?.removeItem(`mc_agent_key_${vendor}`);
    if (vendor === 'gemini') this.store?.removeItem('gemini_api_key');
  }
  setSession(vendor, value) {
    this.check(vendor); const key = String(value || '').trim();
    if (key.length > 8192) throw new Error('API key is too long.');
    // Explicitly choosing session-only also removes an older remembered key.
    this.delete(vendor); this.keys[vendor] = key; return key;
  }
  async remember(vendor, value, passphrase) {
    this.check(vendor); const key = String(value || '').trim();
    if (!key || key.length > 8192) throw new Error('Enter a valid API key to remember.');
    if (typeof passphrase !== 'string' || passphrase.length < 12) throw new Error('Use a passphrase of at least 12 characters.');
    if (!this.store) throw new Error('Browser storage is unavailable. Use a session-only key.');
    const revision = this.revisions[vendor] = (this.revisions[vendor] || 0) + 1;
    const crypto = cryptoApi(), salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const derived = await derive(passphrase, salt, 'encrypt');
    const ciphertext = await crypto.subtle.encrypt({name:'AES-GCM', iv, additionalData:encoder.encode(`agent-key-vault:1:${vendor}`)}, derived, encoder.encode(key));
    if (this.revisions[vendor] !== revision) throw new Error('Key action canceled.');
    this.store.setItem(`${VAULT_PREFIX}${vendor}`, JSON.stringify({version:1, iterations:ITERATIONS, salt:encode(salt), iv:encode(iv), ciphertext:encode(ciphertext)}));
    this.store.removeItem(`mc_agent_key_${vendor}`);
    if (vendor === 'gemini') this.store.removeItem('gemini_api_key');
    this.keys[vendor] = key;
  }
  async unlock(vendor, passphrase) {
    this.check(vendor);
    const raw = this.store?.getItem(`${VAULT_PREFIX}${vendor}`);
    if (!raw) throw new Error('No remembered key for this vendor.');
    if (raw.length > 20000) throw new Error('Invalid saved vault. Delete it and save the key again.');
    const revision = this.revisions[vendor] = (this.revisions[vendor] || 0) + 1;
    let record, salt, iv, ciphertext;
    try {
      record = JSON.parse(raw);
      if (record.version !== 1 || record.iterations !== ITERATIONS) throw new Error();
      salt = decode(record.salt,16); iv = decode(record.iv,12); ciphertext = decode(record.ciphertext);
      if (ciphertext.length < 17 || ciphertext.length > 8208) throw new Error();
    } catch { throw new Error('Invalid saved vault. Delete it and save the key again.'); }
    const derived = await derive(String(passphrase || ''), salt, 'decrypt');
    let key;
    try {
      const bytes = await cryptoApi().subtle.decrypt({name:'AES-GCM', iv, additionalData:encoder.encode(`agent-key-vault:1:${vendor}`)}, derived, ciphertext);
      key = new TextDecoder('utf-8',{fatal:true}).decode(bytes);
    } catch { throw new Error('Could not unlock: incorrect passphrase or damaged vault.'); }
    if (this.revisions[vendor] !== revision || this.store.getItem(`${VAULT_PREFIX}${vendor}`) !== raw) throw new Error('Key action canceled.');
    this.keys[vendor] = key;
  }
  toJSON() { return {}; } // Never include live keys in JSON/debug exports.
}
