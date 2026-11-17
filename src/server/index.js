// Entry point:  npm start   (or: node src/server/index.js [--port 8000] [--no-browser])
// The Node version is checked before loading anything that uses node:sqlite.

import { assertSupportedNode } from "../node-version.js";

assertSupportedNode();
const { main } = await import("./app.js");
main();
