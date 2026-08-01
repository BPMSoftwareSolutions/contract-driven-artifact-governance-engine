// Turns the topology ontology's unified paint-rectangle list (rooms and
// corridor segments, all expressed as plain [loX,loY]-[hiX,hiY] rectangles)
// into the dense wall/floor grid the visibility and render-role ontologies
// consume. This is a single flat, statically-ordered raster sweep over every
// cell of the padded grid -- the raster order itself never depends on the
// generated dungeon, only which rectangle (if any) a given cell falls inside
// does, and that is decided per cell by guarded containment checks, not by
// authored branching.
import { writeFileSync } from "node:fs";

const TOTAL_SIZE = 78;
const MAX_RECTS = 72; // matches dungeon-topology's rectLoX/rectLoY/rectHiX/rectHiY capacity
const TOTAL_CELLS = TOTAL_SIZE * TOTAL_SIZE;

function itemField(path) { return { kind: "item-field", path }; }
function fact(factId) { return { kind: "fact", factId }; }
function itemFieldIndexed(path, indexPath) { return { kind: "item-field-indexed", path, indexPath }; }
function itemFieldLength(path) { return { kind: "item-field-length", path }; }

const gtEq = ["greater-than", "equal-to"];
const ltEq = ["less-than", "equal-to"];
const eq = ["equal-to"];

const steps = [
  // start this cell as WALL(1); a matched rectangle below turns it FLOOR(0),
  // matching the WALL=1/FLOOR=0 convention the visibility and render-role
  // ontologies already expect from a dense grid.
  { targetPath: ["slotIndex"], operation: "set", operand: fact("negative-one") },
  { targetPath: ["cellGridValue"], operation: "set", operand: fact("one") }
];

// rectCount is computed once: comparing cellX/cellY against an out-of-bounds
// (unused) slot reads `undefined`, and undefined fails both `<` and `>`,
// which this engine's three-state compare reports as "equal-to" -- exactly
// the state admitted by both the >= and <= match-state sets below. Without
// an explicit "this slot is actually populated" condition, every unused
// slot would spuriously satisfy full containment for every cell.
steps.push({ targetPath: ["rectCount"], operation: "set", operand: itemFieldLength(["rectLoX"]) });

for (let slot = 0; slot < MAX_RECTS; slot += 1) {
  steps.push({ targetPath: ["slotIndex"], operation: "add", operand: fact("one") });
  steps.push({ targetPath: ["containCount"], operation: "set", operand: fact("zero") });
  steps.push({
    targetPath: ["containCount"], operation: "add", operand: fact("one"),
    when: { operand: itemField(["slotIndex"]), compareTo: itemField(["rectCount"]), matchStates: ["less-than"] }
  });
  steps.push({
    targetPath: ["containCount"], operation: "add", operand: fact("one"),
    when: { operand: itemField(["cellX"]), compareTo: itemFieldIndexed(["rectLoX"], ["slotIndex"]), matchStates: gtEq }
  });
  steps.push({
    targetPath: ["containCount"], operation: "add", operand: fact("one"),
    when: { operand: itemField(["cellX"]), compareTo: itemFieldIndexed(["rectHiX"], ["slotIndex"]), matchStates: ltEq }
  });
  steps.push({
    targetPath: ["containCount"], operation: "add", operand: fact("one"),
    when: { operand: itemField(["cellY"]), compareTo: itemFieldIndexed(["rectLoY"], ["slotIndex"]), matchStates: gtEq }
  });
  steps.push({
    targetPath: ["containCount"], operation: "add", operand: fact("one"),
    when: { operand: itemField(["cellY"]), compareTo: itemFieldIndexed(["rectHiY"], ["slotIndex"]), matchStates: ltEq }
  });
  steps.push({
    targetPath: ["cellGridValue"], operation: "set", operand: fact("zero"),
    when: { operand: itemField(["containCount"]), compareTo: fact("five"), matchStates: eq }
  });
}

steps.push(
  { targetPath: ["currentRow"], operation: "append", operand: itemField(["cellGridValue"]) },
  // advance raster position: wrap cellX at the row width, otherwise step
  // across. isLastColumn is captured once, before either branch below
  // mutates cellX -- guards read the step program's own evolving state, so
  // testing cellX directly a second time (after the first branch already
  // rewrote it to 0) would wrongly re-fire the "still mid-row" branch too.
  { targetPath: ["isLastColumn"], operation: "set", operand: fact("zero") },
  { targetPath: ["isLastColumn"], operation: "set", operand: fact("one"), when: { operand: itemField(["cellX"]), compareTo: fact("last-column"), matchStates: eq } },
  { targetPath: ["rows"], operation: "append", operand: itemField(["currentRow"]), when: { operand: itemField(["isLastColumn"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["currentRow"], operation: "set", operand: fact("empty-array"), when: { operand: itemField(["isLastColumn"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["cellY"], operation: "add", operand: fact("one"), when: { operand: itemField(["isLastColumn"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["cellX"], operation: "set", operand: fact("zero"), when: { operand: itemField(["isLastColumn"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["cellX"], operation: "add", operand: fact("one"), when: { operand: itemField(["isLastColumn"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["cellIndex"], operation: "add", operand: fact("one") }
);

console.log("rasterize advance steps:", steps.length);

const rectArraySchema = { type: "array", maxItems: MAX_RECTS, items: { type: "integer", minimum: -1000, maximum: 1000 } };
const rowSchema = { type: "array", minItems: 0, maxItems: TOTAL_SIZE, items: { type: "integer", minimum: 0, maximum: 1 } };

const rasterItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "rectLoX", "rectLoY", "rectHiX", "rectHiY",
    "cellIndex", "cellX", "cellY", "slotIndex", "rectCount", "containCount", "cellGridValue", "isLastColumn",
    "currentRow", "rows"
  ],
  properties: {
    rectLoX: rectArraySchema,
    rectLoY: rectArraySchema,
    rectHiX: rectArraySchema,
    rectHiY: rectArraySchema,
    cellIndex: { type: "integer", minimum: 0, maximum: TOTAL_CELLS + 4 },
    cellX: { type: "integer", minimum: 0, maximum: TOTAL_SIZE - 1 },
    // the final iteration's row-rollover advances cellY one past the last
    // row (a harmless overshoot never read again), so the bound allows it
    cellY: { type: "integer", minimum: 0, maximum: TOTAL_SIZE },
    slotIndex: { type: "integer", minimum: -1, maximum: MAX_RECTS },
    rectCount: { type: "integer", minimum: 0, maximum: MAX_RECTS },
    containCount: { type: "integer", minimum: 0, maximum: 5 },
    isLastColumn: { type: "integer", minimum: 0, maximum: 1 },
    cellGridValue: { type: "integer", minimum: 0, maximum: 1 },
    currentRow: rowSchema,
    rows: { type: "array", minItems: 0, maxItems: TOTAL_SIZE, items: rowSchema }
  }
};

const declaration = {
  authorityType: "bound-semantic-execution-authority.v1",
  authorityId: "dungeon-rasterize.bundle.v1",
  ontologyId: "dungeon-rasterize",
  inputConceptId: "raster-item",
  semanticLayer: {
    concepts: [
      { conceptId: "raster-item", conceptType: "domain-entity", isA: [], abstract: false, schemaId: "raster-item.schema.v1" },
      { conceptId: "raster-item-final", conceptType: "domain-value", isA: [], abstract: false, schemaId: "raster-item.schema.v1" },
      { conceptId: "raster-item-variant-id", conceptType: "classification", isA: [], abstract: false, schemaId: "raster-item-variant-id.schema.v1" },
      { conceptId: "int-value", conceptType: "domain-value", isA: [], abstract: false, schemaId: "int-value.schema.v1" },
      { conceptId: "array-value", conceptType: "domain-value", isA: [], abstract: false, schemaId: "array-value.schema.v1" },
      { conceptId: "presence-state", conceptType: "classification", isA: [], abstract: false, schemaId: "presence-state.schema.v1" },
      { conceptId: "obligation-status", conceptType: "signal", isA: [], abstract: false, schemaId: "obligation-status.schema.v1" },
      { conceptId: "result-type-concept", conceptType: "canonical-value", isA: [], abstract: false, schemaId: "result-type.schema.v1" },
      { conceptId: "raster-result", conceptType: "result-union", isA: [], abstract: false, schemaId: "raster-result.schema.v1" }
    ],
    relations: [
      { relationId: "sweep-produces-grid", relationType: "computes", subjectConceptId: "raster-item-final", objectConceptId: "raster-item-final", cardinality: "exactly-one" }
    ],
    properties: [
      { propertyId: "cell-index-field", propertyKind: "observed", subjectConceptId: "raster-item", valueConceptId: "int-value", cardinality: "exactly-one", resolutions: [{ subjectVariantConceptId: "raster-item", path: ["cellIndex"] }] },
      { propertyId: "result-type", propertyKind: "projected", subjectConceptId: "raster-result", valueConceptId: "result-type-concept", cardinality: "exactly-one", resolutions: [] },
      { propertyId: "result-grid", propertyKind: "projected", subjectConceptId: "raster-result", valueConceptId: "raster-item-final", cardinality: "exactly-one", resolutions: [] }
    ],
    facts: [
      { factId: "zero", conceptId: "int-value", value: { type: "number", value: 0 } },
      { factId: "one", conceptId: "int-value", value: { type: "number", value: 1 } },
      { factId: "five", conceptId: "int-value", value: { type: "number", value: 5 } },
      { factId: "negative-one", conceptId: "int-value", value: { type: "number", value: -1 } },
      { factId: "last-column", conceptId: "int-value", value: { type: "number", value: TOTAL_SIZE - 1 } },
      { factId: "total-cells", conceptId: "int-value", value: { type: "number", value: TOTAL_CELLS } },
      { factId: "empty-array", conceptId: "array-value", value: { type: "array", value: [] } }
    ]
  },
  ontology: {
    classifications: [
      {
        classificationId: "raster-item-variant",
        classificationType: "concept-variant",
        subjectConceptId: "raster-item",
        resultConceptId: "raster-item-variant-id",
        variants: ["raster-item"],
        noMatchDisposition: "RASTER_ITEM_VARIANT_UNRESOLVED",
        multipleMatchDisposition: "RASTER_ITEM_VARIANT_AMBIGUOUS"
      },
      {
        classificationId: "presence-classification",
        classificationType: "property-state",
        propertyId: "cell-index-field",
        resultConceptId: "presence-state",
        expectedValueType: "number",
        emptyStringState: "present",
        states: ["missing", "null", "empty-string", "invalid-type", "present"]
      }
    ],
    constraints: [],
    translations: [],
    obligations: [
      {
        obligationId: "always-present-obligation",
        subjectConceptId: "raster-item",
        classificationId: "presence-classification",
        resultConceptId: "obligation-status",
        satisfiedStateIds: ["present"],
        failureDisposition: "RASTER_ITEM_MISSING"
      }
    ],
    transformations: [
      {
        transformationId: "emit-grid",
        relationId: "sweep-produces-grid",
        sourceAuthorityId: "rasterize-sweep",
        targetPropertyId: "result-grid",
        outputPath: ["grid"],
        valueConceptId: "raster-item-final",
        resultIds: ["raster-ok"],
        unavailableDisposition: "RASTER_GRID_UNAVAILABLE",
        invalidTypeDisposition: "RASTER_GRID_INVALID"
      }
    ],
    results: [
      {
        resultUnionId: "raster-result-union",
        resultTypeConceptId: "raster-result",
        members: [
          {
            resultId: "raster-ok",
            conceptId: "raster-result",
            discriminator: { propertyId: "result-type", outputPath: ["resultType"], value: { type: "string", value: "raster-result" } }
          }
        ],
        selectionRules: [
          { ruleId: "always-ok", when: [{ inputPort: "presenceObligation", obligationId: "always-present-obligation", status: "satisfied" }], resultId: "raster-ok" },
          { ruleId: "still-ok-when-violated", when: [{ inputPort: "presenceObligation", obligationId: "always-present-obligation", status: "violated" }], resultId: "raster-ok" }
        ],
        noMatchDisposition: "RESULT_SELECTION_NOT_TOTAL",
        multipleMatchDisposition: "RESULT_SELECTION_AMBIGUOUS",
        invalidResultDisposition: "RASTER_RESULT_INVALID",
        serializerId: "identity.v1"
      }
    ],
    arithmeticOperations: [],
    randomDraws: [],
    indexedReads: [],
    iterations: [
      {
        iterationKind: "linear",
        iterationId: "rasterize-sweep",
        itemConceptId: "raster-item",
        resultConceptId: "raster-item-final",
        resultMode: "final-item",
        maxSteps: TOTAL_CELLS + 4,
        unresolvedDisposition: "RASTER_SWEEP_LIMIT_EXCEEDED",
        continueCondition: {
          operandPath: ["cellIndex"],
          compareTo: fact("total-cells"),
          continueWhenStates: ["less-than"]
        },
        advance: { steps }
      }
    ]
  },
  context: {
    schemas: [
      { schemaId: "raster-item.schema.v1", value: rasterItemSchema },
      { schemaId: "raster-item-variant-id.schema.v1", value: { const: "raster-item" } },
      { schemaId: "int-value.schema.v1", value: { type: "integer", minimum: -1000, maximum: 100000 } },
      { schemaId: "array-value.schema.v1", value: { type: "array", maxItems: 0 } },
      { schemaId: "presence-state.schema.v1", value: { enum: ["missing", "null", "empty-string", "invalid-type", "present"] } },
      { schemaId: "obligation-status.schema.v1", value: { enum: ["satisfied", "violated"] } },
      { schemaId: "result-type.schema.v1", value: { const: "raster-result" } },
      {
        schemaId: "raster-result.schema.v1",
        value: {
          type: "object",
          additionalProperties: false,
          required: ["resultType", "grid"],
          properties: {
            resultType: { const: "raster-result" },
            grid: rasterItemSchema
          }
        }
      }
    ],
    catalogs: [],
    executionBinding: {
      executorPortId: "semantic-authority-runtime.v1",
      runtimeProfileId: "finite-semantic-runtime.v3",
      serializationProfileId: "canonical-json.v1"
    }
  }
};

const outPath = process.argv[2] ?? "examples/dungeon-rasterize.authority.json";
writeFileSync(outPath, `${JSON.stringify(declaration, null, 2)}\n`);
process.stdout.write(`wrote ${outPath}: ${steps.length} advance steps, ${MAX_RECTS} rect slots, ${TOTAL_CELLS} cells\n`);
