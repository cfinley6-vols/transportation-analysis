// Data for the network map: intersections colored by congestion, each
// route's ordered path so the page can draw the route lines, and the roads
// built without a route.

import * as roadQueries from "../roads/queries.js";
import * as routeQueries from "../routes/queries.js";
import { requireTimeBlockId } from "../time-blocks/service.js";
import * as queries from "./queries.js";

export function networkMap(db, input) {
  const timeBlockId = requireTimeBlockId(db, input.time_block, { required: false });
  const routes = routeQueries.listRoutes(db).map((route) => ({ ...route, Path: [] }));
  const routesById = new Map(routes.map((route) => [route.ID, route]));

  // Group the (already ordered) pathway rows under their route.
  for (const segment of routeQueries.allPathways(db)) {
    routesById.get(segment.RouteID).Path.push({ id: segment.IntersectionID, stop: segment.HasTransitStop === 1 });
  }
  return { intersections: queries.intersectionsWithCongestion(db, timeBlockId), routes, roads: roadQueries.listRoads(db) };
}
