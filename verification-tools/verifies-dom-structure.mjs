import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

/*
 * dom-structure-verifier (scoped): confirms the projected page contains the
 * required structural surfaces declared by the browser context authority --
 * main application root, a 600x600 canvas bound to the expected id, the
 * player coordinate display, and the two controls. This is a hand-rolled
 * check over this project's own known-shape HTML, not a general HTML5
 * parser; it intentionally does not attempt to validate arbitrary markup.
 *
 * Runs with cwd = the artifact root (the command-exit-verifier.v1
 * convention this whole engine uses), so the app directory is simply ".".
 */

const appDir = process.argv[2] ?? process.cwd();
const htmlPath = path.join(appDir, "index.html");
const html = readFileSync(htmlPath, "utf8");

function requireTag(pattern, label) {
  const match = html.match(pattern);
  assert.ok(match, `Missing required structural surface: ${label}`);
  return match;
}

requireTag(/<main\s+id="dungeon-application"[^>]*>/, "main application root");
requireTag(
  /<canvas\s+id="view"\s+width="600"\s+height="600">\s*<\/canvas>/,
  "canvas 600x600 bound to #view"
);
requireTag(/<span[^>]*\bid="coords"[^>]*>/, "player coordinate display (#coords)");
requireTag(/<button\s+id="regenerateBtn"[^>]*>/, "regenerate control (#regenerateBtn)");
requireTag(/<button\s+id="godModeBtn"[^>]*>/, "God Mode control (#godModeBtn)");
assert.ok(
  /addEventListener\("keydown"/.test(html),
  "Missing required structural surface: keyboard engagement surface"
);

process.stdout.write("DOM_STRUCTURE_CONFORMS\n");
