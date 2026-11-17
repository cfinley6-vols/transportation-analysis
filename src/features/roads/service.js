// Roads: build one block of a street between two intersections, or remove one.
// A road is named after the street both intersections are on; intersections
// that share no street can't be joined directly.

import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import * as v from "../../shared/validate.js";
import { requireIntersection, sharedStreet } from "../intersections/service.js";
import * as queries from "./queries.js";

export function addRoad(db, input) {
  const from = requireIntersection(db, input.from, "from");
  const to = requireIntersection(db, input.to, "to");
  if (from.IntersectionID === to.IntersectionID) throw new ValidationError("A road needs two different intersections.", "to");
  const street = sharedStreet(from, to);
  if (!street) {
    throw new ValidationError(`${from.Name} and ${to.Name} aren't on the same street, so a road can't join them directly.`, "to");
  }
  if (queries.findRoadBetween(db, from.IntersectionID, to.IntersectionID)) {
    throw new ConflictError(`There is already a road between ${from.Name} and ${to.Name}.`);
  }
  const roadId = queries.insertRoad(db, from.IntersectionID, to.IntersectionID, street);
  return { message: `Road #${roadId} built on ${street}, between ${from.Name} and ${to.Name}.`, road_id: roadId };
}

export function removeRoad(db, input) {
  const id = v.integer(input.id, "Road ID", { field: "id", min: 1 });
  const road = queries.findRoad(db, id);
  if (!road) throw new NotFoundError(`No road with ID ${id}.`);
  // Routes travel along roads, so a block a route uses has to stay.
  const routes = queries.routesOnRoad(db, road.IntersectionA, road.IntersectionB);
  if (routes.length) {
    throw new ConflictError(`${routes.join(", ")} ${routes.length === 1 ? "runs" : "run"} on this block of ${road.StreetName}, so the road can't be removed.`);
  }
  queries.deleteRoad(db, id);
  return { message: `Road #${id} on ${road.StreetName} removed.` };
}
