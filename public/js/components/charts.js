// Bar charts and legends. Charts only draw values the database already
// computed; they do no aggregation of their own.

import { el } from "../dom.js";
import { LEVELS, LOS_LIMITS, fmt, levelClass, levelColor, levelFor } from "../format.js";

/**
 * Horizontal bar chart.
 * label/sub/value/display/color are functions of a row; `ticks` draws faint
 * reference lines (e.g. the 30/60/90 s congestion thresholds).
 */
export function barChart(rows, {
  label, sub, value, display, color, max, ticks = [], compact = false, empty = "Nothing to chart.",
}) {
  if (!rows.length) return el("div", { class: "empty" }, empty);
  const values = rows.map(value);
  const top = max ?? Math.max(1, ...values.filter((v) => v !== null && v !== undefined));

  return el("div", { class: `bars${compact ? " compact" : ""}` }, rows.map((row, i) => {
    const v = values[i];
    const width = v === null || v === undefined ? 0 : Math.max(1.5, (100 * v) / top);
    return el("div", { class: "bar-row" },
      el("div", { class: "bar-label" },
        el("span", { title: label(row) }, label(row)),
        sub ? el("span", { class: "muted small" }, sub(row)) : null),
      el("div", { class: "bar-track" },
        ticks.map((t) => el("i", { class: "tick", style: { left: `${(100 * t) / top}%` } })),
        el("div", { class: "bar-fill", style: { width: `${width}%`, background: color ? color(row) : "var(--accent)" } })),
      el("div", { class: "bar-value" }, display ? display(row) : fmt(v)));
  }));
}

/** Bars of average wait, colored by congestion level, with threshold ticks. */
export function waitChart(rows, { label, sub, empty, compact = false }) {
  return barChart(rows, {
    label, sub, compact, empty,
    value: (r) => r.AvgWaitSec,
    max: Math.max(40, ...rows.map((r) => (r.AvgWaitSec || 0) * 1.1)),
    ticks: LOS_LIMITS,
    color: (r) => levelColor(levelFor(r.AvgWaitSec)),
    display: (r) => (r.AvgWaitSec === null ? "—" : `${fmt(r.AvgWaitSec)} s`),
  });
}

export function levelLegend() {
  return el("div", { class: "legend" },
    LEVELS.map((level) => el("span", {}, el("i", { class: `dot ${levelClass(level)}` }), level)));
}
