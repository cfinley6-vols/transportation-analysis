// Intersections: search, profile (related data), and adding new ones.

import { CONTROL_TYPES } from "../../shared/constants.js";
import { ConflictError, NotFoundError, ValidationError } from "../../shared/errors.js";
import * as v from "../../shared/validate.js";
import * as queries from "./queries.js";

/** Validate an intersection ID and load the row, or throw NotFoundError. */
export function requireIntersection(db, rawId, field = "intersection_id") {
  const id = v.integer(rawId, "Intersection ID", { field, min: 1 });
  const intersection = queries.findIntersection(db, id);
  if (!intersection) throw new NotFoundError(`No intersection with ID ${id}.`);
  return intersection;
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

  const id = queries.insertIntersection(db, { mainStreet, crossStreet, controlType, neighborhood });
  return { message: `Intersection #${id} added.`, intersection: queries.findIntersection(db, id) };
}
