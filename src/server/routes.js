// Every API endpoint, mapped to the service function that handles it.
// Each handler receives (db, input), where `input` merges the URL query,
// the JSON body, and the `:id` path segment.

import path from "node:path";
import { DB_PATH } from "../config.js";
import { CONTROL_TYPES, LIMITS } from "../shared/constants.js";
import * as intersections from "../features/intersections/service.js";
import * as network from "../features/network/service.js";
import * as observations from "../features/observations/service.js";
import * as reports from "../features/reports/service.js";
import * as roads from "../features/roads/service.js";
import * as routes from "../features/routes/service.js";
import * as timeBlocks from "../features/time-blocks/service.js";

/** Reference data the page needs to build its dropdowns and input limits. */
function meta(db) {
  return {
    database: path.basename(DB_PATH),
    time_blocks: timeBlocks.listTimeBlocks(db),
    control_types: CONTROL_TYPES,
    sorts: observations.sortOptions(),
    limits: LIMITS,
  };
}

export const API_ROUTES = [
  // Reference data and map
  ["GET", "/api/meta", meta],
  ["GET", "/api/network", network.networkMap],

  // 1. Search / browse   2. Related data   3. Add
  ["GET", "/api/intersections", intersections.searchIntersections],
  ["POST", "/api/intersections", intersections.addIntersection],
  ["GET", "/api/intersections/:id", intersections.intersectionProfile],
  ["PUT", "/api/intersections/:id/position", intersections.moveIntersection],
  ["DELETE", "/api/intersections/:id", intersections.deleteIntersection],

  // 1. Browse   3. Add   4. Update / delete
  ["GET", "/api/observations", observations.browseObservations],
  ["POST", "/api/observations", observations.addObservation],
  ["GET", "/api/observations/:id", observations.getObservation],
  ["PUT", "/api/observations/:id", observations.updateObservation],
  ["DELETE", "/api/observations/:id", observations.deleteObservation],

  // 2. Related data   4. Update   6. Additional (transaction, transfer points)
  ["GET", "/api/routes", routes.listRoutes],
  ["POST", "/api/routes", routes.launchRoute],
  ["GET", "/api/routes/transfers", routes.findTransferPoints],
  ["GET", "/api/routes/:id", routes.routeDetail],
  ["PUT", "/api/routes/:id/capacity", routes.updateCapacity],
  ["POST", "/api/routes/:id/connect", routes.connectIntersections],

  // 3. Add   4. Delete: roads between intersections, with or without transit
  ["POST", "/api/roads", roads.addRoad],
  ["DELETE", "/api/roads/:id", roads.removeRoad],

  // 5. Reports
  ["GET", "/api/reports/congestion", reports.congestionReport],
  ["GET", "/api/reports/time-blocks", reports.timeOfDayReport],
  ["GET", "/api/reports/bottlenecks", reports.bottleneckReport],
].map(([method, pattern, handler]) => ({
  method,
  handler,
  regex: new RegExp(`^${pattern.replace(":id", "([^/]+)")}$`),
}));

/** Find the handler for a request. `pathKnown` distinguishes 405 from 404. */
export function matchRoute(method, pathname) {
  let pathKnown = false;
  for (const route of API_ROUTES) {
    const match = route.regex.exec(pathname);
    if (!match) continue;
    if (route.method === method) {
      return { handler: route.handler, params: match[1] === undefined ? {} : { id: decodeURIComponent(match[1]) } };
    }
    pathKnown = true;
  }
  return { handler: null, pathKnown };
}
