import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(await readFile(new URL("../schemas/executable-mechanic-authority.schema.json", import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true, strictTypes: false });
const validate = ajv.compile(schema);

const variants = Object.freeze([
  ["branch", { authorityKind: "decision-authority.v1", inputs: ["input"], rules: [{ ruleId: "rule", inputId: "input", outcomeId: "matched" }], outcomes: [{ outcomeId: "matched", outputId: "result", disposition: "MATCHED" }], noMatchDisposition: "DECISION_NOT_RESOLVED" }],
  ["iteration", { authorityKind: "iteration-authority.v1", collectionInputId: "items", itemBindingId: "item", ordering: "ascending", continuation: "CONTINUE", termination: "COMPLETE" }],
  ["exception-handling", { authorityKind: "failure-observation-authority.v1", observedFailures: [{ failureId: "error", operationId: "execute" }], dispositions: [{ failureId: "error", disposition: "FAIL" }], unhandledDisposition: "UNHANDLED" }],
  ["throw", { authorityKind: "terminal-disposition-authority.v1", terminalDisposition: "REJECTED", resultOutputId: "result" }],
  ["object-construction", { authorityKind: "semantic-projection-authority.v1", projectionId: "project-result", fieldMappings: [{ inputId: "input", outputId: "result" }], unmappedFieldDisposition: "REJECT" }],
  ["serialization", { authorityKind: "serialization-profile-authority.v1", profileId: "json-v1", mediaType: "application/json", encoding: "utf-8", rules: [{ ruleId: "canonical-json", operation: "canonicalize" }] }],
  ["normalization", { authorityKind: "canonicalization-authority.v1", inputId: "input", outputId: "result", operations: [{ operationId: "trim", operation: "trim" }], ambiguityDisposition: "REJECT" }],
  ["validation", { authorityKind: "constraint-authority.v1", inputIds: ["input"], constraints: [{ constraintId: "non-empty", inputId: "input", operator: "non-empty" }], validOutcome: "VALID", invalidOutcome: "INVALID" }],
  ["fallback", { authorityKind: "alternative-selection-authority.v1", alternatives: [{ alternativeId: "primary", operationId: "execute" }, { alternativeId: "secondary", operationId: "execute" }], selectionOrder: ["primary", "secondary"], exhaustedDisposition: "NO_ALTERNATIVE" }],
  ["retry", { authorityKind: "retry-policy-authority.v1", operationId: "execute", maximumAttempts: 3, retryableDispositions: ["TRANSIENT_FAILURE"], backoff: { strategy: "none", delayMs: 0 }, exhaustedDisposition: "RETRY_EXHAUSTED" }],
  ["state-mutation", { authorityKind: "state-transition-authority.v1", stateId: "request-state", fromStates: ["PENDING"], transitions: [{ transitionId: "complete", fromState: "PENDING", toState: "COMPLETE" }], guards: [{ guardId: "result-valid", inputId: "input" }], effectId: "execute" }],
  ["meaning-hidden-in-text", { authorityKind: "text-meaning-authority.v1", vocabularyId: "route-vocabulary", meanings: [{ token: "GET", disposition: "READ" }], templates: [{ templateId: "method-path", pattern: "{method} {path}" }], unknownTextDisposition: "TEXT_NOT_ADMITTED" }]
]);

function envelope(mechanicKind, authority) {
  return {
    authorityType: "executable-mechanic-authority.v1",
    mechanicAuthorityId: `authority-${mechanicKind}`,
    mechanicKind,
    lineage: { featureId: "feature", scenarioId: "scenario", obligationId: "obligation", responsibilityId: "responsibility", artifactId: "artifact" },
    semanticSubject: { subjectId: `subject-${mechanicKind}`, purpose: "Declare one mechanic meaning." },
    inputs: [{ valueId: "input", conceptId: "input-concept", required: true }],
    authority: structuredClone(authority),
    outputs: [{ valueId: "result", conceptId: "result-concept", required: true }],
    execution: { origin: "authority-first", sequence: 1, operations: [{ stepId: "execute", operation: "invoke-semantic" }] },
    proof: { requirementIds: ["mechanic-equivalence"] },
    sourceEvidence: [],
    lifecycle: { status: "admitted", admissionDisposition: "AUTHORITY_ADMITTED" }
  };
}

test("all twelve executable mechanic authority kinds validate as closed admitted envelopes", () => {
  for (const [mechanicKind, authority] of variants) {
    const candidate = envelope(mechanicKind, authority);
    assert.equal(validate(candidate), true, `${mechanicKind}: ${ajv.errorsText(validate.errors)}`);
  }
});

test("the envelope rejects missing semantics, kind mismatch, invalid admission, evidence mismatch, and unknown authority fields", () => {
  const valid = envelope(...variants[0]);
  const controls = [
    (() => { const value = structuredClone(valid); delete value.authority.rules; return value; })(),
    (() => { const value = structuredClone(valid); value.mechanicKind = "retry"; return value; })(),
    (() => { const value = structuredClone(valid); value.lifecycle.status = "proposed"; return value; })(),
    (() => { const value = structuredClone(valid); value.authority.undeclaredMeaning = true; return value; })(),
    (() => { const value = structuredClone(valid); value.execution.origin = "observed-source"; value.sourceEvidence = []; return value; })()
  ];
  for (const control of controls) assert.equal(validate(control), false);
});

test("nested authority semantics reject nulls and arbitrary objects", () => {
  const controls = [
    (() => { const value = envelope(...variants[0]); value.authority.inputs = [null]; return value; })(),
    (() => { const value = envelope(...variants[0]); value.authority.rules = [null]; return value; })(),
    (() => { const value = envelope(...variants[0]); value.authority.outcomes = [{}]; return value; })()
  ];
  for (const control of controls) assert.equal(validate(control), false);
});

test("observed-source authority requires exact evidence whose mechanic kind agrees with the envelope", () => {
  const candidate = envelope(...variants[0]);
  candidate.execution.origin = "observed-source";
  candidate.sourceEvidence = [{
    sourceFactIndexId: `sha256:${"1".repeat(64)}`,
    rootId: "workspace-root",
    mechanicOccurrenceId: `sha256:${"2".repeat(64)}`,
    sourceReferenceId: "src/file.js:1:1",
    sourceFileDigest: `sha256:${"3".repeat(64)}`,
    observedMechanicKind: "branch"
  }];
  assert.equal(validate(candidate), true, ajv.errorsText(validate.errors));
  candidate.sourceEvidence[0].observedMechanicKind = "retry";
  assert.equal(validate(candidate), true, "schema preserves the observed kind; engine closure evaluates agreement");
});
