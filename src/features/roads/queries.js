// SQL for ROAD_SEGMENTS: streets between two intersections, with or without transit.
// Each road is stored once, lower intersection ID first (the table's CHECK requires it).

const ordered = (a, b) => (a < b ? [a, b] : [b, a]);

export function listRoads(db) {
  return db.prepare(
    `SELECT RoadID AS ID, IntersectionA AS a, IntersectionB AS b
       FROM ROAD_SEGMENTS
      ORDER BY RoadID`,
  ).all();
}

export function findRoad(db, roadId) {
  return db.prepare("SELECT RoadID, IntersectionA, IntersectionB FROM ROAD_SEGMENTS WHERE RoadID = ?").get(roadId);
}

export function findRoadBetween(db, x, y) {
  return db.prepare("SELECT RoadID FROM ROAD_SEGMENTS WHERE IntersectionA = ? AND IntersectionB = ?").get(...ordered(x, y));
}

/** Routes that already travel directly between the two intersections (consecutive stops, either direction). */
export function routesBetween(db, x, y) {
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

export function insertRoad(db, x, y) {
  return Number(
    db.prepare("INSERT INTO ROAD_SEGMENTS (IntersectionA, IntersectionB) VALUES (?, ?)").run(...ordered(x, y)).lastInsertRowid,
  );
}

export function deleteRoad(db, roadId) {
  return db.prepare("DELETE FROM ROAD_SEGMENTS WHERE RoadID = ?").run(roadId).changes;
}
