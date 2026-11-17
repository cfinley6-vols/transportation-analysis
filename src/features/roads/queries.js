// SQL for ROAD_SEGMENTS: the street network. Each row is one block of one named
// street between two intersections, stored once with the lower intersection ID
// first (the table's CHECK requires it).

import { INTERSECTION_NAME } from "../../db/sql-fragments.js";

const ordered = (a, b) => (a < b ? [a, b] : [b, a]);

/** Names of the routes that travel this block (consecutive stops x, y in either direction). */
export function routesOnRoad(db, x, y) {
  return db.prepare(
    `SELECT DISTINCT tr.RouteName
       FROM ROUTE_PATHWAYS here
       JOIN ROUTE_PATHWAYS next
         ON next.RouteID = here.RouteID AND next.SequenceOrder = here.SequenceOrder + 1
       JOIN TRANSIT_ROUTES tr ON tr.RouteID = here.RouteID
      WHERE (here.IntersectionID = ? AND next.IntersectionID = ?)
         OR (here.IntersectionID = ? AND next.IntersectionID = ?)
      ORDER BY tr.RouteName`,
  ).all(x, y, y, x).map((row) => row.RouteName);
}

/** The roads at one intersection, each with the intersection at its other end. */
export function roadsAt(db, intersectionId) {
  return db.prepare(
    `SELECT r.RoadID AS ID, r.StreetName AS Street, i.IntersectionID AS OtherID, ${INTERSECTION_NAME} AS Other
       FROM ROAD_SEGMENTS r
       JOIN INTERSECTIONS i
         ON i.IntersectionID = CASE WHEN r.IntersectionA = ? THEN r.IntersectionB ELSE r.IntersectionA END
      WHERE r.IntersectionA = ? OR r.IntersectionB = ?
      ORDER BY r.StreetName, i.IntersectionID`,
  ).all(intersectionId, intersectionId, intersectionId)
    .map((road) => ({ ...road, Routes: routesOnRoad(db, intersectionId, road.OtherID) }));
}

export function listRoads(db) {
  return db.prepare(
    `SELECT RoadID AS ID, IntersectionA AS a, IntersectionB AS b, StreetName AS Street
       FROM ROAD_SEGMENTS
      ORDER BY RoadID`,
  ).all();
}

export function findRoad(db, roadId) {
  return db.prepare("SELECT RoadID, IntersectionA, IntersectionB, StreetName FROM ROAD_SEGMENTS WHERE RoadID = ?").get(roadId);
}

export function findRoadBetween(db, x, y) {
  return db.prepare("SELECT RoadID FROM ROAD_SEGMENTS WHERE IntersectionA = ? AND IntersectionB = ?").get(...ordered(x, y));
}

export function insertRoad(db, x, y, street) {
  return Number(
    db.prepare("INSERT INTO ROAD_SEGMENTS (IntersectionA, IntersectionB, StreetName) VALUES (?, ?, ?)")
      .run(...ordered(x, y), street).lastInsertRowid,
  );
}

export function deleteRoad(db, roadId) {
  return db.prepare("DELETE FROM ROAD_SEGMENTS WHERE RoadID = ?").run(roadId).changes;
}
