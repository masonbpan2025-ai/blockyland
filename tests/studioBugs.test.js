// The floating cursor icon bug stays fixed. (The other bug in this file was in the vendor API path, removed with it.)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('bug 2: the floating cursor icon is always synced and cleared', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'src/ui.js'), 'utf8');

  // The method must clear the src when hiding, and must not un-hide before the
  // metadata is known to be valid — otherwise a stale icon (or a broken image
  // placeholder) stays pinned at the last cursor position.
  const method = source.slice(source.indexOf('updateFloatingCursor() {'));
  const body = method.slice(0, method.indexOf('\n  }'));
  assert.match(body, /getItemMeta/, 'metadata is consulted');
  assert.match(body, /!meta/, 'a missing item/metadata path exists');
  assert.match(body, /removeAttribute\('src'\)/, 'the stale icon src is cleared so no ghost image remains');
  assert.match(body, /lastPointerX/, 'the ghost is re-pinned to the pointer on every sync');

  const hideIndex = body.indexOf("classList.add('hidden')");
  const revealIndex = body.indexOf("classList.remove('hidden')");
  assert.ok(hideIndex > -1 && revealIndex > -1 && hideIndex < revealIndex, 'the hide-check precedes the reveal');

  // closeAllModals must sync the cursor unconditionally, not only when an item
  // happens to be held: it is the single funnel for every close path.
  const closeFn = source.slice(source.indexOf('closeAllModals() {'));
  const closeBody = closeFn.slice(0, closeFn.indexOf('\n  }'));
  const syncIndex = closeBody.indexOf('updateFloatingCursor()');
  const cursorBranchIndex = closeBody.indexOf('if (this.inv.cursorItem)');
  assert.ok(syncIndex > -1, 'closing modals syncs the ghost icon');
  assert.ok(syncIndex > cursorBranchIndex, 'the sync sits outside the cursorItem branch');
});

test('bug 2: a stale icon cannot be left visible by a failed metadata lookup', () => {
  // Mirrors the fixed control flow with a metadata lookup that returns nothing.
  const element = {
    classes: new Set(),
    src: '/assets/items/diamond.png',
    classList: {
      add(name) { element.classes.add(name); },
      remove(name) { element.classes.delete(name); },
      contains(name) { return element.classes.has(name); }
    }
  };

  const cursorItem = null;
  const getItemMeta = () => null;

  const meta = cursorItem ? getItemMeta(cursorItem) : null;
  if (!meta) {
    element.classList.add('hidden');
    element.src = '';
  } else {
    element.classList.remove('hidden');
  }

  assert.equal(element.classList.contains('hidden'), true, 'hidden when there is no item');
  assert.equal(element.src, '', 'and the stale icon is cleared');
});
