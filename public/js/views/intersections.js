// Intersections screen: search (browse) and the profile of one intersection
// (related data from routes, pathways, observations, and time blocks).

import { get } from "../api.js";
import { field, selectInput, toast, viewHeader } from "../components/controls.js";
import { clearFormError, formValues } from "../components/dialog.js";
import { table } from "../components/table.js";
import { debounce, el } from "../dom.js";
import { openAddIntersection } from "../forms.js";
import { intersectionPanel } from "../panels.js";
import { state } from "../state.js";

export async function render(main) {
  const results = el("div", {});
  const panel = el("aside", { class: "card sticky" }, el("p", { class: "muted" }, "Select an intersection to see its profile."));
  let selectedId;

  const form = el("form", { class: "filters", novalidate: true },
    field("Street contains", el("input", { name: "street", placeholder: "e.g. Main", maxlength: 60 })),
    field("Neighborhood contains", el("input", { name: "neighborhood", placeholder: "e.g. Down", maxlength: 60 })),
    field("Control type", selectInput("control", state.meta.control_types.map((c) => [c, c]), { placeholder: "Any" })));

  async function search() {
    clearFormError(form);
    try {
      const rows = await get("/api/intersections", formValues(form));
      results.replaceChildren(table(rows, {
        selectedId,
        onRowClick: (row) => showProfile(row.ID),
        empty: "No intersections match those filters.",
      }));
    } catch (err) {
      results.replaceChildren(el("div", { class: "form-error" }, err.message));
    }
  }

  async function showProfile(id) {
    selectedId = id;
    results.querySelectorAll("tbody tr").forEach((tr) => tr.classList.toggle("selected", tr.dataset.id === String(id)));
    try {
      panel.replaceChildren(await intersectionPanel(id));
    } catch (err) {
      toast(err.message, "error");
    }
  }

  form.addEventListener("input", debounce(search));
  form.addEventListener("submit", (e) => { e.preventDefault(); search(); });

  main.replaceChildren(
    viewHeader("Intersections",
      "Search by street, neighborhood, or control type. Select a row to see the routes that pass through it and its traffic by time of day.",
      ["WHERE … LIKE ?", "ORDER BY", "JOIN", "GROUP BY"],
      [el("button", { class: "btn primary", onclick: openAddIntersection }, "+ Add intersection")]),
    el("div", { class: "split" }, el("section", { class: "card" }, form, results), panel));
  await search();
}
