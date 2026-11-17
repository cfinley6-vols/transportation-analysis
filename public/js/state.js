// What the page remembers while it is open: reference data for dropdowns
// (re-fetched after every change) and each screen's current filters and
// selections. Nothing here is saved; the database is the only store.

import { get } from "./api.js";

export const state = {
  meta: null,           // time blocks, control types, sort options, limits
  intersections: [],    // for dropdowns
  routes: [],           // for dropdowns and route colors

  mapTimeBlock: "",     // time block used to color the map ("" = all day)
  mapDragMode: "connect", // what dragging an intersection does: "connect" or "move"
  mapSelection: null,   // { kind: "intersection" | "route", id }
  observationFilter: {},
  selectedRouteId: null,
  transferPair: { a: "", b: "" },
  reportTab: "congestion",
  reportParams: { congestion: 0, bottleneck: 50, start: "", end: "", metric: "AvgWaitSec" },
  draftRoute: emptyDraft(),
};

export function emptyDraft() {
  return { name: "", type: "", capacity: "", stops: [] };
}

export async function loadMeta() {
  state.meta = await get("/api/meta");
}

export async function loadReferenceData() {
  [state.intersections, state.routes] = await Promise.all([get("/api/intersections"), get("/api/routes")]);
  assignRouteColors(state.routes);
}

// ---- Dropdown options ----------------------------------------------------

export const intersectionOptions = () => state.intersections.map((i) =>
  [i.ID, `#${i.ID}  ${i.Intersection}${i.Neighborhood ? ` — ${i.Neighborhood}` : ""}`]);

export const routeOptions = () => state.routes.map((r) => [r.ID, `${r.Route} (${r.Type})`]);

export const timeBlockOptions = () => state.meta.time_blocks.map((b) =>
  [b.TimeBlockID, `${b.BlockName} (${b.StartTime}–${b.EndTime})`]);

// ---- Route colors --------------------------------------------------------
// A color word in the route name wins ("Red Line" is red); others use a palette.

const NAMED_COLORS = {
  red: "#e5484d", blue: "#3e7bfa", green: "#30a46c", orange: "#f76b15", purple: "#8e4ec6",
  yellow: "#d5ae39", gold: "#c29a2f", silver: "#8b95a1", pink: "#d6409f", brown: "#a1662f",
};
const PALETTE = ["#12a594", "#8e4ec6", "#d6409f", "#5b5bd6", "#a1662f", "#0894b3", "#f76b15", "#30a46c"];
const routeColors = new Map();

function assignRouteColors(routes) {
  routeColors.clear();
  const used = new Set();
  const unnamed = [];
  for (const route of routes) {
    const word = Object.keys(NAMED_COLORS).find((w) => new RegExp(`\\b${w}\\b`, "i").test(route.Route));
    if (word && !used.has(NAMED_COLORS[word])) {
      routeColors.set(route.ID, NAMED_COLORS[word]);
      used.add(NAMED_COLORS[word]);
    } else {
      unnamed.push(route);
    }
  }
  const unused = PALETTE.filter((color) => !used.has(color));
  const palette = unused.length ? unused : PALETTE;
  unnamed.forEach((route, i) => routeColors.set(route.ID, palette[i % palette.length]));
}

export const routeColor = (routeId) => routeColors.get(routeId) || "var(--muted)";
