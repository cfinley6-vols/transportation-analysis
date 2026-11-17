// SQL for the summary reports (joins, aggregates, GROUP BY, HAVING, view).

import { INTERSECTION_NAME, levelOfService } from "../../db/sql-fragments.js";

/** Intersections ranked by average wait, keeping those at or above a threshold. */
export function intersectionCongestion(db, minAvgWait) {
  return db.prepare(
    `SELECT i.IntersectionID AS ID, ${INTERSECTION_NAME} AS Intersection, i.Neighborhood,
            COUNT(*) AS Readings,
            CAST(ROUND(AVG(o.VehicleVolume)) AS INTEGER) AS AvgVolume,
            ROUND(AVG(o.AvgWaitTimeSec), 1) AS AvgWaitSec,
            MAX(o.MaxQueueLength) AS WorstQueue,
            ${levelOfService("AVG(o.AvgWaitTimeSec)")} AS Level
       FROM INTERSECTIONS i
       JOIN TRAFFIC_OBSERVATIONS o ON o.IntersectionID = i.IntersectionID
      GROUP BY i.IntersectionID
     HAVING AVG(o.AvgWaitTimeSec) >= ?
      ORDER BY AVG(o.AvgWaitTimeSec) DESC`,
  ).all(minAvgWait);
}

/** Citywide traffic per time block, optionally limited to a date range (null = no limit). */
export function trafficByTimeOfDay(db, startDate, endDate) {
  return db.prepare(
    `SELECT tb.BlockName AS TimeBlock,
            tb.StartTime || '-' || tb.EndTime AS Hours,
            COUNT(o.ObservationID) AS Readings,
            SUM(o.VehicleVolume) AS TotalVolume,
            CAST(ROUND(AVG(o.VehicleVolume)) AS INTEGER) AS AvgVolume,
            ROUND(AVG(o.AvgWaitTimeSec), 1) AS AvgWaitSec,
            MAX(o.MaxQueueLength) AS WorstQueue
       FROM TIME_BLOCKS tb
       LEFT JOIN TRAFFIC_OBSERVATIONS o
              ON o.TimeBlockID = tb.TimeBlockID
             AND (? IS NULL OR o.ObservationDate >= ?)
             AND (? IS NULL OR o.ObservationDate <= ?)
      GROUP BY tb.TimeBlockID
      ORDER BY tb.StartTime`,
  ).all(startDate, startDate, endDate, endDate);
}

/** Transit stops slowed by traffic, built on the v_transit_hub_congestion view. */
export function transitBottlenecks(db, minAvgWait) {
  return db.prepare(
    `SELECT IntersectionName AS Stop, RouteName AS Route, BlockName AS TimeBlock,
            COUNT(*) AS Readings,
            ROUND(AVG(AvgWaitTimeSec), 1) AS AvgWaitSec,
            MAX(MaxQueueLength) AS WorstQueue
       FROM v_transit_hub_congestion
      GROUP BY IntersectionName, RouteName, BlockName
     HAVING AVG(AvgWaitTimeSec) >= ?
      ORDER BY AVG(AvgWaitTimeSec) DESC, Route`,
  ).all(minAvgWait);
}
