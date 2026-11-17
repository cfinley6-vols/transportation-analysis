// Network map screen: the whole system at a glance (related data from
// several joined tables). Click an intersection or route for details.

import { get, put } from "../api.js";
import { levelLegend } from "../components/charts.js";
import { chip, ringIcon, segmented, stat, swatch, toast, viewHeader } from "../components/controls.js";
import { el } from "../dom.js";
import { notifyDataChanged } from "../events.js";
import { LOS_DESCRIPTION, fmt } from "../format.js";
import { openAddIntersection, openAddObservation, openConnect } from "../forms.js";
import { isPlaying, setPlaying } from "../map/clock.js";
import { NetworkMap } from "../map/network-map.js";
import { intersectionPanel, routeLineDiagram } from "../panels.js";
import { routeColor, state } from "../state.js";

export async function render(main) {
  let network = await get("/api/network", { time_block: state.mapTimeBlock });
  const panel = el("aside", { class: "card sticky" });
  const host = el("div", { class: "map-host" });
  const map = new NetworkMap(host, {
    onNodeClick: (n) => select({ kind: "intersection", id: n.ID }),
    onBackground: () => select(null),
    onConnect: (from, to) => openConnect(from, to, network),
    onMove: async (n, { x, y }) => {
      try {
        const result = await put(`/api/intersections/${n.ID}/position`, { x, y });
        toast(result.message);
        notifyDataChanged();
      } catch (err) {
        toast(err.message, "error");
        throw err; // the map puts the intersection back
      }
    },
  });
  map.set({ dragMode: state.mapDragMode });

  const HINTS = {
    connect: "drag from one intersection to another on the same street to build a road or extend a route",
    move: "drag an intersection to a new spot on the map; its position is saved when you let go",
  };
  const hint = el("div", { class: "map-hint" });
  const showHint = () => {
    hint.textContent = `Live view of the selected time of day · hover an intersection for its numbers · click to open · ${HINTS[state.mapDragMode]}`;
  };
  showHint();
  const dragControl = segmented([["connect", "Connect"], ["move", "Move"]], state.mapDragMode, (mode) => {
    state.mapDragMode = mode;
    map.set({ dragMode: mode });
    host.classList.toggle("moving-mode", mode === "move");
    showHint();
  }, "What dragging an intersection does");
  host.classList.toggle("moving-mode", state.mapDragMode === "move");

  async function select(selection) {
    state.mapSelection = selection;
    const { kind, id } = selection || {};
    map.set({
      selected: kind === "intersection" ? id : null,
      highlight: new Set(kind === "route" ? [id] : []),
    });
    try {
      if (kind === "intersection") panel.replaceChildren(await intersectionPanel(id));
      else if (kind === "route") panel.replaceChildren(await routePanel(id));
      else panel.replaceChildren(overviewPanel());
    } catch (err) {
      // The selected record may have been removed; fall back to the overview.
      state.mapSelection = null;
      panel.replaceChildren(overviewPanel());
      if (err.status !== 404) toast(err.message, "error");
    }
  }

  function overviewPanel() {
    return el("div", {},
      el("h2", {}, "Transit routes"),
      el("p", { class: "muted small", style: { margin: "4px 0 12px" } },
        "Select a route to highlight it, or click an intersection for its profile."),
      el("ul", { class: "route-pick" }, network.routes.map((r) => el("li", {},
        el("button", { type: "button", onclick: () => select({ kind: "route", id: r.ID }) },
          swatch(routeColor(r.ID)), el("span", {}, r.Route),
          el("span", { class: "meta" }, `${r.Type} · ${r.Segments} stops`))))),
      el("h3", {}, "Level of service (average delay)"),
      levelLegend(),
      el("p", { class: "muted small", style: { marginTop: "8px" } },
        LOS_DESCRIPTION),
      el("h3", {}, "What's moving"),
      el("ul", { class: "key-list" },
        el("li", {}, el("b", {}, "Cars"), " start trips at each intersection at a rate set by its average vehicle volume. Where a street has no road yet, a short tail shows it leading off the map, and cars arrive and leave along it."),
        el("li", {}, el("b", {}, "Signals"), " follow the control type; longer average waits mean longer reds, so queues build up."),
        el("li", {}, el("b", {}, "Buses, trams, vans"), " run each route, pause at passenger stops, and are held longer at congested intersections. More daily capacity puts more vehicles in service.")),
      el("h3", {}, "Highlighted route"),
      el("div", { class: "legend" },
        el("span", {}, ringIcon(false), "Passenger stop"),
        el("span", {}, ringIcon(true), "Pass-through")),
      el("div", { class: "stats" },
        stat("Intersections", network.intersections.length),
        stat("Routes", network.routes.length),
        stat("Readings", network.intersections.reduce((sum, n) => sum + n.Readings, 0))));
  }

  async function routePanel(routeId) {
    const { route, path } = await get(`/api/routes/${routeId}`);
    return el("div", {},
      el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
        swatch(routeColor(route.RouteID)), el("h2", {}, route.RouteName)),
      el("div", { class: "chips" }, chip(route.TransitType), chip(`${fmt(route.DailyCapacity)} riders/day`)),
      el("h3", {}, "Path in travel order"),
      routeLineDiagram(path, routeColor(route.RouteID)),
      el("div", { class: "panel-actions" },
        el("button", { class: "btn", onclick: () => select(null) }, "← All routes"),
        el("button", {
          class: "btn",
          onclick: () => { state.selectedRouteId = route.RouteID; location.hash = "#routes"; },
        }, "Route details")));
  }

  const timeBlockControl = segmented(
    [["", "All day"], ...state.meta.time_blocks.map((b) => [b.TimeBlockID, b.BlockName])],
    state.mapTimeBlock,
    async (value) => {
      state.mapTimeBlock = value;
      try {
        network = await get("/api/network", { time_block: value });
        map.setData(network);
      } catch (err) {
        toast(err.message, "error");
      }
    },
    "Time block");

  const motionButton = el("button", { type: "button", class: "btn small" });
  const showMotionState = () => { motionButton.textContent = isPlaying() ? "❚❚ Pause" : "▶ Play"; };
  motionButton.addEventListener("click", () => { setPlaying(!isPlaying()); showMotionState(); });
  showMotionState();

  main.replaceChildren(
    viewHeader("Network map",
      "A live picture of the city: traffic and transit move according to the recorded data for the time of day you pick. Rings show each intersection's level of service.",
      ["JOIN", "LEFT JOIN", "AVG / MAX / COUNT", "GROUP BY"],
      [el("button", { class: "btn", onclick: openAddIntersection }, "+ Intersection"),
       el("button", { class: "btn primary", onclick: () => openAddObservation() }, "+ Observation")]),
    el("div", { class: "split" },
      el("section", { class: "card map-card" },
        el("div", { class: "map-toolbar" },
          el("span", { class: "field-label" }, "Traffic for"), timeBlockControl,
          el("span", { class: "toolbar-group" }, el("span", { class: "field-label" }, "Drag to"), dragControl),
          motionButton),
        host,
        hint),
      panel));

  map.setData(network);
  await select(state.mapSelection);
}
