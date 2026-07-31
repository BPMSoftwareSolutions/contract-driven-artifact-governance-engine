import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/provider-response-normalization.authority.json",
      import.meta.url
    ),
    "utf8"
  )
);

export function makeProviderNormalizationSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeProviderNormalizationOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeProviderNormalizationSemanticAuthority()
  );
}
