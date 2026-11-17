// Summary reports.

import { LIMITS } from "../../shared/constants.js";
import * as v from "../../shared/validate.js";
import * as queries from "./queries.js";

const minWait = (raw, fallback) =>
  v.integer(raw === undefined || raw === "" ? fallback : raw, "Minimum average wait", {
    field: "min_wait", min: 0, max: LIMITS.wait,
  });

export const congestionReport = (db, input) => queries.intersectionCongestion(db, minWait(input.min_wait, 0));

export function timeOfDayReport(db, input) {
  const start = v.isoDate(input.start, "Start date", { field: "start", required: false });
  const end = v.isoDate(input.end, "End date", { field: "end", required: false });
  v.dateRange(start, end);
  return queries.trafficByTimeOfDay(db, start, end);
}

export const bottleneckReport = (db, input) => queries.transitBottlenecks(db, minWait(input.min_wait, 50));
