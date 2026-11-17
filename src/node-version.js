// The built-in `node:sqlite` module needs Node.js 22.13+ (or 23.4+).
// This file must not import anything that uses SQLite, so it can run first
// and print a clear message on older versions instead of a crash.

export function assertSupportedNode() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const supported = major > 23 || (major === 23 && minor >= 4) || (major === 22 && minor >= 13);
  if (!supported) {
    console.error(
      `This app needs Node.js 22.13 or newer (you have ${process.versions.node}).\n` +
      "Download the current LTS version from https://nodejs.org/",
    );
    process.exit(1);
  }
}
