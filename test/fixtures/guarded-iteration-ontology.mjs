import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/guarded-iteration-smoke.authority.json",
      import.meta.url
    ),
    "utf8"
  )
);

export function makeGuardedIterationSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeGuardedIterationOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeGuardedIterationSemanticAuthority()
  );
}
