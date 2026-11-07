import { useCallback, useEffect, useRef, useState } from 'react';
import { readTab } from '../../agent/page-context.js';
import { addressFromPage } from '../../agent/address.js';

// A listing only when the tab URL is a property page on realestate.com.au or domain.com.au.
const LISTING_URL = /realestate\.com\.au\/property-|domain\.com\.au\/[^/?#]+-\d{7,}\/?(?:[?#]|$)/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The tab this panel lives in — the background reads it off the message sender. */
async function currentTab() {
  const tab = await chrome.runtime.sendMessage({ type: 'fineprint:whoami' }).catch(() => null);
  if (tab) return tab;
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  return active;
}

/**
 * Detect the listing and resolve its thread (one per listing URL, remembered in
 * chrome.storage.local `threads`). Re-detects when the host page navigates
 * client-side (REA/Domain are SPAs — content/inject.js posts `fineprint:navigated`);
 * retries briefly while the new heading renders; the newest navigation wins.
 */
export function useListing() {
  // pending: the host page navigated and the new listing isn't read yet — show a loading
  // state instead of the previous listing's details
  const [state, setState] = useState({ ready: false, listing: null, threadId: null, pending: true });
  const listingRef = useRef(null);
  const runRef = useRef(0);

  const detect = useCallback(async ({ settleMs = 0 } = {}) => {
    const my = ++runRef.current;
    setState((s) => (s.pending ? s : { ...s, pending: true }));
    if (settleMs) await sleep(settleMs);
    if (my !== runRef.current) return;
    const tab = await currentTab();
    const isListing = tab?.url && LISTING_URL.test(tab.url);
    let listing = isListing ? { url: tab.url, title: tab.title, page: await readTab(tab.id) } : null;
    for (let i = 0; listing && !addressFromPage(listing.page) && i < 6; i++) {
      await sleep(500);
      if (my !== runRef.current) return;
      listing = { ...listing, page: await readTab(tab.id) };
    }
    if (my !== runRef.current) return;
    const { threads = {} } = await chrome.storage.local.get('threads');
    const key = listing?.url ?? 'scratch';
    const threadId = threads[key] ?? `${key}#${Date.now()}`;
    threads[key] = threadId;
    await chrome.storage.local.set({ threads });
    if (my !== runRef.current) return;
    listingRef.current = listing;
    setState({ ready: true, listing, threadId, pending: false });
  }, []);

  useEffect(() => {
    detect();
    const onMessage = (e) => {
      if (e.source === window.parent && e.data?.type === 'fineprint:navigated') detect({ settleMs: 900 });
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [detect]);

  /** Start a fresh thread for the current listing (or the scratchpad). */
  const newThread = useCallback(async () => {
    const { threads = {} } = await chrome.storage.local.get('threads');
    const key = listingRef.current?.url ?? 'scratch';
    const threadId = `${key}#${Date.now()}`;
    threads[key] = threadId;
    await chrome.storage.local.set({ threads });
    setState((s) => ({ ...s, threadId }));
  }, []);

  return { ...state, newThread };
}
