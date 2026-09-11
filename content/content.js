(() => {
  'use strict';

  // Prevent multiple injections
  if (window.__b64DecoderLoaded) return;
  window.__b64DecoderLoaded = true;

  let isGlobalEnabled = true;
  let disabledDomains = [];
  let observer = null;
  let debounceTimer = null;

  // i18n messages
  const i18n = {
    copyBtnTitle: chrome.i18n.getMessage('copyButtonTitle') || 'Copy decoded text',
    copiedFeedback: chrome.i18n.getMessage('copiedFeedback') || 'Copied!',
    originalPrefix: chrome.i18n.getMessage('originalTitle') || 'Original: ',
    toastEncoded: chrome.i18n.getMessage('toastEncoded') || 'Encoded to Base64 and copied to clipboard!',
    toastDecoded: chrome.i18n.getMessage('toastDecoded') || 'Decoded Base64 and copied to clipboard!',
    toastDecodeFailed: chrome.i18n.getMessage('toastDecodeFailed') || 'Selection is not a valid Base64 string',
    jwtBadgeTitle: chrome.i18n.getMessage('jwtBadgeTitle') || 'JWT Token',
    btnCopyPayload: chrome.i18n.getMessage('btnCopyPayload') || 'Copy Payload',
    imageBadgeTitle: chrome.i18n.getMessage('imageBadgeTitle') || 'Base64 Image',
    btnDownloadImage: chrome.i18n.getMessage('btnDownloadImage') || 'Download Image',
    btnCopyDataUrl: chrome.i18n.getMessage('btnCopyDataUrl') || 'Copy Image URL',
    originalBadgeTitle: chrome.i18n.getMessage('originalBadgeTitle') || 'Original Base64',
    btnCopyOriginal: chrome.i18n.getMessage('btnCopyOriginal') || 'Copy Original Base64'
  };

  function normalizeDomain(host) {
    if (!host) return '';
    return host.toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '').replace(/^\.+/, '');
  }

  function isDomainDisabled(host, list) {
    const normHost = normalizeDomain(host);
    if (!normHost) return false;
    return (list || []).some((item) => {
      const normItem = normalizeDomain(item);
      return normHost === normItem || normHost.endsWith('.' + normItem);
    });
  }

  function isEffectiveEnabled() {
    return isGlobalEnabled && !isDomainDisabled(window.location.hostname, disabledDomains);
  }

  // Tag blacklist: elements whose text shouldn't be processed
  const IGNORED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
    'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'AUDIO', 'VIDEO'
  ]);

  function utf8ToBase64(str) {
    const bytes = new TextEncoder().encode(str);
    const binString = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
    return btoa(binString);
  }

  /**
   * Check if token meets candidate Base64 heuristics
   */
  function isValidBase64Candidate(token) {
    if (!token) return false;
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(token)) return false;

    const hasPadding = token.endsWith('=');
    if (hasPadding) {
      if (token.length < 4 || token.length % 4 !== 0) return false;
    } else {
      if (token.length < 8) return false;
      if (token.length % 4 === 1) return false;

      if (/^[a-z]+$/.test(token)) return false;
      if (/^[A-Z]+$/.test(token)) return false;
      if (/^[0-9]+$/.test(token)) return false;
      if (/^[0-9a-f]{16,}$/i.test(token)) return false;
    }

    return true;
  }

  /**
   * Attempt to decode candidate string
   */
  function tryDecodeBase64(candidate) {
    if (!isValidBase64Candidate(candidate)) return null;

    let normalized = candidate.replace(/-/g, '+').replace(/_/g, '/');
    while (normalized.length % 4 !== 0) {
      normalized += '=';
    }

    let binaryStr;
    try {
      binaryStr = atob(normalized);
    } catch (e) {
      return null;
    }

    if (!binaryStr || binaryStr.length === 0) return null;

    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    let text;
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      text = decoder.decode(bytes);
    } catch (e) {
      return null;
    }

    if (!isReadableText(text, candidate)) return null;

    return text;
  }

  /**
   * Validate that decoded text is human-readable, not binary/garbage
   */
  function isReadableText(text, original) {
    if (!text || text.trim().length === 0) return false;
    if (text.trim() === original.trim()) return false;

    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) {
      return false;
    }

    const allowedRegex = /^[\s\x20-\x7E\u00A0-\u024F\u0400-\u04FF\u2000-\u206F\u20A0-\u20CF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{1F300}-\u{1FAFF}]+$/u;
    return allowedRegex.test(text);
  }

  /**
   * Detect and parse JWT token
   */
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
        payloadRaw: JSON.stringify(payloadObj, null, 2),
        raw: token.trim()
      };
    } catch (e) {
      return null;
    }
  }

  /**
   * Detect Base64 Image (Data URL or Raw magic header)
   */
  function detectBase64Image(str) {
    if (!str || str.length < 40) return null;
    const trimmed = str.trim();

    if (trimmed.startsWith('data:image/')) {
      const match = trimmed.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,([A-Za-z0-9+/=]+)$/);
      if (match) {
        return {
          dataUrl: trimmed,
          format: match[1].toUpperCase(),
          raw: trimmed
        };
      }
    }

    let format = null;
    if (trimmed.startsWith('iVBORw0KGgo')) format = 'PNG';
    else if (trimmed.startsWith('/9j/')) format = 'JPEG';
    else if (trimmed.startsWith('R0lGOD')) format = 'GIF';
    else if (trimmed.startsWith('UklGR')) format = 'WEBP';

    if (format) {
      return {
        dataUrl: `data:image/${format.toLowerCase()};base64,${trimmed}`,
        format: format,
        raw: trimmed
      };
    }

    return null;
  }

  /**
   * Create standard decoded DOM element
   */
  function createDecodedElement(originalText, decodedText) {
    const wrapper = document.createElement('span');
    wrapper.className = 'b64-decoded-wrapper b64-has-popover';
    wrapper.setAttribute('data-b64-original', originalText);

    const textSpan = document.createElement('span');
    textSpan.className = 'b64-decoded-text';
    textSpan.textContent = decodedText;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'b64-copy-btn';
    copyBtn.setAttribute('type', 'button');
    copyBtn.setAttribute('title', i18n.copyBtnTitle);
    copyBtn.setAttribute('aria-label', i18n.copyBtnTitle);

    copyBtn.innerHTML = `
      <svg class="b64-icon-copy" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="b64-icon-check" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="b64-toast">${i18n.copiedFeedback}</span>
    `;

    // Interactive Popover Card
    const popover = document.createElement('div');
    popover.className = 'b64-popover-card';
    popover.innerHTML = `
      <div class="b64-popover-header">
        <span class="b64-popover-title">${i18n.originalBadgeTitle}</span>
      </div>
      <div class="b64-popover-code">${escapeHTML(originalText)}</div>
      <div class="b64-popover-actions">
        <button type="button" class="b64-popover-btn btn-copy-original">${i18n.btnCopyOriginal}</button>
      </div>
    `;

    wrapper.appendChild(textSpan);
    wrapper.appendChild(copyBtn);
    wrapper.appendChild(popover);
    return wrapper;
  }

  /**
   * Create JWT Token DOM element with preview popover
   */
  function createJwtElement(token, jwtInfo) {
    const wrapper = document.createElement('span');
    wrapper.className = 'b64-decoded-wrapper b64-jwt-wrapper b64-has-popover';
    wrapper.setAttribute('data-b64-original', token);

    const tagSpan = document.createElement('span');
    tagSpan.className = 'b64-badge-tag b64-jwt-tag';
    tagSpan.textContent = 'JWT';

    const textSpan = document.createElement('span');
    textSpan.className = 'b64-decoded-text';
    const sub = jwtInfo.payload.sub || jwtInfo.payload.name || jwtInfo.header.alg || 'Token';
    textSpan.textContent = `⚡ ${sub}`;

    // Popover Card
    const popover = document.createElement('div');
    popover.className = 'b64-popover-card';
    popover.innerHTML = `
      <div class="b64-popover-header">
        <span class="b64-popover-title">${i18n.jwtBadgeTitle}</span>
        <span>${escapeHTML(jwtInfo.header.alg || 'JWT')}</span>
      </div>
      <div class="b64-popover-code">${escapeHTML(jwtInfo.payloadRaw)}</div>
      <div class="b64-popover-actions">
        <button type="button" class="b64-popover-btn btn-copy-payload">${i18n.btnCopyPayload}</button>
      </div>
    `;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'b64-copy-btn';
    copyBtn.setAttribute('type', 'button');
    copyBtn.setAttribute('title', i18n.copyBtnTitle);
    copyBtn.innerHTML = `
      <svg class="b64-icon-copy" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <svg class="b64-icon-check" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
      <span class="b64-toast">${i18n.copiedFeedback}</span>
    `;

    wrapper.appendChild(tagSpan);
    wrapper.appendChild(textSpan);
    wrapper.appendChild(copyBtn);
    wrapper.appendChild(popover);
    return wrapper;
  }

  /**
   * Create Base64 Image DOM element with preview popover
   */
  function createImageElement(originalText, imgInfo) {
    const wrapper = document.createElement('span');
    wrapper.className = 'b64-decoded-wrapper b64-image-wrapper b64-has-popover';
    wrapper.setAttribute('data-b64-original', originalText);

    const tagSpan = document.createElement('span');
    tagSpan.className = 'b64-badge-tag b64-image-tag';
    tagSpan.textContent = imgInfo.format;

    const textSpan = document.createElement('span');
    textSpan.className = 'b64-decoded-text';
    textSpan.textContent = `🖼️ Base64 ${imgInfo.format}`;

    const popover = document.createElement('div');
    popover.className = 'b64-popover-card';
    popover.innerHTML = `
      <div class="b64-popover-header">
        <span class="b64-popover-title">${i18n.imageBadgeTitle} (${imgInfo.format})</span>
      </div>
      <img src="${imgInfo.dataUrl}" class="b64-popover-img" alt="Preview">
      <div class="b64-popover-actions">
        <a href="${imgInfo.dataUrl}" download="image.${imgInfo.format.toLowerCase()}" class="b64-popover-btn">${i18n.btnDownloadImage}</a>
        <button type="button" class="b64-popover-btn btn-copy-dataurl">${i18n.btnCopyDataUrl}</button>
      </div>
    `;

    wrapper.appendChild(tagSpan);
    wrapper.appendChild(textSpan);
    wrapper.appendChild(popover);
    return wrapper;
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, (tag) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  /**
   * Scan and process a single TextNode
   */
  function processTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent;
    if (!text || text.length < 4) return;

    // Pattern matching Data URLs, JWT tokens, and regular Base64
    const regex = /(data:image\/(?:png|jpeg|jpg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]{20,}|[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+|[A-Za-z0-9+/_-]{4,}={0,2})/g;
    let match;
    const matches = [];

    while ((match = regex.exec(text)) !== null) {
      const candidate = match[0];

      // 1. Check if JWT
      const jwtInfo = tryParseJWT(candidate);
      if (jwtInfo) {
        matches.push({
          index: match.index,
          length: candidate.length,
          type: 'jwt',
          original: candidate,
          data: jwtInfo
        });
        continue;
      }

      // 2. Check if Image
      const imgInfo = detectBase64Image(candidate);
      if (imgInfo) {
        matches.push({
          index: match.index,
          length: candidate.length,
          type: 'image',
          original: candidate,
          data: imgInfo
        });
        continue;
      }

      // 3. Check if standard Base64 text
      const decoded = tryDecodeBase64(candidate);
      if (decoded !== null) {
        matches.push({
          index: match.index,
          length: candidate.length,
          type: 'text',
          original: candidate,
          data: decoded
        });
      }
    }

    if (matches.length === 0) return;

    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const m of matches) {
      if (m.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.index)));
      }

      let elem;
      if (m.type === 'jwt') {
        elem = createJwtElement(m.original, m.data);
      } else if (m.type === 'image') {
        elem = createImageElement(m.original, m.data);
      } else {
        elem = createDecodedElement(m.original, m.data);
      }
      fragment.appendChild(elem);

      lastIndex = m.index + m.length;
    }

    if (lastIndex < text.length) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    if (node.parentNode) {
      node.parentNode.replaceChild(fragment, node);
    }
  }

  /**
   * Walk root element and process eligible text nodes
   */
  function scanNode(root) {
    if (!isEffectiveEnabled() || !root) return;

    if (root.nodeType === Node.ELEMENT_NODE) {
      if (IGNORED_TAGS.has(root.tagName) || root.isContentEditable) return;
      if (root.closest && root.closest('.b64-decoded-wrapper')) return;
    }

    if (root.nodeType === Node.TEXT_NODE) {
      const parent = root.parentNode;
      if (parent && !IGNORED_TAGS.has(parent.tagName) && !parent.isContentEditable && !parent.closest('.b64-decoded-wrapper')) {
        processTextNode(root);
      }
      return;
    }

    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentNode;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (IGNORED_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
          if (parent.closest && parent.closest('.b64-decoded-wrapper')) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const nodesToProcess = [];
    let currentNode;
    while ((currentNode = walker.nextNode())) {
      nodesToProcess.push(currentNode);
    }

    for (const node of nodesToProcess) {
      processTextNode(node);
    }
  }

  /**
   * Revert all decoded elements back to original strings
   */
  function revertAll() {
    const wrappers = document.querySelectorAll('.b64-decoded-wrapper');
    wrappers.forEach((wrapper) => {
      const original = wrapper.getAttribute('data-b64-original');
      if (original) {
        wrapper.replaceWith(document.createTextNode(original));
      }
    });
  }

  /**
   * Observe DOM mutations for dynamic content
   */
  let pendingNodes = [];

  function startObserver() {
    if (observer) observer.disconnect();

    observer = new MutationObserver((mutations) => {
      if (!isEffectiveEnabled()) return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          pendingNodes.push(node);
        }
      }

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const nodes = pendingNodes;
        pendingNodes = [];
        for (const node of nodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.classList && (node.classList.contains('b64-decoded-wrapper') || node.classList.contains('b64-copy-btn'))) {
              continue;
            }
            scanNode(node);
          } else if (node.nodeType === Node.TEXT_NODE) {
            scanNode(node);
          }
        }
      }, 150);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  /**
   * Global Floating Toast Notification
   */
  function showGlobalToast(msg, isWarning = false) {
    let container = document.querySelector('.b64-global-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'b64-global-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'b64-global-toast' + (isWarning ? ' toast-warning' : '');
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.transition = 'opacity 0.2s, transform 0.2s';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-10px)';
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  /**
   * Event delegation for copy buttons and popover actions
   */
  document.addEventListener('click', (e) => {
    // 1. Regular decoded text copy button
    const copyBtn = e.target.closest('.b64-copy-btn');
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = copyBtn.closest('.b64-decoded-wrapper');
      if (!wrapper) return;
      const original = wrapper.getAttribute('data-b64-original');
      const textSpan = wrapper.querySelector('.b64-decoded-text');
      const textToCopy = textSpan ? textSpan.textContent : original;

      const doSuccess = () => {
        copyBtn.classList.add('b64-copied');
        setTimeout(() => copyBtn.classList.remove('b64-copied'), 1500);
      };

      navigator.clipboard.writeText(textToCopy).then(doSuccess).catch(() => {
        fallbackCopy(textToCopy, doSuccess);
      });
      return;
    }

    // 2. JWT Popover: Copy Payload
    const jwtPayloadBtn = e.target.closest('.btn-copy-payload');
    if (jwtPayloadBtn) {
      e.preventDefault();
      e.stopPropagation();
      const popover = jwtPayloadBtn.closest('.b64-popover-card');
      const codeElem = popover ? popover.querySelector('.b64-popover-code') : null;
      if (codeElem) {
        navigator.clipboard.writeText(codeElem.textContent).then(() => {
          showGlobalToast(i18n.copiedFeedback);
        });
      }
      return;
    }

    // 3. Image Popover: Copy Data URL
    const copyImgBtn = e.target.closest('.btn-copy-dataurl');
    if (copyImgBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = copyImgBtn.closest('.b64-decoded-wrapper');
      const original = wrapper ? wrapper.getAttribute('data-b64-original') : '';
      if (original) {
        navigator.clipboard.writeText(original).then(() => {
          showGlobalToast(i18n.copiedFeedback);
        });
      }
      return;
    }

    // 4. Popover: Copy Original Base64
    const copyOrigBtn = e.target.closest('.btn-copy-original');
    if (copyOrigBtn) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = copyOrigBtn.closest('.b64-decoded-wrapper');
      const original = wrapper ? wrapper.getAttribute('data-b64-original') : '';
      if (original) {
        navigator.clipboard.writeText(original).then(() => {
          showGlobalToast(i18n.copiedFeedback);
        });
      }
      return;
    }
  }, true);

  // Smart positioning for popovers near viewport edges
  document.addEventListener('mouseenter', (e) => {
    const target = e.target.closest && e.target.closest('.b64-has-popover');
    if (!target) return;
    const card = target.querySelector('.b64-popover-card');
    if (!card) return;
    const rect = target.getBoundingClientRect();
    if (rect.left + 300 > window.innerWidth) {
      card.style.left = 'auto';
      card.style.right = '0';
    } else {
      card.style.left = '0';
      card.style.right = 'auto';
    }
    if (rect.bottom + 220 > window.innerHeight && rect.top > 220) {
      card.style.top = 'auto';
      card.style.bottom = 'calc(100% + 6px)';
      card.classList.add('popover-top');
    } else {
      card.style.top = 'calc(100% + 6px)';
      card.style.bottom = 'auto';
      card.classList.remove('popover-top');
    }
  }, true);

  function fallbackCopy(text, callback) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      document.execCommand('copy');
      if (callback) callback();
    } catch (err) {
      console.error('[Base64 Decoder] Copy failed', err);
    }
    document.body.removeChild(el);
  }

  /**
   * Apply effective status change
   */
  let lastEffectiveEnabled = null;

  function setStatus(effectiveEnabled) {
    if (lastEffectiveEnabled === effectiveEnabled) return;
    lastEffectiveEnabled = effectiveEnabled;

    if (effectiveEnabled) {
      scanNode(document.body);
      startObserver();
    } else {
      stopObserver();
      revertAll();
    }
  }

  /**
   * Context Menu Action Handlers
   */
  function handleEncodeSelection(selectedText) {
    const text = selectedText || window.getSelection().toString();
    if (!text) return;

    const b64 = utf8ToBase64(text);

    // Try replacing in active editable element
    const active = document.activeElement;
    let replacedInPlace = false;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
      try {
        replacedInPlace = document.execCommand('insertText', false, b64);
      } catch (err) {}
    }

    // Also copy to clipboard
    navigator.clipboard.writeText(b64).then(() => {
      showGlobalToast(i18n.toastEncoded);
    }).catch(() => {
      fallbackCopy(b64, () => showGlobalToast(i18n.toastEncoded));
    });
  }

  function handleDecodeSelection(selectedText) {
    const text = (selectedText || window.getSelection().toString()).trim();
    if (!text) return;

    // First check JWT
    const jwtInfo = tryParseJWT(text);
    if (jwtInfo) {
      const payload = jwtInfo.payloadRaw;
      navigator.clipboard.writeText(payload).then(() => {
        showGlobalToast(`JWT: ${i18n.toastDecoded}`);
      }).catch(() => {
        fallbackCopy(payload, () => showGlobalToast(`JWT: ${i18n.toastDecoded}`));
      });
      return;
    }

    // Then check standard Base64
    const decoded = tryDecodeBase64(text);
    if (decoded) {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
        try {
          document.execCommand('insertText', false, decoded);
        } catch (err) {}
      }

      navigator.clipboard.writeText(decoded).then(() => {
        showGlobalToast(i18n.toastDecoded);
      }).catch(() => {
        fallbackCopy(decoded, () => showGlobalToast(i18n.toastDecoded));
      });
    } else {
      showGlobalToast(i18n.toastDecodeFailed, true);
    }
  }

  // Listen for background service worker context menu messages
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'encode-selection') {
      handleEncodeSelection(req.selectionText);
      sendResponse({ status: 'ok' });
    } else if (req.action === 'decode-selection') {
      handleDecodeSelection(req.selectionText);
      sendResponse({ status: 'ok' });
    }
  });

  // Listen for storage changes from popup
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync') {
      let changed = false;
      if (changes.enabled !== undefined) {
        isGlobalEnabled = changes.enabled.newValue;
        changed = true;
      }
      if (changes.disabledDomains !== undefined) {
        disabledDomains = changes.disabledDomains.newValue || [];
        changed = true;
      }
      if (changed) {
        setStatus(isEffectiveEnabled());
      }
    }
  });

  // Initial load
  chrome.storage.sync.get({ enabled: true, disabledDomains: [] }, (res) => {
    isGlobalEnabled = res.enabled !== false;
    disabledDomains = res.disabledDomains || [];

    if (isEffectiveEnabled()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          scanNode(document.body);
          startObserver();
        });
      } else {
        scanNode(document.body);
        startObserver();
      }
    }
  });
})();
