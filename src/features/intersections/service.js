// Intersections: search, profile (related data), and adding new ones.

import { CONTROL_TYPES } from "../../shared/constants.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import * as v from "../../shared/validate.js";
import * as roadQueries from "../roads/queries.js";
import * as routeQueries from "../routes/queries.js";
import * as queries from "./queries.js";

/** Validate an intersection ID and load the row, or throw NotFoundError. */
export function requireIntersection(db, rawId, field = "intersection_id") {
  const id = v.integer(rawId, "Intersection ID", { field, min: 1 });
  const intersection = queries.findIntersection(db, id);
  if (!intersection) throw new NotFoundError(`No intersection with ID ${id}.`);
  return intersection;
}

/**
 * The street two intersections are both on, or null if none. An intersection
 * is the crossing of its MainStreet and CrossStreet, so a road or a route can
 * only go directly between two intersections on the same street.
 */
export function sharedStreet(a, b) {
  const streetsOfB = [b.MainStreet, b.CrossStreet].map((s) => s.toLowerCase());
  return [a.MainStreet, a.CrossStreet].find((s) => streetsOfB.includes(s.toLowerCase())) ?? null;
}

export function searchIntersections(db, input) {
  return queries.searchIntersections(db, {
    street: v.text(input.street, "Street", { field: "street", required: false }),
    neighborhood: v.text(input.neighborhood, "Neighborhood", { field: "neighborhood", required: false }),
    controlType: v.oneOf(input.control, CONTROL_TYPES, "Control type", { field: "control", required: false }),
  });
}

/** One intersection with the routes through it and its traffic by time block. */
export function intersectionProfile(db, input) {
  const intersection = requireIntersection(db, input.id, "id");
  const id = intersection.IntersectionID;
  return {
    intersection,
    routes: queries.routesThroughIntersection(db, id),
    time_blocks: queries.trafficByTimeBlock(db, id),
    roads: roadQueries.roadsAt(db, id),
    observation_count: queries.countObservations(db, id),
  };
}

export function addIntersection(db, input) {
  const mainStreet = v.text(input.main_street, "Main street", { field: "main_street" });
  const crossStreet = v.text(input.cross_street, "Cross street", { field: "cross_street" });
  if (mainStreet.toLowerCase() === crossStreet.toLowerCase()) {
    throw new ValidationError("Cross street must be different from the main street.", "cross_street");
  }
  const controlType = v.oneOf(input.control, CONTROL_TYPES, "Control type", { field: "control", required: false });
  const neighborhood = v.text(input.neighborhood, "Neighborhood", { field: "neighborhood", required: false });

  // Friendly duplicate check (street order ignored); the UNIQUE constraint is the final safeguard.
  const existing = queries.findByStreets(db, mainStreet, crossStreet);
  if (existing) throw new ConflictError(`That intersection already exists (ID ${existing.IntersectionID}).`);

  const placed = queries.placedIntersections(db);
  const { x: mapX, y: mapY } = suggestPosition(placed, mainStreet, crossStreet);
  const connections = [mainStreet, crossStreet]
    .map((street) => neighborsOnStreet(db, placed, street, { x: mapX, y: mapY }))
    .filter((c) => c.neighbors.length);
  const { id, rerouted } = queries.insertIntersectionWithRoads(
    db, { mainStreet, crossStreet, controlType, neighborhood, mapX, mapY }, connections);

  const roadCount = connections.reduce((sum, c) => sum + c.neighbors.length, 0);
  const notes = [
    roadCount
      ? `Connected by ${roadCount} road${roadCount === 1 ? "" : "s"} on ${connections.map((c) => c.street).join(" and ")}.`
      : "None of its streets are on the map yet, so it has no roads yet.",
    rerouted.length ? `${[...new Set(rerouted)].join(", ")} now ${rerouted.length === 1 ? "passes" : "pass"} through it.` : "",
  ];
  return {
    message: `Intersection #${id} added. ${notes.filter(Boolean).join(" ")}`,
    intersection: queries.findIntersection(db, id),
  };
}

/**
 * The intersections a new corner at `position` should join on `street`: the
 * nearest one in each direction along the street. If those two are already
 * joined by a road, the new corner is in the middle of that block (`split`).
 */
function neighborsOnStreet(db, placed, street, position) {
  const on = placed.filter((p) => onStreet(p, street));
  if (on.length === 0) return { street, neighbors: [], split: null };
  if (on.length === 1) return { street, neighbors: [on[0].IntersectionID], split: null };

  const line = streetLine(on);
  const along = (p) => (p.x - line.x) * line.dx + (p.y - line.y) * line.dy;
  const here = along(position);
  const ranked = on.map((p) => ({ id: p.IntersectionID, t: along({ x: p.MapX, y: p.MapY }) }));
  const before = ranked.filter((p) => p.t < here).sort((a, b) => b.t - a.t)[0];
  const after = ranked.filter((p) => p.t > here).sort((a, b) => a.t - b.t)[0];
  const neighbors = [before, after].filter(Boolean).map((p) => p.id);
  const split = before && after && roadQueries.findRoadBetween(db, before.id, after.id) ? { a: before.id, b: after.id } : null;
  return { street, neighbors, split };
}

const MAP_LIMIT = 1000;  // blocks from the origin in any direction
const MIN_GAP = 0.5;     // blocks between two intersections
const snap = (n) => Math.round(n * 4) / 4; // positions are kept to quarter blocks

const onStreet = (row, street) => [row.MainStreet, row.CrossStreet].some((s) => s.toLowerCase() === street.toLowerCase());
const isFree = (placed, x, y, exceptId) =>
  placed.every((p) => p.IntersectionID === exceptId || Math.hypot(p.MapX - x, p.MapY - y) >= MIN_GAP);

/** A street's line on the map, from the intersections already placed on it (null if fewer than 2). */
function streetLine(on) {
  if (on.length < 2) return null;
  const xs = on.map((p) => p.MapX), ys = on.map((p) => p.MapY);
  const across = Math.max(...xs) - Math.min(...xs) >= Math.max(...ys) - Math.min(...ys);
  const sorted = [...on].sort((a, b) => (across ? a.MapX - b.MapX : a.MapY - b.MapY));
  const first = sorted[0], last = sorted.at(-1);
  const length = Math.hypot(last.MapX - first.MapX, last.MapY - first.MapY) || 1;
  return { sorted, x: first.MapX, y: first.MapY, dx: (last.MapX - first.MapX) / length, dy: (last.MapY - first.MapY) / length };
}

/** Where two lines cross (null if parallel). */
function crossing(a, b) {
  const det = a.dx * b.dy - a.dy * b.dx;
  if (Math.abs(det) < 1e-6) return null;
  const t = ((b.x - a.x) * b.dy - (b.y - a.y) * b.dx) / det;
  return { x: a.x + t * a.dx, y: a.y + t * a.dy };
}

/** The point on a line closest to p. */
function foot(line, p) {
  const t = (p.MapX - line.x) * line.dx + (p.MapY - line.y) * line.dy;
  return { x: line.x + t * line.dx, y: line.y + t * line.dy };
}

/**
 * Where a new intersection should go on the map, so it lands where its two
 * streets meet whenever the map already shows enough of them:
 *   1. both streets drawn as lines: where the lines cross;
 *   2. one street a line, the other known at one corner: the point on the line
 *      nearest that corner (the other street runs across to it);
 *   3. one street a line: one block past its east/south (or west/north) end;
 *   4. one corner known on a street: one block away from it;
 *   5. otherwise a free spot just below the city.
 */
export function suggestPosition(placed, mainStreet, crossStreet) {
  if (placed.length === 0) return { x: 0, y: 0 };
  const candidates = [];
  const onA = placed.filter((p) => onStreet(p, mainStreet)), onB = placed.filter((p) => onStreet(p, crossStreet));
  const lineA = streetLine(onA), lineB = streetLine(onB);

  if (lineA && lineB) candidates.push(crossing(lineA, lineB));
  for (const [line, others] of [[lineA, onB], [lineB, onA]]) {
    if (line) for (const p of others) candidates.push(foot(line, p));
  }
  for (const line of [lineA, lineB]) {
    if (!line) continue;
    const { sorted } = line;
    for (const [end, previous] of [[sorted.at(-1), sorted.at(-2)], [sorted[0], sorted[1]]]) {
      const dx = end.MapX - previous.MapX, dy = end.MapY - previous.MapY, length = Math.hypot(dx, dy) || 1;
      candidates.push({ x: end.MapX + dx / length, y: end.MapY + dy / length });
    }
  }
  for (const p of [...onA, ...onB]) {
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) candidates.push({ x: p.MapX + dx, y: p.MapY + dy });
  }
  for (const c of candidates) {
    if (!c || Math.abs(c.x) > MAP_LIMIT || Math.abs(c.y) > MAP_LIMIT) continue;
    const x = snap(c.x), y = snap(c.y);
    if (isFree(placed, x, y)) return { x, y };
  }
  const y = Math.ceil(Math.max(...placed.map((p) => p.MapY))) + 1;
  for (let x = Math.floor(Math.min(...placed.map((p) => p.MapX))); ; x++) {
    if (isFree(placed, x, y)) return { x, y };
  }
}

/**
 * Delete an intersection, its observations and roads, and its stop on every
 * route through it. Refused if that would leave a route that no longer makes
 * sense (under 2 stops, no passenger stop, or a jump between corners that
 * don't share a street).
 */
export function deleteIntersection(db, input) {
  const intersection = requireIntersection(db, input.id, "id");
  const id = intersection.IntersectionID;
  const shortened = [];
  for (const route of queries.routesThroughIntersection(db, id)) {
    const remaining = routeQueries.routePath(db, route.RouteID)
      .filter((stop) => stop.IntersectionID !== id)
      .map((stop) => ({ ...queries.findIntersection(db, stop.IntersectionID), isStop: stop.StopType === "Stop" }));
    const problem = remaining.length < 2 ? "would have fewer than 2 stops"
      : !remaining.some((stop) => stop.isStop) ? "would have no passenger stop left"
      : remaining.some((stop, i) => i > 0 && !sharedStreet(remaining[i - 1], stop))
        ? `would jump between corners that don't share a street (${intersection.Name} is where it turns)`
        : null;
    if (problem) throw new ConflictError(`Can't delete ${intersection.Name}: ${route.Route} ${problem}.`);
    shortened.push(route.Route);
  }
  const observations = queries.countObservations(db, id);
  const roads = roadQueries.roadsAt(db, id).length;
  const joined = queries.deleteIntersectionAndShortenRoutes(db, id);
  const parts = [`${observations} observation${observations === 1 ? "" : "s"}`, `${roads} road${roads === 1 ? "" : "s"}`];
  return {
    message: `Deleted ${intersection.Name} with its ${parts.join(" and ")}.`
      + (joined.length ? ` ${joined.join(" and ")} now ${joined.length === 1 ? "runs" : "run"} straight through.` : "")
      + (shortened.length ? ` Removed it from ${shortened.join(", ")}.` : ""),
  };
}

/** Move an intersection on the map (UPDATE). Positions are in blocks. */
export function moveIntersection(db, input) {
  const intersection = requireIntersection(db, input.id, "id");
  const x = snap(v.decimal(input.x, "Map position (x)", { field: "x", min: -MAP_LIMIT, max: MAP_LIMIT }));
  const y = snap(v.decimal(input.y, "Map position (y)", { field: "y", min: -MAP_LIMIT, max: MAP_LIMIT }));
  if (x === intersection.MapX && y === intersection.MapY) return { message: "No changes made." };
  if (!isFree(queries.placedIntersections(db), x, y, intersection.IntersectionID)) {
    throw new ConflictError("Another intersection is already there. Leave at least half a block between them.");
  }
  queries.updatePosition(db, intersection.IntersectionID, x, y);
  return { message: `Moved ${intersection.Name}.`, intersection: queries.findIntersection(db, intersection.IntersectionID) };
}
