// Fixed pieces of SQL reused by several queries. These are constants written
// here, never user input; user values always go through `?` placeholders.

/** Display name of an intersection, e.g. "Main St & 2nd Ave" (table alias `i`). */
export const INTERSECTION_NAME = "i.MainStreet || ' & ' || i.CrossStreet";

/**
 * Level of service (LOS A–F) for an average-delay expression, in seconds, using
 * the Highway Capacity Manual thresholds for signalized intersections. LOS is
 * the standard grade traffic engineers use to describe intersection delay.
 */
export const levelOfService = (avgWait) => `CASE
    WHEN ${avgWait} <= 10 THEN 'LOS A'
    WHEN ${avgWait} <= 20 THEN 'LOS B'
    WHEN ${avgWait} <= 35 THEN 'LOS C'
    WHEN ${avgWait} <= 55 THEN 'LOS D'
    WHEN ${avgWait} <= 80 THEN 'LOS E'
    ELSE 'LOS F'
  END`;

/** A "contains" pattern for LIKE ... ESCAPE '\', with LIKE wildcards in the term escaped. */
export function containsPattern(term) {
  const escaped = term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
  return `%${escaped}%`;
}
