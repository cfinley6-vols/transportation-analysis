// Display formatting for values returned by the database.

/** Column headings for SQL result columns. */
export const LABELS = {
  ID: "ID", Intersection: "Intersection", Control: "Control", Neighborhood: "Neighborhood",
  Routes: "Routes", Observations: "Readings", Date: "Date", TimeBlock: "Time block",
  Volume: "Vehicles", AvgWaitSec: "Avg wait (s)", MaxQueue: "Max queue", Seq: "#",
  StopType: "Stop type", WorstQueue: "Worst queue", Readings: "Readings", AvgVolume: "Avg vehicles",
  Level: "LOS", Hours: "Hours", TotalVolume: "Total vehicles", Stop: "Stop", Route: "Route",
  Type: "Type", Capacity: "Daily capacity", Segments: "Segments", CanTransfer: "Transfer?",
};

export function fmt(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? value.toLocaleString()
      : value.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }
  return String(value);
}

/** Level of service grades (Highway Capacity Manual), best to worst. */
export const LEVELS = ["LOS A", "LOS B", "LOS C", "LOS D", "LOS E", "LOS F", "No data"];

/** Upper delay limit (seconds) of each grade; these match levelOfService() in src/db/sql-fragments.js. */
export const LOS_LIMITS = [10, 20, 35, 55, 80];
export const LOS_DESCRIPTION = "A ≤ 10 s · B ≤ 20 · C ≤ 35 · D ≤ 55 · E ≤ 80 · F > 80 s average delay";

export function levelFor(avgWait) {
  if (avgWait === null || avgWait === undefined) return "No data";
  const index = LOS_LIMITS.findIndex((limit) => avgWait <= limit);
  return LEVELS[index === -1 ? 5 : index];
}

export const levelClass = (level) => `lvl-${String(level).toLowerCase().replace(/\s+/g, "-")}`;
export const levelColor = (level) => `var(--${levelClass(level)})`;

/** Today in the browser's time zone, as YYYY-MM-DD. */
export function todayIso() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
