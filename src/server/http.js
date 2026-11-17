// Low-level HTTP helpers: JSON in/out, static files, and mapping errors to
// status codes with user-friendly messages.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { DEBUG, PUBLIC_DIR } from "../config.js";
import { DatabaseSetupError, friendlyError, isConstraintError, isSqliteError } from "../db/connection.js";
import { ConflictError, NotFoundError, ValidationError } from "../shared/errors.js";

const MAX_BODY_BYTES = 64 * 1024;

export class BadRequestError extends Error {}

export function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** Read and parse a JSON object body (with a size limit). */
export async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BadRequestError("Request is too large.");
    chunks.push(chunk);
  }
  if (size === 0) return {};
  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BadRequestError("Request body is not valid JSON.");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new BadRequestError("Request body must be a JSON object.");
  }
  return body;
}

/** Convert any error into [status, body]. Raw database errors and stack traces never reach the browser. */
export function errorResponse(err) {
  if (err instanceof ValidationError) return [400, { error: err.message, field: err.field }];
  if (err instanceof BadRequestError) return [400, { error: err.message }];
  if (err instanceof NotFoundError) return [404, { error: err.message }];
  if (err instanceof ConflictError) return [409, { error: err.message }];
  if (err instanceof DatabaseSetupError) return [503, { error: err.message }];

  if (DEBUG) console.error(`[debug] ${err?.stack || err}`);
  // Constraint errors reach here only if a check was missed; the change was not saved.
  if (isConstraintError(err)) return [409, { error: friendlyError(err) }];
  if (isSqliteError(err)) return [500, { error: friendlyError(err) }];
  return [500, { error: "Something went wrong while handling that request." }];
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** Serve a file from public/. Paths that escape that folder are refused. */
export async function serveStatic(res, urlPath) {
  let relative;
  try {
    relative = decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath);
  } catch {
    relative = "";
  }
  const filePath = path.join(PUBLIC_DIR, path.normalize(relative));
  const type = MIME_TYPES[path.extname(filePath)];
  if (!relative || !type || !filePath.startsWith(PUBLIC_DIR + path.sep)) return sendNotFound(res);

  try {
    const data = await readFile(filePath);
    res.writeHead(200, { "Content-Type": type, "Content-Length": data.length, "Cache-Control": "no-store" });
    res.end(data);
  } catch {
    sendNotFound(res);
  }
}

function sendNotFound(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}
