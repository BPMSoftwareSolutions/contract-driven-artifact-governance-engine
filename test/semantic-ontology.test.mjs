import assert from "node:assert/strict";
import test from "node:test";
import {
  SemanticExecutionDispositionError,
  executeSemanticAuthority,
  inspectDeterministicOntology,
  validateSemanticExecutionBundle
} from "../lib/governed-artifact-engine.mjs";
import { makeProviderNormalizationOntologyBundle } from "./fixtures/provider-normalization-ontology.mjs";

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

test("the provider ontology is closed and executes both admitted variants", () => {
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

test("variant and translation failures emit their exact dispositions", () => {
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
      error.disposition === "UNKNOWN_FINISH_REASON"
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
          from: { nodeId: "serialize-result", port: "result" },
          to: { nodeId: "variant", port: "cycle" }
        });
      }
    },
    {
      findingId: "ONTOLOGY_GRAPH_ORPHAN_NODE",
      mutate(bundle) {
        bundle.authority.executionGraph.edges =
          bundle.authority.executionGraph.edges.filter(
            (entry) => entry.edgeId !== "input-to-result-type-fact"
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
          (entry) => entry.edgeId === "provider-to-project"
        );
        const finishEdge = bundle.authority.executionGraph.edges.find(
          (entry) => entry.edgeId === "finish-to-project"
        );
        [
          providerEdge.from.nodeId,
          finishEdge.from.nodeId
        ] = [
          finishEdge.from.nodeId,
          providerEdge.from.nodeId
        ];
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
