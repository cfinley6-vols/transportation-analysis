// Fixed values used by validation and sent to the page for its forms.

/** Sanity limits for user-entered numbers (prevents typos like 99999999). */
export const LIMITS = Object.freeze({
  volume: 100_000,     // vehicles in one time block
  wait: 3_600,         // seconds (one hour)
  queue: 1_000,        // vehicles
  capacity: 1_000_000, // riders per day
});

/** Must match the CHECK constraint on INTERSECTIONS.ControlType in schema.sql. */
export const CONTROL_TYPES = Object.freeze(["Traffic Light", "Stop Sign", "Uncontrolled", "Roundabout"]);
