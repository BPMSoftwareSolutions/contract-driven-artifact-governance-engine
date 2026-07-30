import { createHash } from "node:crypto";
import {
  SEMANTIC_RUNTIME_PROFILE,
  canonicalJsonBytes
} from "../../lib/governed-artifact-engine.mjs";

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(canonicalJsonBytes(value))
    .digest("hex")}`;
}

function boundSchema(schemaId, value) {
  return {
    schemaId,
    digest: digest(value),
    value
  };
}

function concept(conceptId, conceptType, schemaId, isA = []) {
  return {
    conceptId,
    conceptType,
    isA,
    abstract: schemaId === undefined,
    ...(schemaId ? { schemaId } : {})
  };
}

function binding(bindingId, semanticAuthorityId, executorPrimitive) {
  return { bindingId, semanticAuthorityId, executorPrimitive };
}

function node(nodeId, bindingId) {
  return { nodeId, bindingId };
}

function edge(edgeId, fromNodeId, fromPort, toNodeId, toPort) {
  return {
    edgeId,
    from: { nodeId: fromNodeId, port: fromPort },
    to: { nodeId: toNodeId, port: toPort }
  };
}

function observedValue(inputPort, type, value) {
  return {
    inputPort,
    observation: {
      state: "value",
      value: { type, value }
    }
  };
}

export function makeProviderNormalizationOntologyBundle() {
  const schemas = [
    boundSchema("openai-response.schema.v1", {
      type: "object",
      additionalProperties: true,
      required: ["model", "choices"],
      properties: {
        model: { type: "string" },
        choices: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: true,
            required: ["message", "finish_reason"],
            properties: {
              message: {
                type: "object",
                additionalProperties: true
              },
              finish_reason: { type: "string" }
            }
          }
        }
      }
    }),
    boundSchema("gemini-response.schema.v1", {
      type: "object",
      additionalProperties: true,
      required: ["modelVersion", "candidates"],
      properties: {
        modelVersion: { type: "string" },
        candidates: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: true,
            required: ["content", "finishReason"],
            properties: {
              content: {
                type: "object",
                additionalProperties: true
              },
              finishReason: { type: "string" }
            }
          }
        }
      }
    }),
    boundSchema("llamacpp-response.schema.v1", {
      type: "object",
      additionalProperties: false,
      required: [
        "model",
        "content",
        "stopped_eos",
        "stopped_limit",
        "stopped_word"
      ],
      properties: {
        model: { type: "string" },
        content: {},
        stopped_eos: { type: "boolean" },
        stopped_limit: { type: "boolean" },
        stopped_word: { type: "boolean" }
      }
    }),
    boundSchema("provider-variant-id.schema.v1", {
      type: "string",
      enum: [
        "openai-response",
        "gemini-response",
        "llamacpp-response"
      ]
    }),
    boundSchema("raw-finish-reason.schema.v1", {
      type: "string"
    }),
    boundSchema("canonical-finish-reason.schema.v1", {
      type: "string",
      enum: ["completed", "max-output-reached", "user-stop"]
    }),
    boundSchema("stop-flag.schema.v1", {
      type: "boolean"
    }),
    boundSchema("response-content.schema.v1", {
      type: "string"
    }),
    boundSchema("presence-state.schema.v1", {
      type: "string",
      enum: [
        "missing",
        "null",
        "empty-string",
        "invalid-type",
        "present"
      ]
    }),
    boundSchema("obligation-status.schema.v1", {
      type: "string",
      enum: ["satisfied", "violated"]
    }),
    boundSchema("result-status.schema.v1", {
      type: "string",
      enum: ["success", "failure"]
    }),
    boundSchema("provider-name.schema.v1", {
      type: "string",
      enum: ["openai", "gemini", "llama.cpp"]
    }),
    boundSchema("normalized-result-type.schema.v1", {
      type: "string",
      const: "normalized-response"
    }),
    boundSchema("normalization-failure-code.schema.v1", {
      type: "string",
      const: "RESPONSE_CONTENT_MISSING"
    }),
    boundSchema("normalized-success.schema.v1", {
      type: "object",
      additionalProperties: false,
      required: [
        "resultType",
        "status",
        "provider",
        "content",
        "finishReason"
      ],
      properties: {
        resultType: { const: "normalized-response" },
        status: { const: "success" },
        provider: { enum: ["openai", "gemini", "llama.cpp"] },
        content: { type: "string", minLength: 1 },
        finishReason: {
          enum: ["completed", "max-output-reached", "user-stop"]
        }
      }
    }),
    boundSchema("normalized-failure.schema.v1", {
      type: "object",
      additionalProperties: false,
      required: ["resultType", "status", "provider", "failure"],
      properties: {
        resultType: { const: "normalized-response" },
        status: { const: "failure" },
        provider: { enum: ["openai", "gemini", "llama.cpp"] },
        failure: {
          type: "object",
          additionalProperties: false,
          required: ["code"],
          properties: {
            code: { const: "RESPONSE_CONTENT_MISSING" }
          }
        }
      }
    })
  ];

  const concepts = [
    concept("provider-response", "domain-entity"),
    concept(
      "openai-response",
      "response-variant",
      "openai-response.schema.v1",
      ["provider-response"]
    ),
    concept(
      "gemini-response",
      "response-variant",
      "gemini-response.schema.v1",
      ["provider-response"]
    ),
    concept(
      "llamacpp-response",
      "response-variant",
      "llamacpp-response.schema.v1",
      ["provider-response"]
    ),
    concept(
      "provider-variant-id",
      "classification",
      "provider-variant-id.schema.v1"
    ),
    concept(
      "raw-finish-reason",
      "domain-value",
      "raw-finish-reason.schema.v1"
    ),
    concept(
      "canonical-finish-reason",
      "canonical-value",
      "canonical-finish-reason.schema.v1"
    ),
    concept("stop-flag", "observed-state", "stop-flag.schema.v1"),
    concept(
      "response-content",
      "domain-value",
      "response-content.schema.v1"
    ),
    concept("presence-state", "classification", "presence-state.schema.v1"),
    concept(
      "obligation-status",
      "signal",
      "obligation-status.schema.v1"
    ),
    concept("result-status", "result-discriminator", "result-status.schema.v1"),
    concept("provider-name", "canonical-value", "provider-name.schema.v1"),
    concept(
      "normalized-result-type",
      "canonical-value",
      "normalized-result-type.schema.v1"
    ),
    concept(
      "normalization-failure-code",
      "disposition",
      "normalization-failure-code.schema.v1"
    ),
    concept("normalized-response", "result-union"),
    concept(
      "normalized-success",
      "result",
      "normalized-success.schema.v1",
      ["normalized-response"]
    ),
    concept(
      "normalized-failure",
      "result",
      "normalized-failure.schema.v1",
      ["normalized-response"]
    )
  ];

  const properties = [
    {
      propertyId: "response-content-property",
      propertyKind: "observed",
      subjectConceptId: "provider-response",
      valueConceptId: "response-content",
      cardinality: "zero-or-one",
      resolutions: [
        {
          subjectVariantConceptId: "openai-response",
          path: ["choices", 0, "message", "content"]
        },
        {
          subjectVariantConceptId: "gemini-response",
          path: ["candidates", 0, "content", "parts", 0, "text"]
        },
        {
          subjectVariantConceptId: "llamacpp-response",
          path: ["content"]
        }
      ]
    },
    {
      propertyId: "raw-finish-reason-property",
      propertyKind: "observed",
      subjectConceptId: "provider-response",
      valueConceptId: "raw-finish-reason",
      cardinality: "zero-or-one",
      resolutions: [
        {
          subjectVariantConceptId: "openai-response",
          path: ["choices", 0, "finish_reason"]
        },
        {
          subjectVariantConceptId: "gemini-response",
          path: ["candidates", 0, "finishReason"]
        },
        {
          subjectVariantConceptId: "llamacpp-response",
          path: ["stop_reason"]
        }
      ]
    },
    ...[
      ["stopped-eos-property", "stopped_eos"],
      ["stopped-limit-property", "stopped_limit"],
      ["stopped-word-property", "stopped_word"]
    ].map(([propertyId, pathSegment]) => ({
      propertyId,
      propertyKind: "observed",
      subjectConceptId: "provider-response",
      valueConceptId: "stop-flag",
      cardinality: "zero-or-one",
      resolutions: [
        {
          subjectVariantConceptId: "openai-response",
          path: [pathSegment]
        },
        {
          subjectVariantConceptId: "gemini-response",
          path: [pathSegment]
        },
        {
          subjectVariantConceptId: "llamacpp-response",
          path: [pathSegment]
        }
      ]
    })),
    ...[
      ["canonical-result-type", "normalized-result-type"],
      ["canonical-status", "result-status"],
      ["canonical-provider", "provider-name"],
      ["canonical-content", "response-content"],
      ["canonical-finish-reason-property", "canonical-finish-reason"],
      ["canonical-failure-code", "normalization-failure-code"]
    ].map(([propertyId, valueConceptId]) => ({
      propertyId,
      propertyKind: "projected",
      subjectConceptId: "normalized-response",
      valueConceptId,
      cardinality: "exactly-one",
      resolutions: []
    }))
  ];

  const transformations = [
    {
      transformationId: "project-result-type",
      relationId: "result-type-projects-as-result-type",
      sourceAuthorityId: "normalized-result-type-fact",
      targetPropertyId: "canonical-result-type",
      outputPath: ["resultType"],
      valueConceptId: "normalized-result-type",
      resultIds: ["normalization-success", "normalization-failure"],
      unavailableDisposition: "RESULT_TYPE_UNAVAILABLE",
      invalidTypeDisposition: "RESULT_TYPE_INVALID"
    },
    {
      transformationId: "project-provider",
      relationId: "provider-name-projects-as-provider-name",
      sourceAuthorityId: "translate-provider-identity",
      targetPropertyId: "canonical-provider",
      outputPath: ["provider"],
      valueConceptId: "provider-name",
      resultIds: ["normalization-success", "normalization-failure"],
      unavailableDisposition: "PROVIDER_UNAVAILABLE",
      invalidTypeDisposition: "PROVIDER_INVALID"
    },
    {
      transformationId: "project-content",
      relationId: "response-content-projects-as-response-content",
      sourceAuthorityId: "response-content-property",
      targetPropertyId: "canonical-content",
      outputPath: ["content"],
      valueConceptId: "response-content",
      resultIds: ["normalization-success"],
      unavailableDisposition: "RESPONSE_CONTENT_MISSING",
      invalidTypeDisposition: "RESPONSE_CONTENT_INVALID"
    },
    {
      transformationId: "project-finish-reason",
      relationId: "finish-reason-projects-as-finish-reason",
      sourceAuthorityId: "classify-completion-state",
      targetPropertyId: "canonical-finish-reason-property",
      outputPath: ["finishReason"],
      valueConceptId: "canonical-finish-reason",
      resultIds: ["normalization-success"],
      unavailableDisposition: "FINISH_REASON_UNAVAILABLE",
      invalidTypeDisposition: "FINISH_REASON_INVALID"
    },
    {
      transformationId: "project-failure-code",
      relationId: "failure-code-projects-as-failure-code",
      sourceAuthorityId: "missing-content-failure-fact",
      targetPropertyId: "canonical-failure-code",
      outputPath: ["failure", "code"],
      valueConceptId: "normalization-failure-code",
      resultIds: ["normalization-failure"],
      unavailableDisposition: "FAILURE_CODE_UNAVAILABLE",
      invalidTypeDisposition: "FAILURE_CODE_INVALID"
    }
  ];

  const executionBindings = [
    binding("bind-input", "provider-response", "input.v1"),
    binding(
      "bind-provider-variant",
      "classify-provider-variant",
      "validate-variant.v1"
    ),
    binding(
      "bind-read-content",
      "response-content-property",
      "read-path.v1"
    ),
    binding(
      "bind-read-finish",
      "raw-finish-reason-property",
      "read-path.v1"
    ),
    binding(
      "bind-read-stopped-eos",
      "stopped-eos-property",
      "read-path.v1"
    ),
    binding(
      "bind-read-stopped-limit",
      "stopped-limit-property",
      "read-path.v1"
    ),
    binding(
      "bind-read-stopped-word",
      "stopped-word-property",
      "read-path.v1"
    ),
    binding(
      "bind-result-type-fact",
      "normalized-result-type-fact",
      "constant.v1"
    ),
    binding(
      "bind-failure-code-fact",
      "missing-content-failure-fact",
      "constant.v1"
    ),
    binding(
      "bind-content-state",
      "classify-content-state",
      "test-presence.v1"
    ),
    binding(
      "bind-provider-translation",
      "translate-provider-identity",
      "translate-value.v1"
    ),
    binding(
      "bind-completion-classification",
      "classify-completion-state",
      "classify-observations.v1"
    ),
    binding(
      "bind-content-obligation",
      "usable-content-obligation",
      "evaluate-obligation.v1"
    ),
    ...transformations.map((entry) =>
      binding(
        `bind-${entry.transformationId}`,
        entry.transformationId,
        "project-value.v1"
      )
    ),
    binding(
      "bind-result-selection",
      "normalization-result",
      "select-result.v1"
    ),
    binding(
      "bind-result-emission",
      "normalization-result",
      "emit-result.v1"
    ),
    binding(
      "bind-result-serialization",
      "normalization-result",
      "serialize-result.v1"
    )
  ];

  const nodes = [
    node("input", "bind-input"),
    node("variant", "bind-provider-variant"),
    node("content", "bind-read-content"),
    node("finish", "bind-read-finish"),
    node("stopped-eos", "bind-read-stopped-eos"),
    node("stopped-limit", "bind-read-stopped-limit"),
    node("stopped-word", "bind-read-stopped-word"),
    node("result-type-fact", "bind-result-type-fact"),
    node("failure-code-fact", "bind-failure-code-fact"),
    node("content-state", "bind-content-state"),
    node("provider-translation", "bind-provider-translation"),
    node("completion-classification", "bind-completion-classification"),
    node("content-obligation", "bind-content-obligation"),
    ...transformations.map((entry) =>
      node(entry.transformationId, `bind-${entry.transformationId}`)
    ),
    node("select-result", "bind-result-selection"),
    node("emit-result", "bind-result-emission"),
    node("serialize-result", "bind-result-serialization")
  ];

  const edges = [
    edge("input-to-variant", "input", "value", "variant", "source"),
    edge("input-to-content", "input", "value", "content", "source"),
    edge("variant-to-content", "variant", "conceptId", "content", "conceptId"),
    edge("input-to-finish", "input", "value", "finish", "source"),
    edge("variant-to-finish", "variant", "conceptId", "finish", "conceptId"),
    ...["stopped-eos", "stopped-limit", "stopped-word"].flatMap(
      (nodeId) => [
        edge(
          `input-to-${nodeId}`,
          "input",
          "value",
          nodeId,
          "source"
        ),
        edge(
          `variant-to-${nodeId}`,
          "variant",
          "conceptId",
          nodeId,
          "conceptId"
        )
      ]
    ),
    edge(
      "input-to-result-type-fact",
      "input",
      "value",
      "result-type-fact",
      "activation"
    ),
    edge(
      "input-to-failure-code-fact",
      "input",
      "value",
      "failure-code-fact",
      "activation"
    ),
    edge(
      "content-to-state",
      "content",
      "observation",
      "content-state",
      "observation"
    ),
    edge(
      "variant-to-provider-translation",
      "variant",
      "conceptId",
      "provider-translation",
      "observation"
    ),
    edge(
      "finish-to-completion-classification",
      "finish",
      "observation",
      "completion-classification",
      "finish-reason"
    ),
    edge(
      "stopped-eos-to-completion-classification",
      "stopped-eos",
      "observation",
      "completion-classification",
      "stopped-eos"
    ),
    edge(
      "stopped-limit-to-completion-classification",
      "stopped-limit",
      "observation",
      "completion-classification",
      "stopped-limit"
    ),
    edge(
      "stopped-word-to-completion-classification",
      "stopped-word",
      "observation",
      "completion-classification",
      "stopped-word"
    ),
    edge(
      "state-to-obligation",
      "content-state",
      "state",
      "content-obligation",
      "state"
    ),
    edge(
      "result-type-to-project",
      "result-type-fact",
      "value",
      "project-result-type",
      "value"
    ),
    edge(
      "provider-to-project",
      "provider-translation",
      "value",
      "project-provider",
      "value"
    ),
    edge(
      "content-to-project",
      "content",
      "observation",
      "project-content",
      "value"
    ),
    edge(
      "finish-to-project",
      "completion-classification",
      "state",
      "project-finish-reason",
      "value"
    ),
    edge(
      "failure-code-to-project",
      "failure-code-fact",
      "value",
      "project-failure-code",
      "value"
    ),
    edge(
      "obligation-to-selection",
      "content-obligation",
      "status",
      "select-result",
      "contentObligation"
    ),
    edge(
      "selection-to-emission",
      "select-result",
      "resultId",
      "emit-result",
      "selection"
    ),
    ...transformations.map((entry) =>
      edge(
        `${entry.transformationId}-to-emission`,
        entry.transformationId,
        "fragment",
        "emit-result",
        `fragment-${entry.transformationId}`
      )
    ),
    edge(
      "emission-to-serialization",
      "emit-result",
      "result",
      "serialize-result",
      "result"
    )
  ];

  return {
    bundleType: "semantic-execution-bundle.v1",
    bundleId: "provider-normalization.bundle.v1",
    authority: {
      authorityType: "deterministic-ontology-authority.v1",
      ontologyId: "provider-response-normalization",
      concepts,
      relations: [
        {
          relationId: "provider-normalizes-to-response",
          relationType: "normalizes-to",
          subjectConceptId: "provider-response",
          objectConceptId: "normalized-response",
          cardinality: "exactly-one"
        },
        {
          relationId: "finish-reason-translates-to-canonical",
          relationType: "translates-to",
          subjectConceptId: "raw-finish-reason",
          objectConceptId: "canonical-finish-reason",
          cardinality: "exactly-one"
        },
        {
          relationId: "result-type-projects-as-result-type",
          relationType: "projects-as",
          subjectConceptId: "normalized-result-type",
          objectConceptId: "normalized-result-type",
          cardinality: "exactly-one"
        },
        {
          relationId: "provider-name-projects-as-provider-name",
          relationType: "projects-as",
          subjectConceptId: "provider-name",
          objectConceptId: "provider-name",
          cardinality: "exactly-one"
        },
        {
          relationId: "response-content-projects-as-response-content",
          relationType: "projects-as",
          subjectConceptId: "response-content",
          objectConceptId: "response-content",
          cardinality: "exactly-one"
        },
        {
          relationId: "finish-reason-projects-as-finish-reason",
          relationType: "projects-as",
          subjectConceptId: "canonical-finish-reason",
          objectConceptId: "canonical-finish-reason",
          cardinality: "exactly-one"
        },
        {
          relationId: "failure-code-projects-as-failure-code",
          relationType: "projects-as",
          subjectConceptId: "normalization-failure-code",
          objectConceptId: "normalization-failure-code",
          cardinality: "exactly-one"
        }
      ],
      properties,
      facts: [
        {
          factId: "normalized-result-type-fact",
          conceptId: "normalized-result-type",
          value: { type: "string", value: "normalized-response" }
        },
        {
          factId: "missing-content-failure-fact",
          conceptId: "normalization-failure-code",
          value: { type: "string", value: "RESPONSE_CONTENT_MISSING" }
        }
      ],
      classifications: [
        {
          classificationId: "classify-provider-variant",
          classificationType: "concept-variant",
          subjectConceptId: "provider-response",
          resultConceptId: "provider-variant-id",
          variants: [
            "openai-response",
            "gemini-response",
            "llamacpp-response"
          ],
          noMatchDisposition: "UNSUPPORTED_RESPONSE_VARIANT",
          multipleMatchDisposition: "AMBIGUOUS_RESPONSE_VARIANT"
        },
        {
          classificationId: "classify-content-state",
          classificationType: "property-state",
          propertyId: "response-content-property",
          resultConceptId: "presence-state",
          expectedValueType: "string",
          emptyStringState: "empty-string",
          states: [
            "missing",
            "null",
            "empty-string",
            "invalid-type",
            "present"
          ]
        },
        {
          classificationId: "classify-completion-state",
          classificationType: "multi-observation",
          subjectConceptId: "provider-response",
          resultConceptId: "canonical-finish-reason",
          observations: [
            {
              inputPort: "finish-reason",
              propertyId: "raw-finish-reason-property"
            },
            {
              inputPort: "stopped-eos",
              propertyId: "stopped-eos-property"
            },
            {
              inputPort: "stopped-limit",
              propertyId: "stopped-limit-property"
            },
            {
              inputPort: "stopped-word",
              propertyId: "stopped-word-property"
            }
          ],
          cases: [
            {
              caseId: "openai-stop-completed",
              when: [observedValue("finish-reason", "string", "stop")],
              emit: { type: "string", value: "completed" }
            },
            {
              caseId: "openai-length-limited",
              when: [observedValue("finish-reason", "string", "length")],
              emit: { type: "string", value: "max-output-reached" }
            },
            {
              caseId: "gemini-stop-completed",
              when: [observedValue("finish-reason", "string", "STOP")],
              emit: { type: "string", value: "completed" }
            },
            {
              caseId: "gemini-max-tokens-limited",
              when: [
                observedValue("finish-reason", "string", "MAX_TOKENS")
              ],
              emit: { type: "string", value: "max-output-reached" }
            },
            {
              caseId: "llamacpp-eos-completed",
              when: [observedValue("stopped-eos", "boolean", true)],
              emit: { type: "string", value: "completed" }
            },
            {
              caseId: "llamacpp-limit-reached",
              when: [observedValue("stopped-limit", "boolean", true)],
              emit: { type: "string", value: "max-output-reached" }
            },
            {
              caseId: "llamacpp-stop-word",
              when: [observedValue("stopped-word", "boolean", true)],
              emit: { type: "string", value: "user-stop" }
            }
          ],
          noMatchDisposition: "UNKNOWN_COMPLETION_STATE",
          multipleMatchDisposition: "AMBIGUOUS_COMPLETION_STATE"
        }
      ],
      constraints: [
        {
          constraintId: "one-provider-variant",
          constraintType: "exactly-one-variant",
          subjectAuthorityIds: ["classify-provider-variant"],
          requiredDisposition: "ONTOLOGY_AUTHORITY_CLOSED"
        },
        {
          constraintId: "content-obligation-total",
          constraintType: "obligation-total",
          subjectAuthorityIds: ["usable-content-obligation"],
          requiredDisposition: "ONTOLOGY_AUTHORITY_CLOSED"
        },
        {
          constraintId: "completion-classification-total",
          constraintType: "classification-total",
          subjectAuthorityIds: ["classify-completion-state"],
          requiredDisposition: "ONTOLOGY_AUTHORITY_CLOSED"
        },
        {
          constraintId: "result-discrimination-total",
          constraintType: "result-discrimination",
          subjectAuthorityIds: ["normalization-result"],
          requiredDisposition: "ONTOLOGY_AUTHORITY_CLOSED"
        }
      ],
      translations: [
        {
          translationId: "translate-provider-identity",
          sourceConceptId: "provider-variant-id",
          targetConceptId: "provider-name",
          cases: [
            {
              source: { type: "string", value: "openai-response" },
              target: { type: "string", value: "openai" }
            },
            {
              source: { type: "string", value: "gemini-response" },
              target: { type: "string", value: "gemini" }
            },
            {
              source: { type: "string", value: "llamacpp-response" },
              target: { type: "string", value: "llama.cpp" }
            }
          ],
          unmappedDisposition: "UNKNOWN_PROVIDER_IDENTITY"
        }
      ],
      obligations: [
        {
          obligationId: "usable-content-obligation",
          subjectConceptId: "provider-response",
          classificationId: "classify-content-state",
          resultConceptId: "obligation-status",
          satisfiedStateIds: ["present"],
          failureDisposition: "RESPONSE_CONTENT_MISSING"
        }
      ],
      transformations,
      results: [
        {
          resultUnionId: "normalization-result",
          resultTypeConceptId: "normalized-response",
          members: [
            {
              resultId: "normalization-success",
              conceptId: "normalized-success",
              discriminator: {
                propertyId: "canonical-status",
                outputPath: ["status"],
                value: { type: "string", value: "success" }
              }
            },
            {
              resultId: "normalization-failure",
              conceptId: "normalized-failure",
              discriminator: {
                propertyId: "canonical-status",
                outputPath: ["status"],
                value: { type: "string", value: "failure" }
              }
            }
          ],
          selectionRules: [
            {
              ruleId: "content-satisfied",
              when: [
                {
                  inputPort: "contentObligation",
                  obligationId: "usable-content-obligation",
                  status: "satisfied"
                }
              ],
              resultId: "normalization-success"
            },
            {
              ruleId: "content-violated",
              when: [
                {
                  inputPort: "contentObligation",
                  obligationId: "usable-content-obligation",
                  status: "violated"
                }
              ],
              resultId: "normalization-failure"
            }
          ],
          noMatchDisposition: "RESULT_SELECTION_NOT_TOTAL",
          multipleMatchDisposition: "RESULT_SELECTION_AMBIGUOUS",
          invalidResultDisposition: "NORMALIZATION_RESULT_INVALID",
          serializerId: "identity.v1"
        }
      ],
      executionBindings,
      executionGraph: {
        entryNodeId: "input",
        terminalNodeIds: ["serialize-result"],
        nodes,
        edges
      },
      proofRequirements: [
        "reference-closure",
        "type-closure",
        "cardinality-closure",
        "classification-totality",
        "translation-totality",
        "obligation-binding",
        "result-discrimination",
        "execution-binding",
        "graph-closure"
      ].map((proofType) => ({
        requirementId: `prove-${proofType}`,
        proofType,
        subjectAuthorityId: "provider-response-normalization",
        requiredDisposition: "ONTOLOGY_AUTHORITY_CLOSED"
      }))
    },
    schemas,
    catalogs: [],
    runtimeProfile: structuredClone(SEMANTIC_RUNTIME_PROFILE)
  };
}
