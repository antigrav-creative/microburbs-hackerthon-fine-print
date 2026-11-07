// Tooltips: hover (or keyboard-focus) anything with data-tip to see what that data
// point is and how it's worked out.
//
// ONE shared box that physically glides from point to point (transform transition),
// resizes smoothly, and swaps its text with a slide: the old text slides out and the
// new slides in — upwards when moving down the page, downwards when moving up.
// Every tip has a heading (data-tip-title). Plain text only (textContent, never HTML).

/** Attach a tip to an element. */
export function tip(el, text, title = null) {
  if (!el || !text) return el;
  el.dataset.tip = text;
  if (title) el.dataset.tipTitle = title;
  if (el instanceof HTMLElement && !el.hasAttribute('tabindex') && !/^(BUTTON|A|INPUT)$/.test(el.tagName)) el.tabIndex = 0;
  return el;
}

const GAP = 8; // space between tip and target
const PAD = 8; // keep inside the viewport
const HIDE_AFTER = 140; // ms — lets the box glide to a neighbour instead of blinking out

let box = null;
let inner = null;
let current = null;
let visible = false;
let hideTimer = null;
let lastY = null;

function ensureBox() {
  if (box) return;
  box = document.createElement('div');
  box.className = 'fp-tip';
  box.setAttribute('role', 'tooltip');
  inner = document.createElement('div');
  inner.className = 'fp-tip-inner';
  box.append(inner);
  document.body.append(box);
}

function content(target) {
  const c = document.createElement('div');
  c.className = 'fp-tip-content';
  const t = document.createElement('div');
  t.className = 'fp-tip-title';
  t.textContent = target.dataset.tipTitle || 'About this';
  const b = document.createElement('div');
  b.className = 'fp-tip-body';
  b.textContent = target.dataset.tip;
  c.append(t, b);
  return c;
}

function place(target, height) {
  const r = target.getBoundingClientRect();
  const w = box.offsetWidth;
  let left = r.left + r.width / 2 - w / 2;
  left = Math.max(PAD, Math.min(window.innerWidth - w - PAD, left));
  let top = r.top - height - GAP;
  if (top < PAD) top = r.bottom + GAP; // no room above → below
  box.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  return r.top;
}

function show(target) {
  ensureBox();
  clearTimeout(hideTimer);
  if (target === current && visible) return;
  current = target;
  const next = content(target);
  const chrome = 2 * 9; // vertical padding of .fp-tip

  if (!visible) {
    // first appearance: no glide, just appear in place
    inner.replaceChildren(next);
    inner.style.height = '';
    box.classList.add('no-move');
    lastY = place(target, inner.offsetHeight + chrome);
    void box.offsetWidth; // commit position before re-enabling transitions
    box.classList.remove('no-move');
    box.classList.add('on');
    visible = true;
    return;
  }

  // moving to another point: swap text with a slide, resize, glide
  const y = target.getBoundingClientRect().top;
  const dir = y >= (lastY ?? y) ? 'up' : 'down'; // moving down the page → text slides up
  lastY = y;
  const from = inner.offsetHeight;
  for (const old of [...inner.children]) {
    old.classList.add('out', `out-${dir}`);
    old.addEventListener('transitionend', () => old.remove(), { once: true });
    setTimeout(() => old.remove(), 400); // safety net
  }
  next.classList.add('in', `in-${dir}`);
  inner.append(next);
  const to = next.offsetHeight;
  inner.style.height = `${from}px`;
  place(target, to + chrome);
  requestAnimationFrame(() => {
    inner.style.height = `${to}px`;
    next.classList.remove('in', `in-${dir}`);
  });
}

function hideSoon() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    current = null;
    visible = false;
    box?.classList.remove('on');
  }, HIDE_AFTER);
}

let ready = false;
export function initTooltips() {
  if (ready) return;
  ready = true;
  const find = (e) => e.target?.closest?.('[data-tip]');
  document.addEventListener('mouseover', (e) => {
    const t = find(e);
    if (t) show(t);
    else if (current) hideSoon();
  });
  document.addEventListener('focusin', (e) => {
    const t = find(e);
    if (t) show(t);
  });
  document.addEventListener('focusout', hideSoon);
  document.addEventListener('scroll', () => visible && hideSoon(), true);
  document.addEventListener('keydown', (e) => e.key === 'Escape' && hideSoon());
}
