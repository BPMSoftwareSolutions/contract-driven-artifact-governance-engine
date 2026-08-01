import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";

/*
 * semantic-execution-equivalence-verifier (scoped): proves the browser
 * page's own inlined execution logic (vendored because a vanilla browser
 * cannot resolve the "contract-driven-artifact-governance-engine"
 * bare-specifier import the bundles are otherwise executed through) behaves
 * identically to this project's real executeSemanticAuthority, for every
 * canonical fixture drawn from the contract's Gherkin-derived scenarios.
 * Extraction is a plain string slice of this project's own generated
 * <script type="module"> block, not a general HTML/JS execution sandbox.
 *
 * Runs with cwd = the artifact root (the command-exit-verifier.v1
 * convention this whole engine uses), so the app directory is simply ".".
 */

const appDir = path.resolve(process.argv[2] ?? process.cwd());
const htmlPath = path.join(appDir, "index.html");
const html = readFileSync(htmlPath, "utf8");

const scriptOpenTag = '<script type="module">';
const start = html.indexOf(scriptOpenTag) + scriptOpenTag.length;
const end = html.indexOf("</script>", start);
assert.ok(start > scriptOpenTag.length - 1 && end > start, "Could not locate the bootstrap script block");
const fullScript = html.slice(start, end);

const domBoundary = 'const canvas = document.getElementById("view");';
const domBoundaryIndex = fullScript.indexOf(domBoundary);
assert.ok(domBoundaryIndex > 0, "Could not locate the DOM-mechanics boundary");
const contractsDir = path.join(appDir, "contracts").replace(/\\/g, "/");
const rewrittenImports = fullScript
  .slice(0, domBoundaryIndex)
  .replace(/\.\/contracts\//g, `file:///${contractsDir}/`);
const pureScript = `${rewrittenImports}
export {
  runDungeonOntology,
  dungeonMovementBundle,
  dungeonRenderRoleBundle,
  dungeonKeyboardCommandBundle,
  dungeonTopologyBundle,
  dungeonRasterizeBundle,
  dungeonVisibilityBundle
};
`;

// Extracted outside the governed artifact root, in the OS temp directory, so
// this check's own write-then-delete of a scratch module never appears as a
// transient mutation of the evaluated subject during conformance evaluation.
const scratchDir = mkdtempSync(path.join(os.tmpdir(), "dungeon-equivalence-"));
const extractedPath = path.join(scratchDir, "extracted.mjs");
writeFileSync(extractedPath, pureScript);

try {
  const vendored = await import(`file://${extractedPath.replace(/\\/g, "/")}`);

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
    assertEquivalent("dungeon-movement", vendored.dungeonMovementBundle, fixture);
    checked += 1;
  }
  for (const fixture of renderRoleFixtures) {
    assertEquivalent("dungeon-render-role", vendored.dungeonRenderRoleBundle, fixture);
    checked += 1;
  }
  for (const fixture of keyboardFixtures) {
    assertEquivalent("dungeon-keyboard-command", vendored.dungeonKeyboardCommandBundle, fixture);
    checked += 1;
  }

  // dungeon-topology: the branching worklist that decides BSP region
  // splitting, room placement, and corridor connectivity.
  const root = { x: 10, y: 10, w: 58, h: 58, depth: 0 };
  assertEquivalent("dungeon-topology", vendored.dungeonTopologyBundle, { label: "default seed", input: root });
  checked += 1;

  const topology = executeSemanticAuthority(vendored.dungeonTopologyBundle, root).topology;

  // dungeon-rasterize: the containment sweep over the topology's own
  // unified paint-rectangle list.
  const rasterInput = {
    rectLoX: topology.rectLoX, rectLoY: topology.rectLoY, rectHiX: topology.rectHiX, rectHiY: topology.rectHiY,
    cellIndex: 0, cellX: 0, cellY: 0, slotIndex: -1, rectCount: 0, containCount: 0, cellGridValue: 0, isLastColumn: 0,
    currentRow: [], rows: []
  };
  assertEquivalent("dungeon-rasterize", vendored.dungeonRasterizeBundle, { label: "topology-derived grid", input: rasterInput });
  checked += 1;

  const grid = executeSemanticAuthority(vendored.dungeonRasterizeBundle, rasterInput).grid.rows;

  // dungeon-visibility: the guarded flattened Bresenham sweep, exercised
  // from the topology's own first room so the fixture reflects a real,
  // reachable spawn point rather than an arbitrary coordinate.
  const visibilityInput = {
    grid, playerX: topology.roomX[0] + 2, playerY: topology.roomY[0] + 2,
    globalStep: 0, blockedRayId: -999, revealedX: [], revealedY: [],
    cellX: 0, cellY: 0, cellValue: 0, scratchRow: grid[0], rayId: 0, relX: 0, relY: 0, wallHitRayId: -999
  };
  assertEquivalent("dungeon-visibility", vendored.dungeonVisibilityBundle, { label: "sweep from spawn", input: visibilityInput });
  checked += 1;

  function assertEquivalent(ontologyId, bundle, fixture) {
    const direct = executeSemanticAuthority(bundle, fixture.input);
    const projected = vendored.runDungeonOntology(bundle, fixture.input);
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
} finally {
  rmSync(extractedPath, { force: true });
  rmSync(scratchDir, { recursive: true, force: true });
}
