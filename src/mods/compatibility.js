export const ENGINE_API_VERSION = '1.0.0';
export const MOD_PROTOCOL_VERSION = 1;
export const ENGINE_CAPABILITIES = Object.freeze(['voxel_world', 'scene_definitions', 'local_coop', 'authoritative_sessions', 'gameplay_policies']);

export function satisfiesVersion(version, range = '*') {
  if (typeof version!=='string'||typeof range!=='string')return false;
  if (range === '*') return /^(\d+)\.(\d+)\.(\d+)$/.test(version);
  const parse = value => /^(\d+)\.(\d+)\.(\d+)$/.exec(value)?.slice(1).map(Number);
  const actual = parse(version), wanted = parse(range.replace(/^[\^~]/, ''));
  if (!actual || !wanted) return false;
  const compare = actual[0] - wanted[0] || actual[1] - wanted[1] || actual[2] - wanted[2];
  if (range.startsWith('^')) return compare >= 0 && actual[0] === wanted[0] && (wanted[0] !== 0 || (actual[1] === wanted[1] && (wanted[1] !== 0 || actual[2] === wanted[2])));
  if (range.startsWith('~')) return compare >= 0 && actual[0] === wanted[0] && actual[1] === wanted[1];
  return compare === 0;
}

export function resolvePackages(rootId, manifests, { apiVersion = ENGINE_API_VERSION, capabilities = ENGINE_CAPABILITIES } = {}) {
  const table = new Map(manifests.map(manifest => [manifest.id, manifest]));
  if (table.size !== manifests.length) throw new Error('Duplicate package identity');
  const visiting = new Set(), visited = new Set(), ordered = [];
  function visit(id) {
    if (visiting.has(id)) throw new Error(`Dependency cycle at ${id}`);
    if (visited.has(id)) return;
    const manifest = table.get(id);
    if (!manifest) throw new Error(`Missing dependency ${id}`);
    if ((manifest.protocolVersion??MOD_PROTOCOL_VERSION)!==MOD_PROTOCOL_VERSION)throw new Error(`Incompatible protocol for ${id}`);
    if (!satisfiesVersion(apiVersion, manifest.engineApi ?? '*')) throw new Error(`Incompatible engine API for ${id}`);
    for (const capability of manifest.requires ?? []) if (!capabilities.includes(capability)) throw new Error(`Unsupported capability ${capability} required by ${id}`);
    visiting.add(id);
    for (const [dependency, range] of Object.entries(manifest.dependencies ?? {})) {
      if (!satisfiesVersion(table.get(dependency)?.version ?? '', range)) throw new Error(`Missing or incompatible dependency ${dependency}@${range}`);
      visit(dependency);
    }
    for (const [dependency, range] of Object.entries(manifest.optionalDependencies ?? {})) {
      if (!table.has(dependency)) continue;
      if (!satisfiesVersion(table.get(dependency).version, range)) throw new Error(`Incompatible optional dependency ${dependency}`);
      visit(dependency);
    }
    visiting.delete(id); visited.add(id); ordered.push(manifest);
  }
  visit(rootId);
  if(ordered.filter(m=>m.serverEntrypoint).length>1)throw new Error('A world must have exactly one gameplay authority');
  return ordered;
}
