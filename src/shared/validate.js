// Input validation. Each helper returns a clean value or throws a
// ValidationError with a message the page shows next to the form field.
// Values may arrive as strings (URL query) or JSON numbers/booleans (request body).

import { ValidationError } from "./errors.js";

const isBlank = (value) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

/** A whole number within [min, max]; null if optional and blank. */
export function integer(value, label, { field = null, min, max, required = true } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${label} is required.`, field);
    return null;
  }
  let number;
  if (typeof value === "number") number = value;
  else if (typeof value === "string" && /^-?\d+$/.test(value.trim().replaceAll(",", ""))) {
    number = Number(value.trim().replaceAll(",", ""));
  }
  if (!Number.isSafeInteger(number)) throw new ValidationError(`${label} must be a whole number.`, field);
  if (min !== undefined && number < min) {
    throw new ValidationError(`${label} must be at least ${min.toLocaleString("en-US")}.`, field);
  }
  if (max !== undefined && number > max) {
    throw new ValidationError(`${label} must be at most ${max.toLocaleString("en-US")}.`, field);
  }
  return number;
}

/** Trimmed text; null if optional and blank. */
export function text(value, label, { field = null, required = true, maxLength = 60 } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${label} is required.`, field);
    return null;
  }
  if (typeof value !== "string") throw new ValidationError(`${label} must be text.`, field);
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${label} must be ${maxLength} characters or fewer.`, field);
  }
  return trimmed;
}

/** Today's date in the server's local time zone, as YYYY-MM-DD. */
export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** A real calendar date in YYYY-MM-DD form (the format dates are stored in). */
export function isoDate(value, label, { field = null, required = true, allowFuture = false } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`${label} is required.`, field);
    return null;
  }
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) throw new ValidationError(`${label} must use the format YYYY-MM-DD.`, field);
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 2026-02-30 over to March; a real date round-trips unchanged.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new ValidationError(`${label} is not a real date.`, field);
  }
  if (!allowFuture && raw > todayIso()) throw new ValidationError(`${label} cannot be in the future.`, field);
  return raw;
}

export function dateRange(start, end) {
  if (start && end && start > end) {
    throw new ValidationError("Start date must be on or before the end date.", "end");
  }
}

/** A value from a fixed list (a dropdown); null if optional and blank. */
export function oneOf(value, options, label, { field = null, required = true } = {}) {
  if (isBlank(value)) {
    if (required) throw new ValidationError(`Choose a ${label.toLowerCase()}.`, field);
    return null;
  }
  if (!options.includes(value)) throw new ValidationError(`"${value}" is not a valid ${label.toLowerCase()}.`, field);
  return value;
}

export function boolean(value, label, { field = null } = {}) {
  if (typeof value === "boolean") return value;
  if ([1, "1", "true"].includes(value)) return true;
  if ([0, "0", "false"].includes(value)) return false;
  throw new ValidationError(`${label} must be true or false.`, field);
}
