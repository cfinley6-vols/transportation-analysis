// Roads: build a street between two intersections (no transit route needed),
// or remove one.

import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import * as v from "../../shared/validate.js";
import { requireIntersection } from "../intersections/service.js";
import * as queries from "./queries.js";

export function addRoad(db, input) {
  const from = requireIntersection(db, input.from, "from");
  const to = requireIntersection(db, input.to, "to");
  if (from.IntersectionID === to.IntersectionID) throw new ValidationError("A road needs two different intersections.", "to");
  if (queries.findRoadBetween(db, from.IntersectionID, to.IntersectionID)) {
    throw new ConflictError(`There is already a road between ${from.Name} and ${to.Name}.`);
  }
  const routes = queries.routesBetween(db, from.IntersectionID, to.IntersectionID);
  if (routes.length) {
    throw new ConflictError(`${from.Name} and ${to.Name} are already connected by ${routes.join(", ")}.`);
  }
  const roadId = queries.insertRoad(db, from.IntersectionID, to.IntersectionID);
  return { message: `Road #${roadId} built between ${from.Name} and ${to.Name}.`, road_id: roadId };
}

export function removeRoad(db, input) {
  const id = v.integer(input.id, "Road ID", { field: "id", min: 1 });
  if (!queries.findRoad(db, id)) throw new NotFoundError(`No road with ID ${id}.`);
  queries.deleteRoad(db, id);
  return { message: `Road #${id} removed.` };
}
