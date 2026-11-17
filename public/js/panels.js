// Detail panels used on more than one screen.

import { get } from "./api.js";
import { waitChart } from "./components/charts.js";
import { badge, chip, swatch } from "./components/controls.js";
import { el } from "./dom.js";
import { fmt, levelClass, levelFor } from "./format.js";
import { openAddObservation } from "./forms.js";
import { routeColor, state } from "./state.js";

/** Intersection profile: details, wait by time block, and routes through it. */
export async function intersectionPanel(intersectionId) {
  const { intersection: i, routes, time_blocks: timeBlocks } = await get(`/api/intersections/${intersectionId}`);
  return el("div", { class: "profile" },
    el("h2", {}, i.Name),
    el("div", { class: "chips" },
      chip(`ID ${i.IntersectionID}`), chip(i.ControlType || "Unknown control"), chip(i.Neighborhood || "No neighborhood")),

    el("h3", {}, "Average wait by time block"),
    waitChart(timeBlocks, {
      compact: true,
      label: (r) => r.TimeBlock,
      sub: (r) => `${r.Hours} · ${r.Readings} reading${r.Readings === 1 ? "" : "s"}`,
    }),

    el("h3", {}, "Transit routes through here"),
    routes.length
      ? el("ul", { class: "route-list" }, routes.map((r) => el("li", {},
          swatch(routeColor(r.RouteID)),
          el("span", {}, r.Route),
          el("span", { class: "muted small" }, `position ${r.Seq}`),
          badge(r.StopType, r.StopType === "Stop" ? "stop" : "pass"))))
      : el("p", { class: "muted" }, "No transit routes pass through here."),

    el("div", { class: "panel-actions" },
      el("button", { class: "btn primary", onclick: () => openAddObservation({ intersectionId: i.IntersectionID }) },
        "Record observation"),
      el("button", {
        class: "btn",
        onclick: () => {
          state.observationFilter = { intersection: String(i.IntersectionID) };
          location.hash = "#observations";
        },
      }, "View observations")));
}

/** Vertical line diagram of a route: stops as large dots, pass-throughs as small ones. */
export function routeLineDiagram(path, color) {
  if (!path.length) return el("div", { class: "empty" }, "This route has no pathway defined.");
  return el("ol", { class: "strip", style: { "--route": color } }, path.map((p) => {
    const level = levelFor(p.AvgWaitSec);
    return el("li", { class: `${levelClass(level)}${p.StopType === "Stop" ? "" : " pass"}` },
      el("span", { class: "stop-dot", title: level }),
      el("div", {},
        el("div", { class: "name" }, p.Intersection),
        el("div", { class: "sub" }, `${p.StopType}${p.Neighborhood ? ` · ${p.Neighborhood}` : ""}`)),
      el("span", { class: "wait small" },
        el("i", { class: `dot ${levelClass(level)}` }),
        p.AvgWaitSec === null ? "no data" : `${fmt(p.AvgWaitSec)} s`));
  }));
}
