import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { inspectSourceAuthority } from "contract-driven-artifact-governance-engine";

/*
 * The governed page is a packaging shell, not an application implementation.
 * Its complete executable body is therefore checked structurally: one static
 * import and one direct authority invocation, with no function, branch,
 * iteration, failure mechanic, object construction, or state mutation.
 */

const appDir = process.argv[2] ?? process.cwd();
const html = readFileSync(path.join(appDir, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script\s+type="module"\s*>([\s\S]*?)<\/script>/g)];

assert.equal(html.includes("\r"), false, "index.html must use LF line endings");
assert.equal(html.includes("\t"), false, "index.html indentation must not use tabs");

const voidElements = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
let depth = 0;
for (const [index, line] of html.trimEnd().split("\n").entries()) {
  assert.equal(line.trimEnd(), line, `line ${index + 1} must not contain trailing whitespace`);
  const content = line.trimStart();
  const closing = content.match(/^<\/([a-z][a-z0-9-]*)>/i);
  if (closing) depth -= 1;
  assert.ok(depth >= 0, `line ${index + 1} closes an element outside the document hierarchy`);
  assert.equal(
    line.length - content.length,
    depth * 2,
    `line ${index + 1} must use two spaces for each HTML nesting level`
  );
  const opening = content.match(/^<([a-z][a-z0-9-]*)(?:\s[^>]*)?>/i);
  if (opening && !voidElements.has(opening[1].toLowerCase()) && !content.includes(`</${opening[1]}>`)) {
    depth += 1;
  }
}
assert.equal(depth, 0, "index.html element indentation hierarchy must be balanced");

assert.equal(scripts.length, 1, "index.html must contain exactly one module bootstrap");
assert.equal(
  html.includes("<style"),
  false,
  "presentation authority must not be embedded in index.html"
);
assert.equal(
  html.match(/<main\s+id="dungeon-application"\s+class="app"><\/main>/g)?.length,
  1,
  "index.html must contain only the empty application projection root"
);

const inspection = inspectSourceAuthority(scripts[0][1], "javascript");
assert.equal(inspection.imports.length, 1, "bootstrap must contain one import");
assert.equal(
  inspection.imports[0].specifier,
  "./src/application-adapter.mjs",
  "bootstrap import must target the governed collapsed application adapter"
);
assert.deepEqual(
  inspection.imports[0].importedBindings,
  ["startsProceduralDungeonPage"]
);
assert.equal(inspection.functions.length, 0, "bootstrap must define no functions");
assert.equal(
  inspection.invocationOccurrences.length,
  1,
  "bootstrap must contain one authority invocation"
);
assert.equal(
  inspection.invocationOccurrences[0].invocation,
  "startsProceduralDungeonPage"
);
assert.deepEqual(
  inspection.invocationOccurrences[0].argumentExpressions,
  ["globalThis"]
);
for (const [mechanic, observed] of [
  ["branch", inspection.decisions],
  ["iteration", inspection.iterations],
  ["exception-handling/throw", inspection.failures],
  ["object-construction", inspection.projections]
]) {
  assert.equal(observed.length, 0, `bootstrap contains forbidden ${mechanic}`);
}
assert.equal(inspection.declarations.length, 0, "bootstrap must declare no local state");
assert.equal(inspection.returns.length, 0, "packaging shell must not reshape the result");
assert.equal(inspection.unresolvedTokens.length, 0, "bootstrap must be fully inspectable");

process.stdout.write("PAGE_BOOTSTRAP_MECHANICS_CONFORMS\n");
