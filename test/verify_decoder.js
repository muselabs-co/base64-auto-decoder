// Decoder verification script: runs the shared decoder used by content.js and popup.js

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  tryDecodeBase64,
  isReadableText,
  decodeSelection,
  getJwtExpiry,
  getJwtStatusInfo,
  formatDuration,
  decodeJwt
} = require('../shared/decoder.js');

// Auto-scan cases: page scanning and the popup smart-decode preview
const autoCases = [
  // Positives (Must decode successfully)
  { input: "5L2g5aW977yM5LiW55WM", expected: "你好，世界", desc: "Chinese greeting (padded/unpadded)" },
  { input: "aHR0cHM6Ly9naXRodWIuY29t", expected: "https://github.com", desc: "URL" },
  { input: "bWFnbmV0Oj94dD11cm46YnRpMDo=", expected: "magnet:?xt=urn:bti0:", desc: "Magnet link prefix with padding" },
  { input: "d3hpZDoxMjM0NTY3ODk=", expected: "wxid:123456789", desc: "WeChat ID" },
  { input: "SGVsbG8gV29ybGQh", expected: "Hello World!", desc: "English with space and exclamation" },
  { input: "MTIzNDU2", expected: "123456", desc: "Password digits" },
  { input: "6L+Z5piv5LiA5q615rWL6K+V5paH5pys", expected: "这是一段测试文本", desc: "Chinese text" },
  { input: "YWRtaW46cGFzc3dvcmQ=", expected: "admin:password", desc: "Basic auth string" },

  // Negatives (Must NOT decode / must be rejected)
  { input: "this", expected: null, desc: "Common English word (length 4)" },
  { input: "hello", expected: null, desc: "Common English word (length 5)" },
  { input: "administrator", expected: null, desc: "Pure lowercase English word" },
  { input: "annotate", expected: null, desc: "Pure lowercase English word (must NOT decode to jy赫^)" },
  { input: "deepseekv4", expected: null, desc: "Lowercase model name (must NOT decode to u穱礿)" },
  { input: "deepseek-v4", expected: null, desc: "Lowercase hyphenated identifier" },
  { input: "airport1", expected: null, desc: "Lowercase word with digit suffix" },
  { input: "d29ybmls", expected: null, desc: "No-uppercase Base64 is skipped by auto-scan" },
  { input: "QUJDREVG", expected: null, desc: "Pure uppercase Base64 is skipped by auto-scan" },
  { input: "WiFi", expected: null, desc: "Short mixed-case word" },
  { input: "INTERNATIONALIZATION", expected: null, desc: "Pure uppercase English word" },
  { input: "Scarcity", expected: null, desc: "Capitalized English word (must NOT decode to Iƫr+r)" },
  { input: "Remotion", expected: null, desc: "Capitalized English word (must NOT decode to E騶*')" },
  { input: "Democratization", expected: null, desc: "Capitalized English word" },
  { input: "Platform", expected: null, desc: "Capitalized English word" },
  { input: "Software", expected: null, desc: "Capitalized English word" },
  { input: "Security", expected: null, desc: "Capitalized English word" },
  { input: "1234567890", expected: null, desc: "Pure numbers" },
  { input: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", expected: null, desc: "SHA-256 hex hash" },
  { input: "7b502c3a1f489b0d23e6", expected: null, desc: "Hex commit ID / token" },
  { input: "abc", expected: null, desc: "Too short" },
];

// Manual (context menu) decode: skips auto-scan-only rules but still rejects ordinary words
const manualCases = [
  { input: "d29ybmls", expected: "wornil", desc: "No-uppercase Base64" },
  { input: "5o6l5pys", expected: "接本", desc: "No-uppercase Chinese Base64" },
  { input: "QUJDREVG", expected: "ABCDEF", desc: "Pure uppercase Base64" },
  { input: "TWFu", expected: "Man", desc: "Short unpadded Base64" },
  { input: "MTIzNDU2", expected: "123456", desc: "Regular Base64" },
  { input: "annotate", expected: null, desc: "Pure lowercase English word (must NOT decode to jy赫^)" },
  { input: "Scarcity", expected: null, desc: "Capitalized English word" },
  { input: "abc", expected: null, desc: "Too short" },
  { input: "WiFi", expected: "Z!b", desc: "Short mixed-case word decodes only on request" },
];

// Context-menu decode: `confident` decides whether an editable selection is replaced in place
const selectionCases = [
  { input: "SGVsbG8gV29ybGQh", expected: { text: "Hello World!", confident: true }, desc: "Regular Base64 is replaced in place" },
  { input: "QUJDREVG", expected: { text: "ABCDEF", confident: false }, desc: "Base64 skipped by auto-scan is only copied" },
  { input: "WiFi", expected: { text: "Z!b", confident: false }, desc: "Garbage from a short word is only copied, never replaced" },
  { input: "annotate", expected: null, desc: "Ordinary word is not decoded" },
];

console.log("Running Decoder Tests...\n");
const base64Stats = { passed: 0, failed: 0 };

function check(stats, label, tc, result) {
  if (JSON.stringify(result) === JSON.stringify(tc.expected)) {
    stats.passed++;
    console.log(`✅ PASS: [${label}: ${tc.desc}] Input: "${tc.input}" => ${JSON.stringify(result)}`);
  } else {
    stats.failed++;
    console.error(`❌ FAIL: [${label}: ${tc.desc}] Input: "${tc.input}"`);
    console.error(`   Expected: ${JSON.stringify(tc.expected)}`);
    console.error(`   Got:      ${JSON.stringify(result)}`);
  }
}

for (const tc of autoCases) {
  check(base64Stats, 'auto-scan', tc, tryDecodeBase64(tc.input));
}
for (const tc of manualCases) {
  check(base64Stats, 'manual', tc, tryDecodeBase64(tc.input, { manual: true }));
}
for (const tc of selectionCases) {
  check(base64Stats, 'selection', tc, decodeSelection(tc.input));
}

console.log(`\nBase64 Results: ${base64Stats.passed} passed, ${base64Stats.failed} failed.`);

// -------------------------------------------------------------
// JWT Status & Expiration Tests
// -------------------------------------------------------------
console.log("\nRunning JWT Status Tests...");

const jwtTestCases = [
  {
    name: "Active JWT with future expiration",
    payload: { sub: "admin", exp: 1700003600 }, // +1 hour
    nowSec: 1700000000,
    expectedStatus: "active",
    expectedExpired: false,
    expectedDiffSec: 3600
  },
  {
    name: "Active JWT with string numeric expiration (tolerance)",
    payload: { sub: "admin_str", exp: "1700003600" }, // +1 hour as string
    nowSec: 1700000000,
    expectedStatus: "active",
    expectedExpired: false,
    expectedDiffSec: 3600
  },
  {
    name: "Expired JWT with past expiration",
    payload: { sub: "user1", exp: 1699990000 }, // past
    nowSec: 1700000000,
    expectedStatus: "expired",
    expectedExpired: true,
    expectedDiffSec: 10000
  },
  {
    name: "Active JWT with millisecond timestamp (13 digits)",
    payload: { sub: "admin_ms", exp: 1700003600000 }, // +1 hour in ms
    nowSec: 1700000000,
    expectedStatus: "active",
    expectedExpired: false,
    expectedDiffSec: 3600
  },
  {
    name: "JWT without exp field",
    payload: { sub: "perpetual_token", iat: 1700000000 },
    nowSec: 1700000000,
    expectedStatus: "no_exp",
    expectedExpired: false,
    expectedDiffSec: null
  },
  {
    name: "Non-object payload",
    payload: 42,
    nowSec: 1700000000,
    expectedStatus: "no_exp",
    expectedExpired: false,
    expectedDiffSec: null
  }
];

let jwtPassed = 0;
let jwtFailed = 0;

for (const tc of jwtTestCases) {
  const res = getJwtExpiry(tc.payload, tc.nowSec);
  const ok = res.status === tc.expectedStatus && res.isExpired === tc.expectedExpired && res.diffSec === tc.expectedDiffSec;
  if (ok) {
    jwtPassed++;
    console.log(`✅ PASS: [${tc.name}] => status: ${res.status}, isExpired: ${res.isExpired}, diffSec: ${res.diffSec}`);
  } else {
    jwtFailed++;
    console.error(`❌ FAIL: [${tc.name}]`);
    console.error(`   Expected: status: ${tc.expectedStatus}, isExpired: ${tc.expectedExpired}, diffSec: ${tc.expectedDiffSec}`);
    console.error(`   Got:      status: ${res.status}, isExpired: ${res.isExpired}, diffSec: ${res.diffSec}`);
  }
}

console.log(`\nJWT Results: ${jwtPassed} passed, ${jwtFailed} failed.`);

// -------------------------------------------------------------
// JWT Parsing & Display Tests
// -------------------------------------------------------------
console.log("\nRunning JWT Parsing & Display Tests...");

const displayStats = { passed: 0, failed: 0 };
const ACTIVE_JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbl9hY3RpdmUiLCJuYW1lIjoiQWxpY2UiLCJleHAiOjI1MjQ2MDgwMDAsImlhdCI6MTcwMDAwMDAwMH0.fake_signature_abc123';
const LABELS = { active: 'A', expired: 'E', noExp: 'N' };
const statusSummary = (info) => [info.status, info.label, info.isExpired, info.relativeStr];

const displayCases = [
  { input: 'decodeJwt(test page token)', expected: { alg: 'HS256', sub: 'admin_active', exp: 2524608000 }, desc: 'Decodes header and payload',
    run: () => { const j = decodeJwt(ACTIVE_JWT); return { alg: j.header.alg, sub: j.payload.sub, exp: j.payload.exp }; } },
  { input: 'decodeJwt("a.b.c")', expected: null, desc: 'Rejects non-JWT dotted text', run: () => decodeJwt('a.b.c') },
  { input: 'decodeJwt(header without alg/typ)', expected: null, desc: 'Rejects header that is not a JWT header',
    run: () => decodeJwt('eyJmb28iOiJiYXIifQ.eyJzdWIiOiJ4In0.sig') },
  // Non-object payloads used to crash page scanning at jwtInfo.payload.sub
  { input: 'decodeJwt(payload "null    ")', expected: null, desc: 'Rejects null payload',
    run: () => decodeJwt('eyJhbGciOiJIUzI1NiJ9.bnVsbCAgICA.sig12345') },
  { input: 'decodeJwt(payload 42)', expected: null, desc: 'Rejects number payload',
    run: () => decodeJwt('eyJhbGciOiJIUzI1NiJ9.NDI.sig') },
  { input: 'decodeJwt(payload [1])', expected: null, desc: 'Rejects array payload',
    run: () => decodeJwt('eyJhbGciOiJIUzI1NiJ9.WzFd.sig') },
  { input: 'active +1h (en)', expected: ['active', 'A', false, 'Expires in 1h'], desc: 'Active relative time',
    run: () => statusSummary(getJwtStatusInfo({ exp: 1700003600 }, { isZh: false, labels: LABELS }, 1700000000)) },
  { input: 'active +1h (zh)', expected: ['active', 'A', false, '还剩 1小时 到期'], desc: 'Active relative time in Chinese',
    run: () => statusSummary(getJwtStatusInfo({ exp: 1700003600 }, { isZh: true, labels: LABELS }, 1700000000)) },
  { input: 'expired -10000s (en)', expected: ['expired', 'E', true, 'Expired 2h 46m ago'], desc: 'Expired relative time',
    run: () => statusSummary(getJwtStatusInfo({ exp: 1699990000 }, { isZh: false, labels: LABELS }, 1700000000)) },
  { input: 'no exp (zh)', expected: ['no_exp', 'N', false, '无过期时间'], desc: 'No expiry',
    run: () => statusSummary(getJwtStatusInfo({ sub: 'x' }, { isZh: true, labels: LABELS }, 1700000000)) },
  { input: 'formatDuration(90061)', expected: ['1d 1h', '1天1小时'], desc: 'Day-level durations',
    run: () => [formatDuration(90061, false), formatDuration(90061, true)] },
];

for (const tc of displayCases) {
  check(displayStats, 'jwt-display', tc, tc.run());
}

console.log(`\nJWT Display Results: ${displayStats.passed} passed, ${displayStats.failed} failed.`);

// -------------------------------------------------------------
// Readable Text Range & Source Hygiene Tests
// -------------------------------------------------------------
console.log("\nRunning Readable Text Range Tests...");

const rangeStats = { passed: 0, failed: 0 };
const ch = (code) => String.fromCodePoint(code);
const hex = (code) => 'U+' + code.toString(16).toUpperCase().padStart(4, '0');

// Edges of the allowed ranges: C1 controls must stay rejected even though U+00A0 right after them is allowed
const rangeCases = [
  ...[0x80, 0x85, 0x9F].map((code) => ({ input: hex(code), expected: false, desc: 'C1 control character is rejected', code })),
  ...[0xA0, 0x17F, 0x2000, 0x3000, 0x4E00].map((code) => ({ input: hex(code), expected: true, desc: 'Range boundary character is accepted', code })),
  ...[0x180, 0x3FF].map((code) => ({ input: hex(code), expected: false, desc: 'Character just outside a range is rejected', code })),
];
for (const tc of rangeCases) {
  check(rangeStats, 'readable-range', tc, isReadableText('a' + ch(tc.code), 'zz'));
}

// Invisible characters in the source (e.g. a literal U+00A0 instead of an escape) are easy to
// lose to editor normalization, which would silently widen the readable-text ranges
const INVISIBLE = (code) => (code >= 0x80 && code <= 0xA0) || code === 0xAD || code === 0x1680 ||
  (code >= 0x2000 && code <= 0x200F) || (code >= 0x2028 && code <= 0x202F) ||
  (code >= 0x205F && code <= 0x206F) || code === 0x3000 || code === 0xFEFF;
const decoderSource = fs.readFileSync(path.join(__dirname, '..', 'shared', 'decoder.js'), 'utf8');
const invisibleHits = [];
decoderSource.split('\n').forEach((line, i) => {
  for (const c of line) {
    if (INVISIBLE(c.codePointAt(0))) invisibleHits.push(`line ${i + 1}: ${hex(c.codePointAt(0))}`);
  }
});
check(rangeStats, 'source', { input: 'shared/decoder.js', expected: [], desc: 'No invisible characters in source (use \\uXXXX escapes)' }, invisibleHits);

console.log(`\nReadable Text Range Results: ${rangeStats.passed} passed, ${rangeStats.failed} failed.`);

// -------------------------------------------------------------
// Browser Global Export
// -------------------------------------------------------------
// In a browser, page elements can shadow `module` through window named properties even inside a
// content script. The decoder must still set globalThis.Base64Decoder there.
console.log("\nRunning Browser Global Export Tests...");

const exportStats = { passed: 0, failed: 0 };
function runDecoderInBrowserLikeContext(extraGlobals) {
  const context = vm.createContext({ atob, TextDecoder, ...extraGlobals });
  context.window = context;
  vm.runInContext(decoderSource, context);
  return typeof context.Base64Decoder === 'object' && typeof context.Base64Decoder.tryDecodeBase64 === 'function';
}
// Mimics <form id="module"><input name="exports"></form>: `exports` is truthy and refuses assignment
const clobberedModule = Object.defineProperty({}, 'exports', {
  get: () => ({ tagName: 'INPUT' }),
  set: () => { throw new TypeError("Failed to set a named property 'exports' on 'HTMLFormElement'"); }
});
const exportCases = [
  { input: 'plain browser', expected: true, desc: 'Sets globalThis.Base64Decoder', globals: {} },
  { input: '<form id="module"><input name="exports">', expected: true, desc: 'Page element named "module" does not break the global', globals: { module: clobberedModule } },
  { input: '<div id="module">', expected: true, desc: 'Element without exports does not break the global', globals: { module: { tagName: 'DIV' } } },
];
for (const tc of exportCases) {
  let result;
  try {
    result = runDecoderInBrowserLikeContext(tc.globals);
  } catch (e) {
    result = `threw: ${e.message}`;
  }
  check(exportStats, 'browser-export', tc, result);
}
check(exportStats, 'node-export', { input: "require('../shared/decoder.js')", expected: 'function', desc: 'Node still gets the CommonJS export' }, typeof tryDecodeBase64);

console.log(`\nBrowser Global Export Results: ${exportStats.passed} passed, ${exportStats.failed} failed.`);

// -------------------------------------------------------------
// Test Page Standalone Loader
// -------------------------------------------------------------
// test_page.html loads the content scripts itself (with a mocked `chrome`); it must load the same
// files in the same order as manifest.json, or content.js fails on a missing globalThis.Base64Decoder
console.log("\nRunning Test Page Loader Tests...");

const pageStats = { passed: 0, failed: 0 };
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'manifest.json'), 'utf8'));
const manifestScripts = manifest.content_scripts.flatMap((cs) => cs.js || []).map((f) => `../${f}`);
const testPage = fs.readFileSync(path.join(__dirname, 'test_page.html'), 'utf8');
const loaderMatch = testPage.match(/for \(const src of (\[[^\]]*\])\)/);
const pageScripts = loaderMatch ? JSON.parse(loaderMatch[1].replace(/'/g, '"')) : null;
check(pageStats, 'test-page', { input: 'test/test_page.html', expected: manifestScripts, desc: 'Standalone loader matches manifest content_scripts' }, pageScripts);

console.log(`\nTest Page Loader Results: ${pageStats.passed} passed, ${pageStats.failed} failed.`);

const allStats = [base64Stats, displayStats, rangeStats, exportStats, pageStats];
if (jwtFailed > 0 || allStats.some((stats) => stats.failed > 0)) process.exit(1);

