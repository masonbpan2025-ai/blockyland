/**
 * In-game confirmation dialog utility for Minecraft Web Edition.
 * Displays a styled modal dialog that prevents pointer-lock capture,
 * never gets blocked by browser pop-up suppressors, and falls back to
 * window.confirm in headless test environments.
 */
export function showConfirmDialog({
  title = '⚠️ Confirm Deletion',
  message = 'Are you sure you want to delete this item? This cannot be undone.',
  confirmText = 'Yes, Delete',
  cancelText = 'Cancel',
  onConfirm
}) {
  if (typeof document !== 'undefined') {
    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (_) {}
    }
    const modal = document.getElementById('modal-confirm-delete');
    const msgEl = document.getElementById('confirm-delete-message');
    const titleEl = document.getElementById('confirm-delete-title');
    const btnYes = document.getElementById('btn-confirm-delete-yes');
    const btnCancel = document.getElementById('btn-confirm-delete-cancel');
    const btnClose = document.getElementById('btn-cancel-confirm-delete');

    if (modal && msgEl && btnYes) {
      if (titleEl) titleEl.textContent = title;
      msgEl.textContent = message;
      btnYes.textContent = confirmText;
      if (btnCancel) btnCancel.textContent = cancelText;
      modal.classList.remove('hidden');

      let onKeyDown = null;
      const cleanup = () => {
        modal.classList.add('hidden');
        btnYes.onclick = null;
        if (btnCancel) btnCancel.onclick = null;
        if (btnClose) btnClose.onclick = null;
        modal.onclick = null;
        if (onKeyDown && typeof window !== 'undefined') {
          window.removeEventListener('keydown', onKeyDown);
        }
      };

      onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cleanup();
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown);
      }

      modal.onclick = (e) => {
        if (e.target === modal) {
          e.stopPropagation();
          cleanup();
        }
      };

      btnYes.onclick = (e) => {
        e?.stopPropagation?.();
        cleanup();
        onConfirm?.();
      };

      if (btnCancel) {
        btnCancel.onclick = (e) => {
          e?.stopPropagation?.();
          cleanup();
        };
      }
      if (btnClose) {
        btnClose.onclick = (e) => {
          e?.stopPropagation?.();
          cleanup();
        };
      }
      return;
    }
  }

  // Fallback for headless environments and tests
  if (typeof confirm === 'function') {
    if (confirm(message)) {
      onConfirm?.();
    }
  } else {
    onConfirm?.();
  }
}

/**
 * In-game difficulty selection dialog when switching to Survival mode.
 */
export function showDifficultyDialog({
  title = '⚔️ Switch to Survival Mode',
  currentDifficulty = 'normal',
  onSelect,
  onCancel,
} = {}) {
  if (typeof document !== 'undefined') {
    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (_) {}
    }
    const modal = document.getElementById('modal-select-difficulty');
    const titleEl = document.getElementById('difficulty-dialog-title');
    const btnCancel = document.getElementById('btn-cancel-difficulty-dialog');
    const btnClose = document.getElementById('btn-close-difficulty-dialog');
    const choiceButtons = modal?.querySelectorAll ? Array.from(modal.querySelectorAll('.difficulty-choice-btn')) : [];

    if (modal && choiceButtons.length) {
      if (titleEl) titleEl.textContent = title;
      modal.classList.remove('hidden');

      let onKeyDown = null;
      const cleanup = () => {
        modal.classList.add('hidden');
        choiceButtons.forEach((btn) => { btn.onclick = null; });
        if (btnCancel) btnCancel.onclick = null;
        if (btnClose) btnClose.onclick = null;
        modal.onclick = null;
        if (onKeyDown && typeof window !== 'undefined') {
          window.removeEventListener('keydown', onKeyDown);
        }
      };

      onKeyDown = (e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cleanup();
          onCancel?.();
        }
      };
      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', onKeyDown);
      }

      modal.onclick = (e) => {
        if (e.target === modal) {
          e.stopPropagation();
          cleanup();
          onCancel?.();
        }
      };

      choiceButtons.forEach((btn) => {
        const diff = btn.getAttribute?.('data-difficulty') || 'normal';
        btn.onclick = (e) => {
          e?.stopPropagation?.();
          cleanup();
          onSelect?.(diff);
        };
      });

      if (btnCancel) {
        btnCancel.onclick = (e) => {
          e?.stopPropagation?.();
          cleanup();
          onCancel?.();
        };
      }
      if (btnClose) {
        btnClose.onclick = (e) => {
          e?.stopPropagation?.();
          cleanup();
          onCancel?.();
        };
      }
      return;
    }
  }

  // Fallback for headless environments and tests
  onSelect?.(currentDifficulty || 'normal');
}

