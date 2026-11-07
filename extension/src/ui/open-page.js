// Open one of the extension's own pages in a tab, or focus it if it's already open.
// (Used instead of chrome.runtime.openOptionsPage, which didn't open from the panel iframe.)
export async function openPage(path) {
  const url = chrome.runtime.getURL(path);
  const [open] = await chrome.tabs.query({ url: `${url}*` }).catch(() => []);
  if (open?.id) {
    await chrome.tabs.update(open.id, { active: true });
    if (open.windowId != null) await chrome.windows.update(open.windowId, { focused: true }).catch(() => {});
  } else {
    await chrome.tabs.create({ url });
  }
}
