import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/bounded-worklist-smoke.authority.json",
      import.meta.url
    ),
    "utf8"
  )
);

export function makeBoundedWorklistSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeBoundedWorklistOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeBoundedWorklistSemanticAuthority()
  );
}
