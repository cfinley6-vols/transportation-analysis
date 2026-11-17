// Application settings. Each can be overridden with an environment variable.

import path from "node:path";
import { fileURLToPath } from "node:url";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** SQLite database file (TRANSIT_DB_PATH overrides the default ./transit.db). */
export const DB_PATH = path.resolve(process.env.TRANSIT_DB_PATH || path.join(PROJECT_ROOT, "transit.db"));

export const SCHEMA_FILE = path.join(PROJECT_ROOT, "schema.sql");
export const DATA_FILE = path.join(PROJECT_ROOT, "insert_data.sql");
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");

export const DEFAULT_PORT = Number(process.env.PORT) || 8000;

/** TRANSIT_DEBUG=1 logs raw database errors to the terminal (never to the browser). */
export const DEBUG = process.env.TRANSIT_DEBUG === "1";
