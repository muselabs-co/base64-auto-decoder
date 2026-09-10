# Base64 Auto Decoder (Chrome Extension)

[English](README.md) | [简体中文](README_CN.md)

A lightweight, zero-dependency, pure vanilla, and high-precision Chrome Extension (Manifest V3) for automated webpage Base64 decoding and quick snippet management.

## ✨ Key Features

- **Automated Scanning & In-place Replacement**: Automatically scans and replaces Base64 strings with human-readable text on initial load and dynamic SPA content.
- **High-Precision Filtering (Anti-False-Positive)**:
  - Supports UTF-8 multi-byte decoding with strict `TextDecoder` validation.
  - Intelligently filters out standard English words, UUIDs, Git Commit hashes (SHA-1/256), preventing page layout corruption or accidental replacements.
- **One-Click Copy**: Decoded text includes a lightweight copy icon 📋 with immediate visual feedback.
- **Original Source Tracing**: Hover over any decoded text to preview the original raw Base64 string in a tooltip.
- **Quick Base64 Snippets Manager (New in v1.1.0)**:
  - Manage commonly used contacts/phrases (Email, URL, plain text) with custom tags directly in the popup.
  - Automatically encodes text into standard UTF-8 Base64 and persists data (`chrome.storage.sync` for seamless multi-device sync).
  - Clean two-row card layout: Row 1 displays tag badge and plain text; Row 2 displays monospace Base64 code with a one-click copy button.
- **Smart Auto-Detect & Instant Decoder (New in v1.1.0)**:
  - Intelligently senses Base64 input as you type or paste into the input field.
  - Instantly reveals a preview card (💡 **Decoded**) with "Copy Text" and "Use Plain" actions—perfect for decoding Base64 copied from WeChat, Slack, terminal, emails, or PDFs.
- **Minimalist Popup Master Switch**: Easily toggle auto-decoding ON/OFF; changes sync across all open tabs immediately, reverting in-place when toggled off.
- **Zero Dependencies & Pure Native**: Built strictly with standard HTML/CSS/JavaScript without bulky frameworks or build tooling.
- **Native Internationalization (i18n)**: Out-of-the-box support for English (`en`) and Simplified Chinese (`zh_CN`).

## 📂 Project Structure

```
base64-decoder/
├── manifest.json            # Manifest V3 extension configuration
├── _locales/                # Native internationalization locale bundles
│   ├── en/messages.json     # English messages
│   └── zh_CN/messages.json  # Simplified Chinese messages
├── popup/                   # Popup control panel (Vanilla HTML/CSS/JS)
│   ├── popup.html           # Popup DOM (Switch + Smart Decode + Snippet Manager)
│   ├── popup.css            # Styles with Dark Mode support
│   └── popup.js             # Snippet CRUD, smart auto-detection, and sync storage
├── content/                 # Content scripts injected into web pages
│   ├── content.js           # Core scanner, decoding heuristics, DOM replacement & copy
│   └── content.css          # In-place decoded text and copy badge styles
├── icons/                   # High-res icons (16x16, 48x48, 128x128)
│   └── generate_icons.py
└── test/                    # Test cases and verification scripts
    ├── test_page.html       # Positive and negative test cases with dynamic injection
    └── verify_decoder.js    # Node.js unit tests for decoding accuracy and heuristics
```

## 🚀 Installation & Usage

### Method 1: Download from GitHub Releases (Recommended)
1. Download `base64-decoder-v1.1.0.zip` from the [Releases](https://github.com/muselabs-co/base64-auto-decoder/releases) page.
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
  Open `test/test_page.html` in Chrome after installing the extension to inspect automatic in-place decoding and copy interaction.
- **Command-Line Unit Test**:
  Run unit test in the project root:
  ```bash
  node test/verify_decoder.js
  ```
