// Small building blocks shared by every screen: badges, form fields,
// segmented controls, sliders, page headers, stat tiles, toasts.

import { $, el, svgEl } from "../dom.js";
import { fmt, levelClass } from "../format.js";

export const badge = (text, cls = "") => el("span", { class: `badge ${cls}` }, text);
export const chip = (text, cls = "") => el("span", { class: `chip ${cls}` }, text);
export const levelBadge = (level) => badge(level, levelClass(level));
export const swatch = (color) => el("i", { class: "swatch", style: { background: color } });

export function toast(message, kind = "ok") {
  const node = el("div", { class: `toast ${kind}`, role: "status" }, message);
  $("#toasts").append(node);
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 300);
  }, 3800);
}

export function field(label, control, hint, cls = "") {
  return el("label", { class: `field ${cls}` },
    el("span", { class: "field-label" }, label),
    control,
    hint ? el("span", { class: "hint" }, hint) : null);
}

/** <select> from [[value, text], ...]; `placeholder` adds an empty first option. */
export function selectInput(name, options, { value, placeholder } = {}) {
  const node = el("select", { name },
    placeholder !== undefined ? el("option", { value: "" }, placeholder) : null,
    options.map(([optionValue, text]) => el("option", { value: optionValue }, text)));
  if (value !== undefined && value !== null) node.value = String(value);
  return node;
}

/** A row of toggle buttons where exactly one is selected. */
export function segmented(options, value, onChange, label, { mini = false } = {}) {
  const wrap = el("div", { class: `segmented${mini ? " mini" : ""}`, role: "radiogroup", "aria-label": label });
  const buttons = options.map(([optionValue, text]) => el("button", {
    type: "button",
    role: "radio",
    "aria-checked": String(String(optionValue) === String(value)),
    "data-value": optionValue,
    onclick: () => {
      buttons.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === String(optionValue))));
      onChange(String(optionValue));
    },
  }, text));
  wrap.append(...buttons);
  return wrap;
}

export function rangeInput(name, { min, max, step, value, unit, onInput }) {
  const output = el("output", {}, `${value}${unit}`);
  const input = el("input", { type: "range", name, min, max, step, value, "aria-label": name });
  input.addEventListener("input", () => {
    output.textContent = `${input.value}${unit}`;
    onInput(input.value);
  });
  return el("div", { class: "range-field" }, input, output);
}

/** Page title, description, SQL technique tags, and action buttons. */
export function viewHeader(title, description, sqlTags = [], actions = []) {
  return el("header", { class: "view-header" },
    el("div", {},
      el("h1", {}, title),
      el("p", { class: "muted" }, description),
      sqlTags.length ? el("div", { class: "chips" }, sqlTags.map((tag) => chip(tag, "sql"))) : null),
    el("div", { class: "view-actions" }, actions));
}

export const stat = (label, value) =>
  el("div", { class: "stat" }, el("div", { class: "label" }, label), el("div", { class: "value" }, fmt(value)));

export const ringIcon = (dashed) =>
  svgEl("svg", { width: 18, height: 18, viewBox: "0 0 18 18" },
    svgEl("circle", { cx: 9, cy: 9, r: 7, fill: "none", stroke: "currentColor", "stroke-width": 2,
                      "stroke-dasharray": dashed ? "2 2" : null }));

export const errorBox = () => el("div", { class: "form-error", role: "alert", hidden: true });
