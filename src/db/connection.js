// Opening the SQLite database, running transactions, and turning database
// errors into messages that make sense to a user.

import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { DB_PATH } from "../config.js";

export class DatabaseSetupError extends Error {
  constructor(message) {
    super(message);
    this.name = "DatabaseSetupError";
  }
}

const REQUIRED_TABLES = ["INTERSECTIONS", "TIME_BLOCKS", "TRANSIT_ROUTES", "TRAFFIC_OBSERVATIONS", "ROUTE_PATHWAYS", "ROAD_SEGMENTS"];

/**
 * Open the project database and check that it contains the schema.
 * SQLite silently creates an empty file for a missing path, so the file is
 * checked first to give a useful message instead.
 */
export function openDatabase(dbPath = DB_PATH) {
  if (!existsSync(dbPath)) {
    throw new DatabaseSetupError(`Database file not found: ${dbPath}. Run "npm run setup" to create it.`);
  }
  const db = new DatabaseSync(dbPath);
  // SQLite only enforces foreign keys when this is enabled on the connection.
  db.exec("PRAGMA foreign_keys = ON");

  const found = new Set(
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name.toUpperCase()),
  );
  const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
  if (missing.length) {
    db.close();
    throw new DatabaseSetupError(`Database is missing tables: ${missing.join(", ")}. Run "npm run setup" to rebuild it.`);
  }
  return db;
}

/** Open a connection, run `work(db)`, and always close the connection afterwards. */
export function withDatabase(work) {
  const db = openDatabase();
  try {
    return work(db);
  } finally {
    db.close();
  }
}

/**
 * Run several statements as one unit: COMMIT if `work` succeeds, ROLLBACK if
 * anything throws, so the database never keeps half of the change.
 */
export function transaction(db, work) {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const isSqliteError = (err) => err?.code === "ERR_SQLITE_ERROR";

/** SQLITE_CONSTRAINT and its extended codes (UNIQUE, CHECK, FOREIGN KEY, ...). */
export const isConstraintError = (err) => isSqliteError(err) && (err.errcode & 0xff) === 19;

/** A short, user-readable explanation of a database error. */
export function friendlyError(err) {
  const message = String(err?.message || "");
  if (isConstraintError(err)) {
    if (message.includes("UNIQUE")) return "That record already exists (duplicate value).";
    if (message.includes("FOREIGN KEY")) return "That change refers to a record that does not exist, or other records depend on it.";
    if (message.includes("CHECK")) return "A value is outside the allowed range.";
    if (message.includes("NOT NULL")) return "A required value is missing.";
    return "The change violates a database rule.";
  }
  if (/locked|busy/i.test(message)) return "The database is busy (locked by another program). Try again.";
  if (/readonly/i.test(message)) return "The database file is read-only; changes cannot be saved.";
  return "The database operation could not be completed.";
}
