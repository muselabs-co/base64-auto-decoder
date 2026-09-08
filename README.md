# Base64 Auto Decoder (Chrome Extension)

一款轻量、纯原生（无框架、零构建依赖）、高精度的网页 Base64 自动解码 Chrome 浏览器插件（Manifest V3）。

## ✨ 核心特性

- **自动扫描 & 原地替换**：页面加载或动态加载（SPA）时自动识别 Base64 并替换为可读明文。
- **高精度防误判**：
  - 支持中文 UTF-8 解码（`TextDecoder` 严格校验）。
  - 智能过滤纯英文单词、UUID、Git Commit SHA1/256 哈希值等，杜绝页面乱码与误伤。
- **一键复制小图标**：解码明文旁边附带轻巧的复制图标 📋，点击后一秒复制并弹出成功反馈。
- **原始 Base64 溯源**：鼠标悬停在解码文本上即可查看原串内容。
- **极简弹窗开关（方案 B）**：点击插件图标展示极简 ON/OFF 卡片开关，切换时即时同步至打开的网页，关闭时原地恢复原串。
- **内置 i18n 国际化**：原生支持中文（简体 `zh_CN`）和英文（`en`）。

## 📂 项目结构

```
base64-decoder/
├── manifest.json            # Manifest V3 扩展配置文件
├── _locales/                # 原生国际化多语言包
│   ├── en/messages.json     # 英文文案
│   └── zh_CN/messages.json  # 中文文案
├── popup/                   # 插件弹窗控制面板 (原生 HTML/CSS/JS)
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── content/                 # 页面内容注入脚本与样式
│   ├── content.js           # 核心扫描、解码校验、DOM 替换与复制交互
│   └── content.css          # 原地替换与复制图标样式
├── icons/                   # 插件高品质图标 (16x16, 48x48, 128x128)
│   └── generate_icons.py
└── test/                    # 测试用例与独立验证
    ├── test_page.html       # 包含正向/反向用例与动态追加的测试网页
    └── verify_decoder.js    # Node.js 解码准确度与防误判单元测试
```

## 🚀 安装与使用指南

1. 打开 Chrome 浏览器，在地址栏输入 `chrome://extensions/` 回车。
2. 打开右上角的 **“开发者模式” (Developer mode)** 开关。
3. 点击左上角 **“加载已解压的扩展程序” (Load unpacked)**。
4. 选择本项目所在目录：
   `/Users/cheng/Work/my-test-app/chrome-extensions/base64-decoder`
5. 插件安装完成！你可以在浏览器扩展栏看到该插件图标。

## 🧪 测试验证

- **方式 1（浏览器真实测试）**：
  安装插件后，在 Chrome 中直接打开 `test/test_page.html`，即可看到各类 Base64 文本被原地解码并附带复制小图标。
- **方式 2（命令行单元测试）**：
  在项目根目录下运行：
  ```bash
  node test/verify_decoder.js
  ```
