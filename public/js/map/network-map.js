// The interactive network map: a flat, top-down view of the city with live
// traffic. Layers, bottom to top:
//   land -> neighborhoods -> roads -> transit lines -> congestion rings
//   -> cars and signals -> transit vehicles -> names and click targets
//
// Hover an intersection for its numbers, click to select it, and (where the
// screen allows it) drag from one intersection to another to connect them.

import { $, clamp, el, svgEl } from "../dom.js";
import { fmt, levelClass } from "../format.js";
import { levelBadge } from "../components/controls.js";
import { routeColor } from "../state.js";
import { clock, isPlaying } from "./clock.js";
import { VIEW, layout, networkEdges, updateLayout } from "./layout.js";
import { TrafficSim } from "./traffic.js";
import { dwellTime, transitVehicles } from "./transit.js";

const ROUTE_LINE_GAP = 8;     // px between parallel transit lines on one road
const NEIGHBORHOOD_COLORS = ["#f3c7a6", "#b9d7f0", "#c8e3b5", "#e8c4e6", "#f5e3a3", "#b7e2dc"];
let dragging = false;

// ---- Tooltip -------------------------------------------------------------

function showTooltip(event, node) {
  if (dragging) return;
  const tip = $("#tooltip");
  tip.replaceChildren(
    el("strong", {}, `#${node.ID} ${node.Name}`),
    el("span", { class: "muted" }, `${node.Neighborhood || "No neighborhood"} · ${node.ControlType || "Unknown control"}`),
    el("span", {}, node.Readings
      ? `Avg wait ${fmt(node.AvgWaitSec)} s · ${fmt(node.AvgVolume)} vehicles · worst queue ${fmt(node.WorstQueue)}`
      : "No observations for this period"),
    el("span", {}, levelBadge(node.Level)));
  tip.hidden = false;
  moveTooltip(event);
}

function moveTooltip(event) {
  const tip = $("#tooltip");
  tip.style.left = `${Math.min(event.clientX + 14, window.innerWidth - tip.offsetWidth - 8)}px`;
  tip.style.top = `${Math.min(event.clientY + 14, window.innerHeight - tip.offsetHeight - 8)}px`;
}

export const hideTooltip = () => { $("#tooltip").hidden = true; };

// ---- Geometry shared by transit lines and vehicles -------------------------

/** Each route's sideways offset on each road it uses, so shared roads show lines side by side. */
function routeOffsets(network) {
  const offsets = new Map();
  for (const edge of networkEdges(network).values()) {
    edge.routes.forEach((routeId, k) => {
      offsets.set(`${routeId}:${edge.a}-${edge.b}`, (k - (edge.routes.length - 1) / 2) * ROUTE_LINE_GAP);
    });
  }
  return offsets;
}

/** The two end points of a route's line along the road between intersections a and b. */
function routeSegment(routeId, fromId, toId, offsets) {
  const A = layout.positions.get(fromId), B = layout.positions.get(toId);
  if (!A || !B) return null;
  // The normal is measured from the lower ID to the higher one, so every route agrees on "left".
  const [low, high] = fromId < toId ? [A, B] : [B, A];
  const length = Math.hypot(high.x - low.x, high.y - low.y) || 1;
  const nx = -(high.y - low.y) / length, ny = (high.x - low.x) / length;
  const off = offsets.get(`${routeId}:${Math.min(fromId, toId)}-${Math.max(fromId, toId)}`) || 0;
  return { a: { x: A.x + nx * off, y: A.y + ny * off }, b: { x: B.x + nx * off, y: B.y + ny * off } };
}

// ---- Map -----------------------------------------------------------------

export class NetworkMap {
  /**
   * @param host element to draw into
   * @param onNodeClick called with the intersection when one is clicked
   * @param onBackground called when empty space is clicked
   * @param onConnect called with (from, to) when the user drags from one intersection to another
   * @param picking show a pointer cursor (route planner)
   */
  constructor(host, { onNodeClick, onBackground, onConnect, picking = false, label = "Transit network map" } = {}) {
    this.onNodeClick = onNodeClick;
    this.onConnect = onConnect;
    this.onBackground = onBackground;
    this.options = {};
    this.network = null;
    this.traffic = null;
    this.animators = [];
    this.svg = svgEl("svg", {
      viewBox: `0 0 ${VIEW.width} ${VIEW.height}`, role: "img", "aria-label": label,
      class: `network-map${picking ? " picking" : ""}`,
    });
    // Hide the tooltip whenever the pointer is over the map but not on an intersection.
    // (A redraw can replace the hovered node, so its own pointerleave never fires.)
    this.svg.addEventListener("pointerover", (e) => { if (!e.target.closest?.(".node")) hideTooltip(); });
    this.svg.addEventListener("pointerleave", hideTooltip);
    host.replaceChildren(this.svg);
    this.startAnimation();
  }

  setData(network) {
    this.network = network;
    this.traffic = null; // new data -> new arrival rates and signal timings
    updateLayout(network);
    this.draw();
  }

  /** Options: selected (intersection ID), highlight (Set of route IDs), draft ([{id}]), hubs (Set of IDs). */
  set(options) {
    Object.assign(this.options, options);
    this.draw();
  }

  /** The traffic simulation keeps running across redraws; rebuild it only when roads move or data changes. */
  trafficSim() {
    if (!this.traffic || this.trafficVersion !== layout.version) {
      this.traffic?.carLayer.remove();
      this.traffic = new TrafficSim(this.network.intersections, [...networkEdges(this.network).values()], layout.positions);
      this.trafficVersion = layout.version;
    }
    return this.traffic;
  }

  draw() {
    if (!this.network) return;
    hideTooltip(); // the hovered node is about to be replaced
    this.svg.setAttribute("viewBox", `0 0 ${VIEW.width} ${VIEW.height}`);
    const traffic = this.trafficSim();
    const transit = this.transitLayer();
    const hoods = this.neighborhoods();
    this.animators = [(t) => traffic.update(t), ...transit.animators];

    this.svg.replaceChildren(
      this.land(),
      ...hoods.map((h) => h.area),
      traffic.roadLayer,
      svgEl("g", { class: "hood-names" }, hoods.map((h) => h.name)),
      svgEl("g", { class: "transit-lines" }, this.routeLines()),
      svgEl("g", { class: "congestion" }, this.network.intersections.map((n) => this.congestionMark(n))),
      traffic.carLayer,
      traffic.signalLayer,
      this.draftLine() ?? "",
      transit.layer,
      svgEl("g", { class: "nodes" }, this.network.intersections.map((n) => this.intersectionNode(n))),
    );
    this.renderFrame();
  }

  renderFrame() {
    const t = clock();
    for (const animate of this.animators) animate(t);
  }

  startAnimation() {
    let wasOnPage = false;
    const frame = () => {
      // Stop for good once this map has been removed from the page.
      if (this.svg.isConnected) wasOnPage = true;
      else if (wasOnPage) return;
      if (isPlaying()) this.renderFrame();
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  // ---- layers ----

  land() {
    const rect = svgEl("rect", { class: "land", x: 0, y: 0, width: VIEW.width, height: VIEW.height });
    rect.addEventListener("click", () => this.onBackground?.());
    return rect;
  }

  neighborhoods() {
    const groups = new Map();
    for (const n of this.network.intersections) {
      const p = layout.positions.get(n.ID);
      if (!n.Neighborhood || !p) continue;
      if (!groups.has(n.Neighborhood)) groups.set(n.Neighborhood, []);
      groups.get(n.Neighborhood).push(p);
    }
    const names = [...groups.keys()].sort();
    return [...groups].map(([name, points]) => {
      const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      const r = Math.max(...points.map((p) => Math.hypot(p.x - cx, p.y - cy))) + 96;
      return {
        area: svgEl("circle", { class: "hood-area", cx, cy, r, style: { fill: NEIGHBORHOOD_COLORS[names.indexOf(name) % NEIGHBORHOOD_COLORS.length] } }),
        name: svgEl("text", { class: "hood-name", x: cx, y: clamp(cy - r + 26, 22, VIEW.height - 10), "text-anchor": "middle" }, name),
      };
    });
  }

  /** Thin colored transit lines along the roads; other routes fade when one is highlighted. */
  routeLines() {
    const { highlight } = this.options;
    const offsets = routeOffsets(this.network);
    const lines = [];
    for (const route of this.network.routes) {
      const dim = highlight?.size > 0 && !highlight.has(route.ID);
      for (let i = 1; i < route.Path.length; i++) {
        const seg = routeSegment(route.ID, route.Path[i - 1].id, route.Path[i].id, offsets);
        if (!seg) continue;
        lines.push(svgEl("line", {
          x1: seg.a.x, y1: seg.a.y, x2: seg.b.x, y2: seg.b.y,
          stroke: routeColor(route.ID), class: `route-line${dim ? " dim" : ""}`,
        }));
      }
    }
    return lines;
  }

  /** Buses, trams, and vans moving along each route. */
  transitLayer() {
    const { highlight } = this.options;
    const layer = svgEl("g", { class: "transit" });
    const offsets = routeOffsets(this.network);
    const byId = new Map(this.network.intersections.map((n) => [n.ID, n]));
    const animators = [];
    for (const route of this.network.routes) {
      const segments = [];
      for (let i = 1; i < route.Path.length; i++) {
        const seg = routeSegment(route.ID, route.Path[i - 1].id, route.Path[i].id, offsets);
        if (seg) segments.push(seg);
      }
      if (segments.length !== route.Path.length - 1) continue;
      const dwell = route.Path.map((p) => dwellTime(p.stop, byId.get(p.id)?.AvgWaitSec));
      const animate = transitVehicles({ ...route, color: routeColor(route.ID) }, segments, dwell, layer,
        { dimmed: highlight?.size > 0 && !highlight.has(route.ID) });
      if (animate) animators.push(animate);
    }
    return { layer, animators };
  }

  /** A colored ring (and a glow for busier levels) around each junction. */
  congestionMark(n) {
    const p = layout.positions.get(n.ID);
    if (!p) return "";
    return svgEl("g", { class: `mark ${levelClass(n.Level)}`, transform: `translate(${p.x},${p.y})` },
      svgEl("circle", { class: "glow", r: 40 }),
      svgEl("circle", { class: "ring", r: 20 }));
  }

  draftLine() {
    const points = (this.options.draft || []).map((stop) => layout.positions.get(stop.id)).filter(Boolean);
    if (points.length < 2) return null;
    return svgEl("polyline", { class: "draft-line", points: points.map((p) => `${p.x},${p.y}`).join(" ") });
  }

  /** For highlighted routes: which intersections they serve, and whether as a stop. */
  highlightRings() {
    const rings = new Map();
    for (const routeId of this.options.highlight || []) {
      const route = this.network.routes.find((r) => r.ID === routeId);
      for (const point of route?.Path || []) {
        const previous = rings.get(point.id);
        rings.set(point.id, { color: routeColor(routeId), stop: previous?.stop || point.stop });
      }
    }
    return rings;
  }

  /** Name label, selection/route/hub rings, draft order badge, and the click/drag target. */
  intersectionNode(n) {
    const p = layout.positions.get(n.ID);
    if (!p) return "";
    const { selected, hubs, highlight, draft } = this.options;
    const rings = this.highlightRings();
    const draftIndex = (draft || []).findIndex((stop) => stop.id === n.ID);
    const dimmed = highlight?.size > 0 && !rings.has(n.ID) && draftIndex < 0;
    const expanded = selected === n.ID || rings.has(n.ID) || draftIndex >= 0 || this.network.intersections.length <= 12;

    const g = svgEl("g", {
      class: ["node", selected === n.ID && "selected", dimmed && "dim"].filter(Boolean).join(" "),
      transform: `translate(${p.x},${p.y})`, tabindex: 0, role: "button", "data-id": n.ID,
      "aria-label": `Intersection ${n.ID}, ${n.Name}: ${n.Level}`,
    });
    if (hubs?.has(n.ID)) g.append(svgEl("circle", { r: 40, class: "hub-ring" }));
    const ring = rings.get(n.ID);
    if (ring) g.append(svgEl("circle", { r: 31, class: `route-ring${ring.stop ? "" : " pass"}`, stroke: ring.color }));
    g.append(
      svgEl("circle", { r: 27, class: "select-ring" }),
      svgEl("circle", { r: 31, class: "hit" }),
      // Full names only where they matter, so a dense downtown map stays readable.
      svgEl("text", { class: `node-label${expanded ? " full" : ""}`, y: 52, "text-anchor": "middle" },
        expanded ? `#${n.ID} ${n.Name}` : `#${n.ID}`));
    if (draftIndex >= 0) {
      g.append(svgEl("g", { class: "seq-badge", transform: "translate(22,-22)" },
        svgEl("circle", { r: 10 }), svgEl("text", { y: 4, "text-anchor": "middle" }, draftIndex + 1)));
    }
    this.bindNodeEvents(g, n);
    return g;
  }

  // ---- interaction ----

  toSvgPoint(event) {
    const point = this.svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(this.svg.getScreenCTM().inverse());
  }

  bindNodeEvents(g, n) {
    g.addEventListener("pointerenter", (e) => showTooltip(e, n));
    g.addEventListener("pointermove", moveTooltip);
    g.addEventListener("pointerleave", hideTooltip);
    g.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        this.onNodeClick?.(n);
      }
    });

    // Press without moving is a click. Press and drag (when connecting is allowed)
    // draws a line to another intersection; releasing on one connects the two.
    g.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = this.toSvgPoint(e);
      const origin = layout.positions.get(n.ID);
      let line = null, target = null;

      const nodeUnder = (event) => {
        const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest(".node");
        const id = Number(hit?.dataset.id);
        return hit && this.svg.contains(hit) && id !== n.ID ? { element: hit, id } : null;
      };
      const setTarget = (next) => {
        if (target?.element === next?.element) return;
        target?.element.classList.remove("connect-target");
        target = next;
        target?.element.classList.add("connect-target");
      };

      const onMove = (event) => {
        if (!this.onConnect) return;
        const p = this.toSvgPoint(event);
        if (!line && Math.hypot(p.x - start.x, p.y - start.y) < 6) return;
        if (!line) {
          dragging = true;
          hideTooltip();
          g.classList.add("connect-source");
          line = this.svg.insertBefore(svgEl("line", { class: "connect-line", x1: origin.x, y1: origin.y }), this.svg.querySelector(".nodes"));
        }
        setTarget(nodeUnder(event));
        const end = target ? layout.positions.get(target.id) : p;
        line.setAttribute("x2", end.x);
        line.setAttribute("y2", end.y);
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        dragging = false;
        if (!line) {
          this.onNodeClick?.(n);
          return;
        }
        line.remove();
        g.classList.remove("connect-source");
        const to = target && this.network.intersections.find((i) => i.ID === target.id);
        setTarget(null);
        if (to) this.onConnect(n, to);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
  }
}
