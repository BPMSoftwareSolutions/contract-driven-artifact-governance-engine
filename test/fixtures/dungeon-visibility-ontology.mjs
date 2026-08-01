import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL("../../examples/dungeon-visibility.authority.json", import.meta.url),
    "utf8"
  )
);

export function makeDungeonVisibilitySemanticAuthority() {
  return structuredClone(declaration);
}

export function makeDungeonVisibilityOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeDungeonVisibilitySemanticAuthority()
  );
}

export function makeVisibilitySeedItem(grid, playerX, playerY) {
  return {
    grid,
    playerX,
    playerY,
    globalStep: 0,
    blockedRayId: -999,
    revealedX: [],
    revealedY: [],
    cellX: 0,
    cellY: 0,
    cellValue: 0,
    scratchRow: grid[0],
    rayId: 0,
    relX: 0,
    relY: 0,
    wallHitRayId: -999
  };
}
