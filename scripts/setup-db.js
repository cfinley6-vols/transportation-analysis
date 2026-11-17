// (Re)create transit.db from schema.sql and insert_data.sql.
//
// Usage:  npm run setup
//
// Deletes any existing database file at the configured path and rebuilds it,
// so the app always starts from the submitted backend files.

import { assertSupportedNode } from "../src/node-version.js";

assertSupportedNode();

const { existsSync, readFileSync, rmSync } = await import("node:fs");
const { DatabaseSync } = await import("node:sqlite");
const { DATA_FILE, DB_PATH, SCHEMA_FILE } = await import("../src/config.js");

const TABLES = ["INTERSECTIONS", "TIME_BLOCKS", "TRANSIT_ROUTES", "ROUTE_PATHWAYS", "ROAD_SEGMENTS", "TRAFFIC_OBSERVATIONS"];

for (const file of [SCHEMA_FILE, DATA_FILE]) {
  if (!existsSync(file)) {
    console.error(`Error: required file not found: ${file}`);
    process.exit(1);
  }
}

rmSync(DB_PATH, { force: true });

const db = new DatabaseSync(DB_PATH);
let counts;
try {
  db.exec(readFileSync(SCHEMA_FILE, "utf8"));
  db.exec(readFileSync(DATA_FILE, "utf8"));
  // Table names come from the fixed list above, not from user input.
  counts = TABLES.map((table) => [table, db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n]);
} catch (err) {
  db.close();
  rmSync(DB_PATH, { force: true });
  console.error(`Error building the database: ${err.message}`);
  process.exit(1);
}
db.close();

console.log(`Created ${DB_PATH}`);
for (const [table, count] of counts) console.log(`  ${table.padEnd(22)} ${String(count).padStart(3)} rows`);
