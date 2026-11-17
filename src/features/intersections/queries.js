// SQL for INTERSECTIONS and the data related to one intersection.

import { transaction } from "../../db/connection.js";
import { INTERSECTION_NAME, containsPattern } from "../../db/sql-fragments.js";

export function findIntersection(db, intersectionId) {
  return db.prepare(
    `SELECT i.IntersectionID, ${INTERSECTION_NAME} AS Name,
            i.MainStreet, i.CrossStreet, i.ControlType, i.Neighborhood, i.MapX, i.MapY
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

/**
 * Add an intersection and connect it to its neighbors, in ONE transaction.
 * `connections` is [{ street, neighbors: [ids], split: {a, b} | null }]:
 *   - each neighbor gets a new road segment on `street`;
 *   - `split` is an existing block (a-b) the new corner lands in the middle of.
 *     That road is replaced by the two shorter ones, and every route that ran
 *     a -> b (or b -> a) now passes through the new corner without stopping
 *     (later stops move down one place, through negative numbers so
 *     UNIQUE (RouteID, SequenceOrder) never sees a duplicate mid-update).
 * Returns the new IntersectionID and the names of the routes rerouted.
 */
export function insertIntersectionWithRoads(db, { mainStreet, crossStreet, controlType, neighborhood, mapX, mapY }, connections) {
  return transaction(db, () => {
    const id = Number(db.prepare(
      `INSERT INTO INTERSECTIONS (MainStreet, CrossStreet, ControlType, Neighborhood, MapX, MapY)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(mainStreet, crossStreet, controlType, neighborhood, mapX, mapY).lastInsertRowid);

    const rerouted = [];
    for (const { street, neighbors, split } of connections) {
      if (split) {
        const runs = db.prepare(
          `SELECT here.RouteID, here.SequenceOrder AS Seq, tr.RouteName
             FROM ROUTE_PATHWAYS here
             JOIN ROUTE_PATHWAYS next ON next.RouteID = here.RouteID AND next.SequenceOrder = here.SequenceOrder + 1
             JOIN TRANSIT_ROUTES tr ON tr.RouteID = here.RouteID
            WHERE (here.IntersectionID = ? AND next.IntersectionID = ?) OR (here.IntersectionID = ? AND next.IntersectionID = ?)`,
        ).all(split.a, split.b, split.b, split.a);
        for (const run of runs) {
          db.prepare("UPDATE ROUTE_PATHWAYS SET SequenceOrder = -(SequenceOrder + 1) WHERE RouteID = ? AND SequenceOrder > ?")
            .run(run.RouteID, run.Seq);
          db.prepare("UPDATE ROUTE_PATHWAYS SET SequenceOrder = -SequenceOrder WHERE RouteID = ? AND SequenceOrder < 0").run(run.RouteID);
          db.prepare("INSERT INTO ROUTE_PATHWAYS (RouteID, IntersectionID, SequenceOrder, HasTransitStop) VALUES (?, ?, ?, 0)")
            .run(run.RouteID, id, run.Seq + 1);
          rerouted.push(run.RouteName);
        }
        db.prepare("DELETE FROM ROAD_SEGMENTS WHERE IntersectionA = ? AND IntersectionB = ?")
          .run(Math.min(split.a, split.b), Math.max(split.a, split.b));
      }
      for (const other of neighbors) {
        db.prepare("INSERT OR IGNORE INTO ROAD_SEGMENTS (IntersectionA, IntersectionB, StreetName) VALUES (?, ?, ?)")
          .run(Math.min(id, other), Math.max(id, other), street);
      }
    }
    return { id, rerouted };
  });
}

export function countObservations(db, intersectionId) {
  return db.prepare("SELECT COUNT(*) AS n FROM TRAFFIC_OBSERVATIONS WHERE IntersectionID = ?").get(intersectionId).n;
}

/**
 * Delete an intersection in ONE transaction:
 *   1. Where a street runs straight through it (one block on each side), the
 *      two blocks are joined into one, so the street stays continuous.
 *   2. Each route through it loses that stop and the later stops move up one
 *      place (through negative numbers, so UNIQUE (RouteID, SequenceOrder)
 *      never sees a duplicate mid-update).
 *   3. The intersection row goes; ON DELETE CASCADE removes its observations
 *      and its own road segments.
 * If anything fails, nothing is changed. Returns the streets whose blocks were joined.
 */
export function deleteIntersectionAndShortenRoutes(db, intersectionId) {
  return transaction(db, () => {
    const roads = db.prepare(
      `SELECT StreetName, CASE WHEN IntersectionA = ? THEN IntersectionB ELSE IntersectionA END AS Other
         FROM ROAD_SEGMENTS WHERE IntersectionA = ? OR IntersectionB = ?`,
    ).all(intersectionId, intersectionId, intersectionId);
    const joined = [];
    for (const street of new Set(roads.map((r) => r.StreetName))) {
      const ends = roads.filter((r) => r.StreetName === street).map((r) => r.Other);
      if (ends.length !== 2) continue;
      const [a, b] = ends[0] < ends[1] ? ends : [ends[1], ends[0]];
      db.prepare("INSERT OR IGNORE INTO ROAD_SEGMENTS (IntersectionA, IntersectionB, StreetName) VALUES (?, ?, ?)").run(a, b, street);
      joined.push(street);
    }

    const stops = db.prepare("SELECT RouteID, SequenceOrder FROM ROUTE_PATHWAYS WHERE IntersectionID = ?").all(intersectionId);
    for (const { RouteID, SequenceOrder } of stops) {
      db.prepare("DELETE FROM ROUTE_PATHWAYS WHERE RouteID = ? AND IntersectionID = ?").run(RouteID, intersectionId);
      db.prepare("UPDATE ROUTE_PATHWAYS SET SequenceOrder = -(SequenceOrder - 1) WHERE RouteID = ? AND SequenceOrder > ?")
        .run(RouteID, SequenceOrder);
      db.prepare("UPDATE ROUTE_PATHWAYS SET SequenceOrder = -SequenceOrder WHERE RouteID = ? AND SequenceOrder < 0").run(RouteID);
    }
    db.prepare("DELETE FROM INTERSECTIONS WHERE IntersectionID = ?").run(intersectionId);
    return joined;
  });
}

/** Every intersection that has a map position. */
export function placedIntersections(db) {
  return db.prepare(
    `SELECT IntersectionID, MainStreet, CrossStreet, MapX, MapY
       FROM INTERSECTIONS
      WHERE MapX IS NOT NULL`,
  ).all();
}

export function updatePosition(db, intersectionId, mapX, mapY) {
  return db.prepare("UPDATE INTERSECTIONS SET MapX = ?, MapY = ? WHERE IntersectionID = ?")
    .run(mapX, mapY, intersectionId).changes;
}
