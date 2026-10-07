// The Data Packs panel: the part a player actually touches.
//
// Everything in `dataPack*.js` is reachable only from tests until this exists, and this is where the bundled
// vanilla pack, pasted generator output and uploaded folders all meet.
//
// The rendering is split out from the binding on purpose. `renderPackList` and `packRowLabel` are pure
// functions of a store, so what the player SEES can be asserted without a browser, and the DOM plumbing in
// `bindDataPackPanel` is the only part that needs one.
import { describeStore } from './dataPackApply.js';
import { persistenceReport } from './dataPackStore.js';
import { PASTE_TYPES, importPastedText, importFiles, filesFromUploads, describeImport } from './dataPackImport.js';

export { PASTE_TYPES };

/** Bytes as something a person reads. */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * One line describing a pack.
 *
 * The important part is the warning. A pack too large to save works now and is LOST on reload, and a player
 * who is not told that will blame the game when their content disappears.
 */
export function packRowLabel(entry) {
  const source = entry.bundled ? 'bundled' : entry.source;
  const bits = [source];
  if (entry.bytes) bits.push(formatBytes(entry.bytes));
  if (entry.awaitingBundle) bits.push('waiting for the bundle');
  else if (!entry.persisted && !entry.bundled) bits.push('too large to save — lost on reload');
  return bits.join(' · ');
}

/** Everything the panel shows, as plain data. */
export function packPanelModel(store) {
  const entries = describeStore(store);
  const report = persistenceReport(store);
  return {
    entries: entries.map(e => ({ ...e, label: packRowLabel(e) })),
    enabled: entries.filter(e => e.enabled).length,
    total: entries.length,
    bytes: report.bytes,
    bytesLabel: formatBytes(report.bytes),
    tooLarge: report.tooLarge,
    bundled: report.bundled,
    // Only worth saying when there is something to say.
    warning: report.tooLarge.length
      ? `${report.tooLarge.length} pack(s) are too large to save and will be lost on reload.`
      : '',
  };
}

/**
 * Build the list DOM.
 *
 * Each row is a checkbox, a name and a note, because those are the three things a data pack screen has: is it
 * on, what is it, and will it survive.
 *
 * @param {Document} doc
 * @param {object} store
 * @param {{onToggle:(name:string, enabled:boolean)=>void, onRemove:(name:string)=>void}} handlers
 */
export function renderPackList(doc, store, handlers = {}) {
  const model = packPanelModel(store);
  const list = doc.createElement('div');
  list.className = 'datapack-list';

  if (model.entries.length === 0) {
    const empty = doc.createElement('div');
    empty.className = 'datapack-empty';
    empty.textContent = 'No data packs loaded.';
    list.appendChild(empty);
    return { list, model };
  }

  for (const entry of model.entries) {
    const row = doc.createElement('div');
    row.className = 'datapack-row' + (entry.enabled ? ' enabled' : '');

    const toggle = doc.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = entry.enabled;
    toggle.className = 'datapack-toggle';
    toggle.dataset.pack = entry.name;
    toggle.addEventListener('change', () => handlers.onToggle?.(entry.name, toggle.checked));
    row.appendChild(toggle);

    const text = doc.createElement('div');
    text.className = 'datapack-text';
    const name = doc.createElement('span');
    name.className = 'datapack-name';
    name.textContent = entry.name;
    text.appendChild(name);
    const label = doc.createElement('small');
    label.className = 'datapack-meta';
    label.textContent = entry.label;
    text.appendChild(label);
    row.appendChild(text);

    const remove = doc.createElement('button');
    remove.type = 'button';
    remove.className = 'datapack-remove';
    remove.textContent = 'Remove';
    remove.dataset.pack = entry.name;
    remove.addEventListener('click', () => handlers.onRemove?.(entry.name));
    row.appendChild(remove);

    list.appendChild(row);
  }
  return { list, model };
}

/** What to write into the status line after an action. */
export function statusText(result) {
  if (!result) return '';
  if (result.ok === false) {
    const extra = result.errors?.length > 1 ? ` (${result.errors.slice(1).join('; ')})` : '';
    return `${result.errors?.[0] ?? 'failed'}${extra}`;
  }
  if (result.kind === 'apply') return result.summary?.length ? result.summary.join(' · ') : 'No packs to apply.';
  if (result.kind === 'revert') return `Removed ${result.count} pack(s) from the world.`;
  return describeImport(result);
}

/**
 * Wire the panel to a game.
 *
 * Called once from `UIManager`. Every handler re-renders, because every one of them can change what the list
 * should say -- a toggle changes the enabled count, a removal changes the warning.
 *
 * @param {object} ui the UIManager
 * @param {object} hooks `{getStore, apply, revert, refresh, notify}`
 * @returns {{refresh:Function}|null}
 */
export function bindDataPackPanel(ui, hooks) {
  const doc = ui.doc ?? globalThis.document;
  const listHost = doc?.getElementById?.('datapack-list');
  if (!listHost) return null;

  const status = doc.getElementById('datapack-status');
  const warning = doc.getElementById('datapack-warning');
  const pasteArea = doc.getElementById('datapack-paste-area');
  const pasteText = doc.getElementById('datapack-paste-text');
  const pasteType = doc.getElementById('datapack-paste-type');
  const pasteId = doc.getElementById('datapack-paste-id');
  const pasteError = doc.getElementById('datapack-paste-error');
  const fileInput = doc.getElementById('datapack-file-input');

  // The paste area's type list comes from the module, so the two cannot drift.
  if (pasteType && pasteType.options?.length === 0) {
    for (const type of PASTE_TYPES) {
      const option = doc.createElement('option');
      option.value = type.value;
      option.textContent = type.label;
      pasteType.appendChild(option);
    }
  }

  const say = (text) => { if (status) status.textContent = text ?? ''; };
  const fail = (text) => { if (pasteError) pasteError.textContent = text ?? ''; };

  const refresh = () => {
    const store = hooks.getStore?.();
    if (!store) return;
    const { list, model } = renderPackList(doc, store, {
      onToggle: (name, enabled) => {
        hooks.onToggle?.(name, enabled);
        say(`${enabled ? 'Enabled' : 'Disabled'} ${name}. Re-apply to see it.`);
        refresh();
      },
      onRemove: (name) => {
        hooks.onRemove?.(name);
        say(`Removed ${name}.`);
        refresh();
      },
    });
    listHost.replaceChildren(list);
    if (warning) {
      warning.textContent = model.warning;
      warning.classList?.toggle?.('hidden', !model.warning);
    }
    return model;
  };

  const openPaste = (open) => {
    pasteArea?.classList?.toggle?.('hidden', !open);
    if (open) { fail(''); pasteText?.focus?.(); }
  };

  doc.getElementById('datapack-add-bundled')?.addEventListener('click', async () => {
    say('Loading the bundled vanilla pack...');
    const result = await hooks.installBundled?.();
    say(result?.ok ? 'Vanilla pack added.' : `Could not add the vanilla pack: ${result?.reason ?? 'unknown'}`);
    refresh();
  });

  doc.getElementById('datapack-paste-open')?.addEventListener('click', () => openPaste(true));
  doc.getElementById('datapack-paste-cancel')?.addEventListener('click', () => openPaste(false));

  doc.getElementById('datapack-paste-load')?.addEventListener('click', () => {
    const store = hooks.getStore?.();
    if (!store) return;
    const result = importPastedText(store, pasteText?.value ?? '', {
      type: pasteType?.value || undefined,
      id: pasteId?.value || undefined,
    });
    fail(result.ok ? '' : statusText(result));
    if (result.ok) {
      say(statusText(result));
      openPaste(false);
      if (pasteText) pasteText.value = '';
      refresh();
    }
  });

  fileInput?.addEventListener('change', async () => {
    const store = hooks.getStore?.();
    if (!store) return;
    const chosen = [...(fileInput.files ?? [])];
    if (chosen.length === 0) return;
    // Read as text here, because the validation takes text -- the same thing a paste produces.
    const entries = [];
    for (const file of chosen) {
      try {
        entries.push({ name: file.name, webkitRelativePath: file.webkitRelativePath, text: await file.text() });
      } catch {
        fail(`Could not read ${file.name}`);
      }
    }
    const result = importFiles(store, filesFromUploads(entries), { name: hooks.uploadName?.() });
    fail(result.ok ? '' : statusText(result));
    say(statusText(result));
    if (fileInput.value !== undefined) fileInput.value = '';
    refresh();
  });

  doc.getElementById('datapack-apply')?.addEventListener('click', () => {
    const result = hooks.apply?.();
    say(statusText({ kind: 'apply', summary: result?.summary, ok: true }));
    refresh();
  });

  doc.getElementById('datapack-revert')?.addEventListener('click', () => {
    const count = hooks.revert?.();
    say(statusText({ kind: 'revert', count: count ?? 0, ok: true }));
    refresh();
  });

  refresh();
  return { refresh, model: () => packPanelModel(hooks.getStore?.()) };
}
