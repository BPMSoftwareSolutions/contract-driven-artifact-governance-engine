import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/bounded-arithmetic-smoke.authority.json",
      import.meta.url
    ),
    "utf8"
  )
);

export function makeBoundedArithmeticSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeBoundedArithmeticOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeBoundedArithmeticSemanticAuthority()
  );
}
