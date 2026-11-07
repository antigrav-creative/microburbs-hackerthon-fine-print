// Onboarding (design A) helpers: the min-yield tick strip that sits under an invisible
// range input. Shared by panel.js and dev/preview.js.

/** Draw the ticks + scale for the yield range input (reads min/max/step/value from it). */
export function paintYieldTicks(input, ticks, scale) {
  const min = Number(input.min);
  const max = Number(input.max);
  const step = (Number(input.step) || 0.1) / 2; // two ticks per input step: a denser instrument
  const value = Number(input.value);
  const n = Math.round((max - min) / step) + 1;
  if (ticks.childElementCount !== n) {
    ticks.replaceChildren();
    for (let i = 0; i < n; i++) {
      const t = document.createElement('i');
      t.className = 'tick';
      const v = min + i * step;
      if (Math.abs(v - Math.round(v)) < step / 2) t.classList.add('major');
      else if (Math.abs(v * 2 - Math.round(v * 2)) < step) t.classList.add('half');
      ticks.append(t);
    }
  }
  const at = Math.round((value - min) / step);
  [...ticks.children].forEach((t, i) => {
    t.classList.toggle('on', i < at);
    t.classList.toggle('at', i === at);
  });
  if (scale) {
    let cur = scale.querySelector('.cur-label');
    if (!cur) {
      const lo = document.createElement('span');
      lo.className = 'lo';
      lo.textContent = `${min.toFixed(1)}%`;
      const hi = document.createElement('span');
      hi.className = 'hi';
      hi.textContent = `${max.toFixed(1)}%`;
      cur = document.createElement('span');
      cur.className = 'cur-label';
      scale.replaceChildren(lo, cur, hi);
    }
    const pct = ((value - min) / (max - min || 1)) * 100;
    cur.textContent = `${value.toFixed(1)}%`;
    cur.style.left = `${Math.max(9, Math.min(91, pct))}%`; // never under the end labels
  }
}
