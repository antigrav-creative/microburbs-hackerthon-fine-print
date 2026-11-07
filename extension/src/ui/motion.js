// Small motion helpers shared by the overview and the cards. Vanilla, no deps.
// Everything is a no-op without a browser (node tests) or with reduced motion on.

export const reducedMotion = () => typeof matchMedia !== 'function' || matchMedia('(prefers-reduced-motion: reduce)').matches;

const NUM = /^([^\d]*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s;

/**
 * Numbers settling: the text's number eases up from ~80% to its final value.
 * "$852K" → "$682K" … "$852K". Keeps prefix/suffix, decimals and thousands commas.
 * Final text is set immediately for anything that reads the DOM, then animated.
 */
export function settle(node, { from = 0.8, ms = 650, delay = 0, ease: curve = 'out' } = {}) {
  const text = node?.textContent ?? '';
  const m = text.match(NUM);
  if (!m || typeof requestAnimationFrame !== 'function' || reducedMotion()) return;
  const [, pre, digits, post] = m;
  const target = Number(digits.replace(/,/g, ''));
  if (!Number.isFinite(target) || target === 0) return;
  const decimals = (digits.split('.')[1] ?? '').length;
  const commas = digits.includes(',');
  const fmt = (v) => {
    const s = v.toFixed(decimals);
    return commas ? Number(s).toLocaleString('en-AU', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : s;
  };
  const start = performance.now() + delay;
  const ease = typeof curve === 'function' ? curve : curve === 'inOut' ? (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2) : (t) => 1 - (1 - t) ** 3;
  node.textContent = pre + fmt(target * from) + post;
  const step = (now) => {
    const t = Math.max(0, Math.min(1, (now - start) / ms));
    node.textContent = pre + fmt(target * (from + (1 - from) * ease(t))) + post;
    if (t < 1) requestAnimationFrame(step);
    else node.textContent = text;
  };
  requestAnimationFrame(step);
}
