// Content script: the Fine Print slide-out — the extension's ONLY surface.
//
// A fixed panel on the right; while it's open the page is SQUISHED, not covered:
//   1. html gets margin-right = panel width + gutter, so normal-flow and sticky
//      content reflows into the remaining width (verified on realestate.com.au and
//      domain.com.au listing pages, 2026-11-06 — no horizontal scroll)
//   2. position:fixed elements reaching into the panel's area are positioned
//      against the window, not <html>, so they're shifted left individually
//      (REA's floating "Ask AI" button; Domain's edge-to-edge sticky header that
//      slides in on scroll). Re-scanned on DOM changes and scroll; restored on close.
//
// Auto-opens on listing pages; the toolbar icon toggles it anywhere. The panel is
// an iframe of the extension's own page in a closed shadow root, so the page can
// neither read nor restyle it. Plain script (content scripts can't be ES modules).

(() => {
  if (window.top !== window) return;
  if (window.__finePrint) return; // already injected (manifest + toolbar re-inject)

  const PANEL_W = 420;
  const GUTTER = 16;
  const SQUISH = PANEL_W + GUTTER * 2; // 452px reserved on the right
  const PANEL_URL = chrome.runtime.getURL('panel.html'); // built by Vite into dist/
  const EXT_ORIGIN = new URL(PANEL_URL).origin;
  // the CURRENT listing's key — REA/Domain change listings client-side without reloading this
  // script, so it must be read each time (a key fixed at load made every listing look shortlisted)
  const listingKey = () => (location.origin + location.pathname).replace(/\/$/, '');

  const isListing = () =>
    (location.hostname.endsWith('realestate.com.au') && location.pathname.startsWith('/property-')) ||
    (location.hostname.endsWith('domain.com.au') && /-\d{7,}\/?$/.test(location.pathname));

  // ---------------------------------------------------------------- squish
  const squishStyle = document.createElement('style');
  squishStyle.textContent = `html { margin-right: ${SQUISH}px !important; transition: margin-right .25s ease; }`;

  const shifted = new Set();
  function shiftFixed() {
    const limit = window.innerWidth - SQUISH;
    for (const el of document.querySelectorAll('body *')) {
      if (shifted.has(el) || el === host) continue;
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= limit) continue;
      el.dataset.fpRight = el.style.getPropertyValue('right');
      el.dataset.fpMaxWidth = el.style.getPropertyValue('max-width');
      if (cs.right !== 'auto') el.style.setProperty('right', `calc(${cs.right} + ${SQUISH}px)`, 'important');
      else el.style.setProperty('max-width', `${Math.max(0, Math.round(limit - r.left))}px`, 'important');
      shifted.add(el);
    }
  }
  function unshiftFixed() {
    for (const el of shifted) {
      el.style.removeProperty('right');
      el.style.removeProperty('max-width');
      if (el.dataset.fpRight) el.style.setProperty('right', el.dataset.fpRight);
      if (el.dataset.fpMaxWidth) el.style.setProperty('max-width', el.dataset.fpMaxWidth);
      delete el.dataset.fpRight;
      delete el.dataset.fpMaxWidth;
    }
    shifted.clear();
  }

  let rescanTimer = null;
  const rescanSoon = () => {
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      if (isOpen) shiftFixed();
    }, 200);
  };
  const observer = new MutationObserver(rescanSoon);

  // ---------------------------------------------------------------- panel
  const host = document.createElement('div');
  host.id = 'fine-print-root';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap { position: fixed; top: ${GUTTER}px; right: ${GUTTER}px; bottom: ${GUTTER}px; width: ${PANEL_W}px; z-index: 2147483646;
              display: flex; flex-direction: column; gap: 8px; font-family: Geist, -apple-system, system-ui, sans-serif;
              transition: transform .38s cubic-bezier(.2,.8,.2,1), opacity .25s ease; }
      .wrap.closed { transform: translateX(${PANEL_W + GUTTER}px); opacity: 0; pointer-events: none; transition-duration: .26s, .2s; }
      iframe { flex: 1; width: 100%; border: 1px solid #e2ddd2; border-radius: 22px; background: #fbfaf6;
               box-shadow: 0 24px 60px rgba(60,48,28,.16), 0 1px 2px rgba(60,48,28,.08); }
      .shortlist { height: 46px; flex-shrink: 0; border: none; border-radius: 14px; background: #2f64d9; color: #fff;
                   font: 600 14px Geist, -apple-system, system-ui, sans-serif; cursor: pointer;
                   box-shadow: 0 10px 24px rgba(47,100,217,.28), inset 0 1px 0 rgba(255,255,255,.18);
                   display: flex; align-items: center; justify-content: center; gap: 10px;
                   transition: background .2s ease, box-shadow .2s ease, transform .12s ease, opacity .3s ease .12s, translate .38s cubic-bezier(.2,.8,.2,1) .08s; }
      .wrap.closed .shortlist { opacity: 0; translate: 0 10px; }
      .shortlist:hover { background: #2a5bc8; }
      .shortlist:active { transform: scale(.985); }
      .shortlist .k { display: inline-grid; place-items: center; height: 20px; padding: 0 6px; border-radius: 5px; background: rgba(255,255,255,.18);
                      font: 400 10px 'Geist Mono', ui-monospace, monospace; }
      .shortlist svg path { transition: fill .2s ease; }
      .shortlist.done { background: #1e1d1b; box-shadow: 0 10px 24px rgba(30,29,27,.18); }
      .shortlist.done svg path { fill: #fff; }
      .shortlist.pop { animation: fp-pop .35s cubic-bezier(.2,.8,.2,1); }
      @keyframes fp-pop { 40% { transform: scale(1.02); } }
      /* collapsed state: a compact pill bottom-right, stacked ABOVE the portals' own corner
         buttons (REA's "Ask AI", Domain's reCAPTCHA badge — both within ~75 px of the bottom)
         and below their sticky sidebars. Same spot on REA + Domain, listing + search pages.
         Expands on hover (or briefly when it appears) to show the headline numbers. */
      .pill { position: fixed; right: 20px; bottom: 96px; z-index: 2147483646; display: none; align-items: center; gap: 0;
              height: 40px; padding: 0; border-radius: 12px; border: none; background: #1e1d1b; color: #fbfaf6;
              font: 500 12.5px/16px Geist, -apple-system, system-ui, sans-serif; cursor: pointer;
              box-shadow: 0 10px 28px rgba(30,29,27,.28), 0 1px 2px rgba(30,29,27,.2);
              transition: box-shadow .2s ease, transform .15s ease; animation: fp-pill-in .35s cubic-bezier(.22,.8,.24,1) backwards; }
      .pill:hover { transform: translateY(-1px); box-shadow: 0 14px 34px rgba(30,29,27,.32), 0 1px 2px rgba(30,29,27,.2); }
      .pill.show { display: flex; }
      /* the collapsed state IS the logo: a dark rounded square with the mark */
      .pill .mark { width: 40px; height: 40px; border-radius: 12px; background: transparent; flex-shrink: 0; }
      .pill .mark svg { width: 15px; height: 15px; }
      .pill .txt { display: flex; flex-direction: column; max-width: 0; overflow: hidden; white-space: nowrap; opacity: 0;
                   transition: max-width .32s cubic-bezier(.22,.8,.24,1), opacity .2s ease, padding .32s cubic-bezier(.22,.8,.24,1); }
      .pill:hover .txt, .pill:focus-visible .txt, .pill.peek .txt { max-width: 240px; opacity: 1; padding-right: 14px; }
      .pill .name { font-weight: 600; color: #fbfaf6; }
      .pill .sum { color: #b9b3a6; font-size: 11.5px; }
      .pill .sum b { color: #fff; font-weight: 600; }
      .pill .sum b.warn { color: #f2c45a; }
      @keyframes fp-pill-in { from { opacity: 0; transform: translateY(8px); } }
      .mark { display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 6px; background: #1e1d1b; }
      @media (prefers-reduced-motion: reduce) { .wrap, .shortlist, .pill { transition-duration: 1ms !important; animation: none !important; } }
    </style>
    <div class="wrap closed">
      <iframe title="Fine Print" allow="clipboard-write"></iframe>
      <button class="shortlist" title="Shortlist this property (S)"><svg width="14" height="14" viewBox="0 0 13 13" fill="none"><path d="M3 1.5h7v10l-3.5-2.5L3 11.5z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><span class="label">Shortlist this property</span><span class="k">S</span></button>
    </div>
    <button class="pill" title="Open Fine Print (F)" aria-label="Open Fine Print (F)"><span class="mark"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 9.5V2.5h8M2 6h5" fill="none" stroke="#FBFAF6" stroke-width="1.6" stroke-linecap="round"/></svg></span><span class="txt"><span class="name">Fine Print</span><span class="sum">Press F to read this listing</span></span></button>`;
  document.documentElement.append(host);

  const wrap = shadow.querySelector('.wrap');
  const frame = shadow.querySelector('iframe');
  const pill = shadow.querySelector('.pill');
  const shortlistBtn = shadow.querySelector('.shortlist');
  const label = shortlistBtn.querySelector('.label');
  let isOpen = false;

  function open() {
    if (isOpen) return;
    isOpen = true;
    if (!frame.src) frame.src = PANEL_URL; // lazy: no agent page until first open
    document.head.append(squishStyle);
    shiftFixed();
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
    window.addEventListener('scroll', rescanSoon, { passive: true });
    window.addEventListener('resize', rescanSoon);
    wrap.classList.remove('closed');
    pill.classList.remove('show');
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    observer.disconnect();
    window.removeEventListener('scroll', rescanSoon);
    window.removeEventListener('resize', rescanSoon);
    squishStyle.remove();
    unshiftFixed();
    wrap.classList.add('closed');
    pill.classList.add('show');
    peek();
  }

  pill.addEventListener('click', open);
  const pillSum = pill.querySelector('.sum');
  let peekTimer = null;
  // the panel posts the listing's headline numbers once its read lands — shown on the tab
  window.addEventListener('message', (e) => {
    if (e.origin !== EXT_ORIGIN || e.data?.type !== 'fineprint:summary') return;
    const { price, priceLabel, yieldPct, over } = e.data;
    pillSum.replaceChildren();
    if (price) {
      const b = document.createElement('b');
      if (over) b.className = 'warn';
      b.textContent = price;
      pillSum.append(b, ` ${priceLabel ?? ''}`);
    }
    if (yieldPct) {
      const y = document.createElement('b');
      y.textContent = yieldPct;
      pillSum.append(price ? ' · ' : '', y, ' yield');
    }
    if (!price && !yieldPct) pillSum.textContent = 'Press F to read this listing';
  });
  // a quick peek when the tab appears, so people learn what it is
  const peek = () => {
    pill.classList.add('peek');
    clearTimeout(peekTimer);
    peekTimer = setTimeout(() => pill.classList.remove('peek'), 2600);
  };
  // the panel's ✕ asks to close; only trust our own extension origin
  window.addEventListener('message', (e) => {
    if (e.origin === EXT_ORIGIN && e.data?.type === 'fineprint:close') close();
  });
  // toolbar icon
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg?.type !== 'fineprint:toggle') return;
    isOpen ? close() : open();
    reply({ open: isOpen });
  });

  // ---------------------------------------------------------------- shortlist
  const paint = (on) => {
    shortlistBtn.classList.toggle('done', on);
    label.textContent = on ? 'Shortlisted' : 'Shortlist this property';
  };
  const repaint = () => chrome.storage.local.get('shortlist').then(({ shortlist = {} }) => paint(Boolean(shortlist[listingKey()])));
  repaint();
  // stays right when the shortlist changes elsewhere (dashboard removals, another tab)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.shortlist) repaint();
  });
  shortlistBtn.addEventListener('click', async () => {
    const key = listingKey();
    const { shortlist = {} } = await chrome.storage.local.get('shortlist');
    if (shortlist[key]) delete shortlist[key];
    else shortlist[key] = { url: key, title: document.title, heading: document.querySelector('h1')?.innerText ?? null, added_at: Date.now() };
    await chrome.storage.local.set({ shortlist });
    paint(Boolean(shortlist[key]));
    shortlistBtn.classList.remove('pop');
    void shortlistBtn.offsetWidth; // restart the press animation
    shortlistBtn.classList.add('pop');
  });
  // "S" shortlists (the key hint on the button) — only while open, never while typing on the page
  // "F" — for Fine Print — opens / closes the panel from anywhere on the page (never while
  // typing, never with modifier keys)
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'f' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? '')) return;
    e.preventDefault();
    isOpen ? close() : open();
  });
  window.addEventListener('keydown', (e) => {
    if (!isOpen || e.key.toLowerCase() !== 's' || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
    const t = e.target;
    if (t?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t?.tagName ?? '')) return;
    shortlistBtn.click();
  });

  window.__finePrint = { open, close };
  // Auto-open on listings: the read is there before the investor asks.
  if (isListing()) setTimeout(open, 400);
  else {
    pill.classList.add('show');
    peek();
  }

  // REA (search + listing are one app) and Domain (Next.js) navigate client-side:
  // clicking a result changes the URL WITHOUT a page load, so this script never
  // re-runs. Watch the URL; on a listing open + tell the panel to re-read, else close.
  let lastUrl = location.href;
  setInterval(() => {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    repaint(); // the shortlist button reflects the listing now on screen
    if (isListing()) {
      open();
      frame.contentWindow?.postMessage({ type: 'fineprint:navigated', url: location.href }, EXT_ORIGIN);
    } else {
      close();
    }
  }, 400);
})();
