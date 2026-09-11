// Background Service Worker for Base64 Auto Decoder

chrome.runtime.onInstalled.addListener(() => {
  // Setup Context Menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'encode-selection',
      title: chrome.i18n.getMessage('menuEncodeSelection') || '转换为 Base64 (Encode)',
      contexts: ['selection']
    });

    chrome.contextMenus.create({
      id: 'decode-selection',
      title: chrome.i18n.getMessage('menuDecodeSelection') || 'Base64 解码 (Decode)',
      contexts: ['selection']
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'encode-selection' || info.menuItemId === 'decode-selection') {
    chrome.tabs.sendMessage(tab.id, {
      action: info.menuItemId,
      selectionText: info.selectionText || ''
    }).catch((err) => {
      console.warn('Could not send message to tab:', err);
    });
  }
});
