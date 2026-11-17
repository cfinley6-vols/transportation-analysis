// Observations screen: browse readings with filters and sorting done in SQL,
// then record (INSERT), correct (UPDATE), or delete (DELETE) them.

import { get } from "../api.js";
import { errorBox, field, selectInput, viewHeader } from "../components/controls.js";
import { clearFormError, formValues, showFormError } from "../components/dialog.js";
import { table } from "../components/table.js";
import { debounce, el } from "../dom.js";
import { notifyDataChanged } from "../events.js";
import { openAddObservation, openDeleteObservation, openEditObservation } from "../forms.js";
import { intersectionOptions, state } from "../state.js";

const ROW_LIMITS = [10, 25, 50, 100, 500].map((n) => [n, `${n} rows`]);

export async function render(main) {
  const filter = state.observationFilter;
  const results = el("div", {});
  const errors = errorBox();

  const form = el("form", { class: "filters", novalidate: true },
    field("Intersection", selectInput("intersection", intersectionOptions(), { value: filter.intersection, placeholder: "All intersections" })),
    field("From", el("input", { type: "date", name: "start", value: filter.start || "" })),
    field("To", el("input", { type: "date", name: "end", value: filter.end || "" })),
    field("Min vehicles", el("input", { type: "number", name: "min_volume", min: 0, value: filter.min_volume || "", style: { width: "110px" } })),
    field("Sort by", selectInput("sort", state.meta.sorts.map((s) => [s.key, s.label]), { value: filter.sort || "date" })),
    field("Show", selectInput("limit", ROW_LIMITS, { value: filter.limit || 25 })),
    el("button", { type: "button", class: "btn ghost", onclick: () => { state.observationFilter = {}; notifyDataChanged(); } }, "Reset"));

  async function load() {
    clearFormError(form);
    state.observationFilter = formValues(form);
    try {
      const rows = await get("/api/observations", state.observationFilter);
      results.replaceChildren(table(rows, {
        empty: "No observations match those filters.",
        actions: (row) => [
          el("button", { class: "btn small", onclick: () => openEditObservation(row) }, "Edit"),
          el("button", { class: "btn small", onclick: () => openDeleteObservation(row) }, "Delete"),
        ],
      }));
    } catch (err) {
      showFormError(form, errors, err);
    }
  }

  form.addEventListener("input", debounce(load, 300));
  form.addEventListener("change", debounce(load, 50));
  form.addEventListener("submit", (e) => { e.preventDefault(); load(); });

  main.replaceChildren(
    viewHeader("Traffic observations",
      "Browse recorded readings. Filtering and sorting happen in the database; correct or delete a reading from its row.",
      ["WHERE … = ?", "ORDER BY", "LIMIT ?", "INSERT", "UPDATE", "DELETE"],
      [el("button", { class: "btn primary", onclick: () => openAddObservation({ intersectionId: form.intersection.value }) },
        "+ Record observation")]),
    el("section", { class: "card" }, form, errors, results));
  await load();
}
