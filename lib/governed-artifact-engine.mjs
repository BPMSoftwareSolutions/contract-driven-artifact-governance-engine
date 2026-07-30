import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import { SyntaxKind, formatSyntaxKind } from "typescript/unstable/ast";
import { createScanner } from "typescript/unstable/ast/scanner";
import {
  SEMANTIC_RUNTIME_PROFILE,
  SemanticExecutionDispositionError,
  executeSemanticAuthority,
  inspectDeterministicOntology,
  validateSemanticExecutionBundle
} from "./semantic-execution-runtime.mjs";

export {
  SEMANTIC_RUNTIME_PROFILE,
  SemanticExecutionDispositionError,
  executeSemanticAuthority,
  inspectDeterministicOntology,
  validateSemanticExecutionBundle
};

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULT_SCHEMA_PATH = path.join(
  packageRoot,
  "schemas",
  "governed-artifact-contract.schema.json"
);
export const DEFAULT_PROJECTOR_REGISTRY_PATH = path.join(
  packageRoot,
  "registries",
  "projector-registry.json"
);
export const DEFAULT_VERIFIER_REGISTRY_PATH = path.join(
  packageRoot,
  "registries",
  "verifier-registry.json"
);
export const DEFAULT_CONFORMANCE_PROFILE_PATH = path.join(
  packageRoot,
  "profiles",
  "closed-world-artifact-conformance.v4.json"
);
export const DEFAULT_MIGRATION_REGISTRY_PATH = path.join(
  packageRoot,
  "registries",
  "migration-registry.json"
);
export const DEFAULT_SCHEMA_CATALOG_PATH = path.join(
  packageRoot,
  "schemas",
  "schema-catalog.json"
);
export const DEFAULT_ENGINE_PATH = fileURLToPath(import.meta.url);
export const ENGINE_IDENTITY = "governed-artifact-engine.0.10.0";

const ENGINE_EVALUATION_ORDER = [
  "validate-contract",
  "resolve-artifact-plan",
  "observe-artifact-state",
  "evaluate-artifact-inventory",
  "evaluate-projection-identity",
  "evaluate-authority-closure",
  "evaluate-ontology-authority",
  "evaluate-semantic-execution-bodies",
  "evaluate-artifact-content",
  "evaluate-artifact-structure",
  "evaluate-artifact-freshness",
  "evaluate-artifact-relationships",
  "evaluate-declared-commands",
  "verify-proof-subject-stability",
  "issue-trust-disposition"
];

const knownProjectors = new Map([
  ["canonical-json-value-projector.v1", projectCanonicalJson],
  [
    "deterministic-ontology-documentation-projector.v1",
    projectDeterministicOntologyDocumentation
  ],
  [
    "deterministic-ontology-schema-projector.v1",
    projectDeterministicOntologySchema
  ],
  [
    "governed-artifact-contract-markdown-projector.v1",
    projectContractMarkdown
  ],
  ["utf8-text-projector.v1", projectUtf8Text],
  ["lossless-source-token-projector.v1", projectSourceTokens]
]);

const knownVerifierIds = new Set([
  "artifact-inventory-verifier.v1",
  "authority-closure-verifier.v1",
  "command-exit-verifier.v1",
  "content-digest-verifier.v1",
  "forbidden-text-verifier.v1",
  "json-meta-schema-verifier.v1",
  "markdown-section-verifier.v1",
  "relationship-verifier.v1",
  "source-token-structure-verifier.v1"
]);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

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

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value), null, 2)}\n`, "utf8");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} could not be read as JSON: ${error.message}`);
  }
}

function profileInvalid(detail) {
  return contractInvalid([
    {
      findingId: "conformance-profile",
      detail
    }
  ]);
}

function validateConformanceProfile(profile) {
  const requiredObjectPaths = [
    ["artifactPosture"],
    ["authorityClosure"],
    ["claimPrerequisites"],
    ["conformance"],
    ["conformance", "terminalDispositions"],
    ["operationAuthorities"],
    ["operationAuthorities", "bodyPurity"],
    ["operationAuthorities", "bodyPurity", "exactCardinality"],
    ["operationAuthorities", "migration"],
    ["operationAuthorities", "mutationAuthority"],
    [
      "operationAuthorities",
      "mutationAuthority",
      "consumerAuthoredAuthority"
    ],
    [
      "operationAuthorities",
      "mutationAuthority",
      "controlEvidenceMutation"
    ],
    [
      "operationAuthorities",
      "mutationAuthority",
      "derivedContractMutation"
    ],
    [
      "operationAuthorities",
      "mutationAuthority",
      "governedArtifactMutation"
    ],
    ["operationAuthorities", "projection"],
    ["operationAuthorities", "proof"],
    ["operationAuthorities", "reconciliation"],
    ["projectionLedger"],
    ["receipt"]
  ];
  for (const segments of requiredObjectPaths) {
    let value = profile;
    for (const segment of segments) {
      value = value?.[segment];
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return `Required profile object is missing: ${segments.join(".")}`;
    }
  }
  if (
    profile.profileType !== "governed-artifact-conformance-profile.v4" ||
    typeof profile.profileId !== "string" ||
    profile.artifactPosture.ownership !== "contract-owned" ||
    profile.artifactPosture.mutabilityPosture !==
      "replace-by-projection" ||
    profile.artifactPosture.projectionMode !== "projected" ||
    profile.artifactPosture.contentDigestRequired !== true ||
    profile.conformance.failClosed !== true ||
    profile.authorityClosure.resolution?.ambientAuthority !==
      "forbidden" ||
    profile.authorityClosure.resolution?.cardinality !== "exactly-one" ||
    Object.values(profile.authorityClosure.coverage ?? {}).some(
      (disposition) => disposition !== "exact"
    ) ||
    profile.claimPrerequisites.requiredConformanceDisposition !==
      "CONTRACT_AUTHORITY_CLOSED" ||
    profile.claimPrerequisites.requiredAuthorityClosureDisposition !==
      "ARTIFACT_AUTHORITY_CLOSED" ||
    profile.claimPrerequisites.requiredScopeDisposition !==
      "ARTIFACT_SCOPE_CLOSED" ||
    profile.claimPrerequisites.requiredProofDisposition !==
      "PROOF_COMPLETE" ||
    profile.claimPrerequisites.requiredTrustDisposition !== "TRUSTED" ||
    !Array.isArray(profile.conformance.evaluationOrder) ||
    JSON.stringify(profile.conformance.evaluationOrder) !==
      JSON.stringify(ENGINE_EVALUATION_ORDER) ||
    !Array.isArray(profile.receipt.requiredEvidence) ||
    !Array.isArray(profile.projectionLedger.requiredEvidence)
  ) {
    return "The profile declares an unsupported protocol posture.";
  }
  const operationAuthorities = profile.operationAuthorities;
  const bodyPurity = operationAuthorities.bodyPurity;
  const mutationAuthority = operationAuthorities.mutationAuthority;
  if (
    operationAuthorities.projection.operation !== "project" ||
    operationAuthorities.proof.operation !== "prove" ||
    operationAuthorities.reconciliation.operation !== "reconcile" ||
    operationAuthorities.migration.operation !== "migrate" ||
    operationAuthorities.reconciliation.artifactProjection !==
      "forbidden" ||
    operationAuthorities.reconciliation.trustIssuance !== "forbidden" ||
    operationAuthorities.migration.artifactProjection !== "forbidden" ||
    operationAuthorities.migration.trustIssuance !== "forbidden" ||
    operationAuthorities.proof.subjectMutation !== "forbidden" ||
    bodyPurity.profileType !== "semantic-execution-body.v2" ||
    bodyPurity.applicability !==
      "artifacts-bound-to-semantic-authority-executor-port" ||
    bodyPurity.executionPortEffect !== "execute-semantic-authority" ||
    JSON.stringify(bodyPurity.admittedAuthorityTypes) !==
      JSON.stringify([
        "semantic-projection-authority.v1",
        "semantic-execution-bundle.v1"
      ]) ||
    bodyPurity.consumerRelaxation !== "forbidden" ||
    bodyPurity.semanticAuthorityLocation !== "contract" ||
    JSON.stringify(bodyPurity.allowedExecutableForms) !==
      JSON.stringify([
        "single-semantic-invocation",
        "direct-return",
        "declared-port-binding"
      ]) ||
    bodyPurity.exactCardinality.exportedResponsibilities !== 1 ||
    bodyPurity.exactCardinality.resultFlows !== 1 ||
    bodyPurity.exactCardinality.semanticInvocations !== 1 ||
    JSON.stringify(bodyPurity.forbiddenExecutableMechanics) !==
      JSON.stringify([
        "branch",
        "iteration",
        "exception-handling",
        "throw",
        "object-construction",
        "serialization",
        "normalization",
        "validation",
        "fallback",
        "retry",
        "state-mutation"
      ]) ||
    mutationAuthority.authorityType !==
      "single-source-mutation-authority.v1" ||
    mutationAuthority.consumerAuthoredAuthority.cardinality !==
      "exactly-one" ||
    mutationAuthority.consumerAuthoredAuthority.source !== "contract" ||
    mutationAuthority.consumerAuthoredAuthority.target !== "contract" ||
    mutationAuthority.governedArtifactMutation.authoritySource !==
      "validated-contract" ||
    mutationAuthority.governedArtifactMutation.interpretationBase !==
      "digest-bound" ||
    mutationAuthority.governedArtifactMutation.create !==
      "declared-projections-only" ||
    mutationAuthority.governedArtifactMutation.replace !==
      "declared-projections-only" ||
    mutationAuthority.governedArtifactMutation.remove !== "forbidden" ||
    mutationAuthority.governedArtifactMutation.undeclaredState !==
      "observe-and-reject" ||
    mutationAuthority.controlEvidenceMutation.createOrReplace !==
      "contract-declared-control-paths-only" ||
    mutationAuthority.controlEvidenceMutation.remove !== "forbidden" ||
    mutationAuthority.derivedContractMutation.target !== "contract" ||
    JSON.stringify(
      mutationAuthority.derivedContractMutation.admittedOperations
    ) !== JSON.stringify(["migrate", "reconcile"])
  ) {
    return "The profile weakens an operation boundary.";
  }
  return null;
}

function applyConformanceProfile(contract, profile) {
  const effective = structuredClone(contract);
  effective.schema = structuredClone(contract.interpretationBase.schema);
  effective.projectorRegistry = structuredClone(
    contract.interpretationBase.projectorRegistry
  );
  effective.verifierRegistry = structuredClone(
    contract.interpretationBase.verifierRegistry
  );
  effective.conformanceProfile = structuredClone(
    contract.interpretationBase.conformanceProfile
  );
  effective.migrationRegistry = structuredClone(
    contract.interpretationBase.migrationRegistry
  );
  effective.authorityClosure = structuredClone(profile.authorityClosure);
  effective.operationAuthorities = structuredClone(
    profile.operationAuthorities
  );
  effective.conformance = {
    ...structuredClone(profile.conformance),
    artifactEvaluations: structuredClone(
      contract.conformance.artifactEvaluations
    )
  };
  effective.receipt = {
    ...structuredClone(profile.receipt),
    relativePath: contract.receipt.relativePath
  };
  effective.projectionLedger = {
    ...structuredClone(profile.projectionLedger),
    relativePath: contract.projectionLedger.relativePath
  };
  effective.artifacts = contract.artifacts.map((artifact) => ({
    ...structuredClone(artifact),
    ownership: profile.artifactPosture.ownership,
    mutabilityPosture: profile.artifactPosture.mutabilityPosture,
    projection: {
      ...structuredClone(artifact.projection),
      mode: profile.artifactPosture.projectionMode
    },
    proof: {
      ...structuredClone(artifact.proof),
      contentDigestRequired:
        profile.artifactPosture.contentDigestRequired
    }
  }));
  effective.claims = contract.claims.map((claim) => ({
    ...structuredClone(claim),
    ...structuredClone(profile.claimPrerequisites)
  }));
  return effective;
}

function writeCanonicalJsonAtomically(filePath, value) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${randomUUID()}.tmp`
  );
  writeFileSync(temporaryPath, canonicalJsonBytes(value), { flag: "wx" });
  renameSync(temporaryPath, filePath);
}

function jsonPointerEscape(value) {
  return String(value).replace(/~/g, "~0").replace(/\//g, "~1");
}

function changedJsonPointers(before, after, pointer = "") {
  if (Object.is(before, after)) {
    return [];
  }
  const beforeObject =
    before !== null && typeof before === "object";
  const afterObject =
    after !== null && typeof after === "object";
  if (!beforeObject || !afterObject || Array.isArray(before) !== Array.isArray(after)) {
    return [pointer || "/"];
  }
  const keys = new Set([
    ...Object.keys(before),
    ...Object.keys(after)
  ]);
  const pointers = [];
  for (const key of [...keys].sort()) {
    const childPointer = `${pointer}/${jsonPointerEscape(key)}`;
    if (
      !Object.prototype.hasOwnProperty.call(before, key) ||
      !Object.prototype.hasOwnProperty.call(after, key)
    ) {
      pointers.push(childPointer);
      continue;
    }
    pointers.push(
      ...changedJsonPointers(before[key], after[key], childPointer)
    );
  }
  return pointers;
}

function decodeJsonPointer(pointer) {
  if (pointer === "/") {
    return [];
  }
  return pointer
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function jsonPointerValue(document, pointer) {
  let value = document;
  for (const segment of decodeJsonPointer(pointer)) {
    value = value?.[segment];
  }
  return value;
}

function hasJsonPointer(document, pointer) {
  const segments = decodeJsonPointer(pointer);
  if (segments.length === 0) {
    return true;
  }
  let value = document;
  for (const segment of segments) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.prototype.hasOwnProperty.call(value, segment)
    ) {
      return false;
    }
    value = value[segment];
  }
  return true;
}

function exactJsonDiff(before, after) {
  return changedJsonPointers(before, after).map((pointer) => {
    const existedBefore = hasJsonPointer(before, pointer);
    const existsAfter = hasJsonPointer(after, pointer);
    return {
      operation: !existedBefore
        ? "add"
        : !existsAfter
          ? "remove"
          : "replace",
      path: pointer,
      ...(existedBefore
        ? { before: structuredClone(jsonPointerValue(before, pointer)) }
        : {}),
      ...(existsAfter
        ? { after: structuredClone(jsonPointerValue(after, pointer)) }
        : {})
    };
  });
}

function projectCanonicalJson(authority) {
  if (authority.authorityType !== "canonical-json-value.v1") {
    throw new Error("Projector authority type does not match its registry declaration.");
  }
  return canonicalJsonBytes(authority.value);
}

function resolveOntologyProjectionSubject(authority, context, projectionKind) {
  if (
    authority.authorityType !== "canonical-json-value.v1" ||
    authority.value?.authorityType !==
      "deterministic-ontology-projection.v1" ||
    authority.value.projectionKind !== projectionKind
  ) {
    throw new Error("Deterministic ontology projection authority is invalid.");
  }
  const bundleArtifact = context.contract.artifacts.find(
    (artifact) =>
      artifact.artifactId === authority.value.bundleArtifactId &&
      artifact.artifactKind === "deterministic-ontology-bundle" &&
      artifact.projection.authority.authorityType ===
        "canonical-json-value.v1" &&
      artifact.projection.authority.value?.bundleType ===
        "semantic-execution-bundle.v1"
  );
  if (!bundleArtifact) {
    throw new Error("Deterministic ontology bundle is unresolved.");
  }
  const bundle = bundleArtifact.projection.authority.value;
  if (validateSemanticExecutionBundle(bundle).length > 0) {
    throw new Error("Deterministic ontology bundle is not closed.");
  }
  return { bundleArtifact, bundle };
}

function projectDeterministicOntologySchema(authority, context) {
  const { bundle } = resolveOntologyProjectionSubject(
    authority,
    context,
    "bound-schema"
  );
  const schemas = bundle.schemas.filter(
    (schema) => schema.schemaId === authority.value.subjectId
  );
  if (schemas.length !== 1) {
    throw new Error("Deterministic ontology schema subject is not exact.");
  }
  return canonicalJsonBytes(schemas[0].value);
}

function ontologyMarkdownRows(entries, identityField, describe) {
  return entries
    .slice()
    .sort((left, right) =>
      left[identityField].localeCompare(right[identityField])
    )
    .map(
      (entry) =>
        `| ${markdownCode(entry[identityField])} | ${describe(entry)} |`
    );
}

function projectDeterministicOntologyDocumentation(authority, context) {
  const { bundle } = resolveOntologyProjectionSubject(
    authority,
    context,
    "ontology-documentation"
  );
  if (authority.value.subjectId !== bundle.authority.ontologyId) {
    throw new Error("Deterministic ontology documentation subject is not exact.");
  }
  const ontology = bundle.authority;
  const sections = [
    `# Deterministic Ontology: ${ontology.ontologyId}`,
    "",
    `> Bundle: ${markdownCode(bundle.bundleId)} | Runtime: ${markdownCode(bundle.runtimeProfile.identity)} | Disposition: ${markdownCode("ONTOLOGY_AUTHORITY_CLOSED")}`,
    "",
    "## Concepts",
    "",
    "| Concept | Meaning |",
    "| --- | --- |",
    ...ontologyMarkdownRows(
      ontology.concepts,
      "conceptId",
      (entry) =>
        `${markdownCode(entry.conceptType)}; is-a ${
          entry.isA.length === 0
            ? markdownCode("<root>")
            : entry.isA.map(markdownCode).join(", ")
        }; ${entry.abstract ? "abstract" : markdownCode(entry.schemaId)}`
    ),
    "",
    "## Relationships",
    "",
    "| Relation | Meaning |",
    "| --- | --- |",
    ...ontologyMarkdownRows(
      ontology.relations,
      "relationId",
      (entry) =>
        `${markdownCode(entry.subjectConceptId)} ${markdownCode(entry.relationType)} ${markdownCode(entry.objectConceptId)} (${markdownCode(entry.cardinality)})`
    ),
    "",
    "## Properties and Classifications",
    "",
    "| Authority | Meaning |",
    "| --- | --- |",
    ...ontologyMarkdownRows(
      ontology.properties,
      "propertyId",
      (entry) =>
        `${markdownCode(entry.subjectConceptId)} → ${markdownCode(entry.valueConceptId)} (${markdownCode(entry.propertyKind)})`
    ),
    ...ontologyMarkdownRows(
      ontology.classifications,
      "classificationId",
      (entry) =>
        `${markdownCode(entry.classificationType)} → ${markdownCode(entry.resultConceptId)}`
    ),
    "",
    "## Constraints and Obligations",
    "",
    "| Authority | Meaning |",
    "| --- | --- |",
    ...ontologyMarkdownRows(
      ontology.constraints,
      "constraintId",
      (entry) =>
        `${markdownCode(entry.constraintType)} requires ${markdownCode(entry.requiredDisposition)}`
    ),
    ...ontologyMarkdownRows(
      ontology.obligations,
      "obligationId",
      (entry) =>
        `${markdownCode(entry.classificationId)}; failure ${markdownCode(entry.failureDisposition)}`
    ),
    "",
    "## Transformations and Results",
    "",
    "| Authority | Meaning |",
    "| --- | --- |",
    ...ontologyMarkdownRows(
      ontology.translations,
      "translationId",
      (entry) =>
        `${markdownCode(entry.sourceConceptId)} → ${markdownCode(entry.targetConceptId)}; ${entry.cases.length} typed cases`
    ),
    ...ontologyMarkdownRows(
      ontology.transformations,
      "transformationId",
      (entry) =>
        `${markdownCode(entry.sourceAuthorityId)} → ${markdownCode(entry.targetPropertyId)}`
    ),
    ...ontologyMarkdownRows(
      ontology.results,
      "resultUnionId",
      (entry) =>
        `${entry.members.length} discriminated members; ${markdownCode(entry.serializerId)}`
    ),
    "",
    "## Execution Bindings",
    "",
    "| Binding | Meaning |",
    "| --- | --- |",
    ...ontologyMarkdownRows(
      ontology.executionBindings,
      "bindingId",
      (entry) =>
        `${markdownCode(entry.semanticAuthorityId)} → ${markdownCode(entry.executorPrimitive)}`
    ),
    "",
    "## Proof Requirements",
    "",
    "| Requirement | Meaning |",
    "| --- | --- |",
    ...ontologyMarkdownRows(
      ontology.proofRequirements,
      "requirementId",
      (entry) =>
        `${markdownCode(entry.proofType)} → ${markdownCode(entry.requiredDisposition)}`
    ),
    ""
  ];
  return Buffer.from(sections.join("\n"), "utf8");
}

function projectUtf8Text(authority) {
  if (authority.authorityType !== "utf8-text.v1") {
    throw new Error("Projector authority type does not match its registry declaration.");
  }
  return Buffer.from(authority.text, "utf8");
}

function semanticPathValue(input, sourcePath) {
  let value = input;
  for (const segment of sourcePath) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, segment)
    ) {
      return undefined;
    }
    value = value[segment];
  }
  return value;
}

export function executeSemanticProjection(authority, schema, input) {
  if (
    authority?.authorityType !== "semantic-projection-authority.v1" ||
    authority.input?.schemaArtifactId === undefined ||
    !schema ||
    !Array.isArray(authority.projection?.fields)
  ) {
    throw new Error("Semantic projection authority is invalid.");
  }
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true
  });
  if (!ajv.validate(schema, input)) {
    throw new Error(authority.failure.message);
  }
  const result = Object.fromEntries(
    authority.projection.fields.map((field) => [
      field.outputField,
      semanticPathValue(input, field.sourcePath)
    ])
  );
  if (authority.result.serialization === "json-two-space-lf") {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  if (authority.result.serialization === "identity") {
    return result;
  }
  throw new Error(
    `Semantic result serialization is not admitted: ${authority.result.serialization}`
  );
}

function scanSource(text, language) {
  if (!["javascript", "typescript"].includes(language)) {
    throw new Error(`Source language is not admitted: ${language}`);
  }
  const scanner = createScanner(false, undefined, text);
  const tokens = [];
  for (let token = scanner.scan(); token !== SyntaxKind.EndOfFile; token = scanner.scan()) {
    tokens.push({
      kind: formatSyntaxKind(token),
      text: scanner.getTokenText()
    });
  }
  return tokens;
}

function scanSemanticSource(text, language) {
  if (!["javascript", "typescript"].includes(language)) {
    throw new Error(`Source language is not admitted: ${language}`);
  }
  const scanner = createScanner(false, undefined, text);
  const tokens = [];
  const templateExpressionBraceDepths = [];
  for (
    let token = scanner.scan();
    token !== SyntaxKind.EndOfFile;
    token = scanner.scan()
  ) {
    let kind = formatSyntaxKind(token);
    if (kind === "TemplateHead") {
      templateExpressionBraceDepths.push(0);
    } else if (
      kind === "OpenBraceToken" &&
      templateExpressionBraceDepths.length > 0
    ) {
      const last = templateExpressionBraceDepths.length - 1;
      templateExpressionBraceDepths[last] += 1;
    } else if (
      kind === "CloseBraceToken" &&
      templateExpressionBraceDepths.length > 0
    ) {
      const last = templateExpressionBraceDepths.length - 1;
      if (templateExpressionBraceDepths[last] === 0) {
        token = scanner.reScanTemplateToken(false);
        kind = formatSyntaxKind(token);
        if (kind === "TemplateTail") {
          templateExpressionBraceDepths.pop();
        }
      } else {
        templateExpressionBraceDepths[last] -= 1;
      }
    }
    tokens.push({
      kind,
      text: scanner.getTokenText()
    });
  }
  return tokens;
}

function semanticSourceTokens(text, language) {
  return scanSemanticSource(text, language).filter(
    (token) =>
      !token.kind.endsWith("Trivia") &&
      !token.kind.endsWith("Comment") &&
      token.kind !== "ShebangTrivia"
  );
}

function sourceLiteralValue(text) {
  const quote = text[0];
  if ((quote !== `"` && quote !== `'`) || text.at(-1) !== quote) {
    return null;
  }
  let value = "";
  for (let index = 1; index < text.length - 1; index += 1) {
    const character = text[index];
    if (character !== "\\") {
      value += character;
      continue;
    }
    index += 1;
    const escaped = text[index];
    const escapes = {
      "0": "\0",
      b: "\b",
      f: "\f",
      n: "\n",
      r: "\r",
      t: "\t",
      v: "\v"
    };
    if (escaped === "x") {
      const digits = text.slice(index + 1, index + 3);
      if (!/^[a-fA-F0-9]{2}$/.test(digits)) {
        return null;
      }
      value += String.fromCharCode(Number.parseInt(digits, 16));
      index += 2;
    } else if (escaped === "u") {
      const digits = text.slice(index + 1, index + 5);
      if (!/^[a-fA-F0-9]{4}$/.test(digits)) {
        return null;
      }
      value += String.fromCharCode(Number.parseInt(digits, 16));
      index += 4;
    } else {
      value += escapes[escaped] ?? escaped;
    }
  }
  return value;
}

const nonIdentifierKeywordKinds = new Set([
  "AsKeyword",
  "BreakKeyword",
  "CaseKeyword",
  "CatchKeyword",
  "ClassKeyword",
  "ConstKeyword",
  "ContinueKeyword",
  "DebuggerKeyword",
  "DefaultKeyword",
  "DeleteKeyword",
  "DoKeyword",
  "ElseKeyword",
  "ExportKeyword",
  "ExtendsKeyword",
  "FalseKeyword",
  "FinallyKeyword",
  "ForKeyword",
  "FromKeyword",
  "FunctionKeyword",
  "IfKeyword",
  "ImportKeyword",
  "InKeyword",
  "InstanceOfKeyword",
  "LetKeyword",
  "NewKeyword",
  "NullKeyword",
  "ReturnKeyword",
  "SwitchKeyword",
  "ThrowKeyword",
  "TrueKeyword",
  "TryKeyword",
  "TypeOfKeyword",
  "VarKeyword",
  "VoidKeyword",
  "WhileKeyword",
  "WithKeyword"
]);

function isIdentifierToken(token) {
  return (
    token?.kind === "Identifier" ||
    (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(token?.text ?? "") &&
      !nonIdentifierKeywordKinds.has(token.kind))
  );
}

function observeStaticImports(tokens) {
  const imports = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const declarationKind = tokens[index].kind;
    if (
      declarationKind !== "ImportKeyword" &&
      declarationKind !== "ExportKeyword"
    ) {
      continue;
    }
    if (
      declarationKind === "ImportKeyword" &&
      tokens[index + 1]?.kind === "OpenParenToken"
    ) {
      continue;
    }
    if (
      declarationKind === "ImportKeyword" &&
      tokens[index + 1]?.kind === "DotToken"
    ) {
      continue;
    }

    let cursor = index + 1;
    if (
      declarationKind === "ExportKeyword" &&
      [
        "ClassKeyword",
        "ConstKeyword",
        "DefaultKeyword",
        "FunctionKeyword",
        "LetKeyword",
        "VarKeyword"
      ].includes(tokens[cursor]?.kind)
    ) {
      continue;
    }
    if (tokens[cursor]?.kind === "TypeKeyword") {
      cursor += 1;
    }
    if (tokens[cursor]?.kind === "StringLiteral") {
      const specifier = sourceLiteralValue(tokens[cursor].text);
      imports.push({
        specifier,
        importedBindings: [],
        localBindings: []
      });
      continue;
    }

    const importedBindings = [];
    const localBindings = [];
    if (
      declarationKind === "ImportKeyword" &&
      isIdentifierToken(tokens[cursor])
    ) {
      importedBindings.push("default");
      localBindings.push({
        importedBinding: "default",
        localBinding: tokens[cursor].text
      });
      cursor += 1;
      if (tokens[cursor]?.kind === "CommaToken") {
        cursor += 1;
      }
    }
    if (tokens[cursor]?.kind === "AsteriskToken") {
      importedBindings.push("*");
      if (
        tokens[cursor + 1]?.kind === "AsKeyword" &&
        isIdentifierToken(tokens[cursor + 2])
      ) {
        localBindings.push({
          importedBinding: "*",
          localBinding: tokens[cursor + 2].text
        });
      }
    } else if (tokens[cursor]?.kind === "OpenBraceToken") {
      cursor += 1;
      while (
        cursor < tokens.length &&
        tokens[cursor].kind !== "CloseBraceToken"
      ) {
        if (
          isIdentifierToken(tokens[cursor]) &&
          tokens[cursor].kind !== "TypeKeyword" &&
          tokens[cursor - 1]?.kind !== "AsKeyword"
        ) {
          const importedBinding = tokens[cursor].text;
          const localBinding =
            tokens[cursor + 1]?.kind === "AsKeyword" &&
            isIdentifierToken(tokens[cursor + 2])
              ? tokens[cursor + 2].text
              : importedBinding;
          importedBindings.push(importedBinding);
          if (declarationKind === "ImportKeyword") {
            localBindings.push({ importedBinding, localBinding });
          }
        }
        cursor += 1;
      }
    }

    while (
      cursor < tokens.length &&
      tokens[cursor].kind !== "FromKeyword" &&
      tokens[cursor].kind !== "SemicolonToken"
    ) {
      cursor += 1;
    }
    if (
      tokens[cursor]?.kind === "FromKeyword" &&
      tokens[cursor + 1]?.kind === "StringLiteral"
    ) {
      const specifier = sourceLiteralValue(tokens[cursor + 1].text);
      imports.push({
        specifier,
        importedBindings: [...new Set(importedBindings)].sort(),
        localBindings: localBindings.sort((left, right) =>
          left.localBinding.localeCompare(right.localBinding)
        )
      });
    }
  }
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index].kind !== "Identifier" ||
      tokens[index].text !== "require" ||
      tokens[index + 1]?.kind !== "OpenParenToken"
    ) {
      continue;
    }
    const literal =
      tokens[index + 2]?.kind === "StringLiteral"
        ? sourceLiteralValue(tokens[index + 2].text)
        : null;
    const localBinding =
      tokens[index - 1]?.kind === "EqualsToken" &&
      isIdentifierToken(tokens[index - 2])
        ? tokens[index - 2].text
        : null;
    imports.push({
      specifier: literal,
      importedBindings: ["*"],
      localBindings: localBinding
        ? [{ importedBinding: "*", localBinding }]
        : []
    });
  }
  return imports.sort((left, right) =>
    String(left.specifier).localeCompare(String(right.specifier))
  );
}

function observeTopLevelDeclarations(tokens) {
  const declarations = [];
  let braceDepth = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.kind === "OpenBraceToken") {
      braceDepth += 1;
      continue;
    }
    if (token.kind === "CloseBraceToken") {
      braceDepth -= 1;
      continue;
    }
    if (braceDepth !== 0) {
      continue;
    }
    if (
      ["FunctionKeyword", "ClassKeyword"].includes(token.kind) &&
      tokens[index + 1]?.kind === "Identifier"
    ) {
      declarations.push(tokens[index + 1].text);
    }
    if (
      ["ConstKeyword", "LetKeyword", "VarKeyword"].includes(token.kind) &&
      isIdentifierToken(tokens[index + 1])
    ) {
      declarations.push(tokens[index + 1].text);
      let cursor = index + 2;
      let nestedBraces = 0;
      let nestedBrackets = 0;
      let nestedParentheses = 0;
      while (
        cursor < tokens.length &&
        !(
          tokens[cursor].kind === "SemicolonToken" &&
          nestedBraces === 0 &&
          nestedBrackets === 0 &&
          nestedParentheses === 0
        )
      ) {
        const cursorKind = tokens[cursor].kind;
        if (cursorKind === "OpenBraceToken") nestedBraces += 1;
        if (cursorKind === "CloseBraceToken") nestedBraces -= 1;
        if (cursorKind === "OpenBracketToken") nestedBrackets += 1;
        if (cursorKind === "CloseBracketToken") nestedBrackets -= 1;
        if (cursorKind === "OpenParenToken") nestedParentheses += 1;
        if (cursorKind === "CloseParenToken") nestedParentheses -= 1;
        if (
          cursorKind === "CommaToken" &&
          nestedBraces === 0 &&
          nestedBrackets === 0 &&
          nestedParentheses === 0 &&
          isIdentifierToken(tokens[cursor + 1])
        ) {
          declarations.push(tokens[cursor + 1].text);
        }
        cursor += 1;
      }
    }
  }
  return [...new Set(declarations)].sort();
}

function invocationAt(tokens, openParenIndex) {
  const previous = tokens[openParenIndex - 1];
  if (previous?.kind === "ImportKeyword") {
    return "import";
  }
  if (!isIdentifierToken(previous)) {
    return null;
  }
  if (
    ["FunctionKeyword", "ClassKeyword"].includes(
      tokens[openParenIndex - 2]?.kind
    )
  ) {
    return null;
  }
  const closeParenIndex = findMatchingToken(
    tokens,
    openParenIndex,
    "OpenParenToken",
    "CloseParenToken"
  );
  if (tokens[closeParenIndex + 1]?.kind === "OpenBraceToken") {
    return null;
  }
  const segments = [previous.text];
  let cursor = openParenIndex - 2;
  while (
    tokens[cursor]?.kind === "DotToken" &&
    isIdentifierToken(tokens[cursor - 1])
  ) {
    segments.unshift(tokens[cursor - 1].text);
    cursor -= 2;
  }
  const prefix = tokens[cursor]?.kind === "NewKeyword" ? "new " : "";
  return `${prefix}${segments.join(".")}`;
}

function observeInvocations(tokens) {
  return [
    ...new Set(
      tokens
        .map((token, index) =>
          token.kind === "OpenParenToken"
            ? invocationAt(tokens, index)
            : null
        )
        .filter(Boolean)
    )
  ].sort();
}

function findMatchingToken(tokens, startIndex, openKind, closeKind) {
  let depth = 0;
  for (let index = startIndex; index < tokens.length; index += 1) {
    if (tokens[index].kind === openKind) {
      depth += 1;
    } else if (tokens[index].kind === closeKind) {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return tokens.length - 1;
}

function normalizedTokenText(tokens, startIndex, endIndex) {
  return tokens
    .slice(startIndex, endIndex)
    .map((token) => token.text)
    .join("");
}

function delimitedExpressions(tokens, openIndex, closeIndex) {
  if (closeIndex <= openIndex + 1) {
    return [];
  }
  const expressions = [];
  let expressionStart = openIndex + 1;
  let braceDepth = 0;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  for (let index = expressionStart; index < closeIndex; index += 1) {
    const kind = tokens[index].kind;
    if (kind === "OpenBraceToken") braceDepth += 1;
    if (kind === "CloseBraceToken") braceDepth -= 1;
    if (kind === "OpenBracketToken") bracketDepth += 1;
    if (kind === "CloseBracketToken") bracketDepth -= 1;
    if (kind === "OpenParenToken") parenthesisDepth += 1;
    if (kind === "CloseParenToken") parenthesisDepth -= 1;
    if (
      kind === "CommaToken" &&
      braceDepth === 0 &&
      bracketDepth === 0 &&
      parenthesisDepth === 0
    ) {
      expressions.push(
        normalizedTokenText(tokens, expressionStart, index)
      );
      expressionStart = index + 1;
    }
  }
  expressions.push(
    normalizedTokenText(tokens, expressionStart, closeIndex)
  );
  return expressions;
}

function invocationArgumentsAt(tokens, openParenIndex) {
  const closeParenIndex = findMatchingToken(
    tokens,
    openParenIndex,
    "OpenParenToken",
    "CloseParenToken"
  );
  return delimitedExpressions(tokens, openParenIndex, closeParenIndex);
}

function observeFunctionRanges(tokens) {
  const ranges = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index].kind === "FunctionKeyword" &&
      isIdentifierToken(tokens[index + 1]) &&
      tokens[index - 1]?.kind !== "EqualsToken"
    ) {
      let bodyStart = index + 2;
      while (
        bodyStart < tokens.length &&
        tokens[bodyStart].kind !== "OpenBraceToken"
      ) {
        bodyStart += 1;
      }
      if (bodyStart < tokens.length) {
        ranges.push({
          declaration: tokens[index + 1].text,
          functionKind: "function-declaration",
          startIndex: index,
          bodyStart,
          endIndex: findMatchingToken(
            tokens,
            bodyStart,
            "OpenBraceToken",
            "CloseBraceToken"
          )
        });
      }
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (
      !["ConstKeyword", "LetKeyword", "VarKeyword"].includes(
        tokens[index].kind
      ) ||
      !isIdentifierToken(tokens[index + 1])
    ) {
      continue;
    }
    const declaration = tokens[index + 1].text;
    let cursor = index + 2;
    let functionExpressionIndex = -1;
    while (
      cursor < tokens.length &&
      tokens[cursor].kind !== "SemicolonToken"
    ) {
      if (
        tokens[cursor].kind === "FunctionKeyword" &&
        tokens[cursor - 1]?.kind === "EqualsToken"
      ) {
        functionExpressionIndex = cursor;
      }
      if (tokens[cursor].kind === "EqualsGreaterThanToken") {
        const bodyStart = cursor + 1;
        ranges.push({
          declaration,
          functionKind: "arrow-function",
          startIndex: index,
          bodyStart,
          endIndex:
            tokens[bodyStart]?.kind === "OpenBraceToken"
              ? findMatchingToken(
                  tokens,
                  bodyStart,
                  "OpenBraceToken",
                  "CloseBraceToken"
                )
              : (() => {
                  const semicolonIndex = tokens.findIndex(
                    (token, tokenIndex) =>
                      tokenIndex > bodyStart &&
                      token.kind === "SemicolonToken"
                  );
                  return semicolonIndex === -1
                    ? tokens.length - 1
                    : semicolonIndex;
                })()
        });
        break;
      }
      if (functionExpressionIndex !== -1) {
        let bodyStart = functionExpressionIndex + 1;
        while (
          bodyStart < tokens.length &&
          tokens[bodyStart].kind !== "OpenBraceToken"
        ) {
          bodyStart += 1;
        }
        if (bodyStart < tokens.length) {
          ranges.push({
            declaration,
            functionKind: "function-expression",
            startIndex: index,
            bodyStart,
            endIndex: findMatchingToken(
              tokens,
              bodyStart,
              "OpenBraceToken",
              "CloseBraceToken"
            )
          });
        }
        break;
      }
      cursor += 1;
    }
  }

  for (let index = 0; index < tokens.length; index += 1) {
    if (
      !isIdentifierToken(tokens[index]) ||
      tokens[index + 1]?.kind !== "OpenParenToken" ||
      tokens[index - 1]?.kind === "FunctionKeyword"
    ) {
      continue;
    }
    const closeParenIndex = findMatchingToken(
      tokens,
      index + 1,
      "OpenParenToken",
      "CloseParenToken"
    );
    if (tokens[closeParenIndex + 1]?.kind !== "OpenBraceToken") {
      continue;
    }
    const bodyStart = closeParenIndex + 1;
    ranges.push({
      declaration: tokens[index].text,
      functionKind: "method-declaration",
      startIndex: index,
      bodyStart,
      endIndex: findMatchingToken(
        tokens,
        bodyStart,
        "OpenBraceToken",
        "CloseBraceToken"
      )
    });
  }
  return ranges;
}

function observeUnresolvedFunctionForms(tokens, functionRanges) {
  const unresolved = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (
      tokens[index].kind === "FunctionKeyword" &&
      !functionRanges.some(
        (range) =>
          (range.functionKind === "function-declaration" &&
            range.startIndex === index) ||
          (range.functionKind === "function-expression" &&
            range.startIndex < index &&
            index < range.bodyStart)
      )
    ) {
      unresolved.push({
        functionKind: "unbound-function-expression",
        tokenIndex: index
      });
    }
    if (
      tokens[index].kind === "EqualsGreaterThanToken" &&
      !functionRanges.some(
        (range) =>
          range.functionKind === "arrow-function" &&
          range.startIndex < index &&
          range.bodyStart === index + 1
      )
    ) {
      unresolved.push({
        functionKind: "unbound-arrow-function",
        tokenIndex: index
      });
    }
  }
  return unresolved;
}

function sourceScopeAt(tokenIndex, functionRanges) {
  const containing = functionRanges
    .filter(
      (range) =>
        tokenIndex >= range.bodyStart && tokenIndex <= range.endIndex
    )
    .sort(
      (left, right) =>
        left.endIndex -
        left.bodyStart -
        (right.endIndex - right.bodyStart)
    );
  return containing[0]?.declaration ?? "<module>";
}

function observeFunctionDeclarations(functionRanges) {
  return functionRanges
    .map(({ declaration, functionKind }) => ({
      declaration,
      functionKind
    }))
    .sort((left, right) => left.declaration.localeCompare(right.declaration));
}

function observeInvocationOccurrences(tokens, functionRanges) {
  const observations = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].kind !== "OpenParenToken") {
      continue;
    }
    const invocation = invocationAt(tokens, index);
    if (!invocation) {
      continue;
    }
    const responsibilityDeclaration = sourceScopeAt(index, functionRanges);
    const argumentExpressions = invocationArgumentsAt(tokens, index);
    const key = `${responsibilityDeclaration}\0${invocation}\0${JSON.stringify(argumentExpressions)}`;
    const observation = observations.get(key) ?? {
      responsibilityDeclaration,
      invocation,
      argumentExpressions,
      occurrences: 0
    };
    observation.occurrences += 1;
    observations.set(key, observation);
  }
  return [...observations.values()].sort((left, right) =>
    `${left.responsibilityDeclaration}:${left.invocation}`.localeCompare(
      `${right.responsibilityDeclaration}:${right.invocation}`
    )
  );
}

function observeAmbientOperationOccurrences(tokens, functionRanges) {
  const operations = new Map();
  const admit = (operation, tokenIndex) => {
    const responsibilityDeclaration = sourceScopeAt(
      tokenIndex,
      functionRanges
    );
    const key = `${responsibilityDeclaration}\0${operation}`;
    const observation = operations.get(key) ?? {
      responsibilityDeclaration,
      operation,
      occurrences: 0
    };
    observation.occurrences += 1;
    operations.set(key, observation);
  };
  const ambientCallIdentifiers = new Set([
    "fetch",
    "queueMicrotask",
    "setImmediate",
    "setInterval",
    "setTimeout"
  ]);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (
      token.kind === "Identifier" &&
      ambientCallIdentifiers.has(token.text) &&
      tokens[index + 1]?.kind === "OpenParenToken"
    ) {
      admit(token.text, index);
    }
    if (
      token.kind !== "Identifier" ||
      !["console", "process"].includes(token.text)
    ) {
      continue;
    }
    const segments = [token.text];
    let cursor = index + 1;
    while (
      tokens[cursor]?.kind === "DotToken" &&
      isIdentifierToken(tokens[cursor + 1])
    ) {
      segments.push(tokens[cursor + 1].text);
      cursor += 2;
    }
    if (segments.length > 1) {
      admit(segments.join("."), index);
    }
  }
  return [...operations.values()].sort((left, right) =>
    left.operation.localeCompare(right.operation)
  );
}

function observeSemanticOperations(
  invocationOccurrences,
  ambientOperationOccurrences
) {
  const invocationKeys = new Set(
    invocationOccurrences.map(
      (entry) =>
        `${entry.responsibilityDeclaration}\0${entry.invocation}`
    )
  );
  return [
    ...invocationOccurrences.map((entry) => ({
      responsibilityDeclaration: entry.responsibilityDeclaration,
      edgeKind: "invocation",
      operation: entry.invocation,
      argumentExpressions: entry.argumentExpressions,
      occurrences: entry.occurrences
    })),
    ...ambientOperationOccurrences.flatMap((entry) => {
      const key = `${entry.responsibilityDeclaration}\0${entry.operation}`;
      const invokedOccurrences = invocationKeys.has(key)
        ? invocationOccurrences.find(
            (invocation) =>
              invocation.responsibilityDeclaration ===
                entry.responsibilityDeclaration &&
              invocation.invocation === entry.operation
          )?.occurrences ?? 0
        : 0;
      const referenceOccurrences = entry.occurrences - invokedOccurrences;
      return referenceOccurrences > 0
        ? [
            {
              responsibilityDeclaration: entry.responsibilityDeclaration,
              edgeKind: "reference",
              operation: entry.operation,
              argumentExpressions: [],
              occurrences: referenceOccurrences
            }
          ]
        : [];
    })
  ].sort((left, right) =>
    `${left.responsibilityDeclaration}:${left.operation}`.localeCompare(
      `${right.responsibilityDeclaration}:${right.operation}`
    )
  );
}

const observedSyntaxKinds = new Map([
  ["IfKeyword", "IfStatement"],
  ["SwitchKeyword", "SwitchStatement"],
  ["ForKeyword", "ForStatement"],
  ["WhileKeyword", "WhileStatement"],
  ["DoKeyword", "DoStatement"],
  ["TryKeyword", "TryStatement"],
  ["CatchKeyword", "CatchClause"],
  ["WithKeyword", "WithStatement"],
  ["DebuggerKeyword", "DebuggerStatement"],
  ["ReturnKeyword", "ReturnStatement"],
  ["ThrowKeyword", "ThrowStatement"],
  ["QuestionQuestionToken", "NullishCoalescingExpression"],
  ["QuestionToken", "ConditionalExpression"],
  ["AmpersandAmpersandToken", "LogicalAndExpression"],
  ["BarBarToken", "LogicalOrExpression"]
]);

const objectLiteralPreviousKinds = new Set([
  "ColonToken",
  "CommaToken",
  "EqualsToken",
  "OpenBracketToken",
  "OpenParenToken",
  "ReturnKeyword"
]);

function isObjectLiteralOpen(tokens, index) {
  return (
    tokens[index]?.kind === "OpenBraceToken" &&
    objectLiteralPreviousKinds.has(tokens[index - 1]?.kind)
  );
}

function objectFieldName(token) {
  if (token?.kind === "Identifier") {
    return token.text;
  }
  if (token?.kind === "StringLiteral") {
    return sourceLiteralValue(token.text);
  }
  if (token?.kind === "NumericLiteral") {
    return token.text;
  }
  return null;
}

function observeObjectLiterals(tokens, functionRanges) {
  const observations = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (!isObjectLiteralOpen(tokens, index)) {
      continue;
    }
    const endIndex = findMatchingToken(
      tokens,
      index,
      "OpenBraceToken",
      "CloseBraceToken"
    );
    const fields = [];
    let cursor = index + 1;
    while (cursor < endIndex) {
      const outputField = objectFieldName(tokens[cursor]);
      if (outputField === null) {
        cursor += 1;
        continue;
      }
      if (tokens[cursor + 1]?.kind !== "ColonToken") {
        fields.push({
          outputField,
          sourceExpression: outputField
        });
        cursor += 1;
        continue;
      }
      const expressionStart = cursor + 2;
      let expressionEnd = expressionStart;
      let braceDepth = 0;
      let bracketDepth = 0;
      let parenthesisDepth = 0;
      while (expressionEnd < endIndex) {
        const kind = tokens[expressionEnd].kind;
        if (kind === "OpenBraceToken") braceDepth += 1;
        if (kind === "CloseBraceToken") braceDepth -= 1;
        if (kind === "OpenBracketToken") bracketDepth += 1;
        if (kind === "CloseBracketToken") bracketDepth -= 1;
        if (kind === "OpenParenToken") parenthesisDepth += 1;
        if (kind === "CloseParenToken") parenthesisDepth -= 1;
        if (
          kind === "CommaToken" &&
          braceDepth === 0 &&
          bracketDepth === 0 &&
          parenthesisDepth === 0
        ) {
          break;
        }
        expressionEnd += 1;
      }
      fields.push({
        outputField,
        sourceExpression: tokens
          .slice(expressionStart, expressionEnd)
          .map((token) => token.text)
          .join("")
      });
      cursor = expressionEnd + 1;
    }
    observations.push({
      responsibilityDeclaration: sourceScopeAt(index, functionRanges),
      fields
    });
  }
  const grouped = new Map();
  for (const observation of observations) {
    const key = JSON.stringify(observation);
    const entry = grouped.get(key) ?? { ...observation, occurrences: 0 };
    entry.occurrences += 1;
    grouped.set(key, entry);
  }
  return [...grouped.values()];
}

function objectLiteralCount(tokens) {
  return tokens.filter((token, index) => isObjectLiteralOpen(tokens, index))
    .length;
}

function observeSyntaxKinds(tokens) {
  const counts = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const syntaxKind =
      token.kind === "ImportKeyword" &&
      tokens[index + 1]?.kind === "OpenParenToken"
        ? "DynamicImportExpression"
        : observedSyntaxKinds.get(token.kind);
    if (syntaxKind) {
      counts.set(syntaxKind, (counts.get(syntaxKind) ?? 0) + 1);
    }
  }
  const objectLiterals = objectLiteralCount(tokens);
  if (objectLiterals > 0) {
    counts.set("ObjectLiteralExpression", objectLiterals);
  }
  return [...counts]
    .map(([syntaxKind, occurrences]) => ({ syntaxKind, occurrences }))
    .sort((left, right) => left.syntaxKind.localeCompare(right.syntaxKind));
}

const decisionSyntaxKinds = new Set([
  "ConditionalExpression",
  "IfStatement",
  "LogicalAndExpression",
  "LogicalOrExpression",
  "NullishCoalescingExpression",
  "SwitchStatement"
]);

const iterationSyntaxKinds = new Set([
  "DoStatement",
  "ForStatement",
  "WhileStatement"
]);

function parenthesizedExpressionAfter(tokens, keywordIndex) {
  let openIndex = keywordIndex + 1;
  while (
    openIndex < tokens.length &&
    tokens[openIndex].kind !== "OpenParenToken"
  ) {
    openIndex += 1;
  }
  if (openIndex >= tokens.length) {
    return "";
  }
  const closeIndex = findMatchingToken(
    tokens,
    openIndex,
    "OpenParenToken",
    "CloseParenToken"
  );
  return normalizedTokenText(tokens, openIndex + 1, closeIndex);
}

function enclosingControlExpression(tokens, tokenIndex) {
  for (let index = tokenIndex - 1; index >= 0; index -= 1) {
    if (!["IfKeyword", "SwitchKeyword"].includes(tokens[index].kind)) {
      continue;
    }
    let openIndex = index + 1;
    while (
      openIndex < tokenIndex &&
      tokens[openIndex].kind !== "OpenParenToken"
    ) {
      openIndex += 1;
    }
    if (tokens[openIndex]?.kind !== "OpenParenToken") {
      continue;
    }
    const closeIndex = findMatchingToken(
      tokens,
      openIndex,
      "OpenParenToken",
      "CloseParenToken"
    );
    if (tokenIndex < closeIndex) {
      return normalizedTokenText(tokens, openIndex + 1, closeIndex);
    }
  }
  return null;
}

function containingStatementExpression(tokens, tokenIndex) {
  let startIndex = tokenIndex;
  while (
    startIndex > 0 &&
    ![
      "CloseBraceToken",
      "OpenBraceToken",
      "SemicolonToken"
    ].includes(tokens[startIndex - 1].kind)
  ) {
    startIndex -= 1;
  }
  let endIndex = tokenIndex + 1;
  while (
    endIndex < tokens.length &&
    !["CloseBraceToken", "SemicolonToken"].includes(
      tokens[endIndex].kind
    )
  ) {
    endIndex += 1;
  }
  let expressionStart = startIndex;
  for (let index = startIndex; index < tokenIndex; index += 1) {
    if (tokens[index].kind === "EqualsToken") {
      expressionStart = index + 1;
    }
  }
  return normalizedTokenText(tokens, expressionStart, endIndex);
}

function decisionExpressionAt(tokens, tokenIndex, syntaxKind) {
  if (["IfStatement", "SwitchStatement"].includes(syntaxKind)) {
    return parenthesizedExpressionAfter(tokens, tokenIndex);
  }
  return (
    enclosingControlExpression(tokens, tokenIndex) ??
    containingStatementExpression(tokens, tokenIndex)
  );
}

function iterationExpressionAt(tokens, tokenIndex, syntaxKind) {
  if (["ForStatement", "WhileStatement"].includes(syntaxKind)) {
    return parenthesizedExpressionAfter(tokens, tokenIndex);
  }
  for (let index = tokenIndex + 1; index < tokens.length; index += 1) {
    if (tokens[index].kind === "WhileKeyword") {
      return parenthesizedExpressionAfter(tokens, index);
    }
  }
  return "";
}

function observeScopedSyntax(
  tokens,
  functionRanges,
  admittedKinds,
  expressionField
) {
  const observations = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    const syntaxKind = observedSyntaxKinds.get(tokens[index].kind);
    if (!admittedKinds.has(syntaxKind)) {
      continue;
    }
    const responsibilityDeclaration = sourceScopeAt(index, functionRanges);
    const expression =
      expressionField === "conditionExpression"
        ? decisionExpressionAt(tokens, index, syntaxKind)
        : iterationExpressionAt(tokens, index, syntaxKind);
    const key = `${responsibilityDeclaration}\0${syntaxKind}\0${expression}`;
    const observation = observations.get(key) ?? {
      responsibilityDeclaration,
      syntaxKind,
      [expressionField]: expression,
      occurrences: 0
    };
    observation.occurrences += 1;
    observations.set(key, observation);
  }
  return [...observations.values()].sort((left, right) =>
    `${left.responsibilityDeclaration}:${left.syntaxKind}`.localeCompare(
      `${right.responsibilityDeclaration}:${right.syntaxKind}`
    )
  );
}

function observeFailureEvents(tokens, functionRanges) {
  const events = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const syntaxKind = observedSyntaxKinds.get(tokens[index].kind);
    if (!["CatchClause", "ThrowStatement", "TryStatement"].includes(syntaxKind)) {
      continue;
    }
    const event = {
      responsibilityDeclaration: sourceScopeAt(index, functionRanges),
      syntaxKind
    };
    if (syntaxKind === "ThrowStatement") {
      let endIndex = index + 1;
      while (
        endIndex < tokens.length &&
        tokens[endIndex].kind !== "SemicolonToken"
      ) {
        endIndex += 1;
      }
      const expressionTokens = tokens.slice(index + 1, endIndex);
      event.expression =
        expressionTokens[0]?.kind === "NewKeyword"
          ? `new ${expressionTokens
              .slice(1)
              .map((token) => token.text)
              .join("")}`
          : expressionTokens.map((token) => token.text).join("");
    }
    events.push(event);
  }
  const grouped = new Map();
  for (const event of events) {
    const key = JSON.stringify(event);
    const observation = grouped.get(key) ?? { ...event, occurrences: 0 };
    observation.occurrences += 1;
    grouped.set(key, observation);
  }
  return [...grouped.values()];
}

function observeReturnResults(tokens, functionRanges) {
  const results = new Map();
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index].kind !== "ReturnKeyword") {
      continue;
    }
    const responsibilityDeclaration = sourceScopeAt(index, functionRanges);
    let endIndex = index + 1;
    let braceDepth = 0;
    let bracketDepth = 0;
    let parenthesisDepth = 0;
    while (endIndex < tokens.length) {
      const kind = tokens[endIndex].kind;
      if (
        (kind === "SemicolonToken" || kind === "CloseBraceToken") &&
        braceDepth === 0 &&
        bracketDepth === 0 &&
        parenthesisDepth === 0
      ) {
        break;
      }
      if (kind === "OpenBraceToken") braceDepth += 1;
      if (kind === "CloseBraceToken") braceDepth -= 1;
      if (kind === "OpenBracketToken") bracketDepth += 1;
      if (kind === "CloseBracketToken") bracketDepth -= 1;
      if (kind === "OpenParenToken") parenthesisDepth += 1;
      if (kind === "CloseParenToken") parenthesisDepth -= 1;
      endIndex += 1;
    }
    const expression = normalizedTokenText(
      tokens,
      index + 1,
      endIndex
    );
    const key = `${responsibilityDeclaration}\0explicit-return\0${expression}`;
    const observation = results.get(key) ?? {
      responsibilityDeclaration,
      returnKind: "explicit-return",
      expression,
      occurrences: 0
    };
    observation.occurrences += 1;
    results.set(key, observation);
  }
  for (const range of functionRanges) {
    if (
      range.functionKind === "arrow-function" &&
      tokens[range.bodyStart]?.kind !== "OpenBraceToken"
    ) {
      const key = `${range.declaration}\0implicit-return`;
      results.set(key, {
        responsibilityDeclaration: range.declaration,
        returnKind: "implicit-return",
        expression: normalizedTokenText(
          tokens,
          range.bodyStart,
          range.endIndex
        ),
        occurrences: 1
      });
    }
  }
  return [...results.values()];
}

export function inspectSourceAuthority(text, language = "javascript") {
  const tokens = semanticSourceTokens(text, language);
  const functionRanges = observeFunctionRanges(tokens);
  const invocationOccurrences = observeInvocationOccurrences(
    tokens,
    functionRanges
  );
  const ambientOperationOccurrences =
    observeAmbientOperationOccurrences(tokens, functionRanges);
  return {
    imports: observeStaticImports(tokens),
    ambientOperations: [
      ...new Set(
        ambientOperationOccurrences.map((entry) => entry.operation)
      )
    ].sort(),
    ambientOperationOccurrences,
    declarations: observeTopLevelDeclarations(tokens),
    functions: observeFunctionDeclarations(functionRanges),
    unresolvedFunctionForms: observeUnresolvedFunctionForms(
      tokens,
      functionRanges
    ),
    invocations: observeInvocations(tokens),
    invocationOccurrences,
    semanticOperations: observeSemanticOperations(
      invocationOccurrences,
      ambientOperationOccurrences
    ),
    decisions: observeScopedSyntax(
      tokens,
      functionRanges,
      decisionSyntaxKinds,
      "conditionExpression"
    ),
    iterations: observeScopedSyntax(
      tokens,
      functionRanges,
      iterationSyntaxKinds,
      "controlExpression"
    ),
    failures: observeFailureEvents(tokens, functionRanges),
    projections: observeObjectLiterals(tokens, functionRanges),
    returns: observeReturnResults(tokens, functionRanges),
    syntaxKinds: observeSyntaxKinds(tokens),
    unresolvedTokens: tokens
      .filter(
        (token) =>
          token.kind === "Unknown" && !token.text.startsWith("#!")
      )
      .map((token) => token.text)
  };
}

function projectSourceTokens(authority) {
  if (authority.authorityType !== "lossless-source-tokens.v1") {
    throw new Error("Projector authority type does not match its registry declaration.");
  }
  const text = authority.tokens.map((token) => token.text).join("");
  const observedTokens = scanSource(text, authority.language);
  if (JSON.stringify(observedTokens) !== JSON.stringify(authority.tokens)) {
    throw new Error("Lossless source tokens do not reproduce their declared token structure.");
  }
  return Buffer.from(text, "utf8");
}

function markdownText(value) {
  return String(value)
    .replace(/\r?\n/g, " ")
    .replace(/\|/g, "\\|")
    .trim();
}

function markdownCode(value) {
  return `\`${String(value).replace(/`/g, "\\`")}\``;
}

function markdownTable(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (row) => `| ${row.map((value) => markdownText(value)).join(" | ")} |`
    )
  ];
}

function markdownList(values) {
  return values.length > 0
    ? values.map((value) => `- ${value}`)
    : ["No entries are declared."];
}

export function projectGovernedArtifactContractMarkdown(
  contract,
  authority,
  reviewArtifactId
) {
  if (
    !contract.authorityClosure &&
    contract.interpretationBase?.conformanceProfile
  ) {
    const profile = readJson(
      DEFAULT_CONFORMANCE_PROFILE_PATH,
      "Conformance profile"
    );
    contract = applyConformanceProfile(contract, profile);
  }
  if (authority.authorityType !== "governed-artifact-contract-markdown.v1") {
    throw new Error("Projector authority type does not match its registry declaration.");
  }
  const reviewArtifact = contract.artifacts.find(
    (artifact) => artifact.artifactId === reviewArtifactId
  );
  if (!reviewArtifact) {
    throw new Error("Review artifact is not declared by the contract.");
  }

  const artifactRows = contract.artifacts.map((artifact) => [
    markdownCode(artifact.artifactId),
    markdownCode(artifact.artifactKind),
    artifact.purpose,
    markdownCode(artifact.relativePath),
    markdownCode(artifact.mediaType),
    markdownCode(artifact.ownership),
    markdownCode(artifact.mutabilityPosture)
  ]);
  const proofRows = contract.artifacts.map((artifact) => {
    const proofRequirements = [
      artifact.proof.contentDigestRequired ? "content digest" : null,
      artifact.proof.metaSchemaValidationRequired ? "meta-schema" : null,
      artifact.proof.requiredSections
        ? `sections: ${artifact.proof.requiredSections.join(", ")}`
        : null,
      artifact.proof.forbiddenText
        ? `forbidden text: ${artifact.proof.forbiddenText.join(", ")}`
        : null,
      artifact.proof.validThroughUtc
        ? `valid through: ${artifact.proof.validThroughUtc}`
        : null
    ].filter(Boolean);
    return [
      markdownCode(artifact.artifactId),
      artifact.proof.verifierIds.map(markdownCode).join(", "),
      proofRequirements.join("; ")
    ];
  });
  const projectionRows = contract.artifacts.map((artifact) => [
    markdownCode(artifact.artifactId),
    markdownCode(artifact.projection.mode),
    markdownCode(artifact.projection.projectorId),
    markdownCode(artifact.projection.authorityId),
    markdownCode(artifact.projection.authority.authorityType)
  ]);
  const dependencyRows = contract.dependencies.map((dependency) => [
    markdownCode(dependency.dependencyId),
    markdownCode(dependency.specifier),
    dependency.allowedImports.map(markdownCode).join(", "),
    dependency.allowedInvocations.map(markdownCode).join(", "),
    dependency.usedByArtifacts.map(markdownCode).join(", "),
    dependency.authority.authorityType === "port-authority.v1"
      ? `${markdownCode(dependency.authority.portId)} / ${markdownCode(dependency.authority.effect)}`
      : `${markdownCode(dependency.authority.artifactId)} / ${markdownCode(dependency.authority.semanticEdge)}`
  ]);
  const effectRows = contract.effects.map((effect) => [
    markdownCode(effect.effectId),
    markdownCode(effect.operation),
    effect.usedByArtifacts.map(markdownCode).join(", "),
    markdownCode(effect.authority.portId),
    markdownCode(effect.authority.effect)
  ]);
  const runtimeRows = contract.runtimeAuthorities.map((authority) => [
    markdownCode(authority.runtimeAuthorityId),
    markdownCode(authority.invocation),
    authority.usedByArtifacts.map(markdownCode).join(", "),
    authority.purpose
  ]);
  const sourceAuthorityRows = contract.artifacts
    .filter((artifact) => artifact.sourceAuthority)
    .map((artifact) => [
      markdownCode(artifact.artifactId),
      artifact.sourceAuthority.responsibilities
        .map((entry) => markdownCode(entry.responsibilityId))
        .join(", "),
      artifact.sourceAuthority.semanticEdges
        .map((entry) => markdownCode(entry.edgeId))
        .join(", "),
      artifact.sourceAuthority.decisions
        .map((entry) => markdownCode(entry.decisionId))
        .join(", "),
      artifact.sourceAuthority.iterations
        .map((entry) => markdownCode(entry.iterationId))
        .join(", "),
      artifact.sourceAuthority.failurePolicies
        .map((entry) => markdownCode(entry.failurePolicyId))
        .join(", "),
      artifact.sourceAuthority.projectionMappings
        .map((entry) => markdownCode(entry.projectionMappingId))
        .join(", "),
      artifact.sourceAuthority.resultContracts
        .map((entry) => markdownCode(entry.resultContractId))
        .join(", ")
    ]);
  const claimRows = contract.claims.map((claim) => [
    markdownCode(claim.claimId),
    markdownCode(claim.claim),
    markdownCode(claim.requiredConformanceDisposition),
    markdownCode(claim.requiredAuthorityClosureDisposition),
    markdownCode(claim.requiredScopeDisposition),
    markdownCode(claim.requiredProofDisposition),
    markdownCode(claim.requiredTrustDisposition)
  ]);
  const relationshipRows = contract.artifacts.flatMap((artifact) =>
    artifact.relationships.map((relationship) => [
      markdownCode(artifact.artifactId),
      markdownCode(relationship.relationshipType),
      markdownCode(relationship.artifactId)
    ])
  );
  const evaluationRows = contract.conformance.artifactEvaluations.map(
    (evaluation) => [
      markdownCode(evaluation.evaluationId),
      markdownCode(evaluation.verifierId),
      markdownCode(evaluation.command.join(" ")),
      markdownCode(evaluation.expectedExitCode),
      markdownCode(evaluation.expectedStdoutContains)
    ]
  );
  const subjectAuthority = canonicalJsonBytes(
    contract.subject.authority
  ).toString("utf8").trimEnd();
  const authorityClosureProfile = canonicalJsonBytes(
    contract.authorityClosure
  ).toString("utf8").trimEnd();
  const artifactScopeProfile = canonicalJsonBytes(
    artifactScopeAuthority(contract)
  ).toString("utf8").trimEnd();
  const operationAuthorities = canonicalJsonBytes(
    contract.operationAuthorities
  ).toString("utf8").trimEnd();

  const sections = new Map([
    [
      "future-state-preview",
      [
        "## Future-State Preview",
        "",
        ...authority.futureStatePreview.flatMap((paragraph) => [paragraph, ""])
      ]
    ],
    [
      "reviewer-perspective",
      [
        "## Reviewer Perspective",
        "",
        `As ${authority.reviewerPerspective.role}, I need ${authority.reviewerPerspective.objective}, so that ${authority.reviewerPerspective.outcome}.`,
        ""
      ]
    ],
    [
      "governing-loop",
      [
        "## Governing Loop",
        "",
        "```mermaid",
        "flowchart LR",
        "  S[Schema] --> C[Contract]",
        "  C --> A[Artifacts]",
        "  A --> E[Conformance]",
        "  E --> T[Trust]",
        "  T -. admitted change .-> S",
        "```",
        ""
      ]
    ],
    [
      "contract-authority",
      [
        "## Contract Authority",
        "",
        ...markdownTable(
          ["Coordinate", "Admitted value"],
          [
            ["Contract type", markdownCode(contract.contract.contractType)],
            ["Contract ID", markdownCode(contract.contract.contractId)],
            ["Contract version", markdownCode(contract.contract.contractVersion)],
            ["Contract status", markdownCode(contract.contract.status)],
            [
              "Engine",
              `${markdownCode(contract.interpretationBase.engine.identity)} / ${markdownCode(contract.interpretationBase.engine.digest)}`
            ],
            ["Schema identity", markdownCode(contract.schema.identity)],
            ["Schema digest", markdownCode(contract.schema.digest)],
            [
              "Conformance profile",
              `${markdownCode(contract.conformanceProfile.identity)} / ${markdownCode(contract.conformanceProfile.digest)}`
            ],
            [
              "Projector registry",
              `${markdownCode(contract.projectorRegistry.identity)} / ${markdownCode(contract.projectorRegistry.digest)}`
            ],
            [
              "Verifier registry",
              `${markdownCode(contract.verifierRegistry.identity)} / ${markdownCode(contract.verifierRegistry.digest)}`
            ],
            [
              "Migration registry",
              `${markdownCode(contract.migrationRegistry.identity)} / ${markdownCode(contract.migrationRegistry.digest)}`
            ]
          ]
        ),
        ""
      ]
    ],
    [
      "semantic-subject",
      [
        "## Semantic Subject",
        "",
        ...markdownTable(
          ["Coordinate", "Admitted value"],
          [
            ["Subject type", markdownCode(contract.subject.subjectType)],
            ["Subject ID", markdownCode(contract.subject.subjectId)],
            ["Purpose", contract.subject.purpose]
          ]
        ),
        "",
        "Structured subject authority:",
        "",
        "```json",
        subjectAuthority,
        "```",
        ""
      ]
    ],
    [
      "artifact-family",
      [
        "## Artifact Family",
        "",
        ...markdownTable(
          [
            "Artifact",
            "Kind",
            "Purpose",
            "Relative path",
            "Media type",
            "Ownership",
            "Mutability"
          ],
          artifactRows
        ),
        "",
        "### Proof Requirements",
        "",
        ...markdownTable(
          ["Artifact", "Verifiers", "Requirements"],
          proofRows
        ),
        "",
        "Content digests and byte lengths remain in the JSON contract. They are excluded from this review projection so the review artifact never becomes an input to its own content commitment.",
        ""
      ]
    ],
    [
      "projection-authorities",
      [
        "## Projection Authorities",
        "",
        ...markdownTable(
          ["Artifact", "Mode", "Projector", "Authority", "Authority type"],
          projectionRows
        ),
        ""
      ]
    ],
    [
      "dependency-authorities",
      [
        "## Dependency Authorities",
        "",
        ...(dependencyRows.length > 0
          ? markdownTable(
              [
                "Dependency",
                "Specifier",
                "Allowed imports",
                "Allowed invocations",
                "Used by artifacts",
                "Authority"
              ],
              dependencyRows
            )
          : ["No dependency authorities are declared."]),
        ""
      ]
    ],
    [
      "effect-authorities",
      [
        "## Effect Authorities",
        "",
        ...(effectRows.length > 0
          ? markdownTable(
              ["Effect", "Operation", "Used by artifacts", "Port", "Authority"],
              effectRows
            )
          : ["No effect authorities are declared."]),
        ""
      ]
    ],
    [
      "runtime-authorities",
      [
        "## Runtime Authorities",
        "",
        ...(runtimeRows.length > 0
          ? markdownTable(
              [
                "Runtime authority",
                "Invocation",
                "Used by artifacts",
                "Purpose"
              ],
              runtimeRows
            )
          : ["No runtime authorities are declared."]),
        ""
      ]
    ],
    [
      "source-authority-closures",
      [
        "## Source Authority Closures",
        "",
        ...(sourceAuthorityRows.length > 0
          ? markdownTable(
              [
                "Artifact",
                "Responsibilities",
                "Semantic edges",
                "Decisions",
                "Iterations",
                "Failure policies",
                "Projection mappings",
                "Result contracts"
              ],
              sourceAuthorityRows
            )
          : ["No source authority closures are declared."]),
        ""
      ]
    ],
    [
      "authority-closure-profile",
      [
        "## Authority Closure Profile",
        "",
        "The following closed-world authority posture is supplied by the content-addressed conformance profile. Exact coverage includes explicitly empty authority collections.",
        "",
        "```json",
        authorityClosureProfile,
        "```",
        ""
      ]
    ],
    [
      "artifact-scope-authority",
      [
        "## Artifact Scope Authority",
        "",
        "The governed path set below defines inventory authority. Paths outside it receive the declared outside-authority posture without implicit ignore rules.",
        "",
        "```json",
        artifactScopeProfile,
        "```",
        ""
      ]
    ],
    [
      "operation-authorities",
      [
        "## Operation Authorities",
        "",
        "The contract is the sole authored change authority. Governed artifacts are replace-only projections, and proof is observational.",
        "",
        "```json",
        operationAuthorities,
        "```",
        ""
      ]
    ],
    [
      "artifact-relationships",
      [
        "## Artifact Relationships",
        "",
        ...(relationshipRows.length > 0
          ? markdownTable(
              ["Source artifact", "Relationship", "Target artifact"],
              relationshipRows
            )
          : ["No artifact relationships are declared."]),
        ""
      ]
    ],
    [
      "exclusions",
      [
        "## Exclusions",
        "",
        ...markdownList(contract.exclusions.map(markdownCode)),
        ""
      ]
    ],
    [
      "conformance-evaluation",
      [
        "## Conformance Evaluation",
        "",
        `Fail closed: ${markdownCode(contract.conformance.failClosed)}`,
        "",
        "Evaluation order:",
        "",
        ...contract.conformance.evaluationOrder.map(
          (evaluation, index) => `${index + 1}. ${markdownCode(evaluation)}`
        ),
        "",
        "Declared command evaluations:",
        "",
        ...(evaluationRows.length > 0
          ? markdownTable(
              [
                "Evaluation",
                "Verifier",
                "Command",
                "Exit code",
                "Required standard output"
              ],
              evaluationRows
            )
          : ["No command evaluations are declared."]),
        ""
      ]
    ],
    [
      "terminal-dispositions",
      [
        "## Terminal Dispositions",
        "",
        "Contract validation:",
        "",
        ...markdownList(
          contract.conformance.terminalDispositions.contractValidation.map(
            markdownCode
          )
        ),
        "",
        "Artifact conformance:",
        "",
        ...markdownList(
          contract.conformance.terminalDispositions.artifactConformance.map(
            markdownCode
          )
        ),
        "",
        "Trust postures:",
        "",
        ...markdownList(
          contract.conformance.terminalDispositions.trustPostures.map(
            markdownCode
          )
        ),
        "",
        "Trust dispositions:",
        "",
        ...markdownList(
          contract.conformance.terminalDispositions.trustDispositions.map(
            markdownCode
          )
        ),
        ""
      ]
    ],
    [
      "receipt-requirements",
      [
        "## Receipt Requirements",
        "",
        ...markdownTable(
          ["Evidence record", "Type", "Relative path"],
          [
            [
              "Projection ledger",
              markdownCode(contract.projectionLedger.ledgerType),
              markdownCode(contract.projectionLedger.relativePath)
            ],
            [
              "Conformance receipt",
              markdownCode(contract.receipt.receiptType),
              markdownCode(contract.receipt.relativePath)
            ]
          ]
        ),
        "",
        "Projection-ledger evidence:",
        "",
        ...markdownList(contract.projectionLedger.requiredEvidence.map(markdownCode)),
        "",
        "Conformance-receipt evidence:",
        "",
        ...markdownList(contract.receipt.requiredEvidence.map(markdownCode)),
        ""
      ]
    ],
    [
      "claim-policies",
      [
        "## Claim Policies",
        "",
        ...markdownTable(
          [
            "Claim authority",
            "Admitted claim",
            "Required conformance",
            "Required authority closure",
            "Required artifact scope",
            "Required proof",
            "Required trust"
          ],
          claimRows
        ),
        ""
      ]
    ],
    [
      "review-checklist",
      [
        "## Review Checklist",
        "",
        ...authority.reviewChecklist.map((entry) => `- [ ] ${entry}`),
        ""
      ]
    ]
  ]);

  const lines = [
    `# ${authority.documentTitle}`,
    "",
    `> ${authority.documentStatusLabel}`,
    ">",
    `> Contract: ${markdownCode(contract.contract.contractId)} | Version: ${markdownCode(contract.contract.contractVersion)} | Status: ${markdownCode(contract.contract.status)}`,
    ""
  ];
  for (const sectionId of authority.sectionOrder) {
    const section = sections.get(sectionId);
    if (!section) {
      throw new Error(`Review section is not supported: ${sectionId}`);
    }
    lines.push(...section);
  }
  return Buffer.from(`${lines.join("\n").trimEnd()}\n`, "utf8");
}

function projectContractMarkdown(authority, context) {
  return projectGovernedArtifactContractMarkdown(
    context.contract,
    authority,
    context.artifact.artifactId
  );
}

export function sourceTokens(text, language = "javascript") {
  return scanSource(text, language);
}

function projectedBytes(artifact, contract) {
  const projector = knownProjectors.get(artifact.projection.projectorId);
  if (!projector) {
    throw new Error(`Projector is not supported: ${artifact.projection.projectorId}`);
  }
  return projector(artifact.projection.authority, { contract, artifact });
}

function ontologyAuthorityEvidence(contract) {
  return contract.artifacts
    .filter(
      (artifact) =>
        artifact.projection.authority.authorityType ===
          "canonical-json-value.v1" &&
        artifact.projection.authority.value?.bundleType ===
          "semantic-execution-bundle.v1"
    )
    .map((artifact) => {
      const bundle = artifact.projection.authority.value;
      const proof = inspectDeterministicOntology(bundle);
      return {
        artifactId: artifact.artifactId,
        bundleId: bundle.bundleId,
        ontologyId: bundle.authority.ontologyId,
        ontologySha256: sha256(canonicalJsonBytes(bundle.authority)),
        runtimeProfile: structuredClone(bundle.runtimeProfile),
        ontologyDisposition: proof.ontologyDisposition
      };
    });
}

function projectionLedger(context) {
  return {
    ledgerType: context.contract.projectionLedger.ledgerType,
    contract: {
      contractId: context.contract.contract.contractId,
      contractSha256: context.contractDigest
    },
    interpretationBase: structuredClone(
      context.sourceContract.interpretationBase
    ),
    projectorRegistry: {
      identity: context.projectorRegistry.registryId,
      digest: context.projectorRegistryDigest
    },
    artifactScopeAuthority: {
      authority: artifactScopeAuthority(context.contract),
      authoritySha256: sha256(
        canonicalJsonBytes(artifactScopeAuthority(context.contract))
      )
    },
    authorityClosure: {
      conformanceProfile: structuredClone(
        context.sourceContract.interpretationBase.conformanceProfile
      ),
      profile: context.contract.authorityClosure,
      profileSha256: sha256(
        canonicalJsonBytes(context.contract.authorityClosure)
      )
    },
    operationAuthorities: {
      authority: context.contract.operationAuthorities,
      authoritySha256: sha256(
        canonicalJsonBytes(context.contract.operationAuthorities)
      )
    },
    dependencyAuthorities: context.contract.dependencies.map((dependency) => ({
      dependencyId: dependency.dependencyId,
      specifier: dependency.specifier,
      allowedImports: dependency.allowedImports,
      allowedInvocations: dependency.allowedInvocations,
      usedByArtifacts: dependency.usedByArtifacts,
      authority: dependency.authority
    })),
    effectAuthorities: context.contract.effects.map((effect) => ({
      effectId: effect.effectId,
      operation: effect.operation,
      usedByArtifacts: effect.usedByArtifacts,
      authority: effect.authority
    })),
    runtimeAuthorities: context.contract.runtimeAuthorities.map(
      (authority) => ({
        runtimeAuthorityId: authority.runtimeAuthorityId,
        invocation: authority.invocation,
        usedByArtifacts: authority.usedByArtifacts
      })
    ),
    sourceAuthorities: context.contract.artifacts
      .filter((artifact) => artifact.sourceAuthority)
      .map((artifact) => ({
        artifactId: artifact.artifactId,
        responsibilityIds: artifact.sourceAuthority.responsibilities.map(
          (entry) => entry.responsibilityId
        ),
        semanticEdgeIds: artifact.sourceAuthority.semanticEdges.map(
          (entry) => entry.edgeId
        ),
        decisionIds: artifact.sourceAuthority.decisions.map(
          (entry) => entry.decisionId
        ),
        iterationIds: artifact.sourceAuthority.iterations.map(
          (entry) => entry.iterationId
        ),
        failurePolicyIds: artifact.sourceAuthority.failurePolicies.map(
          (entry) => entry.failurePolicyId
        ),
        projectionMappingIds:
          artifact.sourceAuthority.projectionMappings.map(
            (entry) => entry.projectionMappingId
          ),
        resultContractIds: artifact.sourceAuthority.resultContracts.map(
          (entry) => entry.resultContractId
        )
      })),
    ontologyAuthorities: ontologyAuthorityEvidence(context.contract),
    artifactProjections: context.contract.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      authorityId: artifact.projection.authorityId,
      contentSha256: artifact.proof.contentSha256,
      projectionMode: artifact.projection.mode,
      projectorId: artifact.projection.projectorId
    }))
  };
}

function asAbsoluteConfined(root, relativePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...relativePath.split("/"));
  const relation = path.relative(resolvedRoot, resolved);
  if (relation === "" || (!relation.startsWith("..") && !path.isAbsolute(relation))) {
    return resolved;
  }
  throw new Error(`${label} escapes its declared root: ${relativePath}`);
}

function listRelativeFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  visit(root);
  return files.sort();
}

function relativePathIsWithin(relativePath, directory) {
  return (
    directory === "." ||
    relativePath === directory ||
    relativePath.startsWith(`${directory}/`)
  );
}

function artifactScopeContainsPath(contract, relativePath) {
  const scope = contract.workspace.governedScope;
  if (scope.inventoryMode === "exclusive-subtree") {
    return true;
  }
  return (
    contract.artifacts.some(
      (artifact) => artifact.relativePath === relativePath
    ) ||
    scope.governedDirectories.some((directory) =>
      relativePathIsWithin(relativePath, directory)
    ) ||
    contract.exclusions.includes(relativePath)
  );
}

function artifactScopeAuthority(contract) {
  const scope = contract.workspace.governedScope;
  const resolvedGovernedPathSet = [
    ...contract.artifacts.map((artifact) => ({
      pathKind: "artifact",
      relativePath: artifact.relativePath,
      authorityId: artifact.artifactId
    })),
    ...scope.governedDirectories.map((relativePath) => ({
      pathKind: "directory",
      relativePath
    })),
    ...contract.exclusions.map((relativePath) => ({
      pathKind: "exclusion",
      relativePath
    }))
  ].sort(
    (left, right) =>
      left.relativePath.localeCompare(right.relativePath) ||
      left.pathKind.localeCompare(right.pathKind)
  );
  return {
    scopeType: scope.scopeType,
    inventoryMode: scope.inventoryMode,
    workspaceRoot: contract.workspace.workspaceRoot,
    artifactRoot: contract.workspace.artifactRoot,
    governedDirectories: scope.governedDirectories,
    outsideScopePosture: scope.outsideScopePosture,
    requiredDisposition: scope.requiredDisposition,
    resolvedGovernedPathSet
  };
}

function observedArtifactScopePaths(contract, artifactRoot) {
  const scope = contract.workspace.governedScope;
  if (scope.inventoryMode === "exclusive-subtree") {
    return listRelativeFiles(artifactRoot);
  }
  const observed = new Set();
  for (const artifact of contract.artifacts) {
    const absolutePath = asAbsoluteConfined(
      artifactRoot,
      artifact.relativePath,
      "Artifact path"
    );
    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      observed.add(artifact.relativePath);
    }
  }
  for (const directory of scope.governedDirectories) {
    const absoluteDirectory = asAbsoluteConfined(
      artifactRoot,
      directory,
      "Governed directory"
    );
    if (!existsSync(absoluteDirectory)) {
      continue;
    }
    if (!statSync(absoluteDirectory).isDirectory()) {
      observed.add(directory);
      continue;
    }
    for (const relativePath of listRelativeFiles(absoluteDirectory)) {
      observed.add(
        directory === "." ? relativePath : `${directory}/${relativePath}`
      );
    }
  }
  return [...observed].sort();
}

function artifactScopeObservation(
  contract,
  observedPaths,
  undeclaredPaths,
  excludedPathsPresent
) {
  const authority = artifactScopeAuthority(contract);
  const outsideAuthorityRule =
    authority.inventoryMode === "exclusive-subtree"
      ? "outside-artifact-root"
      : "not-declared-and-not-within-governed-directory";
  return {
    scopeType: authority.scopeType,
    inventoryMode: authority.inventoryMode,
    resolvedGovernedPathSet: authority.resolvedGovernedPathSet,
    observedGovernedPaths: observedPaths,
    undeclaredPaths,
    excludedPathsPresent,
    outsideAuthorityClassification: {
      posture: authority.outsideScopePosture,
      rule: outsideAuthorityRule
    }
  };
}

function contractInvalid(findings) {
  return {
    operation: "validate-contract",
    contractValidationDisposition: "CONTRACT_INVALID",
    conformanceDisposition: "NOT_EVALUATED",
    trustPosture: "NOT_EVALUATED",
    trustDisposition: "REJECTED",
    findings
  };
}

function schemaNotAdmitted(findings) {
  return {
    operation: "validate-contract",
    contractValidationDisposition: "SCHEMA_NOT_ADMITTED",
    conformanceDisposition: "NOT_EVALUATED",
    trustPosture: "NOT_EVALUATED",
    trustDisposition: "REJECTED",
    findings
  };
}

function schemaDigestMismatch(expected, observed) {
  return {
    operation: "validate-contract",
    contractValidationDisposition: "SCHEMA_DIGEST_MISMATCH",
    conformanceDisposition: "NOT_EVALUATED",
    trustPosture: "NOT_EVALUATED",
    trustDisposition: "REJECTED",
    findings: [
      {
        findingId: "schema-digest",
        expected,
        observed
      }
    ]
  };
}

function resolveInputs(options) {
  if (!options.contractPath) {
    throw new Error("A governed artifact contract path is required.");
  }
  return {
    contractPath: path.resolve(options.contractPath),
    schemaPath: path.resolve(options.schemaPath ?? DEFAULT_SCHEMA_PATH),
    projectorRegistryPath: path.resolve(
      options.projectorRegistryPath ?? DEFAULT_PROJECTOR_REGISTRY_PATH
    ),
    verifierRegistryPath: path.resolve(
      options.verifierRegistryPath ?? DEFAULT_VERIFIER_REGISTRY_PATH
    ),
    conformanceProfilePath: path.resolve(
      options.conformanceProfilePath ?? DEFAULT_CONFORMANCE_PROFILE_PATH
    ),
    migrationRegistryPath: path.resolve(
      options.migrationRegistryPath ?? DEFAULT_MIGRATION_REGISTRY_PATH
    ),
    schemaCatalogPath: path.resolve(
      options.schemaCatalogPath ?? DEFAULT_SCHEMA_CATALOG_PATH
    ),
    enginePath: DEFAULT_ENGINE_PATH,
    workspacePath: path.resolve(options.workspacePath ?? process.cwd())
  };
}

function validateCrossReferences(contract, projectorRegistry, verifierRegistry) {
  const findings = [];
  const artifactIds = new Set();
  const artifactPaths = new Set();
  const authorityIds = new Set();
  const dependencyIds = new Set();
  const dependencySpecifiers = new Set();
  const effectIds = new Set();
  const effectOperations = new Set();
  const runtimeAuthorityIds = new Set();
  const runtimeInvocations = new Set();
  const projectorEntries = new Map(
    projectorRegistry.projectors.map((entry) => [entry.projectorId, entry])
  );
  const verifierIds = new Set(
    verifierRegistry.verifiers.map((entry) => entry.verifierId)
  );
  const governedDirectories =
    contract.workspace.governedScope.governedDirectories;
  for (let leftIndex = 0; leftIndex < governedDirectories.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < governedDirectories.length;
      rightIndex += 1
    ) {
      const left = governedDirectories[leftIndex];
      const right = governedDirectories[rightIndex];
      if (
        relativePathIsWithin(left, right) ||
        relativePathIsWithin(right, left)
      ) {
        findings.push({
          findingId: "overlapping-governed-directories",
          relativePaths: [left, right]
        });
      }
    }
  }

  for (const dependency of contract.dependencies) {
    if (dependencyIds.has(dependency.dependencyId)) {
      findings.push({
        findingId: "duplicate-dependency-id",
        dependencyId: dependency.dependencyId
      });
    }
    dependencyIds.add(dependency.dependencyId);
    if (dependencySpecifiers.has(dependency.specifier)) {
      findings.push({
        findingId: "duplicate-dependency-specifier",
        specifier: dependency.specifier
      });
    }
    dependencySpecifiers.add(dependency.specifier);
  }
  for (const effect of contract.effects) {
    if (effectIds.has(effect.effectId)) {
      findings.push({
        findingId: "duplicate-effect-id",
        effectId: effect.effectId
      });
    }
    effectIds.add(effect.effectId);
    if (effectOperations.has(effect.operation)) {
      findings.push({
        findingId: "duplicate-effect-operation",
        operation: effect.operation
      });
    }
    effectOperations.add(effect.operation);
  }
  for (const runtimeAuthority of contract.runtimeAuthorities) {
    if (runtimeAuthorityIds.has(runtimeAuthority.runtimeAuthorityId)) {
      findings.push({
        findingId: "duplicate-runtime-authority-id",
        runtimeAuthorityId: runtimeAuthority.runtimeAuthorityId
      });
    }
    runtimeAuthorityIds.add(runtimeAuthority.runtimeAuthorityId);
    if (runtimeInvocations.has(runtimeAuthority.invocation)) {
      findings.push({
        findingId: "duplicate-runtime-invocation",
        invocation: runtimeAuthority.invocation
      });
    }
    runtimeInvocations.add(runtimeAuthority.invocation);
  }

  for (const artifact of contract.artifacts) {
    if (artifactIds.has(artifact.artifactId)) {
      findings.push({
        findingId: "duplicate-artifact-id",
        artifactId: artifact.artifactId
      });
    }
    artifactIds.add(artifact.artifactId);
    if (artifactPaths.has(artifact.relativePath)) {
      findings.push({
        findingId: "duplicate-artifact-path",
        relativePath: artifact.relativePath
      });
    }
    artifactPaths.add(artifact.relativePath);
    if (authorityIds.has(artifact.projection.authorityId)) {
      findings.push({
        findingId: "duplicate-authority-id",
        authorityId: artifact.projection.authorityId
      });
    }
    authorityIds.add(artifact.projection.authorityId);
    const projectedJsonValue =
      artifact.projection.authority.authorityType === "canonical-json-value.v1"
        ? artifact.projection.authority.value
        : undefined;
    if (projectedJsonValue?.bundleType === "semantic-execution-bundle.v1") {
      if (artifact.artifactKind !== "deterministic-ontology-bundle") {
        findings.push({
          findingId: "ontology-bundle-artifact-kind",
          artifactId: artifact.artifactId,
          expected: "deterministic-ontology-bundle",
          observed: artifact.artifactKind
        });
      }
      for (const ontologyFinding of validateSemanticExecutionBundle(
        projectedJsonValue
      )) {
        findings.push({
          ...ontologyFinding,
          artifactId: artifact.artifactId
        });
      }
    }

    const projectorEntry = projectorEntries.get(artifact.projection.projectorId);
    if (!projectorEntry) {
      findings.push({
        findingId: "projector-not-registered",
        artifactId: artifact.artifactId,
        projectorId: artifact.projection.projectorId
      });
    } else if (
      projectorEntry.authorityType !== artifact.projection.authority.authorityType
    ) {
      findings.push({
        findingId: "projector-authority-mismatch",
        artifactId: artifact.artifactId,
        projectorId: artifact.projection.projectorId
      });
    }
    if (
      [
        "deterministic-ontology-documentation-projector.v1",
        "deterministic-ontology-schema-projector.v1"
      ].includes(artifact.projection.projectorId)
    ) {
      const projectionAuthority = artifact.projection.authority.value;
      const expectedProjectionKind =
        artifact.projection.projectorId ===
        "deterministic-ontology-schema-projector.v1"
          ? "bound-schema"
          : "ontology-documentation";
      const bundleArtifact = contract.artifacts.find(
        (entry) =>
          entry.artifactId === projectionAuthority?.bundleArtifactId &&
          entry.artifactKind === "deterministic-ontology-bundle" &&
          entry.projection.authority.authorityType ===
            "canonical-json-value.v1" &&
          entry.projection.authority.value?.bundleType ===
            "semantic-execution-bundle.v1"
      );
      const bundle = bundleArtifact?.projection.authority.value;
      const subjectResolves =
        expectedProjectionKind === "bound-schema"
          ? bundle?.schemas.filter(
              (schema) => schema.schemaId === projectionAuthority?.subjectId
            ).length === 1
          : bundle?.authority?.ontologyId === projectionAuthority?.subjectId;
      const relationships = artifact.relationships.filter(
        (relationship) =>
          relationship.relationshipType === "derived-from-ontology" &&
          relationship.artifactId === projectionAuthority?.bundleArtifactId
      );
      if (
        projectionAuthority?.authorityType !==
          "deterministic-ontology-projection.v1" ||
        projectionAuthority?.projectionKind !== expectedProjectionKind ||
        Object.keys(projectionAuthority ?? {}).sort().join(",") !==
          "authorityType,bundleArtifactId,projectionKind,subjectId" ||
        !bundleArtifact ||
        !subjectResolves ||
        relationships.length !== 1
      ) {
        findings.push({
          findingId: "ontology-derived-projection-unresolved",
          artifactId: artifact.artifactId,
          projectorId: artifact.projection.projectorId
        });
      }
    }

    for (const verifierId of artifact.proof.verifierIds) {
      if (!verifierIds.has(verifierId)) {
        findings.push({
          findingId: "verifier-not-registered",
          artifactId: artifact.artifactId,
          verifierId
        });
      } else if (!knownVerifierIds.has(verifierId)) {
        findings.push({
          findingId: "verifier-not-supported",
          artifactId: artifact.artifactId,
          verifierId
        });
      }
    }

    if (
      artifact.projection.mode === "projected" &&
      artifact.ownership !== "contract-owned"
    ) {
      findings.push({
        findingId: "projection-ownership-mismatch",
        artifactId: artifact.artifactId
      });
    }
    if (
      artifact.projection.mode === "admitted" &&
      artifact.ownership !== "admitted-external"
    ) {
      findings.push({
        findingId: "admission-ownership-mismatch",
        artifactId: artifact.artifactId
      });
    }
    if (
      artifact.proof.metaSchemaValidationRequired === true &&
      !artifact.proof.verifierIds.includes("json-meta-schema-verifier.v1")
    ) {
      findings.push({
        findingId: "meta-schema-verifier-missing",
        artifactId: artifact.artifactId
      });
    }
    if (
      artifact.proof.requiredSections !== undefined &&
      !artifact.proof.verifierIds.includes("markdown-section-verifier.v1")
    ) {
      findings.push({
        findingId: "markdown-section-verifier-missing",
        artifactId: artifact.artifactId
      });
    }
    if (
      artifact.proof.forbiddenText !== undefined &&
      !artifact.proof.verifierIds.includes("forbidden-text-verifier.v1")
    ) {
      findings.push({
        findingId: "forbidden-text-verifier-missing",
        artifactId: artifact.artifactId
      });
    }
    const isSourceArtifact =
      artifact.projection.authority.authorityType ===
      "lossless-source-tokens.v1";
    if (
      isSourceArtifact &&
      (!artifact.sourceAuthority ||
        !artifact.proof.verifierIds.includes("authority-closure-verifier.v1"))
    ) {
      findings.push({
        findingId: "source-authority-closure-missing",
        artifactId: artifact.artifactId
      });
    }
    if (!isSourceArtifact && artifact.sourceAuthority) {
      findings.push({
        findingId: "source-authority-on-non-source-artifact",
        artifactId: artifact.artifactId
      });
    }
    if (
      contract.operationAuthorities.bodyPurity &&
      ["1.8.0", "1.9.0"].includes(contract.contract.contractVersion) &&
      artifact.sourceAuthority?.projectionMappings.length > 0 &&
      !isSemanticExecutionBody(contract, artifact)
    ) {
      findings.push({
        findingId: "semantic-execution-body-authority-required",
        artifactId: artifact.artifactId
      });
    }
    if (artifact.sourceAuthority) {
      const authorityCollections = [
        [
          artifact.sourceAuthority.responsibilities,
          "responsibilityId"
        ],
        [artifact.sourceAuthority.semanticEdges, "edgeId"],
        [artifact.sourceAuthority.decisions, "decisionId"],
        [artifact.sourceAuthority.iterations, "iterationId"],
        [
          artifact.sourceAuthority.failurePolicies,
          "failurePolicyId"
        ],
        [
          artifact.sourceAuthority.projectionMappings,
          "projectionMappingId"
        ],
        [
          artifact.sourceAuthority.resultContracts,
          "resultContractId"
        ]
      ];
      for (const [entries, identityField] of authorityCollections) {
        const identities = entries.map((entry) => entry[identityField]);
        if (new Set(identities).size !== identities.length) {
          findings.push({
            findingId: "duplicate-source-authority-id",
            artifactId: artifact.artifactId,
            identityField
          });
        }
      }
      const moduleResponsibilities =
        artifact.sourceAuthority.responsibilities.filter(
          (responsibility) =>
            responsibility.responsibilityType === "module" &&
            responsibility.declaration === "<module>"
        );
      if (moduleResponsibilities.length !== 1) {
        findings.push({
          findingId: "module-responsibility-cardinality",
          artifactId: artifact.artifactId
        });
      }
      if (isSemanticExecutionBody(contract, artifact)) {
        const executionBinding = semanticExecutionBinding(contract, artifact);
        const executionEdge = executionBinding.executionEdge;
        const semanticAuthorityArtifacts = artifact.relationships
          .filter((relationship) => relationship.relationshipType === "reads")
          .map((relationship) =>
            contract.artifacts.find(
              (entry) => entry.artifactId === relationship.artifactId
            )
          )
          .filter(
            (entry) =>
              entry?.artifactKind === "semantic-execution-authority" ||
              entry?.artifactKind === "deterministic-ontology-bundle"
          );
        const semanticSubject =
          semanticAuthorityArtifacts[0]?.projection.authority.value;
        const functionResponsibilities =
          artifact.sourceAuthority.responsibilities.filter(
            (responsibility) =>
              responsibility.responsibilityType === "function"
          );
        if (
          functionResponsibilities.length !== 1 ||
          functionResponsibilities[0].responsibilityId !==
            executionEdge?.responsibilityId
        ) {
          findings.push({
            findingId: "semantic-body-responsibility-cardinality",
            artifactId: artifact.artifactId
          });
        }
        const semanticSubjectType =
          semanticSubject?.authorityType ?? semanticSubject?.bundleType;
        if (
          semanticAuthorityArtifacts.length !== 1 ||
          !contract.operationAuthorities.bodyPurity.admittedAuthorityTypes.includes(
            semanticSubjectType
          ) ||
          executionBinding.dependencies.length !== 1 ||
          executionBinding.runtimes.length !== 1 ||
          !executionEdge ||
          executionEdge.occurrences !== 1 ||
          executionBinding.executionEdges.length !== 1
        ) {
          findings.push({
            findingId: "semantic-execution-boundary-unresolved",
            artifactId: artifact.artifactId
          });
        }
        if (semanticSubjectType === "semantic-projection-authority.v1") {
          const schemaArtifact = contract.artifacts.find(
            (entry) =>
              entry.artifactId === semanticSubject?.input?.schemaArtifactId
          );
          if (
            schemaArtifact?.artifactKind !== "json-schema" ||
            schemaArtifact.projection.authority.authorityType !==
              "canonical-json-value.v1"
          ) {
            findings.push({
              findingId: "semantic-input-schema-unresolved",
              artifactId: artifact.artifactId,
              inputSchemaArtifactId:
                semanticSubject?.input?.schemaArtifactId
            });
          }
          for (const [collection, identityField, authorityId] of [
            [
              artifact.sourceAuthority.failurePolicies,
              "failurePolicyId",
              semanticSubject?.failure?.failurePolicyId
            ],
            [
              artifact.sourceAuthority.projectionMappings,
              "projectionMappingId",
              semanticSubject?.projection?.projectionMappingId
            ],
            [
              artifact.sourceAuthority.resultContracts,
              "resultContractId",
              semanticSubject?.result?.resultContractId
            ]
          ]) {
            if (
              collection.length !== 1 ||
              collection[0][identityField] !== authorityId
            ) {
              findings.push({
                findingId: "semantic-body-authority-cardinality",
                artifactId: artifact.artifactId,
                identityField,
                authorityId
              });
            }
          }
          const mapping = artifact.sourceAuthority.projectionMappings[0];
          const failure = artifact.sourceAuthority.failurePolicies[0];
          const result = artifact.sourceAuthority.resultContracts[0];
          const failureMessageMatch =
            /^new Error\((?<message>"(?:[^"\\]|\\.)*")\)$/.exec(
              failure?.expression ?? ""
            );
          const failureMessage =
            failureMessageMatch?.groups?.message === undefined
              ? undefined
              : JSON.parse(failureMessageMatch.groups.message);
          const expectedSemanticAuthority = {
            authorityType: "semantic-projection-authority.v1",
            failure: {
              failurePolicyId: failure?.failurePolicyId,
              message: failureMessage
            },
            input: {
              schemaArtifactId: schemaArtifact?.artifactId
            },
            projection: {
              fields: mapping?.fields.map((field) => ({
                outputField: field.outputField,
                sourcePath: field.sourceExpression.split(".").slice(1)
              })),
              projectionMappingId: mapping?.projectionMappingId
            },
            result: {
              resultContractId: result?.resultContractId,
              serialization:
                result?.resultKind === "projected-json-text"
                  ? "json-two-space-lf"
                  : "identity"
            }
          };
          if (
            JSON.stringify(canonicalize(semanticSubject)) !==
            JSON.stringify(canonicalize(expectedSemanticAuthority))
          ) {
            findings.push({
              findingId: "semantic-execution-authority-mismatch",
              artifactId: artifact.artifactId
            });
          }
        } else if (
          semanticSubjectType === "semantic-execution-bundle.v1" &&
          (semanticSubject?.authority?.authorityType !==
            "deterministic-ontology-authority.v1" ||
            artifact.sourceAuthority.decisions.length !== 0 ||
            artifact.sourceAuthority.iterations.length !== 0 ||
            artifact.sourceAuthority.failurePolicies.length !== 0 ||
            artifact.sourceAuthority.projectionMappings.length !== 0 ||
            artifact.sourceAuthority.resultContracts.length !== 1)
        ) {
          findings.push({
            findingId: "ontology-execution-body-authority-not-closed",
            artifactId: artifact.artifactId
          });
        }
      }
      const declaredSyntaxKinds = new Set([
        ...(isSemanticExecutionBody(contract, artifact)
          ? []
          : artifact.sourceAuthority.decisions.map(
          (authority) => authority.syntaxKind
        )),
        ...(isSemanticExecutionBody(contract, artifact)
          ? []
          : artifact.sourceAuthority.iterations.map(
          (authority) => authority.syntaxKind
        )),
        ...(isSemanticExecutionBody(contract, artifact)
          ? []
          : artifact.sourceAuthority.failurePolicies.map(
          (authority) => authority.syntaxKind
        )),
        ...(!isSemanticExecutionBody(contract, artifact) &&
        artifact.sourceAuthority.projectionMappings.length > 0
          ? ["ObjectLiteralExpression"]
          : []),
        ...(artifact.sourceAuthority.resultContracts.some(
          (result) => result.source.sourceType === "return"
        )
          ? ["ReturnStatement"]
          : [])
      ]);
      for (const forbiddenSyntaxKind of artifact.sourceAuthority
        .forbiddenSyntaxKinds) {
        if (declaredSyntaxKinds.has(forbiddenSyntaxKind)) {
          findings.push({
            findingId: "source-authority-syntax-conflict",
            artifactId: artifact.artifactId,
            syntaxKind: forbiddenSyntaxKind
          });
        }
      }
    }
    if (
      artifact.projection.projectorId ===
      "governed-artifact-contract-markdown-projector.v1"
    ) {
      const expectedSections = [
        `# ${artifact.projection.authority.documentTitle}`,
        "## Future-State Preview",
        "## Reviewer Perspective",
        "## Governing Loop",
        "## Contract Authority",
        "## Semantic Subject",
        "## Artifact Family",
        "## Projection Authorities",
        "## Dependency Authorities",
        "## Effect Authorities",
        "## Runtime Authorities",
        "## Source Authority Closures",
        "## Authority Closure Profile",
        "## Artifact Scope Authority",
        "## Operation Authorities",
        "## Artifact Relationships",
        "## Exclusions",
        "## Conformance Evaluation",
        "## Terminal Dispositions",
        "## Receipt Requirements",
        "## Claim Policies",
        "## Review Checklist"
      ];
      if (
        artifact.artifactKind !== "markdown-document" ||
        artifact.mediaType !== "text/markdown" ||
        !artifact.proof.verifierIds.includes("markdown-section-verifier.v1") ||
        JSON.stringify(artifact.proof.requiredSections) !==
          JSON.stringify(expectedSections)
      ) {
        findings.push({
          findingId: "contract-review-markdown-binding",
          artifactId: artifact.artifactId
        });
      }
    }

    try {
      const bytes = projectedBytes(artifact, contract);
      if (artifact.sourceAuthority) {
        const sourceObservation = inspectSourceAuthority(
          bytes.toString("utf8"),
          artifact.projection.authority.language
        );
        const authorityFindings = verifySourceAuthorityClosure(
          contract,
          artifact,
          sourceObservation
        );
        if (authorityFindings.length > 0) {
          findings.push({
            findingId: "source-authority-declaration-mismatch",
            artifactId: artifact.artifactId,
            authorityFindings
          });
        }
      }
      const observedDigest = sha256(bytes);
      if (observedDigest !== artifact.proof.contentSha256) {
        findings.push({
          findingId: "declared-content-digest-mismatch",
          artifactId: artifact.artifactId,
          expected: artifact.proof.contentSha256,
          observed: observedDigest
        });
      }
      if (bytes.length !== artifact.proof.expectedByteLength) {
        findings.push({
          findingId: "declared-byte-length-mismatch",
          artifactId: artifact.artifactId,
          expected: artifact.proof.expectedByteLength,
          observed: bytes.length
        });
      }
    } catch (error) {
      findings.push({
        findingId: "projection-authority-invalid",
        artifactId: artifact.artifactId,
        detail: error.message
      });
    }
  }

  for (const dependency of contract.dependencies) {
    for (const artifactId of dependency.usedByArtifacts) {
      if (!artifactIds.has(artifactId)) {
        findings.push({
          findingId: "dependency-artifact-missing",
          dependencyId: dependency.dependencyId,
          artifactId
        });
      } else if (
        !contract.artifacts.find((artifact) => artifact.artifactId === artifactId)
          ?.sourceAuthority
      ) {
        findings.push({
          findingId: "dependency-user-source-authority-missing",
          dependencyId: dependency.dependencyId,
          artifactId
        });
      }
    }
    if (dependency.authority.authorityType === "artifact-authority.v1") {
      if (!artifactIds.has(dependency.authority.artifactId)) {
        findings.push({
          findingId: "dependency-authority-artifact-missing",
          dependencyId: dependency.dependencyId,
          artifactId: dependency.authority.artifactId
        });
      }
      for (const artifactId of dependency.usedByArtifacts) {
        const artifact = contract.artifacts.find(
          (entry) => entry.artifactId === artifactId
        );
        if (
          artifact &&
          !artifact.relationships.some(
            (relationship) =>
              relationship.artifactId === dependency.authority.artifactId &&
              relationship.relationshipType ===
                dependency.authority.semanticEdge
          )
        ) {
          findings.push({
            findingId: "dependency-semantic-edge-missing",
            dependencyId: dependency.dependencyId,
            artifactId,
            targetArtifactId: dependency.authority.artifactId,
            semanticEdge: dependency.authority.semanticEdge
          });
        }
      }
    }
  }

  for (const effect of contract.effects) {
    for (const artifactId of effect.usedByArtifacts) {
      const artifact = contract.artifacts.find(
        (entry) => entry.artifactId === artifactId
      );
      if (!artifact) {
        findings.push({
          findingId: "effect-artifact-missing",
          effectId: effect.effectId,
          artifactId
        });
      } else if (!artifact.sourceAuthority) {
        findings.push({
          findingId: "effect-user-source-authority-missing",
          effectId: effect.effectId,
          artifactId
        });
      }
    }
  }

  for (const runtimeAuthority of contract.runtimeAuthorities) {
    for (const artifactId of runtimeAuthority.usedByArtifacts) {
      const artifact = contract.artifacts.find(
        (entry) => entry.artifactId === artifactId
      );
      if (!artifact) {
        findings.push({
          findingId: "runtime-authority-artifact-missing",
          runtimeAuthorityId: runtimeAuthority.runtimeAuthorityId,
          artifactId
        });
      } else if (!artifact.sourceAuthority) {
        findings.push({
          findingId: "runtime-authority-source-missing",
          runtimeAuthorityId: runtimeAuthority.runtimeAuthorityId,
          artifactId
        });
      }
    }
  }

  const explicitAuthorities = new Map();
  const registerExplicitAuthority = (
    identity,
    authorityType,
    artifactId,
    authority
  ) => {
    if (explicitAuthorities.has(identity)) {
      findings.push({
        findingId: "duplicate-explicit-authority-id",
        authorityId: identity,
        artifactId
      });
    } else {
      explicitAuthorities.set(identity, {
        authorityType,
        artifactId,
        authority
      });
    }
  };
  for (const artifact of contract.artifacts) {
    if (!artifact.sourceAuthority) {
      continue;
    }
    for (const responsibility of artifact.sourceAuthority.responsibilities) {
      registerExplicitAuthority(
        responsibility.responsibilityId,
        "responsibility-authority",
        artifact.artifactId,
        responsibility
      );
    }
    for (const mapping of artifact.sourceAuthority.projectionMappings) {
      registerExplicitAuthority(
        mapping.projectionMappingId,
        "projection-authority",
        artifact.artifactId,
        mapping
      );
    }
    for (const failure of artifact.sourceAuthority.failurePolicies) {
      registerExplicitAuthority(
        failure.failurePolicyId,
        "failure-authority",
        artifact.artifactId,
        failure
      );
    }
    for (const result of artifact.sourceAuthority.resultContracts) {
      registerExplicitAuthority(
        result.resultContractId,
        "result-authority",
        artifact.artifactId,
        result
      );
    }
  }

  const dependencyById = new Map(
    contract.dependencies.map((dependency) => [
      dependency.dependencyId,
      dependency
    ])
  );
  const effectById = new Map(
    contract.effects.map((effect) => [effect.effectId, effect])
  );
  const runtimeById = new Map(
    contract.runtimeAuthorities.map((authority) => [
      authority.runtimeAuthorityId,
      authority
    ])
  );
  for (const artifact of contract.artifacts) {
    const sourceAuthority = artifact.sourceAuthority;
    if (!sourceAuthority) {
      continue;
    }
    const localResponsibilityIds = new Set(
      sourceAuthority.responsibilities.map(
        (responsibility) => responsibility.responsibilityId
      )
    );
    const edgeIds = new Set(
      sourceAuthority.semanticEdges.map((edge) => edge.edgeId)
    );
    for (const authority of [
      ...sourceAuthority.decisions,
      ...sourceAuthority.iterations,
      ...sourceAuthority.failurePolicies,
      ...sourceAuthority.projectionMappings
    ]) {
      if (!localResponsibilityIds.has(authority.responsibilityId)) {
        findings.push({
          findingId: "source-authority-responsibility-missing",
          artifactId: artifact.artifactId,
          responsibilityId: authority.responsibilityId
        });
      }
    }
    for (const edge of sourceAuthority.semanticEdges) {
      if (!localResponsibilityIds.has(edge.responsibilityId)) {
        findings.push({
          findingId: "semantic-edge-responsibility-missing",
          artifactId: artifact.artifactId,
          edgeId: edge.edgeId,
          responsibilityId: edge.responsibilityId
        });
      }
      for (const reference of edge.authorities) {
        let resolved = null;
        if (reference.authorityType === "dependency-authority") {
          resolved = dependencyById.get(reference.dependencyId);
          if (
            resolved &&
            !resolved.usedByArtifacts.includes(artifact.artifactId)
          ) {
            resolved = null;
          }
        } else if (reference.authorityType === "effect-authority") {
          resolved = effectById.get(reference.effectId);
          if (
            resolved &&
            (!resolved.usedByArtifacts.includes(artifact.artifactId) ||
              resolved.operation !== edge.operation)
          ) {
            resolved = null;
          }
        } else if (reference.authorityType === "runtime-authority") {
          resolved = runtimeById.get(reference.runtimeAuthorityId);
          if (
            resolved &&
            (!resolved.usedByArtifacts.includes(artifact.artifactId) ||
              edge.edgeKind !== "invocation" ||
              resolved.invocation !== edge.operation)
          ) {
            resolved = null;
          }
        } else {
          const referenceId =
            reference.responsibilityId ??
            reference.projectionMappingId ??
            reference.failurePolicyId ??
            reference.resultContractId;
          const registered = explicitAuthorities.get(referenceId);
          if (
            registered?.authorityType === reference.authorityType &&
            registered.artifactId === artifact.artifactId
          ) {
            resolved = registered;
          }
        }
        if (!resolved) {
          findings.push({
            findingId: "semantic-edge-authority-unresolved",
            artifactId: artifact.artifactId,
            edgeId: edge.edgeId,
            reference
          });
        }
      }
    }
    const referencedDependencyIds = new Set(
      sourceAuthority.semanticEdges.flatMap((edge) =>
        edge.authorities
          .filter(
            (reference) =>
              reference.authorityType === "dependency-authority"
          )
          .map((reference) => reference.dependencyId)
      )
    );
    const referencedEffectIds = new Set(
      sourceAuthority.semanticEdges.flatMap((edge) =>
        edge.authorities
          .filter(
            (reference) =>
              reference.authorityType === "effect-authority"
          )
          .map((reference) => reference.effectId)
      )
    );
    const referencedRuntimeIds = new Set(
      sourceAuthority.semanticEdges.flatMap((edge) =>
        edge.authorities
          .filter(
            (reference) =>
              reference.authorityType === "runtime-authority"
          )
          .map((reference) => reference.runtimeAuthorityId)
      )
    );
    for (const dependency of contract.dependencies.filter((entry) =>
      entry.usedByArtifacts.includes(artifact.artifactId)
    )) {
      if (!referencedDependencyIds.has(dependency.dependencyId)) {
        findings.push({
          findingId: "dependency-semantic-edge-authority-missing",
          artifactId: artifact.artifactId,
          dependencyId: dependency.dependencyId
        });
      }
    }
    for (const effect of contract.effects.filter((entry) =>
      entry.usedByArtifacts.includes(artifact.artifactId)
    )) {
      if (!referencedEffectIds.has(effect.effectId)) {
        findings.push({
          findingId: "effect-semantic-edge-authority-missing",
          artifactId: artifact.artifactId,
          effectId: effect.effectId
        });
      }
    }
    for (const runtimeAuthority of contract.runtimeAuthorities.filter(
      (entry) => entry.usedByArtifacts.includes(artifact.artifactId)
    )) {
      if (
        !referencedRuntimeIds.has(runtimeAuthority.runtimeAuthorityId)
      ) {
        findings.push({
          findingId: "runtime-semantic-edge-authority-missing",
          artifactId: artifact.artifactId,
          runtimeAuthorityId: runtimeAuthority.runtimeAuthorityId
        });
      }
    }
    for (const result of sourceAuthority.resultContracts) {
      if (
        result.source.sourceType === "return" &&
        !localResponsibilityIds.has(result.source.responsibilityId)
      ) {
        findings.push({
          findingId: "result-responsibility-missing",
          artifactId: artifact.artifactId,
          resultContractId: result.resultContractId
        });
      }
      if (result.source.sourceType === "effect") {
        const sourceEdge = sourceAuthority.semanticEdges.find(
          (edge) => edge.edgeId === result.source.semanticEdgeId
        );
        const effect = effectById.get(result.source.effectId);
        const edgeDeclaresEffect = sourceEdge?.authorities.some(
          (reference) =>
            reference.authorityType === "effect-authority" &&
            reference.effectId === result.source.effectId
        );
        const edgeDeclaresResult = sourceEdge?.authorities.some(
          (reference) =>
            reference.authorityType === "result-authority" &&
            reference.resultContractId === result.resultContractId
        );
        if (
          !effect ||
          !sourceEdge ||
          !edgeIds.has(result.source.semanticEdgeId) ||
          sourceEdge.edgeKind !== "invocation" ||
          sourceEdge.operation !== effect.operation ||
          sourceEdge.occurrences !== result.source.occurrences ||
          sourceEdge.argumentExpressions[result.source.argumentIndex] !==
            result.source.valueExpression ||
          !edgeDeclaresEffect ||
          !edgeDeclaresResult
        ) {
          findings.push({
            findingId: "result-effect-source-unresolved",
            artifactId: artifact.artifactId,
            resultContractId: result.resultContractId
          });
        }
      }
      if (result.projectionMapping) {
        const mappingArtifact = contract.artifacts.find(
          (entry) =>
            entry.artifactId === result.projectionMapping.artifactId
        );
        if (
          !mappingArtifact?.sourceAuthority?.projectionMappings.some(
            (mapping) =>
              mapping.projectionMappingId ===
              result.projectionMapping.projectionMappingId
          )
        ) {
          findings.push({
            findingId: "result-projection-mapping-unresolved",
            artifactId: artifact.artifactId,
            resultContractId: result.resultContractId
          });
        }
      }
    }
  }

  for (const dependency of contract.dependencies) {
    if (
      dependency.authority.authorityType === "artifact-authority.v1"
    ) {
      const target = explicitAuthorities.get(
        dependency.authority.responsibilityId
      );
      if (
        target?.authorityType !== "responsibility-authority" ||
        target.artifactId !== dependency.authority.artifactId
      ) {
        findings.push({
          findingId: "dependency-responsibility-unresolved",
          dependencyId: dependency.dependencyId,
          responsibilityId: dependency.authority.responsibilityId
        });
      }
    }
  }

  for (const artifact of contract.artifacts) {
    for (const relationship of artifact.relationships) {
      if (!artifactIds.has(relationship.artifactId)) {
        findings.push({
          findingId: "relationship-target-missing",
          artifactId: artifact.artifactId,
          targetArtifactId: relationship.artifactId
        });
      }
    }
  }

  for (const evaluation of contract.conformance.artifactEvaluations) {
    if (!verifierIds.has(evaluation.verifierId)) {
      findings.push({
        findingId: "evaluation-verifier-not-registered",
        evaluationId: evaluation.evaluationId,
        verifierId: evaluation.verifierId
      });
    } else if (!knownVerifierIds.has(evaluation.verifierId)) {
      findings.push({
        findingId: "evaluation-verifier-not-supported",
        evaluationId: evaluation.evaluationId,
        verifierId: evaluation.verifierId
      });
    }
  }

  for (const excludedPath of contract.exclusions) {
    if (artifactPaths.has(excludedPath)) {
      findings.push({
        findingId: "declared-artifact-is-excluded",
        relativePath: excludedPath
      });
    }
  }

  const claimIds = contract.claims.map((claim) => claim.claimId);
  const claims = contract.claims.map((claim) => claim.claim);
  if (new Set(claimIds).size !== claimIds.length) {
    findings.push({ findingId: "duplicate-claim-id" });
  }
  if (new Set(claims).size !== claims.length) {
    findings.push({ findingId: "duplicate-claim" });
  }

  return findings;
}

function inspectContext(options) {
  const inputs = resolveInputs(options);
  let schema;
  let sourceContract;
  let contract;
  let projectorRegistry;
  let verifierRegistry;
  let conformanceProfile;
  let migrationRegistry;

  try {
    schema = readJson(inputs.schemaPath, "Admitted contract schema");
  } catch (error) {
    return { report: schemaNotAdmitted([{ findingId: "schema-json", detail: error.message }]) };
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  if (!ajv.validateSchema(schema)) {
    return {
      report: schemaNotAdmitted([
        {
          findingId: "schema-meta-validation",
          errors: ajv.errors ?? []
        }
      ])
    };
  }

  try {
    sourceContract =
      options.contractDocument === undefined
        ? readJson(inputs.contractPath, "Governed artifact contract")
        : structuredClone(options.contractDocument);
  } catch (error) {
    return { report: contractInvalid([{ findingId: "contract-json", detail: error.message }]) };
  }

  if (sourceContract?.interpretationBase?.schema?.identity !== schema.$id) {
    return {
      report: schemaNotAdmitted([
        {
          findingId: "schema-identity",
          expected:
            sourceContract?.interpretationBase?.schema?.identity ?? null,
          observed: schema.$id ?? null
        }
      ])
    };
  }

  const observedSchemaDigest = sha256(readFileSync(inputs.schemaPath));
  if (
    sourceContract.interpretationBase.schema.digest !==
    observedSchemaDigest
  ) {
    return {
      report: schemaDigestMismatch(
        sourceContract.interpretationBase.schema.digest,
        observedSchemaDigest
      )
    };
  }

  try {
    projectorRegistry = readJson(inputs.projectorRegistryPath, "Projector registry");
    verifierRegistry = readJson(inputs.verifierRegistryPath, "Verifier registry");
    conformanceProfile = readJson(
      inputs.conformanceProfilePath,
      "Conformance profile"
    );
    migrationRegistry = readJson(
      inputs.migrationRegistryPath,
      "Migration registry"
    );
  } catch (error) {
    return {
      report: contractInvalid([{ findingId: "registry-json", detail: error.message }])
    };
  }

  const profileFinding = validateConformanceProfile(conformanceProfile);
  if (profileFinding) {
    return { report: profileInvalid(profileFinding) };
  }
  if (
    typeof migrationRegistry?.registryId !== "string" ||
    !Array.isArray(migrationRegistry?.migrations)
  ) {
    return {
      report: contractInvalid([
        {
          findingId: "migration-registry-structure",
          detail:
            "The migration registry requires an identity and a migration array."
        }
      ])
    };
  }

  if (
    typeof projectorRegistry?.registryId !== "string" ||
    !Array.isArray(projectorRegistry?.projectors) ||
    typeof verifierRegistry?.registryId !== "string" ||
    !Array.isArray(verifierRegistry?.verifiers)
  ) {
    return {
      report: contractInvalid([
        {
          findingId: "registry-structure",
          detail: "Each registry requires an identity and an entry array."
        }
      ])
    };
  }
  const projectorIds = projectorRegistry.projectors.map(
    (entry) => entry?.projectorId
  );
  const verifierEntryIds = verifierRegistry.verifiers.map(
    (entry) => entry?.verifierId
  );
  if (
    projectorIds.some((identity) => typeof identity !== "string") ||
    verifierEntryIds.some((identity) => typeof identity !== "string") ||
    new Set(projectorIds).size !== projectorIds.length ||
    new Set(verifierEntryIds).size !== verifierEntryIds.length
  ) {
    return {
      report: contractInvalid([
        {
          findingId: "registry-entry-identity",
          detail: "Registry entry identities must be present and unique."
        }
      ])
    };
  }

  const registryFindings = [];
  const observedProjectorDigest = sha256(readFileSync(inputs.projectorRegistryPath));
  const observedVerifierDigest = sha256(readFileSync(inputs.verifierRegistryPath));
  const observedProfileDigest = sha256(
    readFileSync(inputs.conformanceProfilePath)
  );
  const observedMigrationRegistryDigest = sha256(
    readFileSync(inputs.migrationRegistryPath)
  );
  const observedEngineDigest = sha256(readFileSync(inputs.enginePath));
  if (
    sourceContract.interpretationBase?.projectorRegistry?.identity !==
      projectorRegistry.registryId ||
    sourceContract.interpretationBase?.projectorRegistry?.digest !==
      observedProjectorDigest
  ) {
    registryFindings.push({
      findingId: "projector-registry-identity",
      expected:
        sourceContract.interpretationBase?.projectorRegistry ?? null,
      observed: {
        identity: projectorRegistry.registryId ?? null,
        digest: observedProjectorDigest
      }
    });
  }
  if (
    sourceContract.interpretationBase?.verifierRegistry?.identity !==
      verifierRegistry.registryId ||
    sourceContract.interpretationBase?.verifierRegistry?.digest !==
      observedVerifierDigest
  ) {
    registryFindings.push({
      findingId: "verifier-registry-identity",
      expected:
        sourceContract.interpretationBase?.verifierRegistry ?? null,
      observed: {
        identity: verifierRegistry.registryId ?? null,
        digest: observedVerifierDigest
      }
    });
  }
  if (
    sourceContract.interpretationBase?.conformanceProfile?.identity !==
      conformanceProfile.profileId ||
    sourceContract.interpretationBase?.conformanceProfile?.digest !==
      observedProfileDigest
  ) {
    registryFindings.push({
      findingId: "conformance-profile-identity",
      expected:
        sourceContract.interpretationBase?.conformanceProfile ?? null,
      observed: {
        identity: conformanceProfile.profileId ?? null,
        digest: observedProfileDigest
      }
    });
  }
  if (
    sourceContract.interpretationBase?.migrationRegistry?.identity !==
      migrationRegistry.registryId ||
    sourceContract.interpretationBase?.migrationRegistry?.digest !==
      observedMigrationRegistryDigest
  ) {
    registryFindings.push({
      findingId: "migration-registry-identity",
      expected:
        sourceContract.interpretationBase?.migrationRegistry ?? null,
      observed: {
        identity: migrationRegistry.registryId ?? null,
        digest: observedMigrationRegistryDigest
      }
    });
  }
  if (
    sourceContract.interpretationBase?.engine?.identity !==
      ENGINE_IDENTITY ||
    sourceContract.interpretationBase?.engine?.digest !==
      observedEngineDigest
  ) {
    registryFindings.push({
      findingId: "engine-identity",
      expected: sourceContract.interpretationBase?.engine ?? null,
      observed: {
        identity: ENGINE_IDENTITY,
        digest: observedEngineDigest
      }
    });
  }

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    return {
      report: schemaNotAdmitted([
        { findingId: "schema-compilation", detail: error.message }
      ])
    };
  }
  if (!validate(sourceContract)) {
    return {
      report: contractInvalid([
        {
          findingId: "contract-schema-validation",
          errors: validate.errors ?? []
        }
      ])
    };
  }

  contract = applyConformanceProfile(
    sourceContract,
    conformanceProfile
  );
  const semanticFindings = validateCrossReferences(
    contract,
    projectorRegistry,
    verifierRegistry
  );
  const findings = [
    ...registryFindings,
    ...semanticFindings.filter(
      (finding) =>
        !options.allowUnresolvedCommitments ||
        ![
          "declared-content-digest-mismatch",
          "declared-byte-length-mismatch"
        ].includes(finding.findingId)
    )
  ];
  if (findings.length > 0) {
    return { report: contractInvalid(findings) };
  }

  const workspaceRoot = asAbsoluteConfined(
    inputs.workspacePath,
    contract.workspace.workspaceRoot,
    "Workspace root"
  );
  const artifactRoot = asAbsoluteConfined(
    workspaceRoot,
    contract.workspace.artifactRoot,
    "Artifact root"
  );
  const receiptPath = asAbsoluteConfined(
    workspaceRoot,
    contract.receipt.relativePath,
    "Receipt path"
  );
  const projectionLedgerPath = asAbsoluteConfined(
    workspaceRoot,
    contract.projectionLedger.relativePath,
    "Projection ledger path"
  );
  const controlPathIsGoverned = (absolutePath) => {
    const relation = path.relative(artifactRoot, absolutePath);
    if (
      relation.startsWith("..") ||
      path.isAbsolute(relation)
    ) {
      return false;
    }
    const relativePath =
      relation === "" ? "." : relation.split(path.sep).join("/");
    return artifactScopeContainsPath(contract, relativePath);
  };
  if (controlPathIsGoverned(path.resolve(inputs.contractPath))) {
    return {
      report: contractInvalid([
        {
          findingId: "contract-inside-governed-scope",
          detail:
            "The contract is the sole authored change authority and cannot also be a projected artifact."
        }
      ])
    };
  }
  if (controlPathIsGoverned(receiptPath)) {
    return {
      report: contractInvalid([
        {
          findingId:
            contract.workspace.governedScope.inventoryMode ===
            "exclusive-subtree"
              ? "receipt-inside-artifact-root"
              : "receipt-inside-governed-scope",
          relativePath: contract.receipt.relativePath
        }
      ])
    };
  }
  if (
    controlPathIsGoverned(projectionLedgerPath) ||
    projectionLedgerPath === receiptPath
  ) {
    return {
      report: contractInvalid([
        {
          findingId: "projection-ledger-location",
          relativePath: contract.projectionLedger.relativePath
        }
      ])
    };
  }

  return {
    report: {
      operation: "validate-contract",
      contractValidationDisposition: "CONTRACT_VALID",
      conformanceDisposition: "NOT_EVALUATED",
      trustPosture: "NOT_EVALUATED",
      trustDisposition: "NOT_EVALUATED",
      findings: []
    },
    context: {
      ...inputs,
      schema,
      sourceContract,
      contract,
      projectorRegistry,
      verifierRegistry,
      conformanceProfile,
      migrationRegistry,
      workspaceRoot,
      artifactRoot,
      receiptPath,
      projectionLedgerPath,
      contractDigest:
        options.contractDocument === undefined
          ? sha256(readFileSync(inputs.contractPath))
          : sha256(canonicalJsonBytes(sourceContract)),
      schemaDigest: observedSchemaDigest,
      conformanceProfileDigest: observedProfileDigest,
      projectorRegistryDigest: observedProjectorDigest,
      verifierRegistryDigest: observedVerifierDigest,
      migrationRegistryDigest: observedMigrationRegistryDigest,
      engineDigest: observedEngineDigest
    }
  };
}

export function validateContract(options) {
  return inspectContext(options).report;
}

function reconciledContractCandidate(options, contractDocument) {
  const inspected = inspectContext({
    ...options,
    contractDocument,
    allowUnresolvedCommitments: true
  });
  if (!inspected.context) {
    return { report: inspected.report };
  }
  const candidate = structuredClone(contractDocument);
  const effective = inspected.context.contract;
  for (let index = 0; index < effective.artifacts.length; index += 1) {
    const artifact = effective.artifacts[index];
    const bytes = projectedBytes(artifact, effective);
    candidate.artifacts[index].proof.contentSha256 = sha256(bytes);
    candidate.artifacts[index].proof.expectedByteLength = bytes.length;
  }

  const replayEffective = applyConformanceProfile(
    candidate,
    inspected.context.conformanceProfile
  );
  const unresolved = [];
  for (const artifact of replayEffective.artifacts) {
    const bytes = projectedBytes(artifact, replayEffective);
    if (
      artifact.proof.contentSha256 !== sha256(bytes) ||
      artifact.proof.expectedByteLength !== bytes.length
    ) {
      unresolved.push(artifact.artifactId);
    }
  }
  if (unresolved.length > 0) {
    return {
      report: contractInvalid([
        {
          findingId:
            "DERIVED_COMMITMENT_RECONCILIATION_FAILED",
          artifactIds: unresolved
        }
      ])
    };
  }
  return {
    candidate,
    context: inspected.context,
    diff: exactJsonDiff(contractDocument, candidate)
  };
}

export function reconcileContractCommitments(options) {
  if (!options.contractPath) {
    throw new Error("Reconciliation requires --contract.");
  }
  const mode = options.mode ?? "check";
  if (!["check", "write"].includes(mode)) {
    throw new Error("Reconciliation mode must be check or write.");
  }
  const contractDocument = readJson(
    path.resolve(options.contractPath),
    "Governed artifact contract"
  );
  const reconciled = reconciledContractCandidate(
    options,
    contractDocument
  );
  if (!reconciled.candidate) {
    return reconciled.report;
  }
  const requiresReconciliation = reconciled.diff.length > 0;
  if (mode === "write" && requiresReconciliation) {
    writeCanonicalJsonAtomically(
      path.resolve(options.contractPath),
      reconciled.candidate
    );
  }
  return {
    operation: "reconcile-derived-commitments",
    contractValidationDisposition: "CONTRACT_VALID",
    reconciliationMode: mode,
    reconciliationDisposition:
      mode === "write" && requiresReconciliation
        ? "DERIVED_COMMITMENTS_RECONCILED"
        : requiresReconciliation
          ? "DERIVED_COMMITMENT_RECONCILIATION_REQUIRED"
          : "DERIVED_COMMITMENTS_CURRENT",
    writeDisposition:
      mode === "write" && requiresReconciliation
        ? "CONTRACT_COMMITMENTS_WRITTEN"
        : "CONTRACT_UNCHANGED",
    authority: structuredClone(
      reconciled.context.conformanceProfile.operationAuthorities
        .reconciliation
    ),
    mutationAuthority: structuredClone(
      reconciled.context.conformanceProfile.operationAuthorities
        .mutationAuthority
    ),
    candidateContract: reconciled.candidate,
    diff: reconciled.diff,
    artifactProjectionDisposition: "NOT_PERFORMED",
    trustDisposition: "NOT_EVALUATED"
  };
}

function declaredSchemaBinding(contract) {
  return (
    contract?.interpretationBase?.schema ??
    contract?.schema ??
    null
  );
}

function authoritySubsetMatches(observed, expected) {
  if (expected === undefined) {
    return true;
  }
  if (
    expected === null ||
    typeof expected !== "object" ||
    Array.isArray(expected)
  ) {
    return Object.is(observed, expected);
  }
  return Object.entries(expected).every(([key, value]) =>
    authoritySubsetMatches(observed?.[key], value)
  );
}

function selectedMigrationNodes(document, selector) {
  if (selector === "$") {
    return [document];
  }
  if (!selector.startsWith("$.")) {
    throw new Error(`Migration selector is not supported: ${selector}`);
  }
  let nodes = [document];
  for (const segment of selector.slice(2).split(".")) {
    const many = segment.endsWith("[*]");
    const key = many ? segment.slice(0, -3) : segment;
    nodes = nodes.flatMap((node) => {
      const value = node?.[key];
      if (many) {
        return Array.isArray(value) ? value : [];
      }
      return value && typeof value === "object" ? [value] : [];
    });
  }
  return nodes;
}

function applyMigrationAuthority(
  sourceContract,
  authority,
  interpretationBase
) {
  const candidate = structuredClone(sourceContract);
  for (const transformation of authority.transformations ?? []) {
    if (transformation.operation === "set-value") {
      const segments = decodeJsonPointer(transformation.path);
      if (segments.length === 0) {
        throw new Error("A migration cannot replace the document root.");
      }
      let target = candidate;
      for (const segment of segments.slice(0, -1)) {
        target = target?.[segment];
      }
      if (!target || typeof target !== "object") {
        throw new Error(
          `Migration target does not resolve: ${transformation.path}`
        );
      }
      target[segments.at(-1)] = structuredClone(transformation.value);
      continue;
    }
    if (transformation.operation === "introduce-interpretation-base") {
      candidate.interpretationBase = structuredClone(interpretationBase);
      continue;
    }
    if (transformation.operation === "remove-fields") {
      const nodes = selectedMigrationNodes(
        candidate,
        transformation.selector
      );
      for (const node of nodes) {
        for (const field of transformation.fields) {
          delete node[field];
        }
      }
      continue;
    }
    throw new Error(
      `Migration transformation is not supported: ${transformation.operation}`
    );
  }
  return candidate;
}

function migrationPatternMatches(pattern, pointer) {
  const patternSegments = decodeJsonPointer(pattern);
  const pointerSegments = decodeJsonPointer(pointer);
  return (
    patternSegments.length === pointerSegments.length &&
    patternSegments.every(
      (segment, index) =>
        segment === "*" || segment === pointerSegments[index]
    )
  );
}

function validateMigrationClassification(authority, diff) {
  const classifications = authority.fieldClassifications ?? [];
  const findings = [];
  for (const change of diff) {
    const expectedDisposition =
      change.operation === "add"
        ? "introduced"
        : change.operation === "remove"
          ? "removed"
          : "transformed";
    const classification = classifications.find((entry) =>
      migrationPatternMatches(entry.pathPattern, change.path)
    );
    if (
      !classification ||
      classification.disposition !== expectedDisposition
    ) {
      findings.push({
        findingId: "MIGRATION_FIELD_UNCLASSIFIED",
        path: change.path,
        expectedDisposition,
        observedDisposition:
          classification?.disposition ?? null
      });
    }
  }
  return findings;
}

function validateHistoricalContract(
  contract,
  schema,
  schemaEntry
) {
  const binding = declaredSchemaBinding(contract);
  const findings = [];
  if (
    binding?.identity !== schema.$id ||
    binding?.digest !== schemaEntry.digest
  ) {
    findings.push({
      findingId: "historical-schema-binding",
      expected: binding,
      observed: {
        identity: schema.$id ?? null,
        digest: schemaEntry.digest
      }
    });
  }
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  if (!ajv.validateSchema(schema)) {
    findings.push({
      findingId: "historical-schema-meta-validation",
      errors: ajv.errors ?? []
    });
    return findings;
  }
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    findings.push({
      findingId: "historical-schema-compilation",
      detail: error.message
    });
    return findings;
  }
  if (!validate(contract)) {
    findings.push({
      findingId: "historical-contract-validation",
      errors: validate.errors ?? []
    });
  }
  return findings;
}

export function migrateContract(options) {
  if (!options.contractPath) {
    throw new Error("Migration requires --contract.");
  }
  const mode = options.mode ?? "check";
  if (!["check", "write"].includes(mode)) {
    throw new Error("Migration mode must be check or write.");
  }
  const inputs = resolveInputs(options);
  const sourceContract = readJson(
    inputs.contractPath,
    "Governed artifact contract"
  );
  const schemaBinding = declaredSchemaBinding(sourceContract);
  if (!schemaBinding?.digest) {
    return contractInvalid([
      {
        findingId: "historical-schema-binding",
        detail: "The source contract does not bind a schema digest."
      }
    ]);
  }
  const schemaCatalog = readJson(
    inputs.schemaCatalogPath,
    "Schema catalog"
  );
  const migrationRegistry = readJson(
    inputs.migrationRegistryPath,
    "Migration registry"
  );
  const observedCatalogDigest = sha256(
    readFileSync(inputs.schemaCatalogPath)
  );
  if (
    migrationRegistry?.schemaCatalog?.identity !==
      schemaCatalog.catalogId ||
    migrationRegistry?.schemaCatalog?.digest !==
      observedCatalogDigest
  ) {
    return contractInvalid([
      {
        findingId: "schema-catalog-identity",
        expected: migrationRegistry?.schemaCatalog ?? null,
        observed: {
          identity: schemaCatalog.catalogId ?? null,
          digest: observedCatalogDigest
        }
      }
    ]);
  }
  const sourceEntry = schemaCatalog.schemas?.find(
    (entry) => entry.digest === schemaBinding.digest
  );
  if (!sourceEntry) {
    return contractInvalid([
      {
        findingId: "HISTORICAL_SCHEMA_NOT_CATALOGED",
        schemaDigest: schemaBinding.digest
      }
    ]);
  }
  const sourceSchemaPath = asAbsoluteConfined(
    path.dirname(inputs.schemaCatalogPath),
    sourceEntry.relativePath,
    "Historical schema path"
  );
  const observedSourceSchemaDigest = sha256(
    readFileSync(sourceSchemaPath)
  );
  if (observedSourceSchemaDigest !== sourceEntry.digest) {
    return schemaDigestMismatch(
      sourceEntry.digest,
      observedSourceSchemaDigest
    );
  }
  const sourceSchema = readJson(
    sourceSchemaPath,
    "Historical contract schema"
  );
  const historicalFindings = validateHistoricalContract(
    sourceContract,
    sourceSchema,
    sourceEntry
  );
  if (historicalFindings.length > 0) {
    return contractInvalid(historicalFindings);
  }

  const sourceEdges = migrationRegistry.migrations.filter(
    (entry) =>
      entry.sourceSchemaDigest === sourceEntry.digest &&
      authoritySubsetMatches(
        sourceContract.interpretationBase,
        entry.sourceInterpretationBase
      )
  );
  if (sourceEdges.length === 0) {
    const targetEdge = migrationRegistry.migrations.find(
      (entry) =>
        entry.targetSchemaDigest === sourceEntry.digest &&
        authoritySubsetMatches(
          sourceContract.interpretationBase,
          entry.targetInterpretationBase
        )
    );
    if (targetEdge) {
      const inspected = inspectContext({
        ...options,
        contractDocument: sourceContract
      });
      if (!inspected.context) {
        return inspected.report;
      }
      return {
        operation: "migrate-contract",
        migrationMode: mode,
        migrationDisposition: "MIGRATION_NOT_REQUIRED",
        sourceSchemaDigest: sourceEntry.digest,
        targetSchemaDigest: sourceEntry.digest,
        candidateContract: sourceContract,
        diff: [],
        mutationAuthority: structuredClone(
          inspected.context.conformanceProfile.operationAuthorities
            .mutationAuthority
        ),
        writeDisposition: "CONTRACT_UNCHANGED",
        artifactProjectionDisposition: "NOT_PERFORMED",
        trustDisposition: "NOT_EVALUATED"
      };
    }
    return contractInvalid([
      {
        findingId: "MIGRATION_EDGE_NOT_ADMITTED",
        sourceSchemaDigest: sourceEntry.digest
      }
    ]);
  }
  if (sourceEdges.length !== 1) {
    return contractInvalid([
      {
        findingId: "MIGRATION_EDGE_AMBIGUOUS",
        sourceSchemaDigest: sourceEntry.digest
      }
    ]);
  }
  const edge = sourceEdges[0];
  const targetEntry = schemaCatalog.schemas.find(
    (entry) => entry.digest === edge.targetSchemaDigest
  );
  if (!targetEntry) {
    return contractInvalid([
      {
        findingId: "TARGET_SCHEMA_NOT_CATALOGED",
        schemaDigest: edge.targetSchemaDigest
      }
    ]);
  }
  const observedTargetDigest = sha256(readFileSync(inputs.schemaPath));
  if (observedTargetDigest !== targetEntry.digest) {
    return schemaDigestMismatch(
      targetEntry.digest,
      observedTargetDigest
    );
  }
  const authorityPath = asAbsoluteConfined(
    packageRoot,
    edge.migrationAuthority.relativePath,
    "Migration authority path"
  );
  const observedAuthorityDigest = sha256(readFileSync(authorityPath));
  if (observedAuthorityDigest !== edge.migrationAuthority.digest) {
    return contractInvalid([
      {
        findingId: "MIGRATION_AUTHORITY_DIGEST_MISMATCH",
        expected: edge.migrationAuthority.digest,
        observed: observedAuthorityDigest
      }
    ]);
  }
  const authority = readJson(authorityPath, "Migration authority");
  if (authority.migrationId !== edge.migrationId) {
    return contractInvalid([
      {
        findingId: "MIGRATION_AUTHORITY_IDENTITY_MISMATCH",
        expected: edge.migrationId,
        observed: authority.migrationId ?? null
      }
    ]);
  }

  const conformanceProfile = readJson(
    inputs.conformanceProfilePath,
    "Conformance profile"
  );
  const projectorRegistry = readJson(
    inputs.projectorRegistryPath,
    "Projector registry"
  );
  const verifierRegistry = readJson(
    inputs.verifierRegistryPath,
    "Verifier registry"
  );
  const interpretationBase = {
    engine: {
      identity: ENGINE_IDENTITY,
      digest: sha256(readFileSync(inputs.enginePath))
    },
    schema: {
      identity: targetEntry.schemaId,
      digest: targetEntry.digest
    },
    conformanceProfile: {
      identity: conformanceProfile.profileId,
      digest: sha256(readFileSync(inputs.conformanceProfilePath))
    },
    projectorRegistry: {
      identity: projectorRegistry.registryId,
      digest: sha256(readFileSync(inputs.projectorRegistryPath))
    },
    verifierRegistry: {
      identity: verifierRegistry.registryId,
      digest: sha256(readFileSync(inputs.verifierRegistryPath))
    },
    migrationRegistry: {
      identity: migrationRegistry.registryId,
      digest: sha256(readFileSync(inputs.migrationRegistryPath))
    }
  };
  let migrated;
  try {
    migrated = applyMigrationAuthority(
      sourceContract,
      authority,
      interpretationBase
    );
  } catch (error) {
    return contractInvalid([
      {
        findingId: "MIGRATION_AUTHORITY_REJECTED",
        detail: error.message
      }
    ]);
  }
  const reconciled = reconciledContractCandidate(options, migrated);
  if (!reconciled.candidate) {
    return reconciled.report;
  }
  const candidate = reconciled.candidate;
  const diff = exactJsonDiff(sourceContract, candidate);
  const classificationFindings =
    validateMigrationClassification(authority, diff);
  if (classificationFindings.length > 0) {
    return contractInvalid(classificationFindings);
  }
  const validation = inspectContext({
    ...options,
    contractDocument: candidate
  });
  if (!validation.context) {
    return validation.report;
  }
  if (mode === "write") {
    writeCanonicalJsonAtomically(inputs.contractPath, candidate);
  }
  return {
    operation: "migrate-contract",
    migrationMode: mode,
    migrationDisposition:
      mode === "write"
        ? "CONTRACT_MIGRATED"
        : "CONTRACT_MIGRATION_REQUIRED",
    migrationId: edge.migrationId,
    sourceSchemaDigest: sourceEntry.digest,
    targetSchemaDigest: targetEntry.digest,
    migrationAuthorityDigest: observedAuthorityDigest,
    mutationAuthority: structuredClone(
      conformanceProfile.operationAuthorities.mutationAuthority
    ),
    preservedAuthorities: edge.preservedAuthorities,
    transformedAuthorities: edge.transformedAuthorities,
    introducedAuthorities: edge.introducedAuthorities,
    removedAuthorities: edge.removedAuthorities,
    candidateContract: candidate,
    diff,
    replayDisposition: "ZERO_DIFF_EXPECTED",
    writeDisposition:
      mode === "write"
        ? "CONTRACT_WRITTEN"
        : "CONTRACT_UNCHANGED",
    artifactProjectionDisposition: "NOT_PERFORMED",
    trustDisposition: "NOT_EVALUATED"
  };
}

export function resolveArtifactPlan(options) {
  const inspected = inspectContext(options);
  if (!inspected.context) {
    return inspected.report;
  }
  const { contract, workspaceRoot, artifactRoot } = inspected.context;
  const scopeAuthority = artifactScopeAuthority(contract);
  return {
    operation: "resolve-artifact-plan",
    contractValidationDisposition: "CONTRACT_VALID",
    workspaceRoot,
    artifactRoot,
    interpretationBase: structuredClone(
      inspected.context.sourceContract.interpretationBase
    ),
    artifactScope: {
      authority: scopeAuthority,
      authoritySha256: sha256(canonicalJsonBytes(scopeAuthority))
    },
    operationAuthorities: {
      authority: contract.operationAuthorities,
      authoritySha256: sha256(
        canonicalJsonBytes(contract.operationAuthorities)
      )
    },
    artifacts: contract.artifacts.map((artifact) => ({
      artifactId: artifact.artifactId,
      artifactKind: artifact.artifactKind,
      relativePath: artifact.relativePath,
      projectorId: artifact.projection.projectorId,
      verifierIds: artifact.proof.verifierIds
    })),
    conformanceDisposition: "NOT_EVALUATED",
    trustPosture: "NOT_EVALUATED",
    trustDisposition: "NOT_EVALUATED"
  };
}

export function projectArtifactFamily(options) {
  const inspected = inspectContext(options);
  if (!inspected.context) {
    return inspected.report;
  }
  const context = inspected.context;
  const {
    contract,
    artifactRoot,
    projectionLedgerPath
  } = context;
  const mode = options.mode ?? "check";
  if (!["write", "check"].includes(mode)) {
    throw new Error("Projection mode must be write or check.");
  }
  const observations = [];
  for (const artifact of contract.artifacts) {
    const absolutePath = asAbsoluteConfined(
      artifactRoot,
      artifact.relativePath,
      "Artifact path"
    );
    const expected = projectedBytes(artifact, contract);
    if (mode === "write" && artifact.projection.mode === "projected") {
      mkdirSync(path.dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, expected);
    }
    const exists = existsSync(absolutePath);
    const observed = exists ? readFileSync(absolutePath) : null;
    observations.push({
      artifactId: artifact.artifactId,
      relativePath: artifact.relativePath,
      posture:
        !exists
          ? "MISSING"
          : observed.equals(expected)
            ? "CONFORMS"
            : "DRIFTED"
    });
  }
  const expectedLedgerBytes = canonicalJsonBytes(projectionLedger(context));
  if (mode === "write") {
    mkdirSync(path.dirname(projectionLedgerPath), { recursive: true });
    writeFileSync(projectionLedgerPath, expectedLedgerBytes);
  }
  const ledgerExists = existsSync(projectionLedgerPath);
  const ledgerConforms =
    ledgerExists &&
    readFileSync(projectionLedgerPath).equals(expectedLedgerBytes);
  const disposition = observations.some(
    (observation) => observation.posture === "MISSING"
  )
    ? "ARTIFACT_MISSING"
    : observations.some((observation) => observation.posture === "DRIFTED")
      ? "ARTIFACT_CONTENT_MISMATCH"
      : !ledgerConforms
        ? "PROJECTION_IDENTITY_MISMATCH"
        : "ARTIFACT_FAMILY_PROJECTED";
  return {
    operation: "project-declared-artifacts",
    contractValidationDisposition: "CONTRACT_VALID",
    projectionMode: mode,
    projectionDisposition: disposition,
    projectionAuthority: {
      authority: contract.operationAuthorities.projection,
      authoritySha256: sha256(
        canonicalJsonBytes(contract.operationAuthorities.projection)
      )
    },
    mutationAuthority: {
      authority: contract.operationAuthorities.mutationAuthority,
      authoritySha256: sha256(
        canonicalJsonBytes(
          contract.operationAuthorities.mutationAuthority
        )
      ),
      removalDisposition: "FORBIDDEN",
      undeclaredStateDisposition: "OBSERVE_AND_REJECT"
    },
    artifactObservations: observations,
    projectionLedgerObservation: {
      relativePath: contract.projectionLedger.relativePath,
      exists: ledgerExists,
      posture: ledgerConforms ? "CONFORMS" : "DRIFTED",
      expectedSha256: sha256(expectedLedgerBytes),
      observedSha256: ledgerExists
        ? sha256(readFileSync(projectionLedgerPath))
        : null
    },
    conformanceDisposition: "NOT_EVALUATED",
    trustPosture: "NOT_EVALUATED",
    trustDisposition: "NOT_EVALUATED"
  };
}

export function observeArtifactState(options) {
  const inspected = inspectContext(options);
  if (!inspected.context) {
    return inspected.report;
  }
  const context = inspected.context;
  const {
    contract,
    workspaceRoot,
    artifactRoot,
    projectionLedgerPath
  } = context;
  const declaredPaths = new Set(
    contract.artifacts.map((artifact) => artifact.relativePath)
  );
  const observedPaths = observedArtifactScopePaths(
    contract,
    artifactRoot
  );
  const artifactObservations = contract.artifacts.map((artifact) => {
    const absolutePath = asAbsoluteConfined(
      artifactRoot,
      artifact.relativePath,
      "Artifact path"
    );
    if (!existsSync(absolutePath)) {
      return {
        artifactId: artifact.artifactId,
        relativePath: artifact.relativePath,
        exists: false,
        observedByteLength: null,
        observedSha256: null
      };
    }
    const bytes = readFileSync(absolutePath);
    return {
      artifactId: artifact.artifactId,
      relativePath: artifact.relativePath,
      exists: true,
      observedByteLength: bytes.length,
      observedSha256: sha256(bytes),
      ...(artifact.sourceAuthority
        ? {
            sourceAuthorityObservation: inspectSourceAuthority(
              bytes.toString("utf8"),
              artifact.projection.authority.language
            )
          }
        : {})
    };
  });
  const undeclaredPaths = observedPaths.filter(
    (entry) => !declaredPaths.has(entry)
  );
  const excludedPathsPresent = contract.exclusions.filter((entry) =>
    existsSync(
      asAbsoluteConfined(artifactRoot, entry, "Excluded path")
    )
  );
  const scopeObservation = artifactScopeObservation(
    contract,
    observedPaths,
    undeclaredPaths,
    excludedPathsPresent
  );
  return {
    operation: "observe-artifact-state",
    contractValidationDisposition: "CONTRACT_VALID",
    workspaceRoot,
    artifactRoot,
    artifactScopeObservation: scopeObservation,
    artifactObservations,
    projectionLedgerObservation: {
      relativePath: contract.projectionLedger.relativePath,
      exists: existsSync(projectionLedgerPath),
      expectedSha256: sha256(canonicalJsonBytes(projectionLedger(context))),
      observedSha256: existsSync(projectionLedgerPath)
        ? sha256(readFileSync(projectionLedgerPath))
        : null
    },
    undeclaredPaths,
    excludedPathsPresent,
    conformanceDisposition: "NOT_EVALUATED",
    trustPosture: "NOT_EVALUATED",
    trustDisposition: "NOT_EVALUATED"
  };
}

function notEvaluatedChecks(contract, afterCheckId) {
  const evaluationOrder = contract.conformance.evaluationOrder;
  const start = evaluationOrder.indexOf(afterCheckId) + 1;
  return evaluationOrder.slice(start).map((checkId) => ({
    checkId,
    posture: "NOT_EVALUATED",
    disposition: "NOT_EVALUATED"
  }));
}

function conformanceFailure({
  context,
  observations,
  checks,
  checkId,
  disposition,
  posture,
  findings
}) {
  checks.push({ checkId, posture, disposition });
  checks.push(...notEvaluatedChecks(context.contract, checkId));
  return makeReceipt({
    context,
    observations,
    checks,
    findings,
    conformanceDisposition: disposition,
    trustPosture: posture,
    trustDisposition: "REJECTED"
  });
}

function verifyDependencyClosure(
  contract,
  artifact,
  observedImports,
  observedInvocations
) {
  const findings = [];
  const dependenciesBySpecifier = new Map(
    contract.dependencies.map((dependency) => [
      dependency.specifier,
      dependency
    ])
  );
  const observedSpecifiers = new Set();

  for (const observedImport of observedImports) {
    if (observedImport.specifier === null) {
      findings.push({
        findingId: "UNDECLARED_DEPENDENCY_IMPORT",
        artifactId: artifact.artifactId,
        specifier: null,
        detail: "The dependency specifier is not a static string authority."
      });
      continue;
    }
    if (observedSpecifiers.has(observedImport.specifier)) {
      findings.push({
        findingId: "UNDECLARED_DEPENDENCY_IMPORT",
        artifactId: artifact.artifactId,
        specifier: observedImport.specifier,
        detail: "The dependency specifier is imported more than once."
      });
      continue;
    }
    observedSpecifiers.add(observedImport.specifier);
    const dependency = dependenciesBySpecifier.get(observedImport.specifier);
    if (!dependency) {
      findings.push({
        findingId: "UNDECLARED_DEPENDENCY_IMPORT",
        artifactId: artifact.artifactId,
        specifier: observedImport.specifier
      });
      continue;
    }
    if (!dependency.usedByArtifacts.includes(artifact.artifactId)) {
      findings.push({
        findingId: "UNDECLARED_ARTIFACT_DEPENDENCY",
        artifactId: artifact.artifactId,
        dependencyId: dependency.dependencyId,
        specifier: dependency.specifier
      });
      continue;
    }
    const expectedBindings = new Set(dependency.allowedImports);
    const observedBindings = new Set(observedImport.importedBindings);
    for (const importedBinding of observedBindings) {
      if (!expectedBindings.has(importedBinding)) {
        findings.push({
          findingId: "UNDECLARED_DEPENDENCY_IMPORT",
          artifactId: artifact.artifactId,
          dependencyId: dependency.dependencyId,
          specifier: dependency.specifier,
          importedBinding
        });
      }
    }
    for (const importedBinding of expectedBindings) {
      if (!observedBindings.has(importedBinding)) {
        findings.push({
          findingId: "DECLARED_DEPENDENCY_IMPORT_MISSING",
          artifactId: artifact.artifactId,
          dependencyId: dependency.dependencyId,
          specifier: dependency.specifier,
          importedBinding
        });
      }
    }

    const observedDependencyOperations = new Set();
    for (const binding of observedImport.localBindings) {
      const localPrefix = binding.localBinding;
      for (const invocation of observedInvocations) {
        const normalizedInvocation = invocation.startsWith("new ")
          ? invocation.slice(4)
          : invocation;
        if (
          normalizedInvocation === localPrefix ||
          normalizedInvocation.startsWith(`${localPrefix}.`)
        ) {
          observedDependencyOperations.add(
            `${binding.importedBinding}${normalizedInvocation.slice(localPrefix.length)}`
          );
        }
      }
    }
    const allowedOperations = new Set(dependency.allowedInvocations);
    for (const operation of observedDependencyOperations) {
      if (!allowedOperations.has(operation)) {
        findings.push({
          findingId: "UNDECLARED_DEPENDENCY_OPERATION",
          artifactId: artifact.artifactId,
          dependencyId: dependency.dependencyId,
          specifier: dependency.specifier,
          operation
        });
      }
    }
    for (const operation of allowedOperations) {
      if (!observedDependencyOperations.has(operation)) {
        findings.push({
          findingId: "DECLARED_DEPENDENCY_OPERATION_MISSING",
          artifactId: artifact.artifactId,
          dependencyId: dependency.dependencyId,
          specifier: dependency.specifier,
          operation
        });
      }
    }
  }

  for (const dependency of contract.dependencies) {
    if (
      dependency.usedByArtifacts.includes(artifact.artifactId) &&
      !observedSpecifiers.has(dependency.specifier)
    ) {
      findings.push({
        findingId: "DECLARED_DEPENDENCY_IMPORT_MISSING",
        artifactId: artifact.artifactId,
        dependencyId: dependency.dependencyId,
        specifier: dependency.specifier
      });
    }
  }
  return findings;
}

function verifyExactAuthoritySet({
  artifactId,
  expected,
  observed,
  missingFindingId,
  undeclaredFindingId,
  field
}) {
  const findings = [];
  const expectedSet = new Set(expected);
  const observedSet = new Set(observed);
  for (const value of observedSet) {
    if (!expectedSet.has(value)) {
      findings.push({
        findingId: undeclaredFindingId,
        artifactId,
        [field]: value
      });
    }
  }
  for (const value of expectedSet) {
    if (!observedSet.has(value)) {
      findings.push({
        findingId: missingFindingId,
        artifactId,
        [field]: value
      });
    }
  }
  return findings;
}

function verifyEffectClosure(contract, artifact, observedOperations) {
  const findings = [];
  const effectsByOperation = new Map(
    contract.effects.map((effect) => [effect.operation, effect])
  );
  const observedSet = new Set(observedOperations);
  for (const operation of observedSet) {
    const effect = effectsByOperation.get(operation);
    if (!effect || !effect.usedByArtifacts.includes(artifact.artifactId)) {
      findings.push({
        findingId: "EFFECT_BYPASSES_DECLARED_PORT",
        artifactId: artifact.artifactId,
        operation
      });
    }
  }
  for (const effect of contract.effects) {
    if (
      effect.usedByArtifacts.includes(artifact.artifactId) &&
      !observedSet.has(effect.operation)
    ) {
      findings.push({
        findingId: "DECLARED_EFFECT_MISSING",
        artifactId: artifact.artifactId,
        effectId: effect.effectId,
        operation: effect.operation
      });
    }
  }
  return findings;
}

function structuredAuthorityKey(value) {
  const { authorityId, ...observedShape } = value;
  return JSON.stringify(canonicalize(observedShape));
}

function verifyStructuredAuthorities({
  artifactId,
  expected,
  observed,
  missingFindingId,
  undeclaredFindingId
}) {
  const findings = [];
  const expectedByKey = new Map(
    expected.map((entry) => [structuredAuthorityKey(entry), entry])
  );
  const observedByKey = new Map(
    observed.map((entry) => [structuredAuthorityKey(entry), entry])
  );
  for (const [key, entry] of observedByKey) {
    if (!expectedByKey.has(key)) {
      findings.push({
        findingId: undeclaredFindingId,
        artifactId,
        observed: entry
      });
    }
  }
  for (const [key, entry] of expectedByKey) {
    if (!observedByKey.has(key)) {
      findings.push({
        findingId: missingFindingId,
        artifactId,
        authorityId: entry.authorityId,
        expected: Object.fromEntries(
          Object.entries(entry).filter(([field]) => field !== "authorityId")
        )
      });
    }
  }
  return findings;
}

function responsibilityDeclarations(sourceAuthority) {
  return new Map(
    sourceAuthority.responsibilities.map((responsibility) => [
      responsibility.responsibilityId,
      responsibility.declaration
    ])
  );
}

function semanticExecutionBinding(contract, artifact) {
  const executionPortEffect =
    contract.operationAuthorities.bodyPurity.executionPortEffect;
  const dependencies = contract.dependencies.filter(
    (dependency) =>
      dependency.usedByArtifacts.includes(artifact.artifactId) &&
      dependency.authority.authorityType === "port-authority.v1" &&
      dependency.authority.effect === executionPortEffect
  );
  const runtimes = dependencies
    .map((dependency) =>
      contract.runtimeAuthorities.find(
        (runtime) =>
          runtime.runtimeAuthorityId === dependency.authority.portId &&
          runtime.usedByArtifacts.includes(artifact.artifactId)
      )
    )
    .filter(Boolean);
  const runtime = runtimes.length === 1 ? runtimes[0] : undefined;
  const executionEdges =
    runtime && artifact.sourceAuthority
      ? artifact.sourceAuthority.semanticEdges.filter(
          (edge) => edge.operation === runtime.invocation
        )
      : [];
  return {
    dependencies,
    runtimes,
    runtime,
    executionEdges,
    executionEdge:
      executionEdges.length === 1 ? executionEdges[0] : undefined
  };
}

function isSemanticExecutionBody(contract, artifact) {
  return semanticExecutionBinding(contract, artifact).dependencies.length > 0;
}

function verifySemanticExecutionBody(contract, artifact, observation) {
  if (!isSemanticExecutionBody(contract, artifact)) {
    return [];
  }
  const findings = [];
  const executionEdge = semanticExecutionBinding(
    contract,
    artifact
  ).executionEdge;
  if (!executionEdge) {
    findings.push({
      findingId: "PRIMARY_SEMANTIC_INVOCATION_NOT_EXACT",
      artifactId: artifact.artifactId,
      expected: 1,
      observed: 0
    });
    return findings;
  }
  const bodyDeclaration = responsibilityDeclarations(
    artifact.sourceAuthority
  ).get(executionEdge.responsibilityId);
  const inBody = (entry) =>
    entry.responsibilityDeclaration === bodyDeclaration;
  const bodyDecisions = observation.decisions.filter(inBody);
  const bodyIterations = observation.iterations.filter(inBody);
  const bodyFailures = observation.failures.filter(inBody);
  const bodyConstructions = observation.projections.filter(inBody);
  const bodyOperations = observation.semanticOperations.filter(inBody);
  const bodyReturns = observation.returns.filter(inBody);
  const admittedOperation = executionEdge.operation;
  const expectedResultExpression =
    `${admittedOperation}(${executionEdge.argumentExpressions.join(",")})`;

  if (observation.functions.length !== 1) {
    findings.push({
      findingId: "BODY_DECLARATION_COUNT_NOT_EXACT",
      artifactId: artifact.artifactId,
      expected: 1,
      observed: observation.functions.length
    });
  }
  for (const decision of bodyDecisions) {
    findings.push({
      findingId:
        "DECLARED_SEMANTICS_DO_NOT_AUTHORIZE_BODY_BRANCHING",
      artifactId: artifact.artifactId,
      observed: decision
    });
  }
  for (const iteration of bodyIterations) {
    findings.push({
      findingId: "LOCAL_ITERATION_FORBIDDEN",
      artifactId: artifact.artifactId,
      observed: iteration
    });
  }
  for (const failure of bodyFailures) {
    findings.push({
      findingId: "LOCAL_FAILURE_MECHANIC_FORBIDDEN",
      artifactId: artifact.artifactId,
      observed: failure
    });
  }
  for (const construction of bodyConstructions) {
    findings.push({
      findingId: "LOCAL_RESULT_CONSTRUCTION_FORBIDDEN",
      artifactId: artifact.artifactId,
      observed: construction
    });
  }
  for (const operation of bodyOperations.filter(
    (entry) => entry.operation !== admittedOperation
  )) {
    findings.push({
      findingId: "EXECUTION_MECHANIC_OUTSIDE_TRUSTED_BOUNDARY",
      artifactId: artifact.artifactId,
      observed: operation
    });
  }
  const semanticInvocations = bodyOperations.filter(
    (entry) => entry.operation === admittedOperation
  );
  if (
    semanticInvocations.length !== 1 ||
    semanticInvocations[0]?.occurrences !== 1
  ) {
    findings.push({
      findingId: "PRIMARY_SEMANTIC_INVOCATION_NOT_EXACT",
      artifactId: artifact.artifactId,
      expected: 1,
      observed: semanticInvocations.reduce(
        (total, entry) => total + entry.occurrences,
        0
      )
    });
  }
  if (
    bodyReturns.length !== 1 ||
    bodyReturns[0]?.occurrences !== 1 ||
    bodyReturns[0]?.expression !== expectedResultExpression
  ) {
    findings.push({
      findingId: "RESULT_FLOW_NOT_DIRECT",
      artifactId: artifact.artifactId,
      expected: expectedResultExpression,
      observed: bodyReturns
    });
  }
  return findings;
}

function verifySourceAuthorityClosure(contract, artifact, observation) {
  const findings = verifyDependencyClosure(
    contract,
    artifact,
    observation.imports,
    observation.invocations
  );
  findings.push(
    ...verifyEffectClosure(
      contract,
      artifact,
      observation.ambientOperations
    )
  );
  if (observation.unresolvedTokens.length > 0) {
    findings.push({
      findingId: "SOURCE_AUTHORITY_UNRESOLVED",
      artifactId: artifact.artifactId,
      tokens: observation.unresolvedTokens
    });
  }
  if (observation.unresolvedFunctionForms.length > 0) {
    findings.push({
      findingId: "SOURCE_AUTHORITY_UNRESOLVED",
      artifactId: artifact.artifactId,
      functionForms: observation.unresolvedFunctionForms
    });
  }
  findings.push(
    ...verifyExactAuthoritySet({
      artifactId: artifact.artifactId,
      expected: artifact.sourceAuthority.declarations,
      observed: observation.declarations,
      missingFindingId: "DECLARED_DECLARATION_MISSING",
      undeclaredFindingId: "UNDECLARED_DECLARATION",
      field: "declaration"
    })
  );
  const responsibilityById = responsibilityDeclarations(
    artifact.sourceAuthority
  );
  const semanticExecutionBody = isSemanticExecutionBody(contract, artifact);
  const semanticExecutionEdge = semanticExecutionBinding(
    contract,
    artifact
  ).executionEdge;
  const bodyDeclaration = responsibilityById.get(
    semanticExecutionEdge?.responsibilityId
  );
  findings.push(
    ...verifySemanticExecutionBody(contract, artifact, observation)
  );
  findings.push(
    ...verifyStructuredAuthorities({
      artifactId: artifact.artifactId,
      expected: artifact.sourceAuthority.responsibilities
        .filter(
          (responsibility) =>
            responsibility.responsibilityType === "function"
        )
        .map((responsibility) => ({
          authorityId: responsibility.responsibilityId,
          declaration: responsibility.declaration,
          functionKind: responsibility.functionKind
        })),
      observed: observation.functions,
      missingFindingId: "DECLARED_RESPONSIBILITY_MISSING",
      undeclaredFindingId: "UNDECLARED_RESPONSIBILITY"
    }),
    ...verifyStructuredAuthorities({
      artifactId: artifact.artifactId,
      expected: artifact.sourceAuthority.semanticEdges
        .filter(
          (edge) =>
            !semanticExecutionBody ||
            edge.operation === semanticExecutionEdge?.operation
        )
        .map((edge) => ({
        authorityId: edge.edgeId,
        responsibilityDeclaration: responsibilityById.get(
          edge.responsibilityId
        ),
        edgeKind: edge.edgeKind,
        operation: edge.operation,
        argumentExpressions: edge.argumentExpressions,
        occurrences: edge.occurrences
        })),
      observed: semanticExecutionBody
        ? observation.semanticOperations.filter(
            (entry) =>
              entry.responsibilityDeclaration === bodyDeclaration
          )
        : observation.semanticOperations,
      missingFindingId: "DECLARED_SEMANTIC_EDGE_MISSING",
      undeclaredFindingId: "UNDECLARED_SEMANTIC_EDGE"
    }),
    ...verifyStructuredAuthorities({
      artifactId: artifact.artifactId,
      expected: (semanticExecutionBody
        ? []
        : artifact.sourceAuthority.decisions).map((decision) => ({
        authorityId: decision.decisionId,
        responsibilityDeclaration: responsibilityById.get(
          decision.responsibilityId
        ),
        syntaxKind: decision.syntaxKind,
        conditionExpression: decision.conditionExpression,
        occurrences: decision.occurrences
      })),
      observed: semanticExecutionBody ? [] : observation.decisions,
      missingFindingId: "DECLARED_DECISION_AUTHORITY_MISSING",
      undeclaredFindingId: "UNDECLARED_DECISION_PATH"
    }),
    ...verifyStructuredAuthorities({
      artifactId: artifact.artifactId,
      expected: (semanticExecutionBody
        ? []
        : artifact.sourceAuthority.iterations).map((iteration) => ({
        authorityId: iteration.iterationId,
        responsibilityDeclaration: responsibilityById.get(
          iteration.responsibilityId
        ),
        syntaxKind: iteration.syntaxKind,
        controlExpression: iteration.controlExpression,
        occurrences: iteration.occurrences
      })),
      observed: semanticExecutionBody ? [] : observation.iterations,
      missingFindingId: "DECLARED_ITERATION_AUTHORITY_MISSING",
      undeclaredFindingId: "UNDECLARED_ITERATION_OR_CONTINUATION"
    }),
    ...verifyStructuredAuthorities({
      artifactId: artifact.artifactId,
      expected: (semanticExecutionBody
        ? []
        : artifact.sourceAuthority.failurePolicies).map((failure) => ({
        authorityId: failure.failurePolicyId,
        responsibilityDeclaration: responsibilityById.get(
          failure.responsibilityId
        ),
        syntaxKind: failure.syntaxKind,
        ...(failure.expression ? { expression: failure.expression } : {}),
        occurrences: failure.occurrences
      })),
      observed: semanticExecutionBody ? [] : observation.failures,
      missingFindingId: "DECLARED_FAILURE_POLICY_MISSING",
      undeclaredFindingId: "UNDECLARED_FAILURE_POLICY"
    }),
    ...verifyStructuredAuthorities({
      artifactId: artifact.artifactId,
      expected: (semanticExecutionBody
        ? []
        : artifact.sourceAuthority.projectionMappings).map((mapping) => ({
        authorityId: mapping.projectionMappingId,
        responsibilityDeclaration: responsibilityById.get(
          mapping.responsibilityId
        ),
        fields: mapping.fields,
        occurrences: mapping.occurrences
      })),
      observed: semanticExecutionBody ? [] : observation.projections,
      missingFindingId: "DECLARED_PROJECTION_MAPPING_MISSING",
      undeclaredFindingId: "UNDECLARED_PROJECTION_LOGIC"
    }),
    ...verifyStructuredAuthorities({
      artifactId: artifact.artifactId,
      expected: artifact.sourceAuthority.resultContracts
        .filter((result) => result.source.sourceType === "return")
        .map((result) => ({
          authorityId: result.resultContractId,
          responsibilityDeclaration: responsibilityById.get(
            result.source.responsibilityId
          ),
          returnKind: result.source.returnKind,
          expression: result.source.expression,
          occurrences: result.source.occurrences
        })),
      observed: observation.returns,
      missingFindingId: "DECLARED_RESULT_CONTRACT_MISSING",
      undeclaredFindingId: "UNDECLARED_RESULT_CONTRACT"
    })
  );
  for (const result of artifact.sourceAuthority.resultContracts.filter(
    (entry) => entry.source.sourceType === "effect"
  )) {
    const edge = artifact.sourceAuthority.semanticEdges.find(
      (entry) => entry.edgeId === result.source.semanticEdgeId
    );
    const responsibilityDeclaration = responsibilityById.get(
      edge?.responsibilityId
    );
    const matchingOperation = observation.semanticOperations.find(
      (entry) =>
        entry.responsibilityDeclaration === responsibilityDeclaration &&
        entry.edgeKind === "invocation" &&
        entry.operation === edge?.operation
    );
    if (
      !matchingOperation ||
      matchingOperation.occurrences !== result.source.occurrences ||
      matchingOperation.argumentExpressions[result.source.argumentIndex] !==
        result.source.valueExpression
    ) {
      findings.push({
        findingId: "DECLARED_RESULT_CONTRACT_MISSING",
        artifactId: artifact.artifactId,
        authorityId: result.resultContractId,
        expected: {
          responsibilityDeclaration,
          operation: edge?.operation,
          argumentIndex: result.source.argumentIndex,
          valueExpression: result.source.valueExpression,
          occurrences: result.source.occurrences
        }
      });
      if (matchingOperation) {
        findings.push({
          findingId: "UNDECLARED_RESULT_CONTRACT",
          artifactId: artifact.artifactId,
          observed: {
            responsibilityDeclaration,
            operation: matchingOperation.operation,
            argumentIndex: result.source.argumentIndex,
            valueExpression:
              matchingOperation.argumentExpressions[
                result.source.argumentIndex
              ],
            occurrences: matchingOperation.occurrences
          }
        });
      }
    }
  }

  const observedSyntax = new Map(
    observation.syntaxKinds.map((entry) => [
      entry.syntaxKind,
      entry.occurrences
    ])
  );
  for (const syntaxKind of artifact.sourceAuthority.forbiddenSyntaxKinds) {
    if ((observedSyntax.get(syntaxKind) ?? 0) > 0) {
      findings.push({
        findingId: "FORBIDDEN_SYNTAX_KIND",
        artifactId: artifact.artifactId,
        syntaxKind,
        observedOccurrences: observedSyntax.get(syntaxKind)
      });
    }
  }
  return findings;
}

function verifyAuthorityClosure(context, observations) {
  return context.contract.artifacts.flatMap((artifact) => {
    if (!artifact.sourceAuthority) {
      return [];
    }
    const observation = observations.artifactObservations.find(
      (entry) => entry.artifactId === artifact.artifactId
    );
    if (!observation?.sourceAuthorityObservation) {
      return [
        {
          findingId: "SOURCE_AUTHORITY_UNRESOLVED",
          artifactId: artifact.artifactId
        }
      ];
    }
    return verifySourceAuthorityClosure(
      context.contract,
      artifact,
      observation.sourceAuthorityObservation
    );
  });
}

function verifyArtifactStructure(artifact, bytes) {
  const findings = [];
  const text = bytes.toString("utf8");
  for (const verifierId of artifact.proof.verifierIds) {
    if (verifierId === "source-token-structure-verifier.v1") {
      const authority = artifact.projection.authority;
      if (authority.authorityType !== "lossless-source-tokens.v1") {
        findings.push({
          findingId: "source-token-authority-missing",
          artifactId: artifact.artifactId
        });
      } else if (
        JSON.stringify(scanSource(text, authority.language)) !==
        JSON.stringify(authority.tokens)
      ) {
        findings.push({
          findingId: "source-token-structure",
          artifactId: artifact.artifactId
        });
      }
    }
    if (verifierId === "json-meta-schema-verifier.v1") {
      try {
        const schema = JSON.parse(text);
        const ajv = new Ajv2020({ allErrors: true, strict: true });
        if (!ajv.validateSchema(schema)) {
          findings.push({
            findingId: "json-meta-schema",
            artifactId: artifact.artifactId,
            errors: ajv.errors ?? []
          });
        }
      } catch (error) {
        findings.push({
          findingId: "json-meta-schema",
          artifactId: artifact.artifactId,
          detail: error.message
        });
      }
    }
    if (verifierId === "markdown-section-verifier.v1") {
      let cursor = -1;
      for (const heading of artifact.proof.requiredSections ?? []) {
        const index = text.indexOf(heading, cursor + 1);
        if (index < 0) {
          findings.push({
            findingId: "markdown-required-section",
            artifactId: artifact.artifactId,
            heading
          });
        } else {
          cursor = index;
        }
      }
    }
    if (verifierId === "forbidden-text-verifier.v1") {
      const lowerText = text.toLowerCase();
      for (const forbidden of artifact.proof.forbiddenText ?? []) {
        if (lowerText.includes(forbidden.toLowerCase())) {
          findings.push({
            findingId: "forbidden-text",
            artifactId: artifact.artifactId,
            text: forbidden
          });
        }
      }
    }
  }
  return findings;
}

function runDeclaredEvaluations(context) {
  const findings = [];
  for (const evaluation of context.contract.conformance.artifactEvaluations) {
    const [executable, ...args] = evaluation.command;
    const command = executable === "node" ? process.execPath : executable;
    const result = spawnSync(command, args, {
      cwd: context.artifactRoot,
      encoding: "utf8",
      shell: false
    });
    if (
      result.status !== evaluation.expectedExitCode ||
      !result.stdout.includes(evaluation.expectedStdoutContains)
    ) {
      findings.push({
        findingId: "declared-command",
        evaluationId: evaluation.evaluationId,
        expectedExitCode: evaluation.expectedExitCode,
        observedExitCode: result.status,
        expectedStdoutContains: evaluation.expectedStdoutContains,
        observedStdout: result.stdout,
        observedStderr: result.stderr
      });
    }
  }
  return findings;
}

function makeReceipt({
  context,
  observations,
  checks,
  findings,
  conformanceDisposition,
  trustPosture,
  trustDisposition
}) {
  const missingArtifactIds = observations.artifactObservations
    .filter((observation) => !observation.exists)
    .map((observation) => observation.artifactId);
  const authorityClosureCheck = checks.find(
    (check) => check.checkId === "evaluate-authority-closure"
  );
  const authorityClosureDisposition =
    authorityClosureCheck?.disposition ?? "NOT_EVALUATED";
  const scopeAuthority = artifactScopeAuthority(context.contract);
  const scopeDisposition =
    missingArtifactIds.length === 0 &&
    observations.undeclaredPaths.length === 0 &&
    observations.excludedPathsPresent.length === 0
      ? context.contract.workspace.governedScope.requiredDisposition
      : "ARTIFACT_SCOPE_OPEN";
  return {
    receiptType: context.contract.receipt.receiptType,
    contract: {
      contractId: context.contract.contract.contractId,
      contractSha256: context.contractDigest
    },
    interpretationBase: structuredClone(
      context.sourceContract.interpretationBase
    ),
    schema: {
      identity: context.schema.$id,
      digest: context.schemaDigest,
      contractValidationDisposition: "CONTRACT_VALID"
    },
    registries: {
      projectorRegistry: {
        identity: context.projectorRegistry.registryId,
        digest: context.projectorRegistryDigest
      },
      verifierRegistry: {
        identity: context.verifierRegistry.registryId,
        digest: context.verifierRegistryDigest
      }
    },
    operationAuthorities: {
      authority: context.contract.operationAuthorities,
      authoritySha256: sha256(
        canonicalJsonBytes(context.contract.operationAuthorities)
      )
    },
    ontologyAuthorities: ontologyAuthorityEvidence(context.contract),
    artifactFamily: {
      subjectId: context.contract.subject.subjectId,
      declaredArtifactCount: context.contract.artifacts.length,
      observedArtifactCount: observations.artifactObservations.filter(
        (observation) => observation.exists
      ).length,
      missingArtifactIds,
      undeclaredPaths: observations.undeclaredPaths,
      artifactScope: {
        scopeType: scopeAuthority.scopeType,
        inventoryMode: scopeAuthority.inventoryMode,
        authoritySha256: sha256(canonicalJsonBytes(scopeAuthority)),
        observationSha256: sha256(
          canonicalJsonBytes(observations.artifactScopeObservation)
        ),
        resolvedGovernedPathSet:
          scopeAuthority.resolvedGovernedPathSet,
        disposition: scopeDisposition
      },
      scopeDisposition,
      artifactScopeObservation:
        observations.artifactScopeObservation,
      artifactObservations: observations.artifactObservations,
      projectionLedgerObservation: observations.projectionLedgerObservation,
      ...(observations.freshnessObservation
        ? { freshnessObservation: observations.freshnessObservation }
        : {}),
      authorityClosure: {
        authorityType: context.contract.authorityClosure.authorityType,
        profileSha256: sha256(
          canonicalJsonBytes(context.contract.authorityClosure)
        ),
        disposition: authorityClosureDisposition
      },
      authorityClosureDisposition,
      proofDisposition:
        trustDisposition === "TRUSTED" ? "PROOF_COMPLETE" : "PROOF_INCOMPLETE",
      findings,
      conformanceDisposition
    },
    claimPolicies: context.contract.claims,
    checks,
    trustPosture,
    trustDisposition
  };
}

function evaluateConformanceUnchecked(options) {
  const inspected = inspectContext(options);
  if (!inspected.context) {
    return inspected.report;
  }
  const context = inspected.context;
  const observations = observeArtifactState(options);
  const checks = [
    {
      checkId: "validate-contract",
      posture: "CONFORMS",
      disposition: "CONTRACT_VALID"
    },
    {
      checkId: "resolve-artifact-plan",
      posture: "CONFORMS",
      disposition: "ARTIFACT_PLAN_RESOLVED"
    },
    {
      checkId: "observe-artifact-state",
      posture: "CONFORMS",
      disposition: "ARTIFACT_STATE_OBSERVED"
    }
  ];

  const missing = observations.artifactObservations.filter(
    (observation) => !observation.exists
  );
  if (missing.length > 0) {
    return conformanceFailure({
      context,
      observations,
      checks,
      checkId: "evaluate-artifact-inventory",
      disposition: "ARTIFACT_MISSING",
      posture: "MISSING",
      findings: missing.map((observation) => ({
        findingId: "artifact-missing",
        artifactId: observation.artifactId,
        relativePath: observation.relativePath
      }))
    });
  }
  if (
    observations.undeclaredPaths.length > 0 ||
    observations.excludedPathsPresent.length > 0
  ) {
    return conformanceFailure({
      context,
      observations,
      checks,
      checkId: "evaluate-artifact-inventory",
      disposition: "ARTIFACT_UNDECLARED",
      posture: "EXTRA",
      findings: [
        ...observations.undeclaredPaths.map((relativePath) => ({
          findingId: "artifact-undeclared",
          relativePath
        })),
        ...observations.excludedPathsPresent.map((relativePath) => ({
          findingId: "excluded-artifact-present",
          relativePath
        }))
      ]
    });
  }
  checks.push({
    checkId: "evaluate-artifact-inventory",
    posture: "CONFORMS",
    disposition: "ARTIFACT_INVENTORY_CONFORMS"
  });

  const ledgerObservation = observations.projectionLedgerObservation;
  if (
    !ledgerObservation.exists ||
    ledgerObservation.expectedSha256 !== ledgerObservation.observedSha256
  ) {
    return conformanceFailure({
      context,
      observations,
      checks,
      checkId: "evaluate-projection-identity",
      disposition: "PROJECTION_IDENTITY_MISMATCH",
      posture: "DRIFTED",
      findings: [
        {
          findingId: "projection-ledger",
          relativePath: ledgerObservation.relativePath,
          expectedSha256: ledgerObservation.expectedSha256,
          observedSha256: ledgerObservation.observedSha256
        }
      ]
    });
  }
  checks.push({
    checkId: "evaluate-projection-identity",
    posture: "CONFORMS",
    disposition: "PROJECTION_IDENTITY_CONFORMS"
  });

  const authorityClosureFindings = verifyAuthorityClosure(
    context,
    observations
  );
  if (authorityClosureFindings.length > 0) {
    return conformanceFailure({
      context,
      observations,
      checks,
      checkId: "evaluate-authority-closure",
      disposition: "ARTIFACT_ESCAPES_CONTRACT",
      posture: "CONTAMINATED",
      findings: authorityClosureFindings
    });
  }
  checks.push({
    checkId: "evaluate-authority-closure",
    posture: "CONFORMS",
    disposition:
      context.contract.authorityClosure.admission.requiredDisposition
  });
  const ontologyAuthorities = ontologyAuthorityEvidence(context.contract);
  checks.push({
    checkId: "evaluate-ontology-authority",
    posture: "CONFORMS",
    disposition:
      ontologyAuthorities.length === 0
        ? "ONTOLOGY_AUTHORITY_NOT_REQUIRED"
        : "ONTOLOGY_AUTHORITY_CLOSED",
    authorities: ontologyAuthorities
  });
  checks.push({
    checkId: "evaluate-semantic-execution-bodies",
    posture: "CONFORMS",
    disposition: "SEMANTIC_EXECUTION_BODY_CLOSED"
  });

  const contentFindings = [];
  for (const artifact of context.contract.artifacts) {
    const absolutePath = asAbsoluteConfined(
      context.artifactRoot,
      artifact.relativePath,
      "Artifact path"
    );
    const bytes = readFileSync(absolutePath);
    const observedDigest = sha256(bytes);
    if (
      observedDigest !== artifact.proof.contentSha256 ||
      bytes.length !== artifact.proof.expectedByteLength
    ) {
      contentFindings.push({
        findingId: "PAYLOAD_MISMATCH",
        artifactId: artifact.artifactId,
        expectedSha256: artifact.proof.contentSha256,
        observedSha256: observedDigest,
        expectedByteLength: artifact.proof.expectedByteLength,
        observedByteLength: bytes.length
      });
    }
  }
  if (contentFindings.length > 0) {
    return conformanceFailure({
      context,
      observations,
      checks,
      checkId: "evaluate-artifact-content",
      disposition: "ARTIFACT_CONTENT_MISMATCH",
      posture: "DRIFTED",
      findings: contentFindings
    });
  }
  checks.push({
    checkId: "evaluate-artifact-content",
    posture: "CONFORMS",
    disposition: "ARTIFACT_CONTENT_CONFORMS"
  });

  const structureFindings = [];
  for (const artifact of context.contract.artifacts) {
    const absolutePath = asAbsoluteConfined(
      context.artifactRoot,
      artifact.relativePath,
      "Artifact path"
    );
    structureFindings.push(
      ...verifyArtifactStructure(artifact, readFileSync(absolutePath))
    );
  }
  if (structureFindings.length > 0) {
    return conformanceFailure({
      context,
      observations,
      checks,
      checkId: "evaluate-artifact-structure",
      disposition: "ARTIFACT_STRUCTURE_MISMATCH",
      posture: "DRIFTED",
      findings: structureFindings
    });
  }
  checks.push({
    checkId: "evaluate-artifact-structure",
    posture: "CONFORMS",
    disposition: "ARTIFACT_STRUCTURE_CONFORMS"
  });

  const freshnessPolicies = context.contract.artifacts
    .filter((artifact) => artifact.proof.validThroughUtc !== undefined)
    .map((artifact) => ({
      artifactId: artifact.artifactId,
      validThroughUtc: artifact.proof.validThroughUtc
    }));
  if (freshnessPolicies.length > 0) {
    const evaluationTime = options.observedAt
      ? new Date(options.observedAt)
      : new Date();
    if (Number.isNaN(evaluationTime.valueOf())) {
      throw new Error("Observed-at must be an ISO-8601 timestamp.");
    }
    observations.freshnessObservation = {
      observedAtUtc: evaluationTime.toISOString(),
      policies: freshnessPolicies
    };
    const stale = freshnessPolicies.filter(
      (policy) => evaluationTime.valueOf() > Date.parse(policy.validThroughUtc)
    );
    if (stale.length > 0) {
      return conformanceFailure({
        context,
        observations,
        checks,
        checkId: "evaluate-artifact-freshness",
        disposition: "ARTIFACT_STALE",
        posture: "STALE",
        findings: stale.map((policy) => ({
          findingId: "artifact-stale",
          artifactId: policy.artifactId,
          validThroughUtc: policy.validThroughUtc,
          observedAtUtc: evaluationTime.toISOString()
        }))
      });
    }
    checks.push({
      checkId: "evaluate-artifact-freshness",
      posture: "CONFORMS",
      disposition: "ARTIFACT_FRESHNESS_CONFORMS"
    });
  } else {
    checks.push({
      checkId: "evaluate-artifact-freshness",
      posture: "CONFORMS",
      disposition: "ARTIFACT_FRESHNESS_NOT_REQUIRED"
    });
  }

  checks.push({
    checkId: "evaluate-artifact-relationships",
    posture: "CONFORMS",
    disposition: "ARTIFACT_RELATIONSHIPS_CONFORM"
  });

  const commandFindings = runDeclaredEvaluations(context);
  if (commandFindings.length > 0) {
    return conformanceFailure({
      context,
      observations,
      checks,
      checkId: "evaluate-declared-commands",
      disposition: "ARTIFACT_STRUCTURE_MISMATCH",
      posture: "DRIFTED",
      findings: commandFindings
    });
  }
  checks.push({
    checkId: "evaluate-declared-commands",
    posture: "CONFORMS",
    disposition: "DECLARED_COMMANDS_CONFORM"
  });
  return makeReceipt({
    context,
    observations,
    checks,
    findings: [],
    conformanceDisposition: "CONTRACT_AUTHORITY_CLOSED",
    trustPosture: "NOT_EVALUATED",
    trustDisposition: "NOT_EVALUATED"
  });
}

function proofEvaluationSnapshot(context, observations) {
  return {
    interpretationAuthority: {
      contractSha256: context.contractDigest,
      engineSha256: context.engineDigest,
      schemaSha256: context.schemaDigest,
      conformanceProfileSha256:
        context.conformanceProfileDigest,
      projectorRegistrySha256: context.projectorRegistryDigest,
      verifierRegistrySha256: context.verifierRegistryDigest,
      migrationRegistrySha256:
        context.migrationRegistryDigest,
      operationAuthoritiesSha256: sha256(
        canonicalJsonBytes(context.contract.operationAuthorities)
      )
    },
    subject: {
      artifactScopeObservation: observations.artifactScopeObservation,
      artifactObservations: observations.artifactObservations,
      projectionLedgerObservation:
        observations.projectionLedgerObservation,
      undeclaredPaths: observations.undeclaredPaths,
      excludedPathsPresent: observations.excludedPathsPresent
    }
  };
}

function captureProofEvaluationState(options) {
  const inspected = inspectContext(options);
  if (!inspected.context) {
    return {
      state: {
        contractValidationDisposition:
          inspected.report.contractValidationDisposition,
        findings: inspected.report.findings
      },
      context: null
    };
  }
  const observations = observeArtifactState(options);
  return {
    state: proofEvaluationSnapshot(inspected.context, observations),
    context: inspected.context
  };
}

function finalizeProofReceipt(receipt, contract, beforeState, afterState) {
  const beforeSha256 = sha256(canonicalJsonBytes(beforeState));
  const afterSha256 = sha256(canonicalJsonBytes(afterState));
  const beforeSubjectSha256 = sha256(
    canonicalJsonBytes(beforeState.subject ?? beforeState)
  );
  const afterSubjectSha256 = sha256(
    canonicalJsonBytes(afterState.subject ?? afterState)
  );
  const stable = beforeSha256 === afterSha256;
  const proofAuthority = contract.operationAuthorities.proof;
  const mutationDisposition = stable
    ? proofAuthority.requiredSubjectDisposition
    : proofAuthority.mutationDisposition;
  const proofOperation = {
    authorityType: contract.operationAuthorities.authorityType,
    operationAuthoritiesSha256: sha256(
      canonicalJsonBytes(contract.operationAuthorities)
    ),
    proofAuthoritySha256: sha256(canonicalJsonBytes(proofAuthority)),
    operation: proofAuthority.operation,
    mode: proofAuthority.mode,
    evaluationStateBeforeSha256: beforeSha256,
    evaluationStateAfterSha256: afterSha256,
    subjectBeforeSha256: beforeSubjectSha256,
    subjectAfterSha256: afterSubjectSha256,
    subjectMutationDisposition: mutationDisposition
  };
  const checksById = new Map(
    (receipt.checks ?? []).map((check) => [check.checkId, check])
  );
  checksById.set("verify-proof-subject-stability", {
    checkId: "verify-proof-subject-stability",
    posture: stable ? "CONFORMS" : "CONTAMINATED",
    disposition: mutationDisposition
  });
  const conformanceClosed =
    receipt.artifactFamily?.conformanceDisposition ===
    "CONTRACT_AUTHORITY_CLOSED";
  if (stable && conformanceClosed) {
    checksById.set("issue-trust-disposition", {
      checkId: "issue-trust-disposition",
      posture: "CONFORMS",
      disposition: "TRUSTED"
    });
  }
  if (!stable) {
    checksById.set("issue-trust-disposition", {
      checkId: "issue-trust-disposition",
      posture: "NOT_EVALUATED",
      disposition: "NOT_EVALUATED"
    });
  }
  const checks = contract.conformance.evaluationOrder.map((checkId) =>
    checksById.get(checkId)
  ).filter(Boolean);
  if (stable) {
    return {
      ...receipt,
      proofOperation,
      artifactFamily: conformanceClosed
        ? {
            ...receipt.artifactFamily,
            proofDisposition: "PROOF_COMPLETE"
          }
        : receipt.artifactFamily,
      checks,
      trustPosture: conformanceClosed
        ? "CONFORMS"
        : receipt.trustPosture,
      trustDisposition: conformanceClosed
        ? "TRUSTED"
        : receipt.trustDisposition
    };
  }
  const mutationFinding = {
    findingId: "EVALUATION_INVALIDATED_BY_MUTATION",
    expected: beforeSha256,
    observed: afterSha256,
    subjectExpected: beforeSubjectSha256,
    subjectObserved: afterSubjectSha256
  };
  return {
    ...receipt,
    proofOperation,
    artifactFamily: {
      ...receipt.artifactFamily,
      proofDisposition: "PROOF_INCOMPLETE",
      findings: [
        ...(receipt.artifactFamily?.findings ?? []),
        mutationFinding
      ],
      conformanceDisposition: proofAuthority.mutationDisposition
    },
    checks,
    trustPosture: "CONTAMINATED",
    trustDisposition: "REJECTED"
  };
}

export function evaluateConformance(options) {
  const before = captureProofEvaluationState(options);
  if (!before.context) {
    return inspectContext(options).report;
  }
  const receipt = evaluateConformanceUnchecked(options);
  if (
    receipt.receiptType !==
    before.context.contract.receipt.receiptType
  ) {
    return receipt;
  }
  const after = captureProofEvaluationState(options);
  return finalizeProofReceipt(
    receipt,
    before.context.contract,
    before.state,
    after.state
  );
}

export function evaluateTrustClaim(receipt, claim) {
  const policy = Array.isArray(receipt?.claimPolicies)
    ? receipt.claimPolicies.find((entry) => entry.claim === claim)
    : null;
  const observedEvidence = {
    conformanceDisposition:
      receipt?.artifactFamily?.conformanceDisposition ?? "NOT_EVALUATED",
    authorityClosureDisposition:
      receipt?.artifactFamily?.authorityClosure?.disposition ??
      "NOT_EVALUATED",
    scopeDisposition:
      receipt?.artifactFamily?.artifactScope?.disposition ??
      "NOT_EVALUATED",
    proofDisposition:
      receipt?.artifactFamily?.proofDisposition ?? "PROOF_INCOMPLETE",
    proofMode: receipt?.proofOperation?.mode ?? "NOT_EVALUATED",
    proofSubjectDisposition:
      receipt?.proofOperation?.subjectMutationDisposition ??
      "NOT_EVALUATED",
    trustDisposition: receipt?.trustDisposition ?? "NOT_EVALUATED"
  };
  const findings = [];
  if (!policy) {
    findings.push({
      findingId: "CLAIM_UNDECLARED",
      claim
    });
  } else {
    const requirements = [
      [
        "conformanceDisposition",
        policy.requiredConformanceDisposition
      ],
      [
        "authorityClosureDisposition",
        policy.requiredAuthorityClosureDisposition
      ],
      ["scopeDisposition", policy.requiredScopeDisposition],
      ["proofDisposition", policy.requiredProofDisposition],
      ["proofMode", "read-only"],
      ["proofSubjectDisposition", "PROOF_SUBJECT_UNCHANGED"],
      ["trustDisposition", policy.requiredTrustDisposition]
    ];
    for (const [field, expected] of requirements) {
      if (observedEvidence[field] !== expected) {
        findings.push({
          findingId: "CLAIM_EXCEEDS_EVIDENCE",
          evidence: field,
          expected,
          observed: observedEvidence[field]
        });
      }
    }
  }
  return {
    operation: "evaluate-trust-claim",
    claim,
    claimId: policy?.claimId ?? null,
    observedEvidence,
    findings,
    claimDisposition:
      findings.length === 0 ? "CLAIM_ADMITTED" : "CLAIM_EXCEEDS_EVIDENCE"
  };
}

export function evaluateReceiptClaim(options, receipt, claim) {
  const currentReceipt = evaluateConformance(options);
  const currentClaim = evaluateTrustClaim(currentReceipt, claim);
  const suppliedDigest = sha256(canonicalJsonBytes(receipt));
  const currentDigest = sha256(canonicalJsonBytes(currentReceipt));
  if (
    receipt?.receiptType !== currentReceipt?.receiptType ||
    suppliedDigest !== currentDigest
  ) {
    return {
      ...currentClaim,
      suppliedReceiptSha256: suppliedDigest,
      currentReceiptSha256: currentDigest,
      findings: [
        {
          findingId: "CLAIM_EXCEEDS_EVIDENCE",
          evidence: "current-canonical-receipt",
          expected: currentDigest,
          observed: suppliedDigest
        },
        ...currentClaim.findings
      ],
      claimDisposition: "CLAIM_EXCEEDS_EVIDENCE"
    };
  }
  return currentClaim;
}

export function writeCanonicalReceipt(options, receipt) {
  const inspected = inspectContext(options);
  if (!inspected.context) {
    return inspected.report;
  }
  mkdirSync(path.dirname(inspected.context.receiptPath), { recursive: true });
  writeFileSync(inspected.context.receiptPath, canonicalJsonBytes(receipt));
  return {
    operation: "write-canonical-receipt",
    relativePath: inspected.context.contract.receipt.relativePath,
    receiptSha256: sha256(canonicalJsonBytes(receipt)),
    trustPosture: receipt.trustPosture,
    trustDisposition: receipt.trustDisposition
  };
}

export function proveGovernedArtifactFamily(options) {
  const validation = validateContract(options);
  if (validation.contractValidationDisposition !== "CONTRACT_VALID") {
    return validation;
  }
  if (![undefined, "check", "write"].includes(options.mode)) {
    throw new Error("Proof mode must be read-only.");
  }
  if (options.mode === "write") {
    const inspected = inspectContext(options);
    const proofAuthority = inspected.context.contract.operationAuthorities.proof;
    return {
      operation: "prove-governed-artifact-family",
      contractValidationDisposition: "CONTRACT_VALID",
      proofOperation: {
        authorityType:
          inspected.context.contract.operationAuthorities.authorityType,
        operationAuthoritiesSha256: sha256(
          canonicalJsonBytes(
            inspected.context.contract.operationAuthorities
          )
        ),
        proofAuthoritySha256: sha256(
          canonicalJsonBytes(proofAuthority)
        ),
        operation: proofAuthority.operation,
        mode: proofAuthority.mode,
        requestedMode: "write",
        subjectMutationDisposition:
          "PROOF_SUBJECT_MUTATION_FORBIDDEN"
      },
      conformanceDisposition: "NOT_EVALUATED",
      proofDisposition: "PROOF_INCOMPLETE",
      trustPosture: "NOT_EVALUATED",
      trustDisposition: "REJECTED",
      findings: [
        {
          findingId: "PROOF_SUBJECT_MUTATION_FORBIDDEN",
          detail:
            "Proof is observational. Run project --write explicitly before proving recovered state."
        }
      ]
    };
  }
  const receipt = evaluateConformance(options);
  if (options.writeReceipt && receipt.receiptType) {
    writeCanonicalReceipt(options, receipt);
  }
  return receipt;
}
