// Service worker — intentionally thin. Chrome shuts idle service workers down, so
// the agent loop does NOT run here; it runs in the panel page (iframe in the tab).

import { VERSION } from './runtime/index.js';

chrome.runtime.onInstalled.addListener(() => {
  console.log(`[fine-print] installed · runtime ${VERSION}`);
});

// Toolbar icon toggles the on-page slide-out. On pages without the content script
// (anything but REA/Domain), activeTab lets us inject it for this tab on click.
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'fineprint:toggle' });
  } catch {
    // path must match manifest.content_scripts.js — the build puts it at content/inject.js
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/inject.js'] });
    await chrome.tabs.sendMessage(tab.id, { type: 'fineprint:toggle' }).catch(() => {});
  }
});

// The panel iframe asks which tab it lives in (sender.tab is set for frames in a tab).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'fineprint:whoami') reply(sender.tab ?? null);
});
