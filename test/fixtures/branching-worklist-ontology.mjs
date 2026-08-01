import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/branching-worklist-smoke.authority.json",
      import.meta.url
    ),
    "utf8"
  )
);

export function makeBranchingWorklistSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeBranchingWorklistOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeBranchingWorklistSemanticAuthority()
  );
}
