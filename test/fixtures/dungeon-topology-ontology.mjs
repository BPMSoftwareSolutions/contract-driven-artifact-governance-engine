import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL("../../examples/dungeon-topology.authority.json", import.meta.url),
    "utf8"
  )
);

export const DUNGEON_TOPOLOGY_ROOT = { x: 10, y: 10, w: 58, h: 58, depth: 0 };

export function makeDungeonTopologySemanticAuthority() {
  return structuredClone(declaration);
}

export function makeDungeonTopologyOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeDungeonTopologySemanticAuthority()
  );
}
