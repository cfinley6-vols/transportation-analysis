// Modal form dialog plus helpers for showing server validation errors on
// a form. The server is the authority on validation: when it rejects input,
// its message is shown and the named field is highlighted.

import { $, el } from "../dom.js";
import { fmt } from "../format.js";
import { errorBox } from "./controls.js";

export const formValues = (form) => Object.fromEntries(new FormData(form).entries());

export function showFormError(form, box, err) {
  box.textContent = err.message || "Something went wrong.";
  box.hidden = false;
  if (err.field) {
    const target = form.querySelector(`[name="${err.field}"], [data-field="${err.field}"]`);
    if (target) {
      target.setAttribute("aria-invalid", "true");
      target.focus?.();
    }
  }
}

export function clearFormError(form) {
  form.querySelectorAll("[aria-invalid]").forEach((node) => node.removeAttribute("aria-invalid"));
  form.querySelectorAll(".form-error").forEach((node) => { node.hidden = true; });
}

/** Label/value list used to show a record before editing or deleting it. */
export const recordList = (pairs) =>
  el("dl", { class: "record" }, pairs.map(([key, value]) => [el("dt", {}, key), el("dd", {}, fmt(value))]));

/**
 * Open a modal form. `onSubmit(form)` may throw; the error is shown and the
 * dialog stays open so the user can fix the input.
 */
export function openDialog({ title, body, submitLabel = "Save", danger = false, onSubmit }) {
  const dialog = $("#dialog");
  const errors = errorBox();
  const submit = el("button", { type: "submit", class: `btn ${danger ? "danger" : "primary"}` }, submitLabel);
  const close = () => dialog.close();

  const form = el("form", { class: "dialog-form", novalidate: true },
    el("header", {},
      el("h2", {}, title),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Close", onclick: close }, "×")),
    el("div", { class: "dialog-body" }, body),
    errors,
    el("footer", {},
      el("button", { type: "button", class: "btn ghost", onclick: close }, "Cancel"),
      submit));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearFormError(form);
    submit.disabled = true;
    try {
      await onSubmit(form);
      close();
    } catch (err) {
      showFormError(form, errors, err);
    } finally {
      submit.disabled = false;
    }
  });

  dialog.replaceChildren(form);
  dialog.showModal();
  form.querySelector(".dialog-body input, .dialog-body select")?.focus();
}
