document.addEventListener('DOMContentLoaded', () => {
  // 1. Initialize i18n
  document.querySelectorAll('[data-i18n]').forEach((elem) => {
    const key = elem.getAttribute('data-i18n');
    const msg = chrome.i18n.getMessage(key);
    if (msg) {
      elem.textContent = msg;
    }
  });

  const toggle = document.getElementById('toggle-switch');
  const indicator = document.getElementById('status-indicator');

  function updateStatusUI(enabled) {
    toggle.checked = enabled;
    if (enabled) {
      indicator.textContent = chrome.i18n.getMessage('statusEnabled') || 'Enabled';
      indicator.className = 'status-indicator status-enabled';
    } else {
      indicator.textContent = chrome.i18n.getMessage('statusDisabled') || 'Disabled';
      indicator.className = 'status-indicator status-disabled';
    }
  }

  // 2. Load stored setting (default true)
  chrome.storage.sync.get({ enabled: true }, (res) => {
    updateStatusUI(res.enabled);
  });

  // 3. Handle toggle change
  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    chrome.storage.sync.set({ enabled }, () => {
      updateStatusUI(enabled);
    });
  });
});
