// SQL for the network map: every intersection with its congestion.

import { INTERSECTION_NAME, levelOfService } from "../../db/sql-fragments.js";

/**
 * LEFT JOIN keeps intersections with no readings (they show as "No data").
 * The optional time-block filter is in the ON clause, so it narrows the
 * readings without dropping intersections. Pass null for all time blocks.
 */
export function intersectionsWithCongestion(db, timeBlockId) {
  return db.prepare(
    `SELECT i.IntersectionID AS ID, ${INTERSECTION_NAME} AS Name,
            i.MainStreet, i.CrossStreet, i.ControlType, i.Neighborhood, i.MapX, i.MapY,
            COUNT(o.ObservationID) AS Readings,
            CAST(ROUND(AVG(o.VehicleVolume)) AS INTEGER) AS AvgVolume,
            ROUND(AVG(o.AvgWaitTimeSec), 1) AS AvgWaitSec,
            MAX(o.MaxQueueLength) AS WorstQueue,
            CASE WHEN COUNT(o.ObservationID) = 0 THEN 'No data'
                 ELSE ${levelOfService("AVG(o.AvgWaitTimeSec)")}
            END AS Level
       FROM INTERSECTIONS i
       LEFT JOIN TRAFFIC_OBSERVATIONS o
              ON o.IntersectionID = i.IntersectionID
             AND (? IS NULL OR o.TimeBlockID = ?)
      GROUP BY i.IntersectionID
      ORDER BY i.IntersectionID`,
  ).all(timeBlockId, timeBlockId);
}
