import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticExecutionDispositionError,
  executeSemanticAuthority,
  inspectDeterministicOntology
} from "../lib/governed-artifact-engine.mjs";
import { makeDungeonMovementOntologyBundle } from "./fixtures/dungeon-movement-ontology.mjs";
import { makeDungeonRenderRoleOntologyBundle } from "./fixtures/dungeon-render-role-ontology.mjs";
import { makeDungeonKeyboardCommandOntologyBundle } from "./fixtures/dungeon-keyboard-command-ontology.mjs";

function emptyGrid() {
  const grid = Array.from({ length: 60 }, () => new Array(60).fill(1));
  for (let y = 1; y <= 58; y += 1) {
    for (let x = 1; x <= 58; x += 1) {
      grid[y][x] = 0;
    }
  }
  return grid;
}

test("movement resolution authorizes onto floor and blocks onto a wall", () => {
  const bundle = makeDungeonMovementOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "dungeon-movement",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  const grid = emptyGrid();
  grid[10][11] = 1;

  assert.deepEqual(
    executeSemanticAuthority(bundle, {
      grid,
      playerX: 10,
      playerY: 10,
      dx: 1,
      dy: 0
    }),
    { status: "MOVEMENT_BLOCKED_BY_WALL", x: 10, y: 10 }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, {
      grid,
      playerX: 10,
      playerY: 10,
      dx: 0,
      dy: 1
    }),
    { status: "MOVEMENT_AUTHORIZED", x: 10, y: 11 }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, {
      grid,
      playerX: 10,
      playerY: 10,
      dx: -1,
      dy: 0
    }),
    { status: "MOVEMENT_AUTHORIZED", x: 9, y: 10 }
  );
});

test("render role reveals only in-bounds cells and God Mode overrides visibility", () => {
  const bundle = makeDungeonRenderRoleOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "dungeon-render-role",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  assert.deepEqual(
    executeSemanticAuthority(bundle, { cellValue: 0, godMode: 0, revealed: 0 }),
    { kind: "render-role-result", role: "hidden" }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, { cellValue: 1, godMode: 0, revealed: 0 }),
    { kind: "render-role-result", role: "hidden" }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, { cellValue: 0, godMode: 0, revealed: 1 }),
    { kind: "render-role-result", role: "visible-floor" }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, { cellValue: 1, godMode: 0, revealed: 1 }),
    { kind: "render-role-result", role: "visible-wall" }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, { cellValue: 1, godMode: 1, revealed: 0 }),
    { kind: "render-role-result", role: "visible-wall" }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, { cellValue: 0, godMode: 1, revealed: 0 }),
    { kind: "render-role-result", role: "visible-floor" }
  );
});

test("keyboard command translation admits every declared key and rejects the rest", () => {
  const bundle = makeDungeonKeyboardCommandOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "dungeon-keyboard-command",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  const expected = {
    ArrowUp: "move-north",
    w: "move-north",
    W: "move-north",
    ArrowDown: "move-south",
    s: "move-south",
    S: "move-south",
    ArrowLeft: "move-west",
    a: "move-west",
    A: "move-west",
    ArrowRight: "move-east",
    d: "move-east",
    D: "move-east"
  };
  for (const [key, command] of Object.entries(expected)) {
    assert.deepEqual(executeSemanticAuthority(bundle, { key }), {
      kind: "keyboard-command-result",
      command
    });
  }

  assert.throws(
    () => executeSemanticAuthority(bundle, { key: "q" }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "INPUT_NOT_ADMITTED"
  );
});
