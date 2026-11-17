// Page entry point: loads reference data, then shows the screen named in the
// URL hash (#map, #intersections, ...) and redraws it after any data change.

import { setDatabaseName } from "./api.js";
import { $, el } from "./dom.js";
import { onDataChanged } from "./events.js";
import { hideTooltip } from "./map/network-map.js";
import { loadMeta, loadReferenceData, state } from "./state.js";
import * as intersectionsView from "./views/intersections.js";
import * as mapView from "./views/map.js";
import * as observationsView from "./views/observations.js";
import * as planView from "./views/plan.js";
import * as reportsView from "./views/reports.js";
import * as routesView from "./views/routes.js";

const VIEWS = {
  map: mapView,
  intersections: intersectionsView,
  observations: observationsView,
  routes: routesView,
  reports: reportsView,
  plan: planView,
};

let currentView = "map";

function errorState(title, message, retry) {
  return el("div", { class: "error-state" },
    el("h2", {}, title),
    el("p", {}, message),
    retry ? el("p", { style: { marginTop: "14px" } }, el("button", { class: "btn", onclick: retry }, "Try again")) : null);
}

async function showView(name, { keepScroll = false } = {}) {
  const view = name in VIEWS ? name : "map";
  const main = $("#view");
  const scroll = window.scrollY;
  currentView = view;
  hideTooltip();
  document.querySelectorAll("#nav a").forEach((link) => {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (!keepScroll) main.replaceChildren(el("div", { class: "loading" }, "Loading…"));
  try {
    await VIEWS[view].render(main);
  } catch (err) {
    main.replaceChildren(errorState("Could not load this page", err.message, () => showView(view)));
  }
  if (keepScroll) window.scrollTo(0, scroll);
}

window.addEventListener("hashchange", () => showView(location.hash.slice(1)));
onDataChanged(() => showView(currentView, { keepScroll: true }));

async function start() {
  try {
    await loadMeta();
    setDatabaseName(state.meta.database);
    await loadReferenceData();
  } catch (err) {
    $("#view").replaceChildren(errorState("Cannot connect to the database", err.message));
    return;
  }
  showView(location.hash.slice(1) || "map");
}

start();
