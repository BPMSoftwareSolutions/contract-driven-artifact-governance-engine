import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL("../../examples/dungeon-rasterize.authority.json", import.meta.url),
    "utf8"
  )
);

export function makeDungeonRasterizeSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeDungeonRasterizeOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeDungeonRasterizeSemanticAuthority()
  );
}

export function makeRasterizeSeedItem(topology) {
  return {
    rectLoX: topology.rectLoX,
    rectLoY: topology.rectLoY,
    rectHiX: topology.rectHiX,
    rectHiY: topology.rectHiY,
    cellIndex: 0,
    cellX: 0,
    cellY: 0,
    slotIndex: -1,
    rectCount: 0,
    containCount: 0,
    cellGridValue: 0,
    isLastColumn: 0,
    currentRow: [],
    rows: []
  };
}
