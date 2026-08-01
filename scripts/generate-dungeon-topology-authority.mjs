// The BSP region-splitting decision (which axis to split, where, and how
// each terminal region's room and connecting corridor are placed) is
// generated here as declarative step programs for resolve-branching-worklist.v1
// -- a real queue-processing primitive, not authored recursion. Every branch
// point (terminal-vs-splittable, which axis is larger, seeded tie-breaks) is
// expressed as guarded data, evaluated by the shared runtime executor.
import { writeFileSync } from "node:fs";

const MIN_LEAF = 10;
const MAX_DEPTH = 4;
const MAX_ROOMS = 24; // generous ceiling above 2^MAX_DEPTH
const GENERATION_SEED = 482917; // matches docs/governed-html-page-projection-discussion.md section 10
const ROOT = { x: 10, y: 10, w: 58, h: 58 }; // padded 9 cells clear on every side of a 78x78 grid

function itemField(path) { return { kind: "item-field", path }; }
function fact(factId) { return { kind: "fact", factId }; }
function itemFieldIndexed(path, indexPath) { return { kind: "item-field-indexed", path, indexPath }; }
function itemFieldLength(path) { return { kind: "item-field-length", path }; }
function seededDraw(min, max) {
  return { kind: "seeded-draw", seedFactId: "generation-seed", callIndexPath: ["accumulator", "drawCounter"], min, max };
}
const gtEq = ["greater-than", "equal-to"];
const eq = ["equal-to"];
const bumpDrawCounter = (when) => ({
  targetPath: ["accumulator", "drawCounter"],
  operation: "add",
  operand: fact("one"),
  ...(when ? { when } : {})
});

const splitSteps = [
  { targetPath: ["canSplitWide"], operation: "set", operand: fact("zero") },
  { targetPath: ["canSplitWide"], operation: "set", operand: fact("one"), when: { operand: itemField(["parent", "w"]), compareTo: fact("two-min-leaf"), matchStates: gtEq } },
  { targetPath: ["canSplitTall"], operation: "set", operand: fact("zero") },
  { targetPath: ["canSplitTall"], operation: "set", operand: fact("one"), when: { operand: itemField(["parent", "h"]), compareTo: fact("two-min-leaf"), matchStates: gtEq } },

  { targetPath: ["splitVertical"], operation: "set", operand: fact("zero") },
  { targetPath: ["splitVertical"], operation: "set", operand: fact("one"), when: { operand: itemField(["parent", "w"]), compareTo: itemField(["parent", "h"]), matchStates: ["greater-than"] } },
  { targetPath: ["splitVertical"], operation: "set", operand: seededDraw(fact("zero"), fact("one")), when: { operand: itemField(["parent", "w"]), compareTo: itemField(["parent", "h"]), matchStates: eq } },
  bumpDrawCounter(),

  { targetPath: ["loBound"], operation: "set", operand: itemField(["parent", "x"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["loBound"], operation: "set", operand: itemField(["parent", "y"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["loBound"], operation: "add", operand: fact("min-leaf") },
  { targetPath: ["hiBound"], operation: "set", operand: itemField(["parent", "x"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["hiBound"], operation: "set", operand: itemField(["parent", "y"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["hiBound"], operation: "add", operand: itemField(["parent", "w"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["hiBound"], operation: "add", operand: itemField(["parent", "h"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["hiBound"], operation: "subtract", operand: fact("min-leaf") },
  { targetPath: ["splitCoord"], operation: "set", operand: seededDraw(itemField(["loBound"]), itemField(["hiBound"])) },
  bumpDrawCounter(),

  { targetPath: ["left", "x"], operation: "set", operand: itemField(["parent", "x"]) },
  { targetPath: ["left", "y"], operation: "set", operand: itemField(["parent", "y"]) },
  { targetPath: ["left", "w"], operation: "set", operand: itemField(["parent", "w"]) },
  { targetPath: ["left", "h"], operation: "set", operand: itemField(["parent", "h"]) },
  { targetPath: ["left", "w"], operation: "set", operand: itemField(["splitCoord"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["left", "w"], operation: "subtract", operand: itemField(["parent", "x"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["left", "h"], operation: "set", operand: itemField(["splitCoord"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["left", "h"], operation: "subtract", operand: itemField(["parent", "y"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["left", "depth"], operation: "set", operand: itemField(["parent", "depth"]) },
  { targetPath: ["left", "depth"], operation: "add", operand: fact("one") },

  { targetPath: ["right", "x"], operation: "set", operand: itemField(["parent", "x"]) },
  { targetPath: ["right", "y"], operation: "set", operand: itemField(["parent", "y"]) },
  { targetPath: ["right", "x"], operation: "set", operand: itemField(["splitCoord"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["right", "y"], operation: "set", operand: itemField(["splitCoord"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["right", "w"], operation: "set", operand: itemField(["parent", "w"]) },
  { targetPath: ["right", "h"], operation: "set", operand: itemField(["parent", "h"]) },
  { targetPath: ["right", "w"], operation: "set", operand: itemField(["parent", "x"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["right", "w"], operation: "add", operand: itemField(["parent", "w"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["right", "w"], operation: "subtract", operand: itemField(["splitCoord"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["right", "h"], operation: "set", operand: itemField(["parent", "y"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["right", "h"], operation: "add", operand: itemField(["parent", "h"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["right", "h"], operation: "subtract", operand: itemField(["splitCoord"]), when: { operand: itemField(["splitVertical"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["right", "depth"], operation: "set", operand: itemField(["parent", "depth"]) },
  { targetPath: ["right", "depth"], operation: "add", operand: fact("one") }
];

const gtZero = { compareTo: fact("zero"), matchStates: ["greater-than"] };
const terminalSteps = [
  { targetPath: ["roomWMax"], operation: "set", operand: itemField(["item", "w"]) },
  { targetPath: ["roomWMax"], operation: "subtract", operand: fact("four") },
  { targetPath: ["roomHMax"], operation: "set", operand: itemField(["item", "h"]) },
  { targetPath: ["roomHMax"], operation: "subtract", operand: fact("four") },
  { targetPath: ["roomW"], operation: "set", operand: seededDraw(fact("four"), itemField(["roomWMax"])) },
  bumpDrawCounter(),
  { targetPath: ["roomH"], operation: "set", operand: seededDraw(fact("four"), itemField(["roomHMax"])) },
  bumpDrawCounter(),

  { targetPath: ["roomXMax"], operation: "set", operand: itemField(["item", "w"]) },
  { targetPath: ["roomXMax"], operation: "subtract", operand: itemField(["roomW"]) },
  { targetPath: ["roomXMax"], operation: "subtract", operand: fact("one") },
  { targetPath: ["roomX"], operation: "set", operand: seededDraw(fact("one"), itemField(["roomXMax"])) },
  bumpDrawCounter(),
  { targetPath: ["roomX"], operation: "add", operand: itemField(["item", "x"]) },

  { targetPath: ["roomYMax"], operation: "set", operand: itemField(["item", "h"]) },
  { targetPath: ["roomYMax"], operation: "subtract", operand: itemField(["roomH"]) },
  { targetPath: ["roomYMax"], operation: "subtract", operand: fact("one") },
  { targetPath: ["roomY"], operation: "set", operand: seededDraw(fact("one"), itemField(["roomYMax"])) },
  bumpDrawCounter(),
  { targetPath: ["roomY"], operation: "add", operand: itemField(["item", "y"]) },

  { targetPath: ["priorCount"], operation: "set", operand: itemFieldLength(["accumulator", "roomX"]) },
  { targetPath: ["lastIndex"], operation: "set", operand: itemField(["priorCount"]) },
  { targetPath: ["lastIndex"], operation: "subtract", operand: fact("one") },

  { targetPath: ["prevConnX"], operation: "set", operand: itemFieldIndexed(["accumulator", "roomX"], ["lastIndex"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["prevConnX"], operation: "add", operand: fact("two"), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["prevConnY"], operation: "set", operand: itemFieldIndexed(["accumulator", "roomY"], ["lastIndex"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["prevConnY"], operation: "add", operand: fact("two"), when: { operand: itemField(["priorCount"]), ...gtZero } },

  { targetPath: ["connX"], operation: "set", operand: itemField(["roomX"]) },
  { targetPath: ["connX"], operation: "add", operand: fact("two") },
  { targetPath: ["connY"], operation: "set", operand: itemField(["roomY"]) },
  { targetPath: ["connY"], operation: "add", operand: fact("two") },

  { targetPath: ["horizontalFirst"], operation: "set", operand: seededDraw(fact("zero"), fact("one")), when: { operand: itemField(["priorCount"]), ...gtZero } },
  bumpDrawCounter({ operand: itemField(["priorCount"]), ...gtZero }),

  { targetPath: ["accumulator", "corridorFromX"], operation: "append", operand: itemField(["prevConnX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "corridorFromY"], operation: "append", operand: itemField(["prevConnY"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "corridorToX"], operation: "append", operand: itemField(["connX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "corridorToY"], operation: "append", operand: itemField(["connY"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "corridorHorizontalFirst"], operation: "append", operand: itemField(["horizontalFirst"]), when: { operand: itemField(["priorCount"]), ...gtZero } },

  { targetPath: ["accumulator", "roomX"], operation: "append", operand: itemField(["roomX"]) },
  { targetPath: ["accumulator", "roomY"], operation: "append", operand: itemField(["roomY"]) },
  { targetPath: ["accumulator", "roomW"], operation: "append", operand: itemField(["roomW"]) },
  { targetPath: ["accumulator", "roomH"], operation: "append", operand: itemField(["roomH"]) },

  // Unified paint-rectangle list consumed by rasterization: the room itself,
  // plus (once a previous room exists) the two axis-aligned corridor
  // segments, expressed as ordinary [loX,loY]-[hiX,hiY] rectangles so
  // rasterization needs exactly one containment-check shape, not two.
  { targetPath: ["accumulator", "rectLoX"], operation: "append", operand: itemField(["roomX"]) },
  { targetPath: ["accumulator", "rectLoY"], operation: "append", operand: itemField(["roomY"]) },
  { targetPath: ["roomHiX"], operation: "set", operand: itemField(["roomX"]) },
  { targetPath: ["roomHiX"], operation: "add", operand: itemField(["roomW"]) },
  { targetPath: ["roomHiX"], operation: "subtract", operand: fact("one") },
  { targetPath: ["roomHiY"], operation: "set", operand: itemField(["roomY"]) },
  { targetPath: ["roomHiY"], operation: "add", operand: itemField(["roomH"]) },
  { targetPath: ["roomHiY"], operation: "subtract", operand: fact("one") },
  { targetPath: ["accumulator", "rectHiX"], operation: "append", operand: itemField(["roomHiX"]) },
  { targetPath: ["accumulator", "rectHiY"], operation: "append", operand: itemField(["roomHiY"]) },

  // Shared min/max helpers for the two connection points, reused by both
  // corridor segments below regardless of which axis each segment spans.
  { targetPath: ["minCX"], operation: "set", operand: itemField(["prevConnX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["maxCX"], operation: "set", operand: itemField(["prevConnX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["minCX"], operation: "set", operand: itemField(["connX"]), when: { operand: itemField(["connX"]), compareTo: itemField(["prevConnX"]), matchStates: ["less-than"] } },
  { targetPath: ["maxCX"], operation: "set", operand: itemField(["connX"]), when: { operand: itemField(["connX"]), compareTo: itemField(["prevConnX"]), matchStates: ["greater-than"] } },
  { targetPath: ["minCY"], operation: "set", operand: itemField(["prevConnY"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["maxCY"], operation: "set", operand: itemField(["prevConnY"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["minCY"], operation: "set", operand: itemField(["connY"]), when: { operand: itemField(["connY"]), compareTo: itemField(["prevConnY"]), matchStates: ["less-than"] } },
  { targetPath: ["maxCY"], operation: "set", operand: itemField(["connY"]), when: { operand: itemField(["connY"]), compareTo: itemField(["prevConnY"]), matchStates: ["greater-than"] } },

  // segment A: horizontal at prevConnY if horizontalFirst, else vertical at prevConnX.
  { targetPath: ["segALoX"], operation: "set", operand: itemField(["minCX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segAHiX"], operation: "set", operand: itemField(["maxCX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segALoY"], operation: "set", operand: itemField(["prevConnY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segAHiY"], operation: "set", operand: itemField(["prevConnY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segALoX"], operation: "set", operand: itemField(["prevConnX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["segAHiX"], operation: "set", operand: itemField(["prevConnX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["segALoY"], operation: "set", operand: itemField(["minCY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["segAHiY"], operation: "set", operand: itemField(["maxCY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },

  { targetPath: ["accumulator", "rectLoX"], operation: "append", operand: itemField(["segALoX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "rectLoY"], operation: "append", operand: itemField(["segALoY"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "rectHiX"], operation: "append", operand: itemField(["segAHiX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "rectHiY"], operation: "append", operand: itemField(["segAHiY"]), when: { operand: itemField(["priorCount"]), ...gtZero } },

  // segment B: the complementary axis, always ending at the new room's conn point.
  { targetPath: ["segBLoX"], operation: "set", operand: itemField(["connX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segBHiX"], operation: "set", operand: itemField(["connX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segBLoY"], operation: "set", operand: itemField(["minCY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segBHiY"], operation: "set", operand: itemField(["maxCY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("one"), matchStates: eq } },
  { targetPath: ["segBLoX"], operation: "set", operand: itemField(["minCX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["segBHiX"], operation: "set", operand: itemField(["maxCX"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["segBLoY"], operation: "set", operand: itemField(["connY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },
  { targetPath: ["segBHiY"], operation: "set", operand: itemField(["connY"]), when: { operand: itemField(["horizontalFirst"]), compareTo: fact("zero"), matchStates: eq } },

  { targetPath: ["accumulator", "rectLoX"], operation: "append", operand: itemField(["segBLoX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "rectLoY"], operation: "append", operand: itemField(["segBLoY"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "rectHiX"], operation: "append", operand: itemField(["segBHiX"]), when: { operand: itemField(["priorCount"]), ...gtZero } },
  { targetPath: ["accumulator", "rectHiY"], operation: "append", operand: itemField(["segBHiY"]), when: { operand: itemField(["priorCount"]), ...gtZero } }
];

const regionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y", "w", "h", "depth"],
  properties: {
    x: { type: "integer", minimum: 0, maximum: 77 },
    y: { type: "integer", minimum: 0, maximum: 77 },
    w: { type: "integer", minimum: 1, maximum: 58 },
    h: { type: "integer", minimum: 1, maximum: 58 },
    depth: { type: "integer", minimum: 0, maximum: MAX_DEPTH }
  }
};

const topologySchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "roomX", "roomY", "roomW", "roomH",
    "corridorFromX", "corridorFromY", "corridorToX", "corridorToY", "corridorHorizontalFirst",
    "rectLoX", "rectLoY", "rectHiX", "rectHiY",
    "drawCounter"
  ],
  properties: {
    roomX: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    roomY: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    roomW: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    roomH: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    corridorFromX: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    corridorFromY: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    corridorToX: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    corridorToY: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer" } },
    corridorHorizontalFirst: { type: "array", maxItems: MAX_ROOMS, items: { type: "integer", minimum: 0, maximum: 1 } },
    rectLoX: { type: "array", maxItems: MAX_ROOMS * 3, items: { type: "integer" } },
    rectLoY: { type: "array", maxItems: MAX_ROOMS * 3, items: { type: "integer" } },
    rectHiX: { type: "array", maxItems: MAX_ROOMS * 3, items: { type: "integer" } },
    rectHiY: { type: "array", maxItems: MAX_ROOMS * 3, items: { type: "integer" } },
    drawCounter: { type: "integer", minimum: 0, maximum: 4096 }
  }
};

const declaration = {
  authorityType: "bound-semantic-execution-authority.v1",
  authorityId: "dungeon-topology.bundle.v1",
  ontologyId: "dungeon-topology",
  inputConceptId: "bsp-region",
  semanticLayer: {
    concepts: [
      { conceptId: "bsp-region", conceptType: "domain-entity", isA: [], abstract: false, schemaId: "bsp-region.schema.v1" },
      { conceptId: "bsp-region-variant-id", conceptType: "classification", isA: [], abstract: false, schemaId: "bsp-region-variant-id.schema.v1" },
      { conceptId: "bsp-topology-final", conceptType: "domain-value", isA: [], abstract: false, schemaId: "bsp-topology.schema.v1" },
      { conceptId: "int-value", conceptType: "domain-value", isA: [], abstract: false, schemaId: "int-value.schema.v1" },
      { conceptId: "presence-state", conceptType: "classification", isA: [], abstract: false, schemaId: "presence-state.schema.v1" },
      { conceptId: "obligation-status", conceptType: "signal", isA: [], abstract: false, schemaId: "obligation-status.schema.v1" },
      { conceptId: "result-type-concept", conceptType: "canonical-value", isA: [], abstract: false, schemaId: "result-type.schema.v1" },
      { conceptId: "bsp-topology-result", conceptType: "result-union", isA: [], abstract: false, schemaId: "bsp-topology-result.schema.v1" }
    ],
    relations: [
      { relationId: "partition-produces-topology", relationType: "computes", subjectConceptId: "bsp-topology-final", objectConceptId: "bsp-topology-final", cardinality: "exactly-one" }
    ],
    properties: [
      { propertyId: "region-x-field", propertyKind: "observed", subjectConceptId: "bsp-region", valueConceptId: "int-value", cardinality: "exactly-one", resolutions: [{ subjectVariantConceptId: "bsp-region", path: ["x"] }] },
      { propertyId: "result-type", propertyKind: "projected", subjectConceptId: "bsp-topology-result", valueConceptId: "result-type-concept", cardinality: "exactly-one", resolutions: [] },
      { propertyId: "result-topology", propertyKind: "projected", subjectConceptId: "bsp-topology-result", valueConceptId: "bsp-topology-final", cardinality: "exactly-one", resolutions: [] }
    ],
    facts: [
      { factId: "zero", conceptId: "int-value", value: { type: "number", value: 0 } },
      { factId: "one", conceptId: "int-value", value: { type: "number", value: 1 } },
      { factId: "two", conceptId: "int-value", value: { type: "number", value: 2 } },
      { factId: "four", conceptId: "int-value", value: { type: "number", value: 4 } },
      { factId: "min-leaf", conceptId: "int-value", value: { type: "number", value: MIN_LEAF } },
      { factId: "two-min-leaf", conceptId: "int-value", value: { type: "number", value: MIN_LEAF * 2 } },
      { factId: "max-depth", conceptId: "int-value", value: { type: "number", value: MAX_DEPTH } },
      { factId: "generation-seed", conceptId: "int-value", value: { type: "number", value: GENERATION_SEED } }
    ]
  },
  ontology: {
    classifications: [
      {
        classificationId: "bsp-region-variant",
        classificationType: "concept-variant",
        subjectConceptId: "bsp-region",
        resultConceptId: "bsp-region-variant-id",
        variants: ["bsp-region"],
        noMatchDisposition: "BSP_REGION_VARIANT_UNRESOLVED",
        multipleMatchDisposition: "BSP_REGION_VARIANT_AMBIGUOUS"
      },
      {
        classificationId: "presence-classification",
        classificationType: "property-state",
        propertyId: "region-x-field",
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
        subjectConceptId: "bsp-region",
        classificationId: "presence-classification",
        resultConceptId: "obligation-status",
        satisfiedStateIds: ["present"],
        failureDisposition: "BSP_REGION_MISSING"
      }
    ],
    transformations: [
      {
        transformationId: "emit-topology",
        relationId: "partition-produces-topology",
        sourceAuthorityId: "partition-dungeon",
        targetPropertyId: "result-topology",
        outputPath: ["topology"],
        valueConceptId: "bsp-topology-final",
        resultIds: ["topology-ok"],
        unavailableDisposition: "TOPOLOGY_UNAVAILABLE",
        invalidTypeDisposition: "TOPOLOGY_INVALID"
      }
    ],
    results: [
      {
        resultUnionId: "bsp-topology-result-union",
        resultTypeConceptId: "bsp-topology-result",
        members: [
          {
            resultId: "topology-ok",
            conceptId: "bsp-topology-result",
            discriminator: { propertyId: "result-type", outputPath: ["resultType"], value: { type: "string", value: "bsp-topology-result" } }
          }
        ],
        selectionRules: [
          { ruleId: "always-ok", when: [{ inputPort: "presenceObligation", obligationId: "always-present-obligation", status: "satisfied" }], resultId: "topology-ok" },
          { ruleId: "still-ok-when-violated", when: [{ inputPort: "presenceObligation", obligationId: "always-present-obligation", status: "violated" }], resultId: "topology-ok" }
        ],
        noMatchDisposition: "RESULT_SELECTION_NOT_TOTAL",
        multipleMatchDisposition: "RESULT_SELECTION_AMBIGUOUS",
        invalidResultDisposition: "TOPOLOGY_RESULT_INVALID",
        serializerId: "identity.v1"
      }
    ],
    arithmeticOperations: [],
    randomDraws: [],
    indexedReads: [],
    iterations: [
      {
        iterationKind: "branching",
        iterationId: "partition-dungeon",
        itemConceptId: "bsp-region",
        resultConceptId: "bsp-topology-final",
        maxItems: 64,
        unresolvedDisposition: "BSP_PARTITION_LIMIT_EXCEEDED",
        initialAccumulator: { drawCounter: 0 },
        terminalWhen: {
          anyOf: [
            [{ operand: itemField(["depth"]), compareTo: fact("max-depth"), matchStates: gtEq }],
            [
              { operand: itemField(["w"]), compareTo: fact("two-min-leaf"), matchStates: ["less-than"] },
              { operand: itemField(["h"]), compareTo: fact("two-min-leaf"), matchStates: ["less-than"] }
            ]
          ]
        },
        splitSteps,
        terminalSteps
      }
    ]
  },
  context: {
    schemas: [
      { schemaId: "bsp-region.schema.v1", value: regionSchema },
      { schemaId: "bsp-region-variant-id.schema.v1", value: { const: "bsp-region" } },
      { schemaId: "int-value.schema.v1", value: { type: "integer", minimum: -1000000, maximum: 1000000 } },
      { schemaId: "presence-state.schema.v1", value: { enum: ["missing", "null", "empty-string", "invalid-type", "present"] } },
      { schemaId: "obligation-status.schema.v1", value: { enum: ["satisfied", "violated"] } },
      { schemaId: "bsp-topology.schema.v1", value: topologySchema },
      { schemaId: "result-type.schema.v1", value: { const: "bsp-topology-result" } },
      {
        schemaId: "bsp-topology-result.schema.v1",
        value: {
          type: "object",
          additionalProperties: false,
          required: ["resultType", "topology"],
          properties: {
            resultType: { const: "bsp-topology-result" },
            topology: topologySchema
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

const outPath = process.argv[2] ?? "examples/dungeon-topology.authority.json";
writeFileSync(outPath, `${JSON.stringify(declaration, null, 2)}\n`);
process.stdout.write(
  `wrote ${outPath}: ${splitSteps.length} split steps, ${terminalSteps.length} terminal steps, root=${JSON.stringify(ROOT)}\n`
);
