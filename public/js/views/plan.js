// Plan a route screen: build a new route by clicking intersections on the
// map. The server saves the route and all its pathway rows in ONE transaction.

import { get, post } from "../api.js";
import { errorBox, field, segmented, selectInput, toast, viewHeader } from "../components/controls.js";
import { clearFormError, formValues, showFormError } from "../components/dialog.js";
import { el } from "../dom.js";
import { notifyDataChanged } from "../events.js";
import { NetworkMap } from "../map/network-map.js";
import { emptyDraft, intersectionOptions, loadReferenceData, state } from "../state.js";

const TRANSIT_TYPES = ["Bus", "Light Rail", "Streetcar", "Van", "Subway"];

export async function render(main) {
  const network = await get("/api/network");
  const draft = state.draftRoute;
  const names = new Map(network.intersections.map((n) => [n.ID, n.Name]));
  draft.stops = draft.stops.filter((stop) => names.has(stop.id)); // drop intersections deleted meanwhile

  const host = el("div", { class: "map-host" });
  const map = new NetworkMap(host, {
    picking: true,
    label: "Pick intersections for the new route",
    onNodeClick: (n) => toggleStop(n.ID),
  });
  const stopList = el("ol", { class: "path-list", "data-field": "stops" });
  const errors = errorBox();
  const addSelect = selectInput("add", intersectionOptions(), { placeholder: "Add an intersection…" });

  // ---- Editing the draft (kept in page state until launched) ----
  function toggleStop(id) {
    const index = draft.stops.findIndex((stop) => stop.id === id);
    if (index >= 0) draft.stops.splice(index, 1);
    else draft.stops.push({ id, stop: true });
    redraw();
  }

  function moveStop(index, delta) {
    const [stop] = draft.stops.splice(index, 1);
    draft.stops.splice(index + delta, 0, stop);
    redraw();
  }

  function stopRow(stop, index) {
    const last = draft.stops.length - 1;
    return el("li", {},
      el("span", { class: "seq" }, index + 1),
      el("span", { class: "name", title: names.get(stop.id) }, names.get(stop.id)),
      segmented([["1", "Stop"], ["0", "Pass"]], stop.stop ? "1" : "0", (v) => { stop.stop = v === "1"; },
        "Stop type", { mini: true }),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Move up", disabled: index === 0, onclick: () => moveStop(index, -1) }, "↑"),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Move down", disabled: index === last, onclick: () => moveStop(index, 1) }, "↓"),
      el("button", { type: "button", class: "icon-btn", "aria-label": "Remove", onclick: () => toggleStop(stop.id) }, "×"));
  }

  function redraw() {
    map.set({ draft: draft.stops });
    stopList.removeAttribute("aria-invalid");
    stopList.replaceChildren(...(draft.stops.length
      ? draft.stops.map(stopRow)
      : [el("li", { class: "muted" }, "Click intersections on the map, or add them below, in travel order.")]));
  }

  function addFromDropdown() {
    const id = Number(addSelect.value);
    if (!id) return;
    if (draft.stops.some((stop) => stop.id === id)) toast("That intersection is already on this route.", "error");
    else toggleStop(id);
    addSelect.value = "";
  }

  // ---- Form ----
  const form = el("form", { novalidate: true },
    el("div", { class: "form-grid" },
      field("Route name", el("input", { name: "name", value: draft.name, maxlength: 60, autocomplete: "off", placeholder: "e.g. Green Line Crosstown" }), null, "full"),
      field("Transit type", el("input", { name: "type", value: draft.type, maxlength: 30, list: "transit-types", placeholder: "Bus" })),
      field("Daily capacity (riders)", el("input", { type: "number", name: "capacity", value: draft.capacity, min: 1, max: state.meta.limits.capacity }))),
    el("datalist", { id: "transit-types" }, TRANSIT_TYPES.map((type) => el("option", { value: type }))),
    el("h3", {}, "Path in travel order"),
    stopList,
    el("div", { class: "add-stop" }, addSelect, el("button", { type: "button", class: "btn", onclick: addFromDropdown }, "Add")),
    errors,
    el("div", { class: "panel-actions" },
      el("button", { type: "submit", class: "btn primary" }, "Launch route"),
      el("button", { type: "button", class: "btn ghost", onclick: () => { state.draftRoute = emptyDraft(); notifyDataChanged(); } }, "Clear")),
    el("p", { class: "muted small", style: { marginTop: "12px" } },
      "The route and all of its pathway rows are inserted in a single transaction: if any part fails, nothing is saved."));

  // Remember typed values if the user switches screens before launching.
  form.addEventListener("input", (e) => {
    if (["name", "type", "capacity"].includes(e.target.name)) draft[e.target.name] = e.target.value;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearFormError(form);
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      const { name, type, capacity } = formValues(form);
      const result = await post("/api/routes", { name, type, capacity, stops: draft.stops });
      toast(result.message);
      state.draftRoute = emptyDraft();
      state.selectedRouteId = result.route_id;
      await loadReferenceData();
      location.hash = "#routes";
    } catch (err) {
      showFormError(form, errors, err);
    } finally {
      button.disabled = false;
    }
  });

  main.replaceChildren(
    viewHeader("Plan a new route",
      "Name the route, then pick its intersections in travel order and mark which ones have a passenger stop.",
      ["BEGIN", "INSERT TRANSIT_ROUTES", "INSERT ROUTE_PATHWAYS ×n", "COMMIT / ROLLBACK"]),
    el("div", { class: "split wide-left" },
      el("section", { class: "card map-card" }, host,
        el("div", { class: "map-hint" }, "Click an intersection to add it to the end of the route; click again to remove it.")),
      el("section", { class: "card" }, form)));

  map.setData(network);
  redraw();
}
