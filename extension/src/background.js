// Service worker — intentionally thin. Chrome shuts idle service workers down, so
// the agent loop does NOT run here; it runs in the panel page (iframe in the tab).

import { VERSION } from './runtime/index.js';

chrome.runtime.onInstalled.addListener(() => {
  console.log(`[fine-print] installed · runtime ${VERSION}`);
});

// Toolbar icon opens the shortlist spreadsheet (focuses it if it's already open).
// On listings the panel opens with F or the corner button.
const SHORTLIST_URL = chrome.runtime.getURL('src/ui/shortlist.html');
chrome.action.onClicked.addListener(async () => {
  const [open] = await chrome.tabs.query({ url: `${SHORTLIST_URL}*` }).catch(() => []);
  if (open?.id) {
    await chrome.tabs.update(open.id, { active: true });
    if (open.windowId != null) await chrome.windows.update(open.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: SHORTLIST_URL });
  }
});

// The panel iframe asks which tab it lives in (sender.tab is set for frames in a tab).
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'fineprint:whoami') reply(sender.tab ?? null);
});
