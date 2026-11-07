// Shortlist as a spreadsheet: every shortlisted property × its Microburbs figures, plus
// the investor's own columns (typed values and formulas). Sort, filter, reorder, hide,
// edit, keyboard-navigate, copy to Excel/Sheets, export CSV. Layout + typed values are
// saved in chrome.storage.local `sheet`. DOM + textContent only.

import { loadSettings } from '../agent/agent.js';
import { IndexedDbPropertyBackend } from '../agent/property-memory.js';
import { listingKey, shortlistRows } from '../agent/shortlist.js';
import { compileFilter, compileFormula, formulaRefs, toCsv } from '../agent/sheet.js';
import { openPage } from './open-page.js';

const $ = (id) => document.getElementById(id);
const h = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = String(text);
  return n;
};
const title = (s) => String(s ?? '').toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/^Unit\s+/, '').replace(/\s*\(.*\)/, '');

// ---------------------------------------------------------------- formats
const FMT = {
  text: (v) => (v == null ? '' : String(v)),
  money: (v) => (v == null || v === '' ? '' : Number(v) >= 1e6 ? `$${(Number(v) / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(Number(v)).toLocaleString('en-AU')}`),
  pct: (v) => (v == null || v === '' ? '' : `${Math.round(Number(v) * 100) / 100}%`),
  number: (v) => (v == null || v === '' ? '' : (Math.round(Number(v) * 100) / 100).toLocaleString('en-AU')),
  weekly: (v) => (v == null ? '' : `${Number(v) > 0 ? '−' : '+'}$${Math.abs(Math.round(Number(v)))}`),
  bool: (v) => (v == null ? '' : v ? '✓' : '✕'),
};

// ---------------------------------------------------------------- built-in columns (from Microburbs data)
// best: which way is better for an investor ('max' | 'min') → blue best / warm worst
const BUILT_IN = [
  { id: 'address', label: 'Property', type: 'text', get: (r) => title(String(r.address).split(',')[0]), width: 210, link: true },
  { id: 'suburb', label: 'Suburb', type: 'text', get: (r) => title(r.suburb) },
  { id: 'beds', label: 'Beds', type: 'number', get: (r) => r.beds },
  { id: 'baths', label: 'Baths', type: 'number', get: (r) => r.baths },
  { id: 'parking', label: 'Car', type: 'number', get: (r) => r.parking },
  { id: 'price', label: 'Price', type: 'money', get: (r) => r.price, best: 'min', hint: 'likely sale, else asking, else estimate' },
  { id: 'asking', label: 'Asking', type: 'money', get: (r) => r.asking, best: 'min' },
  { id: 'likely', label: 'Likely sale', type: 'money', get: (r) => r.likely_sale, best: 'min' },
  { id: 'value', label: 'Est. value', type: 'money', get: (r) => r.estimated_value },
  { id: 'rent', label: 'Rent /wk', type: 'money', get: (r) => r.rent_weekly, best: 'max' },
  { id: 'model_rent', label: 'Model rent /wk', type: 'money', get: (r) => r.model_rent_weekly, best: 'max', hint: 'Fine Print rent model (City of Sydney apartments, Aug–Sep 2026), matching the car space' },
  { id: 'yield', label: 'Gross yield', type: 'pct', get: (r) => r.yield_pct, best: 'max' },
  { id: 'weekly_cost', label: 'Weekly cost', type: 'weekly', get: (r) => r.weekly_cost, best: 'min', hint: 'out of pocket per week, before tax' },
  { id: 'new_homes', label: 'New homes ≤1km', type: 'number', get: (r) => r.new_homes_1km, best: 'min' },
  { id: 'btr', label: 'Build-to-rent ≤1km', type: 'number', get: (r) => r.build_to_rent_1km, best: 'min' },
  { id: 'supply_peak', label: 'Supply peak', type: 'number', get: (r) => r.supply_peak_year, hint: 'year new supply most likely lands' },
  { id: 'vacancy', label: 'Vacancy', type: 'pct', get: (r) => r.vacancy_pct, best: 'min' },
  { id: 'budget_fit', label: 'In budget', type: 'bool', get: (r) => r.within_budget },
  { id: 'yield_fit', label: 'Meets yield', type: 'bool', get: (r) => r.meets_yield },
  { id: 'risks', label: 'Hazards', type: 'text', get: (r) => (r.risks ?? []).map((k) => ({ hv_power_line: 'power line', flood: 'flood', heritage: 'heritage', bushfire: 'bushfire' })[k] ?? k.replace(/_/g, ' ')).join(', ') },
  { id: 'agency', label: 'Agency', type: 'text', get: (r) => r.agency },
  { id: 'last_sold', label: 'Last sold', type: 'money', get: (r) => r.last_sold_price },
  { id: 'added', label: 'Added', type: 'text', get: (r) => (r.added_at ? new Date(r.added_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '') },
];

// sensible starting columns of the investor's own
const DEFAULT_CUSTOM = [
  { id: 'my_offer', label: 'My offer', type: 'money' },
  { id: 'yield_at_offer', label: 'Yield at my offer', type: 'formula', formula: 'rent * 52 / my_offer * 100', format: 'pct', best: 'max' },
  { id: 'yearly_cost', label: 'Yearly cost', type: 'formula', formula: 'weekly_cost * 52', format: 'money', best: 'min' },
  { id: 'notes', label: 'Notes', type: 'text', width: 200 },
];
const DEFAULT_HIDDEN = ['baths', 'parking', 'value', 'vacancy', 'agency', 'last_sold', 'budget_fit', 'yield_fit', 'supply_peak'];

// pinned to the left (always first, stay put while you scroll sideways)
const PINNED = ['address', 'suburb'];
const PIN_MAX = { address: 230, suburb: 130 };
const isPinned = (c) => PINNED.includes(c.id);
let lastPin = null;
function pin(el, c) {
  if (!isPinned(c)) return el;
  el.classList.add('pin');
  el.dataset.pin = c.id;
  if (c.id === lastPin) el.classList.add('pin-last');
  return el;
}
/** Sticky left offsets = widths of the cells before each pinned column. */
function layoutPins() {
  const head = $('thead').rows[0];
  if (!head) return;
  const lefts = {};
  let left = 0;
  for (const th of head.cells) {
    if (th.dataset.pin) lefts[th.dataset.pin] = left;
    left += th.offsetWidth;
  }
  for (const el of $('sheet').querySelectorAll('[data-pin]')) el.style.left = `${lefts[el.dataset.pin]}px`;
}

// ---------------------------------------------------------------- state
let rows = [];
let sheet = null; // { order, hidden, sort, filters, custom, cells }
let investor = null;
let cursor = { r: 0, c: 0 };
let search = '';

async function loadSheet() {
  const { sheet: s } = await chrome.storage.local.get('sheet');
  sheet = s ?? {};
  sheet.custom ??= DEFAULT_CUSTOM.map((c) => ({ ...c }));
  sheet.hidden ??= [...DEFAULT_HIDDEN];
  sheet.filters ??= {};
  sheet.cells ??= {};
  sheet.sort ??= { id: 'yield', dir: -1 };
  const all = [...BUILT_IN.map((c) => c.id), ...sheet.custom.map((c) => c.id)];
  sheet.order = [...(sheet.order ?? []).filter((id) => all.includes(id)), ...all.filter((id) => !(sheet.order ?? []).includes(id))];
}
let saveTimer = null;
const saveSheet = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => chrome.storage.local.set({ sheet }), 200);
};

function columns() {
  const custom = sheet.custom.map((c) => ({
    ...c,
    custom: true,
    editable: c.type !== 'formula',
    fmt: c.type === 'formula' ? c.format ?? 'number' : c.type,
  }));
  const byId = new Map([...BUILT_IN.map((c) => [c.id, { ...c, fmt: c.type }]), ...custom.map((c) => [c.id, c])]);
  return sheet.order.map((id) => byId.get(id)).filter(Boolean);
}
const visible = () => {
  const v = columns().filter((c) => !sheet.hidden.includes(c.id));
  return [...PINNED.map((id) => v.find((c) => c.id === id)).filter(Boolean), ...v.filter((c) => !isPinned(c))];
};

/** Every column's value for a row (built-ins, typed cells, then formulas in order). */
function valuesOf(r) {
  const v = {};
  for (const c of BUILT_IN) v[c.id] = c.get(r);
  const cells = sheet.cells[r.key] ?? {};
  for (const c of sheet.custom) {
    if (c.type === 'formula') {
      try {
        v[c.id] = (c._fn ??= compileFormula(c.formula))(v);
      } catch {
        v[c.id] = null;
      }
    } else {
      v[c.id] = c.type === 'text' ? cells[c.id] ?? '' : cells[c.id] == null || cells[c.id] === '' ? null : Number(cells[c.id]);
    }
  }
  return v;
}

function view() {
  const cols = columns();
  let out = rows.map((r) => ({ r, v: valuesOf(r) }));
  if (search) {
    const s = search.toLowerCase();
    out = out.filter(({ v }) => cols.some((c) => String(FMT[c.fmt]?.(v[c.id]) ?? '').toLowerCase().includes(s)));
  }
  for (const [id, f] of Object.entries(sheet.filters)) {
    if (!f) continue;
    const test = compileFilter(f);
    out = out.filter(({ v }) => test(v[id]));
  }
  const { id, dir } = sheet.sort ?? {};
  if (id) {
    out.sort((a, b) => {
      const x = a.v[id];
      const y = b.v[id];
      if (x == null || x === '') return 1;
      if (y == null || y === '') return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }
  return out;
}

// ---------------------------------------------------------------- render
function render() {
  const cols = visible();
  lastPin = cols.filter(isPinned).at(-1)?.id ?? null;
  const data = view();
  $('count').textContent = rows.length ? `· ${data.length}${data.length !== rows.length ? ` of ${rows.length}` : ''}` : '';
  $('empty').hidden = true; // placeholder rows carry the empty state

  // header: sortable, draggable
  const hr = h('tr');
  hr.append(h('th', 'rownum', '#'));
  for (const c of cols) {
    const th = h('th', `${c.custom ? 'custom' : ''} ${['money', 'pct', 'number', 'weekly'].includes(c.fmt) ? 'num' : ''}`);
    if (!isPinned(c)) th.style.minWidth = `${c.width ?? 96}px`;
    pin(th, c);
    th.draggable = !isPinned(c);
    th.dataset.id = c.id;
    const lab = h('span', 'lab', c.label);
    const arrow = h('span', 'arrow', sheet.sort?.id === c.id ? (sheet.sort.dir > 0 ? '▲' : '▼') : '');
    th.append(lab, arrow);
    if (c.custom) {
      const edit = h('button', 'col-edit', '✎');
      edit.title = 'Edit column';
      edit.addEventListener('click', (e) => {
        e.stopPropagation();
        openColDialog(c);
      });
      th.append(edit);
    }
    th.title = `${c.type === 'formula' ? `= ${c.formula}\n` : ''}${c.hint ?? ''}${c.hint || c.type === 'formula' ? '\n' : ''}id: ${c.id} · click to sort, drag to move`;
    th.addEventListener('click', () => {
      const cur = sheet.sort?.id === c.id ? sheet.sort.dir : 0;
      sheet.sort = cur === -1 ? { id: c.id, dir: 1 } : cur === 1 ? null : { id: c.id, dir: -1 };
      saveSheet();
      render();
    });
    th.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/col', c.id));
    th.addEventListener('dragover', (e) => {
      e.preventDefault();
      th.classList.add('drop');
    });
    th.addEventListener('dragleave', () => th.classList.remove('drop'));
    th.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = e.dataTransfer.getData('text/col');
      if (!from || from === c.id || isPinned(c)) return;
      sheet.order = sheet.order.filter((x) => x !== from);
      sheet.order.splice(sheet.order.indexOf(c.id), 0, from);
      saveSheet();
      render();
    });
    hr.append(th);
  }
  hr.append(h('th', 'actions-col', ''));
  // filter row
  const fr = h('tr', 'filters');
  fr.append(h('th', 'rownum', ''));
  for (const c of cols) {
    const th = pin(h('th'), c);
    const inp = h('input', 'filter');
    inp.placeholder = ['money', 'pct', 'number', 'weekly'].includes(c.fmt) ? '>, <, a-b' : 'filter';
    inp.value = sheet.filters[c.id] ?? '';
    inp.addEventListener('input', () => {
      sheet.filters[c.id] = inp.value;
      saveSheet();
      renderBody();
    });
    th.append(inp);
    fr.append(th);
  }
  fr.append(h('th'));
  $('thead').replaceChildren(hr, fr);
  renderBody();
}

function renderBody() {
  const cols = visible();
  lastPin = cols.filter(isPinned).at(-1)?.id ?? null;
  const data = view();
  // best / worst per numeric column with a direction
  const extremes = {};
  for (const c of cols) {
    if (!c.best) continue;
    const vals = data.map(({ v }) => v[c.id]).filter((x) => typeof x === 'number');
    if (vals.length < 2) continue;
    const hi = Math.max(...vals);
    const lo = Math.min(...vals);
    if (hi === lo) continue;
    extremes[c.id] = c.best === 'max' ? { best: hi, worst: lo } : { best: lo, worst: hi };
  }
  const trs = data.map(({ r, v }, ri) => {
    const tr = h('tr');
    tr.dataset.key = r.key;
    tr.append(h('td', 'rownum', ri + 1));
    cols.forEach((c, ci) => {
      const td = h('td', `${['money', 'pct', 'number', 'weekly'].includes(c.fmt) ? 'num' : ''} ${c.editable ? 'editable' : ''} ${c.type === 'formula' ? 'formula' : ''}`);
      td.dataset.r = ri;
      td.dataset.c = ci;
      pin(td, c);
      const target = isPinned(c) ? td.appendChild(h('span', 'pin-in')) : td;
      if (isPinned(c)) target.style.maxWidth = `${PIN_MAX[c.id]}px`;
      const val = v[c.id];
      if (c.link) {
        const a = h('a', null, FMT.text(val));
        a.href = r.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        if (!r.analysed) a.append(h('span', 'pending', ' · not read yet'));
        target.append(a);
      } else {
        target.textContent = FMT[c.fmt]?.(val) ?? '';
      }
      const ex = extremes[c.id];
      if (ex && typeof val === 'number') {
        if (val === ex.best) td.classList.add('best');
        else if (val === ex.worst) td.classList.add('worst');
      }
      if (c.fmt === 'bool' && val != null) td.classList.add(val ? 'yes' : 'no');
      if (cursor.r === ri && cursor.c === ci) td.classList.add('cur');
      td.addEventListener('mousedown', () => moveTo(ri, ci));
      if (c.editable) td.addEventListener('dblclick', () => editCell(td, r, c));
      tr.append(td);
    });
    const act = h('td', 'actions');
    const rm = h('button', 'icon', '✕');
    rm.title = 'Remove from shortlist';
    rm.addEventListener('click', () => removeRow(r));
    act.append(rm);
    tr.append(act);
    return tr;
  });
  $('tbody').replaceChildren(...trs);

  // summary row: average of numeric columns
  const fr = h('tr');
  fr.append(h('td', 'rownum', 'avg'));
  for (const c of cols) {
    const vals = data.map(({ v }) => v[c.id]).filter((x) => typeof x === 'number');
    const td = pin(h('td', 'num'), c);
    if (vals.length && ['money', 'pct', 'number', 'weekly'].includes(c.fmt) && !['beds', 'baths', 'parking', 'supply_peak'].includes(c.id)) {
      td.textContent = FMT[c.fmt](vals.reduce((a, b) => a + b, 0) / vals.length);
      td.title = `min ${FMT[c.fmt](Math.min(...vals))} · max ${FMT[c.fmt](Math.max(...vals))} · ${vals.length} values`;
    }
    fr.append(td);
  }
  fr.append(h('td'));
  $('tfoot').replaceChildren(fr);
  fillPlaceholders(cols, data.length);
  layoutPins();
}

/** Empty numbered rows below the real ones, enough to fill the sheet so the averages row sits at the bottom. */
function fillPlaceholders(cols, n) {
  const scroll = document.querySelector('.sh-scroll');
  const table = $('sheet');
  const body = $('tbody');
  const make = (i) => {
    const tr = h('tr', 'ph');
    tr.append(h('td', 'rownum', n + i + 1));
    cols.forEach((c, ci) => {
      const td = pin(h('td'), c);
      if (i === 0 && ci === 0) td.append(h('span', 'ph-hint', n ? '+ Add from REA or Domain' : 'Shortlist from REA or Domain'));
      tr.append(td);
    });
    tr.append(h('td'));
    return tr;
  };
  let i = 0;
  body.append(make(i++));
  const rowH = body.lastElementChild.offsetHeight || 33;
  const more = Math.max(2, Math.floor((scroll.clientHeight - table.offsetHeight) / rowH));
  for (let k = 0; k < more; k++) body.append(make(i++));
  const gap = scroll.clientHeight - table.offsetHeight;
  if (gap > 0) body.lastElementChild.style.height = `${body.lastElementChild.offsetHeight + gap}px`;
}
let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderBody, 80);
});

// ---------------------------------------------------------------- editing + keyboard
function moveTo(r, c) {
  const data = view();
  const cols = visible();
  cursor = { r: Math.max(0, Math.min(data.length - 1, r)), c: Math.max(0, Math.min(cols.length - 1, c)) };
  for (const n of document.querySelectorAll('td.cur')) n.classList.remove('cur');
  const td = document.querySelector(`td[data-r="${cursor.r}"][data-c="${cursor.c}"]`);
  td?.classList.add('cur');
  td?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function editCell(td, r, c) {
  if (!c.editable || td.querySelector('input')) return;
  const cur = sheet.cells[r.key]?.[c.id] ?? '';
  const inp = h('input', 'cell-input');
  inp.value = cur;
  if (c.type !== 'text') inp.inputMode = 'decimal';
  td.replaceChildren(inp);
  inp.focus();
  inp.select();
  let done = false;
  const commit = (save) => {
    if (done) return;
    done = true;
    if (save) {
      let val = inp.value.trim();
      if (c.type !== 'text' && val) {
        const m = val.toLowerCase().replace(/[$,\s]/g, '').match(/^(-?\d+(?:\.\d+)?)(k|m)?$/);
        val = m ? String(Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1)) : '';
      }
      sheet.cells[r.key] = { ...(sheet.cells[r.key] ?? {}), [c.id]: val };
      saveSheet();
    }
    renderBody();
    $('sheet').focus();
  };
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commit(true);
      moveTo(cursor.r + 1, cursor.c);
    } else if (e.key === 'Escape') commit(false);
    else if (e.key === 'Tab') {
      e.preventDefault();
      commit(true);
      moveTo(cursor.r, cursor.c + (e.shiftKey ? -1 : 1));
    }
    e.stopPropagation();
  });
  inp.addEventListener('blur', () => commit(true));
}

$('sheet').addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key;
  const moves = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
  if (moves[k]) {
    e.preventDefault();
    moveTo(cursor.r + moves[k][0], cursor.c + moves[k][1]);
  } else if (k === 'Tab') {
    e.preventDefault();
    moveTo(cursor.r, cursor.c + (e.shiftKey ? -1 : 1));
  } else if (k === 'Enter' || k === 'F2') {
    e.preventDefault();
    const data = view();
    const c = visible()[cursor.c];
    const td = document.querySelector(`td[data-r="${cursor.r}"][data-c="${cursor.c}"]`);
    if (data[cursor.r] && c?.editable && td) editCell(td, data[cursor.r].r, c);
  } else if ((k === 'Backspace' || k === 'Delete') && !e.metaKey) {
    const data = view();
    const c = visible()[cursor.c];
    if (data[cursor.r] && c?.editable) {
      const key = data[cursor.r].r.key;
      sheet.cells[key] = { ...(sheet.cells[key] ?? {}), [c.id]: '' };
      saveSheet();
      renderBody();
    }
  } else if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'c' && !window.getSelection()?.toString()) {
    e.preventDefault();
    copyTable();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
    e.preventDefault();
    $('search').focus();
  }
});

// ---------------------------------------------------------------- rows
async function removeRow(r) {
  const { shortlist = {} } = await chrome.storage.local.get('shortlist');
  delete shortlist[r.key];
  await chrome.storage.local.set({ shortlist });
  toast(`Removed ${title(String(r.address).split(',')[0])}`);
}

// ---------------------------------------------------------------- columns menu
function renderColsMenu() {
  const m = $('cols-menu');
  m.replaceChildren(h('div', 'pop-title', 'Show columns'));
  for (const c of columns()) {
    const row = h('label', 'pop-row');
    const cb = h('input');
    cb.type = 'checkbox';
    cb.checked = !sheet.hidden.includes(c.id);
    cb.addEventListener('change', () => {
      sheet.hidden = cb.checked ? sheet.hidden.filter((x) => x !== c.id) : [...sheet.hidden, c.id];
      saveSheet();
      render();
    });
    row.append(cb, h('span', null, c.label), h('code', 'dim', c.id));
    m.append(row);
  }
  const reset = h('button', 'btn small', 'Reset layout');
  reset.addEventListener('click', async () => {
    sheet = { custom: sheet.custom, cells: sheet.cells };
    await chrome.storage.local.set({ sheet });
    await loadSheet();
    render();
    renderColsMenu();
  });
  m.append(reset);
}
$('cols-btn').addEventListener('click', (e) => {
  const m = $('cols-menu');
  if (!m.hidden) return (m.hidden = true);
  renderColsMenu();
  const r = e.target.getBoundingClientRect();
  m.style.top = `${r.bottom + 6}px`;
  m.style.right = `${window.innerWidth - r.right}px`;
  m.hidden = false;
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('#cols-menu') && e.target.id !== 'cols-btn') $('cols-menu').hidden = true;
});

// ---------------------------------------------------------------- add / edit column
let editing = null;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'col';
function openColDialog(col = null) {
  editing = col;
  $('col-title').textContent = col ? `Edit "${col.label}"` : 'Add a column';
  $('col-name').value = col?.label ?? '';
  $('col-type').value = col?.type ?? 'formula';
  $('col-formula').value = col?.formula ?? '';
  $('col-format').value = col?.format ?? 'number';
  $('col-delete').hidden = !col;
  $('col-ids').textContent = columns().filter((c) => c.id !== col?.id).map((c) => c.id).join(', ');
  syncColDialog();
  $('col-dialog').showModal();
  $('col-name').focus();
}
function syncColDialog() {
  const isF = $('col-type').value === 'formula';
  $('col-formula-wrap').hidden = !isF;
  $('col-format-wrap').hidden = !isF;
  const prev = $('col-preview');
  if (!isF) return (prev.textContent = '');
  const src = $('col-formula').value.trim();
  if (!src) return (prev.textContent = 'e.g. rent * 52 / my_offer * 100 — yield at your offer');
  try {
    const fn = compileFormula(src);
    const known = new Set(columns().map((c) => c.id));
    const unknown = formulaRefs(src).filter((id) => !known.has(id));
    if (unknown.length) {
      prev.textContent = `Unknown column: ${unknown.join(', ')}`;
      prev.className = 'warn';
      return;
    }
    const first = rows[0];
    const val = first ? fn(valuesOf(first)) : null;
    prev.textContent = first ? `${title(String(first.address).split(',')[0])}: ${val == null ? '(empty — missing data)' : FMT[$('col-format').value](val)}` : 'Looks good';
    prev.className = 'ok';
  } catch (e) {
    prev.textContent = e.message;
    prev.className = 'warn';
  }
}
for (const id of ['col-type', 'col-formula', 'col-format']) $(id).addEventListener('input', syncColDialog);
$('add-col').addEventListener('click', () => openColDialog());
$('col-dialog').addEventListener('close', () => {
  const action = $('col-dialog').returnValue;
  if (action === 'delete' && editing) {
    sheet.custom = sheet.custom.filter((c) => c.id !== editing.id);
    sheet.order = sheet.order.filter((x) => x !== editing.id);
  } else if (action === 'save') {
    const label = $('col-name').value.trim();
    if (!label) return;
    const type = $('col-type').value;
    const def = { label, type, ...(type === 'formula' ? { formula: $('col-formula').value.trim(), format: $('col-format').value } : {}) };
    if (type === 'formula') {
      try {
        compileFormula(def.formula);
      } catch (e) {
        toast(`Formula not saved: ${e.message}`);
        return;
      }
    }
    if (editing) {
      Object.assign(sheet.custom.find((c) => c.id === editing.id), def, { _fn: undefined });
    } else {
      let id = slug(label);
      const taken = new Set(columns().map((c) => c.id));
      while (taken.has(id)) id += '_2';
      sheet.custom.push({ id, ...def });
      sheet.order.push(id);
    }
  } else return;
  for (const c of sheet.custom) delete c._fn;
  chrome.storage.local.set({ sheet: JSON.parse(JSON.stringify(sheet)) });
  render();
});

// ---------------------------------------------------------------- copy / CSV
function tableData() {
  const cols = visible();
  const data = view();
  return { cols, data, cell: ({ r, v }, c) => (c.link ? title(String(r.address).split(',')[0]) : FMT[c.fmt]?.(v[c.id]) ?? '') };
}
async function copyTable() {
  const { cols, data, cell } = tableData();
  const tsv = [cols.map((c) => c.label).join('\t'), ...data.map((d) => cols.map((c) => cell(d, c)).join('\t'))].join('\n');
  await navigator.clipboard.writeText(tsv);
  toast(`Copied ${data.length} rows — paste into Excel or Google Sheets`);
}
$('copy').addEventListener('click', copyTable);
$('csv').addEventListener('click', () => {
  const { cols, data, cell } = tableData();
  const csv = toCsv(cols, data, cell);
  const a = h('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `fine-print-shortlist-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
});

$('settings').addEventListener('click', () => openPage('options.html'));
$('brief').addEventListener('click', () => openPage('options.html'));
$('brief').title = 'Your investor brief — click to change';
$('search').addEventListener('input', (e) => {
  search = e.target.value.trim();
  renderBody();
});

let toastTimer = null;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

// ---------------------------------------------------------------- data
async function load() {
  const settings = await loadSettings();
  investor = settings.brief;
  $('brief').textContent = `$${Math.round(investor.budget / 1000)}K · ≥${investor.minYield}% · ${investor.holdYears}y`;
  const { shortlist = {} } = await chrome.storage.local.get('shortlist');
  const records = await new IndexedDbPropertyBackend().all().catch(() => []);
  rows = shortlistRows(shortlist, records, investor).map((r) => ({ ...r, key: listingKey(r.key) }));
  render();
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.shortlist || changes.settings) load();
});
await loadSheet();
await load();
$('sheet').focus();
