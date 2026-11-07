// Spreadsheet engine for the shortlist: safe formulas + column filters. Pure (no DOM),
// so it's tested in node. Formulas NEVER use eval — a tiny tokenizer + precedence parser
// over numbers, column ids, + − × ÷ ^, parentheses, and a few functions.
//   rent * 52 / my_offer * 100        → yield at your offer
//   weekly_cost * 52                  → yearly holding cost
//   round(price / 1000)               → price in $K
//   min(asking, likely), max(a, b), abs(x), if(cond, a, b)

const FUNCS = {
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  abs: (x) => Math.abs(x),
  if: (c, a, b) => (c ? a : b),
};

function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(>=|<=|==|!=|[-+*/^(),<>]))/y;
  let m;
  let i = 0;
  while (i < src.length) {
    re.lastIndex = i;
    m = re.exec(src);
    if (!m || m.index !== i) {
      if (/^\s*$/.test(src.slice(i))) break;
      throw new Error(`unexpected "${src.slice(i).trim()[0]}"`);
    }
    i = re.lastIndex;
    if (m[1] != null) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2] != null) out.push({ t: 'id', v: m[2].toLowerCase() });
    else if (m[3] != null) out.push({ t: 'op', v: m[3] });
  }
  return out;
}

/** Parse once → a function (row) => number | null. Throws a readable error on bad syntax. */
export function compileFormula(src) {
  const toks = tokenize(String(src ?? ''));
  let p = 0;
  const peek = () => toks[p];
  const take = (v) => {
    const t = toks[p];
    if (!t || (v && t.v !== v)) throw new Error(v ? `expected "${v}"` : 'formula ends too early');
    p++;
    return t;
  };
  // precedence: comparison < + − < × ÷ < ^ < unary
  const cmp = () => {
    let l = add();
    while (peek()?.t === 'op' && ['>', '<', '>=', '<=', '==', '!='].includes(peek().v)) {
      const op = take().v;
      const r = add();
      const a = l;
      l = (row) => {
        const x = a(row);
        const y = r(row);
        if (x == null || y == null) return null;
        return { '>': x > y, '<': x < y, '>=': x >= y, '<=': x <= y, '==': x === y, '!=': x !== y }[op] ? 1 : 0;
      };
    }
    return l;
  };
  const add = () => {
    let l = mul();
    while (peek()?.t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = take().v;
      const r = mul();
      const a = l;
      l = (row) => {
        const x = a(row);
        const y = r(row);
        return x == null || y == null ? null : op === '+' ? x + y : x - y;
      };
    }
    return l;
  };
  const mul = () => {
    let l = pow();
    while (peek()?.t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = take().v;
      const r = pow();
      const a = l;
      l = (row) => {
        const x = a(row);
        const y = r(row);
        if (x == null || y == null) return null;
        if (op === '/' && y === 0) return null;
        return op === '*' ? x * y : x / y;
      };
    }
    return l;
  };
  const pow = () => {
    const b = unary();
    if (peek()?.v === '^') {
      take('^');
      const e = pow();
      return (row) => {
        const x = b(row);
        const y = e(row);
        return x == null || y == null ? null : x ** y;
      };
    }
    return b;
  };
  const unary = () => {
    if (peek()?.v === '-') {
      take('-');
      const u = unary();
      return (row) => {
        const x = u(row);
        return x == null ? null : -x;
      };
    }
    return atom();
  };
  const atom = () => {
    const t = peek();
    if (!t) throw new Error('formula ends too early');
    if (t.t === 'num') {
      p++;
      return () => t.v;
    }
    if (t.v === '(') {
      take('(');
      const e = cmp();
      take(')');
      return e;
    }
    if (t.t === 'id') {
      p++;
      if (peek()?.v === '(') {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`unknown function "${t.v}"`);
        take('(');
        const args = [];
        if (peek()?.v !== ')') {
          args.push(cmp());
          while (peek()?.v === ',') {
            take(',');
            args.push(cmp());
          }
        }
        take(')');
        return (row) => {
          const vals = args.map((a) => a(row));
          if (t.v !== 'if' && vals.some((v) => v == null)) return null;
          const out = fn(...vals);
          return Number.isFinite(out) ? out : null;
        };
      }
      return (row) => {
        const v = row[t.v];
        if (v == null || v === '') return null;
        const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,%\s]/g, ''));
        return Number.isFinite(n) ? n : null;
      };
    }
    throw new Error(`unexpected "${t.v}"`);
  };
  const fn = cmp();
  if (p < toks.length) throw new Error(`unexpected "${toks[p].v}"`);
  return fn;
}

/** Column ids a formula refers to (to flag unknown names in the editor). */
export function formulaRefs(src) {
  return [...new Set(tokenize(String(src ?? '')).filter((t, i, a) => t.t === 'id' && a[i + 1]?.v !== '(').map((t) => t.v))];
}

/**
 * A column filter typed into the filter row: ">800000", "<= 4.5", "800k-900k", "!btr",
 * or plain text (contains, case-insensitive). Returns (value) => boolean.
 */
export function compileFilter(src) {
  const s = String(src ?? '').trim();
  if (!s) return () => true;
  const num = (x) => {
    const m = String(x).trim().toLowerCase().match(/^\$?(-?\d+(?:\.\d+)?)\s*(k|m)?%?$/);
    if (!m) return null;
    return Number(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'm' ? 1e6 : 1);
  };
  const range = s.match(/^(.+?)\s*(?:-|–|to)\s*(.+)$/);
  if (range && num(range[1]) != null && num(range[2]) != null) {
    const [lo, hi] = [num(range[1]), num(range[2])];
    return (v) => v != null && v !== '' && Number(v) >= lo && Number(v) <= hi;
  }
  const cmp = s.match(/^(>=|<=|>|<|=|!=)\s*(.+)$/);
  if (cmp && num(cmp[2]) != null) {
    const n = num(cmp[2]);
    return (v) => {
      if (v == null || v === '') return false;
      const x = Number(v);
      return { '>': x > n, '<': x < n, '>=': x >= n, '<=': x <= n, '=': x === n, '!=': x !== n }[cmp[1]];
    };
  }
  if (s.startsWith('!')) {
    const needle = s.slice(1).toLowerCase();
    return (v) => !String(v ?? '').toLowerCase().includes(needle);
  }
  const needle = s.toLowerCase();
  return (v) => String(v ?? '').toLowerCase().includes(needle);
}

/** Rows → CSV (RFC 4180 quoting). */
export function toCsv(columns, rows, valueOf) {
  const q = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => q(c.label)).join(','), ...rows.map((r) => columns.map((c) => q(valueOf(r, c))).join(','))].join('\n');
}
