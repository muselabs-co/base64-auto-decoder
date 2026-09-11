# Base64 Auto Decoder (Chrome Extension)

[English](README.md) | [简体中文](README_CN.md)

A lightweight, zero-dependency, pure vanilla, and high-precision Chrome Extension (Manifest V3) for automated webpage Base64 decoding, JWT inspection, image preview, site blacklist, and quick snippet management.

## ✨ Key Features

- **Automated Scanning & In-place Replacement**: Automatically scans and replaces Base64 strings with human-readable text on initial load and dynamic SPA content.
- **High-Precision Filtering (Anti-False-Positive)**:
  - Supports UTF-8 multi-byte decoding with strict `TextDecoder` validation.
  - Intelligently filters out standard English words, UUIDs, Git Commit hashes (SHA-1/256), preventing page layout corruption or accidental replacements.
- **One-Click Copy**: Decoded text includes a lightweight copy icon 📋 with immediate visual feedback.
- **Original Source Tracing**: Hover over any decoded text to preview the original raw Base64 string in a tooltip, with one-click copy.
- **Anti-Flicker Hover Bridge & Viewport Auto-Alignment (New in v1.2.0)**:
  - Built-in invisible hover bridge (`::before`) and 250ms transition delay prevents floating cards from vanishing prematurely when moving the cursor.
  - Smart viewport boundary collision detection automatically repositions tooltips (top/bottom/left/right) to keep buttons always accessible.
- **Right-Click Context Menu (New in v1.2.0)**:
  - Select any text and right-click -> **"Encode to Base64"** or **"Decode Base64"**.
  - In editable fields (`input`, `textarea`, `contenteditable`), replaces selection **in-place** instantly—perfect for forum posting!
  - In regular page text, copies result to clipboard with a clean floating Toast notification.
- **Current Site Toggle & Domain Normalization (New in v1.2.0)**:
  - Dedicated site toggle in popup automatically detects the active website (e.g. `v2ex.com`) and allows enabling/disabling auto-decoding per site with a single click.
  - Intelligent domain normalization seamlessly bridges `v2ex.com` and `www.v2ex.com`.
- **Website Blacklist Management (New in v1.2.0)**:
  - Collapsible blacklist manager in popup with real-time site counter badge.
  - Add custom domains to the blacklist, or remove them with one click.
  - Bi-directional sync with the Current Site switch and across open tabs.
- **Side-by-Side Compact Controls Layout (New in v1.2.0)**:
  - Re-engineered top control area with dual-column side-by-side cards ("Auto Decode" + "Current Site") and ultra-compact 34×18 switches, reducing header height by 45%.
- **Popup Dual-Language Switcher (New in v1.2.0)**:
  - Built-in `[ EN / 中 ]` header switcher. Defaults to English (`en`) and instantly translates all popup UI elements without reloading.
- **JWT (JSON Web Token) Smart Parser (New in v1.2.0)**:
  - Automatically identifies 3-part JWT tokens in webpages, marked with an exclusive purple `[JWT]` badge.
  - Hover reveals a structured JSON card displaying formatted Header and Payload with one-click "Copy Payload".
  - Popup Smart Decoder also detects and pretty-prints pasted JWT tokens.
- **Base64 Image Hover Preview (New in v1.2.0)**:
  - Recognizes `data:image/...` and raw image Base64 strings (PNG, JPEG, GIF, WEBP), displaying a green `[IMG]` badge.
  - Hover reveals an interactive preview popover with image thumbnail, dimensions, and quick "Download" & "Copy URL" buttons.
- **Quick Base64 Snippets Manager**:
  - Manage commonly used contacts/phrases (Email, URL, plain text) with custom tags directly in the popup.
  - Automatically encodes text into standard UTF-8 Base64 and persists data (`chrome.storage.sync` for seamless multi-device sync).
  - Clean two-row card layout: Row 1 displays tag badge and plain text; Row 2 displays monospace Base64 code with a one-click copy button.
- **Smart Auto-Detect & Instant Decoder**:
  - Intelligently senses Base64 input as you type or paste into the input field.
  - Instantly reveals a preview card (💡 **Decoded**) with "Copy Text" and "Use Plain" actions—perfect for decoding Base64 copied from WeChat, Slack, terminal, emails, or PDFs.
- **Zero Dependencies & Pure Native**: Built strictly with standard HTML/CSS/JavaScript without bulky frameworks or build tooling.

## 📂 Project Structure

```
base64-decoder/
├── manifest.json            # Manifest V3 extension configuration
├── background/              # Background service worker (Manifest V3)
│   └── background.js        # Context menus & tab message dispatcher
├── _locales/                # Native internationalization locale bundles
│   ├── en/messages.json     # English messages (42 keys)
│   └── zh_CN/messages.json  # Simplified Chinese messages (42 keys)
├── popup/                   # Popup control panel (Vanilla HTML/CSS/JS)
│   ├── popup.html           # Popup DOM (Compact Switch + Blacklist + Snippet Manager)
│   ├── popup.css            # Styles with Dark Mode & compact layout
│   └── popup.js             # Dual-language switcher, Blacklist CRUD, sync storage
├── content/                 # Content scripts injected into web pages
│   ├── content.js           # Core scanner, JWT/Image parser, hover bridge, DOM replacement
│   └── content.css          # In-place decoded text, hover popovers & toast styles
├── icons/                   # High-res icons (16x16, 48x48, 128x128)
│   └── generate_icons.py
└── test/                    # Test cases and verification scripts
    ├── test_page.html       # Bilingual test page (Standard, JWT, Image, Inputs, SPA mutations)
    └── verify_decoder.js    # Node.js unit tests for decoding accuracy and heuristics
```

## 🚀 Installation & Usage

### Method 1: Download from GitHub Releases (Recommended)
1. Download `base64-decoder-v1.2.0.zip` from the [Releases](https://github.com/muselabs-co/base64-auto-decoder/releases) page.
2. Extract the zip archive to a local folder.
3. Open Google Chrome and navigate to `chrome://extensions/`.
4. Enable **Developer mode** in the top-right corner.
5. Click **Load unpacked** in the top-left corner and select the extracted folder.
6. Done! Click the extension icon in your toolbar to start using it.

### Method 2: Install from Source
1. Clone this repository:
   ```bash
   git clone git@github.com:muselabs-co/base64-auto-decoder.git
   ```
2. Open Chrome, go to `chrome://extensions/`, and enable "Developer mode".
3. Click "Load unpacked" and select the repository directory.

## 🧪 Testing

- **In-Browser Test**:
  Open `test/test_page.html` in Chrome after installing the extension to inspect automatic in-place decoding, JWT formatting, image hover preview, and context menus. Use the top-right `[ 🇨🇳 中文 | 🇬🇧 English ]` button to toggle test page language.
- **Command-Line Unit Test**:
  Run unit test in the project root:
  ```bash
  node test/verify_decoder.js
  ```
