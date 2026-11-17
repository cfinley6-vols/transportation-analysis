// The web server: serves the page from public/ and the JSON API under /api.
// Each API request opens its own database connection and closes it when the
// request is done (see withDatabase).

import { spawn } from "node:child_process";
import http from "node:http";
import { DB_PATH, DEFAULT_PORT } from "../config.js";
import { friendlyError, openDatabase, withDatabase } from "../db/connection.js";
import { errorResponse, readJsonBody, sendJson, serveStatic } from "./http.js";
import { matchRoute } from "./routes.js";

async function handleRequest(req, res) {
  const url = new URL(req.url, "http://localhost");

  if (!url.pathname.startsWith("/api/")) {
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(res, url.pathname);
    return sendJson(res, 405, { error: "Not allowed." });
  }

  const route = matchRoute(req.method, url.pathname);
  if (!route.handler) {
    return sendJson(res, route.pathKnown ? 405 : 404, { error: "Unknown API request." });
  }

  try {
    const body = req.method === "POST" || req.method === "PUT" ? await readJsonBody(req) : {};
    const input = { ...Object.fromEntries(url.searchParams), ...body, ...route.params };
    const payload = withDatabase((db) => route.handler(db, input));
    sendJson(res, req.method === "POST" ? 201 : 200, payload);
  } catch (err) {
    const [status, errorBody] = errorResponse(err);
    sendJson(res, status, errorBody);
  }
}

function parseArgs(argv) {
  const options = { port: DEFAULT_PORT, openBrowser: true };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--no-browser") options.openBrowser = false;
    else if (argv[i] === "--port") options.port = Number(argv[++i]);
    else if (argv[i].startsWith("--port=")) options.port = Number(argv[i].slice(7));
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    console.error("Error: --port must be a number from 1 to 65535.");
    process.exit(1);
  }
  return options;
}

function openInBrowser(url) {
  const [command, args] =
    process.platform === "darwin" ? ["open", [url]]
    : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]]
    : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {}); // no browser available; the URL is printed anyway
  child.unref();
}

export function main(argv = process.argv.slice(2)) {
  const { port, openBrowser } = parseArgs(argv);

  // Fail fast with a clear message if the database has not been set up.
  try {
    openDatabase().close();
  } catch (err) {
    console.error(`Error: ${err.name === "DatabaseSetupError" ? err.message : friendlyError(err)}`);
    process.exit(1);
  }

  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      const [status, body] = errorResponse(err);
      if (!res.headersSent) sendJson(res, status, body);
    });
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") console.error(`Error: port ${port} is already in use. Try --port ${port + 1}.`);
    else console.error(`Error: could not start the server (${err.message}).`);
    process.exit(1);
  });

  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}/`;
    console.log(`Transit Analysis is running at ${url}  (database: ${DB_PATH})`);
    console.log("Press Ctrl+C to stop the server.");
    if (openBrowser) openInBrowser(url);
  });

  const shutdown = () => {
    server.close(() => {
      console.log("\nServer stopped.");
      process.exit(0);
    });
    server.closeAllConnections();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
