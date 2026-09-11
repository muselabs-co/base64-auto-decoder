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

  const MESSAGES = {
    en: {
      popupTitle: 'Base64 Decoder',
      footerVersion: 'v1.2.0',
      statusLabel: 'Auto Decode',
      statusEnabled: 'Enabled',
      statusDisabled: 'Disabled',
      siteSettingLabel: 'Current Site',
      blacklistTitle: 'Blacklist Management',
      domainPlaceholder: 'Enter domain (e.g. v2ex.com)...',
      btnAddDomain: 'Add',
      emptyBlacklist: 'No disabled websites. Auto-decode is active on all sites.',
      btnRemoveDomain: 'Remove from blacklist',
      snippetsTitle: 'Quick Base64',
      inputPlaceholder: 'Enter text (email, URL, etc.)...',
      tagPlaceholder: 'Tag (optional)',
      btnAdd: 'Add',
      btnCopy: 'Copy',
      btnCopied: 'Copied!',
      btnDelete: 'Delete',
      emptySnippets: 'No saved items. Add one for quick copying.',
      smartDecodedLabel: 'Decoded',
      btnCopyPlain: 'Copy Text',
      btnUsePlain: 'Use Plain',
      btnCopyPayload: 'Copy Payload',
      tipSync: 'Status syncs across open tabs automatically.'
    },
    zh_CN: {
      popupTitle: 'Base64 自动解码',
      footerVersion: 'v1.2.0',
      statusLabel: '自动解码',
      statusEnabled: '已开启',
      statusDisabled: '已关闭',
      siteSettingLabel: '当前网站',
      blacklistTitle: '网站黑名单管理',
      domainPlaceholder: '输入域名 (如 v2ex.com)...',
      btnAddDomain: '添加',
      emptyBlacklist: '暂无禁用网站，所有网站默认自动解码',
      btnRemoveDomain: '移出黑名单',
      snippetsTitle: '常用 Base64 管理',
      inputPlaceholder: '输入文本 (如邮箱、URL等)...',
      tagPlaceholder: '标签 (选填)',
      btnAdd: '添加',
      btnCopy: '复制',
      btnCopied: '已复制!',
      btnDelete: '删除',
      emptySnippets: '暂无常用项，添加后即可一键复制',
      smartDecodedLabel: '已识别并解码',
      btnCopyPlain: '复制明文',
      btnUsePlain: '设为明文',
      btnCopyPayload: '复制 Payload',
      tipSync: '开关状态会自动同步至已打开的网页。'
    }
  };

  let currentLang = 'en'; // Default to English as requested

  function getMsg(key, defaultMsg = '') {
    const table = MESSAGES[currentLang] || MESSAGES.en;
    if (table[key] !== undefined) return table[key];
    if (typeof chrome !== 'undefined' && chrome.i18n && chrome.i18n.getMessage) {
      return chrome.i18n.getMessage(key) || defaultMsg;
    }
    return defaultMsg;
  }

  function normalizeDomain(host) {
    if (!host) return '';
    return host.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '').replace(/^\.+/, '');
  }

  function isDomainDisabled(host, disabledList) {
    const normHost = normalizeDomain(host);
    if (!normHost) return false;
    return (disabledList || []).some((item) => {
      const normItem = normalizeDomain(item);
      return normHost === normItem || normHost.endsWith('.' + normItem);
    });
  }

  function applyLanguage(lang) {
    currentLang = lang === 'zh_CN' || lang === 'zh' ? 'zh_CN' : 'en';

    const langEnSpan = document.getElementById('lang-en');
    const langZhSpan = document.getElementById('lang-zh');
    if (langEnSpan) langEnSpan.classList.toggle('active', currentLang === 'en');
    if (langZhSpan) langZhSpan.classList.toggle('active', currentLang === 'zh_CN');
    document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';

    document.querySelectorAll('[data-i18n]').forEach((elem) => {
      const key = elem.getAttribute('data-i18n');
      const msg = getMsg(key);
      if (msg) elem.textContent = msg;
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((elem) => {
      const key = elem.getAttribute('data-i18n-placeholder');
      const msg = getMsg(key);
      if (msg) elem.placeholder = msg;
    });

    // Re-render components with translated dynamic texts
    storage.get({ enabled: true, disabledDomains: [], snippets: [] }, (res) => {
      updateStatusUI(res.enabled !== false);
      updateSiteUI(res.disabledDomains || []);
      renderBlacklist(res.disabledDomains || []);
      renderSnippets(res.snippets || []);
    });
  }

  const langToggleBtn = document.getElementById('lang-toggle-btn');
  if (langToggleBtn) {
    langToggleBtn.addEventListener('click', () => {
      const nextLang = currentLang === 'en' ? 'zh_CN' : 'en';
      storage.set({ userLang: nextLang }, () => {
        applyLanguage(nextLang);
      });
    });
  }

  // Initial load of language preference (defaults to 'en')
  storage.get({ userLang: 'en' }, (res) => {
    applyLanguage(res.userLang || 'en');
  });

  // 2. Main Auto-Decode Switch & Current Site Switch
  const toggle = document.getElementById('toggle-switch');
  const indicator = document.getElementById('status-indicator');

  const siteCard = document.getElementById('site-card');
  const siteDomain = document.getElementById('site-domain');
  const siteStatusIndicator = document.getElementById('site-status-indicator');
  const siteToggleSwitch = document.getElementById('site-toggle-switch');
  let currentHost = '';

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

  // Current Site Logic
  function updateSiteUI(disabledDomains) {
    if (!currentHost) return;
    const isSiteEnabled = !isDomainDisabled(currentHost, disabledDomains);

    // Top site card toggle & indicator
    siteToggleSwitch.checked = isSiteEnabled;
    if (isSiteEnabled) {
      siteStatusIndicator.textContent = getMsg('statusEnabled', 'Enabled');
      siteStatusIndicator.className = 'status-indicator status-enabled';
    } else {
      siteStatusIndicator.textContent = getMsg('statusDisabled', 'Disabled');
      siteStatusIndicator.className = 'status-indicator status-disabled';
    }
  }

  // Blacklist Management Logic
  const blacklistSection = document.getElementById('blacklist-section');
  const blacklistHeader = document.getElementById('blacklist-header');
  const blacklistCount = document.getElementById('blacklist-count');
  const blacklistList = document.getElementById('blacklist-list');
  const addBlacklistForm = document.getElementById('add-blacklist-form');
  const inputDomain = document.getElementById('input-domain');
  let currentDisabledDomains = [];

  blacklistHeader.addEventListener('click', () => {
    blacklistSection.classList.toggle('collapsed');
  });

  function renderBlacklist(domains) {
    currentDisabledDomains = domains || [];
    blacklistCount.textContent = currentDisabledDomains.length;

    if (currentDisabledDomains.length === 0) {
      const emptyMsg = getMsg('emptyBlacklist', 'No disabled websites. Auto-decode is active on all sites.');
      blacklistList.innerHTML = `<div class="empty-state">${escapeHTML(emptyMsg)}</div>`;
      return;
    }

    blacklistList.innerHTML = '';
    const removeLabel = getMsg('btnRemoveDomain', 'Remove from blacklist');

    currentDisabledDomains.forEach((domain) => {
      const item = document.createElement('div');
      item.className = 'blacklist-item';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'blacklist-domain-name';
      nameSpan.textContent = domain;
      nameSpan.title = domain;

      const delBtn = document.createElement('button');
      delBtn.className = 'btn-icon btn-delete';
      delBtn.type = 'button';
      delBtn.title = removeLabel;
      delBtn.innerHTML = ICON_TRASH;
      delBtn.addEventListener('click', () => removeDomainFromBlacklist(domain));

      item.appendChild(nameSpan);
      item.appendChild(delBtn);
      blacklistList.appendChild(item);
    });
  }

  function saveBlacklist(domains) {
    storage.set({ disabledDomains: domains }, () => {
      renderBlacklist(domains);
      updateSiteUI(domains);
    });
  }

  function removeDomainFromBlacklist(domain) {
    const normTarget = normalizeDomain(domain);
    const updated = currentDisabledDomains.filter((d) => normalizeDomain(d) !== normTarget);
    saveBlacklist(updated);
  }

  addBlacklistForm.addEventListener('submit', (e) => {
    e.preventDefault();
    let val = normalizeDomain(inputDomain.value);
    if (!val || val.length < 3 || !val.includes('.')) {
      return;
    }

    if (!currentDisabledDomains.some((d) => normalizeDomain(d) === val)) {
      const updated = [val, ...currentDisabledDomains];
      saveBlacklist(updated);
    }

    inputDomain.value = '';
  });

  // Initial Blacklist Load
  storage.get({ disabledDomains: [] }, (res) => {
    renderBlacklist(res.disabledDomains || []);
  });

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0] && tabs[0].url) {
        try {
          const url = new URL(tabs[0].url);
          if (url.protocol === 'http:' || url.protocol === 'https:') {
            currentHost = normalizeDomain(url.hostname);
            siteDomain.textContent = currentHost;
            siteDomain.title = currentHost;
            siteCard.style.display = 'flex';
            storage.get({ disabledDomains: [] }, (res) => {
              const list = res.disabledDomains || [];
              updateSiteUI(list);
              renderBlacklist(list);
            });
          }
        } catch (e) {}
      }
    });
  } else {
    // Local / Dev preview fallback
    currentHost = 'v2ex.com';
    siteDomain.textContent = currentHost;
    siteDomain.title = currentHost;
    siteCard.style.display = 'flex';
    storage.get({ disabledDomains: [] }, (res) => {
      const list = res.disabledDomains || [];
      updateSiteUI(list);
      renderBlacklist(list);
    });
  }

  siteToggleSwitch.addEventListener('change', () => {
    if (!currentHost) return;
    const normCurrent = normalizeDomain(currentHost);
    storage.get({ disabledDomains: [] }, (res) => {
      let list = res.disabledDomains || [];
      if (siteToggleSwitch.checked) {
        list = list.filter((h) => normalizeDomain(h) !== normCurrent);
      } else {
        if (!isDomainDisabled(normCurrent, list)) {
          list.push(normCurrent);
        }
      }
      storage.set({ disabledDomains: list }, () => {
        updateSiteUI(list);
        renderBlacklist(list);
      });
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

  function tryParseJWT(token) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.trim().split('.');
    if (parts.length !== 3) return null;

    function decodeB64Url(str) {
      let norm = str.replace(/-/g, '+').replace(/_/g, '/');
      while (norm.length % 4 !== 0) norm += '=';
      const bin = atob(norm);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }

    try {
      const headerStr = decodeB64Url(parts[0]);
      const payloadStr = decodeB64Url(parts[1]);
      const headerObj = JSON.parse(headerStr);
      const payloadObj = JSON.parse(payloadStr);

      if (!headerObj || typeof headerObj !== 'object' || (!headerObj.alg && !headerObj.typ)) {
        return null;
      }

      return {
        header: headerObj,
        payload: payloadObj,
        headerRaw: JSON.stringify(headerObj, null, 2),
        payloadRaw: JSON.stringify(payloadObj, null, 2)
      };
    } catch (e) {
      return null;
    }
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

    // 1. Check JWT
    const jwtInfo = tryParseJWT(val);
    if (jwtInfo) {
      currentDecodedText = jwtInfo.payloadRaw;
      smartDecodeText.textContent = `[Header]\n${jwtInfo.headerRaw}\n\n[Payload]\n${jwtInfo.payloadRaw}`;
      smartDecodeCard.classList.remove('hidden');
      const badgeSpan = smartDecodeCard.querySelector('.smart-decode-badge span');
      if (badgeSpan) badgeSpan.textContent = 'JWT Token';
      const copySpan = btnCopyDecoded.querySelector('span');
      if (copySpan) copySpan.textContent = getMsg('btnCopyPayload', '复制 Payload');
      return;
    }

    // 2. Check regular Base64
    const decoded = decodeBase64Text(val);
    if (decoded) {
      currentDecodedText = decoded;
      smartDecodeText.textContent = decoded;
      smartDecodeCard.classList.remove('hidden');
      const badgeSpan = smartDecodeCard.querySelector('.smart-decode-badge span');
      if (badgeSpan) badgeSpan.textContent = getMsg('smartDecodedLabel', '已识别并解码');
      const copySpan = btnCopyDecoded.querySelector('span');
      if (copySpan) copySpan.textContent = getMsg('btnCopyPlain', '复制明文');
    } else {
      currentDecodedText = '';
      smartDecodeCard.classList.add('hidden');
    }
  });

  btnCopyDecoded.addEventListener('click', () => {
    if (!currentDecodedText) return;
    navigator.clipboard.writeText(currentDecodedText).then(() => {
      const copiedLabel = getMsg('btnCopied', '已复制!');
      const prevHTML = btnCopyDecoded.innerHTML;
      btnCopyDecoded.classList.add('copied');
      btnCopyDecoded.innerHTML = `${ICON_CHECK}<span>${copiedLabel}</span>`;

      setTimeout(() => {
        btnCopyDecoded.classList.remove('copied');
        btnCopyDecoded.innerHTML = prevHTML;
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

