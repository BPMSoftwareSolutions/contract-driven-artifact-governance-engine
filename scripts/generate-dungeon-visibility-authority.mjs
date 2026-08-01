// The 76-ray Bresenham sweep geometry for a fixed vision radius is entirely
// static: it depends only on VISION_RADIUS, never on player position or the
// generated map. This script computes that geometry once, offline, and bakes
// it into examples/dungeon-visibility.authority.json as declared facts (the
// per-step relative offset and originating ray id for the whole flattened
// sweep). The dynamic part -- which cells are walls, and therefore where each
// ray actually stops -- is decided at runtime by the ontology's own guarded
// iteration, not by this script.
import { writeFileSync } from "node:fs";

const VISION_RADIUS = 9;
const TOTAL_SIZE = 78; // GRID_SIZE(60) padded by VISION_RADIUS(9) on every side
const WALL = 1;

function bresenhamRel(dx1, dy1) {
  const points = [];
  const dx = Math.abs(dx1);
  const dy = -Math.abs(dy1);
  const sx = dx1 < 0 ? -1 : 1;
  const sy = dy1 < 0 ? -1 : 1;
  let err = dx + dy;
  let x = 0;
  let y = 0;
  while (true) {
    points.push({ x, y });
    if (x === dx1 && y === dy1) {
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

const targets = [];
for (let dx = -VISION_RADIUS; dx <= VISION_RADIUS; dx += 1) {
  targets.push([dx, -VISION_RADIUS]);
  targets.push([dx, VISION_RADIUS]);
}
for (let dy = -VISION_RADIUS; dy <= VISION_RADIUS; dy += 1) {
  targets.push([-VISION_RADIUS, dy]);
  targets.push([VISION_RADIUS, dy]);
}

const relX = [0];
const relY = [0];
const rayId = [-1];
targets.forEach(([tx, ty], ray) => {
  for (const point of bresenhamRel(tx, ty)) {
    const distance = Math.max(Math.abs(point.x), Math.abs(point.y));
    if (distance > VISION_RADIUS) {
      break;
    }
    relX.push(point.x);
    relY.push(point.y);
    rayId.push(ray);
  }
});
const totalSteps = relX.length;

const rowSchema = {
  type: "array",
  minItems: TOTAL_SIZE,
  maxItems: TOTAL_SIZE,
  items: { type: "integer", minimum: 0, maximum: 1 }
};

const visibilityItemSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "grid", "playerX", "playerY", "globalStep", "blockedRayId",
    "revealedX", "revealedY", "cellX", "cellY", "cellValue",
    "scratchRow", "rayId", "relX", "relY", "wallHitRayId"
  ],
  properties: {
    grid: { type: "array", minItems: TOTAL_SIZE, maxItems: TOTAL_SIZE, items: rowSchema },
    playerX: { type: "integer", minimum: 0, maximum: TOTAL_SIZE - 1 },
    playerY: { type: "integer", minimum: 0, maximum: TOTAL_SIZE - 1 },
    globalStep: { type: "integer", minimum: 0, maximum: 1024 },
    blockedRayId: { type: "integer", minimum: -999, maximum: 75 },
    revealedX: { type: "array", maxItems: totalSteps, items: { type: "integer", minimum: 0, maximum: TOTAL_SIZE - 1 } },
    revealedY: { type: "array", maxItems: totalSteps, items: { type: "integer", minimum: 0, maximum: TOTAL_SIZE - 1 } },
    cellX: { type: "integer", minimum: -100, maximum: 200 },
    cellY: { type: "integer", minimum: -100, maximum: 200 },
    cellValue: { type: "integer", minimum: 0, maximum: 1 },
    scratchRow: rowSchema,
    rayId: { type: "integer", minimum: -1, maximum: 75 },
    relX: { type: "integer", minimum: -9, maximum: 9 },
    relY: { type: "integer", minimum: -9, maximum: 9 },
    wallHitRayId: { type: "integer", minimum: -999, maximum: 75 }
  }
};

function itemField(path) {
  return { kind: "item-field", path: [path] };
}
function fact(factId) {
  return { kind: "fact", factId };
}
function factIndexed(factId, indexField) {
  return { kind: "fact-indexed", factId, indexPath: [indexField] };
}
function itemFieldIndexed(path, indexField) {
  return { kind: "item-field-indexed", path: [path], indexPath: [indexField] };
}

// Guards always read the iteration's evolving per-step state (not a frozen
// pre-step snapshot), so this program reads exactly like straight-line
// sequential code: compute this step's ray/cell, reveal it if its ray is not
// already blocked (using blockedRayId as carried over from prior steps),
// only afterward record whether this ray's block newly triggers.
const advanceSteps = [
  { targetPath: ["relX"], operation: "set", operand: factIndexed("sweep-rel-x", "globalStep") },
  { targetPath: ["relY"], operation: "set", operand: factIndexed("sweep-rel-y", "globalStep") },
  { targetPath: ["rayId"], operation: "set", operand: factIndexed("sweep-ray-id", "globalStep") },
  { targetPath: ["cellX"], operation: "set", operand: itemField("playerX") },
  { targetPath: ["cellX"], operation: "add", operand: itemField("relX") },
  { targetPath: ["cellY"], operation: "set", operand: itemField("playerY") },
  { targetPath: ["cellY"], operation: "add", operand: itemField("relY") },
  { targetPath: ["scratchRow"], operation: "set", operand: itemFieldIndexed("grid", "cellY") },
  { targetPath: ["cellValue"], operation: "set", operand: itemFieldIndexed("scratchRow", "cellX") },
  {
    targetPath: ["revealedX"],
    operation: "append",
    operand: itemField("cellX"),
    when: { operand: itemField("rayId"), compareTo: itemField("blockedRayId"), matchStates: ["less-than", "greater-than"] }
  },
  {
    targetPath: ["revealedY"],
    operation: "append",
    operand: itemField("cellY"),
    when: { operand: itemField("rayId"), compareTo: itemField("blockedRayId"), matchStates: ["less-than", "greater-than"] }
  },
  { targetPath: ["wallHitRayId"], operation: "set", operand: fact("sentinel-none") },
  {
    targetPath: ["wallHitRayId"],
    operation: "set",
    operand: itemField("rayId"),
    when: { operand: itemField("cellValue"), compareTo: fact("wall-value"), matchStates: ["equal-to"] }
  },
  {
    targetPath: ["blockedRayId"],
    operation: "set",
    operand: itemField("wallHitRayId"),
    when: { operand: itemField("wallHitRayId"), compareTo: fact("sentinel-none"), matchStates: ["less-than", "greater-than"] }
  },
  { targetPath: ["globalStep"], operation: "add", operand: fact("one") }
];

const declaration = {
  authorityType: "bound-semantic-execution-authority.v1",
  authorityId: "dungeon-visibility.bundle.v1",
  ontologyId: "dungeon-visibility",
  inputConceptId: "visibility-item",
  semanticLayer: {
    concepts: [
      { conceptId: "visibility-item", conceptType: "domain-entity", isA: [], abstract: false, schemaId: "visibility-item.schema.v1" },
      { conceptId: "visibility-item-final", conceptType: "domain-value", isA: [], abstract: false, schemaId: "visibility-item.schema.v1" },
      { conceptId: "visibility-item-variant-id", conceptType: "classification", isA: [], abstract: false, schemaId: "visibility-item-variant-id.schema.v1" },
      { conceptId: "int-value", conceptType: "domain-value", isA: [], abstract: false, schemaId: "int-value.schema.v1" },
      { conceptId: "int-array", conceptType: "domain-value", isA: [], abstract: false, schemaId: "int-array.schema.v1" },
      { conceptId: "presence-state", conceptType: "classification", isA: [], abstract: false, schemaId: "presence-state.schema.v1" },
      { conceptId: "obligation-status", conceptType: "signal", isA: [], abstract: false, schemaId: "obligation-status.schema.v1" },
      { conceptId: "result-type-concept", conceptType: "canonical-value", isA: [], abstract: false, schemaId: "result-type.schema.v1" },
      { conceptId: "visibility-result", conceptType: "result-union", isA: [], abstract: false, schemaId: "visibility-result.schema.v1" }
    ],
    relations: [
      { relationId: "sweep-produces-state", relationType: "computes", subjectConceptId: "visibility-item-final", objectConceptId: "visibility-item-final", cardinality: "exactly-one" }
    ],
    properties: [
      { propertyId: "player-x-field", propertyKind: "observed", subjectConceptId: "visibility-item", valueConceptId: "int-value", cardinality: "exactly-one", resolutions: [{ subjectVariantConceptId: "visibility-item", path: ["playerX"] }] },
      { propertyId: "result-type", propertyKind: "projected", subjectConceptId: "visibility-result", valueConceptId: "result-type-concept", cardinality: "exactly-one", resolutions: [] },
      { propertyId: "result-state", propertyKind: "projected", subjectConceptId: "visibility-result", valueConceptId: "visibility-item-final", cardinality: "exactly-one", resolutions: [] }
    ],
    facts: [
      { factId: "sentinel-none", conceptId: "int-value", value: { type: "number", value: -999 } },
      { factId: "wall-value", conceptId: "int-value", value: { type: "number", value: WALL } },
      { factId: "one", conceptId: "int-value", value: { type: "number", value: 1 } },
      { factId: "total-steps", conceptId: "int-value", value: { type: "number", value: totalSteps } },
      { factId: "sweep-rel-x", conceptId: "int-array", value: { type: "array", value: relX } },
      { factId: "sweep-rel-y", conceptId: "int-array", value: { type: "array", value: relY } },
      { factId: "sweep-ray-id", conceptId: "int-array", value: { type: "array", value: rayId } }
    ]
  },
  ontology: {
    classifications: [
      {
        classificationId: "visibility-item-variant",
        classificationType: "concept-variant",
        subjectConceptId: "visibility-item",
        resultConceptId: "visibility-item-variant-id",
        variants: ["visibility-item"],
        noMatchDisposition: "VISIBILITY_ITEM_VARIANT_UNRESOLVED",
        multipleMatchDisposition: "VISIBILITY_ITEM_VARIANT_AMBIGUOUS"
      },
      {
        classificationId: "presence-classification",
        classificationType: "property-state",
        propertyId: "player-x-field",
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
        subjectConceptId: "visibility-item",
        classificationId: "presence-classification",
        resultConceptId: "obligation-status",
        satisfiedStateIds: ["present"],
        failureDisposition: "VISIBILITY_ITEM_MISSING"
      }
    ],
    transformations: [
      {
        transformationId: "emit-visibility-state",
        relationId: "sweep-produces-state",
        sourceAuthorityId: "sweep-visibility",
        targetPropertyId: "result-state",
        outputPath: ["visibilityState"],
        valueConceptId: "visibility-item-final",
        resultIds: ["visibility-ok"],
        unavailableDisposition: "VISIBILITY_STATE_UNAVAILABLE",
        invalidTypeDisposition: "VISIBILITY_STATE_INVALID"
      }
    ],
    results: [
      {
        resultUnionId: "visibility-result-union",
        resultTypeConceptId: "visibility-result",
        members: [
          {
            resultId: "visibility-ok",
            conceptId: "visibility-result",
            discriminator: { propertyId: "result-type", outputPath: ["resultType"], value: { type: "string", value: "visibility-result" } }
          }
        ],
        selectionRules: [
          { ruleId: "always-ok", when: [{ inputPort: "presenceObligation", obligationId: "always-present-obligation", status: "satisfied" }], resultId: "visibility-ok" },
          { ruleId: "still-ok-when-violated", when: [{ inputPort: "presenceObligation", obligationId: "always-present-obligation", status: "violated" }], resultId: "visibility-ok" }
        ],
        noMatchDisposition: "RESULT_SELECTION_NOT_TOTAL",
        multipleMatchDisposition: "RESULT_SELECTION_AMBIGUOUS",
        invalidResultDisposition: "VISIBILITY_RESULT_INVALID",
        serializerId: "identity.v1"
      }
    ],
    arithmeticOperations: [],
    randomDraws: [],
    indexedReads: [],
    iterations: [
      {
        iterationKind: "linear",
        iterationId: "sweep-visibility",
        itemConceptId: "visibility-item",
        resultConceptId: "visibility-item-final",
        resultMode: "final-item",
        maxSteps: totalSteps + 4,
        unresolvedDisposition: "VISIBILITY_SWEEP_LIMIT_EXCEEDED",
        continueCondition: {
          operandPath: ["globalStep"],
          compareTo: fact("total-steps"),
          continueWhenStates: ["less-than"]
        },
        advance: { steps: advanceSteps }
      }
    ]
  },
  context: {
    schemas: [
      { schemaId: "visibility-item.schema.v1", value: visibilityItemSchema },
      { schemaId: "visibility-item-variant-id.schema.v1", value: { const: "visibility-item" } },
      { schemaId: "int-value.schema.v1", value: { type: "integer", minimum: -1000, maximum: 1000 } },
      { schemaId: "int-array.schema.v1", value: { type: "array", maxItems: totalSteps, items: { type: "integer", minimum: -10, maximum: 100 } } },
      { schemaId: "presence-state.schema.v1", value: { enum: ["missing", "null", "empty-string", "invalid-type", "present"] } },
      { schemaId: "obligation-status.schema.v1", value: { enum: ["satisfied", "violated"] } },
      { schemaId: "result-type.schema.v1", value: { const: "visibility-result" } },
      {
        schemaId: "visibility-result.schema.v1",
        value: {
          type: "object",
          additionalProperties: false,
          required: ["resultType", "visibilityState"],
          properties: {
            resultType: { const: "visibility-result" },
            visibilityState: visibilityItemSchema
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

const outPath = process.argv[2] ?? "examples/dungeon-visibility.authority.json";
writeFileSync(outPath, `${JSON.stringify(declaration, null, 2)}\n`);
process.stdout.write(
  `wrote ${outPath}: ${totalSteps} flattened sweep steps across ${targets.length} rays (radius ${VISION_RADIUS}, grid ${TOTAL_SIZE}x${TOTAL_SIZE})\n`
);
