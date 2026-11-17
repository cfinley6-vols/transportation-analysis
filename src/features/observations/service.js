// Traffic observations: browse, record, correct, and delete readings.

import { LIMITS } from "../../shared/constants.js";
import { ConflictError, NotFoundError } from "../../shared/errors.js";
import * as v from "../../shared/validate.js";
import { requireIntersection } from "../intersections/service.js";
import { requireTimeBlockId } from "../time-blocks/service.js";
import * as queries from "./queries.js";

export const sortOptions = () =>
  Object.entries(queries.OBSERVATION_SORTS).map(([key, { label }]) => ({ key, label }));

function requireObservation(db, rawId) {
  const id = v.integer(rawId, "Observation ID", { field: "id", min: 1 });
  const observation = queries.findObservation(db, id);
  if (!observation) throw new NotFoundError(`No traffic observation with ID ${id}.`);
  return observation;
}

/** The three measured values, each range-checked. */
function readingValues(input) {
  return {
    volume: v.integer(input.volume, "Vehicle volume", { field: "volume", min: 0, max: LIMITS.volume }),
    wait: v.integer(input.wait, "Average wait time", { field: "wait", min: 0, max: LIMITS.wait }),
    queue: v.integer(input.queue, "Maximum queue length", { field: "queue", min: 0, max: LIMITS.queue }),
  };
}

export function browseObservations(db, input) {
  const intersectionId = input.intersection
    ? requireIntersection(db, input.intersection, "intersection").IntersectionID
    : null;
  const startDate = v.isoDate(input.start, "Start date", { field: "start", required: false });
  const endDate = v.isoDate(input.end, "End date", { field: "end", required: false });
  v.dateRange(startDate, endDate);

  return queries.browseObservations(db, {
    intersectionId,
    startDate,
    endDate,
    minVolume: v.integer(input.min_volume, "Minimum volume", { field: "min_volume", min: 0, required: false }),
    sortKey: v.oneOf(input.sort || "date", Object.keys(queries.OBSERVATION_SORTS), "Sort order", { field: "sort" }),
    limit: v.integer(input.limit || 25, "Row limit", { field: "limit", min: 1, max: 500 }),
  });
}

export const getObservation = (db, input) => requireObservation(db, input.id);

export function addObservation(db, input) {
  const intersectionId = requireIntersection(db, input.intersection_id).IntersectionID;
  const timeBlockId = requireTimeBlockId(db, input.time_block_id);
  const date = v.isoDate(input.date, "Observation date", { field: "date" });
  const values = readingValues(input);

  // Friendly duplicate check; the UNIQUE constraint is the final safeguard.
  if (queries.observationExists(db, { intersectionId, timeBlockId, date })) {
    throw new ConflictError(
      "An observation for that intersection, time block, and date already exists. Edit that observation instead.",
    );
  }
  const id = queries.insertObservation(db, { intersectionId, timeBlockId, date, ...values });
  return { message: `Observation #${id} saved.`, observation: queries.findObservation(db, id) };
}

export function updateObservation(db, input) {
  const current = requireObservation(db, input.id);
  const values = readingValues(input);
  if (values.volume === current.Volume && values.wait === current.AvgWaitSec && values.queue === current.MaxQueue) {
    return { message: "No changes made.", observation: current };
  }
  if (queries.updateObservation(db, current.ID, values) === 0) {
    throw new NotFoundError("The observation no longer exists.");
  }
  return { message: `Observation #${current.ID} updated.`, observation: queries.findObservation(db, current.ID) };
}

export function deleteObservation(db, input) {
  const current = requireObservation(db, input.id);
  if (queries.deleteObservation(db, current.ID) === 0) {
    throw new NotFoundError("The observation no longer exists.");
  }
  return { message: `Observation #${current.ID} deleted.` };
}
