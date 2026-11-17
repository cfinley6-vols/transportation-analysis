// Calls to the server's JSON API. Every piece of data on the page comes
// through here; the page keeps no copy of project data of its own.

import { $ } from "./dom.js";

export class ApiError extends Error {
  constructor(message, field, status) {
    super(message);
    this.field = field;
    this.status = status;
  }
}

/** Build "?a=1&b=2", leaving out empty values. */
function queryString(params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== "" && value !== null && value !== undefined) search.set(key, value);
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

let databaseName = "database";
export const setDatabaseName = (name) => { databaseName = name; };

function showConnection(ok) {
  const box = $("#db-status");
  box.className = `db-status ${ok ? "ok" : "bad"}`;
  box.lastElementChild.textContent = ok ? `Connected · ${databaseName}` : "Server unreachable";
}

export async function api(method, path, body) {
  let response;
  try {
    response = await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    showConnection(false);
    throw new ApiError("Cannot reach the server. Is it still running?", null, 0);
  }
  showConnection(true);
  let data = null;
  try {
    data = await response.json();
  } catch {
    // Not JSON (unexpected); fall through to a generic message.
  }
  if (!response.ok) {
    throw new ApiError(data?.error || `Request failed (${response.status}).`, data?.field, response.status);
  }
  return data;
}

export const get = (path, params) => api("GET", path + queryString(params));
export const post = (path, body) => api("POST", path, body);
export const put = (path, body) => api("PUT", path, body);
export const del = (path) => api("DELETE", path);
