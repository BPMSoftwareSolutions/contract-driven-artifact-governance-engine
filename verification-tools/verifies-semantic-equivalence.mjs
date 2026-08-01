import path from "node:path";
import assert from "node:assert/strict";
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";

/*
 * semantic-execution-equivalence-verifier (scoped): proves the browser
 * page's execution module (lib/browser-semantic-runtime.mjs, trusted engine
 * infrastructure outside the webpage artifact workspace and imported by a
 * relative parent path,
 * because a vanilla browser cannot resolve the
 * "contract-driven-artifact-governance-engine" bare-specifier import the
 * bundles are otherwise executed through) behaves identically to this
 * project's real executeSemanticAuthority, for every canonical fixture drawn
 * from the contract's Gherkin-derived scenarios. This imports the real
 * engine module file directly -- no HTML extraction or scratch-file
 * rewriting -- since the interpreter no longer lives inline in index.html.
 *
 * Runs with cwd = the artifact root (the command-exit-verifier.v1
 * convention this whole engine uses), so the app directory is simply ".".
 */

const appDir = path.resolve(process.argv[2] ?? process.cwd());
const enginePath = path.join(appDir, "..", "lib", "browser-semantic-runtime.mjs").replace(/\\/g, "/");
const { runDungeonOntology } = await import(`file:///${enginePath}`);

const contractsDir = path.join(appDir, "contracts").replace(/\\/g, "/");
const dungeonMovementBundle = (await import(`file:///${contractsDir}/dungeon-movement.bundle.json`, { with: { type: "json" } })).default;
const dungeonRenderRoleBundle = (await import(`file:///${contractsDir}/dungeon-render-role.bundle.json`, { with: { type: "json" } })).default;
const dungeonKeyboardCommandBundle = (await import(`file:///${contractsDir}/dungeon-keyboard-command.bundle.json`, { with: { type: "json" } })).default;
const dungeonTopologyBundle = (await import(`file:///${contractsDir}/dungeon-topology.bundle.json`, { with: { type: "json" } })).default;
const dungeonRasterizeBundle = (await import(`file:///${contractsDir}/dungeon-rasterize.bundle.json`, { with: { type: "json" } })).default;
const dungeonVisibilityBundle = (await import(`file:///${contractsDir}/dungeon-visibility.bundle.json`, { with: { type: "json" } })).default;

const movementFixtures = [
  { label: "movement into floor authorizes", input: floorMovementRequest(0, 1) },
  { label: "movement into wall blocks", input: wallMovementRequest() }
];
const renderRoleFixtures = [
  { label: "unrevealed floor is hidden", input: { cellValue: 0, godMode: 0, revealed: 0 } },
  { label: "revealed wall renders as wall", input: { cellValue: 1, godMode: 0, revealed: 1 } },
  { label: "God Mode reveals an unrevealed wall", input: { cellValue: 1, godMode: 1, revealed: 0 } }
];
const keyboardFixtures = [
  { label: "ArrowUp maps to move-north", input: { key: "ArrowUp" } },
  { label: "D maps to move-east", input: { key: "D" } }
];

let checked = 0;
for (const fixture of movementFixtures) {
  assertEquivalent("dungeon-movement", dungeonMovementBundle, fixture);
  checked += 1;
}
for (const fixture of renderRoleFixtures) {
  assertEquivalent("dungeon-render-role", dungeonRenderRoleBundle, fixture);
  checked += 1;
}
for (const fixture of keyboardFixtures) {
  assertEquivalent("dungeon-keyboard-command", dungeonKeyboardCommandBundle, fixture);
  checked += 1;
}

// dungeon-topology: the branching worklist that decides BSP region
// splitting, room placement, and corridor connectivity.
const root = { x: 10, y: 10, w: 58, h: 58, depth: 0 };
assertEquivalent("dungeon-topology", dungeonTopologyBundle, { label: "default seed", input: root });
checked += 1;

const topology = executeSemanticAuthority(dungeonTopologyBundle, root).topology;

// dungeon-rasterize: the containment sweep over the topology's own
// unified paint-rectangle list.
const rasterInput = {
  rectLoX: topology.rectLoX, rectLoY: topology.rectLoY, rectHiX: topology.rectHiX, rectHiY: topology.rectHiY,
  cellIndex: 0, cellX: 0, cellY: 0, slotIndex: -1, rectCount: 0, containCount: 0, cellGridValue: 0, isLastColumn: 0,
  currentRow: [], rows: []
};
assertEquivalent("dungeon-rasterize", dungeonRasterizeBundle, { label: "topology-derived grid", input: rasterInput });
checked += 1;

const grid = executeSemanticAuthority(dungeonRasterizeBundle, rasterInput).grid.rows;

// dungeon-visibility: the guarded flattened Bresenham sweep, exercised
// from the topology's own first room so the fixture reflects a real,
// reachable spawn point rather than an arbitrary coordinate.
const visibilityInput = {
  grid, playerX: topology.roomX[0] + 2, playerY: topology.roomY[0] + 2,
  globalStep: 0, blockedRayId: -999, revealedX: [], revealedY: [],
  cellX: 0, cellY: 0, cellValue: 0, scratchRow: grid[0], rayId: 0, relX: 0, relY: 0, wallHitRayId: -999
};
assertEquivalent("dungeon-visibility", dungeonVisibilityBundle, { label: "sweep from spawn", input: visibilityInput });
checked += 1;

function assertEquivalent(ontologyId, bundle, fixture) {
  const direct = executeSemanticAuthority(bundle, fixture.input);
  const projected = runDungeonOntology(bundle, fixture.input);
  assert.deepEqual(
    projected,
    direct,
    `${ontologyId} / ${fixture.label}: projected browser execution diverged from direct semantic execution`
  );
}

function floorMovementRequest(dx, dy) {
  const grid = emptyGrid();
  return { grid, playerX: 10, playerY: 10, dx, dy };
}

function wallMovementRequest() {
  const grid = emptyGrid();
  grid[10][11] = 1;
  return { grid, playerX: 10, playerY: 10, dx: 1, dy: 0 };
}

function emptyGrid() {
  const grid = Array.from({ length: 60 }, () => new Array(60).fill(1));
  for (let y = 1; y <= 58; y += 1) {
    for (let x = 1; x <= 58; x += 1) {
      grid[y][x] = 0;
    }
  }
  return grid;
}

process.stdout.write(`SEMANTIC_EXECUTION_EQUIVALENCE_CONFORMS (${checked} fixtures)\n`);
