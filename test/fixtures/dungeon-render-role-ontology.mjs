import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL("../../examples/dungeon-render-role.authority.json", import.meta.url),
    "utf8"
  )
);

export function makeDungeonRenderRoleSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeDungeonRenderRoleOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeDungeonRenderRoleSemanticAuthority()
  );
}
