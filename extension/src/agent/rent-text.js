// A RENT listing's price ("$750 per week", "$1,200 pw", "$650/wk", "$700 weekly") → the
// weekly rent, or null. Only a price with an explicit weekly marker counts, so a sale
// price ("$850,000") never reads as rent.

const WEEKLY = /\$\s?(\d{1,2},\d{3}|\d{2,5})(?:\.\d{1,2})?\s*(?:per\s*week|p\.?\s?w\.?|\/\s?w(?:ee)?k?|weekly|a\s+week|wk)(?![a-z])/i;

export function parseWeeklyRent(text) {
  const t = String(text ?? '');
  const m = t.match(WEEKLY);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!(n >= 100 && n <= 20000)) return null;
  return { weekly: n, text: t.trim().slice(0, 80) };
}
