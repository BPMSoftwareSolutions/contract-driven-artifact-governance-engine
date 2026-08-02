import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticExecutionDispositionError,
  executeSemanticAuthority,
  inspectDeterministicOntology,
  projectBoundSemanticExecutionBundle
} from "../lib/governed-artifact-engine.mjs";
import { makeDungeonMovementOntologyBundle } from "./fixtures/dungeon-movement-ontology.mjs";
import { makeDungeonRenderRoleOntologyBundle } from "./fixtures/dungeon-render-role-ontology.mjs";
import { makeDungeonKeyboardCommandOntologyBundle } from "./fixtures/dungeon-keyboard-command-ontology.mjs";
import {
  makeDungeonVisibilityOntologyBundle,
  makeVisibilitySeedItem
} from "./fixtures/dungeon-visibility-ontology.mjs";
import {
  DUNGEON_TOPOLOGY_ROOT,
  makeDungeonTopologyOntologyBundle,
  makeDungeonTopologySemanticAuthority
} from "./fixtures/dungeon-topology-ontology.mjs";
import {
  makeDungeonRasterizeOntologyBundle,
  makeRasterizeSeedItem
} from "./fixtures/dungeon-rasterize-ontology.mjs";

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

const VISION_RADIUS = 9;
const TOTAL_SIZE = 78;
const WALL = 1;
const FLOOR = 0;

function referenceBresenhamLine(x0, y0, x1, y1) {
  const points = [];
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  while (true) {
    points.push({ x, y });
    if (x === x1 && y === y1) {
      break;
    }
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return points;
}

function referenceVisibility(grid, playerX, playerY) {
  const revealed = new Set();
  const inBounds = (x, y) => x >= 0 && y >= 0 && x < TOTAL_SIZE && y < TOTAL_SIZE;
  function castRay(targetX, targetY) {
    for (const point of referenceBresenhamLine(playerX, playerY, targetX, targetY)) {
      if (!inBounds(point.x, point.y)) {
        break;
      }
      const distance = Math.max(Math.abs(point.x - playerX), Math.abs(point.y - playerY));
      if (distance > VISION_RADIUS) {
        break;
      }
      revealed.add(`${point.x},${point.y}`);
      if (grid[point.y][point.x] === WALL) {
        break;
      }
    }
  }
  revealed.add(`${playerX},${playerY}`);
  for (let dx = -VISION_RADIUS; dx <= VISION_RADIUS; dx += 1) {
    castRay(playerX + dx, playerY - VISION_RADIUS);
    castRay(playerX + dx, playerY + VISION_RADIUS);
  }
  for (let dy = -VISION_RADIUS; dy <= VISION_RADIUS; dy += 1) {
    castRay(playerX - VISION_RADIUS, playerY + dy);
    castRay(playerX + VISION_RADIUS, playerY + dy);
  }
  return revealed;
}

function makePaddedGrid(fillFn) {
  return Array.from({ length: TOTAL_SIZE }, (_, y) =>
    Array.from({ length: TOTAL_SIZE }, (_, x) => fillFn(x, y))
  );
}

function ontologyRevealedSet(bundle, grid, playerX, playerY) {
  const result = executeSemanticAuthority(
    bundle,
    makeVisibilitySeedItem(grid, playerX, playerY)
  );
  const state = result.visibilityState;
  const revealed = new Set();
  for (let i = 0; i < state.revealedX.length; i += 1) {
    revealed.add(`${state.revealedX[i]},${state.revealedY[i]}`);
  }
  return revealed;
}

test("visibility sweep matches independently-computed Bresenham reference across open floor, walls, and dense obstruction", () => {
  const bundle = makeDungeonVisibilityOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "dungeon-visibility",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  const openGrid = makePaddedGrid(() => FLOOR);
  assert.deepEqual(
    ontologyRevealedSet(bundle, openGrid, 39, 39),
    referenceVisibility(openGrid, 39, 39)
  );

  const wallGrid = makePaddedGrid((x, y) => (y === 39 && x === 42 ? WALL : FLOOR));
  assert.deepEqual(
    ontologyRevealedSet(bundle, wallGrid, 39, 39),
    referenceVisibility(wallGrid, 39, 39)
  );

  let seed = 12345;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const denseGrid = makePaddedGrid(() => (rnd() < 0.3 ? WALL : FLOOR));
  denseGrid[39][39] = FLOOR;
  assert.deepEqual(
    ontologyRevealedSet(bundle, denseGrid, 39, 39),
    referenceVisibility(denseGrid, 39, 39)
  );
});

test("visibility sweep fails closed when the player sits outside the padded safety margin", () => {
  const bundle = makeDungeonVisibilityOntologyBundle();
  const grid = makePaddedGrid(() => FLOOR);
  assert.throws(
    () => executeSemanticAuthority(bundle, makeVisibilitySeedItem(grid, 0, 0)),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "VISIBILITY_STATE_INVALID"
  );
});

const MIN_LEAF = 10;
const MAX_DEPTH = 4;

function xorshift32StepReference(state) {
  let x = state >>> 0;
  if (x === 0) {
    x = 0x9e3779b9;
  }
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return x >>> 0;
}

function xorshift32DrawReference(seed, callIndex) {
  const mixed = ((seed >>> 0) ^ Math.imul((callIndex >>> 0) + 1, 0x9e3779b1)) >>> 0;
  return xorshift32StepReference(mixed);
}

// Independently-authored reference implementation for the same BSP topology the
// ontology decides. Its counter bookkeeping mirrors the ontology's own step
// program exactly (see scripts/generate-dungeon-topology-authority.mjs): a
// draw-counter slot is always consumed for the split-axis decision (drawn
// only on a width===height tie, otherwise skipped unused) and for the split
// coordinate and every room dimension, while the corridor coin flip only
// consumes a slot once a previous room exists to connect to.
function referenceTopology(seed, root) {
  let counter = 0;
  function draw(min, max) {
    const v = xorshift32DrawReference(seed, counter);
    counter += 1;
    return min + (v % (max - min + 1));
  }
  function skip() {
    counter += 1;
  }
  const rooms = [];
  const corridors = [];
  const queue = [{ ...root }];
  while (queue.length > 0) {
    const node = queue.shift();
    const canSplitWide = node.w >= MIN_LEAF * 2;
    const canSplitTall = node.h >= MIN_LEAF * 2;
    if (node.depth >= MAX_DEPTH || (!canSplitWide && !canSplitTall)) {
      const roomW = draw(4, node.w - 4);
      const roomH = draw(4, node.h - 4);
      const roomX = node.x + draw(1, node.w - roomW - 1);
      const roomY = node.y + draw(1, node.h - roomH - 1);
      if (rooms.length > 0) {
        const prev = rooms[rooms.length - 1];
        const horizontalFirst = draw(0, 1) === 1;
        corridors.push({
          fromX: prev.x + 2, fromY: prev.y + 2,
          toX: roomX + 2, toY: roomY + 2,
          horizontalFirst
        });
      }
      rooms.push({ x: roomX, y: roomY, w: roomW, h: roomH });
      continue;
    }
    let splitVertical;
    if (node.w > node.h) {
      splitVertical = true;
      skip();
    } else if (node.h > node.w) {
      splitVertical = false;
      skip();
    } else {
      splitVertical = draw(0, 1) === 1;
    }
    if (splitVertical) {
      const splitX = draw(node.x + MIN_LEAF, node.x + node.w - MIN_LEAF);
      queue.push({ x: node.x, y: node.y, w: splitX - node.x, h: node.h, depth: node.depth + 1 });
      queue.push({ x: splitX, y: node.y, w: node.x + node.w - splitX, h: node.h, depth: node.depth + 1 });
    } else {
      const splitY = draw(node.y + MIN_LEAF, node.y + node.h - MIN_LEAF);
      queue.push({ x: node.x, y: node.y, w: node.w, h: splitY - node.y, depth: node.depth + 1 });
      queue.push({ x: node.x, y: splitY, w: node.w, h: node.y + node.h - splitY, depth: node.depth + 1 });
    }
  }
  return { rooms, corridors };
}

test("BSP topology closes and matches an independently-computed reference across seeds", () => {
  const bundle = makeDungeonTopologyOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "dungeon-topology",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  for (const seed of [482917, 1, 42, 999999, 7]) {
    const declaration = makeDungeonTopologySemanticAuthority();
    declaration.semanticLayer.facts.find((f) => f.factId === "generation-seed").value.value = seed;
    const seededBundle = projectBoundSemanticExecutionBundle(declaration);
    const result = executeSemanticAuthority(seededBundle, DUNGEON_TOPOLOGY_ROOT);
    const t = result.topology;
    const ontology = {
      rooms: t.roomX.map((x, i) => ({ x, y: t.roomY[i], w: t.roomW[i], h: t.roomH[i] })),
      corridors: t.corridorFromX.map((fromX, i) => ({
        fromX,
        fromY: t.corridorFromY[i],
        toX: t.corridorToX[i],
        toY: t.corridorToY[i],
        horizontalFirst: t.corridorHorizontalFirst[i] === 1
      }))
    };
    assert.deepEqual(ontology, referenceTopology(seed, DUNGEON_TOPOLOGY_ROOT), `seed ${seed}`);

    for (const room of ontology.rooms) {
      assert.ok(room.x >= 10 && room.y >= 10, `room stays clear of the low padding margin (seed ${seed})`);
      assert.ok(room.x + room.w <= 68 && room.y + room.h <= 68, `room stays clear of the high padding margin (seed ${seed})`);
    }
    assert.equal(ontology.corridors.length, ontology.rooms.length - 1);
  }
});

test("BSP topology fails closed when the queue cannot drain within the declared item ceiling", () => {
  const declaration = makeDungeonTopologySemanticAuthority();
  declaration.ontology.iterations[0].maxItems = 1;
  const bundle = projectBoundSemanticExecutionBundle(declaration);
  assert.throws(
    () => executeSemanticAuthority(bundle, DUNGEON_TOPOLOGY_ROOT),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "BSP_PARTITION_LIMIT_EXCEEDED"
  );
});

test("rasterization paints exactly the topology's rectangles as floor and everything else as wall", () => {
  const topologyBundle = makeDungeonTopologyOntologyBundle();
  const rasterBundle = makeDungeonRasterizeOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(rasterBundle), {
    ontologyId: "dungeon-rasterize",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  for (const seed of [482917, 1, 42, 999999, 7]) {
    const declaration = makeDungeonTopologySemanticAuthority();
    declaration.semanticLayer.facts.find((f) => f.factId === "generation-seed").value.value = seed;
    const seededTopologyBundle = projectBoundSemanticExecutionBundle(declaration);
    const topology = executeSemanticAuthority(seededTopologyBundle, DUNGEON_TOPOLOGY_ROOT).topology;

    const grid = executeSemanticAuthority(rasterBundle, makeRasterizeSeedItem(topology)).grid.rows;
    assert.equal(grid.length, 78, `seed ${seed}: 78 rows`);
    assert.ok(grid.every((row) => row.length === 78), `seed ${seed}: 78 columns per row`);

    const rects = topology.rectLoX.map((loX, i) => ({
      loX, loY: topology.rectLoY[i], hiX: topology.rectHiX[i], hiY: topology.rectHiY[i]
    }));
    for (let y = 0; y < 78; y += 1) {
      for (let x = 0; x < 78; x += 1) {
        const insideAnyRect = rects.some((r) => x >= r.loX && x <= r.hiX && y >= r.loY && y <= r.hiY);
        assert.equal(grid[y][x], insideAnyRect ? 0 : 1, `seed ${seed}: cell (${x},${y})`);
      }
    }

    const spawnX = topology.roomX[0] + 2;
    const spawnY = topology.roomY[0] + 2;
    assert.equal(grid[spawnY][spawnX], 0, `seed ${seed}: room interior rasterizes to floor`);
  }
});

test("rasterization ignores unused rectangle slots instead of treating them as universal containment", () => {
  const rasterBundle = makeDungeonRasterizeOntologyBundle();
  const seed = makeRasterizeSeedItem({ rectLoX: [], rectLoY: [], rectHiX: [], rectHiY: [] });
  const grid = executeSemanticAuthority(rasterBundle, seed).grid.rows;
  assert.ok(grid.flat().every((cell) => cell === 1), "an empty rectangle list must rasterize to all wall");
});
