// SQL for TRAFFIC_OBSERVATIONS.

import { INTERSECTION_NAME } from "../../db/sql-fragments.js";

/**
 * Sort options the user may pick. The user sends a key; the matching fixed
 * ORDER BY clause is used, so no user text ever reaches the SQL.
 */
export const OBSERVATION_SORTS = Object.freeze({
  date: { label: "Newest first", orderBy: "o.ObservationDate DESC, tb.StartTime" },
  volume: { label: "Highest vehicle volume", orderBy: "o.VehicleVolume DESC" },
  wait: { label: "Longest wait time", orderBy: "o.AvgWaitTimeSec DESC" },
  queue: { label: "Longest queue", orderBy: "o.MaxQueueLength DESC" },
});

const OBSERVATION_COLUMNS = `
  o.ObservationID AS ID, o.ObservationDate AS Date,
  ${INTERSECTION_NAME} AS Intersection, tb.BlockName AS TimeBlock,
  o.VehicleVolume AS Volume, o.AvgWaitTimeSec AS AvgWaitSec, o.MaxQueueLength AS MaxQueue`;

const OBSERVATION_JOINS = `
  FROM TRAFFIC_OBSERVATIONS o
  JOIN INTERSECTIONS i ON i.IntersectionID = o.IntersectionID
  JOIN TIME_BLOCKS tb ON tb.TimeBlockID = o.TimeBlockID`;

export function findObservation(db, observationId) {
  return db.prepare(`SELECT ${OBSERVATION_COLUMNS} ${OBSERVATION_JOINS} WHERE o.ObservationID = ?`).get(observationId);
}

/** Is there already a reading for this intersection, time block, and day? */
export function observationExists(db, { intersectionId, timeBlockId, date }) {
  const row = db.prepare(
    `SELECT 1 FROM TRAFFIC_OBSERVATIONS
      WHERE IntersectionID = ? AND TimeBlockID = ? AND ObservationDate = ?`,
  ).get(intersectionId, timeBlockId, date);
  return row !== undefined;
}

/** Filtered, sorted, limited list. Filters that are null are left out. */
export function browseObservations(db, { intersectionId, startDate, endDate, minVolume, sortKey, limit }) {
  const conditions = [];
  const params = [];
  if (intersectionId !== null) {
    conditions.push("o.IntersectionID = ?");
    params.push(intersectionId);
  }
  if (startDate) {
    conditions.push("o.ObservationDate >= ?");
    params.push(startDate);
  }
  if (endDate) {
    conditions.push("o.ObservationDate <= ?");
    params.push(endDate);
  }
  if (minVolume !== null) {
    conditions.push("o.VehicleVolume >= ?");
    params.push(minVolume);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { orderBy } = OBSERVATION_SORTS[sortKey];

  return db.prepare(
    `SELECT ${OBSERVATION_COLUMNS} ${OBSERVATION_JOINS}
     ${where}
     ORDER BY ${orderBy}, o.ObservationID
     LIMIT ?`,
  ).all(...params, limit);
}

export function insertObservation(db, { intersectionId, timeBlockId, date, volume, wait, queue }) {
  const result = db.prepare(
    `INSERT INTO TRAFFIC_OBSERVATIONS
       (IntersectionID, TimeBlockID, ObservationDate, VehicleVolume, AvgWaitTimeSec, MaxQueueLength)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(intersectionId, timeBlockId, date, volume, wait, queue);
  return Number(result.lastInsertRowid);
}

/** Returns the number of rows changed (0 if the observation no longer exists). */
export function updateObservation(db, observationId, { volume, wait, queue }) {
  return db.prepare(
    `UPDATE TRAFFIC_OBSERVATIONS
        SET VehicleVolume = ?, AvgWaitTimeSec = ?, MaxQueueLength = ?
      WHERE ObservationID = ?`,
  ).run(volume, wait, queue, observationId).changes;
}

/** Returns the number of rows deleted. */
export function deleteObservation(db, observationId) {
  return db.prepare("DELETE FROM TRAFFIC_OBSERVATIONS WHERE ObservationID = ?").run(observationId).changes;
}
