import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL("../../examples/dungeon-movement.authority.json", import.meta.url),
    "utf8"
  )
);

export function makeDungeonMovementSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeDungeonMovementOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeDungeonMovementSemanticAuthority()
  );
}
