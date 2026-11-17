// Transit routes: list, path detail, capacity updates, launching a new route
// (multi-statement transaction), and finding transfer points.

import { LIMITS } from "../../shared/constants.js";
import { NotFoundError, ValidationError } from "../../shared/errors.js";
import * as v from "../../shared/validate.js";
import { requireIntersection } from "../intersections/service.js";
import * as queries from "./queries.js";

function requireRoute(db, rawId, field = "id") {
  const id = v.integer(rawId, "Route ID", { field, min: 1 });
  const route = queries.findRoute(db, id);
  if (!route) throw new NotFoundError(`No transit route with ID ${id}.`);
  return route;
}

export const listRoutes = (db) => queries.listRoutes(db);

export function routeDetail(db, input) {
  const route = requireRoute(db, input.id);
  return { route, path: queries.routePath(db, route.RouteID) };
}

export function updateCapacity(db, input) {
  const route = requireRoute(db, input.id);
  const capacity = v.integer(input.capacity, "Daily capacity", { field: "capacity", min: 1, max: LIMITS.capacity });
  if (capacity === route.DailyCapacity) return { message: "No changes made." };
  queries.updateRouteCapacity(db, route.RouteID, capacity);
  const fmt = (n) => n.toLocaleString("en-US");
  return { message: `${route.RouteName} capacity changed from ${fmt(route.DailyCapacity)} to ${fmt(capacity)}.` };
}

/** Validate the ordered stop list: 2+ intersections, no repeats, at least one passenger stop. */
function validateStops(db, rawStops) {
  if (!Array.isArray(rawStops) || rawStops.length < 2) {
    throw new ValidationError("Add at least 2 intersections in travel order.", "stops");
  }
  const seen = new Set();
  const stops = rawStops.map((raw, index) => {
    if (typeof raw !== "object" || raw === null) {
      throw new ValidationError(`Stop #${index + 1} is malformed.`, "stops");
    }
    const intersection = requireIntersection(db, raw.id, "stops");
    if (seen.has(intersection.IntersectionID)) {
      throw new ValidationError(`${intersection.Name} appears on the route twice.`, "stops");
    }
    seen.add(intersection.IntersectionID);
    return {
      intersectionId: intersection.IntersectionID,
      hasStop: v.boolean(raw.stop, `Stop type for #${index + 1}`, { field: "stops" }),
    };
  });
  if (!stops.some((stop) => stop.hasStop)) {
    throw new ValidationError("A route needs at least one passenger stop.", "stops");
  }
  return stops;
}

export function launchRoute(db, input) {
  const name = v.text(input.name, "Route name", { field: "name" });
  if (queries.routeNameExists(db, name)) throw new ValidationError("A route with that name already exists.", "name");
  const transitType = v.text(input.type, "Transit type", { field: "type", maxLength: 30 });
  const capacity = v.integer(input.capacity, "Daily capacity", { field: "capacity", min: 1, max: LIMITS.capacity });
  const stops = validateStops(db, input.stops);

  const routeId = queries.createRouteWithPathways(db, { name, transitType, capacity, stops });
  return { message: `Route #${routeId} "${name}" created with ${stops.length} pathway segments.`, route_id: routeId };
}

/**
 * Connect two intersections by extending a route: the route must end at
 * `from` (then `to` is added after it) or start at `to` (then `from` is
 * added before it), so the route still runs from -> to.
 */
export function connectIntersections(db, input) {
  const route = requireRoute(db, input.id);
  const from = requireIntersection(db, input.from, "from");
  const to = requireIntersection(db, input.to, "to");
  if (from.IntersectionID === to.IntersectionID) throw new ValidationError("Pick two different intersections.", "to");
  const hasStop = v.boolean(input.stop, "Passenger stop", { field: "stop" });

  const path = queries.routePath(db, route.RouteID);
  const first = path[0]?.IntersectionID, last = path[path.length - 1]?.IntersectionID;
  let added, atStart;
  if (last === from.IntersectionID) [added, atStart] = [to, false];
  else if (first === to.IntersectionID) [added, atStart] = [from, true];
  else {
    throw new ValidationError(
      `${route.RouteName} doesn't end at ${from.Name} or start at ${to.Name}, so it can't be extended between them.`, "id");
  }
  if (path.some((p) => p.IntersectionID === added.IntersectionID)) {
    throw new ValidationError(`${route.RouteName} already goes through ${added.Name}; a route can't visit an intersection twice.`, "id");
  }

  const position = queries.extendRoute(db, { routeId: route.RouteID, intersectionId: added.IntersectionID, hasStop, atStart });
  return {
    message: `${route.RouteName} now runs ${from.Name} → ${to.Name} (${added.Name} added at ${atStart ? "the start" : `the end, position ${position}`}).`,
    route_id: route.RouteID,
  };
}

export function findTransferPoints(db, input) {
  const routeA = requireRoute(db, input.a, "a");
  const routeB = requireRoute(db, input.b, "b");
  if (routeA.RouteID === routeB.RouteID) throw new ValidationError("Choose two different routes.", "b");
  return { a: routeA, b: routeB, hubs: queries.transferPoints(db, routeA.RouteID, routeB.RouteID) };
}
