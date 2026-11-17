// Routes screen: each route's ordered path with congestion (joins), capacity
// updates (UPDATE), and transfer points between two routes (self-join).

import { get } from "../api.js";
import { errorBox, field, selectInput, stat, swatch, viewHeader } from "../components/controls.js";
import { clearFormError, formValues, showFormError } from "../components/dialog.js";
import { table } from "../components/table.js";
import { el } from "../dom.js";
import { openEditCapacity } from "../forms.js";
import { NetworkMap } from "../map/network-map.js";
import { routeLineDiagram } from "../panels.js";
import { loadReferenceData, routeColor, routeOptions, state } from "../state.js";

const PATH_COLUMNS = ["Seq", "Intersection", "Neighborhood", "StopType", "AvgWaitSec", "WorstQueue"];

export async function render(main) {
  await loadReferenceData();
  if (!state.routes.length) {
    main.replaceChildren(viewHeader("Transit routes", "No routes yet."),
      el("div", { class: "empty" }, "There are no transit routes. Create one under “Plan a route”."));
    return;
  }
  if (!state.routes.some((r) => r.ID === state.selectedRouteId)) state.selectedRouteId = state.routes[0].ID;

  const cards = el("div", { class: "route-cards" });
  const detail = el("section", { class: "card" });

  function drawCards() {
    cards.replaceChildren(...state.routes.map((r) => el("button", {
      type: "button", class: "route-card", "aria-pressed": String(r.ID === state.selectedRouteId),
      onclick: () => { state.selectedRouteId = r.ID; drawCards(); showDetail(); },
    },
    el("span", { class: "bar", style: { background: routeColor(r.ID) } }),
    el("span", {},
      el("div", { class: "title" }, r.Route),
      el("div", { class: "sub" }, `${r.Type} · ${r.Capacity.toLocaleString()} riders/day · ${r.Segments} segments`)))));
  }

  async function showDetail() {
    try {
      const { route, path } = await get(`/api/routes/${state.selectedRouteId}`);
      const color = routeColor(route.RouteID);
      detail.replaceChildren(
        el("div", { class: "view-header", style: { marginBottom: "0" } },
          el("div", { style: { display: "flex", alignItems: "center", gap: "10px" } }, swatch(color), el("h2", {}, route.RouteName)),
          el("div", { class: "view-actions" },
            el("button", {
              class: "btn",
              onclick: () => { state.mapSelection = { kind: "route", id: route.RouteID }; location.hash = "#map"; },
            }, "Show on map"),
            el("button", { class: "btn primary", onclick: () => openEditCapacity(route) }, "Edit capacity"))),
        el("div", { class: "stats" },
          stat("Type", route.TransitType),
          stat("Daily capacity", route.DailyCapacity),
          stat("Intersections", path.length),
          stat("Passenger stops", path.filter((p) => p.StopType === "Stop").length)),
        el("div", { class: "split wide-left", style: { marginTop: "18px" } },
          el("div", {},
            el("h3", { style: { marginTop: 0 } }, "Stops and congestion"),
            table(path, { columns: PATH_COLUMNS, empty: "This route has no pathway defined." })),
          el("div", {},
            el("h3", { style: { marginTop: 0 } }, "Line diagram"),
            routeLineDiagram(path, color))));
    } catch (err) {
      detail.replaceChildren(el("div", { class: "form-error" }, err.message));
    }
  }

  // ---- Transfer points between two routes ----
  const transferResult = el("div", {});
  const transferErrors = errorBox();
  const transferForm = el("form", { class: "filters", novalidate: true },
    field("First route", selectInput("a", routeOptions(), { value: state.transferPair.a || state.routes[0]?.ID })),
    field("Second route", selectInput("b", routeOptions(), { value: state.transferPair.b || state.routes[1]?.ID })),
    el("button", { type: "submit", class: "btn primary" }, "Find transfer points"));

  async function findTransfers() {
    clearFormError(transferForm);
    state.transferPair = formValues(transferForm);
    try {
      const [data, network] = await Promise.all([get("/api/routes/transfers", state.transferPair), get("/api/network")]);
      const host = el("div", { class: "card map-card transfer-map" });
      const map = new NetworkMap(host, { label: "Routes compared" });
      map.setData(network);
      map.set({
        highlight: new Set([data.a.RouteID, data.b.RouteID]),
        hubs: new Set(data.hubs.filter((h) => h.CanTransfer === "Yes").map((h) => h.ID)),
      });
      transferResult.replaceChildren(
        table(data.hubs, {
          labels: { RouteA: data.a.RouteName, RouteB: data.b.RouteName },
          empty: "These routes do not share any intersections.",
        }),
        host);
    } catch (err) {
      transferResult.replaceChildren();
      showFormError(transferForm, transferErrors, err);
    }
  }
  transferForm.addEventListener("submit", (e) => { e.preventDefault(); findTransfers(); });

  main.replaceChildren(
    viewHeader("Transit routes",
      "Each route's ordered path with congestion at every intersection. Update a route's capacity or compare two routes to find transfer points.",
      ["JOIN ×3", "LEFT JOIN (subquery)", "UPDATE", "self-JOIN"],
      [el("a", { class: "btn primary", href: "#plan", style: { textDecoration: "none" } }, "+ Plan a new route")]),
    el("div", { class: "split left-narrow" }, cards, detail),
    el("section", { class: "card", style: { marginTop: "16px" } },
      el("h2", {}, "Find transfer points"),
      el("p", { class: "muted", style: { marginBottom: "12px" } },
        "Intersections served by both routes. Riders can transfer where both routes have a passenger stop (ringed on the map)."),
      transferForm, transferErrors, transferResult));

  drawCards();
  await showDetail();
  if (state.routes.length > 1) await findTransfers();
}
