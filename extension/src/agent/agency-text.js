// Plain-English wording for an agency's quoting record — correct whether it sells
// OVER or UNDER its quotes (a negative median means sales land below the quote).
// One place, so the overview legend, tooltips, QUOTE row and offer card agree.

const pct = (n) => `${Math.round(Math.abs(Number(n)) * 10) / 10}%`.replace('.0%', '%');

/** Short label for the legend: "sells 10% over quote" / "sells 1.4% under quote" / "sells at quote". */
export function agencyShort(a) {
  if (!a) return null;
  const m = Number(a.median_over_quote_pct);
  if (!Number.isFinite(m) || Math.abs(m) < 0.5) return 'agency sells at quote';
  return `agency sells ${pct(m)} ${m > 0 ? 'over' : 'under'} quote`;
}

/** One sentence: "36% of Morton's 11 recent sales went over quote; the typical sale was 1.4% under it." */
export function agencySentence(a) {
  if (!a) return null;
  const over = Math.round(Number(a.underquote_rate_pct));
  const m = Number(a.median_over_quote_pct);
  const typical = !Number.isFinite(m) || Math.abs(m) < 0.5 ? 'the typical sale landed at the quote' : `the typical sale was ${pct(m)} ${m > 0 ? 'over' : 'under'} it`;
  const sales = Number(a.sales);
  return `${over}% of ${a.name}'s ${sales} recent ${sales === 1 ? 'sale' : 'sales'} went over the quoted price; ${typical}.`;
}
