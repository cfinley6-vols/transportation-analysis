// Small DOM helpers. Text is always set with textContent, so database values
// can never inject HTML into the page.

export const $ = (selector, root = document) => root.querySelector(selector);

function setAttributes(node, attrs) {
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "style" && typeof value === "object") {
      for (const [prop, v] of Object.entries(value)) {
        if (prop.startsWith("--")) node.style.setProperty(prop, v); // CSS custom property
        else node.style[prop] = v;
      }
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2), value);
    } else {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
}

function appendChildren(node, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : String(child));
  }
}

/** Create an HTML element: el("button", { class: "btn", onclick }, "Save"). */
export function el(tag, attrs, ...children) {
  const node = document.createElement(tag);
  setAttributes(node, attrs);
  appendChildren(node, children);
  return node;
}

/** Create an SVG element. */
export function svgEl(tag, attrs, ...children) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  setAttributes(node, attrs);
  appendChildren(node, children);
  return node;
}

export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
