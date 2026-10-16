// Shared decoding logic, loaded by the content script, the popup and test/verify_decoder.js
(function (root) {
  'use strict';

  /**
   * Check if token meets candidate Base64 heuristics.
   * With `manual` (explicit context-menu decode) only ordinary word shapes are rejected;
   * the auto-scan rules that trade real Base64 for fewer false positives are skipped.
   */
  function isValidBase64Candidate(token, { manual = false } = {}) {
    if (!token) return false;
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(token)) return false;

    const hasPadding = token.endsWith('=');
    if (hasPadding) {
      if (token.length < 4 || token.length % 4 !== 0) return false;
    } else {
      if (token.length % 4 === 1) return false;

      // Ordinary words like "annotate", "Scarcity" are never decoded, even on request
      if (/^[a-z]+$/.test(token)) return false;
      if (/^[A-Z][a-z]+$/.test(token)) return false;

      if (manual) return token.length >= 4;

      if (token.length < 8) return false;
      // No uppercase letter: lowercase identifiers like "deepseekv4", "airport1", "deepseek-v4"
      if (/^[a-z0-9+/_-]+$/.test(token)) return false;
      if (/^[A-Z]+$/.test(token)) return false;
      if (/^[0-9]+$/.test(token)) return false;
      if (/^[0-9a-f]{16,}$/i.test(token)) return false;
    }

    return true;
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
    if (/\r(?!\n)/.test(text)) {
      return false;
    }

    const allowedRegex = /^[\s\x20-\x7E\u00A0-\u017F\u0400-\u04FF\u2000-\u206F\u20A0-\u20CF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{1F300}-\u{1FAFF}]+$/u;
    return allowedRegex.test(text);
  }

  /**
   * Attempt to decode candidate string; returns null unless it is plausible Base64 of readable text
   */
  function tryDecodeBase64(candidate, options) {
    if (!isValidBase64Candidate(candidate, options)) return null;

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
   * Decode an explicit user selection (context menu). `confident` is true when auto-scan would also
   * accept the token; looser manual matches (e.g. "WiFi" -> "Z!b") may be garbage and must not replace text.
   */
  function decodeSelection(text) {
    const decoded = tryDecodeBase64(text, { manual: true });
    if (decoded === null) return null;
    return { text: decoded, confident: isValidBase64Candidate(text) };
  }

  /**
   * Convert value to valid positive number timestamp, supporting string numbers
   */
  function toValidTimestamp(v) {
    if (v === undefined || v === null || v === '') return null;
    const num = Number(v);
    return (!isNaN(num) && num > 0) ? num : null;
  }

  /**
   * Compute JWT expiration status from payload `exp` (seconds, or milliseconds if 13 digits).
   * `diffSec` is the time left (active) or elapsed since expiry (expired).
   */
  function getJwtExpiry(payload, nowSec = Date.now() / 1000) {
    const isObject = !!payload && typeof payload === 'object';
    const exp = isObject ? toValidTimestamp(payload.exp) : null;
    const iat = isObject ? toValidTimestamp(payload.iat) : null;
    if (exp === null) {
      return { status: 'no_exp', isExpired: false, exp, iat, diffSec: null };
    }

    const expSec = exp > 1e11 ? exp / 1000 : exp;
    const isExpired = nowSec > expSec;
    return {
      status: isExpired ? 'expired' : 'active',
      isExpired,
      exp,
      iat,
      diffSec: Math.abs(nowSec - expSec)
    };
  }

  /**
   * Format a duration in seconds as a compact string, e.g. "2h 5m" / "2小时5分"
   */
  function formatDuration(sec, isZh) {
    sec = Math.max(0, Math.floor(sec));
    if (sec < 60) {
      return isZh ? `${sec}秒` : `${sec}s`;
    }
    const mins = Math.floor(sec / 60);
    if (mins < 60) {
      return isZh ? `${mins}分钟` : `${mins}m`;
    }
    const hours = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hours < 24) {
      if (remMins === 0) return isZh ? `${hours}小时` : `${hours}h`;
      return isZh ? `${hours}小时${remMins}分` : `${hours}h ${remMins}m`;
    }
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    if (remHours === 0) return isZh ? `${days}天` : `${days}d`;
    return isZh ? `${days}天${remHours}小时` : `${days}d ${remHours}h`;
  }

  /**
   * Format Unix timestamp (seconds or milliseconds) as a local "YYYY-MM-DD hh:mm:ss" string
   */
  function formatTimestamp(ts) {
    const validTs = toValidTimestamp(ts);
    if (!validTs) return null;
    const ms = validTs > 1e11 ? validTs : validTs * 1000;
    try {
      const d = new Date(ms);
      if (isNaN(d.getTime())) return null;
      const pad = (n) => String(n).padStart(2, '0');
      const Y = d.getFullYear();
      const M = pad(d.getMonth() + 1);
      const D = pad(d.getDate());
      const h = pad(d.getHours());
      const m = pad(d.getMinutes());
      const s = pad(d.getSeconds());
      return `${Y}-${M}-${D} ${h}:${m}:${s}`;
    } catch (e) {
      return null;
    }
  }

  /**
   * Build the JWT status shown in the UI. `labels` holds the localized { active, expired, noExp } badges.
   */
  function getJwtStatusInfo(payload, { isZh, labels }, nowSec) {
    const { status, exp, iat, diffSec } = getJwtExpiry(payload, nowSec);
    const expTimeStr = exp ? formatTimestamp(exp) : null;
    const iatTimeStr = iat ? formatTimestamp(iat) : null;

    if (status === 'no_exp') {
      return {
        status,
        label: labels.noExp,
        isExpired: false,
        expTimeStr: null,
        iatTimeStr,
        relativeStr: isZh ? '无过期时间' : 'No Expiry'
      };
    }

    const duration = formatDuration(diffSec, isZh);
    if (status === 'expired') {
      return {
        status,
        label: labels.expired,
        isExpired: true,
        expTimeStr,
        iatTimeStr,
        relativeStr: isZh ? `已过期 ${duration}` : `Expired ${duration} ago`
      };
    }
    return {
      status,
      label: labels.active,
      isExpired: false,
      expTimeStr,
      iatTimeStr,
      relativeStr: isZh ? `还剩 ${duration} 到期` : `Expires in ${duration}`
    };
  }

  /**
   * Decode a 3-part JWT into its header and payload; returns null unless the header looks like a JWT header
   * and the payload is a JSON object
   */
  function decodeJwt(token) {
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
      const header = JSON.parse(decodeB64Url(parts[0]));
      const payload = JSON.parse(decodeB64Url(parts[1]));
      if (!header || typeof header !== 'object' || (!header.alg && !header.typ)) {
        return null;
      }
      // A JWT payload is a claims object; callers read fields like payload.sub
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return null;
      }
      return {
        header,
        payload,
        headerRaw: JSON.stringify(header, null, 2),
        payloadRaw: JSON.stringify(payload, null, 2)
      };
    } catch (e) {
      return null;
    }
  }

  const api = {
    isValidBase64Candidate,
    isReadableText,
    tryDecodeBase64,
    decodeSelection,
    toValidTimestamp,
    getJwtExpiry,
    formatDuration,
    formatTimestamp,
    getJwtStatusInfo,
    decodeJwt
  };
  // Page elements can shadow `module` (e.g. <form id="module"><input name="exports">) even in a
  // content script, but not `window`, so only Node (no window) takes the CommonJS branch
  if (typeof window === 'undefined' && typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Base64Decoder = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
