// SQL for INTERSECTIONS and the data related to one intersection.

import { INTERSECTION_NAME, containsPattern } from "../../db/sql-fragments.js";

export function findIntersection(db, intersectionId) {
  return db.prepare(
    `SELECT i.IntersectionID, ${INTERSECTION_NAME} AS Name,
            i.MainStreet, i.CrossStreet, i.ControlType, i.Neighborhood
       FROM INTERSECTIONS i
      WHERE i.IntersectionID = ?`,
  ).get(intersectionId);
}

/** An intersection with these two streets in either order (case-insensitive). */
export function findByStreets(db, streetA, streetB) {
  return db.prepare(
    `SELECT IntersectionID FROM INTERSECTIONS
      WHERE (LOWER(MainStreet) = LOWER(?) AND LOWER(CrossStreet) = LOWER(?))
         OR (LOWER(MainStreet) = LOWER(?) AND LOWER(CrossStreet) = LOWER(?))`,
  ).get(streetA, streetB, streetB, streetA);
}

/**
 * Search intersections. Each filter that is null is left out. Only fixed SQL
 * fragments are combined; the user's values go in the parameter list.
 */
export function searchIntersections(db, { street, neighborhood, controlType }) {
  const conditions = [];
  const params = [];
  if (street) {
    conditions.push("(i.MainStreet LIKE ? ESCAPE '\\' OR i.CrossStreet LIKE ? ESCAPE '\\')");
    params.push(containsPattern(street), containsPattern(street));
  }
  if (neighborhood) {
    conditions.push("i.Neighborhood LIKE ? ESCAPE '\\'");
    params.push(containsPattern(neighborhood));
  }
  if (controlType) {
    conditions.push("i.ControlType = ?");
    params.push(controlType);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  // Correlated subqueries count related rows without multiplying join results.
  return db.prepare(
    `SELECT i.IntersectionID AS ID, ${INTERSECTION_NAME} AS Intersection,
            i.ControlType AS Control, i.Neighborhood,
            (SELECT COUNT(DISTINCT rp.RouteID) FROM ROUTE_PATHWAYS rp
              WHERE rp.IntersectionID = i.IntersectionID) AS Routes,
            (SELECT COUNT(*) FROM TRAFFIC_OBSERVATIONS o
              WHERE o.IntersectionID = i.IntersectionID) AS Observations
       FROM INTERSECTIONS i
       ${where}
      ORDER BY i.Neighborhood, i.MainStreet, i.CrossStreet`,
  ).all(...params);
}

/** Transit routes that pass through one intersection (join). */
export function routesThroughIntersection(db, intersectionId) {
  return db.prepare(
    `SELECT tr.RouteID, tr.RouteName AS Route, tr.TransitType AS Type,
            rp.SequenceOrder AS Seq,
            CASE rp.HasTransitStop WHEN 1 THEN 'Stop' ELSE 'Pass-through' END AS StopType
       FROM ROUTE_PATHWAYS rp
       JOIN TRANSIT_ROUTES tr ON tr.RouteID = rp.RouteID
      WHERE rp.IntersectionID = ?
      ORDER BY tr.RouteName`,
  ).all(intersectionId);
}

/** Average conditions at one intersection for each time block (LEFT JOIN keeps empty blocks). */
export function trafficByTimeBlock(db, intersectionId) {
  return db.prepare(
    `SELECT tb.BlockName AS TimeBlock,
            tb.StartTime || '-' || tb.EndTime AS Hours,
            COUNT(o.ObservationID) AS Readings,
            CAST(ROUND(AVG(o.VehicleVolume)) AS INTEGER) AS AvgVolume,
            ROUND(AVG(o.AvgWaitTimeSec), 1) AS AvgWaitSec,
            MAX(o.MaxQueueLength) AS WorstQueue
       FROM TIME_BLOCKS tb
       LEFT JOIN TRAFFIC_OBSERVATIONS o
              ON o.TimeBlockID = tb.TimeBlockID AND o.IntersectionID = ?
      GROUP BY tb.TimeBlockID
      ORDER BY tb.StartTime`,
  ).all(intersectionId);
}

export function insertIntersection(db, { mainStreet, crossStreet, controlType, neighborhood }) {
  const result = db.prepare(
    `INSERT INTO INTERSECTIONS (MainStreet, CrossStreet, ControlType, Neighborhood)
     VALUES (?, ?, ?, ?)`,
  ).run(mainStreet, crossStreet, controlType, neighborhood);
  return Number(result.lastInsertRowid);
}
