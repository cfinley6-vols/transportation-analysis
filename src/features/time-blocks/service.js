// Time blocks are reference data (Morning Peak, Midday, ...).

import { ValidationError } from "../../shared/errors.js";
import * as v from "../../shared/validate.js";
import * as queries from "./queries.js";

export const listTimeBlocks = (db) => queries.listTimeBlocks(db);

/** Validate a time block ID and confirm it exists. Returns the ID, or null if optional and blank. */
export function requireTimeBlockId(db, rawId, { required = true } = {}) {
  const id = v.integer(rawId, "Time block", { field: "time_block_id", min: 1, required });
  if (id !== null && !queries.findTimeBlock(db, id)) {
    throw new ValidationError(`No time block with ID ${id}.`, "time_block_id");
  }
  return id;
}
