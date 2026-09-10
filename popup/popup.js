document.addEventListener('DOMContentLoaded', () => {
  // Safe Storage & i18n Fallback (allows previewing popup.html directly in browser)
  const isChromeExtension = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;
  const storage = isChromeExtension
    ? chrome.storage.sync
    : {
        get: (defaults, cb) => {
          try {
            const data = JSON.parse(localStorage.getItem('b64_mock_sync') || '{}');
            cb({ ...defaults, ...data });
          } catch {
            cb(defaults);
          }
        },
        set: (data, cb) => {
          try {
            const existing = JSON.parse(localStorage.getItem('b64_mock_sync') || '{}');
            localStorage.setItem('b64_mock_sync', JSON.stringify({ ...existing, ...data }));
          } catch {}
          if (cb) cb();
        }
      };

  function getMsg(key, defaultMsg = '') {
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      return chrome.i18n.getMessage(key) || defaultMsg;
    }
    return defaultMsg;
  }

  // 1. Initialize i18n for text content and placeholders
  document.querySelectorAll('[data-i18n]').forEach((elem) => {
    const key = elem.getAttribute('data-i18n');
    const msg = getMsg(key);
    if (msg) {
      elem.textContent = msg;
    }
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((elem) => {
    const key = elem.getAttribute('data-i18n-placeholder');
    const msg = getMsg(key);
    if (msg) {
      elem.placeholder = msg;
    }
  });

  // 2. Main Auto-Decode Switch
  const toggle = document.getElementById('toggle-switch');
  const indicator = document.getElementById('status-indicator');

  function updateStatusUI(enabled) {
    toggle.checked = enabled;
    if (enabled) {
      indicator.textContent = getMsg('statusEnabled', 'Enabled');
      indicator.className = 'status-indicator status-enabled';
    } else {
      indicator.textContent = getMsg('statusDisabled', 'Disabled');
      indicator.className = 'status-indicator status-disabled';
    }
  }

  storage.get({ enabled: true }, (res) => {
    updateStatusUI(res.enabled);
  });

  toggle.addEventListener('change', () => {
    const enabled = toggle.checked;
    storage.set({ enabled }, () => {
      updateStatusUI(enabled);
    });
  });

  // 3. Helper Functions
  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return btoa(binString);
  }

  function decodeBase64Text(candidate) {
    if (!candidate || candidate.length < 4) return null;
    const cleaned = candidate.trim();
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(cleaned)) return null;

    let normalized = cleaned.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }

    try {
      const binaryStr = atob(normalized);
      if (!binaryStr || binaryStr.length === 0) return null;
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const text = decoder.decode(bytes);

      if (!text || text.trim().length === 0) return null;
      if (text.trim() === cleaned) return null;
      if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) return null;

      const allowedRegex = /^[\s\x20-\x7E\u00A0-\u024F\u0400-\u04FF\u2000-\u206F\u20A0-\u20CF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{1F300}-\u{1FAFF}]+$/u;
      if (!allowedRegex.test(text)) return null;

      return text;
    } catch (e) {
      return null;
    }
  }

  const ICON_COPY = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg>`;
  const ICON_CHECK = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/></svg>`;
  const ICON_TRASH = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5zm3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0V6z"/><path fill-rule="evenodd" d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1v1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4H4.118zM2.5 3V2h11v1h-11z"/></svg>`;

  // 4. Snippets Management
  const form = document.getElementById('add-snippet-form');
  const inputText = document.getElementById('input-text');
  const inputTag = document.getElementById('input-tag');
  const snippetList = document.getElementById('snippet-list');
  const snippetCount = document.getElementById('snippet-count');

  // Smart Decode Preview Elements
  const smartDecodeCard = document.getElementById('smart-decode-card');
  const smartDecodeText = document.getElementById('smart-decode-text');
  const btnCopyDecoded = document.getElementById('btn-copy-decoded');
  const btnUseDecoded = document.getElementById('btn-use-decoded');
  let currentDecodedText = '';

  inputText.addEventListener('input', () => {
    const val = inputText.value.trim();
    const decoded = decodeBase64Text(val);
    if (decoded) {
      currentDecodedText = decoded;
      smartDecodeText.textContent = decoded;
      smartDecodeCard.classList.remove('hidden');
    } else {
      currentDecodedText = '';
      smartDecodeCard.classList.add('hidden');
    }
  });

  btnCopyDecoded.addEventListener('click', () => {
    if (!currentDecodedText) return;
    navigator.clipboard.writeText(currentDecodedText).then(() => {
      const copyPlainLabel = getMsg('btnCopyPlain', '复制明文');
      const copiedLabel = getMsg('btnCopied', '已复制!');
      btnCopyDecoded.classList.add('copied');
      btnCopyDecoded.innerHTML = `${ICON_CHECK}<span>${copiedLabel}</span>`;

      setTimeout(() => {
        btnCopyDecoded.classList.remove('copied');
        btnCopyDecoded.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/><path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/></svg><span>${copyPlainLabel}</span>`;
      }, 1400);
    });
  });

  btnUseDecoded.addEventListener('click', () => {
    if (!currentDecodedText) return;
    inputText.value = currentDecodedText;
    currentDecodedText = '';
    smartDecodeCard.classList.add('hidden');
    inputText.focus();
  });

  let currentSnippets = [];

  function renderSnippets(snippets) {
    currentSnippets = snippets || [];
    snippetCount.textContent = currentSnippets.length;

    if (currentSnippets.length === 0) {
      const emptyMsg = getMsg('emptySnippets', '暂无常用项，添加后即可一键复制');
      snippetList.innerHTML = `<div class="empty-state">${escapeHTML(emptyMsg)}</div>`;
      return;
    }

    snippetList.innerHTML = '';
    const copyLabel = getMsg('btnCopy', '复制');
    const deleteLabel = getMsg('btnDelete', '删除');

    currentSnippets.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'snippet-card';
      card.dataset.id = item.id;

      // Row 1: Label + Text + Delete
      const row1 = document.createElement('div');
      row1.className = 'snippet-row-1';

      const infoDiv = document.createElement('div');
      infoDiv.className = 'snippet-header-info';

      if (item.label && item.label.trim()) {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'snippet-tag';
        tagSpan.textContent = item.label.trim();
        infoDiv.appendChild(tagSpan);
      }

      const textSpan = document.createElement('span');
      textSpan.className = 'snippet-text';
      textSpan.textContent = item.text;
      textSpan.title = item.text;
      infoDiv.appendChild(textSpan);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-icon btn-delete';
      delBtn.title = deleteLabel;
      delBtn.innerHTML = ICON_TRASH;
      delBtn.addEventListener('click', () => deleteSnippet(item.id));

      row1.appendChild(infoDiv);
      row1.appendChild(delBtn);

      // Row 2: Base64 + Copy
      const row2 = document.createElement('div');
      row2.className = 'snippet-row-2';

      const b64Span = document.createElement('span');
      b64Span.className = 'snippet-b64';
      b64Span.textContent = item.b64;
      b64Span.title = item.b64;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn-copy-b64';
      copyBtn.innerHTML = `${ICON_COPY}<span>${copyLabel}</span>`;
      copyBtn.addEventListener('click', () => copySnippetBase64(item.b64, copyBtn));

      row2.appendChild(b64Span);
      row2.appendChild(copyBtn);

      card.appendChild(row1);
      card.appendChild(row2);
      snippetList.appendChild(card);
    });
  }

  function loadSnippets() {
    storage.get({ snippets: [] }, (res) => {
      renderSnippets(res.snippets);
    });
  }

  function saveSnippets(snippets) {
    storage.set({ snippets }, () => {
      renderSnippets(snippets);
    });
  }

  function deleteSnippet(id) {
    const updated = currentSnippets.filter((item) => item.id !== id);
    saveSnippets(updated);
  }

  function copySnippetBase64(b64Text, button) {
    navigator.clipboard.writeText(b64Text).then(() => {
      const copiedLabel = getMsg('btnCopied', '已复制!');
      const copyLabel = getMsg('btnCopy', '复制');
      button.classList.add('copied');
      button.innerHTML = `${ICON_CHECK}<span>${copiedLabel}</span>`;

      setTimeout(() => {
        button.classList.remove('copied');
        button.innerHTML = `${ICON_COPY}<span>${copyLabel}</span>`;
      }, 1400);
    }).catch((err) => {
      console.error('Failed to copy: ', err);
    });
  }

  // Handle Add Form Submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = inputText.value.trim();
    const label = inputTag.value.trim();

    if (!text) return;

    const b64 = utf8ToBase64(text);
    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      text,
      label,
      b64,
      createdAt: Date.now()
    };

    const updated = [newItem, ...currentSnippets];
    saveSnippets(updated);

    form.reset();
    currentDecodedText = '';
    smartDecodeCard.classList.add('hidden');
    inputText.focus();
  });

  // Initial Load
  loadSnippets();
});

