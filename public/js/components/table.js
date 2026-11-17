// Render SQL result rows as a table. Column order follows the SELECT list
// unless `columns` is given.

import { el } from "../dom.js";
import { LABELS, fmt, levelClass, levelFor } from "../format.js";
import { badge } from "./controls.js";

/** How one cell is shown: badges for categories, a colored dot for wait times. */
function renderCell(column, value) {
  if (column === "Level") return badge(value, levelClass(value));
  if (column === "StopType" || column === "RouteA" || column === "RouteB") {
    return badge(value, value === "Stop" ? "stop" : "pass");
  }
  if (column === "CanTransfer") return badge(value, value === "Yes" ? "yes" : "no");
  if (column === "AvgWaitSec" && value !== null) {
    return el("span", { class: "wait" }, el("i", { class: `dot ${levelClass(levelFor(value))}` }), fmt(value));
  }
  return fmt(value);
}

export function table(rows, {
  columns, labels = {}, actions, onRowClick, selectedId, empty = "No matching records found.",
} = {}) {
  if (!rows.length) return el("div", { class: "empty" }, empty);

  const cols = columns || Object.keys(rows[0]);
  const numeric = cols.map((c) => rows.every((row) => row[c] === null || typeof row[c] === "number"));
  const numClass = (i) => (numeric[i] ? "num" : "");

  const header = el("tr", {},
    cols.map((c, i) => el("th", { class: numClass(i), scope: "col" }, labels[c] || LABELS[c] || c)),
    actions ? el("th", { class: "actions-col" }) : null);

  const body = rows.map((row) => {
    const classes = [onRowClick && "clickable", selectedId !== undefined && row.ID === selectedId && "selected"];
    const tr = el("tr", { class: classes.filter(Boolean).join(" "), tabindex: onRowClick ? 0 : null, "data-id": row.ID },
      cols.map((c, i) => el("td", { class: numClass(i) }, renderCell(c, row[c]))),
      actions ? el("td", { class: "actions-col" }, actions(row)) : null);
    if (onRowClick) {
      tr.addEventListener("click", (e) => { if (!e.target.closest("button")) onRowClick(row); });
      tr.addEventListener("keydown", (e) => { if (e.key === "Enter") onRowClick(row); });
    }
    return tr;
  });

  return el("div", {},
    el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, header), el("tbody", {}, body))),
    el("div", { class: "row-count" }, `${rows.length} row${rows.length === 1 ? "" : "s"}`));
}
