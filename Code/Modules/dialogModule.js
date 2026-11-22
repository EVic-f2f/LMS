const AppDialogs = (() => {
  let queue = Promise.resolve();

  function createDialog() {
    let dialog = document.getElementById('app-dialog');
    if (dialog) return dialog;

    dialog = document.createElement('dialog');
    dialog.id = 'app-dialog';
    dialog.className = 'app-dialog';
    dialog.setAttribute('aria-labelledby', 'app-dialog-title');
    dialog.setAttribute('aria-describedby', 'app-dialog-message');
    dialog.innerHTML = `
      <div class="app-dialog-panel">
        <span class="app-dialog-icon" aria-hidden="true">!</span>
        <div class="app-dialog-copy">
          <p class="section-eyebrow" id="app-dialog-eyebrow">NOTICE</p>
          <h2 id="app-dialog-title"></h2>
          <p id="app-dialog-message"></p>
        </div>
        <label class="app-dialog-input-wrap" id="app-dialog-input-wrap" hidden>
          <span id="app-dialog-input-label"></span>
          <input id="app-dialog-input" type="text" autocomplete="off">
        </label>
        <p class="app-dialog-error" id="app-dialog-error" role="alert" hidden></p>
        <div class="app-dialog-actions">
          <button class="app-secondary-button" id="app-dialog-cancel" type="button">Cancel</button>
          <button class="app-primary-button" id="app-dialog-confirm" type="button">Continue</button>
        </div>
      </div>
    `;
    document.body.appendChild(dialog);
    return dialog;
  }

  function display(kind, options) {
    if (!document.body) return Promise.reject(new Error('Dialogs are unavailable before the page is ready.'));

    const dialog = createDialog();
    const title = dialog.querySelector('#app-dialog-title');
    const message = dialog.querySelector('#app-dialog-message');
    const eyebrow = dialog.querySelector('#app-dialog-eyebrow');
    const inputWrap = dialog.querySelector('#app-dialog-input-wrap');
    const inputLabel = dialog.querySelector('#app-dialog-input-label');
    const input = dialog.querySelector('#app-dialog-input');
    const error = dialog.querySelector('#app-dialog-error');
    const cancel = dialog.querySelector('#app-dialog-cancel');
    const confirm = dialog.querySelector('#app-dialog-confirm');
    const confirmationText = String(options.confirmationText || '').trim();

    dialog.dataset.tone = options.danger ? 'danger' : 'default';
    title.textContent = options.title || (kind === 'alert' ? 'Notice' : kind === 'prompt' ? 'Enter a value' : 'Confirm action');
    message.textContent = String(options.message || '');
    eyebrow.textContent = options.danger ? 'WARNING' : kind === 'prompt' ? 'INPUT REQUIRED' : kind === 'confirm' ? 'CONFIRM ACTION' : 'NOTICE';
    inputWrap.hidden = kind !== 'prompt' && !confirmationText;
    inputLabel.textContent = kind === 'prompt'
      ? options.inputLabel || 'Your response'
      : confirmationText ? `Type "${confirmationText}" to confirm.` : '';
    input.value = kind === 'prompt' ? String(options.defaultValue || '') : '';
    input.placeholder = options.placeholder || '';
    error.hidden = true;
    error.textContent = '';
    cancel.hidden = kind === 'alert';
    confirm.textContent = options.confirmText || (kind === 'alert' ? 'OK' : kind === 'prompt' ? 'Save' : 'Continue');
    confirm.classList.toggle('app-danger-button', Boolean(options.danger));
    confirm.classList.toggle('app-primary-button', !options.danger);
    dialog.returnValue = '';

    return new Promise((resolve) => {
      cancel.onclick = () => dialog.close('cancel');
      confirm.onclick = () => {
        if (confirmationText && input.value.trim() !== confirmationText) {
          error.textContent = 'The text does not match. Nothing has been changed.';
          error.hidden = false;
          input.focus();
          return;
        }
        dialog.close('confirm');
      };
      input.oninput = () => {
        error.hidden = true;
      };
      dialog.addEventListener('close', () => {
        if (kind === 'alert') {
          resolve(undefined);
        } else if (dialog.returnValue !== 'confirm') {
          resolve(kind === 'prompt' ? null : false);
        } else {
          resolve(kind === 'prompt' ? input.value.trim() : true);
        }
      }, { once: true });

      dialog.showModal();
      if (kind === 'prompt' || confirmationText) input.focus();
      else confirm.focus();
    });
  }

  function enqueue(kind, options = {}) {
    const result = queue.then(() => display(kind, options));
    queue = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    alert(message, options = {}) {
      return enqueue('alert', { ...options, message });
    },
    confirm(message, options = {}) {
      return enqueue('confirm', { ...options, message });
    },
    prompt(message, options = {}) {
      return enqueue('prompt', { ...options, message });
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = AppDialogs;
}
