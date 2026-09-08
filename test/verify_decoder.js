// Standalone decoder verification script

function isValidBase64Candidate(token) {
  if (!token) return false;
  
  // Must only contain base64 chars
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(token)) return false;

  const hasPadding = token.endsWith('=');
  
  if (hasPadding) {
    // Padded Base64
    if (token.length < 4 || token.length % 4 !== 0) return false;
  } else {
    // Unpadded Base64
    if (token.length < 8) return false;
    if (token.length % 4 === 1) return false; // Base64 can never be 1 mod 4
    
    // Discard pure lowercase (ordinary words like 'internationalization')
    if (/^[a-z]+$/.test(token)) return false;
    // Discard pure uppercase
    if (/^[A-Z]+$/.test(token)) return false;
    // Discard pure numbers
    if (/^[0-9]+$/.test(token)) return false;
    // Discard pure hex hashes (like git sha1 40 chars, sha256 64 chars, md5 32 chars)
    if (/^[0-9a-f]{16,}$/i.test(token)) return false;
  }

  return true;
}

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

  // Convert to Uint8Array
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

function isReadableText(text, original) {
  if (!text || text.trim().length === 0) return false;
  if (text.trim() === original.trim()) return false;

  // Reject strict control characters (0x00 - 0x08, 0x0B, 0x0C, 0x0E - 0x1F, 0x7F)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) {
    return false;
  }

  // Check character validity
  // Allow ASCII printable, common punctuation, Chinese/Japanese/Korean, Cyrillic, Emojis
  const allowedRegex = /^[\s\x20-\x7E\u00A0-\u024F\u0400-\u04FF\u2000-\u206F\u20A0-\u20CF\u3000-\u303F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF\u{1F300}-\u{1FAFF}]+$/u;
  if (!allowedRegex.test(text)) {
    return false;
  }

  return true;
}

// Test cases
const testCases = [
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
  { input: "INTERNATIONALIZATION", expected: null, desc: "Pure uppercase English word" },
  { input: "1234567890", expected: null, desc: "Pure numbers" },
  { input: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", expected: null, desc: "SHA-256 hex hash" },
  { input: "7b502c3a1f489b0d23e6", expected: null, desc: "Hex commit ID / token" },
  { input: "abc", expected: null, desc: "Too short" },
];

console.log("Running Decoder Tests...\n");
let passed = 0;
let failed = 0;

for (const tc of testCases) {
  const result = tryDecodeBase64(tc.input);
  const isMatch = result === tc.expected;
  if (isMatch) {
    passed++;
    console.log(`✅ PASS: [${tc.desc}] Input: "${tc.input}" => ${JSON.stringify(result)}`);
  } else {
    failed++;
    console.error(`❌ FAIL: [${tc.desc}] Input: "${tc.input}"`);
    console.error(`   Expected: ${JSON.stringify(tc.expected)}`);
    console.error(`   Got:      ${JSON.stringify(result)}`);
  }
}

console.log(`\nResults: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
