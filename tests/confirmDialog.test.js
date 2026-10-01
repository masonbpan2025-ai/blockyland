import { test, describe } from 'node:test';
import assert from 'node:assert';
import { showConfirmDialog } from '../src/dialogUtils.js';

describe('showConfirmDialog utility', () => {
  test('falls back to confirm() when document is not available', () => {
    let confirmCalled = false;
    let onConfirmCalled = false;
    const prevConfirm = globalThis.confirm;
    try {
      globalThis.confirm = (msg) => {
        confirmCalled = true;
        return true;
      };
      showConfirmDialog({
        message: 'Delete test?',
        onConfirm: () => { onConfirmCalled = true; }
      });
      assert.strictEqual(confirmCalled, true);
      assert.strictEqual(onConfirmCalled, true);
    } finally {
      globalThis.confirm = prevConfirm;
    }
  });

  test('controls DOM modal and triggers onConfirm only when Yes is clicked', () => {
    const classListSet = new Set(['hidden']);
    const modalEl = {
      classList: {
        contains: (c) => classListSet.has(c),
        add: (c) => classListSet.add(c),
        remove: (c) => classListSet.delete(c)
      },
      onclick: null
    };
    const titleEl = { textContent: '' };
    const msgEl = { textContent: '' };
    const btnYes = { textContent: '', onclick: null };
    const btnCancel = { textContent: '', onclick: null };
    const btnClose = { onclick: null };

    const domMap = {
      'modal-confirm-delete': modalEl,
      'confirm-delete-title': titleEl,
      'confirm-delete-message': msgEl,
      'btn-confirm-delete-yes': btnYes,
      'btn-confirm-delete-cancel': btnCancel,
      'btn-cancel-confirm-delete': btnClose
    };

    const prevDoc = globalThis.document;
    try {
      globalThis.document = {
        getElementById: (id) => domMap[id] || null,
        exitPointerLock: () => {}
      };

      let confirmed = false;
      showConfirmDialog({
        title: 'Delete Item',
        message: 'Are you sure?',
        confirmText: 'Yes',
        cancelText: 'No',
        onConfirm: () => { confirmed = true; }
      });

      assert.strictEqual(modalEl.classList.contains('hidden'), false, 'Modal should be shown');
      assert.strictEqual(titleEl.textContent, 'Delete Item');
      assert.strictEqual(msgEl.textContent, 'Are you sure?');
      assert.strictEqual(btnYes.textContent, 'Yes');
      assert.strictEqual(btnCancel.textContent, 'No');

      // Click cancel
      btnCancel.onclick({ stopPropagation: () => {} });
      assert.strictEqual(modalEl.classList.contains('hidden'), true, 'Modal should be hidden on cancel');
      assert.strictEqual(confirmed, false, 'onConfirm should NOT be called on cancel');

      // Open again and click Yes
      showConfirmDialog({
        title: 'Delete Item 2',
        message: 'Are you sure 2?',
        onConfirm: () => { confirmed = true; }
      });
      assert.strictEqual(modalEl.classList.contains('hidden'), false);

      btnYes.onclick({ stopPropagation: () => {} });
      assert.strictEqual(modalEl.classList.contains('hidden'), true);
      assert.strictEqual(confirmed, true, 'onConfirm should be called on Yes');
    } finally {
      globalThis.document = prevDoc;
    }
  });
});
