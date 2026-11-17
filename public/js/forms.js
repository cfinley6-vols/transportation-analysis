// Dialogs that change data: add (INSERT), correct (UPDATE), delete (DELETE).
// Each sends the form to the API; the server validates and runs the SQL.
// After a successful change, every screen is told to refresh.

import { del, post, put } from "./api.js";
import { field, selectInput, swatch, toast } from "./components/controls.js";
import { formValues, openDialog, recordList } from "./components/dialog.js";
import { el } from "./dom.js";
import { notifyDataChanged } from "./events.js";
import { todayIso } from "./format.js";
import { emptyDraft, intersectionOptions, loadReferenceData, routeColor, state, timeBlockOptions } from "./state.js";

const numberInput = (name, { value, min, max }) =>
  el("input", { type: "number", name, value, min, max, inputmode: "numeric" });

const rangeHint = (min, max) => `${min.toLocaleString()} – ${max.toLocaleString()}`;

/** Show the server's message, reload dropdown data, and redraw the screen. */
async function afterChange(result, { reloadReference = false } = {}) {
  toast(result.message);
  if (reloadReference) await loadReferenceData();
  notifyDataChanged();
}

export function openAddObservation({ intersectionId } = {}) {
  const { limits } = state.meta;
  const today = todayIso();
  openDialog({
    title: "Record a traffic observation",
    submitLabel: "Save observation",
    body: el("div", { class: "form-grid" },
      field("Intersection", selectInput("intersection_id", intersectionOptions(),
        { value: intersectionId, placeholder: "Choose an intersection…" }), null, "full"),
      field("Time block", selectInput("time_block_id", timeBlockOptions(), { placeholder: "Choose…" })),
      field("Date", el("input", { type: "date", name: "date", value: today, max: today })),
      field("Vehicle volume", numberInput("volume", { min: 0, max: limits.volume }), rangeHint(0, limits.volume)),
      field("Avg wait (seconds)", numberInput("wait", { min: 0, max: limits.wait }), rangeHint(0, limits.wait)),
      field("Max queue (vehicles)", numberInput("queue", { min: 0, max: limits.queue }), rangeHint(0, limits.queue))),
    onSubmit: async (form) => afterChange(await post("/api/observations", formValues(form))),
  });
}

export function openEditObservation(row) {
  const { limits } = state.meta;
  openDialog({
    title: `Correct observation #${row.ID}`,
    submitLabel: "Save changes",
    body: [
      recordList([["Intersection", row.Intersection], ["Time block", row.TimeBlock], ["Date", row.Date]]),
      el("div", { class: "form-grid" },
        field("Vehicle volume", numberInput("volume", { value: row.Volume, min: 0, max: limits.volume })),
        field("Avg wait (seconds)", numberInput("wait", { value: row.AvgWaitSec, min: 0, max: limits.wait })),
        field("Max queue (vehicles)", numberInput("queue", { value: row.MaxQueue, min: 0, max: limits.queue }))),
    ],
    onSubmit: async (form) => afterChange(await put(`/api/observations/${row.ID}`, formValues(form))),
  });
}

export function openDeleteObservation(row) {
  openDialog({
    title: `Delete observation #${row.ID}?`,
    submitLabel: "Delete permanently",
    danger: true,
    body: [
      recordList([
        ["Intersection", row.Intersection], ["Time block", row.TimeBlock], ["Date", row.Date],
        ["Vehicles", row.Volume], ["Avg wait (s)", row.AvgWaitSec], ["Max queue", row.MaxQueue],
      ]),
      el("p", { class: "muted" }, "This removes the reading from the database. It cannot be undone."),
    ],
    onSubmit: async () => afterChange(await del(`/api/observations/${row.ID}`)),
  });
}

export function openAddIntersection() {
  const textInput = (name) => el("input", { name, maxlength: 60, autocomplete: "off" });
  openDialog({
    title: "Add an intersection",
    submitLabel: "Add intersection",
    body: el("div", { class: "form-grid" },
      field("Main street", textInput("main_street")),
      field("Cross street", textInput("cross_street")),
      field("Control type", selectInput("control", state.meta.control_types.map((c) => [c, c]), { placeholder: "Not specified" })),
      field("Neighborhood", textInput("neighborhood"), "Optional")),
    onSubmit: async (form) =>
      afterChange(await post("/api/intersections", formValues(form)), { reloadReference: true }),
  });
}

export function openEditCapacity(route) {
  const max = state.meta.limits.capacity;
  openDialog({
    title: `Update capacity — ${route.RouteName}`,
    submitLabel: "Update capacity",
    body: [
      recordList([["Route", route.RouteName], ["Type", route.TransitType], ["Current capacity", route.DailyCapacity]]),
      field("New daily capacity (riders)", numberInput("capacity", { value: route.DailyCapacity, min: 1, max }),
        rangeHint(1, max)),
    ],
    onSubmit: async (form) =>
      afterChange(await put(`/api/routes/${route.RouteID}/capacity`, formValues(form)), { reloadReference: true }),
  });
}

/**
 * After dragging from one intersection to another on the map: build a plain
 * road between them (or remove the one that's there), extend a route that
 * ends at `from` (or starts at `to`) so it runs from -> to, or start
 * planning a new route with these two stops.
 */
export function openConnect(from, to, network) {
  const { routes, roads = [] } = network;
  const ids = (route) => route.Path.map((p) => p.id);
  const road = roads.find((r) => (r.a === from.ID && r.b === to.ID) || (r.a === to.ID && r.b === from.ID));
  const extendable = routes.filter((route) => {
    const path = ids(route);
    return (path.at(-1) === from.ID && !path.includes(to.ID)) || (path[0] === to.ID && !path.includes(from.ID));
  });
  const alreadyLinked = routes.filter((route) => ids(route).some((id, i, path) =>
    (id === from.ID && path[i + 1] === to.ID) || (id === to.ID && path[i + 1] === from.ID)));
  const connected = road || alreadyLinked.length > 0;

  const choice = (value, label, meta, color) => el("label", { class: "choice" },
    el("input", { type: "radio", name: "choice", value }),
    color ? swatch(color) : "", el("span", {}, label), el("span", { class: "meta" }, meta));

  const note = road ? `A road (#${road.ID}) already connects them.`
    : alreadyLinked.length ? `Already connected by ${alreadyLinked.map((r) => r.Route).join(", ")}.` : "";
  const stopBox = el("input", { type: "checkbox", name: "stop", checked: true });
  const stopRow = el("label", { class: "check" }, stopBox, "Passenger stop at the added intersection");

  openDialog({
    title: "Connect two intersections",
    submitLabel: "Save",
    body: [
      recordList([["From", `#${from.ID} ${from.Name}`], ["To", `#${to.ID} ${to.Name}`]]),
      note ? el("p", { class: "muted small connect-note" }, note) : "",
      el("p", { class: "field-label connect-note" }, "What would you like to do?"),
      el("div", { class: "choice-list", onchange: (e) => { stopRow.hidden = /road/.test(e.target.form.choice.value); } },
        road ? choice("remove-road", "Remove the road", "deletes road #" + road.ID)
          : connected ? "" : choice("road", "Build a road", "for traffic; no transit route needed"),
        extendable.map((route) => {
          const where = ids(route).at(-1) === from.ID ? `adds #${to.ID} at the end` : `adds #${from.ID} at the start`;
          return choice(route.ID, `Extend ${route.Route}`, where, routeColor(route.ID));
        }),
        choice("new", "Start a new route", "opens Plan a route")),
      stopRow,
    ],
    onSubmit: async (form) => {
      const value = form.choice.value;
      const stop = stopBox.checked;
      if (value === "road") return afterChange(await post("/api/roads", { from: from.ID, to: to.ID }));
      if (value === "remove-road") return afterChange(await del(`/api/roads/${road.ID}`));
      if (value === "new") {
        state.draftRoute = { ...emptyDraft(), stops: [{ id: from.ID, stop: true }, { id: to.ID, stop }] };
        toast(`New route started at #${from.ID} → #${to.ID}. Name it and add more stops.`);
        location.hash = "#plan";
        return;
      }
      await afterChange(await post(`/api/routes/${value}/connect`, { from: from.ID, to: to.ID, stop }), { reloadReference: true });
    },
  });
  // Start on the first choice that isn't a delete. The stop option only applies
  // to routes, so it's hidden while a road option is chosen.
  const first = document.querySelector('#dialog input[name="choice"]:not([value="remove-road"])');
  first.checked = true;
  stopRow.hidden = first.value === "road";
}
