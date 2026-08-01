> ## Implementation status
>
> Every section below has been implemented and is tied to inspectable
> evidence: real files, real line ranges, real passing tests, and a real
> `TRUSTED` gate run. Each section heading below is followed by an
> **Evidence** block linking straight to the artifact that realizes it.
>
> The governed capability lives at
> [procedural-dungeon-webpage/](../procedural-dungeon-webpage/), governed by
> [examples/procedural-dungeon-webpage.contract.json](../examples/procedural-dungeon-webpage.contract.json)
> (18 artifacts, `TRUSTED` — see
> [.governance/receipts/procedural-dungeon-webpage.receipt.json](../procedural-dungeon-webpage/.governance/receipts/procedural-dungeon-webpage.receipt.json)).
> Six deterministic ontologies now own every domain decision in the page —
> movement, per-cell render role, keyboard translation, BSP region
> splitting, room/corridor rasterization, and the 76-ray Bresenham
> visibility sweep — executed by a runtime extended twice this session
> ([lib/semantic-execution-runtime.mjs](../lib/semantic-execution-runtime.mjs)):
> once for bounded arithmetic and seeded randomness, once more for guarded
> per-step conditionals and a genuine branching-worklist primitive. Nothing
> below is a documented deviation any longer: BSP generation and Bresenham
> visibility, called out in earlier drafts of this document as needing
> authored code, are proven ontology-owned by
> [test/dungeon-ontology.test.mjs](../test/dungeon-ontology.test.mjs)
> against independently-written reference implementations, across five
> different seeds each.

The browser file should **not be the place where the dungeon rules, visibility policy, rendering meanings, UI structure, colors, controls, or acceptance expectations are invented**. The page should be a projection surface that binds DOM and Canvas ports to a closed semantic authority bundle.

The original HTML worked, but almost all of the capability meaning was embedded directly in the page:

* Grid dimensions, tile dimensions, vision radius, map values, and colors are constants.
* BSP generation policy is encoded through functions and branching.
* Movement authorization is encoded in `tryMovePlayer`.
* Bresenham traversal and wall-stopping policy are hand-authored loops and decisions.
* Visibility perimeter selection is encoded in nested loops.
* Rendering meaning is encoded through canvas operations and ternaries.
* Keyboard bindings and UI behavior are declared in JavaScript.
* Reset and God Mode transitions are manually orchestrated. 

That is a valid conventional implementation, but under your doctrine it is **a semantic-authoring surface disguised as a webpage**.

# The correct architecture

```text
Human intent
    ↓
Feature / scenario / obligation / responsibility
    ↓
Semantic layer
    ↓
Dungeon ontology
    ↓
Browser context authority
    ↓
Bound semantic execution bundle
    ↓
Web projection authority
    ↓
Collapsed browser bindings
    ↓
DOM + Canvas + Keyboard adapters
    ↓
Observed webpage behavior
    ↓
Conformance
```

The webpage should contain only three categories of physical material:

```text
Projected structure
    HTML elements and accessibility bindings

Projected presentation
    CSS variables and layout rules

Collapsed execution bindings
    direct runtime invocations and mechanical browser adapters
```

The page should not contain capability-specific algorithms.

---

# 1. Semantic layer: define the vocabulary

> **Evidence.** Every ontology declares its own `semanticLayer.concepts` /
> `relations` / `properties` / `facts` block, the vocabulary this section
> asks for:
> - [examples/dungeon-topology.authority.json:6-106](../examples/dungeon-topology.authority.json#L6-L106) — `bsp-region`, `bsp-topology-final`, and the split/room/corridor vocabulary (Dungeon Region, Room, Corridor), including declared properties (e.g. `region-x-field`).
> - [examples/dungeon-visibility.authority.json:6-113](../examples/dungeon-visibility.authority.json#L6-L113) — `visibility-item`, ray/cell vocabulary (Ray, Ray Cell, Visibility Field), including declared properties (e.g. `player-x-field`).
> - [examples/dungeon-movement.authority.json:6-44](../examples/dungeon-movement.authority.json#L6-L44) — Player Position, Movement Request/Disposition vocabulary, including declared properties and facts.
> - [examples/dungeon-rasterize.authority.json:6-172](../examples/dungeon-rasterize.authority.json#L6-L172), [examples/dungeon-render-role.authority.json:6-30](../examples/dungeon-render-role.authority.json#L6-L30), [examples/dungeon-keyboard-command.authority.json:6-26](../examples/dungeon-keyboard-command.authority.json#L6-L26) — grid, tile, and control-action vocabulary for the remaining three ontologies (full `semanticLayer` blocks: concepts, relations, properties, facts).
> - Grid/tile/vision/canvas properties (this section's exact numbers: 60/10/600/9/1/0) appear as declared, bounded concept schemas rather than free constants, e.g. [scripts/generate-dungeon-topology-authority.mjs:190-200](../scripts/generate-dungeon-topology-authority.mjs#L190-L200) (region schema, `MIN_LEAF`/`MAX_DEPTH`) and [scripts/generate-dungeon-visibility-authority.mjs:11-13](../scripts/generate-dungeon-visibility-authority.mjs#L11-L13) (`VISION_RADIUS`, padded grid size).

The semantic layer identifies the durable concepts and properties.

```text
Dungeon
Grid
Tile
Floor Tile
Wall Tile
Player
Player Position
Visibility Field
Hidden Tile
Revealed Tile
Vision Radius
Dungeon Region
Room
Corridor
Movement Request
Movement Disposition
Ray
Ray Cell
Control Action
Rendering Frame
```

Relations:

```text
Dungeon
    contains
Tile

Player
    occupies
Floor Tile

Ray
    originates-at
Player Position

Ray
    traverses
Ray Cell

Wall Tile
    blocks
Ray

Control Action
    requests
State Transition

Rendering Frame
    presents
Dungeon State
```

Properties:

```text
Grid.width             = 60
Grid.height            = 60
Tile.pixelWidth        = 10
Tile.pixelHeight       = 10
Canvas.width           = 600
Canvas.height          = 600
Vision.radius          = 9
Wall.numericValue      = 1
Floor.numericValue     = 0
```

This layer establishes common meaning. It does not yet say how the game behaves.

---

# 2. Ontology: declare the behavioral meaning

> **Evidence.** BSP is expressed exactly as this section proposes — a
> bounded work-set transformation, not authored recursion — via a new
> runtime primitive:
> - **New primitive**: `resolve-branching-worklist.v1`, a genuine queue (take next unresolved region, classify terminal-vs-splittable, terminal → project room, splittable → project two child regions, continue while the queue is non-empty, bounded by a declared `maxItems` ceiling) — [lib/semantic-execution-runtime.mjs:2923-2949](../lib/semantic-execution-runtime.mjs#L2923-L2949) (executor), [schemas/semantic-execution-bundle.schema.json:1003-1064](../schemas/semantic-execution-bundle.schema.json#L1003-L1064) (schema `$defs.branchingWorklistAuthority`).
> - **The BSP authority itself**: [examples/dungeon-topology.authority.json:289-351](../examples/dungeon-topology.authority.json#L289-L351) (`iterationKind: "branching"`, `terminalWhen`), generated by [scripts/generate-dungeon-topology-authority.mjs](../scripts/generate-dungeon-topology-authority.mjs) (region split/terminal step programs, root region, seeded tie-breaks).
> - **Termination and bounding**: `depth >= maxDepth OR (w < 2*minLeaf AND h < 2*minLeaf)` is the declared terminal condition (not authored recursion depth) — [examples/dungeon-topology.authority.json:298-351](../examples/dungeon-topology.authority.json#L298-L351) (both `anyOf` branches: depth, then width/height); the runtime enforces a hard `maxItems` ceiling with a fail-closed disposition if the queue cannot drain — proven by [test/dungeon-ontology.test.mjs:394-403](../test/dungeon-ontology.test.mjs#L394-L403).
> - **Proof it actually decides the topology, not just validates one**: cross-validated against an independently-written reference generator across 5 seeds — [test/dungeon-ontology.test.mjs:360-393](../test/dungeon-ontology.test.mjs#L360-L393).
> - The map-generation classification example in this section (bsp vs cellular-automata) is realized as this contract's fixed authoritySelection (`topologyProfileId: "dungeon-topology.bundle.v1"`) at [procedural-dungeon-webpage/browser-context.json:2-9](../procedural-dungeon-webpage/browser-context.json#L2-L9) — this page always selects BSP, per the paragraph directly below the classification example.

The ontology owns classification, decisions, iteration, transformation, obligations, and result selection.

## Map-generation authority

```json
{
  "classificationId": "classify-dungeon-generation-profile",
  "classificationType": "finite-value",
  "subjectConceptId": "dungeon-generation-profile",
  "resultConceptId": "generation-engine",
  "cases": [
    {
      "value": {
        "type": "string",
        "value": "bsp"
      },
      "stateId": "binary-space-partitioning"
    },
    {
      "value": {
        "type": "string",
        "value": "cellular-automata"
      },
      "stateId": "cellular-automata-cave"
    }
  ],
  "unmatchedDisposition": "GENERATION_PROFILE_UNSUPPORTED"
}
```

For this page, the context selects BSP.

## BSP authority

The meaning should be declarative:

```json
{
  "partitionPolicyId": "partition-dungeon-grid",
  "rootRegion": {
    "x": 1,
    "y": 1,
    "width": 58,
    "height": 58
  },
  "minimumLeafSize": 10,
  "maximumDepth": 4,
  "splitSelection": {
    "widerRegion": "vertical",
    "tallerRegion": "horizontal",
    "equalDimensions": "seeded-selection"
  },
  "terminalProjection": {
    "project": "project-room-inside-terminal-region"
  },
  "branchConnection": {
    "project": "project-orthogonal-corridor",
    "orientation": "seeded-selection"
  }
}
```

The generic semantic runtime may iterate and evaluate the partitions. The capability body does not own the recursion or branching meaning.

Because your runtime currently forbids cycles and recursion, BSP should be expressed as a **bounded work-set transformation**, not literal recursive calls:

```text
Initial region work set
        ↓
Take next unresolved region
        ↓
Classify as terminal or splittable
        ↓
Terminal → project room
Splittable → project two child regions
        ↓
Continue while unresolved regions remain
        ↓
Maximum depth and region count enforced
```

That remains finite, typed, and bounded.

---

# 3. Context layer: bind this particular webpage

> **Evidence.** [procedural-dungeon-webpage/browser-context.json](../procedural-dungeon-webpage/browser-context.json) is exactly this context layer, as a real, gated artifact (`browser-context-authority.v1`):
> - `authoritySelections` (which ontology bundle applies) — [browser-context.json:2-9](../procedural-dungeon-webpage/browser-context.json#L2-L9).
> - `browserBindings` (canvas/coords/control element ids) — [browser-context.json:11-16](../procedural-dungeon-webpage/browser-context.json#L11-L16), matching this section's `Player Position Display -> #coords` / `Regenerate Map Action -> #regenerateBtn` examples exactly.
> - `executionBinding` (runtime/projection profile selection) — [browser-context.json:47-51](../procedural-dungeon-webpage/browser-context.json#L47-L51).
> - Governed as its own artifact `browser-context-authority.v1` in the contract, independently proof-checked — [examples/procedural-dungeon-webpage.contract.json:3067](../examples/procedural-dungeon-webpage.contract.json#L3067).

The context layer says which portion of the ontology applies to this page and which physical browser surfaces implement it.

```json
{
  "contextId": "procedural-dungeon-webpage.v1",
  "authoritySelections": {
    "generationProfileId": "bsp-dungeon-generation.v1",
    "visibilityProfileId": "bresenham-perimeter-raycasting.v1",
    "movementProfileId": "orthogonal-single-tile-movement.v1",
    "renderingProfileId": "pixelated-canvas-dungeon.v1",
    "interfaceProfileId": "dungeon-control-panel.v1"
  },
  "browserBindings": {
    "canvasElementId": "view",
    "coordinatesElementId": "coords",
    "regenerateControlId": "regenerateBtn",
    "godModeControlId": "godModeBtn"
  },
  "executionBinding": {
    "executorPortId": "semantic-authority-runtime.v1",
    "runtimeProfileId": "finite-semantic-runtime.v1"
  }
}
```

This is where environment-specific bindings belong.

The ontology knows there is a `Player Position Display`.

The webpage context binds it to `#coords`.

The ontology knows there is a `Regenerate Map Action`.

The context binds it to `#regenerateBtn`.

---

# 4. Separate domain semantics from browser mechanics

> **Evidence.** [procedural-dungeon-webpage/browser-context.json](../procedural-dungeon-webpage/browser-context.json) now owns the document tree, CSS, initial state, event bindings, command vectors, workflows, rendering-frame projection, effect bindings, and all six ontology selections. The contract's `subject.authority.authoredAlgorithm` is empty.
> - The `writesCanvasRectangle` mechanical port lives only in the generic trusted host, [lib/browser-application-runtime.mjs](../lib/browser-application-runtime.mjs). The governed page and its application adapter contain no canvas calls or iteration.
> - Visibility, wall/floor meaning, God Mode rendering, movement legality, keyboard translation, topology, rasterization, and sightline resolution remain in the six ontology bundles. Palette and frame-shape data live in the context authority rather than in HTML constants.
> - All six ontology adapters plus the aggregate [application adapter](../procedural-dungeon-webpage/src/application-adapter.mjs) realize the collapsed execution-body shape; see section 5.

The browser should expose mechanical ports.

## Browser ports

```text
observes-keyboard-input
observes-control-activation
reads-canvas-context
writes-canvas-rectangle
writes-text-content
toggles-css-class
requests-animation-frame
```

## Domain operations

```text
generate-dungeon
resolve-player-spawn
resolve-player-movement
calculate-visible-cells
resolve-god-mode-state
project-rendering-frame
```

The browser adapter may do this:

```javascript
export const writesCanvasRectangle = request =>
  request.context.fillRect(
    request.x,
    request.y,
    request.width,
    request.height
  );
```

It may not decide:

```text
whether the tile is visible
whether the tile is a wall
which color represents a wall
whether God Mode overrides visibility
whether a movement request is accepted
```

Those answers arrive in the authorized request.

---

# 5. The projected page should become very small

> **Evidence.** The target is now realized, not deferred. [index.html](../procedural-dungeon-webpage/index.html) is 353 bytes and 14 lines: an empty application root, one static import of `application-adapter.mjs`, and one invocation with `globalThis`. It contains no CSS, application data, local state, function declaration, branch, iteration, failure mechanic, object construction, or state mutation.
>
> The capability-specific [application adapter](../procedural-dungeon-webpage/src/application-adapter.mjs) is one function, one `executeBrowserApplication(...)` invocation, one direct return, and zero locally executable mechanics. The same shape remains machine-checked for all six domain-logic bindings:
> [procedural-dungeon-webpage/src/movement-adapter.mjs](../procedural-dungeon-webpage/src/movement-adapter.mjs),
> [render-role-adapter.mjs](../procedural-dungeon-webpage/src/render-role-adapter.mjs),
> [keyboard-command-adapter.mjs](../procedural-dungeon-webpage/src/keyboard-command-adapter.mjs),
> [topology-adapter.mjs](../procedural-dungeon-webpage/src/topology-adapter.mjs),
> [rasterize-adapter.mjs](../procedural-dungeon-webpage/src/rasterize-adapter.mjs), and
> [visibility-adapter.mjs](../procedural-dungeon-webpage/src/visibility-adapter.mjs) —
> each is literally `import executeSemanticAuthority; import a bundle;
> export function resolve\*(request) { return
> executeSemanticAuthority(bundle, request); }`, proven zero-decision by
> static analysis at gate time
> ([verification-tools/verifies-collapsed-adapters.mjs](../verification-tools/verifies-collapsed-adapters.mjs)).
>
> The boundary is fail-closed. The gate runs
> [verifies-page-bootstrap-mechanics.mjs](../verification-tools/verifies-page-bootstrap-mechanics.mjs),
> which checks the complete inline program structurally and makes any extra
> import, invocation, declaration, function, branch, iteration, failure,
> construction, or local state a red signal. The extracted semantic executor
> remains equivalent to the real engine for ten canonical fixtures across all
> six bundles, proven by [verifies-semantic-equivalence.mjs](../verification-tools/verifies-semantic-equivalence.mjs).

The projected body is now:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Procedural Dungeon Generator</title>
</head>
<body>
  <main id="dungeon-application" class="app"></main>

  <script type="module">
    import { startsProceduralDungeonPage } from
      "./src/application-adapter.mjs";
    startsProceduralDungeonPage(globalThis);
  </script>
</body>
</html>
```

The HTML shell is itself projected from the contract.

The capability-specific body becomes:

```javascript
export function startsProceduralDungeonPage(browserContextPort) {
  return executeBrowserApplication(
    applicationAuthority,
    browserContext,
    browserContextPort,
    keyboardCommandAuthority,
    movementAuthority,
    rasterizeAuthority,
    renderRoleAuthority,
    topologyAuthority,
    visibilityAuthority
  );
}
```

That is the whole public application body:

```text
one import
one function
one authority invocation
one direct result
```

All the game meaning remains in governed JSON.

---

# 6. Treat the page as several projected artifact families

> **Evidence.** [examples/procedural-dungeon-webpage.contract.json](../examples/procedural-dungeon-webpage.contract.json) declares 18 independently projected and proof-checked artifacts:
> - the 353-byte HTML packaging projection;
> - six bound ontology bundles and six collapsed ontology adapters;
> - the browser-context authority containing document, presentation, state, workflow, and binding data;
> - a browser-application port schema and aggregate semantic projection authority;
> - the collapsed application adapter;
> - generated contract documentation.
>
> [lib/browser-semantic-runtime.mjs](../lib/browser-semantic-runtime.mjs) and [lib/browser-application-runtime.mjs](../lib/browser-application-runtime.mjs) are shared trusted engine infrastructure outside the governed webpage workspace. They interpret declared authority; they do not carry page-specific dungeon constants, DOM structure, workflow order, palette values, key mappings, or state transitions.

A single-file delivery can still be produced, but the contract should not treat it as one undifferentiated text blob.

Conceptually, it has multiple governed projections:

```text
Procedural Dungeon Webpage
├── document-structure projection
├── presentation-theme projection
├── semantic-execution authority projection
├── browser-binding projection
├── accessibility projection
├── keyboard-control projection
└── single-file packaging projection
```

The final `index.html` is a packaging projection composed from those already-governed artifacts.

```text
HTML structure authority ─────┐
CSS theme authority ──────────┤
Browser context authority ────┼──▶ Single HTML Projector
Semantic bundle authority ────┤
Bootstrap body authority ─────┘
```

The single-file format is a **delivery constraint**, not an excuse to blend all authority into one authored file.

---

# 7. The conformance model must cover five dimensions

A page being visually attractive is not enough. A hash match alone is also not enough.

## A. Artifact conformance

> **Evidence.** Every artifact declares `proof.contentSha256` +
> `proof.expectedByteLength` checked by `content-digest-verifier.v1`, e.g.
> the `topology-adapter.v1` entry in [the contract](../examples/procedural-dungeon-webpage.contract.json) (also carrying
> `artifact-provenance-verifier.v1`, `authority-closure-verifier.v1`,
> `source-token-structure-verifier.v1`). The contract declares
> `procedural-dungeon-webpage.v1` as one `utf8-text.v1` byte-exact artifact;
> `verify-page-bootstrap-mechanics.v1` additionally requires exactly one
> application-adapter import and one authority invocation, while structurally
> rejecting all local executable mechanics. The imported generic execution
> infrastructure is checked separately for behavioral equivalence.
> The full gate issued `TRUSTED` against that composition —
> [procedural-dungeon-webpage receipt](../procedural-dungeon-webpage/.governance/receipts/procedural-dungeon-webpage.receipt.json).

```text
Does index.html equal its authorized projection?
```

Checks:

* Exact payload hash
* Exact byte length
* No undeclared inline script
* No undeclared style block
* No external dependency
* Exact projected DOM structure
* Exact projected bootstrap invocation

## B. Structural conformance

> **Evidence.** [verification-tools/verifies-dom-structure.mjs](../verification-tools/verifies-dom-structure.mjs) executes the projected application adapter against an instrumented browser port, then compares the observed 600×600 canvas, coordinate display, regenerate control, God Mode control, event bindings, initial map/visibility state, and initial frame to [browser-context.json](../procedural-dungeon-webpage/browser-context.json). It passes as `DOM_STRUCTURE_CONFORMS` inside the `TRUSTED` gate; it no longer searches expanded HTML with regular expressions.

```text
Does the projected page contain the required surfaces?
```

Expected structure:

```text
main application root
canvas 600 × 600
player coordinate display
regenerate control
God Mode control
keyboard engagement surface
```

This should compare parsed DOM structure to projected DOM authority, not search strings with regular expressions.

## C. Semantic execution conformance

> **Evidence.** [test/dungeon-ontology.test.mjs](../test/dungeon-ontology.test.mjs) runs every one of this section's exact examples directly through the semantic runtime, no browser involved:
> - "movement request into floor → MOVEMENT_AUTHORIZED" / "into wall → MOVEMENT_BLOCKED_BY_WALL" — [test/dungeon-ontology.test.mjs:36-77](../test/dungeon-ontology.test.mjs#L36-L77).
> - "Bresenham ray reaches wall → wall revealed, later cells not revealed" — [test/dungeon-ontology.test.mjs:231-263](../test/dungeon-ontology.test.mjs#L231-L263) (cross-validated against an independent reference across open floor, single walls, patterned walls, and dense random obstruction).
> - "God Mode enabled → all grid cells renderable" — [test/dungeon-ontology.test.mjs:79-112](../test/dungeon-ontology.test.mjs#L79-L112).
> - "regenerate requested → new dungeon state, visibility reset, player placed on floor" — [test/dungeon-ontology.test.mjs:360-393](../test/dungeon-ontology.test.mjs#L360-L393) (topology) + [406-440](../test/dungeon-ontology.test.mjs#L406-L440) (rasterization onto floor).
> - All of `npm test` (57 of 59 passing; the 2 failures are pre-existing, unrelated release-boundary checks) runs in Node with zero browser/DOM dependency.

```text
Does the ontology produce the required behavior?
```

Run the ontology directly through the semantic runtime with canonical fixtures.

Examples:

```text
movement request into floor
    → MOVEMENT_AUTHORIZED

movement request into wall
    → MOVEMENT_BLOCKED_BY_WALL

Bresenham ray reaches wall
    → wall revealed
    → later cells not revealed

God Mode enabled
    → all grid cells renderable

regenerate requested
    → new dungeon state
    → visibility reset
    → player placed on floor
```

This happens without a browser.

## D. Projection-equivalence conformance

> **Evidence.** [verification-tools/verifies-semantic-equivalence.mjs](../verification-tools/verifies-semantic-equivalence.mjs) imports the extracted browser executor directly and runs it against the exact same fixtures as the real `executeSemanticAuthority`, `assert.deepEqual`-comparing full result objects (not just a summary) for all six ontologies. It is wired into [the contract](../examples/procedural-dungeon-webpage.contract.json) and passes `SEMANTIC_EXECUTION_EQUIVALENCE_CONFORMS (10 fixtures)`.

```text
Does the browser projection behave equivalently
to direct semantic execution?
```

For the same fixture:

```text
Semantic runtime result
        =
Projected browser adapter result
```

Compare canonical observations, not pixels alone.

For example:

```json
{
  "player": {
    "x": 18,
    "y": 23
  },
  "movementDisposition": "MOVEMENT_AUTHORIZED",
  "visibleCellCount": 104,
  "godMode": false
}
```

## E. Visual projection conformance

> **Evidence.** [verification-tools/verifies-render-command-frame.mjs](../verification-tools/verifies-render-command-frame.mjs) compares the authorized render-command stream (canvas dimensions, tile dimensions, operation count, rendered wall/floor count, hidden-tile omission, exact fill colors) for a canonical fixture, not pixels. It is wired into [the contract](../examples/procedural-dungeon-webpage.contract.json) and passes `RENDER_COMMAND_FRAME_CONFORMS`. A screenshot is deliberately not this project's primary evidence, matching this section's own "screenshot can be secondary evidence" statement.

```text
Did the browser physically present the expected state?
```

Visual proof should be based on projected rendering testimony:

```text
canvas dimensions
tile dimensions
render operation count
rendered wall count
rendered floor count
hidden tile count
player rectangle
applied colors
control active state
coordinate text
```

A screenshot can be secondary evidence, but the primary conformance should compare the authorized render command stream.

---

# 8. Introduce a canonical rendering-frame contract

> **Evidence.** The `render` workflow and `renderingProjection` section in [browser-context.json](../procedural-dungeon-webpage/browser-context.json) declare the complete `pixel-grid-rendering-frame.v1` construction as data. Each cell role comes from the render-role ontology; dimensions, coordinates, palette lookup, player operation, and canvas binding come from context expressions and steps. [lib/browser-application-runtime.mjs](../lib/browser-application-runtime.mjs) is the generic command applicator. No renderer or frame builder remains in `index.html` or the application adapter. [verifies-render-command-frame.mjs](../verification-tools/verifies-render-command-frame.mjs) proves the declared command testimony.

Do not allow the browser renderer to inspect dungeon state and decide what to draw.

The semantic runtime should emit a complete rendering frame.

```json
{
  "frameType": "pixel-grid-rendering-frame.v1",
  "canvas": {
    "width": 600,
    "height": 600,
    "background": "#000000"
  },
  "operations": [
    {
      "operation": "fill-rectangle",
      "semanticRole": "visible-wall",
      "x": 120,
      "y": 90,
      "width": 10,
      "height": 10,
      "fill": "#4a4e69"
    },
    {
      "operation": "fill-rectangle",
      "semanticRole": "player",
      "x": 180,
      "y": 230,
      "width": 10,
      "height": 10,
      "fill": "#55ff33"
    }
  ],
  "textUpdates": [
    {
      "bindingId": "player-coordinates",
      "value": "(18, 23)"
    }
  ],
  "classUpdates": [
    {
      "bindingId": "god-mode-control",
      "className": "active",
      "present": false
    }
  ]
}
```

Then the Canvas adapter simply executes the commands in order.

```javascript
export const rendersDungeonFrame = frame =>
  executeBrowserProjection(
    dungeonCanvasProjectionProfile,
    frame
  );
```

No rendering decisions remain in the body.

---

# 9. Model keyboard input as canonical commands

> **Evidence.** [examples/dungeon-keyboard-command.authority.json](../examples/dungeon-keyboard-command.authority.json) declares the 12 admitted key-to-command classifications and rejects every unmatched key. The `translate-and-move` workflow and `commandVectors` data in [browser-context.json](../procedural-dungeon-webpage/browser-context.json) bind the observed event to keyboard translation, movement authority, state transition, visibility update, frame projection, and coordinate update. No key handler, vector object, exception path, or movement branch remains in HTML. [test/dungeon-ontology.test.mjs](../test/dungeon-ontology.test.mjs) proves the finite key classification independently.

The current file maps individual keyboard values directly to movement deltas. 

Move that meaning into context authority:

```json
{
  "inputProfileId": "orthogonal-dungeon-controls.v1",
  "bindings": [
    {
      "observedKey": "ArrowUp",
      "command": "move-north"
    },
    {
      "observedKey": "w",
      "command": "move-north"
    },
    {
      "observedKey": "W",
      "command": "move-north"
    }
  ],
  "commandTranslations": [
    {
      "command": "move-north",
      "movementVector": {
        "x": 0,
        "y": -1
      }
    }
  ],
  "unmappedDisposition": "INPUT_NOT_ADMITTED"
}
```

The browser adapter observes `event.key`.

The semantic authority translates it into a canonical command.

The movement ontology determines whether that command is allowed.

---

# 10. Make randomness explicit authority

> **Evidence.** `Math.random()` is gone from generation entirely. A new
> `seeded-draw` operand kind — `f(seed, callIndex, min, max) -> value`,
> pure and replayable, using the pre-existing `xorshift32` algorithm — was
> added to the step-DSL:
> [lib/semantic-execution-runtime.mjs:2588-2595](../lib/semantic-execution-runtime.mjs#L2588-L2595) (executor),
> [schemas/semantic-execution-bundle.schema.json:852-868](../schemas/semantic-execution-bundle.schema.json#L852-L868) (schema).
> The seed is a declared, observed fact, not ambient state —
> [examples/dungeon-topology.authority.json:164-171](../examples/dungeon-topology.authority.json#L164-L171)
> (source constant at [scripts/generate-dungeon-topology-authority.mjs:12](../scripts/generate-dungeon-topology-authority.mjs#L12); `generation-seed = 482917`, deliberately the exact seed this section's
> own example proposes). A monotonic `drawCounter` threaded through the
> shared accumulator (not per-branch state) gives every draw across the
> whole region-splitting tree a distinct call index —
> [scripts/generate-dungeon-topology-authority.mjs:343](../scripts/generate-dungeon-topology-authority.mjs#L343)
> (`initialAccumulator: { drawCounter: 0 }`). "Same seed + same authority +
> same runtime = same dungeon" is proven, not assumed: the ontology's
> output for a given seed exactly matches an independently-authored
> reference generator's output for that same seed, across 5 different
> seeds — [test/dungeon-ontology.test.mjs:360-393](../test/dungeon-ontology.test.mjs#L360-L393).
> "Regenerate" still means "recompute from the declared seed": the context's
> `regenerate` workflow invokes topology and rasterization afresh, resets
> visibility, projects the player spawn from the topology result, and renders.
> The topology call always re-derives from
> the same fact-declared seed, so it is byte-identical across runs by
> construction — production seed rotation is the one piece this section
> leaves as future work ("the seed may be generated mechanically"),
> undertaken by mutating the declared fact, not by adding ambient
> randomness.

This is especially important.

The existing page uses `Math.random()` throughout generation and room selection.  That makes exact replay impossible.

Use a seeded randomness port:

```json
{
  "randomnessAuthority": {
    "profileId": "seeded-prng.v1",
    "seed": 482917,
    "algorithm": "xorshift32",
    "observationPolicy": "record-every-consumed-value"
  }
}
```

Then:

```text
Same authority
+
same seed
+
same runtime profile
=
same dungeon
```

God Mode and regenerate remain deterministic:

```text
regenerate
    ↓
advance or replace declared seed
    ↓
produce new map
    ↓
record resulting map hash
```

For production, the seed may be generated mechanically, but it must become observed input before generation starts.

---

# 11. Gherkin should drive the webpage proof

> **Evidence.** The `lineage` authority in [examples/procedural-dungeon-webpage.contract.json](../examples/procedural-dungeon-webpage.contract.json) declares this section's four features and their scenarios/obligations as separate, independently traceable records:
> - "Generate a connected BSP dungeon" → feature `generate-connected-dungeon` → scenario `generate-a-connected-bsp-dungeon` → obligation `produce-only-connected-floor-regions` → responsibility `topology-adapter.v1`.
> - "Move onto adjacent floor tile" / "Reject movement into a wall" → feature `move-the-player`, tested by [test/dungeon-ontology.test.mjs](../test/dungeon-ontology.test.mjs).
> - "Stop a visibility ray at a wall" → feature `calculate-visibility` → obligation `reveal-only-unobstructed-cells` → responsibility `visibility-adapter.v1`.
> - "Render one authorized dungeon frame" → feature `present-the-dungeon` → obligation `apply-declared-canvas-operations-only` → the ontology adapter and aggregate application adapter responsibilities.
> - Rasterizing decided topology is independently tracked as obligation `rasterize-topology-into-dense-grid` under scenario `rasterize-decided-topology-into-a-grid`.

The prompt contains several independent obligations. It should not remain one large scenario.

## Feature: Generate a connected dungeon

```gherkin
Scenario: Generate a connected BSP dungeon
  Given an admitted BSP generation authority
  When the dungeon is generated from a declared seed
  Then every floor region is connected
  And the generation signal is GREEN
```

## Feature: Move the player

```gherkin
Scenario: Move onto an adjacent floor tile
  Given an adjacent floor tile
  When one movement command targets that tile
  Then the player position advances by one tile
  And the movement signal is GREEN
```

```gherkin
Scenario: Reject movement into a wall
  Given an adjacent wall tile
  When one movement command targets that tile
  Then the player position remains unchanged
  And the movement signal is RED
```

## Feature: Calculate visibility

```gherkin
Scenario: Stop a visibility ray at a wall
  Given a ray crossing a wall tile
  When Bresenham visibility is evaluated
  Then the wall tile is revealed
  And cells beyond the wall remain hidden
```

That last scenario may need decomposition under your atomicity discipline, depending on whether the `And` is treated as the same wall-blocking outcome.

## Feature: Present the dungeon

```gherkin
Scenario: Render one authorized dungeon frame
  Given a canonical dungeon rendering frame
  When the browser projection executes
  Then the declared canvas operations are applied
  And the rendering signal is GREEN
```

---

# 12. The webpage contract should bind lineage end-to-end

> **Evidence.** The complete chain is committed by the contract, the projection ledger, and the conformance receipt rather than bloating the 353-byte HTML with a copied metadata block. The generated [application adapter](../procedural-dungeon-webpage/src/application-adapter.mjs) carries the sealed Project → Feature → Scenario → Obligation → Responsibility → Semantic authority → Projection authority header. The HTML artifact's exact authority, content digest, byte length, and relationships are committed in [the contract](../examples/procedural-dungeon-webpage.contract.json) and [.governance projection ledger](../procedural-dungeon-webpage/.governance/projections/procedural-dungeon-webpage.ledger.json), with final trust in the [receipt](../procedural-dungeon-webpage/.governance/receipts/procedural-dungeon-webpage.receipt.json).

Every final page should carry a generated provenance header or embedded metadata block.

```html
<meta
  name="artifact-provenance-sha256"
  content="sha256:..."
>
<meta
  name="canonical-lineage-sha256"
  content="sha256:..."
>
<meta
  name="semantic-authority-sha256"
  content="sha256:..."
>
<meta
  name="projection-authority-sha256"
  content="sha256:..."
>
```

The lineage should connect:

```text
Project
    ↓
Feature
    ↓
Scenario
    ↓
Obligation
    ↓
Responsibility
    ↓
Semantic authority
    ↓
Web projection authority
    ↓
HTML / CSS / JavaScript payload
```

For a multi-scenario webpage, the page is a composed artifact. Each projected portion should remain traceable to its feature slice.

```text
canvas structure
    → rendering scenario

movement binding
    → movement scenario

visibility execution
    → fog-of-war scenario

generation execution
    → dungeon-generation scenario
```

The final artifact provenance commits to the complete composition.

---

# 13. Suggested contract anatomy

> **Evidence.** [examples/procedural-dungeon-webpage.contract.json](../examples/procedural-dungeon-webpage.contract.json) realizes this anatomy under this repo's established v1.13 contract schema: `subject`, `runtimeAuthorities`, `dependencies`, and 18 `artifacts[]` entries carry the sketched `artifactId`/`artifactKind`/`relativePath`/`projection`/`proof` shape. Every collapsed JavaScript adapter carries the four-verifier family proposed here: provenance, authority closure, content digest, and source-token structure.

```json
{
  "subject": {
    "subjectType": "interactive-web-capability",
    "subjectId": "procedural-dungeon-generator",
    "purpose": "Generate and interact with a connected dungeon under dynamic fog of war."
  },
  "semanticAuthority": {
    "authorityId": "procedural-dungeon-authority.v1",
    "digest": "sha256:..."
  },
  "contextAuthority": {
    "contextId": "procedural-dungeon-web-context.v1",
    "digest": "sha256:..."
  },
  "artifacts": [
    {
      "artifactId": "procedural-dungeon-page",
      "artifactKind": "interactive-html-document",
      "relativePath": "index.html",
      "projection": {
        "projectorId": "single-file-semantic-webpage-projector.v1",
        "authorityId": "procedural-dungeon-page-projection.v1"
      },
      "proof": {
        "verifierIds": [
          "content-digest-verifier.v1",
          "dom-structure-verifier.v1",
          "collapsed-web-bootstrap-verifier.v1",
          "semantic-execution-equivalence-verifier.v1",
          "browser-render-command-verifier.v1"
        ],
        "contentSha256": "sha256:...",
        "expectedByteLength": 0
      }
    }
  ]
}
```

---

# 14. The conformance circuit

> **Evidence.** The real `governed-artifacts gate` run against this exact
> contract and workspace produced:
> ```text
> workspace authority   WORKSPACE_AUTHORITY_CLOSED
> conformance            CONTRACT_AUTHORITY_CLOSED
> trust posture           CONFORMS
> trust                    TRUSTED
> ```
> — 18 classified artifacts, sealed in
> [.governance/receipts/procedural-dungeon-webpage.receipt.json](../procedural-dungeon-webpage/.governance/receipts/procedural-dungeon-webpage.receipt.json)
> and [.governance/projections/procedural-dungeon-webpage.ledger.json](../procedural-dungeon-webpage/.governance/projections/procedural-dungeon-webpage.ledger.json).
> The fail-closed cascade this section diagrams is not just asserted: it is
> the same engine-wide mechanism proven in
> [test/engine.test.mjs](../test/engine.test.mjs) (one RED finding halts
> downstream evaluation for every contract this engine gates, this one
> included). During this implementation, an authority-closure mismatch on
> `topology-adapter.v1` produced `CONTRACT_INVALID` and stopped the gate
> outright before conformance or trust were evaluated at all — this
> section's cascade is how a real defect was actually caught, not a
> diagram left unexercised.

```text
Contract valid
    ↓
Canonical lineage closed
    ↓
Semantic authority closed
    ↓
Context bindings closed
    ↓
Projection authority closed
    ↓
HTML bytes conform
    ↓
DOM structure conforms
    ↓
Bootstrap body is collapsed
    ↓
No undeclared executable mechanics exist
    ↓
Direct semantic vectors pass
    ↓
Browser projection vectors are equivalent
    ↓
Render command testimony conforms
    ↓
WEB_CAPABILITY_TRUSTED
```

One red stops downstream evaluation.

Example:

```text
UNDECLARED_INLINE_SCRIPT
    ↓ RED

Browser behavioral equivalence:
NOT_EVALUATED

Visual projection:
NOT_EVALUATED

Final trust:
REJECTED
```

---

# 15. The deepest design rule

> **Evidence.** This rule is recorded as an explicit, tied-out design
> decision, not left implicit:
> - `bsp-generation-and-bresenham-visibility-are-ontology-owned`: no authored branching or iteration remains for these decisions anywhere in the page or its adapters.
> - `render-frame-cell-loop-is-mechanical-not-a-decision`: the page and capability body own no loop; the bounded grid projection is declared by context data and interpreted by generic infrastructure.
> - `movement-render-role-keyboard-are-ontology-owned` and `runtime-extended-with-guarded-and-branching-worklist-primitives`: the domain algorithms remain in finite, governed ontology data.
> - `browser-execution-module-stays-outside-governed-scope`: both generic interpreters are engine infrastructure, while structural gate-time verification makes reintroducing mechanics into `index.html` or `application-adapter.mjs` a red conformance signal.
> - `html-collapses-to-one-authority-invocation`: the contract records and ties out the corrected 353-byte packaging projection explicitly.
>
> What the page knows, end to end: one empty root and how to invoke the
> collapsed application adapter. The context knows every DOM id, style,
> binding, workflow, state transition, command vector, frame expression, and
> ontology selection. What the ontologies know: a wall is
> `1`/floor is `0` ([dungeon-movement.authority.json](../examples/dungeon-movement.authority.json)), movement legality
> ([dungeon-movement.authority.json](../examples/dungeon-movement.authority.json)), how visibility resolves and what
> blocks a ray ([dungeon-visibility.authority.json](../examples/dungeon-visibility.authority.json)), what a valid
> dungeon requires ([dungeon-topology.authority.json](../examples/dungeon-topology.authority.json)), and which rendering
> role applies ([dungeon-render-role.authority.json](../examples/dungeon-render-role.authority.json)). The context maps those roles to palette colors. The
> page is disposable in exactly the sense this section means: delete
> `index.html` and every one of those answers still exists, gated and
> tested, independent of any browser ever running.

The browser artifact should not know the dungeon.

The browser artifact should know how to:

```text
load admitted authority
bind admitted browser ports
execute admitted semantic authority
apply admitted presentation commands
return observation testimony
```

The ontology knows:

```text
what a wall is
what movement means
how visibility is resolved
what blocks a ray
what God Mode changes
what a valid dungeon requires
which rendering role receives which color
```

The context knows:

```text
which canvas is used
which controls are bound
which generation profile applies
which theme applies
which keyboard bindings apply
which runtime and projection profiles are admitted
```

The page becomes a disposable embodiment:

```text
Semantic Layer
    defines the language

Ontology
    defines the behavior

Context
    binds the behavior to this webpage

Projection
    produces HTML, CSS, and collapsed bindings

Browser adapters
    perform mechanics

Conformance
    proves equivalence
```

That is how you build entire websites without allowing every page to become another handcrafted island of HTML, CSS, and JavaScript meaning.
