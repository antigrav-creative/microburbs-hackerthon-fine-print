// Static UI harness for the panel: the real panel.html markup + ui.css + the real
// overview/card renderers fed from the bundled test brief. No chrome.* APIs, no model.
//   gallery:  /dev/preview.html               (?only=setup|overview|chat|loading|cards)
//   one panel: /dev/preview.html?embed=chat   (full height; used by dev/shell.html)

import { renderOverview, renderOverviewLoading } from '../src/ui/overview.js';
import { renderBlock } from '../src/ui/blocks.js';
import { renderMarkdown } from '../src/ui/markdown.js';
import { paintYieldTicks } from '../src/ui/setup.js';
import { initTooltips } from '../src/ui/tooltip.js';
initTooltips();
import { cardFromBrief, TEMPLATES } from '../src/agent/ui-blocks.js';
import { testBrief, TEST_INVESTOR } from '../src/agent/test-data.js';

const params = new URLSearchParams(location.search);
const investor = { ...TEST_INVESTOR, holdYears: 10 };
const brief = testBrief(undefined, investor);
brief.meta.test_data = false; // show the "live" pill in the preview
window.previewBrief = brief;

const PANEL = new DOMParser().parseFromString(await (await fetch('../src/ui/panel.html')).text(), 'text/html');

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

/** A fresh copy of the panel's markup (minus its script) in a 420px frame. */
function panelFrame(into = null) {
  const f = into ?? el('div', 'frame panel embedded');
  for (const n of PANEL.body.children) if (n.tagName !== 'SCRIPT') f.append(n.cloneNode(true));
  f.$ = (id) => f.querySelector(`#${id}`);
  f.$('close').hidden = false;
  f.$('brief-chip').textContent = '$800K · ≥4% · 10y';
  return f;
}

function card(template) {
  let body;
  try {
    body = cardFromBrief(template, brief, investor);
  } catch {
    body = TEMPLATES[template].example; // data not in the fixture → the template's own example
  }
  return renderBlock(template, body);
}

// ---------------------------------------------------------------- frames
function setupFrame(f = panelFrame()) {
  f.classList.add('in-setup');
  f.$('brief-chip').textContent = 'brief: not set';
  f.$('setup').hidden = false;
  for (const id of ['listing', 'data', 'thread', 'starters', 'ask']) f.$(id).classList.add('behind-setup');
  const listing = f.$('setup-listing');
  listing.hidden = false;
  const who = el('div', 'ov-who');
  who.append(el('div', 'ov-address', '38/3 Victoria Park Pde, Zetland'), el('div', 'ov-id', 'this listing'));
  listing.append(who, el('span', 'ov-live', 'signals ready'));
  f.$('s-budget').value = '800,000';
  f.$('s-deposit').value = '160,000';
  let hold = 10;
  const paint = () => {
    const budget = Number(f.$('s-budget').value.replace(/\D/g, ''));
    const deposit = Number(f.$('s-deposit').value.replace(/\D/g, ''));
    f.$('s-deposit-pct').textContent = budget && deposit ? `${Math.round((deposit / budget) * 100)}%` : '';
    f.$('s-yield-out').textContent = `${Number(f.$('s-yield').value).toFixed(1)}%`;
    paintYieldTicks(f.$('s-yield'), f.$('s-yield-ticks'), f.$('s-yield-scale'));
    for (const b of f.$('s-hold').querySelectorAll('button')) b.classList.toggle('on', Number(b.dataset.years) === hold);
  };
  f.$('s-yield').addEventListener('input', paint);
  f.$('s-budget').addEventListener('input', paint);
  f.$('s-deposit').addEventListener('input', paint);
  f.$('s-hold').addEventListener('click', (e) => {
    if (e.target.dataset.years) {
      hold = Number(e.target.dataset.years);
      paint();
    }
  });
  paint();
  return f;
}

function overviewFrame(f = panelFrame()) {
  const wrap = el('section', 'overview');
  wrap.append(renderOverview(brief, investor, { onAsk: (q) => fakeTurn(f, q) }));
  f.$('thread').append(wrap);
  f.$('starters').replaceChildren(...['What should I offer?', 'Is the supply a dealbreaker?', 'What will it cost me weekly?'].map((q) => el('button', null, q)));
  wire(f);
  return f;
}

function loadingFrame(f = panelFrame()) {
  const wrap = el('section', 'overview');
  const l = renderOverviewLoading();
  l.setStep('matched · pulling signals…');
  wrap.append(l);
  f.$('thread').append(wrap);
  f.$('starters').classList.add('loading');
  wire(f);
  return f;
}

function chatFrame(f = panelFrame()) {
  const t = f.$('thread');
  t.append(el('div', 'msg user', 'What should I offer?'));
  t.append(md('# Aim for $735K. *Walk at $785K.*\n\nAnchor on the sales, not the quote. Five 1-beds within 1 km sold in October for $614K–785K, and this agency usually lands **10% over quote**.'));
  t.append(card('offer'));
  t.append(el('div', 'msg user', 'Is the supply a dealbreaker?'));
  const tl = el('div', 'meta tool-line done', 'Checking development applications');
  t.append(tl);
  t.append(md('**Not at $735K.** It mostly squeezes rent for a couple of years. Each block below is 25 new homes:'));
  t.append(card('supply'));
  t.append(el('div', 'msg user', 'And the yield?'));
  t.append(el('div', 'meta tool-line done', 'Pulling the brief'));
  t.append(el('div', 'meta tool-line running', 'Drawing a card…'));
  const live = md('Gross yield clears your **4%** minimum at the asking price, but drops to 4.7% at the likely sale');
  live.classList.add('live');
  t.append(live);
  f.$('input').placeholder = 'Ask a follow-up…';
  f.$('starters').replaceChildren(...['Weekly cost at $735K?', 'Show me better-priced properties', 'Draft my offer'].map((q) => el('button', null, q)));
  wire(f);
  return f;
}

const md = (text, cls = 'msg agent md') => {
  const n = el('div', cls);
  n.innerHTML = renderMarkdown(text);
  return n;
};

// ---------------------------------------------------------------- a fake turn (streaming demo)
const ANSWERS = {
  offer: ['# Aim for $735K. *Walk at $785K.*\n\nThe agency sells a median 10% over quote, so the asking price is a floor, not a ceiling. Open at $700K.', 'offer'],
  supply: ['**Yes, it matters.** 504 build-to-rent homes 640 m away compete for the same tenants for a couple of years.', 'supply'],
  cost: ['At the likely sale with your 20% deposit this runs at a **weekly loss before tax**. Rent covers most of the interest.', 'cash_flow'],
  worth: ['The computer valuation sits **below the asking price**, and the range is wide here.', 'value'],
  yield: ['Gross yield clears your **4%** minimum at the asking price.', 'yield'],
  hazard: ['Clear on the title. **One thing to check**: a high-voltage power line 23 m away.', 'overlays'],
};
function answerFor(q) {
  const s = q.toLowerCase();
  if (/offer|bid/.test(s)) return ANSWERS.offer;
  if (/supply|dealbreaker|new homes/.test(s)) return ANSWERS.supply;
  if (/cost|weekly|week/.test(s)) return ANSWERS.cost;
  if (/worth|value|estimate/.test(s)) return ANSWERS.worth;
  if (/hazard|risk|flood/.test(s)) return ANSWERS.hazard;
  return ANSWERS.yield;
}

let busy = false;
async function fakeTurn(f, q) {
  if (busy || !q.trim()) return;
  busy = true;
  const t = f.$('thread');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const scroll = () => (t.scrollTop = t.scrollHeight);
  f.$('starters').hidden = true;
  f.$('send').disabled = true;
  t.append(el('div', 'msg user', q));
  scroll();
  const [text, template] = answerFor(q);
  const line = el('div', 'meta tool-line running', 'Pulling the brief…');
  t.append(line);
  scroll();
  await sleep(700);
  line.className = 'meta tool-line done';
  line.textContent = 'Pulling the brief';
  const live = el('div', 'msg agent live md');
  t.append(live);
  for (let i = 0; i <= text.length; i += 3) {
    live.innerHTML = renderMarkdown(text.slice(0, i));
    scroll();
    await sleep(16);
  }
  live.classList.remove('live');
  live.innerHTML = renderMarkdown(text);
  const c = el('div', 'meta tool-line running', 'Drawing a card…');
  t.append(c);
  scroll();
  await sleep(450);
  c.replaceWith(card(template));
  scroll();
  f.$('starters').hidden = false;
  f.$('send').disabled = false;
  busy = false;
}

function wire(f) {
  f.$('ask').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = f.$('input').value;
    f.$('input').value = '';
    fakeTurn(f, q);
  });
  f.$('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      f.$('ask').requestSubmit();
    }
  });
  f.$('starters').addEventListener('click', (e) => {
    if (e.target.tagName === 'BUTTON') fakeTurn(f, e.target.textContent);
  });
}

// ---------------------------------------------------------------- page
const FRAMES = { setup: setupFrame, overview: overviewFrame, chat: chatFrame, loading: loadingFrame };

function render() {
  document.body.replaceChildren();
  const embed = params.get('embed');
  if (embed) {
    document.body.className = 'panel embedded embed';
    const f = panelFrame(document.body);
    (FRAMES[embed] ?? overviewFrame)(f);
    // inside dev/shell.html: the ✕ closes the slide-out like the real panel
    f.$('close').addEventListener('click', () => window.parent?.postMessage({ type: 'fineprint:close' }, location.origin));
    return;
  }
  document.body.className = 'gallery';
  const only = params.get('only');
  const head = el('div', 'gallery-head');
  const h1 = el('h1');
  h1.append('Fine Print ', el('em', null, 'UI preview'));
  const tools = el('div', 'tools');
  const replay = el('button', null, 'Replay animations');
  replay.addEventListener('click', render);
  tools.append('test brief · Unit 38, 3 Victoria Park Pde, Zetland', replay);
  head.append(h1, tools);
  document.body.append(head);

  const row = el('div', 'row');
  const slot = (label, node) => {
    const s = el('div', 'slot');
    s.append(el('div', 'label', label), node);
    row.append(s);
  };
  const shell = (frame) => {
    const s = el('div', 'shell');
    const btn = el('button', 'shortlist');
    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 13 13" fill="none"><path d="M3 1.5h7v10l-3.5-2.5L3 11.5z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg><span>Shortlist this property</span><span class="k">S</span>';
    s.append(frame, btn);
    return s;
  };
  for (const [name, make] of Object.entries(FRAMES)) {
    if (only && only !== name) continue;
    slot(`${name}`, name === 'setup' ? make() : shell(make()));
  }
  if (row.childElementCount) document.body.append(row);

  if (!only || only === 'cards') {
    const cards = el('div', 'cards');
    for (const name of Object.keys(TEMPLATES)) {
      const s = el('div', 'slot');
      s.append(el('div', 'label', name), card(name));
      cards.append(s);
    }
    document.body.append(cards);
    // the same templates with their schema examples (agent/ui-blocks.js), as the model may fill them
    const ex = el('div', 'cards');
    ex.style.marginTop = '36px';
    for (const [name, t] of Object.entries(TEMPLATES)) {
      const s = el('div', 'slot');
      s.append(el('div', 'label', `${name} · schema example`), renderBlock(name, t.example));
      ex.append(s);
    }
    document.body.append(ex);
  }
}
render();
