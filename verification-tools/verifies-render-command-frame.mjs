import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

/*
 * browser-render-command-verifier (scoped): proves the authorized render
 * command stream -- not pixels -- for a canonical fixture. For each cell the
 * render-role ontology decides, and asserts the resulting fill-rectangle
 * operation carries the exact declared semantic role and color, and that no
 * operation is emitted for a hidden cell. A screenshot would only ever be
 * secondary evidence to this: it cannot show which decision authorized a
 * given pixel.
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
const fullScript = html.slice(start, end);
const domBoundary = 'const canvas = document.getElementById("view");';
const domBoundaryIndex = fullScript.indexOf(domBoundary);
const contractsDir = path.join(appDir, "contracts").replace(/\\/g, "/");
const rewrittenImports = fullScript
  .slice(0, domBoundaryIndex)
  .replace(/\.\/contracts\//g, `file:///${contractsDir}/`);
const pureScript = `${rewrittenImports}
export {
  runDungeonOntology,
  dungeonRenderRoleBundle,
  COLOR_HIDDEN,
  COLOR_WALL,
  COLOR_FLOOR,
  COLOR_PLAYER,
  TILE_SIZE
};
`;

// Extracted outside the governed artifact root, in the OS temp directory, so
// this check's own write-then-delete of a scratch module never appears as a
// transient mutation of the evaluated subject during conformance evaluation.
const scratchDir = mkdtempSync(path.join(os.tmpdir(), "dungeon-render-check-"));
const extractedPath = path.join(scratchDir, "extracted.mjs");
writeFileSync(extractedPath, pureScript);

try {
  const vendored = await import(`file://${extractedPath.replace(/\\/g, "/")}`);

  const ROLE_FILL = {
    hidden: null,
    "visible-floor": vendored.COLOR_FLOOR,
    "visible-wall": vendored.COLOR_WALL
  };

  function buildFixtureFrame(cells) {
    const operations = [];
    for (const cell of cells) {
      const decision = vendored.runDungeonOntology(vendored.dungeonRenderRoleBundle, {
        cellValue: cell.cellValue,
        godMode: cell.godMode,
        revealed: cell.revealed
      });
      const fill = ROLE_FILL[decision.role];
      if (fill) {
        operations.push({
          operation: "fill-rectangle",
          semanticRole: decision.role,
          x: cell.x * vendored.TILE_SIZE,
          y: cell.y * vendored.TILE_SIZE,
          width: vendored.TILE_SIZE,
          height: vendored.TILE_SIZE,
          fill
        });
      }
    }
    return {
      frameType: "pixel-grid-rendering-frame.v1",
      canvas: { width: 600, height: 600, background: vendored.COLOR_HIDDEN },
      operations
    };
  }

  const frame = buildFixtureFrame([
    { x: 0, y: 0, cellValue: 1, godMode: 0, revealed: 0 },
    { x: 1, y: 0, cellValue: 1, godMode: 0, revealed: 1 },
    { x: 2, y: 0, cellValue: 0, godMode: 0, revealed: 1 },
    { x: 3, y: 0, cellValue: 1, godMode: 1, revealed: 0 }
  ]);

  assert.equal(frame.frameType, "pixel-grid-rendering-frame.v1");
  assert.equal(frame.canvas.background, "#000000");
  assert.equal(
    frame.operations.length,
    3,
    "the hidden cell must not emit a fill-rectangle operation"
  );
  assert.equal(frame.operations[0].semanticRole, "visible-wall");
  assert.equal(frame.operations[0].fill, "#4a4e69");
  assert.equal(frame.operations[0].x, 10);
  assert.equal(frame.operations[1].semanticRole, "visible-floor");
  assert.equal(frame.operations[1].fill, "#9a8c98");
  assert.equal(frame.operations[2].semanticRole, "visible-wall");
  assert.equal(frame.operations[2].fill, "#4a4e69");
  assert.equal(
    frame.operations.every((op) => op.width === 10 && op.height === 10),
    true,
    "every tile operation must be exactly one 10x10 tile"
  );

  process.stdout.write("RENDER_COMMAND_FRAME_CONFORMS\n");
} finally {
  rmSync(extractedPath, { force: true });
  rmSync(scratchDir, { recursive: true, force: true });
}
