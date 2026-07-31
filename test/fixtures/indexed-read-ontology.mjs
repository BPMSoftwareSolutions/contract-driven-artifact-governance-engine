import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/indexed-read-smoke.authority.json",
      import.meta.url
    ),
    "utf8"
  )
);

export function makeIndexedReadSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeIndexedReadOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeIndexedReadSemanticAuthority()
  );
}
