(() => {
  'use strict';

  // Prevent multiple injections
  if (window.__b64DecoderLoaded) return;
  window.__b64DecoderLoaded = true;

  let isEnabled = true;
  let observer = null;
  let debounceTimer = null;

  // i18n messages
  const i18n = {
    copyBtnTitle: chrome.i18n.getMessage('copyButtonTitle') || 'Copy decoded text',
    copiedFeedback: chrome.i18n.getMessage('copiedFeedback') || 'Copied!',
    originalPrefix: chrome.i18n.getMessage('originalTitle') || 'Original: '
  };

  // Tag blacklist: elements whose text shouldn't be processed
  const IGNORED_TAGS = new Set([
    'SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT',
    'NOSCRIPT', 'IFRAME', 'SVG', 'CANVAS', 'AUDIO', 'VIDEO'
  ]);

  /**
   * Check if token meets candidate Base64 heuristics
   */
  function isValidBase64Candidate(token) {
    if (!token) return false;
    
    // Only standard or URL-safe base64 chars + padding
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(token)) return false;

    const hasPadding = token.endsWith('=');
    
    if (hasPadding) {
      if (token.length < 4 || token.length % 4 !== 0) return false;
    } else {
      if (token.length < 8) return false;
      if (token.length % 4 === 1) return false;

      // Filter out plain English words, numbers, and hex hashes
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

    // Reject control characters (0x00 - 0x08, 0x0B, 0x0C, 0x0E - 0x1F, 0x7F)
    if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) {
      return false;
    }

    // Must be valid printable characters (ASCII, CJK, Emojis, common symbols)
    const allowedRegex = /^[\s\x20-\x7E\u00A0-\u024F\u0400-\u04FF\u2000-\u206F\u20A0-\u20CF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{1F300}-\u{1FAFF}]+$/u;
    return allowedRegex.test(text);
  }

  /**
   * Create replacement DOM element for a decoded string
   */
  function createDecodedElement(originalText, decodedText) {
    const wrapper = document.createElement('span');
    wrapper.className = 'b64-decoded-wrapper';
    wrapper.setAttribute('data-b64-original', originalText);
    wrapper.setAttribute('title', `${i18n.originalPrefix}${originalText}`);

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

    wrapper.appendChild(textSpan);
    wrapper.appendChild(copyBtn);
    return wrapper;
  }

  /**
   * Scan and process a single TextNode
   */
  function processTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return;
    const text = node.textContent;
    if (!text || text.length < 4) return;

    // Pattern to match continuous candidate words
    const regex = /([A-Za-z0-9+/_-]{4,}={0,2})/g;
    let match;
    const matches = [];

    while ((match = regex.exec(text)) !== null) {
      const candidate = match[0];
      const decoded = tryDecodeBase64(candidate);
      if (decoded !== null) {
        matches.push({
          index: match.index,
          length: candidate.length,
          original: candidate,
          decoded: decoded
        });
      }
    }

    if (matches.length === 0) return;

    // Replace TextNode with fragment containing decoded elements
    const fragment = document.createDocumentFragment();
    let lastIndex = 0;

    for (const m of matches) {
      // Append preceding plain text
      if (m.index > lastIndex) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.index)));
      }

      // Append replacement element
      const decodedElem = createDecodedElement(m.original, m.decoded);
      fragment.appendChild(decodedElem);

      lastIndex = m.index + m.length;
    }

    // Append remaining text
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
    if (!isEnabled || !root) return;

    // If root is an element and blacklisted, ignore
    if (root.nodeType === Node.ELEMENT_NODE) {
      if (IGNORED_TAGS.has(root.tagName) || root.isContentEditable) return;
      if (root.closest && root.closest('.b64-decoded-wrapper')) return;
    }

    // If root itself is a text node
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
  function startObserver() {
    if (observer) observer.disconnect();
    
    observer = new MutationObserver((mutations) => {
      if (!isEnabled) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList && (node.classList.contains('b64-decoded-wrapper') || node.classList.contains('b64-copy-btn'))) {
                continue;
              }
              scanNode(node);
            } else if (node.nodeType === Node.TEXT_NODE) {
              scanNode(node);
            }
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
   * Event delegation for copy buttons
   */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.b64-copy-btn');
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const wrapper = btn.closest('.b64-decoded-wrapper');
    if (!wrapper) return;

    const textSpan = wrapper.querySelector('.b64-decoded-text');
    if (!textSpan) return;

    const textToCopy = textSpan.textContent;

    const doSuccess = () => {
      btn.classList.add('b64-copied');
      setTimeout(() => {
        btn.classList.remove('b64-copied');
      }, 1500);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textToCopy).then(doSuccess).catch(() => {
        fallbackCopy(textToCopy, doSuccess);
      });
    } else {
      fallbackCopy(textToCopy, doSuccess);
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
      callback();
    } catch (err) {
      console.error('[Base64 Decoder] Copy failed', err);
    }
    document.body.removeChild(el);
  }

  /**
   * Apply status change
   */
  function setStatus(enabled) {
    if (isEnabled === enabled) return;
    isEnabled = enabled;

    if (isEnabled) {
      scanNode(document.body);
      startObserver();
    } else {
      stopObserver();
      revertAll();
    }
  }

  // Listen for storage changes from popup
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'sync' && changes.enabled !== undefined) {
      setStatus(changes.enabled.newValue);
    }
  });

  // Initial load
  chrome.storage.sync.get({ enabled: true }, (res) => {
    isEnabled = res.enabled !== false;
    if (isEnabled) {
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
