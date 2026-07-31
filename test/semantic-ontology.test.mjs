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
      "graph-closure"
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
