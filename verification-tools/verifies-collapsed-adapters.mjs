import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { inspectSourceAuthority } from "contract-driven-artifact-governance-engine";

/*
 * collapsed-web-bootstrap-verifier (scoped): confirms each ontology adapter
 * module is exactly the collapsed shape -- one import of the semantic
 * runtime, one import of its bundle, one exported function, one semantic
 * invocation, one direct return, and zero local decisions/iterations/
 * failures. This reuses inspectSourceAuthority(), the same static-analysis
 * function the engine's own authority-closure-verifier.v1 uses, so the
 * check agrees with what governance would independently observe.
 *
 * Runs with cwd = the artifact root (the command-exit-verifier.v1
 * convention this whole engine uses), so the app directory is simply ".".
 */

const appDir = process.argv[2] ?? process.cwd();
const adapters = [
  "movement-adapter.mjs",
  "render-role-adapter.mjs",
  "keyboard-command-adapter.mjs",
  "topology-adapter.mjs",
  "rasterize-adapter.mjs",
  "visibility-adapter.mjs"
];

for (const file of adapters) {
  const text = readFileSync(path.join(appDir, "src", file), "utf8");
  const inspection = inspectSourceAuthority(text, "javascript");

  assert.equal(inspection.imports.length, 2, `${file}: expected exactly 2 imports`);
  assert.equal(inspection.functions.length, 1, `${file}: expected exactly 1 function`);
  assert.equal(
    inspection.invocationOccurrences.length,
    1,
    `${file}: expected exactly 1 invocation`
  );
  assert.equal(
    inspection.invocationOccurrences[0].invocation,
    "executeSemanticAuthority",
    `${file}: the one invocation must be executeSemanticAuthority`
  );
  assert.equal(inspection.returns.length, 1, `${file}: expected exactly 1 return`);
  assert.equal(
    inspection.returns[0].returnKind,
    "explicit-return",
    `${file}: return must be explicit`
  );
  assert.equal(inspection.decisions.length, 0, `${file}: expected 0 local decisions`);
  assert.equal(inspection.iterations.length, 0, `${file}: expected 0 local iterations`);
  assert.equal(inspection.failures.length, 0, `${file}: expected 0 local failure mechanics`);
  assert.equal(
    inspection.unresolvedTokens.length,
    0,
    `${file}: expected 0 unresolved tokens`
  );
}

process.stdout.write("COLLAPSED_BOOTSTRAP_CONFORMS\n");
