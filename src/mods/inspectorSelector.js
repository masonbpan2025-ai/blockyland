import { inspectorScope } from './inspectorScope.js';

/** Inspectors require an explicit selection, independent of the game's active world. */
export function inspectorContent(kind, coreEntries, modId = null, manifests = null) {
  const scope = inspectorScope({ modId, ...(manifests ? { manifests } : {}) });
  return {
    ...scope,
    content: scope.modId ? scope.entries.filter(entry => entry.kind === kind) : coreEntries,
  };
}

export function fillInspectorSource(select, requested = null) {
  const scope = inspectorScope({ modId: requested });
  select.replaceChildren(new Option('Base game', ''), ...scope.availableMods.map(mod => new Option(mod.name, mod.id)));
  select.value = scope.modId ?? '';
  return scope.modId;
}
