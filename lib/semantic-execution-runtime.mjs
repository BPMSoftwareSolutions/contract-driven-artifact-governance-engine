import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const LIMITS = Object.freeze({
  maxGraphNodes: 64,
  maxGraphEdges: 128,
  maxVariants: 16,
  maxClassificationInputs: 16,
  maxClassificationCases: 128,
  maxTranslationCases: 128,
  maxPathDepth: 16,
  maxOutputDepth: 16,
  maxSchemas: 32,
  maxTerminalResults: 1,
  maxSerializedByteLength: 1048576,
  maxOperandDomainSize: 64,
  maxIterationSteps: 8192,
  maxWorklistItems: 256
});

const FORBIDDEN_CAPABILITIES = Object.freeze([
  "cycles",
  "recursion",
  "dynamic-invocation",
  "arbitrary-expressions",
  "user-code",
  "runtime-module-loading",
  "unbounded-array-traversal",
  "regex-authority",
  "implicit-coercion",
  "ambient-state",
  "clock-access",
  "ambient-randomness",
  "network-access"
]);

const ADMITTED_PRIMITIVES = Object.freeze([
  "input.v1",
  "validate-variant.v1",
  "read-path.v1",
  "constant.v1",
  "test-presence.v1",
  "classify-value.v1",
  "classify-observations.v1",
  "translate-value.v1",
  "evaluate-obligation.v1",
  "project-value.v1",
  "select-result.v1",
  "emit-result.v1",
  "add-bounded.v1",
  "subtract-bounded.v1",
  "compare-bounded.v1",
  "seeded-range-draw.v1",
  "read-indexed-path.v1",
  "iterate-bounded-worklist.v1",
  "resolve-branching-worklist.v1",
  "serialize-result.v1"
]);

const ARITHMETIC_OPERATION_PRIMITIVE = Object.freeze({
  add: "add-bounded.v1",
  subtract: "subtract-bounded.v1",
  compare: "compare-bounded.v1"
});

const COMPARE_OUTCOME_CONCEPT_STATES = Object.freeze([
  "less-than",
  "equal-to",
  "greater-than"
]);

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function canonicalBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`, "utf8");
}

function digest(value) {
  return `sha256:${createHash("sha256").update(canonicalBytes(value)).digest("hex")}`;
}

const RUNTIME_PROFILE_SUBJECT = Object.freeze({
  identity: "finite-semantic-runtime.v3",
  limits: LIMITS,
  forbiddenCapabilities: FORBIDDEN_CAPABILITIES,
  admittedPrimitives: ADMITTED_PRIMITIVES
});

export const SEMANTIC_RUNTIME_PROFILE = Object.freeze({
  ...RUNTIME_PROFILE_SUBJECT,
  digest: digest(RUNTIME_PROFILE_SUBJECT)
});

const bundleSchema = JSON.parse(
  readFileSync(
    new URL("../schemas/semantic-execution-bundle.schema.json", import.meta.url),
    "utf8"
  )
);
const boundAuthoritySchema = JSON.parse(
  readFileSync(
    new URL(
      "../schemas/bound-semantic-execution-authority.schema.json",
      import.meta.url
    ),
    "utf8"
  )
);
let validateBundleSchema;
let validateBoundAuthoritySchema;

function semanticBundleSchemaValidator() {
  if (!validateBundleSchema) {
    const bundleAjv = new Ajv2020({ allErrors: true, strict: true });
    validateBundleSchema = bundleAjv.compile(bundleSchema);
  }
  return validateBundleSchema;
}

function boundAuthoritySchemaValidator() {
  if (!validateBoundAuthoritySchema) {
    const authorityAjv = new Ajv2020({ allErrors: true, strict: true });
    authorityAjv.addSchema(bundleSchema);
    validateBoundAuthoritySchema = authorityAjv.compile(boundAuthoritySchema);
  }
  return validateBoundAuthoritySchema;
}

export class SemanticExecutionDispositionError extends Error {
  constructor(disposition, details = {}) {
    super(disposition);
    this.name = "SemanticExecutionDispositionError";
    this.disposition = disposition;
    this.details = structuredClone(details);
  }
}

function finding(findingId, detail, observed = undefined) {
  return {
    findingId,
    detail,
    ...(observed === undefined ? {} : { observed })
  };
}

function jsonType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function typedValueIsValid(typedValue) {
  return typedValue.type === jsonType(typedValue.value);
}

function xorshift32Step(state) {
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

function xorshift32Draw(seed, callIndex) {
  const mixed =
    ((seed >>> 0) ^ Math.imul((callIndex >>> 0) + 1, 0x9e3779b1)) >>> 0;
  return xorshift32Step(mixed);
}

function typedValueMatches(typedValue, value) {
  return (
    typedValue.type === jsonType(value) &&
    JSON.stringify(canonicalize(typedValue.value)) ===
      JSON.stringify(canonicalize(value))
  );
}

function sameSet(left, right) {
  return (
    left.size === right.size &&
    [...left].every((entry) => right.has(entry))
  );
}

function addUnique(index, identity, entry, kind, findings) {
  if (index.has(identity)) {
    findings.push(
      finding(
        "ONTOLOGY_AUTHORITY_ID_DUPLICATE",
        `Ontology authority identity is duplicated: ${identity}`
      )
    );
    return;
  }
  index.set(identity, { entry, kind });
}

function createOntologyIndexes(authority, findings) {
  const semantic = new Map();
  const byKind = {
    concept: new Map(),
    relation: new Map(),
    property: new Map(),
    fact: new Map(),
    classification: new Map(),
    constraint: new Map(),
    translation: new Map(),
    obligation: new Map(),
    transformation: new Map(),
    result: new Map(),
    arithmeticOperation: new Map(),
    randomDraw: new Map(),
    indexedRead: new Map(),
    iteration: new Map()
  };
  const declarations = [
    ["concepts", "concept", "conceptId"],
    ["relations", "relation", "relationId"],
    ["properties", "property", "propertyId"],
    ["facts", "fact", "factId"],
    ["classifications", "classification", "classificationId"],
    ["constraints", "constraint", "constraintId"],
    ["translations", "translation", "translationId"],
    ["obligations", "obligation", "obligationId"],
    ["transformations", "transformation", "transformationId"],
    ["results", "result", "resultUnionId"],
    ["arithmeticOperations", "arithmeticOperation", "operationId"],
    ["randomDraws", "randomDraw", "drawId"],
    ["indexedReads", "indexedRead", "readId"],
    ["iterations", "iteration", "iterationId"]
  ];
  for (const [collection, kind, identityField] of declarations) {
    for (const entry of authority[collection]) {
      const identity = entry[identityField];
      addUnique(semantic, identity, entry, kind, findings);
      byKind[kind].set(identity, entry);
    }
  }
  return { semantic, byKind };
}

function graphReachable(start, adjacency) {
  const reached = new Set();
  const pending = [start];
  while (pending.length > 0) {
    const identity = pending.pop();
    if (reached.has(identity)) {
      continue;
    }
    reached.add(identity);
    for (const next of adjacency.get(identity) ?? []) {
      pending.push(next);
    }
  }
  return reached;
}

function topologicalOrder(identities, edges) {
  const indegree = new Map(identities.map((identity) => [identity, 0]));
  const adjacency = new Map(identities.map((identity) => [identity, []]));
  for (const [from, to] of edges) {
    if (!indegree.has(from) || !indegree.has(to)) {
      continue;
    }
    adjacency.get(from).push(to);
    indegree.set(to, indegree.get(to) + 1);
  }
  const pending = [...indegree]
    .filter(([, degree]) => degree === 0)
    .map(([identity]) => identity)
    .sort();
  const order = [];
  while (pending.length > 0) {
    const identity = pending.shift();
    order.push(identity);
    for (const next of adjacency.get(identity)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        pending.push(next);
        pending.sort();
      }
    }
  }
  return { order, adjacency };
}

function conceptDescendsFrom(conceptId, ancestorId, concepts) {
  if (conceptId === ancestorId) {
    return true;
  }
  const visited = new Set();
  const pending = [conceptId];
  while (pending.length > 0) {
    const current = pending.pop();
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);
    for (const parent of concepts.get(current)?.isA ?? []) {
      if (parent === ancestorId) {
        return true;
      }
      pending.push(parent);
    }
  }
  return false;
}

function classificationStates(classification) {
  if (classification.classificationType === "concept-variant") {
    return new Set(classification.variants);
  }
  if (classification.classificationType === "property-state") {
    return new Set(classification.states);
  }
  if (classification.classificationType === "multi-observation") {
    return new Set(
      classification.cases
        .map((entry) => entry.emit.value)
        .filter((value) => typeof value === "string")
    );
  }
  return new Set(classification.cases.map((entry) => entry.stateId));
}

function semanticAuthorityOutputConceptId(semantic) {
  if (!semantic) {
    return undefined;
  }
  const entry = semantic.entry;
  if (semantic.kind === "concept") {
    return entry.conceptId;
  }
  if (semantic.kind === "property") {
    return entry.valueConceptId;
  }
  if (semantic.kind === "fact") {
    return entry.conceptId;
  }
  if (semantic.kind === "classification") {
    return entry.resultConceptId;
  }
  if (semantic.kind === "translation") {
    return entry.targetConceptId;
  }
  if (semantic.kind === "obligation") {
    return entry.resultConceptId;
  }
  if (semantic.kind === "transformation") {
    return entry.valueConceptId;
  }
  if (semantic.kind === "result") {
    return entry.resultTypeConceptId;
  }
  if (semantic.kind === "arithmeticOperation") {
    return entry.resultConceptId;
  }
  if (semantic.kind === "randomDraw") {
    return entry.resultConceptId;
  }
  if (semantic.kind === "indexedRead") {
    return entry.resultConceptId;
  }
  if (semantic.kind === "iteration") {
    return entry.resultConceptId;
  }
  return undefined;
}

function validateConceptClosure(bundle, indexes, schemaById, findings) {
  const concepts = indexes.byKind.concept;
  const referencedSchemas = new Set();
  const hierarchyEdges = [];
  for (const concept of concepts.values()) {
    for (const parentId of concept.isA) {
      if (!concepts.has(parentId)) {
        findings.push(
          finding(
            "ONTOLOGY_CONCEPT_UNRESOLVED",
            `Concept ${concept.conceptId} has an unresolved parent: ${parentId}`
          )
        );
      } else {
        hierarchyEdges.push([concept.conceptId, parentId]);
      }
    }
    if (!concept.abstract && !concept.schemaId) {
      findings.push(
        finding(
          "ONTOLOGY_CONCEPT_SCHEMA_UNRESOLVED",
          `Concrete concept has no bound schema: ${concept.conceptId}`
        )
      );
    }
    if (concept.schemaId) {
      referencedSchemas.add(concept.schemaId);
      if (!schemaById.has(concept.schemaId)) {
        findings.push(
          finding(
            "ONTOLOGY_CONCEPT_SCHEMA_UNRESOLVED",
            `Concept schema is not bound: ${concept.schemaId}`
          )
        );
      }
    }
  }
  const hierarchy = topologicalOrder([...concepts.keys()], hierarchyEdges);
  if (hierarchy.order.length !== concepts.size) {
    findings.push(
      finding(
        "ONTOLOGY_GRAPH_CYCLIC",
        "The declared concept inheritance graph contains a cycle."
      )
    );
  }
  for (const schemaId of schemaById.keys()) {
    if (!referencedSchemas.has(schemaId)) {
      findings.push(
        finding(
          "ONTOLOGY_SCHEMA_UNREFERENCED",
          `Bound schema is not referenced by a concept: ${schemaId}`
        )
      );
    }
  }
}

function validateOntologyReferences(bundle, indexes, validators, findings) {
  const { byKind, semantic } = indexes;
  const concepts = byKind.concept;

  const relationKeys = new Set();
  for (const relation of byKind.relation.values()) {
    if (
      !concepts.has(relation.subjectConceptId) ||
      !concepts.has(relation.objectConceptId)
    ) {
      findings.push(
        finding(
          "ONTOLOGY_CONCEPT_UNRESOLVED",
          `Relation ${relation.relationId} has an unresolved concept.`
        )
      );
    }
    const key = [
      relation.relationType,
      relation.subjectConceptId,
      relation.objectConceptId
    ].join("\u0000");
    if (relationKeys.has(key)) {
      findings.push(
        finding(
          "ONTOLOGY_RELATION_AMBIGUOUS",
          `Relation meaning is declared more than once: ${relation.relationId}`
        )
      );
    }
    relationKeys.add(key);
  }

  for (const property of byKind.property.values()) {
    if (
      !concepts.has(property.subjectConceptId) ||
      !concepts.has(property.valueConceptId)
    ) {
      findings.push(
        finding(
          "ONTOLOGY_CONCEPT_UNRESOLVED",
          `Property ${property.propertyId} has an unresolved concept.`
        )
      );
    }
    const variants = new Set();
    if (
      (property.propertyKind === "observed" &&
        property.resolutions.length === 0) ||
      (property.propertyKind === "projected" &&
        property.resolutions.length !== 0)
    ) {
      findings.push(
        finding(
          "ONTOLOGY_PROPERTY_RESOLUTION_INVALID",
          `Property kind and resolution cardinality disagree: ${property.propertyId}`
        )
      );
    }
    for (const resolution of property.resolutions) {
      if (
        variants.has(resolution.subjectVariantConceptId) ||
        !concepts.has(resolution.subjectVariantConceptId) ||
        !conceptDescendsFrom(
          resolution.subjectVariantConceptId,
          property.subjectConceptId,
          concepts
        )
      ) {
        findings.push(
          finding(
            "ONTOLOGY_PROPERTY_RESOLUTION_INVALID",
            `Property resolution is duplicate or outside its subject ontology: ${property.propertyId}`
          )
        );
      }
      variants.add(resolution.subjectVariantConceptId);
    }
  }

  for (const fact of byKind.fact.values()) {
    const concept = concepts.get(fact.conceptId);
    if (!concept || !typedValueIsValid(fact.value)) {
      findings.push(
        finding(
          "ONTOLOGY_FACT_TYPE_INVALID",
          `Fact ${fact.factId} does not resolve to a typed concept value.`
        )
      );
      continue;
    }
    const validate = validators.get(concept.schemaId);
    if (validate && !validate(fact.value.value)) {
      findings.push(
        finding(
          "ONTOLOGY_FACT_TYPE_INVALID",
          `Fact ${fact.factId} does not satisfy concept ${fact.conceptId}.`
        )
      );
    }
  }

  for (const classification of byKind.classification.values()) {
    const resultConcept = concepts.get(classification.resultConceptId);
    if (!resultConcept) {
      findings.push(
        finding(
          "ONTOLOGY_CONCEPT_UNRESOLVED",
          `Classification result concept is unresolved: ${classification.classificationId}`
        )
      );
    }
    if (classification.classificationType === "concept-variant") {
      if (!concepts.has(classification.subjectConceptId)) {
        findings.push(
          finding(
            "ONTOLOGY_CONCEPT_UNRESOLVED",
            `Classification subject is unresolved: ${classification.classificationId}`
          )
        );
      }
      const variants = new Set();
      for (const conceptId of classification.variants) {
        const concept = concepts.get(conceptId);
        if (
          variants.has(conceptId) ||
          !concept ||
          concept.abstract ||
          !conceptDescendsFrom(
            conceptId,
            classification.subjectConceptId,
            concepts
          )
        ) {
          findings.push(
            finding(
              "ONTOLOGY_CLASSIFICATION_INVALID",
              `Variant is duplicate, abstract, or outside its subject: ${conceptId}`
            )
          );
        }
        variants.add(conceptId);
        if (
          resultConcept?.schemaId &&
          !validators.get(resultConcept.schemaId)?.(conceptId)
        ) {
          findings.push(
            finding(
              "ONTOLOGY_CLASSIFICATION_INVALID",
              `Variant is outside the result concept: ${conceptId}`
            )
          );
        }
      }
    } else if (classification.classificationType === "property-state") {
      if (!byKind.property.has(classification.propertyId)) {
        findings.push(
          finding(
            "ONTOLOGY_PROPERTY_UNRESOLVED",
            `Property-state classification is unresolved: ${classification.classificationId}`
          )
        );
      }
      if (
        resultConcept?.schemaId &&
        classification.states.some(
          (state) => !validators.get(resultConcept.schemaId)?.(state)
        )
      ) {
        findings.push(
          finding(
            "ONTOLOGY_CLASSIFICATION_INVALID",
            `Property states are outside the result concept: ${classification.classificationId}`
          )
        );
      }
    } else if (classification.classificationType === "finite-value") {
      const concept = concepts.get(classification.subjectConceptId);
      const cases = new Set();
      for (const entry of classification.cases) {
        const key = JSON.stringify(canonicalize(entry.value));
        if (
          cases.has(key) ||
          !typedValueIsValid(entry.value) ||
          (concept?.schemaId &&
            !validators.get(concept.schemaId)?.(entry.value.value))
        ) {
          findings.push(
            finding(
              "ONTOLOGY_CLASSIFICATION_NOT_TOTAL",
              `Finite classification has a duplicate or invalid case: ${classification.classificationId}`
            )
          );
        }
        cases.add(key);
        if (
          resultConcept?.schemaId &&
          !validators.get(resultConcept.schemaId)?.(entry.stateId)
        ) {
          findings.push(
            finding(
              "ONTOLOGY_CLASSIFICATION_INVALID",
              `Classification state is outside the result concept: ${entry.stateId}`
            )
          );
        }
      }
    } else {
      const subjectConcept = concepts.get(classification.subjectConceptId);
      const resultValidator = validators.get(resultConcept?.schemaId);
      const observationByPort = new Map();
      const observedPropertyIds = new Set();
      for (const observation of classification.observations) {
        const property = byKind.property.get(observation.propertyId);
        if (
          observationByPort.has(observation.inputPort) ||
          observedPropertyIds.has(observation.propertyId) ||
          !subjectConcept ||
          !property ||
          property.propertyKind !== "observed" ||
          property.subjectConceptId !== classification.subjectConceptId
        ) {
          findings.push(
            finding(
              "ONTOLOGY_CLASSIFICATION_INPUT_INVALID",
              `Multi-observation classification input is duplicate or unresolved: ${classification.classificationId}`,
              observation
            )
          );
        }
        observationByPort.set(observation.inputPort, property);
        observedPropertyIds.add(observation.propertyId);
      }
      const caseIds = new Set();
      const casePredicates = new Set();
      for (const entry of classification.cases) {
        const conditionPorts = new Set();
        for (const condition of entry.when) {
          const property = observationByPort.get(condition.inputPort);
          const valueConcept = concepts.get(property?.valueConceptId);
          const valueValidator = validators.get(valueConcept?.schemaId);
          const valueMatchIsValid =
            condition.observation.state !== "value" ||
            (typedValueIsValid(condition.observation.value) &&
              valueValidator?.(condition.observation.value.value));
          if (
            conditionPorts.has(condition.inputPort) ||
            !property ||
            !valueMatchIsValid
          ) {
            findings.push(
              finding(
                "ONTOLOGY_CLASSIFICATION_CASE_INVALID",
                `Multi-observation classification case has an unresolved, duplicate, or type-invalid condition: ${entry.caseId}`
              )
            );
          }
          conditionPorts.add(condition.inputPort);
        }
        const predicateKey = JSON.stringify(
          canonicalize(
            [...entry.when].sort((left, right) =>
              left.inputPort.localeCompare(right.inputPort)
            )
          )
        );
        if (
          caseIds.has(entry.caseId) ||
          casePredicates.has(predicateKey) ||
          !typedValueIsValid(entry.emit) ||
          !resultValidator?.(entry.emit.value)
        ) {
          findings.push(
            finding(
              "ONTOLOGY_CLASSIFICATION_CASE_INVALID",
              `Multi-observation classification case is duplicate or emits outside its result concept: ${entry.caseId}`
            )
          );
        }
        caseIds.add(entry.caseId);
        casePredicates.add(predicateKey);
      }
      if (
        classification.noMatchDisposition ===
        classification.multipleMatchDisposition
      ) {
        findings.push(
          finding(
            "ONTOLOGY_CLASSIFICATION_DISPOSITIONS_NOT_DISTINCT",
            `Zero-match and multi-match classifications require distinct dispositions: ${classification.classificationId}`
          )
        );
      }
    }
  }

  for (const translation of byKind.translation.values()) {
    const sourceConcept = concepts.get(translation.sourceConceptId);
    const targetConcept = concepts.get(translation.targetConceptId);
    if (!sourceConcept || !targetConcept) {
      findings.push(
        finding(
          "ONTOLOGY_CONCEPT_UNRESOLVED",
          `Translation ${translation.translationId} has an unresolved concept.`
        )
      );
      continue;
    }
    const sourceCases = new Set();
    for (const entry of translation.cases) {
      const key = JSON.stringify(canonicalize(entry.source));
      const sourceValid =
        typedValueIsValid(entry.source) &&
        validators.get(sourceConcept.schemaId)?.(entry.source.value);
      const targetValid =
        typedValueIsValid(entry.target) &&
        validators.get(targetConcept.schemaId)?.(entry.target.value);
      if (sourceCases.has(key) || !sourceValid || !targetValid) {
        findings.push(
          finding(
            "ONTOLOGY_TRANSLATION_TYPE_INVALID",
            `Translation has a duplicate source or a type-invalid case: ${translation.translationId}`
          )
        );
      }
      sourceCases.add(key);
    }
  }

  for (const obligation of byKind.obligation.values()) {
    const classification = byKind.classification.get(
      obligation.classificationId
    );
    if (
      !concepts.has(obligation.subjectConceptId) ||
      !concepts.has(obligation.resultConceptId) ||
      !classification ||
      obligation.satisfiedStateIds.some(
        (stateId) => !classificationStates(classification).has(stateId)
      )
    ) {
      findings.push(
        finding(
          "ONTOLOGY_OBLIGATION_UNRESOLVED",
          `Obligation is not closed over its subject, classification, and states: ${obligation.obligationId}`
        )
      );
    } else if (
      !["satisfied", "violated"].every((status) =>
        validators.get(
          concepts.get(obligation.resultConceptId).schemaId
        )?.(status)
      )
    ) {
      findings.push(
        finding(
          "ONTOLOGY_OBLIGATION_UNRESOLVED",
          `Obligation result concept is not the closed status domain: ${obligation.obligationId}`
        )
      );
    }
  }

  for (const constraint of byKind.constraint.values()) {
    const expectedKind = {
      "exactly-one-variant": "classification",
      "classification-total": "classification",
      "required-property": "property",
      "translation-total": "translation",
      "obligation-total": "obligation",
      "result-discrimination": "result"
    }[constraint.constraintType];
    for (const authorityId of constraint.subjectAuthorityIds) {
      const subject = semantic.get(authorityId);
      const graphSubjectIsValid =
        constraint.constraintType === "graph-closure" &&
        authorityId === bundle.authority.ontologyId;
      const kindIsValid =
        subject?.kind === expectedKind &&
        (constraint.constraintType !== "exactly-one-variant" ||
          subject.entry.classificationType === "concept-variant") &&
        (constraint.constraintType !== "required-property" ||
          subject.entry.cardinality === "exactly-one");
      if (!graphSubjectIsValid && !kindIsValid) {
        findings.push(
          finding(
            "ONTOLOGY_CONSTRAINT_UNRESOLVED",
            `Constraint ${constraint.constraintId} has an unresolved or type-incompatible subject: ${authorityId}`
          )
        );
      }
    }
    if (
      constraint.requiredDisposition !== "ONTOLOGY_AUTHORITY_CLOSED"
    ) {
      findings.push(
        finding(
          "ONTOLOGY_CONSTRAINT_DISPOSITION_INVALID",
          `Constraint does not demand ontology closure: ${constraint.constraintId}`
        )
      );
    }
  }
}

function boundedIntegerConceptRange(conceptId, indexes, schemaById, maxDomainSize) {
  const concept = indexes.byKind.concept.get(conceptId);
  const schemaEntry = schemaById.get(concept?.schemaId);
  const schema = schemaEntry?.value;
  if (
    !schema ||
    schema.type !== "integer" ||
    typeof schema.minimum !== "number" ||
    typeof schema.maximum !== "number" ||
    schema.maximum < schema.minimum ||
    (maxDomainSize !== undefined &&
      schema.maximum - schema.minimum + 1 > maxDomainSize)
  ) {
    return undefined;
  }
  return { minimum: schema.minimum, maximum: schema.maximum };
}

function validateArithmeticClosure(bundle, indexes, schemaById, validators, findings) {
  const { byKind } = indexes;
  const maxOperandDomainSize = SEMANTIC_RUNTIME_PROFILE.limits.maxOperandDomainSize;

  for (const operation of byKind.arithmeticOperation.values()) {
    // Comparison closure is proven from two bounded integer schemas and the
    // closed three-state order result. Unlike addition/subtraction, proving a
    // comparison does not require enumerating the Cartesian product of both
    // domains, so realistic operational quantities (bytes, megabytes, etc.)
    // must not be rejected by the small exhaustive-arithmetic limit.
    const operandDomainLimit =
      operation.operation === "compare" ? undefined : maxOperandDomainSize;
    const operandA = boundedIntegerConceptRange(
      operation.operandAConceptId,
      indexes,
      schemaById,
      operandDomainLimit
    );
    const operandB = boundedIntegerConceptRange(
      operation.operandBConceptId,
      indexes,
      schemaById,
      operandDomainLimit
    );
    if (!operandA || !operandB) {
      findings.push(
        finding(
          "ONTOLOGY_ARITHMETIC_OPERAND_UNBOUNDED",
          `Arithmetic operation operands are not declared as small bounded-integer concepts: ${operation.operationId}`
        )
      );
      continue;
    }
    if (operation.operation === "compare") {
      const resultConcept = byKind.concept.get(operation.resultConceptId);
      const validate = validators.get(resultConcept?.schemaId);
      const provesTotalOrder =
        Boolean(resultConcept) &&
        Boolean(validate) &&
        COMPARE_OUTCOME_CONCEPT_STATES.every((state) => validate(state));
      if (!provesTotalOrder) {
        findings.push(
          finding(
            "ONTOLOGY_ARITHMETIC_RESULT_UNRESOLVED",
            `Compare result concept does not admit the closed three-state order domain: ${operation.operationId}`
          )
        );
      }
      continue;
    }
    const resultRange = boundedIntegerConceptRange(
      operation.resultConceptId,
      indexes,
      schemaById,
      undefined
    );
    if (!resultRange) {
      findings.push(
        finding(
          "ONTOLOGY_ARITHMETIC_RESULT_UNRESOLVED",
          `Arithmetic operation result is not declared as a bounded-integer concept: ${operation.operationId}`
        )
      );
      continue;
    }
    let everyOutcomeInRange = true;
    for (let a = operandA.minimum; a <= operandA.maximum; a += 1) {
      for (let b = operandB.minimum; b <= operandB.maximum; b += 1) {
        const value = operation.operation === "add" ? a + b : a - b;
        if (value < resultRange.minimum || value > resultRange.maximum) {
          everyOutcomeInRange = false;
          break;
        }
      }
      if (!everyOutcomeInRange) {
        break;
      }
    }
    if (!everyOutcomeInRange) {
      findings.push(
        finding(
          "ONTOLOGY_ARITHMETIC_RANGE_UNPROVEN",
          `Arithmetic operation result range does not exhaustively contain every possible output: ${operation.operationId}`
        )
      );
    }
  }

  for (const draw of byKind.randomDraw.values()) {
    const seedConcept = boundedIntegerConceptRange(
      draw.seedConceptId,
      indexes,
      schemaById,
      undefined
    );
    const callIndexConcept = boundedIntegerConceptRange(
      draw.callIndexConceptId,
      indexes,
      schemaById,
      undefined
    );
    const minConcept = indexes.byKind.concept.get(draw.minConceptId);
    const maxConcept = indexes.byKind.concept.get(draw.maxConceptId);
    const resultConcept = indexes.byKind.concept.get(draw.resultConceptId);
    if (
      !seedConcept ||
      !callIndexConcept ||
      !minConcept ||
      !maxConcept ||
      !resultConcept
    ) {
      findings.push(
        finding(
          "ONTOLOGY_RANDOM_DRAW_UNRESOLVED",
          `Seeded range draw does not resolve every declared concept: ${draw.drawId}`
        )
      );
      continue;
    }
    if (
      minConcept.schemaId !== resultConcept.schemaId ||
      maxConcept.schemaId !== resultConcept.schemaId
    ) {
      findings.push(
        finding(
          "ONTOLOGY_RANDOM_DRAW_UNRESOLVED",
          `Seeded range draw bounds must share the result concept's declared domain: ${draw.drawId}`
        )
      );
    }
  }
}

function operandReferencesResolve(operand, byKind) {
  if (operand.kind === "fact" || operand.kind === "fact-indexed") {
    return byKind.fact.has(operand.factId);
  }
  if (operand.kind === "seeded-draw") {
    return (
      byKind.fact.has(operand.seedFactId) &&
      operandReferencesResolve(operand.min, byKind) &&
      operandReferencesResolve(operand.max, byKind)
    );
  }
  return true;
}

// Fact-referencing ports are keyed by the fact's own identity, not by the
// position of the step that references it: many steps across a long guarded
// program routinely reference the same handful of facts (zero, one, ...),
// and wiring one graph edge per occurrence would make the outer execution
// graph's edge count scale with step count instead of with declared facts.
function factPort(factId) {
  return `fact.${factId}`;
}

function collectOperandFactRefs(operand) {
  if (operand.kind === "fact" || operand.kind === "fact-indexed") {
    return [{ port: factPort(operand.factId), factId: operand.factId }];
  }
  if (operand.kind === "seeded-draw") {
    return [
      { port: factPort(operand.seedFactId), factId: operand.seedFactId },
      ...collectOperandFactRefs(operand.min),
      ...collectOperandFactRefs(operand.max)
    ];
  }
  return [];
}

function collectGuardFactRefs(guard) {
  if (!guard) {
    return [];
  }
  return [
    ...collectOperandFactRefs(guard.operand),
    ...collectOperandFactRefs(guard.compareTo)
  ];
}

function dedupeFactRefs(refs) {
  const byPort = new Map();
  for (const ref of refs) {
    byPort.set(ref.port, ref);
  }
  return [...byPort.values()];
}

function collectFactRefs(iteration) {
  if (iteration.iterationKind === "branching") {
    const refs = [];
    iteration.terminalWhen.anyOf.forEach((group) => {
      group.forEach((condition) => {
        refs.push(...collectGuardFactRefs(condition));
      });
    });
    iteration.splitSteps.forEach((step) => {
      refs.push(...collectOperandFactRefs(step.operand));
      refs.push(...collectGuardFactRefs(step.when));
    });
    iteration.terminalSteps.forEach((step) => {
      refs.push(...collectOperandFactRefs(step.operand));
      refs.push(...collectGuardFactRefs(step.when));
    });
    return dedupeFactRefs(refs);
  }
  const refs = [...collectOperandFactRefs(iteration.continueCondition.compareTo)];
  iteration.advance.steps.forEach((step) => {
    refs.push(...collectOperandFactRefs(step.operand));
    refs.push(...collectGuardFactRefs(step.when));
  });
  return dedupeFactRefs(refs);
}

function validateIndexedReadAndIterationClosure(
  bundle,
  indexes,
  schemaById,
  findings
) {
  const { byKind } = indexes;
  const maxIterationSteps = SEMANTIC_RUNTIME_PROFILE.limits.maxIterationSteps;
  const maxWorklistItems = SEMANTIC_RUNTIME_PROFILE.limits.maxWorklistItems;

  for (const read of byKind.indexedRead.values()) {
    const sourceConcept = byKind.concept.get(read.sourceConceptId);
    const indexConcept = boundedIntegerConceptRange(
      read.indexConceptId,
      indexes,
      schemaById,
      undefined
    );
    const resultConcept = byKind.concept.get(read.resultConceptId);
    if (!sourceConcept || !indexConcept || !resultConcept) {
      findings.push(
        finding(
          "ONTOLOGY_INDEXED_READ_UNRESOLVED",
          `Indexed read does not resolve its source, index, or result concept: ${read.readId}`
        )
      );
    }
  }

  for (const iteration of byKind.iteration.values()) {
    const itemConcept = byKind.concept.get(iteration.itemConceptId);
    const resultConcept = byKind.concept.get(iteration.resultConceptId);
    const factRefsResolved = collectFactRefs(iteration).every((ref) =>
      byKind.fact.has(ref.factId)
    );
    if (!itemConcept || !resultConcept || !factRefsResolved) {
      findings.push(
        finding(
          "ONTOLOGY_ITERATION_UNRESOLVED",
          `Iteration does not resolve its item, result, or fact references: ${iteration.iterationId}`
        )
      );
      continue;
    }
    if (iteration.iterationKind === "branching") {
      const stepsResolved = [...iteration.splitSteps, ...iteration.terminalSteps].every(
        (step) => operandReferencesResolve(step.operand, byKind)
      );
      const conditionsResolved = iteration.terminalWhen.anyOf.every((group) =>
        group.every(
          (condition) =>
            operandReferencesResolve(condition.operand, byKind) &&
            operandReferencesResolve(condition.compareTo, byKind)
        )
      );
      if (!stepsResolved || !conditionsResolved) {
        findings.push(
          finding(
            "ONTOLOGY_ITERATION_UNRESOLVED",
            `Branching worklist does not resolve every declared step or condition reference: ${iteration.iterationId}`
          )
        );
      }
      if (iteration.maxItems > maxWorklistItems) {
        findings.push(
          finding(
            "ONTOLOGY_ITERATION_UNBOUNDED",
            `Branching worklist maxItems exceeds the admitted runtime ceiling: ${iteration.iterationId}`,
            { maxItems: iteration.maxItems, ceiling: maxWorklistItems }
          )
        );
      }
      continue;
    }
    if (
      iteration.continueCondition.operandPath.length === 0 &&
      !boundedIntegerConceptRange(
        iteration.itemConceptId,
        indexes,
        schemaById,
        undefined
      )
    ) {
      findings.push(
        finding(
          "ONTOLOGY_ITERATION_ITEM_UNBOUNDED",
          `Iteration item concept is not a declared bounded integer for its scalar operand path: ${iteration.iterationId}`
        )
      );
    }
    if (iteration.maxSteps > maxIterationSteps) {
      findings.push(
        finding(
          "ONTOLOGY_ITERATION_UNBOUNDED",
          `Iteration maxSteps exceeds the admitted runtime ceiling: ${iteration.iterationId}`,
          { maxSteps: iteration.maxSteps, ceiling: maxIterationSteps }
        )
      );
    }
  }
}

function validateResultClosure(indexes, validators, findings) {
  const { byKind, semantic } = indexes;
  const resultIds = new Map();
  const discriminatorValues = new Map();
  const outputPaths = new Map();
  for (const resultUnion of byKind.result.values()) {
    const resultTypeConcept = byKind.concept.get(
      resultUnion.resultTypeConceptId
    );
    if (!resultTypeConcept) {
      findings.push(
        finding(
          "ONTOLOGY_CONCEPT_UNRESOLVED",
          `Result union type is unresolved: ${resultUnion.resultUnionId}`
        )
      );
    }
    const memberIds = new Set();
    for (const member of resultUnion.members) {
      const concept = byKind.concept.get(member.conceptId);
      const property = byKind.property.get(member.discriminator.propertyId);
      const propertyValueConcept = byKind.concept.get(
        property?.valueConceptId
      );
      const validateDiscriminator = validators.get(
        propertyValueConcept?.schemaId
      );
      const discriminatorKey = JSON.stringify(
        canonicalize(member.discriminator.value)
      );
      if (
        memberIds.has(member.resultId) ||
        resultIds.has(member.resultId) ||
        !concept ||
        concept.abstract ||
        !conceptDescendsFrom(
          member.conceptId,
          resultUnion.resultTypeConceptId,
          byKind.concept
        ) ||
        !property ||
        property.propertyKind !== "projected" ||
        !conceptDescendsFrom(
          member.conceptId,
          property.subjectConceptId,
          byKind.concept
        ) ||
        !propertyValueConcept ||
        !typedValueIsValid(member.discriminator.value) ||
        !validateDiscriminator?.(member.discriminator.value.value) ||
        discriminatorValues.has(
          `${resultUnion.resultUnionId}\u0000${discriminatorKey}`
        )
      ) {
        findings.push(
          finding(
            "ONTOLOGY_RESULT_CONTRACT_INVALID",
            `Result member is duplicate or unresolved: ${member.resultId}`
          )
        );
      }
      memberIds.add(member.resultId);
      resultIds.set(member.resultId, resultUnion.resultUnionId);
      discriminatorValues.set(
        `${resultUnion.resultUnionId}\u0000${discriminatorKey}`,
        member.resultId
      );
      outputPaths.set(
        `${member.resultId}\u0000${JSON.stringify(
          member.discriminator.outputPath
        )}`,
        `discriminator:${member.resultId}`
      );
    }
    const obligationIds = [
      ...new Set(
        resultUnion.selectionRules.flatMap((rule) =>
          rule.when.map((condition) => condition.obligationId)
        )
      )
    ].sort();
    if (obligationIds.length > 10) {
      findings.push(
        finding(
          "ONTOLOGY_CLASSIFICATION_NOT_TOTAL",
          `Result selection exceeds the bounded obligation domain: ${resultUnion.resultUnionId}`
        )
      );
      continue;
    }
    const portByObligation = new Map();
    for (const rule of resultUnion.selectionRules) {
      const conditionObligations = new Set();
      for (const condition of rule.when) {
        if (
          !byKind.obligation.has(condition.obligationId) ||
          conditionObligations.has(condition.obligationId) ||
          (portByObligation.has(condition.obligationId) &&
            portByObligation.get(condition.obligationId) !== condition.inputPort)
        ) {
          findings.push(
            finding(
              "ONTOLOGY_RESULT_RULE_INVALID",
              `Result rule contains an unresolved or ambiguous obligation: ${rule.ruleId}`
            )
          );
        }
        conditionObligations.add(condition.obligationId);
        portByObligation.set(condition.obligationId, condition.inputPort);
      }
      if (
        !sameSet(conditionObligations, new Set(obligationIds)) ||
        !memberIds.has(rule.resultId)
      ) {
        findings.push(
          finding(
            "ONTOLOGY_RESULT_RULE_INVALID",
            `Result rule is partial or has an unresolved result: ${rule.ruleId}`
          )
        );
      }
    }
    const combinations = 2 ** obligationIds.length;
    for (let mask = 0; mask < combinations; mask += 1) {
      const state = new Map(
        obligationIds.map((obligationId, index) => [
          obligationId,
          mask & (1 << index) ? "satisfied" : "violated"
        ])
      );
      const matches = resultUnion.selectionRules.filter((rule) =>
        rule.when.every(
          (condition) => state.get(condition.obligationId) === condition.status
        )
      );
      if (matches.length !== 1) {
        findings.push(
          finding(
            "ONTOLOGY_RESULT_DISCRIMINATION_NOT_TOTAL",
            `Result selection is not total and mutually exclusive: ${resultUnion.resultUnionId}`,
            { state: Object.fromEntries(state), matchCount: matches.length }
          )
        );
        break;
      }
    }
  }

  for (const transformation of byKind.transformation.values()) {
    const source = semantic.get(transformation.sourceAuthorityId);
    const relation = byKind.relation.get(transformation.relationId);
    const targetProperty = byKind.property.get(transformation.targetPropertyId);
    const valueConcept = byKind.concept.get(transformation.valueConceptId);
    const sourceConceptId = semanticAuthorityOutputConceptId(source);
    if (
      !source ||
      !relation ||
      !targetProperty ||
      targetProperty.propertyKind !== "projected" ||
      !valueConcept ||
      sourceConceptId !== transformation.valueConceptId ||
      targetProperty.valueConceptId !== transformation.valueConceptId ||
      relation.subjectConceptId !== sourceConceptId ||
      relation.objectConceptId !== transformation.valueConceptId
    ) {
      findings.push(
        finding(
          "ONTOLOGY_TRANSFORMATION_UNRESOLVED",
          `Transformation is not closed: ${transformation.transformationId}`
        )
      );
    }
    for (const resultId of transformation.resultIds) {
      if (!resultIds.has(resultId)) {
        findings.push(
          finding(
            "ONTOLOGY_RESULT_CONTRACT_INVALID",
            `Transformation result is unresolved: ${resultId}`
          )
        );
      }
      const key = `${resultId}\u0000${JSON.stringify(transformation.outputPath)}`;
      if (outputPaths.has(key)) {
        findings.push(
          finding(
            "ONTOLOGY_TRANSFORMATION_AMBIGUOUS",
            `Result output path has more than one semantic source: ${resultId}`
          )
        );
      }
      outputPaths.set(key, transformation.transformationId);
    }
  }
  return resultIds;
}

function expectedPrimitive(kind, entry) {
  if (kind === "concept") {
    return ["input.v1"];
  }
  if (kind === "property") {
    return entry.propertyKind === "observed" ? ["read-path.v1"] : [];
  }
  if (kind === "fact") {
    return ["constant.v1"];
  }
  if (kind === "classification") {
    if (entry.classificationType === "concept-variant") {
      return ["validate-variant.v1"];
    }
    if (entry.classificationType === "property-state") {
      return ["test-presence.v1"];
    }
    if (entry.classificationType === "multi-observation") {
      return ["classify-observations.v1"];
    }
    return ["classify-value.v1"];
  }
  if (kind === "translation") {
    return ["translate-value.v1"];
  }
  if (kind === "obligation") {
    return ["evaluate-obligation.v1"];
  }
  if (kind === "transformation") {
    return ["project-value.v1"];
  }
  if (kind === "result") {
    return [
      "select-result.v1",
      "emit-result.v1",
      "serialize-result.v1"
    ];
  }
  if (kind === "arithmeticOperation") {
    return [ARITHMETIC_OPERATION_PRIMITIVE[entry.operation]].filter(Boolean);
  }
  if (kind === "randomDraw") {
    return ["seeded-range-draw.v1"];
  }
  if (kind === "indexedRead") {
    return ["read-indexed-path.v1"];
  }
  if (kind === "iteration") {
    return [
      entry.iterationKind === "branching"
        ? "resolve-branching-worklist.v1"
        : "iterate-bounded-worklist.v1"
    ];
  }
  return [];
}

function primitiveOutputPorts(primitive) {
  return new Set(
    {
      "input.v1": ["value"],
      "validate-variant.v1": ["conceptId"],
      "read-path.v1": ["observation"],
      "constant.v1": ["value"],
      "test-presence.v1": ["state"],
      "classify-value.v1": ["state"],
      "classify-observations.v1": ["state"],
      "translate-value.v1": ["value"],
      "evaluate-obligation.v1": ["status", "disposition"],
      "project-value.v1": ["fragment"],
      "select-result.v1": ["resultId"],
      "emit-result.v1": ["result"],
      "add-bounded.v1": ["value"],
      "subtract-bounded.v1": ["value"],
      "compare-bounded.v1": ["state"],
      "seeded-range-draw.v1": ["value"],
      "read-indexed-path.v1": ["value"],
      "iterate-bounded-worklist.v1": ["value"],
      "resolve-branching-worklist.v1": ["value"],
      "serialize-result.v1": ["result"]
    }[primitive] ?? []
  );
}

function primitiveInputPorts(binding, indexes) {
  const primitive = binding.executorPrimitive;
  if (primitive === "input.v1") {
    return new Set();
  }
  if (primitive === "validate-variant.v1") {
    return new Set(["source"]);
  }
  if (primitive === "read-path.v1") {
    return new Set(["source", "conceptId"]);
  }
  if (primitive === "constant.v1") {
    return new Set(["activation"]);
  }
  if (
    primitive === "test-presence.v1" ||
    primitive === "classify-value.v1" ||
    primitive === "translate-value.v1"
  ) {
    return new Set(["observation"]);
  }
  if (primitive === "classify-observations.v1") {
    const classification = indexes.byKind.classification.get(
      binding.semanticAuthorityId
    );
    return new Set(
      classification.observations.map(
        (observation) => observation.inputPort
      )
    );
  }
  if (primitive === "evaluate-obligation.v1") {
    return new Set(["state"]);
  }
  if (primitive === "project-value.v1") {
    return new Set(["value"]);
  }
  if (
    primitive === "add-bounded.v1" ||
    primitive === "subtract-bounded.v1" ||
    primitive === "compare-bounded.v1"
  ) {
    return new Set(["operandA", "operandB"]);
  }
  if (primitive === "seeded-range-draw.v1") {
    return new Set(["seed", "callIndex", "min", "max"]);
  }
  if (primitive === "read-indexed-path.v1") {
    return new Set(["source", "index"]);
  }
  if (
    primitive === "iterate-bounded-worklist.v1" ||
    primitive === "resolve-branching-worklist.v1"
  ) {
    const iteration = indexes.byKind.iteration.get(binding.semanticAuthorityId);
    return new Set([
      "seedItem",
      ...collectFactRefs(iteration).map((ref) => ref.port)
    ]);
  }
  const resultUnion = indexes.byKind.result.get(binding.semanticAuthorityId);
  if (primitive === "select-result.v1") {
    return new Set(
      resultUnion.selectionRules.flatMap((rule) =>
        rule.when.map((condition) => condition.inputPort)
      )
    );
  }
  if (primitive === "emit-result.v1") {
    const memberIds = new Set(resultUnion.members.map((member) => member.resultId));
    return new Set([
      "selection",
      ...[...indexes.byKind.transformation.values()]
        .filter((transformation) =>
          transformation.resultIds.some((resultId) => memberIds.has(resultId))
        )
        .map((transformation) => `fragment-${transformation.transformationId}`)
    ]);
  }
  if (primitive === "serialize-result.v1") {
    return new Set(["result"]);
  }
  return new Set();
}

function bindingOutputConceptId(binding, indexes) {
  return semanticAuthorityOutputConceptId(
    indexes.semantic.get(binding.semanticAuthorityId)
  );
}

function semanticEdgeIsValid(
  sourceBinding,
  targetBinding,
  targetPort,
  indexes
) {
  const sourceAuthorityId = sourceBinding.semanticAuthorityId;
  const targetAuthorityId = targetBinding.semanticAuthorityId;
  const targetSemantic = indexes.semantic.get(targetAuthorityId);
  if (!targetSemantic) {
    return false;
  }
  const target = targetSemantic.entry;
  const sourceConceptId = bindingOutputConceptId(sourceBinding, indexes);
  const concepts = indexes.byKind.concept;

  if (targetBinding.executorPrimitive === "validate-variant.v1") {
    return (
      targetPort === "source" &&
      sourceConceptId === target.subjectConceptId
    );
  }
  if (targetBinding.executorPrimitive === "read-path.v1") {
    if (targetPort === "source") {
      return (
        sourceConceptId === target.subjectConceptId ||
        conceptDescendsFrom(
          sourceConceptId,
          target.subjectConceptId,
          concepts
        )
      );
    }
    if (targetPort === "conceptId") {
      return [...indexes.byKind.classification.values()].some(
        (classification) =>
          classification.classificationType === "concept-variant" &&
          classification.subjectConceptId === target.subjectConceptId &&
          classification.classificationId === sourceAuthorityId
      );
    }
    return false;
  }
  if (targetBinding.executorPrimitive === "constant.v1") {
    return (
      targetPort === "activation" &&
      sourceBinding.executorPrimitive === "input.v1"
    );
  }
  if (targetBinding.executorPrimitive === "test-presence.v1") {
    return (
      targetPort === "observation" &&
      target.propertyId === sourceAuthorityId
    );
  }
  if (targetBinding.executorPrimitive === "classify-value.v1") {
    return (
      targetPort === "observation" &&
      sourceConceptId === target.subjectConceptId
    );
  }
  if (targetBinding.executorPrimitive === "classify-observations.v1") {
    return target.observations.some(
      (observation) =>
        observation.inputPort === targetPort &&
        observation.propertyId === sourceAuthorityId
    );
  }
  if (targetBinding.executorPrimitive === "translate-value.v1") {
    return (
      targetPort === "observation" &&
      sourceConceptId === target.sourceConceptId
    );
  }
  if (targetBinding.executorPrimitive === "evaluate-obligation.v1") {
    return (
      targetPort === "state" &&
      target.classificationId === sourceAuthorityId
    );
  }
  if (targetBinding.executorPrimitive === "project-value.v1") {
    return (
      targetPort === "value" &&
      target.sourceAuthorityId === sourceAuthorityId &&
      sourceConceptId === target.valueConceptId
    );
  }
  if (targetBinding.executorPrimitive === "select-result.v1") {
    return target.selectionRules.some((rule) =>
      rule.when.some(
        (condition) =>
          condition.inputPort === targetPort &&
          condition.obligationId === sourceAuthorityId
      )
    );
  }
  if (targetBinding.executorPrimitive === "emit-result.v1") {
    if (targetPort === "selection") {
      return (
        sourceAuthorityId === targetAuthorityId &&
        sourceBinding.executorPrimitive === "select-result.v1"
      );
    }
    if (!targetPort.startsWith("fragment-")) {
      return false;
    }
    const transformationId = targetPort.slice("fragment-".length);
    const transformation = indexes.byKind.transformation.get(
      transformationId
    );
    return (
      sourceAuthorityId === transformationId &&
      sourceBinding.executorPrimitive === "project-value.v1" &&
      transformation?.resultIds.some((resultId) =>
        target.members.some((member) => member.resultId === resultId)
      )
    );
  }
  if (targetBinding.executorPrimitive === "serialize-result.v1") {
    return (
      targetPort === "result" &&
      sourceAuthorityId === targetAuthorityId &&
      sourceBinding.executorPrimitive === "emit-result.v1"
    );
  }
  if (
    targetBinding.executorPrimitive === "add-bounded.v1" ||
    targetBinding.executorPrimitive === "subtract-bounded.v1" ||
    targetBinding.executorPrimitive === "compare-bounded.v1"
  ) {
    // A projection transformation emits a result fragment, not the underlying
    // value concept. It can consume the same concept as arithmetic without
    // becoming a competing arithmetic operand source.
    if (sourceBinding.executorPrimitive === "project-value.v1") {
      return false;
    }
    if (targetPort === "operandA") {
      return sourceConceptId === target.operandAConceptId;
    }
    if (targetPort === "operandB") {
      return sourceConceptId === target.operandBConceptId;
    }
    return false;
  }
  if (targetBinding.executorPrimitive === "seeded-range-draw.v1") {
    if (targetPort === "seed") {
      return sourceConceptId === target.seedConceptId;
    }
    if (targetPort === "callIndex") {
      return sourceConceptId === target.callIndexConceptId;
    }
    if (targetPort === "min") {
      return sourceConceptId === target.minConceptId;
    }
    if (targetPort === "max") {
      return sourceConceptId === target.maxConceptId;
    }
    return false;
  }
  if (targetBinding.executorPrimitive === "read-indexed-path.v1") {
    if (targetPort === "source") {
      return sourceConceptId === target.sourceConceptId;
    }
    if (targetPort === "index") {
      return sourceConceptId === target.indexConceptId;
    }
    return false;
  }
  if (
    targetBinding.executorPrimitive === "iterate-bounded-worklist.v1" ||
    targetBinding.executorPrimitive === "resolve-branching-worklist.v1"
  ) {
    if (targetPort === "seedItem") {
      return sourceConceptId === target.itemConceptId;
    }
    const factRef = collectFactRefs(target).find((ref) => ref.port === targetPort);
    return Boolean(factRef) && sourceAuthorityId === factRef.factId;
  }
  return targetBinding.executorPrimitive === "input.v1";
}

function validateExecutionClosure(authority, indexes, findings) {
  const bindingById = new Map();
  const bindingsByAuthority = new Map();
  for (const binding of authority.executionBindings) {
    if (bindingById.has(binding.bindingId)) {
      findings.push(
        finding(
          "ONTOLOGY_EXECUTOR_AMBIGUOUS",
          `Execution binding identity is duplicated: ${binding.bindingId}`
        )
      );
    }
    bindingById.set(binding.bindingId, binding);
    const semantic = indexes.semantic.get(binding.semanticAuthorityId);
    if (
      !semantic ||
      !expectedPrimitive(semantic.kind, semantic.entry).includes(
        binding.executorPrimitive
      )
    ) {
      findings.push(
        finding(
          "ONTOLOGY_EXECUTOR_UNRESOLVED",
          `Binding does not resolve to an admitted primitive for its authority: ${binding.bindingId}`
        )
      );
    }
    const entries =
      bindingsByAuthority.get(binding.semanticAuthorityId) ?? [];
    entries.push(binding);
    bindingsByAuthority.set(binding.semanticAuthorityId, entries);
  }

  const inputBindings = authority.executionBindings.filter(
    (binding) => binding.executorPrimitive === "input.v1"
  );
  if (inputBindings.length !== 1) {
    findings.push(
      finding(
        "ONTOLOGY_EXECUTOR_UNRESOLVED",
        "The ontology must bind exactly one input concept."
      )
    );
  }

  for (const [authorityId, semantic] of indexes.semantic) {
    const expected = expectedPrimitive(semantic.kind, semantic.entry);
    if (expected.length === 0) {
      continue;
    }
    const observed = new Set(
      (bindingsByAuthority.get(authorityId) ?? []).map(
        (binding) => binding.executorPrimitive
      )
    );
    if (
      (semantic.kind === "concept" &&
        authorityId !== inputBindings[0]?.semanticAuthorityId) ||
      !sameSet(new Set(expected), observed)
    ) {
      if (semantic.kind !== "concept" || observed.size > 0) {
        findings.push(
          finding(
            semantic.kind === "obligation"
              ? "ONTOLOGY_OBLIGATION_UNBOUND"
              : "ONTOLOGY_EXECUTOR_UNRESOLVED",
            `Semantic authority does not have its exact execution binding: ${authorityId}`,
            { expected, observed: [...observed].sort() }
          )
        );
      }
    }
  }

  const graph = authority.executionGraph;
  const nodeById = new Map();
  const bindingUse = new Map();
  for (const node of graph.nodes) {
    if (nodeById.has(node.nodeId)) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_NODE_DUPLICATE",
          `Execution node identity is duplicated: ${node.nodeId}`
        )
      );
    }
    nodeById.set(node.nodeId, node);
    bindingUse.set(node.bindingId, (bindingUse.get(node.bindingId) ?? 0) + 1);
    if (!bindingById.has(node.bindingId)) {
      findings.push(
        finding(
          "ONTOLOGY_EXECUTOR_UNRESOLVED",
          `Execution node binding is unresolved: ${node.bindingId}`
        )
      );
    }
  }
  for (const bindingId of bindingById.keys()) {
    if (bindingUse.get(bindingId) !== 1) {
      findings.push(
        finding(
          "ONTOLOGY_EXECUTION_BINDING_CARDINALITY",
          `Execution binding must occur in exactly one graph node: ${bindingId}`
        )
      );
    }
  }

  const incomingPorts = new Map(
    graph.nodes.map((node) => [node.nodeId, new Set()])
  );
  const outgoing = new Map(
    graph.nodes.map((node) => [node.nodeId, new Set()])
  );
  const reverse = new Map(
    graph.nodes.map((node) => [node.nodeId, new Set()])
  );
  const edgeIds = new Set();
  const graphEdges = [];
  for (const edge of graph.edges) {
    if (edgeIds.has(edge.edgeId)) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_EDGE_DUPLICATE",
          `Execution edge identity is duplicated: ${edge.edgeId}`
        )
      );
    }
    edgeIds.add(edge.edgeId);
    const sourceNode = nodeById.get(edge.from.nodeId);
    const targetNode = nodeById.get(edge.to.nodeId);
    const sourceBinding = bindingById.get(sourceNode?.bindingId);
    const targetBinding = bindingById.get(targetNode?.bindingId);
    if (!sourceNode || !targetNode || !sourceBinding || !targetBinding) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_EDGE_UNRESOLVED",
          `Execution edge has an unresolved endpoint: ${edge.edgeId}`
        )
      );
      continue;
    }
    if (
      !primitiveOutputPorts(sourceBinding.executorPrimitive).has(edge.from.port)
    ) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_OUTPUT_UNRESOLVED",
          `Execution edge uses an unresolved output port: ${edge.edgeId}`
        )
      );
    }
    if (
      !semanticEdgeIsValid(
        sourceBinding,
        targetBinding,
        edge.to.port,
        indexes
      )
    ) {
      findings.push(
        finding(
          "ONTOLOGY_EXECUTION_SEMANTIC_BINDING_MISMATCH",
          `Execution edge does not preserve its declared ontology meaning: ${edge.edgeId}`,
          {
            sourceAuthorityId: sourceBinding.semanticAuthorityId,
            targetAuthorityId: targetBinding.semanticAuthorityId,
            targetPort: edge.to.port
          }
        )
      );
    }
    if (incomingPorts.get(targetNode.nodeId).has(edge.to.port)) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_INPUT_AMBIGUOUS",
          `Execution input has more than one source: ${targetNode.nodeId}.${edge.to.port}`
        )
      );
    }
    incomingPorts.get(targetNode.nodeId).add(edge.to.port);
    outgoing.get(sourceNode.nodeId).add(targetNode.nodeId);
    reverse.get(targetNode.nodeId).add(sourceNode.nodeId);
    graphEdges.push([sourceNode.nodeId, targetNode.nodeId]);
  }

  for (const node of graph.nodes) {
    const binding = bindingById.get(node.bindingId);
    if (!binding) {
      continue;
    }
    const expected = primitiveInputPorts(binding, indexes);
    const observed = incomingPorts.get(node.nodeId);
    if (!sameSet(expected, observed)) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_INPUTS_NOT_EXACT",
          `Execution node does not have its exact input closure: ${node.nodeId}`,
          { expected: [...expected].sort(), observed: [...observed].sort() }
        )
      );
    }
  }

  const entryNode = nodeById.get(graph.entryNodeId);
  if (
    !entryNode ||
    bindingById.get(entryNode.bindingId)?.executorPrimitive !== "input.v1" ||
    incomingPorts.get(entryNode.nodeId)?.size !== 0
  ) {
    findings.push(
      finding(
        "ONTOLOGY_GRAPH_ENTRY_NOT_EXACT",
        "The ontology execution graph must have one exact input entry."
      )
    );
  }
  const terminalIds = new Set(graph.terminalNodeIds);
  for (const terminalId of terminalIds) {
    const terminal = nodeById.get(terminalId);
    if (
      !terminal ||
      bindingById.get(terminal.bindingId)?.executorPrimitive !==
        "serialize-result.v1" ||
      outgoing.get(terminalId)?.size !== 0
    ) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_TERMINAL_INVALID",
          `Execution terminal is unresolved or not a serializer: ${terminalId}`
        )
      );
    }
  }
  for (const node of graph.nodes) {
    if (outgoing.get(node.nodeId).size === 0 && !terminalIds.has(node.nodeId)) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_ORPHAN_TERMINAL",
          `Leaf node is not a declared terminal: ${node.nodeId}`
        )
      );
    }
  }

  const topology = topologicalOrder([...nodeById.keys()], graphEdges);
  if (topology.order.length !== nodeById.size) {
    findings.push(
      finding(
        "ONTOLOGY_GRAPH_CYCLIC",
        "The ontology execution graph contains a cycle."
      )
    );
  }
  const reachable = graphReachable(graph.entryNodeId, outgoing);
  const terminating = new Set();
  for (const terminalId of terminalIds) {
    for (const nodeId of graphReachable(terminalId, reverse)) {
      terminating.add(nodeId);
    }
  }
  for (const nodeId of nodeById.keys()) {
    if (!reachable.has(nodeId) || !terminating.has(nodeId)) {
      findings.push(
        finding(
          "ONTOLOGY_GRAPH_ORPHAN_NODE",
          `Execution node is unreachable or cannot terminate: ${nodeId}`
        )
      );
    }
  }
  return { bindingById, nodeById, order: topology.order };
}

function validateProofClosure(authority, indexes, findings) {
  const requiredProofTypes = new Set([
    "reference-closure",
    "type-closure",
    "cardinality-closure",
    "classification-totality",
    "translation-totality",
    "obligation-binding",
    "result-discrimination",
    "execution-binding",
    "graph-closure",
    "arithmetic-range-closure",
    "randomness-determinism-closure",
    "iteration-termination-closure"
  ]);
  const observedProofTypes = new Set();
  const requirementIds = new Set();
  for (const requirement of authority.proofRequirements) {
    if (requirementIds.has(requirement.requirementId)) {
      findings.push(
        finding(
          "ONTOLOGY_PROOF_REQUIREMENT_DUPLICATE",
          `Proof requirement identity is duplicated: ${requirement.requirementId}`
        )
      );
    }
    requirementIds.add(requirement.requirementId);
    observedProofTypes.add(requirement.proofType);
    if (
      requirement.subjectAuthorityId !== authority.ontologyId &&
      !indexes.semantic.has(requirement.subjectAuthorityId)
    ) {
      findings.push(
        finding(
          "ONTOLOGY_PROOF_SUBJECT_UNRESOLVED",
          `Proof subject is unresolved: ${requirement.subjectAuthorityId}`
        )
      );
    }
    if (requirement.requiredDisposition !== "ONTOLOGY_AUTHORITY_CLOSED") {
      findings.push(
        finding(
          "ONTOLOGY_PROOF_DISPOSITION_INVALID",
          `Proof requirement does not demand ontology closure: ${requirement.requirementId}`
        )
      );
    }
  }
  if (!sameSet(requiredProofTypes, observedProofTypes)) {
    findings.push(
      finding(
        "ONTOLOGY_PROOF_REQUIREMENTS_NOT_EXACT",
        "The ontology does not declare the exact required proof dimensions.",
        {
          expected: [...requiredProofTypes].sort(),
          observed: [...observedProofTypes].sort()
        }
      )
    );
  }
}

export function validateSemanticExecutionBundle(bundle) {
  const validateSchema = semanticBundleSchemaValidator();
  if (!validateSchema(bundle)) {
    return validateSchema.errors.map((error) =>
      finding(
        "SEMANTIC_BUNDLE_SCHEMA_INVALID",
        `${error.instancePath || "/"} ${error.message}`,
        error.params
      )
    );
  }
  const findings = [];
  if (
    JSON.stringify(canonicalize(bundle.runtimeProfile)) !==
    JSON.stringify(canonicalize(SEMANTIC_RUNTIME_PROFILE))
  ) {
    findings.push(
      finding(
        "SEMANTIC_RUNTIME_PROFILE_MISMATCH",
        "The bundle runtime profile is not the exact admitted finite runtime profile."
      )
    );
  }

  const schemaById = new Map();
  for (const entry of bundle.schemas) {
    if (schemaById.has(entry.schemaId)) {
      findings.push(
        finding(
          "ONTOLOGY_SCHEMA_ID_DUPLICATE",
          `Bound schema identity is duplicated: ${entry.schemaId}`
        )
      );
    }
    schemaById.set(entry.schemaId, entry);
    const observedDigest = digest(entry.value);
    if (observedDigest !== entry.digest) {
      findings.push(
        finding(
          "ONTOLOGY_SCHEMA_DIGEST_MISMATCH",
          `Bound schema digest is invalid: ${entry.schemaId}`,
          { expected: entry.digest, observed: observedDigest }
        )
      );
    }
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validators = new Map();
  for (const entry of bundle.schemas) {
    try {
      validators.set(entry.schemaId, ajv.compile(entry.value));
    } catch (error) {
      findings.push(
        finding(
          "ONTOLOGY_SCHEMA_INVALID",
          `Bound schema cannot be compiled: ${entry.schemaId}`,
          error.message
        )
      );
    }
  }

  const indexes = createOntologyIndexes(bundle.authority, findings);
  validateConceptClosure(bundle, indexes, schemaById, findings);
  validateOntologyReferences(bundle, indexes, validators, findings);
  validateResultClosure(indexes, validators, findings);
  validateArithmeticClosure(bundle, indexes, schemaById, validators, findings);
  validateIndexedReadAndIterationClosure(bundle, indexes, schemaById, findings);
  validateExecutionClosure(bundle.authority, indexes, findings);
  validateProofClosure(bundle.authority, indexes, findings);
  return findings;
}

export function inspectDeterministicOntology(bundle) {
  const findings = validateSemanticExecutionBundle(bundle);
  return {
    ontologyId: bundle?.authority?.ontologyId ?? null,
    ontologyDisposition:
      findings.length === 0
        ? "ONTOLOGY_AUTHORITY_CLOSED"
        : "ONTOLOGY_AUTHORITY_REJECTED",
    findings
  };
}

const BOUND_AUTHORITY_TYPE = "bound-semantic-execution-authority.v1";

const PRIMITIVE_DATA_OUTPUT_PORT = Object.freeze({
  "input.v1": "value",
  "validate-variant.v1": "conceptId",
  "read-path.v1": "observation",
  "constant.v1": "value",
  "test-presence.v1": "state",
  "classify-value.v1": "state",
  "classify-observations.v1": "state",
  "translate-value.v1": "value",
  "evaluate-obligation.v1": "status",
  "project-value.v1": "fragment",
  "select-result.v1": "resultId",
  "emit-result.v1": "result",
  "add-bounded.v1": "value",
  "subtract-bounded.v1": "value",
  "compare-bounded.v1": "state",
  "seeded-range-draw.v1": "value",
  "read-indexed-path.v1": "value",
  "iterate-bounded-worklist.v1": "value",
  "resolve-branching-worklist.v1": "value",
  "serialize-result.v1": "result"
});

const DECLARED_SEMANTIC_COLLECTIONS = Object.freeze([
  ["semanticLayer", "concepts", "concept", "conceptId"],
  ["semanticLayer", "relations", "relation", "relationId"],
  ["semanticLayer", "properties", "property", "propertyId"],
  ["semanticLayer", "facts", "fact", "factId"],
  ["ontology", "classifications", "classification", "classificationId"],
  ["ontology", "constraints", "constraint", "constraintId"],
  ["ontology", "translations", "translation", "translationId"],
  ["ontology", "obligations", "obligation", "obligationId"],
  ["ontology", "transformations", "transformation", "transformationId"],
  ["ontology", "results", "result", "resultUnionId"],
  ["ontology", "arithmeticOperations", "arithmeticOperation", "operationId"],
  ["ontology", "randomDraws", "randomDraw", "drawId"],
  ["ontology", "indexedReads", "indexedRead", "readId"],
  ["ontology", "iterations", "iteration", "iterationId"]
]);

const DERIVED_PROOF_TYPES = Object.freeze([
  "reference-closure",
  "type-closure",
  "cardinality-closure",
  "classification-totality",
  "translation-totality",
  "obligation-binding",
  "result-discrimination",
  "execution-binding",
  "graph-closure",
  "arithmetic-range-closure",
  "randomness-determinism-closure",
  "iteration-termination-closure"
]);

function primitiveSlug(primitive) {
  return primitive.slice(0, primitive.length - ".v1".length);
}

function portSlug(port) {
  return port.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function bindingSuffix(binding) {
  return `${primitiveSlug(binding.executorPrimitive)}.${binding.semanticAuthorityId}`;
}

function declaredOntologyAuthority(declaration) {
  const authority = {
    authorityType: "deterministic-ontology-authority.v1",
    ontologyId: declaration.ontologyId
  };
  for (const [group, collection] of DECLARED_SEMANTIC_COLLECTIONS) {
    authority[collection] = declaration[group][collection];
  }
  return authority;
}

function deriveExecutionBindings(declaration, findings) {
  const bindings = [];
  const bindingIds = new Set();
  for (const [group, collection, kind, identityField] of
    DECLARED_SEMANTIC_COLLECTIONS) {
    for (const entry of declaration[group][collection]) {
      const semanticAuthorityId = entry[identityField];
      if (kind === "concept" && semanticAuthorityId !== declaration.inputConceptId) {
        continue;
      }
      for (const executorPrimitive of expectedPrimitive(kind, entry)) {
        const bindingId = `bind.${primitiveSlug(executorPrimitive)}.${semanticAuthorityId}`;
        if (bindingIds.has(bindingId)) {
          findings.push(
            finding(
              "SEMANTIC_AUTHORITY_BINDING_AMBIGUOUS",
              `Derived execution binding identity is not unique: ${bindingId}`
            )
          );
          continue;
        }
        bindingIds.add(bindingId);
        bindings.push({ bindingId, semanticAuthorityId, executorPrimitive });
      }
    }
  }
  return bindings;
}

function deriveExecutionEdges(bindings, nodeByBindingId, indexes, findings) {
  const edges = [];
  for (const target of bindings) {
    let ports;
    try {
      ports = [...primitiveInputPorts(target, indexes)].sort();
    } catch {
      findings.push(
        finding(
          "SEMANTIC_AUTHORITY_INPUT_PORTS_UNRESOLVED",
          `Declared authority does not resolve its executor input ports: ${target.bindingId}`
        )
      );
      continue;
    }
    for (const port of ports) {
      const sources = bindings.filter(
        (source) =>
          source.bindingId !== target.bindingId &&
          semanticEdgeIsValid(source, target, port, indexes)
      );
      if (sources.length !== 1) {
        findings.push(
          finding(
            sources.length === 0
              ? "SEMANTIC_AUTHORITY_EDGE_UNRESOLVED"
              : "SEMANTIC_AUTHORITY_EDGE_AMBIGUOUS",
            `Declared meaning does not resolve exactly one source for an executor input: ${target.bindingId}.${port}`,
            { sources: sources.map((source) => source.bindingId).sort() }
          )
        );
        continue;
      }
      const source = sources[0];
      edges.push({
        edgeId: `edge.${bindingSuffix(source)}.to.${bindingSuffix(target)}.${portSlug(port)}`,
        from: {
          nodeId: nodeByBindingId.get(source.bindingId).nodeId,
          port: PRIMITIVE_DATA_OUTPUT_PORT[source.executorPrimitive]
        },
        to: {
          nodeId: nodeByBindingId.get(target.bindingId).nodeId,
          port
        }
      });
    }
  }
  return edges;
}

function deriveBoundSemanticExecutionBundle(declaration) {
  const schemaFindings = [];
  const validateSchema = boundAuthoritySchemaValidator();
  if (!validateSchema(declaration)) {
    for (const error of validateSchema.errors) {
      schemaFindings.push(
        finding(
          "SEMANTIC_AUTHORITY_SCHEMA_INVALID",
          `${error.instancePath || "/"} ${error.message}`,
          error.params
        )
      );
    }
    return { bundle: undefined, findings: schemaFindings };
  }

  const findings = [];
  const authority = declaredOntologyAuthority(declaration);
  const indexes = createOntologyIndexes(authority, findings);
  if (!indexes.byKind.concept.has(declaration.inputConceptId)) {
    findings.push(
      finding(
        "SEMANTIC_AUTHORITY_INPUT_UNRESOLVED",
        `The declared input concept is not a declared concept: ${declaration.inputConceptId}`
      )
    );
  }

  const bindings = deriveExecutionBindings(declaration, findings);
  const nodes = bindings.map((binding) => ({
    nodeId: `node.${bindingSuffix(binding)}`,
    bindingId: binding.bindingId
  }));
  const nodeByBindingId = new Map(
    bindings.map((binding, index) => [binding.bindingId, nodes[index]])
  );
  const edges = deriveExecutionEdges(
    bindings,
    nodeByBindingId,
    indexes,
    findings
  );

  const entryBinding = bindings.find(
    (binding) => binding.executorPrimitive === "input.v1"
  );
  const terminalBindings = bindings.filter(
    (binding) => binding.executorPrimitive === "serialize-result.v1"
  );
  if (terminalBindings.length !== 1) {
    findings.push(
      finding(
        "SEMANTIC_AUTHORITY_TERMINAL_NOT_EXACT",
        "The declared authority must resolve exactly one serialized terminal result.",
        { observed: terminalBindings.length }
      )
    );
  }

  const bundle = {
    bundleType: "semantic-execution-bundle.v1",
    bundleId: declaration.authorityId,
    authority: {
      ...authority,
      executionBindings: bindings,
      executionGraph: {
        entryNodeId: nodeByBindingId.get(entryBinding?.bindingId)?.nodeId,
        terminalNodeIds: terminalBindings
          .map((binding) => nodeByBindingId.get(binding.bindingId)?.nodeId)
          .filter((nodeId) => nodeId !== undefined),
        nodes,
        edges
      },
      proofRequirements: DERIVED_PROOF_TYPES.map((proofType) => ({
        requirementId: `prove-${proofType}`,
        proofType,
        subjectAuthorityId: declaration.ontologyId,
        requiredDisposition: "ONTOLOGY_AUTHORITY_CLOSED"
      }))
    },
    schemas: declaration.context.schemas.map((entry) => ({
      schemaId: entry.schemaId,
      digest: digest(entry.value),
      value: entry.value
    })),
    catalogs: [],
    runtimeProfile: structuredClone(SEMANTIC_RUNTIME_PROFILE)
  };

  return {
    bundle,
    findings: [...findings, ...validateSemanticExecutionBundle(bundle)]
  };
}

export function projectBoundSemanticExecutionAuthority(declaration) {
  return deriveBoundSemanticExecutionBundle(declaration);
}

export function validateBoundSemanticExecutionAuthority(declaration) {
  return deriveBoundSemanticExecutionBundle(declaration).findings;
}

export function isBoundSemanticExecutionAuthority(value) {
  return value?.authorityType === BOUND_AUTHORITY_TYPE;
}

export function projectBoundSemanticExecutionBundle(declaration) {
  const { bundle, findings } = deriveBoundSemanticExecutionBundle(declaration);
  if (findings.length > 0) {
    throw new SemanticExecutionDispositionError(
      "SEMANTIC_EXECUTION_AUTHORITY_NOT_PROJECTABLE",
      { authorityId: declaration?.authorityId ?? null, findings }
    );
  }
  return bundle;
}

function assertClosedBundle(bundle) {
  const proof = inspectDeterministicOntology(bundle);
  if (proof.ontologyDisposition !== "ONTOLOGY_AUTHORITY_CLOSED") {
    throw new SemanticExecutionDispositionError(
      "SEMANTIC_EXECUTION_BUNDLE_INVALID",
      { ontologyProof: proof }
    );
  }
}

function observePath(source, path) {
  let value = source;
  for (const segment of path) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, segment)
    ) {
      return { state: "missing" };
    }
    value = value[segment];
  }
  return value === null ? { state: "null" } : { state: "value", value };
}

function propertyState(observation, classification) {
  if (observation.state === "missing") {
    return "missing";
  }
  if (observation.state === "null") {
    return "null";
  }
  if (jsonType(observation.value) !== classification.expectedValueType) {
    return "invalid-type";
  }
  if (
    observation.value === "" &&
    classification.emptyStringState === "empty-string"
  ) {
    return "empty-string";
  }
  return "present";
}

function typedObservationState(observation, property, context) {
  if (observation?.state === "missing") {
    return { state: "missing" };
  }
  if (observation?.state === "null") {
    return { state: "null" };
  }
  const valueConcept = context.indexes.byKind.concept.get(
    property.valueConceptId
  );
  const validate = context.validators.get(valueConcept.schemaId);
  if (!validate(observation?.value)) {
    return { state: "invalid-type" };
  }
  return { state: "value", value: observation.value };
}

function observationMatchIsSatisfied(
  observed,
  expected,
  property,
  context
) {
  const typedObservation = typedObservationState(
    observed,
    property,
    context
  );
  if (typedObservation.state !== expected.state) {
    return false;
  }
  return (
    expected.state !== "value" ||
    typedValueMatches(expected.value, typedObservation.value)
  );
}

function resolveNodeInputs(nodeId, edges, outputs) {
  return Object.fromEntries(
    edges
      .filter((edge) => edge.to.nodeId === nodeId)
      .map((edge) => [
        edge.to.port,
        outputs.get(edge.from.nodeId)?.[edge.from.port]
      ])
  );
}

function setOutputPath(target, path, value) {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const next = path[index + 1];
    if (!Object.hasOwn(cursor, segment)) {
      cursor[segment] =
        typeof next === "number" ? [] : Object.create(null);
    }
    cursor = cursor[segment];
  }
  cursor[path.at(-1)] = value;
}

function executionIndexes(bundle) {
  const findings = [];
  const indexes = createOntologyIndexes(bundle.authority, findings);
  const bindingById = new Map(
    bundle.authority.executionBindings.map((binding) => [
      binding.bindingId,
      binding
    ])
  );
  const nodeById = new Map(
    bundle.authority.executionGraph.nodes.map((node) => [node.nodeId, node])
  );
  const topology = topologicalOrder(
    [...nodeById.keys()],
    bundle.authority.executionGraph.edges.map((edge) => [
      edge.from.nodeId,
      edge.to.nodeId
    ])
  );
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  const validators = new Map(
    bundle.schemas.map((entry) => [entry.schemaId, ajv.compile(entry.value)])
  );
  return { indexes, bindingById, nodeById, order: topology.order, validators };
}

function sourceValue(value) {
  return value?.state === "value" ? value.value : value;
}

function readPathValue(source, path) {
  let value = source;
  for (const segment of path) {
    value = value?.[segment];
  }
  return value;
}

function resolveStepOperandValue(operand, current, resultsAccumulator, inputs) {
  if (operand.kind === "fact") {
    return sourceValue(inputs[factPort(operand.factId)]);
  }
  if (operand.kind === "item-field") {
    return readPathValue(current, operand.path);
  }
  if (operand.kind === "item-field-indexed") {
    const array = readPathValue(current, operand.path);
    const index = readPathValue(current, operand.indexPath);
    return array?.[index];
  }
  if (operand.kind === "fact-indexed") {
    const array = sourceValue(inputs[factPort(operand.factId)]);
    const index = readPathValue(current, operand.indexPath);
    return array?.[index];
  }
  if (operand.kind === "seeded-draw") {
    const seed = sourceValue(inputs[factPort(operand.seedFactId)]);
    const callIndex = readPathValue(current, operand.callIndexPath);
    const min = resolveStepOperandValue(operand.min, current, resultsAccumulator, inputs);
    const max = resolveStepOperandValue(operand.max, current, resultsAccumulator, inputs);
    const draw = xorshift32Draw(seed, callIndex);
    return min + (draw % (max - min + 1));
  }
  return (readPathValue(current, operand.path) ?? []).length;
}

function compareOutcomeState(a, b) {
  return a < b ? "less-than" : a > b ? "greater-than" : "equal-to";
}

function stepGuardPasses(guard, current, resultsAccumulator, inputs) {
  if (!guard) {
    return true;
  }
  const operandValue = resolveStepOperandValue(guard.operand, current, resultsAccumulator, inputs);
  const compareValue = resolveStepOperandValue(guard.compareTo, current, resultsAccumulator, inputs);
  return guard.matchStates.includes(compareOutcomeState(operandValue, compareValue));
}

function applyStepProgram(steps, clone, resultsAccumulator, inputs) {
  steps.forEach((step) => {
    if (!stepGuardPasses(step.when, clone, resultsAccumulator, inputs)) {
      return;
    }
    const operandValue = resolveStepOperandValue(step.operand, clone, resultsAccumulator, inputs);
    const existing = readPathValue(clone, step.targetPath);
    const nextValue =
      step.operation === "set"
        ? operandValue
        : step.operation === "add"
          ? existing + operandValue
          : step.operation === "subtract"
            ? existing - operandValue
            : [...(existing ?? []), operandValue];
    setOutputPath(clone, step.targetPath, nextValue);
  });
}

function executePrimitive(binding, inputs, context) {
  const semantic = context.indexes.semantic.get(binding.semanticAuthorityId);
  const authority = semantic.entry;
  const primitive = binding.executorPrimitive;
  if (primitive === "input.v1") {
    return { value: context.input };
  }
  if (primitive === "validate-variant.v1") {
    const validationFindings = [];
    const matches = authority.variants.filter((conceptId) => {
      const concept = context.indexes.byKind.concept.get(conceptId);
      const validate = context.validators.get(concept.schemaId);
      const matchesVariant = validate(inputs.source);
      if (!matchesVariant) {
        validationFindings.push({
          conceptId,
          errors: structuredClone(validate.errors ?? [])
        });
      }
      return matchesVariant;
    });
    if (matches.length === 0) {
      throw new SemanticExecutionDispositionError(
        authority.noMatchDisposition,
        { validationFindings }
      );
    }
    if (matches.length > 1) {
      throw new SemanticExecutionDispositionError(
        authority.multipleMatchDisposition,
        { matchedConceptIds: matches.sort() }
      );
    }
    return { conceptId: matches[0] };
  }
  if (primitive === "read-path.v1") {
    const matches = authority.resolutions.filter(
      (resolution) =>
        resolution.subjectVariantConceptId === inputs.conceptId
    );
    if (matches.length !== 1) {
      throw new SemanticExecutionDispositionError(
        "ONTOLOGY_PROPERTY_RESOLUTION_INVALID",
        { propertyId: authority.propertyId, conceptId: inputs.conceptId }
      );
    }
    return {
      observation: observePath(inputs.source, matches[0].path)
    };
  }
  if (primitive === "constant.v1") {
    return { value: structuredClone(authority.value.value) };
  }
  if (primitive === "test-presence.v1") {
    return { state: propertyState(inputs.observation, authority) };
  }
  if (primitive === "classify-value.v1") {
    const value = sourceValue(inputs.observation);
    const matches = authority.cases.filter((entry) =>
      typedValueMatches(entry.value, value)
    );
    if (matches.length !== 1) {
      throw new SemanticExecutionDispositionError(
        authority.unmatchedDisposition,
        { matchCount: matches.length }
      );
    }
    return { state: matches[0].stateId };
  }
  if (primitive === "classify-observations.v1") {
    const observationByPort = new Map(
      authority.observations.map((observation) => [
        observation.inputPort,
        context.indexes.byKind.property.get(observation.propertyId)
      ])
    );
    const matches = authority.cases.filter((entry) =>
      entry.when.every((condition) =>
        observationMatchIsSatisfied(
          inputs[condition.inputPort],
          condition.observation,
          observationByPort.get(condition.inputPort),
          context
        )
      )
    );
    if (matches.length === 0) {
      throw new SemanticExecutionDispositionError(
        authority.noMatchDisposition
      );
    }
    if (matches.length > 1) {
      throw new SemanticExecutionDispositionError(
        authority.multipleMatchDisposition,
        { matchedCaseIds: matches.map((entry) => entry.caseId).sort() }
      );
    }
    return { state: structuredClone(matches[0].emit.value) };
  }
  if (primitive === "translate-value.v1") {
    const value = sourceValue(inputs.observation);
    const matches = authority.cases.filter((entry) =>
      typedValueMatches(entry.source, value)
    );
    if (matches.length !== 1) {
      throw new SemanticExecutionDispositionError(
        authority.unmappedDisposition,
        { matchCount: matches.length }
      );
    }
    return { value: structuredClone(matches[0].target.value) };
  }
  if (primitive === "evaluate-obligation.v1") {
    const satisfied = authority.satisfiedStateIds.includes(inputs.state);
    return {
      status: satisfied ? "satisfied" : "violated",
      disposition: satisfied ? null : authority.failureDisposition
    };
  }
  if (primitive === "project-value.v1") {
    const concept = context.indexes.byKind.concept.get(
      authority.valueConceptId
    );
    const validate = context.validators.get(concept.schemaId);
    if (inputs.value?.state === "missing" || inputs.value?.state === "null") {
      return {
        fragment: {
          state: "unavailable",
          disposition: authority.unavailableDisposition,
          resultIds: authority.resultIds
        }
      };
    }
    const value = sourceValue(inputs.value);
    if (!validate(value)) {
      return {
        fragment: {
          state: "invalid",
          disposition: authority.invalidTypeDisposition,
          resultIds: authority.resultIds
        }
      };
    }
    return {
      fragment: {
        state: "value",
        outputPath: authority.outputPath,
        resultIds: authority.resultIds,
        value: structuredClone(value)
      }
    };
  }
  if (primitive === "select-result.v1") {
    const matches = authority.selectionRules.filter((rule) =>
      rule.when.every(
        (condition) => inputs[condition.inputPort] === condition.status
      )
    );
    if (matches.length === 0) {
      throw new SemanticExecutionDispositionError(
        authority.noMatchDisposition
      );
    }
    if (matches.length > 1) {
      throw new SemanticExecutionDispositionError(
        authority.multipleMatchDisposition,
        { matchedRuleIds: matches.map((rule) => rule.ruleId).sort() }
      );
    }
    return { resultId: matches[0].resultId };
  }
  if (primitive === "emit-result.v1") {
    const members = authority.members.filter(
      (member) => member.resultId === inputs.selection
    );
    if (members.length !== 1) {
      throw new SemanticExecutionDispositionError(
        authority.invalidResultDisposition
      );
    }
    const member = members[0];
    const result = Object.create(null);
    setOutputPath(
      result,
      member.discriminator.outputPath,
      structuredClone(member.discriminator.value.value)
    );
    for (const [port, fragment] of Object.entries(inputs)) {
      if (
        port === "selection" ||
        !fragment.resultIds.includes(member.resultId)
      ) {
        continue;
      }
      if (fragment.state !== "value") {
        throw new SemanticExecutionDispositionError(fragment.disposition);
      }
      setOutputPath(result, fragment.outputPath, structuredClone(fragment.value));
    }
    const concept = context.indexes.byKind.concept.get(member.conceptId);
    const validate = context.validators.get(concept.schemaId);
    if (!validate(result)) {
      throw new SemanticExecutionDispositionError(
        authority.invalidResultDisposition,
        { errors: structuredClone(validate.errors ?? []) }
      );
    }
    return { result: canonicalize(result) };
  }
  if (primitive === "add-bounded.v1") {
    return { value: sourceValue(inputs.operandA) + sourceValue(inputs.operandB) };
  }
  if (primitive === "subtract-bounded.v1") {
    return { value: sourceValue(inputs.operandA) - sourceValue(inputs.operandB) };
  }
  if (primitive === "compare-bounded.v1") {
    const operandA = sourceValue(inputs.operandA);
    const operandB = sourceValue(inputs.operandB);
    const state =
      operandA < operandB
        ? "less-than"
        : operandA > operandB
          ? "greater-than"
          : "equal-to";
    return { state };
  }
  if (primitive === "seeded-range-draw.v1") {
    const min = sourceValue(inputs.min);
    const max = sourceValue(inputs.max);
    const seed = sourceValue(inputs.seed);
    const callIndex = sourceValue(inputs.callIndex);
    if (max < min) {
      throw new SemanticExecutionDispositionError(
        "RANGE_DRAW_INVALID_BOUNDS",
        { min, max }
      );
    }
    const draw = xorshift32Draw(seed, callIndex);
    return { value: min + (draw % (max - min + 1)) };
  }
  if (primitive === "read-indexed-path.v1") {
    const source = sourceValue(inputs.source);
    const index = sourceValue(inputs.index);
    let cursor = source;
    for (const segment of authority.basePath) {
      if (
        cursor === null ||
        typeof cursor !== "object" ||
        !Object.hasOwn(cursor, segment)
      ) {
        throw new SemanticExecutionDispositionError(
          authority.outOfBoundsDisposition,
          { basePath: authority.basePath }
        );
      }
      cursor = cursor[segment];
    }
    if (!Array.isArray(cursor) || index < 0 || index >= cursor.length) {
      throw new SemanticExecutionDispositionError(
        authority.outOfBoundsDisposition,
        { index }
      );
    }
    return { value: structuredClone(cursor[index]) };
  }
  if (primitive === "iterate-bounded-worklist.v1") {
    const results = [];
    let current = sourceValue(inputs.seedItem);
    let terminated = false;
    for (let step = 0; step <= authority.maxSteps; step += 1) {
      if (authority.resultMode === "history") {
        results.push(structuredClone(current));
      }
      const operand = readPathValue(
        current,
        authority.continueCondition.operandPath
      );
      const compareTo = resolveStepOperandValue(
        authority.continueCondition.compareTo,
        current,
        null,
        inputs
      );
      if (!authority.continueCondition.continueWhenStates.includes(compareOutcomeState(operand, compareTo))) {
        terminated = true;
        break;
      }
      if (step === authority.maxSteps) {
        break;
      }
      const clone = structuredClone(current);
      applyStepProgram(authority.advance.steps, clone, null, inputs);
      current = clone;
    }
    if (!terminated) {
      throw new SemanticExecutionDispositionError(
        authority.unresolvedDisposition,
        { maxSteps: authority.maxSteps }
      );
    }
    return { value: authority.resultMode === "final-item" ? current : results };
  }
  if (primitive === "resolve-branching-worklist.v1") {
    let resultsAccumulator = structuredClone(authority.initialAccumulator);
    const queue = [sourceValue(inputs.seedItem)];
    let processed = 0;
    while (queue.length > 0 && processed < authority.maxItems) {
      const item = queue.shift();
      processed += 1;
      const isTerminal = authority.terminalWhen.anyOf.some((group) =>
        group.every((condition) => stepGuardPasses(condition, item, resultsAccumulator, inputs))
      );
      if (isTerminal) {
        const work = { item, accumulator: structuredClone(resultsAccumulator) };
        const clone = structuredClone(work);
        applyStepProgram(authority.terminalSteps, clone, resultsAccumulator, inputs);
        resultsAccumulator = clone.accumulator;
      } else {
        const workingCopy = { parent: item, left: {}, right: {}, accumulator: structuredClone(resultsAccumulator) };
        const clone = structuredClone(workingCopy);
        applyStepProgram(authority.splitSteps, clone, resultsAccumulator, inputs);
        resultsAccumulator = clone.accumulator;
        queue.push(clone.left, clone.right);
      }
    }
    if (queue.length > 0) {
      throw new SemanticExecutionDispositionError(
        authority.unresolvedDisposition,
        { maxItems: authority.maxItems }
      );
    }
    return { value: resultsAccumulator };
  }
  if (primitive === "serialize-result.v1") {
    if (authority.serializerId === "identity.v1") {
      return { result: inputs.result };
    }
    const serialized = canonicalBytes(inputs.result).toString("utf8");
    if (
      Buffer.byteLength(serialized, "utf8") >
      SEMANTIC_RUNTIME_PROFILE.limits.maxSerializedByteLength
    ) {
      throw new SemanticExecutionDispositionError(
        "SEMANTIC_RESULT_SIZE_LIMIT_EXCEEDED"
      );
    }
    return { result: serialized };
  }
  throw new SemanticExecutionDispositionError("ONTOLOGY_EXECUTOR_UNRESOLVED", {
    primitive
  });
}

export function executeSemanticAuthority(bundle, input) {
  assertClosedBundle(bundle);
  const context = executionIndexes(bundle);
  context.input = input;
  const outputs = new Map();
  for (const nodeId of context.order) {
    const node = context.nodeById.get(nodeId);
    const binding = context.bindingById.get(node.bindingId);
    outputs.set(
      nodeId,
      executePrimitive(
        binding,
        resolveNodeInputs(
          nodeId,
          bundle.authority.executionGraph.edges,
          outputs
        ),
        context
      )
    );
  }
  const terminalId = bundle.authority.executionGraph.terminalNodeIds[0];
  return outputs.get(terminalId).result;
}
