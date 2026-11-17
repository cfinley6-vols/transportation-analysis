// SQL for TRANSIT_ROUTES and ROUTE_PATHWAYS.

import { transaction } from "../../db/connection.js";
import { INTERSECTION_NAME } from "../../db/sql-fragments.js";

export function findRoute(db, routeId) {
  return db.prepare(
    `SELECT RouteID, RouteName, TransitType, DailyCapacity
       FROM TRANSIT_ROUTES
      WHERE RouteID = ?`,
  ).get(routeId);
}

/** All routes with the number of pathway segments each has. */
export function listRoutes(db) {
  return db.prepare(
    `SELECT tr.RouteID AS ID, tr.RouteName AS Route, tr.TransitType AS Type,
            tr.DailyCapacity AS Capacity, COUNT(rp.PathwayID) AS Segments
       FROM TRANSIT_ROUTES tr
       LEFT JOIN ROUTE_PATHWAYS rp ON rp.RouteID = tr.RouteID
      GROUP BY tr.RouteID
      ORDER BY tr.RouteID`,
  ).all();
}

export function routeNameExists(db, name) {
  return db.prepare("SELECT 1 FROM TRANSIT_ROUTES WHERE LOWER(RouteName) = LOWER(?)").get(name) !== undefined;
}

/** A route's intersections in travel order, with each one's average congestion. */
export function routePath(db, routeId) {
  return db.prepare(
    `SELECT rp.SequenceOrder AS Seq, i.IntersectionID AS IntersectionID,
            ${INTERSECTION_NAME} AS Intersection, i.Neighborhood,
            CASE rp.HasTransitStop WHEN 1 THEN 'Stop' ELSE 'Pass-through' END AS StopType,
            stats.AvgWait AS AvgWaitSec, stats.WorstQueue AS WorstQueue
       FROM ROUTE_PATHWAYS rp
       JOIN INTERSECTIONS i ON i.IntersectionID = rp.IntersectionID
       LEFT JOIN (
            SELECT IntersectionID,
                   ROUND(AVG(AvgWaitTimeSec), 1) AS AvgWait,
                   MAX(MaxQueueLength) AS WorstQueue
              FROM TRAFFIC_OBSERVATIONS
             GROUP BY IntersectionID
       ) stats ON stats.IntersectionID = i.IntersectionID
      WHERE rp.RouteID = ?
      ORDER BY rp.SequenceOrder`,
  ).all(routeId);
}

/** Every pathway segment of every route, in travel order (for drawing the map). */
export function allPathways(db) {
  return db.prepare(
    `SELECT RouteID, IntersectionID, SequenceOrder, HasTransitStop
       FROM ROUTE_PATHWAYS
      ORDER BY RouteID, SequenceOrder`,
  ).all();
}

export function updateRouteCapacity(db, routeId, capacity) {
  return db.prepare("UPDATE TRANSIT_ROUTES SET DailyCapacity = ? WHERE RouteID = ?").run(capacity, routeId).changes;
}

/**
 * Create a route and its ordered pathway in ONE transaction.
 * `stops` is [{ intersectionId, hasStop }] in travel order. If any pathway
 * insert fails, the route insert is rolled back too, so the database never
 * holds a route without its path (or path rows without a route).
 */
export function createRouteWithPathways(db, { name, transitType, capacity, stops }) {
  return transaction(db, () => {
    const routeId = Number(
      db.prepare("INSERT INTO TRANSIT_ROUTES (RouteName, TransitType, DailyCapacity) VALUES (?, ?, ?)")
        .run(name, transitType, capacity).lastInsertRowid,
    );
    const insertPathway = db.prepare(
      `INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop)
       VALUES (?, ?, ?, ?)`,
    );
    stops.forEach((stop, index) => insertPathway.run(routeId, stop.intersectionId, index + 1, stop.hasStop ? 1 : 0));
    return routeId;
  });
}

/**
 * Add one intersection to the start or end of a route, in ONE transaction.
 * Adding at the start renumbers the existing stops first (2, 3, ...). The
 * numbers pass through negative values so UNIQUE (RouteID, SequenceOrder)
 * never sees two rows with the same position mid-update.
 */
export function extendRoute(db, { routeId, intersectionId, hasStop, atStart }) {
  return transaction(db, () => {
    let position;
    if (atStart) {
      db.prepare("UPDATE ROUTE_PATHWAYS SET SequenceOrder = -SequenceOrder WHERE RouteID = ?").run(routeId);
      db.prepare("UPDATE ROUTE_PATHWAYS SET SequenceOrder = 1 - SequenceOrder WHERE RouteID = ?").run(routeId);
      position = 1;
    } else {
      position = db.prepare("SELECT COALESCE(MAX(SequenceOrder), 0) + 1 AS Next FROM ROUTE_PATHWAYS WHERE RouteID = ?")
        .get(routeId).Next;
    }
    db.prepare(
      `INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop)
       VALUES (?, ?, ?, ?)`,
    ).run(routeId, intersectionId, position, hasStop ? 1 : 0);
    return position;
  });
}

/**
 * Intersections on both routes, and whether riders can transfer there.
 * Joining ROUTE_PATHWAYS twice (once per route) keeps only shared intersections.
 */
export function transferPoints(db, routeA, routeB) {
  return db.prepare(
    `SELECT i.IntersectionID AS ID, ${INTERSECTION_NAME} AS Intersection, i.Neighborhood,
            CASE a.HasTransitStop WHEN 1 THEN 'Stop' ELSE 'Pass-through' END AS RouteA,
            CASE b.HasTransitStop WHEN 1 THEN 'Stop' ELSE 'Pass-through' END AS RouteB,
            CASE WHEN a.HasTransitStop = 1 AND b.HasTransitStop = 1 THEN 'Yes' ELSE 'No' END AS CanTransfer
       FROM INTERSECTIONS i
       JOIN ROUTE_PATHWAYS a ON a.IntersectionID = i.IntersectionID AND a.RouteID = ?
       JOIN ROUTE_PATHWAYS b ON b.IntersectionID = i.IntersectionID AND b.RouteID = ?
      ORDER BY a.SequenceOrder`,
  ).all(routeA, routeB);
}
