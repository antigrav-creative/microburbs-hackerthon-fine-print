import { useState } from 'react';

const HOLD = [3, 5, 10, 15];
const YIELD_MIN = 3;
const YIELD_MAX = 6;
// Illustrative City of Sydney unit yield from design A — wire to market/yield-pct when live.
const CITY_YIELD = 4.4;
const num = (s) => Number(String(s ?? '').replace(/[^\d.]/g, '')) || 0;
const commas = (n) => (n ? Math.round(n).toLocaleString('en-AU') : '');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const pct = (v) => ((v - YIELD_MIN) / (YIELD_MAX - YIELD_MIN)) * 100;

/** Onboarding (design A): the investor brief every listing is scored against. */
export default function Setup({ brief, onSave }) {
  const [budget, setBudget] = useState(commas(brief?.budget));
  const [deposit, setDeposit] = useState(commas(brief?.deposit));
  const [minYield, setMinYield] = useState(brief?.minYield ?? 4);
  const [hold, setHold] = useState(HOLD.includes(brief?.holdYears) ? brief.holdYears : 10);
  const b = num(budget);
  const d = num(deposit);
  const valid = b > 0 && d > 0 && d < b;
  const editing = Boolean(brief && (brief.budget || brief.deposit));
  const depositPct = b && d ? Math.round((d / b) * 100) : null;
  const yPct = pct(Number(minYield));
  const cityPct = pct(CITY_YIELD);
  const nowLeft = clamp(yPct, 7, 93);
  const showCity = Math.abs(nowLeft - cityPct) >= 12; // don't collide with the value label
  const save = () => valid && onSave({ budget: b, deposit: d, minYield: Number(minYield), holdYears: hold });
  return (
    <form
      className="setup flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h2 className="setup-title">Set your brief.</h2>
      <p className="text-muted">Every listing you open gets scored against it. Four inputs, once.</p>
      <div className="setup-row">
        <label>
          Budget
          <span className="field">
            <span className="field-pre" aria-hidden="true">
              $
            </span>
            <input
              className="field-input"
              inputMode="numeric"
              autoComplete="off"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              onBlur={() => setBudget(commas(num(budget)))}
            />
          </span>
        </label>
        <label>
          Deposit
          <span className="field">
            <span className="field-pre" aria-hidden="true">
              $
            </span>
            <input
              className="field-input"
              inputMode="numeric"
              autoComplete="off"
              value={deposit}
              onChange={(e) => setDeposit(e.target.value)}
              onBlur={() => setDeposit(commas(num(deposit)))}
            />
            {depositPct !== null && <span className="field-post">{depositPct}%</span>}
          </span>
        </label>
      </div>
      <label className="setup-yield">
        <span className="setup-yield-row">
          <span className="setup-yield-name">Min gross yield</span>
          <strong className="setup-yield-value">{Number(minYield).toFixed(1)}%</strong>
        </span>
        <span className="ticks">
          <span className="ticks-strip" aria-hidden="true">
            <span className="ticks-fill" style={{ width: `${yPct}%` }} />
          </span>
          <input
            type="range"
            min={YIELD_MIN}
            max={YIELD_MAX}
            step="0.1"
            value={minYield}
            onChange={(e) => setMinYield(Number(e.target.value))}
          />
        </span>
        <span className="setup-scale" aria-hidden="true">
          <span>{YIELD_MIN.toFixed(1)}%</span>
          <span className="setup-scale-now" style={{ left: `${nowLeft}%` }}>
            {Number(minYield).toFixed(1)}%
          </span>
          {showCity && (
            <span className="setup-scale-city" style={{ left: `${Math.max(cityPct, nowLeft + 12)}%` }}>
              ▲ city {CITY_YIELD.toFixed(1)}%
            </span>
          )}
          <span>{YIELD_MAX.toFixed(1)}%</span>
        </span>
      </label>
      <div className="setup-label" id="setup-hold">
        Hold period
      </div>
      <div className="segmented" role="radiogroup" aria-labelledby="setup-hold">
        {HOLD.map((y) => (
          <button
            type="button"
            key={y}
            role="radio"
            aria-checked={y === hold}
            className={y === hold ? 'on' : ''}
            onClick={() => setHold(y)}
          >
            {y === 15 ? '15y+' : `${y}y`}
          </button>
        ))}
      </div>
      <button className="primary" type="submit" disabled={!valid}>
        {editing ? 'Save brief' : 'Read this listing'}
        <span className="primary-key" aria-hidden="true">
          ⏎
        </span>
      </button>
      {!valid && <p className="setup-hint text-muted">Enter a budget and a smaller deposit to continue.</p>}
      <p className="setup-foot text-muted">Stored locally · data by Microburbs · not financial advice</p>
    </form>
  );
}
