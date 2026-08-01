import { readFileSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { executeBrowserSemanticAuthority } from "../lib/browser-semantic-runtime.mjs";

/*
 * Verify a canonical rendering-frame projection from the ontology decision
 * plus the palette/canvas/tile data declared by browser-context.json.
 */

const appDir = path.resolve(process.argv[2] ?? process.cwd());
const context = JSON.parse(
  readFileSync(path.join(appDir, "browser-context.json"), "utf8")
);
const renderAuthority = JSON.parse(
  readFileSync(
    path.join(appDir, "contracts", "dungeon-render-role.bundle.json"),
    "utf8"
  )
);
const cells = [
  { x: 0, y: 0, cellValue: 1, godMode: 0, revealed: 0 },
  { x: 1, y: 0, cellValue: 1, godMode: 0, revealed: 1 },
  { x: 2, y: 0, cellValue: 0, godMode: 0, revealed: 1 },
  { x: 3, y: 0, cellValue: 1, godMode: 1, revealed: 0 }
];
const operations = [];

for (const cell of cells) {
  const decision = executeBrowserSemanticAuthority(renderAuthority, cell);
  const fill = context.renderingProjection.palette[decision.role];
  if (fill !== null) {
    operations.push({
      fill,
      height: context.canvasProfile.tileSizePx,
      operation: "fill-rectangle",
      semanticRole: decision.role,
      width: context.canvasProfile.tileSizePx,
      x: cell.x * context.canvasProfile.tileSizePx,
      y: cell.y * context.canvasProfile.tileSizePx
    });
  }
}

const frame = {
  canvas: {
    background: context.renderingProjection.palette.background,
    height: context.canvasProfile.heightPx,
    width: context.canvasProfile.widthPx
  },
  frameType: context.renderingProjection.frameType,
  operations
};

assert.equal(frame.frameType, "pixel-grid-rendering-frame.v1");
assert.deepEqual(frame.canvas, { background: "#000000", height: 600, width: 600 });
assert.equal(frame.operations.length, 3, "hidden cell must emit no operation");
assert.deepEqual(
  frame.operations.map(({ semanticRole, fill, x }) => ({ semanticRole, fill, x })),
  [
    { semanticRole: "visible-wall", fill: "#4a4e69", x: 10 },
    { semanticRole: "visible-floor", fill: "#9a8c98", x: 20 },
    { semanticRole: "visible-wall", fill: "#4a4e69", x: 30 }
  ]
);
assert.equal(
  frame.operations.every(({ width, height }) => width === 10 && height === 10),
  true
);

process.stdout.write("RENDER_COMMAND_FRAME_CONFORMS\n");
