import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticExecutionDispositionError,
  executeSemanticAuthority,
  inspectDeterministicOntology,
  projectBoundSemanticExecutionBundle,
  validateBoundSemanticExecutionAuthority,
  validateSemanticExecutionBundle
} from "../lib/governed-artifact-engine.mjs";
import {
  makeProviderNormalizationOntologyBundle,
  makeProviderNormalizationSemanticAuthority
} from "./fixtures/provider-normalization-ontology.mjs";
import {
  makeBoundedArithmeticOntologyBundle,
  makeBoundedArithmeticSemanticAuthority
} from "./fixtures/bounded-arithmetic-ontology.mjs";
import {
  makeBoundedWorklistOntologyBundle,
  makeBoundedWorklistSemanticAuthority
} from "./fixtures/bounded-worklist-ontology.mjs";
import {
  makeIndexedReadOntologyBundle,
  makeIndexedReadSemanticAuthority
} from "./fixtures/indexed-read-ontology.mjs";
import {
  makeGuardedIterationOntologyBundle,
  makeGuardedIterationSemanticAuthority
} from "./fixtures/guarded-iteration-ontology.mjs";
import {
  makeBranchingWorklistOntologyBundle,
  makeBranchingWorklistSemanticAuthority
} from "./fixtures/branching-worklist-ontology.mjs";

function openAiResponse(content = "hello", finishReason = "stop") {
  return {
    model: "gpt-example",
    choices: [
      {
        message: content === undefined ? {} : { content },
        finish_reason: finishReason
      }
    ]
  };
}

function geminiResponse(content = "hello", finishReason = "STOP") {
  return {
    modelVersion: "gemini-example",
    candidates: [
      {
        content:
          content === undefined
            ? {}
            : { parts: [{ text: content }] },
        finishReason
      }
    ]
  };
}

function llamaCppResponse(
  content = "hello",
  {
    stoppedEos = true,
    stoppedLimit = false,
    stoppedWord = false
  } = {}
) {
  return {
    model: "llama-example",
    content,
    stopped_eos: stoppedEos,
    stopped_limit: stoppedLimit,
    stopped_word: stoppedWord
  };
}

test("the provider ontology is closed and executes every admitted variant", () => {
  const bundle = makeProviderNormalizationOntologyBundle();
  assert.deepEqual(validateSemanticExecutionBundle(bundle), []);
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "provider-response-normalization",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });
  assert.deepEqual(executeSemanticAuthority(bundle, openAiResponse()), {
    resultType: "normalized-response",
    status: "success",
    provider: "openai",
    content: "hello",
    finishReason: "completed"
  });
  assert.deepEqual(
    executeSemanticAuthority(bundle, geminiResponse("world", "MAX_TOKENS")),
    {
      resultType: "normalized-response",
      status: "success",
      provider: "gemini",
      content: "world",
      finishReason: "max-output-reached"
    }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, llamaCppResponse("native")),
    {
      resultType: "normalized-response",
      status: "success",
      provider: "llama.cpp",
      content: "native",
      finishReason: "completed"
    }
  );
});

test("missing, null, empty, and wrong-type content have explicit outcomes", () => {
  const bundle = makeProviderNormalizationOntologyBundle();
  const missingContent = openAiResponse();
  delete missingContent.choices[0].message.content;
  for (const input of [
    missingContent,
    openAiResponse(null),
    openAiResponse(""),
    openAiResponse(42)
  ]) {
    assert.deepEqual(executeSemanticAuthority(bundle, input), {
      resultType: "normalized-response",
      status: "failure",
      provider: "openai",
      failure: {
        code: "RESPONSE_CONTENT_MISSING"
      }
    });
  }
});

test("variant and classification failures emit their exact dispositions", () => {
  const bundle = makeProviderNormalizationOntologyBundle();
  assert.throws(
    () => executeSemanticAuthority(bundle, {}),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "UNSUPPORTED_RESPONSE_VARIANT"
  );
  assert.throws(
    () =>
      executeSemanticAuthority(bundle, {
        ...openAiResponse(),
        ...geminiResponse()
      }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "AMBIGUOUS_RESPONSE_VARIANT" &&
      error.details.matchedConceptIds.length === 2
  );
  assert.throws(
    () => executeSemanticAuthority(bundle, openAiResponse("hello", "other")),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "UNKNOWN_COMPLETION_STATE"
  );
});

test("multi-observation classification preserves native llama.cpp state", () => {
  const bundle = makeProviderNormalizationOntologyBundle();
  assert.equal(
    executeSemanticAuthority(
      bundle,
      llamaCppResponse("limited", {
        stoppedEos: false,
        stoppedLimit: true
      })
    ).finishReason,
    "max-output-reached"
  );
  assert.equal(
    executeSemanticAuthority(
      bundle,
      llamaCppResponse("word", {
        stoppedEos: false,
        stoppedWord: true
      })
    ).finishReason,
    "user-stop"
  );
  assert.throws(
    () =>
      executeSemanticAuthority(
        bundle,
        llamaCppResponse("ambiguous", {
          stoppedEos: true,
          stoppedLimit: true
        })
      ),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "AMBIGUOUS_COMPLETION_STATE" &&
      error.details.matchedCaseIds.length === 2
  );
  assert.throws(
    () =>
      executeSemanticAuthority(
        bundle,
        llamaCppResponse("unknown", {
          stoppedEos: false
        })
      ),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "UNKNOWN_COMPLETION_STATE"
  );
  assert.throws(
    () =>
      executeSemanticAuthority(bundle, {
        ...openAiResponse(),
        stopped_eos: true
      }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "AMBIGUOUS_COMPLETION_STATE"
  );
});

test("ontology cycles, graph cycles, orphan nodes, and ambiguous outputs fail closed", () => {
  const cases = [
    {
      findingId: "ONTOLOGY_GRAPH_CYCLIC",
      mutate(bundle) {
        bundle.authority.concepts.find(
          (entry) => entry.conceptId === "provider-response"
        ).isA.push("openai-response");
      }
    },
    {
      findingId: "ONTOLOGY_GRAPH_CYCLIC",
      mutate(bundle) {
        bundle.authority.executionGraph.edges.push({
          edgeId: "cycle",
          from: {
            nodeId: "node.serialize-result.normalization-result",
            port: "result"
          },
          to: {
            nodeId: "node.validate-variant.classify-provider-variant",
            port: "cycle"
          }
        });
      }
    },
    {
      findingId: "ONTOLOGY_GRAPH_ORPHAN_NODE",
      mutate(bundle) {
        bundle.authority.executionGraph.edges =
          bundle.authority.executionGraph.edges.filter(
            (entry) =>
              entry.edgeId !==
              "edge.input.provider-response.to.constant.normalized-result-type-fact.activation"
          );
      }
    },
    {
      findingId: "ONTOLOGY_TRANSFORMATION_AMBIGUOUS",
      mutate(bundle) {
        const duplicate = structuredClone(
          bundle.authority.transformations.find(
            (entry) => entry.transformationId === "project-provider"
          )
        );
        duplicate.transformationId = "project-provider-again";
        bundle.authority.transformations.push(duplicate);
      }
    },
    {
      findingId: "ONTOLOGY_EXECUTION_SEMANTIC_BINDING_MISMATCH",
      mutate(bundle) {
        const providerEdge = bundle.authority.executionGraph.edges.find(
          (entry) =>
            entry.edgeId ===
            "edge.translate-value.translate-provider-identity.to.project-value.project-provider.value"
        );
        const finishEdge = bundle.authority.executionGraph.edges.find(
          (entry) =>
            entry.edgeId ===
            "edge.classify-observations.classify-completion-state.to.project-value.project-finish-reason.value"
        );
        [
          providerEdge.from.nodeId,
          finishEdge.from.nodeId
        ] = [
          finishEdge.from.nodeId,
          providerEdge.from.nodeId
        ];
      }
    },
    {
      findingId: "ONTOLOGY_CLASSIFICATION_CASE_INVALID",
      mutate(bundle) {
        const classification = bundle.authority.classifications.find(
          (entry) => entry.classificationType === "multi-observation"
        );
        const duplicate = structuredClone(classification.cases[0]);
        duplicate.caseId = "duplicate-completion-case";
        classification.cases.push(duplicate);
      }
    },
    {
      findingId: "ONTOLOGY_EXECUTION_SEMANTIC_BINDING_MISMATCH",
      mutate(bundle) {
        const edge = bundle.authority.executionGraph.edges.find(
          (entry) =>
            entry.edgeId ===
            "edge.read-path.stopped-eos-property.to.classify-observations.classify-completion-state.stopped-eos"
        );
        edge.from.nodeId = "node.read-path.stopped-limit-property";
      }
    },
    {
      findingId: "ONTOLOGY_CLASSIFICATION_CASE_INVALID",
      mutate(bundle) {
        const classification = bundle.authority.classifications.find(
          (entry) => entry.classificationType === "multi-observation"
        );
        classification.cases[0].emit = {
          type: "boolean",
          value: true
        };
      }
    },
    {
      findingId: "ONTOLOGY_CLASSIFICATION_DISPOSITIONS_NOT_DISTINCT",
      mutate(bundle) {
        const classification = bundle.authority.classifications.find(
          (entry) => entry.classificationType === "multi-observation"
        );
        classification.multipleMatchDisposition =
          classification.noMatchDisposition;
      }
    }
  ];
  for (const entry of cases) {
    const bundle = makeProviderNormalizationOntologyBundle();
    entry.mutate(bundle);
    const findings = validateSemanticExecutionBundle(bundle);
    assert.equal(
      findings.some((finding) => finding.findingId === entry.findingId),
      true,
      entry.findingId
    );
  }
});

test("the runtime primitive vocabulary is an exact digest-bound authority", () => {
  const bundle = makeProviderNormalizationOntologyBundle();
  bundle.runtimeProfile.admittedPrimitives =
    bundle.runtimeProfile.admittedPrimitives.filter(
      (primitive) => primitive !== "classify-observations.v1"
    );
  const findings = validateSemanticExecutionBundle(bundle);
  assert.equal(
    findings.some(
      (finding) =>
        finding.findingId === "SEMANTIC_BUNDLE_SCHEMA_INVALID" ||
        finding.findingId === "SEMANTIC_RUNTIME_PROFILE_MISMATCH"
    ),
    true
  );
});

test("declared meaning projects one bound execution bundle and nothing else", () => {
  const declaration = makeProviderNormalizationSemanticAuthority();
  assert.deepEqual(validateBoundSemanticExecutionAuthority(declaration), []);

  const bundle = projectBoundSemanticExecutionBundle(declaration);
  assert.deepEqual(
    projectBoundSemanticExecutionBundle(
      makeProviderNormalizationSemanticAuthority()
    ),
    bundle
  );
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "provider-response-normalization",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  assert.deepEqual(Object.keys(declaration).sort(), [
    "authorityId",
    "authorityType",
    "context",
    "inputConceptId",
    "ontology",
    "ontologyId",
    "semanticLayer"
  ]);
  for (const derived of [
    "executionBindings",
    "executionGraph",
    "proofRequirements"
  ]) {
    assert.equal(declaration.semanticLayer[derived], undefined);
    assert.equal(declaration.ontology[derived], undefined);
    assert.equal(declaration.context[derived], undefined);
    assert.equal(Array.isArray(bundle.authority[derived]) ||
      typeof bundle.authority[derived] === "object", true);
  }
  for (const schema of declaration.context.schemas) {
    assert.equal(schema.digest, undefined);
  }
  for (const schema of bundle.schemas) {
    assert.match(schema.digest, /^sha256:[a-f0-9]{64}$/);
  }

  assert.equal(
    bundle.authority.executionBindings.length,
    bundle.authority.executionGraph.nodes.length
  );
  assert.equal(
    bundle.authority.executionGraph.entryNodeId,
    "node.input.provider-response"
  );
  assert.deepEqual(bundle.authority.executionGraph.terminalNodeIds, [
    "node.serialize-result.normalization-result"
  ]);
  assert.deepEqual(
    bundle.authority.proofRequirements.map(
      (requirement) => requirement.proofType
    ),
    [
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
    ]
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, llamaCppResponse("native", {
      stoppedEos: false,
      stoppedLimit: true
    })),
    {
      resultType: "normalized-response",
      status: "success",
      provider: "llama.cpp",
      content: "native",
      finishReason: "max-output-reached"
    }
  );
});

test("undeclarable meaning refuses to project an execution bundle", () => {
  const cases = [
    {
      findingId: "SEMANTIC_AUTHORITY_SCHEMA_INVALID",
      mutate(declaration) {
        declaration.executionBindings = [];
      }
    },
    {
      findingId: "SEMANTIC_AUTHORITY_SCHEMA_INVALID",
      mutate(declaration) {
        declaration.context.schemas[0].digest = `sha256:${"0".repeat(64)}`;
      }
    },
    {
      findingId: "SEMANTIC_AUTHORITY_INPUT_UNRESOLVED",
      mutate(declaration) {
        declaration.inputConceptId = "undeclared-subject";
      }
    },
    {
      findingId: "SEMANTIC_AUTHORITY_EDGE_UNRESOLVED",
      mutate(declaration) {
        declaration.ontology.translations[0].sourceConceptId =
          "normalized-success";
      }
    },
    {
      findingId: "SEMANTIC_AUTHORITY_EDGE_AMBIGUOUS",
      mutate(declaration) {
        declaration.ontology.translations[0].sourceConceptId =
          "canonical-finish-reason";
      }
    },
    {
      findingId: "SEMANTIC_AUTHORITY_TERMINAL_NOT_EXACT",
      mutate(declaration) {
        const duplicate = structuredClone(declaration.ontology.results[0]);
        duplicate.resultUnionId = "normalization-result-again";
        declaration.ontology.results.push(duplicate);
      }
    }
  ];
  for (const entry of cases) {
    const declaration = makeProviderNormalizationSemanticAuthority();
    entry.mutate(declaration);
    const findings = validateBoundSemanticExecutionAuthority(declaration);
    assert.equal(
      findings.some((finding) => finding.findingId === entry.findingId),
      true,
      `${entry.findingId}: ${JSON.stringify(findings.map((finding) => finding.findingId))}`
    );
    assert.throws(
      () => projectBoundSemanticExecutionBundle(declaration),
      (error) =>
        error instanceof SemanticExecutionDispositionError &&
        error.disposition === "SEMANTIC_EXECUTION_AUTHORITY_NOT_PROJECTABLE"
    );
  }
});

test("bounded arithmetic and seeded range draw close and execute deterministically", () => {
  const bundle = makeBoundedArithmeticOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "arithmetic-smoke",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });
  assert.deepEqual(
    bundle.authority.proofRequirements.map(
      (requirement) => requirement.proofType
    ),
    [
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
    ]
  );

  const greater = executeSemanticAuthority(bundle, { a: 40, b: 15 });
  assert.deepEqual(greater, {
    resultType: "arithmetic-smoke-result",
    sum: 55,
    diff: 25,
    order: "greater-than",
    draw: greater.draw
  });
  assert.ok(greater.draw >= 0 && greater.draw <= 63);

  assert.deepEqual(
    executeSemanticAuthority(bundle, { a: 40, b: 15 }),
    greater,
    "the seeded draw must replay identically for the same input"
  );

  assert.equal(
    executeSemanticAuthority(bundle, { a: 9, b: 9 }).order,
    "equal-to"
  );
  const lesser = executeSemanticAuthority(bundle, { a: 2, b: 50 });
  assert.equal(lesser.order, "less-than");
  assert.equal(lesser.diff, -48);
});

test("comparison authority admits large bounded operational quantities", () => {
  const declaration = makeBoundedArithmeticSemanticAuthority();
  const requestSchema = declaration.context.schemas.find(
    (entry) => entry.schemaId === "coordinate-pair.schema.v1"
  ).value;
  requestSchema.properties.largeA = { type: "integer", minimum: 0, maximum: 2147483647 };
  requestSchema.properties.largeB = { type: "integer", minimum: 0, maximum: 2147483647 };
  requestSchema.required.push("largeA", "largeB");
  declaration.context.schemas.push({
    schemaId: "large-operational-count.schema.v1",
    value: { type: "integer", minimum: 0, maximum: 2147483647 }
  });
  declaration.semanticLayer.concepts.push(
    { conceptId: "large-a-value", conceptType: "domain-value", isA: [], abstract: false, schemaId: "large-operational-count.schema.v1" },
    { conceptId: "large-b-value", conceptType: "domain-value", isA: [], abstract: false, schemaId: "large-operational-count.schema.v1" }
  );
  declaration.semanticLayer.properties.push(
    { propertyId: "large-a", propertyKind: "observed", subjectConceptId: "coordinate-pair", valueConceptId: "large-a-value", cardinality: "exactly-one", resolutions: [{ subjectVariantConceptId: "coordinate-pair", path: ["largeA"] }] },
    { propertyId: "large-b", propertyKind: "observed", subjectConceptId: "coordinate-pair", valueConceptId: "large-b-value", cardinality: "exactly-one", resolutions: [{ subjectVariantConceptId: "coordinate-pair", path: ["largeB"] }] }
  );
  const comparison = declaration.ontology.arithmeticOperations.find(
    (operation) => operation.operation === "compare"
  );
  comparison.operandAConceptId = "large-a-value";
  comparison.operandBConceptId = "large-b-value";

  assert.deepEqual(validateBoundSemanticExecutionAuthority(declaration), []);
  const bundle = projectBoundSemanticExecutionBundle(declaration);
  assert.equal(
    executeSemanticAuthority(bundle, { a: 1, b: 1, largeA: 8192, largeB: 4096 }).order,
    "greater-than"
  );
  assert.throws(
    () => executeSemanticAuthority(bundle, { a: 1, b: 1, largeA: -1, largeB: 4096 }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.details.validationFindings[0].errors.some(
        (finding) => finding.instancePath === "/largeA" && finding.keyword === "minimum"
      )
  );
});

test("unprovable arithmetic and invalid range-draw bounds fail closed", () => {
  const rangeUnprovenDeclaration = makeBoundedArithmeticSemanticAuthority();
  rangeUnprovenDeclaration.context.schemas.find(
    (schema) => schema.schemaId === "bounded-sum.schema.v1"
  ).value.maximum = 100;
  rangeUnprovenDeclaration.context.schemas.find(
    (schema) => schema.schemaId === "arithmetic-smoke-result.schema.v1"
  ).value.properties.sum.maximum = 100;
  assert.equal(
    validateBoundSemanticExecutionAuthority(rangeUnprovenDeclaration).some(
      (finding) => finding.findingId === "ONTOLOGY_ARITHMETIC_RANGE_UNPROVEN"
    ),
    true
  );

  const unboundedOperandDeclaration = makeBoundedArithmeticSemanticAuthority();
  unboundedOperandDeclaration.context.schemas.find(
    (schema) => schema.schemaId === "bounded-int.schema.v1"
  ).value.maximum = 9999;
  assert.equal(
    validateBoundSemanticExecutionAuthority(
      unboundedOperandDeclaration
    ).some(
      (finding) => finding.findingId === "ONTOLOGY_ARITHMETIC_OPERAND_UNBOUNDED"
    ),
    true
  );

  const invalidDrawBoundsDeclaration = makeBoundedArithmeticSemanticAuthority();
  invalidDrawBoundsDeclaration.semanticLayer.facts.find(
    (fact) => fact.factId === "draw-min"
  ).value.value = 50;
  invalidDrawBoundsDeclaration.semanticLayer.facts.find(
    (fact) => fact.factId === "draw-max"
  ).value.value = 10;
  assert.deepEqual(
    validateBoundSemanticExecutionAuthority(invalidDrawBoundsDeclaration),
    []
  );
  const invalidDrawBoundsBundle = projectBoundSemanticExecutionBundle(
    invalidDrawBoundsDeclaration
  );
  assert.throws(
    () => executeSemanticAuthority(invalidDrawBoundsBundle, { a: 1, b: 1 }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "RANGE_DRAW_INVALID_BOUNDS"
  );
});

test("bounded worklist iteration closes and accumulates deterministically", () => {
  const bundle = makeBoundedWorklistOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "worklist-smoke",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  const result = executeSemanticAuthority(bundle, { count: 0 });
  assert.deepEqual(
    result.sequence.map((item) => item.count),
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );

  const fromFive = executeSemanticAuthority(bundle, { count: 5 });
  assert.deepEqual(
    fromFive.sequence.map((item) => item.count),
    [5, 6, 7, 8, 9, 10]
  );
});

test("iteration ceilings and over-limit maxSteps fail closed", () => {
  const tooLowCeilingDeclaration = makeBoundedWorklistSemanticAuthority();
  tooLowCeilingDeclaration.ontology.iterations[0].maxSteps = 5;
  assert.deepEqual(
    validateBoundSemanticExecutionAuthority(tooLowCeilingDeclaration),
    []
  );
  const tooLowCeilingBundle = projectBoundSemanticExecutionBundle(
    tooLowCeilingDeclaration
  );
  assert.throws(
    () => executeSemanticAuthority(tooLowCeilingBundle, { count: 0 }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "WORKLIST_ITERATION_LIMIT_EXCEEDED"
  );

  const unboundedDeclaration = makeBoundedWorklistSemanticAuthority();
  unboundedDeclaration.ontology.iterations[0].maxSteps = 9999;
  assert.equal(
    validateBoundSemanticExecutionAuthority(unboundedDeclaration).some(
      (finding) => finding.findingId === "ONTOLOGY_ITERATION_UNBOUNDED"
    ),
    true
  );
});

test("dynamic indexed reads resolve in-bounds and fail closed out of bounds", () => {
  const bundle = makeIndexedReadOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "indexed-read-smoke",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  assert.deepEqual(
    executeSemanticAuthority(bundle, { items: [10, 20, 30, 40, 50], index: 2 }),
    { resultType: "indexed-read-result", value: 30 }
  );
  assert.deepEqual(
    executeSemanticAuthority(bundle, { items: [7, 8, 9], index: 0 }),
    { resultType: "indexed-read-result", value: 7 }
  );

  assert.throws(
    () =>
      executeSemanticAuthority(bundle, { items: [1, 2, 3], index: 5 }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "INDEX_OUT_OF_BOUNDS"
  );
});

test("guarded advance steps evaluate independently against the pre-step snapshot", () => {
  const bundle = makeGuardedIterationOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "guarded-iteration-smoke",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  const result = executeSemanticAuthority(bundle, {
    a: 0,
    e: 0,
    steps: 0,
    limit: 3,
    history: [],
    lookup: -1,
    historyEcho: -1
  });

  assert.deepEqual(result.history, [
    { a: 0, e: 0, steps: 0, limit: 3, history: [], lookup: -1, historyEcho: -1 },
    { a: 0, e: 1, steps: 1, limit: 3, history: [0], lookup: 100, historyEcho: 0 },
    { a: 10, e: 2, steps: 2, limit: 3, history: [0, 1], lookup: 200, historyEcho: 1 },
    { a: 20, e: 3, steps: 3, limit: 3, history: [0, 1, 2], lookup: 300, historyEcho: 2 }
  ]);
});

test("guarded iteration ceiling fails closed when the continue condition never resolves", () => {
  const declaration = makeGuardedIterationSemanticAuthority();
  declaration.ontology.iterations[0].maxSteps = 1;
  const bundle = projectBoundSemanticExecutionBundle(declaration);
  assert.throws(
    () =>
      executeSemanticAuthority(bundle, {
        a: 0,
        e: 0,
        steps: 0,
        limit: 3,
        history: [],
        lookup: -1,
        historyEcho: -1
      }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "GUARDED_SWEEP_LIMIT_EXCEEDED"
  );
});

test("branching worklist closes and resolves a real 2-way-splitting queue deterministically", () => {
  const bundle = makeBranchingWorklistOntologyBundle();
  assert.deepEqual(inspectDeterministicOntology(bundle), {
    ontologyId: "branching-worklist-smoke",
    ontologyDisposition: "ONTOLOGY_AUTHORITY_CLOSED",
    findings: []
  });

  const result = executeSemanticAuthority(bundle, { lo: 0, width: 8, depth: 0 });
  assert.deepEqual(result, {
    resultType: "range-sequence-result",
    partition: {
      leafLo: [0, 5, 8, 13],
      leafWidth: [2, 2, 2, 2],
      priorCount: [0, 1, 2, 3]
    }
  });
});

test("branching worklist item ceiling fails closed when the queue cannot drain in time", () => {
  const declaration = makeBranchingWorklistSemanticAuthority();
  declaration.ontology.iterations[0].maxItems = 3;
  const bundle = projectBoundSemanticExecutionBundle(declaration);
  assert.throws(
    () => executeSemanticAuthority(bundle, { lo: 0, width: 8, depth: 0 }),
    (error) =>
      error instanceof SemanticExecutionDispositionError &&
      error.disposition === "RANGE_PARTITION_LIMIT_EXCEEDED"
  );
});

test("branching worklist maxItems ceiling above the runtime limit fails closed at validation", () => {
  const declaration = makeBranchingWorklistSemanticAuthority();
  declaration.ontology.iterations[0].maxItems = 9999;
  assert.equal(
    validateBoundSemanticExecutionAuthority(declaration).some(
      (finding) => finding.findingId === "ONTOLOGY_ITERATION_UNBOUNDED"
    ),
    true
  );
});
