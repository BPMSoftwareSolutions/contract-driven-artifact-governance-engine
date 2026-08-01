import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  DEFAULT_CONFORMANCE_PROFILE_PATH,
  DEFAULT_MIGRATION_REGISTRY_PATH,
  DEFAULT_SCHEMA_CATALOG_PATH,
  canonicalJsonBytes,
  evaluateConformance,
  evaluateReceiptClaim,
  evaluateTrustClaim,
  inspectSourceAuthority,
  migrateContract,
  projectArtifactFamily,
  projectGovernedArtifactContractMarkdown,
  proveGovernedArtifactFamily,
  reconcileContractCommitments,
  resolveArtifactPlan,
  sourceTokens,
  validateContract
} from "../lib/governed-artifact-engine.mjs";
import {
  makeProviderNormalizationOntologyBundle,
  makeProviderNormalizationSemanticAuthority
} from "./fixtures/provider-normalization-ontology.mjs";
import {
  DEFAULT_RELEASE_AUTHORITY_PATH,
  evaluateReleaseBoundary,
  evaluateReleaseClaim,
  evaluateReleaseReceiptClaim,
  validateReleaseAuthority
} from "../lib/governed-release-boundary.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exampleContractPath = path.join(
  packageRoot,
  "examples",
  "governed-message-artifact-family.contract.json"
);
function boundSchemaPath(contractPath) {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  const catalog = JSON.parse(
    readFileSync(DEFAULT_SCHEMA_CATALOG_PATH, "utf8")
  );
  const entry = catalog.schemas.find(
    (schema) => schema.digest === contract.interpretationBase.schema.digest
  );
  return path.join(
    path.dirname(DEFAULT_SCHEMA_CATALOG_PATH),
    ...entry.relativePath.split("/")
  );
}

const historicalContractPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "governed-message-artifact-family.1.5.contract.json"
);
const previousInterpretationContractPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "governed-message-artifact-family.1.6.contract.json"
);
const previousOntologyContractPath = path.join(
  packageRoot,
  "test",
  "fixtures",
  "governed-message-artifact-family.1.8.contract.json"
);

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function makeWorkspace(t) {
  const workspacePath = mkdtempSync(
    path.join(os.tmpdir(), "governed-artifacts-")
  );
  const packageLinkPath = path.join(
    workspacePath,
    "node_modules",
    "contract-driven-artifact-governance-engine"
  );
  mkdirSync(path.dirname(packageLinkPath), { recursive: true });
  symlinkSync(packageRoot, packageLinkPath, "junction");
  t.after(() => rmSync(workspacePath, { recursive: true, force: true }));
  return workspacePath;
}

function copyContract(workspacePath, mutate = () => {}) {
  const contract = JSON.parse(readFileSync(exampleContractPath, "utf8"));
  mutate(contract);
  const contractPath = path.join(workspacePath, "governed-artifact.contract.json");
  writeFileSync(contractPath, canonicalJsonBytes(contract));
  return contractPath;
}

function recommitReviewDocument(contract) {
  const review = contract.artifacts.find(
    (artifact) => artifact.artifactId === "artifact-family-readme.v1"
  );
  const bytes = projectGovernedArtifactContractMarkdown(
    contract,
    review.projection.authority,
    review.artifactId
  );
  review.proof.contentSha256 = sha256(bytes);
  review.proof.expectedByteLength = bytes.length;
}

test("the admitted example contract is valid", () => {
  const contractBytes = readFileSync(exampleContractPath);
  assert.deepEqual(
    contractBytes,
    canonicalJsonBytes(JSON.parse(contractBytes.toString("utf8")))
  );
  const result = validateContract({ contractPath: exampleContractPath });
  assert.equal(result.contractValidationDisposition, "CONTRACT_VALID");
  assert.equal(result.conformanceDisposition, "NOT_EVALUATED");
  assert.equal(result.trustPosture, "NOT_EVALUATED");
});

test("structured meaning hidden in opaque text is a conformance failure", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    const artifact = contract.artifacts[0];
    artifact.mediaType = "text/html";
    artifact.projection = {
      authority: {
        authorityType: "utf8-text.v1",
        text: "<main>opaque meaning</main>\n"
      },
      authorityId: artifact.projection.authorityId,
      projectorId: "utf8-text-projector.v1"
    };
  });
  const result = validateContract({ contractPath, workspacePath });
  assert.equal(result.contractValidationDisposition, "CONTRACT_INVALID");
  assert.equal(
    result.findings.some(
      (finding) =>
        finding.findingId === "STRUCTURED_MEANING_HIDDEN_IN_TEXT"
    ),
    true
  );
});

test("the contract makes every governed control surface explicit", () => {
  const contract = JSON.parse(readFileSync(exampleContractPath, "utf8"));
  const profile = JSON.parse(
    readFileSync(DEFAULT_CONFORMANCE_PROFILE_PATH, "utf8")
  );
  assert.equal(
    profile.authorityClosure.authorityType,
    "closed-world-authority-closure.v1"
  );
  assert.equal(
    Object.values(profile.authorityClosure.coverage).every(
      (disposition) => disposition === "exact"
    ),
    true
  );
  assert.deepEqual(profile.authorityClosure.resolution, {
    ambiguousObservations: "reject",
    ambientAuthority: "forbidden",
    cardinality: "exactly-one",
    missingDeclaredAuthorities: "reject",
    undeclaredObservations: "reject",
    unresolvedObservations: "reject"
  });
  assert.equal(
    contract.workspace.governedScope.scopeType,
    "exclusive-artifact-subtree.v1"
  );
  assert.equal(
    contract.workspace.governedScope.inventoryMode,
    "exclusive-subtree"
  );
  assert.deepEqual(profile.operationAuthorities.authoredMutation, {
    governedArtifacts: "forbidden",
    posture: "sole-authored-change-authority",
    target: "contract"
  });
  assert.deepEqual(profile.operationAuthorities.projection, {
    artifactPosture: "replace-by-projection",
    operation: "project",
    subjectMutation: "declared-projections-only",
    writeMode: "explicit-only"
  });
  assert.deepEqual(profile.operationAuthorities.proof, {
    artifactProjection: "forbidden",
    declaredEvaluations: "read-only",
    mode: "read-only",
    mutationDisposition: "EVALUATION_INVALIDATED_BY_MUTATION",
    operation: "prove",
    receiptTarget: "outside-governed-subject",
    receiptWrite: "explicit-only",
    requiredSubjectDisposition: "PROOF_SUBJECT_UNCHANGED",
    subjectMutation: "forbidden"
  });
  assert.equal(
    profile.operationAuthorities.reconciliation.artifactProjection,
    "forbidden"
  );
  assert.equal(
    profile.operationAuthorities.reconciliation.trustIssuance,
    "forbidden"
  );
  assert.equal(
    profile.operationAuthorities.migration.targetMutation,
    "contract-only"
  );
  assert.deepEqual(
    profile.operationAuthorities.mutationAuthority,
    {
      authorityType: "single-source-mutation-authority.v1",
      consumerAuthoredAuthority: {
        cardinality: "exactly-one",
        source: "contract",
        target: "contract"
      },
      controlEvidenceMutation: {
        createOrReplace: "contract-declared-control-paths-only",
        remove: "forbidden"
      },
      derivedContractMutation: {
        admittedOperations: ["migrate", "reconcile"],
        target: "contract"
      },
      governedArtifactMutation: {
        authoritySource: "validated-contract",
        create: "declared-projections-only",
        interpretationBase: "digest-bound",
        remove: "forbidden",
        replace: "declared-projections-only",
        undeclaredState: "observe-and-reject"
      }
    }
  );
  assert.deepEqual(profile.operationAuthorities.bodyPurity, {
    admittedAuthorityTypes: [
      "semantic-projection-authority.v1",
      "semantic-execution-bundle.v1"
    ],
    allowedExecutableForms: [
      "single-semantic-invocation",
      "direct-return",
      "declared-port-binding"
    ],
    applicability: "artifacts-bound-to-semantic-authority-executor-port",
    consumerRelaxation: "forbidden",
    exactCardinality: {
      exportedResponsibilities: 1,
      resultFlows: 1,
      semanticInvocations: 1
    },
    executionPortEffect: "execute-semantic-authority",
    forbiddenExecutableMechanics: [
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
      "state-mutation",
      "meaning-hidden-in-text"
    ],
    profileType: "semantic-execution-body.v2",
    semanticAuthorityLocation: "contract"
  });
  assert.deepEqual(
    Object.keys(contract.interpretationBase).sort(),
    [
      "conformanceProfile",
      "engine",
      "migrationRegistry",
      "projectorRegistry",
      "schema",
      "verifierRegistry"
    ]
  );
  assert.equal(contract.authorityClosure, undefined);
  assert.equal(contract.operationAuthorities, undefined);
  assert.equal(
    contract.artifacts.every(
      (artifact) =>
        typeof artifact.relativePath === "string" &&
        artifact.relativePath.length > 0 &&
        artifact.ownership === undefined &&
        artifact.mutabilityPosture === undefined &&
        artifact.projection.mode === undefined &&
        artifact.proof.contentDigestRequired === undefined
    ),
    true
  );
  assert.equal(
    contract.dependencies.every(
      (dependency) =>
        dependency.specifier.length > 0 &&
        dependency.allowedImports.length > 0 &&
        Array.isArray(dependency.allowedInvocations) &&
        dependency.authority.authorityType.length > 0
    ),
    true
  );
  assert.equal(contract.runtimeAuthorities.length > 0, true);
  assert.equal(contract.effects.length > 0, true);

  const sourceArtifacts = contract.artifacts.filter(
    (artifact) => artifact.sourceAuthority
  );
  assert.equal(sourceArtifacts.length, 3);
  for (const artifact of sourceArtifacts) {
    assert.equal(
      artifact.sourceAuthority.responsibilities.some(
        (responsibility) =>
          responsibility.responsibilityType === "module"
      ),
      true
    );
    for (const collection of [
      "semanticEdges",
      "decisions",
      "iterations",
      "failurePolicies",
      "projectionMappings",
      "resultContracts",
      "forbiddenSyntaxKinds"
    ]) {
      assert.equal(
        Array.isArray(artifact.sourceAuthority[collection]),
        true,
        `${artifact.artifactId}:${collection}`
      );
    }
    assert.equal(
      artifact.sourceAuthority.semanticEdges.every(
        (edge) =>
          edge.responsibilityId.length > 0 &&
          Array.isArray(edge.argumentExpressions) &&
          edge.authorities.length > 0
      ),
      true
    );
    assert.equal(
      artifact.sourceAuthority.decisions.every(
        (decision) => decision.conditionExpression.length > 0
      ),
      true
    );
    assert.equal(
      artifact.sourceAuthority.iterations.every(
        (iteration) =>
          iteration.controlExpression.length > 0 &&
          iteration.continuationPolicy.length > 0 &&
          iteration.terminationPolicy.length > 0
      ),
      true
    );
  }

  const projector = sourceArtifacts.find(
    (artifact) => artifact.artifactId === "message-projector.v1"
  );
  assert.equal(projector.sourceAuthority.failurePolicies.length, 1);
  assert.deepEqual(
    projector.sourceAuthority.projectionMappings[0].fields,
    [{ outputField: "message", sourceExpression: "value.message" }]
  );
  assert.equal(
    projector.sourceAuthority.resultContracts[0].source.expression.length >
      0,
    true
  );
  assert.equal(
    contract.claims.every(
      (claim) =>
        Object.keys(claim).sort().join(",") === "claim,claimId"
    ),
    true
  );
});

test("historical schemas and digest-to-digest migration authority are durable", () => {
  const catalog = JSON.parse(
    readFileSync(DEFAULT_SCHEMA_CATALOG_PATH, "utf8")
  );
  const registry = JSON.parse(
    readFileSync(DEFAULT_MIGRATION_REGISTRY_PATH, "utf8")
  );
  assert.equal(
    registry.schemaCatalog.digest,
    sha256(readFileSync(DEFAULT_SCHEMA_CATALOG_PATH))
  );
  assert.equal(registry.migrations.length, 7);
  const edge = registry.migrations[0];
  for (const digest of [
    edge.sourceSchemaDigest,
    edge.targetSchemaDigest
  ]) {
    const entry = catalog.schemas.find(
      (schema) => schema.digest === digest
    );
    assert.ok(entry);
    assert.equal(
      sha256(
        readFileSync(
          path.join(
            path.dirname(DEFAULT_SCHEMA_CATALOG_PATH),
            ...entry.relativePath.split("/")
          )
        )
      ),
      digest
    );
  }
  assert.equal(edge.preservedAuthorities.length > 0, true);
  assert.equal(edge.transformedAuthorities.length > 0, true);
  assert.equal(edge.introducedAuthorities.length > 0, true);
  assert.equal(edge.removedAuthorities.length > 0, true);
});

test("migration is candidate-first, contract-only, and idempotent", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = path.join(
    workspacePath,
    "governed-artifact.contract.json"
  );
  writeFileSync(
    contractPath,
    readFileSync(historicalContractPath)
  );
  const sourceBytes = readFileSync(contractPath);
  const preview = migrateContract({
    contractPath,
    workspacePath
  });
  assert.equal(
    preview.migrationDisposition,
    "CONTRACT_MIGRATION_REQUIRED"
  );
  assert.equal(preview.diff.length > 0, true);
  assert.equal(
    preview.diff.every((change) => change.path.startsWith("/")),
    true
  );
  assert.deepEqual(readFileSync(contractPath), sourceBytes);
  assert.equal(
    existsSync(
      path.join(
        workspacePath,
        "governed-message-artifact-family"
      )
    ),
    false
  );

  const written = migrateContract({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(written.migrationDisposition, "CONTRACT_MIGRATED");
  assert.equal(
    validateContract({
      contractPath,
      workspacePath,
      schemaPath: boundSchemaPath(contractPath)
    }).contractValidationDisposition,
    "CONTRACT_VALID"
  );
  assert.equal(
    validateContract({
      contractPath,
      workspacePath
    }).contractValidationDisposition,
    "SCHEMA_DIGEST_MISMATCH"
  );
  assert.equal(
    existsSync(
      path.join(
        workspacePath,
        "governed-message-artifact-family"
      )
    ),
    false
  );
  const replay = migrateContract({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(
    replay.migrationDisposition,
    "MIGRATION_NOT_REQUIRED"
  );
  assert.deepEqual(replay.diff, []);
  assert.equal(replay.writeDisposition, "CONTRACT_UNCHANGED");
});

test("interpretation-only migration is admitted without schema churn", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = path.join(
    workspacePath,
    "governed-artifact.contract.json"
  );
  writeFileSync(
    contractPath,
    readFileSync(previousInterpretationContractPath)
  );
  const preview = migrateContract({
    contractPath,
    workspacePath
  });
  assert.equal(
    preview.migrationDisposition,
    "CONTRACT_MIGRATION_REQUIRED"
  );
  assert.equal(
    preview.sourceSchemaDigest,
    preview.targetSchemaDigest
  );
  assert.equal(
    preview.migrationId,
    "artifact-contract.1.6-to-1.7"
  );
  assert.equal(
    preview.diff.some(
      (change) =>
        change.path ===
        "/interpretationBase/conformanceProfile/identity"
    ),
    true
  );

  const written = migrateContract({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(written.migrationDisposition, "CONTRACT_MIGRATED");
  const replay = migrateContract({
    contractPath,
    workspacePath
  });
  assert.equal(
    replay.migrationDisposition,
    "MIGRATION_NOT_REQUIRED"
  );
  assert.deepEqual(replay.diff, []);
});

test("ontology interpretation migration is admitted without schema churn", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = path.join(
    workspacePath,
    "governed-artifact.contract.json"
  );
  writeFileSync(
    contractPath,
    readFileSync(previousOntologyContractPath)
  );
  const preview = migrateContract({
    contractPath,
    workspacePath
  });
  assert.equal(
    preview.migrationDisposition,
    "CONTRACT_MIGRATION_REQUIRED"
  );
  assert.equal(preview.sourceSchemaDigest, preview.targetSchemaDigest);
  assert.equal(
    preview.migrationId,
    "artifact-contract.1.8-to-1.9"
  );
  assert.equal(
    preview.diff.some(
      (change) =>
        change.path ===
        "/interpretationBase/conformanceProfile/identity"
    ),
    true
  );

  const written = migrateContract({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(written.migrationDisposition, "CONTRACT_MIGRATED");
  assert.equal(
    written.candidateContract.contract.contractVersion,
    "1.9.0"
  );
  const replay = migrateContract({
    contractPath,
    workspacePath
  });
  assert.equal(replay.migrationDisposition, "MIGRATION_NOT_REQUIRED");
  assert.deepEqual(replay.diff, []);
});

test("multi-observation primitive migration is admitted without schema churn", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    contract.contract.contractVersion = "1.9.0";
    contract.interpretationBase.schema = {
      digest:
        "sha256:d95db56bc6838127bcb72da6532cd1c3b2552bfca864dc276ba134ed3f96c8a4",
      identity:
        "https://canonical.local/schemas/governed-artifact-contract.schema.json"
    };
    contract.interpretationBase.conformanceProfile = {
      digest:
        "sha256:577106b91879dcbf1fb829ec87adaf969cccdc6e2e3f54d67f224b5718fa3f56",
      identity: "closed-world-artifact-conformance.v4"
    };
    contract.interpretationBase.engine = {
      digest:
        "sha256:106c780a56f65ed5448a7100d01fced1bea3d572657fcc88d7b2c0b78a9afef2",
      identity: "governed-artifact-engine.0.10.0"
    };
    contract.interpretationBase.migrationRegistry.digest =
      "sha256:45521912c2c6849ae6f0e7b66e14d49a711706e03650780ef1fc43b29487c95c";
    delete contract.workspace.pathExceptions;
    delete contract.lineage;
    delete contract.designAuthority;
    contract.artifacts = contract.artifacts.filter(
      (artifact) => artifact.artifactId !== "design-decision-record.v1"
    );
    // A 1.9 contract predates both the lineage spine and the sealed projector.
    for (const artifact of contract.artifacts) {
      if (
        artifact.projection.projectorId ===
        "provenance-sealed-source-projector.v1"
      ) {
        artifact.projection.projectorId =
          "lossless-source-token-projector.v1";
        artifact.proof.verifierIds = artifact.proof.verifierIds.filter(
          (verifierId) => verifierId !== "artifact-provenance-verifier.v1"
        );
      }
    }
  });
  const preview = migrateContract({
    contractPath,
    workspacePath
  });
  assert.equal(
    preview.migrationDisposition,
    "CONTRACT_MIGRATION_REQUIRED"
  );
  assert.equal(preview.sourceSchemaDigest, preview.targetSchemaDigest);
  assert.equal(
    preview.migrationId,
    "artifact-contract.1.9-to-1.10"
  );

  const written = migrateContract({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(written.migrationDisposition, "CONTRACT_MIGRATED");
  assert.equal(
    written.candidateContract.contract.contractVersion,
    "1.10.0"
  );
  const replay = migrateContract({
    contractPath,
    workspacePath
  });
  assert.equal(replay.migrationDisposition, "MIGRATION_NOT_REQUIRED");
  assert.deepEqual(replay.diff, []);
});

test("commitment reconciliation is deterministic and never projects artifacts", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    contract.artifacts[0].purpose =
      "Constrains a deliberately revised governed message value.";
  });
  const before = readFileSync(contractPath);
  const preview = reconcileContractCommitments({
    contractPath,
    workspacePath
  });
  assert.equal(
    preview.reconciliationDisposition,
    "DERIVED_COMMITMENT_RECONCILIATION_REQUIRED"
  );
  assert.deepEqual(
    preview.diff.map((change) => change.path),
    [
      "/artifacts/6/proof/contentSha256",
      "/artifacts/6/proof/expectedByteLength"
    ]
  );
  assert.deepEqual(readFileSync(contractPath), before);
  assert.equal(
    existsSync(
      path.join(
        workspacePath,
        "governed-message-artifact-family"
      )
    ),
    false
  );

  const written = reconcileContractCommitments({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(
    written.writeDisposition,
    "CONTRACT_COMMITMENTS_WRITTEN"
  );
  assert.equal(
    validateContract({
      contractPath,
      workspacePath
    }).contractValidationDisposition,
    "CONTRACT_VALID"
  );
  const replay = reconcileContractCommitments({
    contractPath,
    workspacePath
  });
  assert.equal(
    replay.reconciliationDisposition,
    "DERIVED_COMMITMENTS_CURRENT"
  );
  assert.deepEqual(replay.diff, []);
});

test("source observation records exact semantic expressions", () => {
  const observation = inspectSourceAuthority(
    "export function collect(values) { for (let index = 0; index < values.length; index += 1) { if (values[index]) output.push({ message: values[index] }); } return output; }"
  );
  assert.deepEqual(observation.functions, [
    {
      declaration: "collect",
      functionKind: "function-declaration"
    }
  ]);
  assert.deepEqual(observation.semanticOperations, [
    {
      responsibilityDeclaration: "collect",
      edgeKind: "invocation",
      operation: "output.push",
      argumentExpressions: ["{message:values[index]}"],
      occurrences: 1
    }
  ]);
  assert.deepEqual(observation.decisions, [
    {
      responsibilityDeclaration: "collect",
      syntaxKind: "IfStatement",
      conditionExpression: "values[index]",
      occurrences: 1
    }
  ]);
  assert.deepEqual(observation.iterations, [
    {
      responsibilityDeclaration: "collect",
      syntaxKind: "ForStatement",
      controlExpression: "letindex=0;index<values.length;index+=1",
      occurrences: 1
    }
  ]);
  assert.deepEqual(observation.projections, [
    {
      responsibilityDeclaration: "collect",
      fields: [
        {
          outputField: "message",
          sourceExpression: "values[index]"
        }
      ],
      occurrences: 1
    }
  ]);
  assert.deepEqual(observation.returns, [
    {
      responsibilityDeclaration: "collect",
      returnKind: "explicit-return",
      expression: "output",
      occurrences: 1
    }
  ]);
  assert.deepEqual(
    inspectSourceAuthority(
      "const arrow = (value) => value; const expression = function (value) { return value; }; const catalog = { select(value) { return value; } };"
    ).functions,
    [
      {
        declaration: "arrow",
        functionKind: "arrow-function"
      },
      {
        declaration: "expression",
        functionKind: "function-expression"
      },
      {
        declaration: "select",
        functionKind: "method-declaration"
      }
    ]
  );
});

test("the complete closed loop projects, evaluates, and writes deterministic trust evidence", (t) => {
  const workspacePath = makeWorkspace(t);
  const projection = projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(
    projection.projectionDisposition,
    "ARTIFACT_FAMILY_PROJECTED"
  );
  assert.equal(
    projection.mutationAuthority.authority
      .consumerAuthoredAuthority.source,
    "contract"
  );
  assert.equal(
    projection.mutationAuthority.removalDisposition,
    "FORBIDDEN"
  );
  assert.equal(
    projection.mutationAuthority.undeclaredStateDisposition,
    "OBSERVE_AND_REJECT"
  );
  const first = proveGovernedArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    writeReceipt: true
  });
  assert.equal(first.artifactFamily.conformanceDisposition, "CONTRACT_AUTHORITY_CLOSED");
  assert.equal(
    first.artifactFamily.authorityClosureDisposition,
    "ARTIFACT_AUTHORITY_CLOSED"
  );
  assert.equal(
    first.checks.find(
      (check) =>
        check.checkId === "evaluate-semantic-execution-bodies"
    ).disposition,
    "SEMANTIC_EXECUTION_BODY_CLOSED"
  );
  const projectedBodyObservation =
    first.artifactFamily.artifactObservations.find(
      (observation) =>
        observation.artifactId === "message-projector.v1"
    ).sourceAuthorityObservation;
  assert.deepEqual(projectedBodyObservation.decisions, []);
  assert.deepEqual(projectedBodyObservation.iterations, []);
  assert.deepEqual(projectedBodyObservation.failures, []);
  assert.deepEqual(
    projectedBodyObservation.projections.filter(
      (entry) =>
        entry.responsibilityDeclaration === "projectMessage"
    ),
    []
  );
  assert.deepEqual(
    projectedBodyObservation.semanticOperations.filter(
      (entry) =>
        entry.responsibilityDeclaration === "projectMessage"
    ),
    [
      {
        responsibilityDeclaration: "projectMessage",
        edgeKind: "invocation",
        operation: "executeSemanticProjection",
        argumentExpressions: [
          "projectMessageAuthority",
          "messageSchema",
          "value"
        ],
        occurrences: 1
      }
    ]
  );
  assert.equal(first.artifactFamily.proofDisposition, "PROOF_COMPLETE");
  assert.equal(first.proofOperation.mode, "read-only");
  assert.equal(
    first.proofOperation.subjectMutationDisposition,
    "PROOF_SUBJECT_UNCHANGED"
  );
  assert.equal(
    first.checks.findIndex(
      (check) => check.checkId === "verify-proof-subject-stability"
    ) <
      first.checks.findIndex(
        (check) => check.checkId === "issue-trust-disposition"
      ),
    true
  );
  assert.equal(first.trustPosture, "CONFORMS");
  assert.equal(first.trustDisposition, "TRUSTED");
  assert.equal(first.artifactFamily.declaredArtifactCount, 10);
  assert.equal(first.artifactFamily.observedArtifactCount, 10);

  const contract = JSON.parse(readFileSync(exampleContractPath, "utf8"));
  const profile = JSON.parse(
    readFileSync(DEFAULT_CONFORMANCE_PROFILE_PATH, "utf8")
  );
  assert.deepEqual(first.artifactFamily.authorityClosure, {
    authorityType: "closed-world-authority-closure.v1",
    profileSha256: sha256(
      canonicalJsonBytes(profile.authorityClosure)
    ),
    disposition: "ARTIFACT_AUTHORITY_CLOSED"
  });
  assert.equal(
    first.artifactFamily.artifactScope.disposition,
    "ARTIFACT_SCOPE_CLOSED"
  );
  assert.equal(
    first.artifactFamily.artifactScope.inventoryMode,
    "exclusive-subtree"
  );
  const reviewArtifact = contract.artifacts.find(
    (artifact) => artifact.artifactId === "artifact-family-readme.v1"
  );
  const expectedReview = projectGovernedArtifactContractMarkdown(
    contract,
    reviewArtifact.projection.authority,
    reviewArtifact.artifactId
  );
  const observedReview = readFileSync(
    path.join(
      workspacePath,
      "governed-message-artifact-family",
      "README.md"
    )
  );
  assert.deepEqual(observedReview, expectedReview);
  assert.match(
    observedReview.toString("utf8"),
    /## Projection Authorities[\s\S]+governed-artifact-contract-markdown-projector\.v1/
  );
  assert.match(
    observedReview.toString("utf8"),
    /## Terminal Dispositions[\s\S]+PROJECTION_IDENTITY_MISMATCH/
  );
  assert.match(
    observedReview.toString("utf8"),
    /## Dependency Authorities[\s\S]+node-fs-read\.v1/
  );
  assert.match(
    observedReview.toString("utf8"),
    /## Claim Policies[\s\S]+CONTRACT_AUTHORITY_CLOSED/
  );
  assert.match(
    observedReview.toString("utf8"),
    /## Effect Authorities[\s\S]+write-message-output\.v1/
  );
  assert.match(
    observedReview.toString("utf8"),
    /## Operation Authorities[\s\S]+sole-authored-change-authority/
  );

  const receiptPath = path.join(
    workspacePath,
    ".governance",
    "receipts",
    "governed-message-artifact-family.receipt.json"
  );
  const firstReceipt = readFileSync(receiptPath);
  const second = proveGovernedArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    mode: "check",
    writeReceipt: true
  });
  const secondReceipt = readFileSync(receiptPath);
  assert.deepEqual(second, first);
  assert.deepEqual(secondReceipt, firstReceipt);
});

test("a contract-projected ontology bundle closes meaning, execution, and a mechanically empty body", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    const bundleArtifact = contract.artifacts.find(
      (artifact) =>
        artifact.artifactId === "message-projector-authority.v1"
    );
    bundleArtifact.artifactKind = "deterministic-ontology-bundle";
    bundleArtifact.purpose =
      "Projects the complete deterministic provider-response ontology and its bound execution subject.";
    bundleArtifact.projection.projectorId =
      "bound-semantic-execution-authority-projector.v1";
    bundleArtifact.projection.authority.value =
      makeProviderNormalizationSemanticAuthority();
    bundleArtifact.relationships = [];

    const projectedSchema = contract.artifacts.find(
      (artifact) => artifact.artifactId === "message-schema.v1"
    );
    projectedSchema.purpose =
      "Projects the OpenAI response schema directly from the bound ontology.";
    projectedSchema.projection = {
      authorityId: "openai-response-ontology-schema-authority.v1",
      projectorId: "deterministic-ontology-schema-projector.v1",
      authority: {
        authorityType: "canonical-json-value.v1",
        value: {
          authorityType: "deterministic-ontology-projection.v1",
          bundleArtifactId: "message-projector-authority.v1",
          projectionKind: "bound-schema",
          subjectId: "openai-response.schema.v1"
        }
      }
    };
    projectedSchema.relationships = [
      {
        artifactId: "message-projector-authority.v1",
        relationshipType: "derived-from-ontology"
      }
    ];

    const ontologyDocument = contract.artifacts.find(
      (artifact) => artifact.artifactId === "closed-loop-diagram.v1"
    );
    ontologyDocument.artifactKind = "markdown-document";
    ontologyDocument.mediaType = "text/markdown";
    ontologyDocument.purpose =
      "Projects ontology meaning, execution bindings, and proof requirements.";
    ontologyDocument.relativePath =
      "architecture/provider-response-ontology.md";
    ontologyDocument.projection = {
      authorityId: "provider-ontology-documentation-authority.v1",
      projectorId: "deterministic-ontology-documentation-projector.v1",
      authority: {
        authorityType: "canonical-json-value.v1",
        value: {
          authorityType: "deterministic-ontology-projection.v1",
          bundleArtifactId: "message-projector-authority.v1",
          projectionKind: "ontology-documentation",
          subjectId: "provider-response-normalization"
        }
      }
    };
    ontologyDocument.proof.verifierIds = [
      "content-digest-verifier.v1"
    ];
    ontologyDocument.relationships = [
      {
        artifactId: "message-projector-authority.v1",
        relationshipType: "derived-from-ontology"
      }
    ];

    const body = contract.artifacts.find(
      (artifact) => artifact.artifactId === "message-projector.v1"
    );
    const bodyText = [
      'import { executeSemanticAuthority as runDeterministicOntology } from "contract-driven-artifact-governance-engine";',
      'import normalizationOntology from "../contracts/project-message.authority.json" with { type: "json" };',
      "",
      "export function projectMessage(value) {",
      "  return runDeterministicOntology(normalizationOntology, value);",
      "}",
      ""
    ].join("\n");
    body.projection.authority.tokens = sourceTokens(bodyText);
    body.relationships = body.relationships.filter(
      (relationship) => relationship.artifactId !== "message-schema.v1"
    );
    body.sourceAuthority.decisions = [];
    body.sourceAuthority.iterations = [];
    body.sourceAuthority.failurePolicies = [];
    body.sourceAuthority.projectionMappings = [];
    body.sourceAuthority.semanticEdges = [
      {
        argumentExpressions: ["normalizationOntology", "value"],
        authorities: [
          {
            authorityType: "dependency-authority",
            dependencyId: "message-projector-authority-data.v1"
          },
          {
            authorityType: "dependency-authority",
            dependencyId: "semantic-projection-runtime.v1"
          },
          {
            authorityType: "runtime-authority",
            runtimeAuthorityId: "semantic-projection-runtime.v1"
          }
        ],
        edgeId: "execute-project-message-semantics.v1",
        edgeKind: "invocation",
        occurrences: 1,
        operation: "runDeterministicOntology",
        purpose:
          "Forwards the declared input through the bound deterministic ontology.",
        responsibilityId: "project-message.v1"
      }
    ];
    body.sourceAuthority.resultContracts = [
      {
        mediaType: "application/json",
        purpose: "Returns exactly one discriminated ontology result.",
        resultContractId: "normalized-provider-response.v1",
        resultKind: "semantic-ontology-result",
        source: {
          expression:
            "runDeterministicOntology(normalizationOntology,value)",
          occurrences: 1,
          responsibilityId: "project-message.v1",
          returnKind: "explicit-return",
          sourceType: "return"
        }
      }
    ];
    for (const artifact of contract.artifacts) {
      for (const result of artifact.sourceAuthority?.resultContracts ?? []) {
        if (
          result.projectionMapping?.artifactId === "message-projector.v1"
        ) {
          delete result.projectionMapping;
        }
      }
    }

    contract.dependencies = contract.dependencies.filter(
      (dependency) =>
        dependency.dependencyId !== "message-projector-schema-data.v1"
    );
    const dataDependency = contract.dependencies.find(
      (dependency) =>
        dependency.dependencyId === "message-projector-authority-data.v1"
    );
    dataDependency.allowedImports = ["default"];
    const runtimeDependency = contract.dependencies.find(
      (dependency) =>
        dependency.dependencyId === "semantic-projection-runtime.v1"
    );
    runtimeDependency.allowedImports = ["executeSemanticAuthority"];
    runtimeDependency.allowedInvocations = ["executeSemanticAuthority"];
    const runtime = contract.runtimeAuthorities.find(
      (entry) =>
        entry.runtimeAuthorityId === "semantic-projection-runtime.v1"
    );
    runtime.invocation = "runDeterministicOntology";
    runtime.purpose =
      "Executes the contract-projected deterministic ontology bundle.";
    contract.conformance.artifactEvaluations = [];
  });

  const reconciliation = reconcileContractCommitments({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(
    reconciliation.reconciliationDisposition,
    "DERIVED_COMMITMENTS_RECONCILED",
    JSON.stringify(reconciliation.findings ?? reconciliation)
  );
  projectArtifactFamily({ contractPath, workspacePath, mode: "write" });
  const receipt = evaluateConformance({ contractPath, workspacePath });
  assert.equal(receipt.trustPosture, "CONFORMS");
  assert.equal(receipt.artifactFamily.findings.length, 0);
  assert.equal(
    receipt.checks.find(
      (check) => check.checkId === "evaluate-ontology-authority"
    ).disposition,
    "ONTOLOGY_AUTHORITY_CLOSED"
  );
  assert.equal(
    receipt.checks.find(
      (check) => check.checkId === "evaluate-semantic-execution-bodies"
    ).disposition,
    "SEMANTIC_EXECUTION_BODY_CLOSED"
  );
  const projectedBundle = JSON.parse(
    readFileSync(
      path.join(
        workspacePath,
        "governed-message-artifact-family",
        "contracts",
        "project-message.authority.json"
      ),
      "utf8"
    )
  );
  assert.deepEqual(
    projectedBundle,
    makeProviderNormalizationOntologyBundle()
  );
  assert.equal(
    projectedBundle.authority.executionGraph.entryNodeId,
    "node.input.provider-response"
  );
  const projectedBodyPath = path.join(
    workspacePath,
    "governed-message-artifact-family",
    "src",
    "project-message.mjs"
  );
  writeFileSync(
    projectedBodyPath,
    readFileSync(projectedBodyPath, "utf8").replace(
      "  return runDeterministicOntology",
      "  if (!value) return null;\n  return runDeterministicOntology"
    )
  );
  const rejected = evaluateConformance({ contractPath, workspacePath });
  assert.equal(rejected.trustPosture, "CONTAMINATED");
  assert.equal(
    rejected.artifactFamily.findings.some(
      (finding) =>
        finding.findingId ===
        "DECLARED_SEMANTICS_DO_NOT_AUTHORIZE_BODY_BRANCHING"
    ),
    true
  );
});

test("prove preserves drift, rejects implicit repair, and requires explicit reprojection", (t) => {
  const workspacePath = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    mode: "write"
  });
  const sourcePath = path.join(
    workspacePath,
    "governed-message-artifact-family",
    "src",
    "project-message.mjs"
  );
  const driftedBytes = Buffer.from(
    `import "node:os";\n${readFileSync(sourcePath, "utf8")}`,
    "utf8"
  );
  writeFileSync(sourcePath, driftedBytes);

  const commandResult = spawnSync(
    process.execPath,
    [
      path.join(packageRoot, "bin", "governed-artifacts.mjs"),
      "prove",
      "--contract",
      exampleContractPath,
      "--workspace",
      workspacePath
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      shell: false
    }
  );
  assert.equal(commandResult.status, 1);
  const observed = JSON.parse(commandResult.stdout);
  assert.equal(
    observed.artifactFamily.conformanceDisposition,
    "ARTIFACT_ESCAPES_CONTRACT"
  );
  assert.equal(observed.trustDisposition, "REJECTED");
  assert.equal(
    observed.artifactFamily.findings.some(
      (finding) =>
        finding.findingId === "UNDECLARED_DEPENDENCY_IMPORT" &&
        finding.specifier === "node:os"
    ),
    true
  );
  assert.deepEqual(readFileSync(sourcePath), driftedBytes);

  const forbiddenWrite = proveGovernedArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(
    forbiddenWrite.proofOperation.subjectMutationDisposition,
    "PROOF_SUBJECT_MUTATION_FORBIDDEN"
  );
  assert.equal(forbiddenWrite.trustDisposition, "REJECTED");
  assert.deepEqual(readFileSync(sourcePath), driftedBytes);

  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    mode: "write"
  });
  const recovered = proveGovernedArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath
  });
  assert.equal(
    recovered.artifactFamily.conformanceDisposition,
    "CONTRACT_AUTHORITY_CLOSED"
  );
  assert.equal(recovered.trustDisposition, "TRUSTED");
});

test("proof is invalidated when a declared evaluation mutates the subject", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    contract.conformance.artifactEvaluations[0].command = [
      "node",
      "-e",
      "require('node:fs').appendFileSync('src/project-message.mjs', '// concurrent mutation\\n'); process.stdout.write('ARTIFACT_TEST_CONFORMS');"
    ];
    recommitReviewDocument(contract);
  });
  projectArtifactFamily({
    contractPath,
    workspacePath,
    mode: "write"
  });

  const result = proveGovernedArtifactFamily({
    contractPath,
    workspacePath
  });
  assert.equal(
    result.artifactFamily.conformanceDisposition,
    "EVALUATION_INVALIDATED_BY_MUTATION"
  );
  assert.equal(
    result.proofOperation.subjectMutationDisposition,
    "EVALUATION_INVALIDATED_BY_MUTATION"
  );
  assert.equal(result.artifactFamily.proofDisposition, "PROOF_INCOMPLETE");
  assert.equal(result.trustDisposition, "REJECTED");
  assert.equal(
    result.artifactFamily.findings.some(
      (finding) =>
        finding.findingId === "EVALUATION_INVALIDATED_BY_MUTATION"
    ),
    true
  );
});

test("schema identity and digest failures do not evaluate artifact conformance", (t) => {
  const workspacePath = makeWorkspace(t);
  const wrongIdentityPath = copyContract(workspacePath, (contract) => {
    contract.interpretationBase.schema.identity =
      "https://governed.local/schemas/not-admitted.json";
  });
  const wrongIdentity = validateContract({ contractPath: wrongIdentityPath });
  assert.equal(wrongIdentity.contractValidationDisposition, "SCHEMA_NOT_ADMITTED");
  assert.equal(wrongIdentity.conformanceDisposition, "NOT_EVALUATED");

  const wrongDigestPath = copyContract(workspacePath, (contract) => {
    contract.interpretationBase.schema.digest = `sha256:${"0".repeat(64)}`;
  });
  const wrongDigest = validateContract({ contractPath: wrongDigestPath });
  assert.equal(wrongDigest.contractValidationDisposition, "SCHEMA_DIGEST_MISMATCH");
  assert.equal(wrongDigest.conformanceDisposition, "NOT_EVALUATED");
});

test("schema-valid shape and semantic binding are separate contract checks", (t) => {
  const workspacePath = makeWorkspace(t);
  const missingSubjectPath = copyContract(workspacePath, (contract) => {
    delete contract.subject;
  });
  assert.equal(
    validateContract({ contractPath: missingSubjectPath }).contractValidationDisposition,
    "CONTRACT_INVALID"
  );

  const unresolvedRelationshipPath = copyContract(workspacePath, (contract) => {
    contract.artifacts[0].relationships.push({
      relationshipType: "refers-to",
      artifactId: "absent-artifact.v1"
    });
  });
  const unresolved = validateContract({
    contractPath: unresolvedRelationshipPath
  });
  assert.equal(unresolved.contractValidationDisposition, "CONTRACT_INVALID");
  assert.equal(
    unresolved.findings.some(
      (finding) => finding.findingId === "relationship-target-missing"
    ),
    true
  );
});

test("the conformance profile is mandatory and cannot be weakened", (t) => {
  const workspacePath = makeWorkspace(t);
  const missingProfilePath = copyContract(workspacePath, (contract) => {
    delete contract.interpretationBase.conformanceProfile;
  });
  assert.equal(
    validateContract({
      contractPath: missingProfilePath
    }).contractValidationDisposition,
    "CONTRACT_INVALID"
  );

  const weakenedProfile = JSON.parse(
    readFileSync(DEFAULT_CONFORMANCE_PROFILE_PATH, "utf8")
  );
  weakenedProfile.authorityClosure.resolution.ambientAuthority =
    "permitted";
  const weakenedProfileFile = path.join(
    workspacePath,
    "weakened-conformance-profile.json"
  );
  writeFileSync(
    weakenedProfileFile,
    canonicalJsonBytes(weakenedProfile)
  );
  const weakenedProfilePath = copyContract(workspacePath, (contract) => {
    contract.interpretationBase.conformanceProfile.digest = sha256(
      canonicalJsonBytes(weakenedProfile)
    );
  });
  assert.equal(
    validateContract({
      contractPath: weakenedProfilePath,
      conformanceProfilePath: weakenedProfileFile
    }).contractValidationDisposition,
    "CONTRACT_INVALID"
  );

  const opaqueMeaningProfile = JSON.parse(
    readFileSync(DEFAULT_CONFORMANCE_PROFILE_PATH, "utf8")
  );
  opaqueMeaningProfile.structuredMeaningAuthority.opaqueEncodingDisposition =
    "PERMITTED";
  const opaqueMeaningProfileFile = path.join(
    workspacePath,
    "opaque-meaning-conformance-profile.json"
  );
  writeFileSync(
    opaqueMeaningProfileFile,
    canonicalJsonBytes(opaqueMeaningProfile)
  );
  const opaqueMeaningContractPath = copyContract(workspacePath, (contract) => {
    contract.interpretationBase.conformanceProfile.digest = sha256(
      canonicalJsonBytes(opaqueMeaningProfile)
    );
  });
  assert.equal(
    validateContract({
      contractPath: opaqueMeaningContractPath,
      conformanceProfilePath: opaqueMeaningProfileFile
    }).contractValidationDisposition,
    "CONTRACT_INVALID"
  );
});

test("the workspace is exhaustively classified and the consumer cannot narrow it", (t) => {
  const workspacePath = makeWorkspace(t);
  for (const [relativePath, contents] of [
    [".git/config", "[core]\n"],
    ["node_modules/example/index.js", "export default true;\n"],
    ["package-lock.json", "{}\n"],
    ["src/unrelated.mjs", "export const unrelated = true;\n"]
  ]) {
    const absolutePath = path.join(
      workspacePath,
      ...relativePath.split("/")
    );
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, contents);
  }
  const narrowScope = (contract) => {
    contract.workspace = {
      artifactRoot: ".",
      governedScope: {
        governedDirectories: [],
        inventoryMode: "declared-paths",
        outsideScopePosture: "outside-authority",
        requiredDisposition: "ARTIFACT_SCOPE_CLOSED",
        scopeType: "declared-artifact-scope.v1"
      },
      pathExceptions: [],
      workspaceRoot: "."
    };
    recommitReviewDocument(contract);
  };
  const contractPath = copyContract(workspacePath, narrowScope);
  projectArtifactFamily({ contractPath, workspacePath, mode: "write" });

  const narrowed = evaluateConformance({ contractPath, workspacePath });
  assert.equal(
    narrowed.artifactFamily.conformanceDisposition,
    "WORKSPACE_AUTHORITY_OPEN"
  );
  assert.equal(narrowed.trustDisposition, "REJECTED");
  assert.equal(
    narrowed.artifactFamily.workspaceAuthority.inventoryPosture,
    "exhaustive"
  );
  for (const relativePath of [
    ".git/config",
    "node_modules/example/index.js",
    "package-lock.json",
    "src/unrelated.mjs"
  ]) {
    assert.equal(
      narrowed.artifactFamily.findings.some(
        (finding) =>
          finding.findingId === "UNAUTHORIZED_WORKSPACE_ARTIFACT" &&
          finding.relativePath === relativePath
      ),
      true,
      relativePath
    );
  }

  const inventedPath = copyContract(workspacePath, (contract) => {
    narrowScope(contract);
    contract.workspace.pathExceptions = [
      { exceptionId: "build-scripts.v1", path: "src" }
    ];
  });
  const invented = evaluateConformance({
    contractPath: inventedPath,
    workspacePath
  });
  assert.equal(
    invented.artifactFamily.findings.some(
      (finding) =>
        finding.findingId === "WORKSPACE_PATH_EXCEPTION_NOT_ADMITTED" &&
        finding.exceptionId === "build-scripts.v1"
    ),
    true
  );

  const admittedPath = copyContract(workspacePath, (contract) => {
    narrowScope(contract);
    contract.workspace.pathExceptions = [
      { exceptionId: "git-repository-metadata.v1", path: ".git" },
      {
        exceptionId: "npm-installed-dependencies.v1",
        path: "node_modules",
        evidence: {
          "package-lock-digest": sha256(
            readFileSync(path.join(workspacePath, "package-lock.json"))
          ),
          "package-manager-identity": "npm@10.8.2"
        }
      }
    ];
  });
  const admitted = evaluateConformance({
    contractPath: admittedPath,
    workspacePath
  });
  assert.equal(
    admitted.artifactFamily.findings.some(
      (finding) => finding.relativePath === ".git/config"
    ),
    false
  );
  assert.equal(
    admitted.artifactFamily.findings.some(
      (finding) => finding.relativePath === "node_modules/example/index.js"
    ),
    false
  );
  for (const relativePath of ["package-lock.json", "src/unrelated.mjs"]) {
    assert.equal(
      admitted.artifactFamily.findings.some(
        (finding) =>
          finding.findingId === "UNAUTHORIZED_WORKSPACE_ARTIFACT" &&
          finding.relativePath === relativePath
      ),
      true,
      relativePath
    );
  }
  assert.equal(
    admitted.artifactFamily.workspaceAuthority.pathExceptions.map(
      (exception) => exception.pathRole
    ).sort().join(","),
    "external-dependency-materialization,repository-metadata"
  );
});

test("overlapping governed directories are rejected as ambiguous scope authority", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    contract.workspace.governedScope = {
      governedDirectories: ["src", "src/generated"],
      inventoryMode: "declared-paths",
      outsideScopePosture: "outside-authority",
      requiredDisposition: "ARTIFACT_SCOPE_CLOSED",
      scopeType: "declared-artifact-scope.v1"
    };
    recommitReviewDocument(contract);
  });
  const validation = validateContract({ contractPath });
  assert.equal(
    validation.contractValidationDisposition,
    "CONTRACT_INVALID"
  );
  assert.equal(
    validation.findings.some(
      (finding) =>
        finding.findingId === "overlapping-governed-directories"
    ),
    true
  );
});

test("missing, extra, and drifted artifacts receive distinct trust postures", (t) => {
  const missingWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: missingWorkspace,
    mode: "write"
  });
  unlinkSync(
    path.join(
      missingWorkspace,
      "governed-message-artifact-family",
      "contracts",
      "message.json"
    )
  );
  const missing = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: missingWorkspace
  });
  assert.equal(missing.artifactFamily.conformanceDisposition, "ARTIFACT_MISSING");
  assert.equal(missing.trustPosture, "MISSING");

  const extraWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: extraWorkspace,
    mode: "write"
  });
  writeFileSync(
    path.join(extraWorkspace, "governed-message-artifact-family", "extra.txt"),
    "undeclared\n"
  );
  const extra = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: extraWorkspace
  });
  assert.equal(
    extra.artifactFamily.conformanceDisposition,
    "WORKSPACE_AUTHORITY_OPEN"
  );
  assert.equal(extra.trustPosture, "CONTAMINATED");
  assert.equal(
    extra.artifactFamily.findings.some(
      (finding) =>
        finding.findingId === "UNAUTHORIZED_WORKSPACE_ARTIFACT" &&
        finding.relativePath ===
          "governed-message-artifact-family/extra.txt"
    ),
    true
  );

  const driftWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: driftWorkspace,
    mode: "write"
  });
  writeFileSync(
    path.join(
      driftWorkspace,
      "governed-message-artifact-family",
      "contracts",
      "message.json"
    ),
    "{}\n"
  );
  const drift = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: driftWorkspace
  });
  assert.equal(
    drift.artifactFamily.conformanceDisposition,
    "ARTIFACT_CONTENT_MISMATCH"
  );
  assert.equal(drift.trustPosture, "DRIFTED");
});

test("structure is evaluated independently after byte identity", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    const diagram = contract.artifacts.find(
      (artifact) => artifact.artifactId === "closed-loop-diagram.v1"
    );
    diagram.proof.verifierIds.push("markdown-section-verifier.v1");
    diagram.proof.requiredSections = ["# Required Governed Heading"];
    recommitReviewDocument(contract);
  });
  const projection = projectArtifactFamily({
    contractPath,
    workspacePath,
    mode: "write"
  });
  assert.equal(projection.projectionDisposition, "ARTIFACT_FAMILY_PROJECTED");
  const result = evaluateConformance({ contractPath, workspacePath });
  assert.equal(
    result.artifactFamily.conformanceDisposition,
    "ARTIFACT_STRUCTURE_MISMATCH"
  );
  assert.equal(result.trustPosture, "DRIFTED");
});

test("projection identity and freshness have independent terminal dispositions", (t) => {
  const identityWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: identityWorkspace,
    mode: "write"
  });
  writeFileSync(
    path.join(
      identityWorkspace,
      ".governance",
      "projections",
      "governed-message-artifact-family.ledger.json"
    ),
    "{}\n"
  );
  const identity = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: identityWorkspace
  });
  assert.equal(
    identity.artifactFamily.conformanceDisposition,
    "PROJECTION_IDENTITY_MISMATCH"
  );
  assert.equal(identity.trustPosture, "DRIFTED");

  const staleWorkspace = makeWorkspace(t);
  const staleContractPath = copyContract(staleWorkspace, (contract) => {
    contract.artifacts[1].proof.validThroughUtc = "2026-07-29T00:00:00.000Z";
    recommitReviewDocument(contract);
  });
  projectArtifactFamily({
    contractPath: staleContractPath,
    workspacePath: staleWorkspace,
    mode: "write"
  });
  const stale = evaluateConformance({
    contractPath: staleContractPath,
    workspacePath: staleWorkspace,
    observedAt: "2026-07-30T00:00:00.000Z"
  });
  assert.equal(stale.artifactFamily.conformanceDisposition, "ARTIFACT_STALE");
  assert.equal(stale.trustPosture, "STALE");
  assert.equal(
    stale.artifactFamily.freshnessObservation.observedAtUtc,
    "2026-07-30T00:00:00.000Z"
  );
});

test("structured review authority drives Markdown and cannot drift silently", (t) => {
  const contract = JSON.parse(readFileSync(exampleContractPath, "utf8"));
  const reviewArtifact = contract.artifacts.find(
    (artifact) => artifact.artifactId === "artifact-family-readme.v1"
  );
  const admittedBytes = projectGovernedArtifactContractMarkdown(
    contract,
    reviewArtifact.projection.authority,
    reviewArtifact.artifactId
  );
  contract.artifacts[0].purpose =
    "Constrains a deliberately changed governed message value.";
  const changedBytes = projectGovernedArtifactContractMarkdown(
    contract,
    reviewArtifact.projection.authority,
    reviewArtifact.artifactId
  );
  assert.notDeepEqual(changedBytes, admittedBytes);
  assert.match(
    changedBytes.toString("utf8"),
    /Constrains a deliberately changed governed message value\./
  );

  const workspacePath = makeWorkspace(t);
  const changedContractPath = copyContract(workspacePath, (copy) => {
    const review = copy.artifacts.find(
      (artifact) => artifact.artifactId === "artifact-family-readme.v1"
    );
    review.projection.authority.futureStatePreview[0] =
      "A changed review declaration must receive a new content commitment.";
  });
  const changedValidation = validateContract({
    contractPath: changedContractPath
  });
  assert.equal(
    changedValidation.contractValidationDisposition,
    "CONTRACT_INVALID"
  );
  assert.equal(
    changedValidation.findings.some(
      (finding) => finding.findingId === "declared-content-digest-mismatch"
    ),
    true
  );

  const invalidBindingPath = copyContract(workspacePath, (copy) => {
    const review = copy.artifacts.find(
      (artifact) => artifact.artifactId === "artifact-family-readme.v1"
    );
    review.mediaType = "text/plain";
  });
  const invalidBinding = validateContract({
    contractPath: invalidBindingPath
  });
  assert.equal(invalidBinding.contractValidationDisposition, "CONTRACT_INVALID");
  assert.equal(
    invalidBinding.findings.some(
      (finding) => finding.findingId === "contract-review-markdown-binding"
    ),
    true
  );
});

test("authority closure emits deterministic findings for source escape routes", (t) => {
  const cases = [
    {
      expectedFindingId: "UNDECLARED_DEPENDENCY_IMPORT",
      mutate: (text) =>
        `import { execSync } from "node:child_process";\n${text}`
    },
    {
      expectedFindingId: "EFFECT_BYPASSES_DECLARED_PORT",
      mutate: (text) => `${text}\nprocess.exit(0);\n`
    },
    {
      expectedFindingId: "UNDECLARED_RESPONSIBILITY",
      mutate: (text) => `${text}\nfunction convenienceHelper() {}\n`
    },
    {
      expectedFindingId:
        "DECLARED_SEMANTICS_DO_NOT_AUTHORIZE_BODY_BRANCHING",
      mutate: (text) =>
        text.replace(
          "  return executeSemanticProjection",
          "  if (!value) return \"\";\n  return executeSemanticProjection"
        )
    },
    {
      expectedFindingId: "LOCAL_ITERATION_FORBIDDEN",
      mutate: (text) =>
        text.replace(
          "  return executeSemanticProjection",
          "  for (;;) break;\n  return executeSemanticProjection"
        )
    },
    {
      expectedFindingId: "LOCAL_RESULT_CONSTRUCTION_FORBIDDEN",
      mutate: (text) =>
        text.replace(
          "  return executeSemanticProjection",
          "  const dto = { message: value.message };\n  return executeSemanticProjection"
        )
    },
    {
      expectedFindingId:
        "EXECUTION_MECHANIC_OUTSIDE_TRUSTED_BOUNDARY",
      mutate: (text) =>
        text.replace(
          "  return executeSemanticProjection(projectMessageAuthority, messageSchema, value);",
          "  return JSON.stringify(executeSemanticProjection(projectMessageAuthority, messageSchema, value));"
        )
    },
    {
      expectedFindingId: "LOCAL_FAILURE_MECHANIC_FORBIDDEN",
      mutate: (text) =>
        text.replace(
          "  return executeSemanticProjection",
          "  try { throw new Error(\"local\"); } catch {}\n  return executeSemanticProjection"
        )
    },
    {
      expectedFindingId: "RESULT_FLOW_NOT_DIRECT",
      mutate: (text) =>
        text.replace(
          "  return executeSemanticProjection",
          "  void executeSemanticProjection"
        )
    }
  ];

  for (const entry of cases) {
    const workspacePath = makeWorkspace(t);
    projectArtifactFamily({
      contractPath: exampleContractPath,
      workspacePath,
      mode: "write"
    });
    const sourcePath = path.join(
      workspacePath,
      "governed-message-artifact-family",
      "src",
      "project-message.mjs"
    );
    writeFileSync(
      sourcePath,
      entry.mutate(readFileSync(sourcePath, "utf8"))
    );
    const result = evaluateConformance({
      contractPath: exampleContractPath,
      workspacePath
    });
    assert.equal(
      result.artifactFamily.conformanceDisposition,
      "ARTIFACT_ESCAPES_CONTRACT",
      entry.expectedFindingId
    );
    assert.equal(result.trustPosture, "CONTAMINATED");
    assert.equal(
      result.artifactFamily.findings.some(
        (finding) => finding.findingId === entry.expectedFindingId
      ),
      true,
      entry.expectedFindingId
    );
  }

  const dependencyWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: dependencyWorkspace,
    mode: "write"
  });
  const verificationPath = path.join(
    dependencyWorkspace,
    "governed-message-artifact-family",
    "verification",
    "verifies-message.mjs"
  );
  writeFileSync(
    verificationPath,
    readFileSync(verificationPath, "utf8").replace(
      "assert.equal",
      "assert.deepEqual"
    )
  );
  const dependencyEscape = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: dependencyWorkspace
  });
  assert.equal(
    dependencyEscape.artifactFamily.conformanceDisposition,
    "ARTIFACT_ESCAPES_CONTRACT"
  );
  assert.equal(
    dependencyEscape.artifactFamily.findings.some(
      (finding) =>
        finding.findingId === "UNDECLARED_DEPENDENCY_OPERATION"
    ),
    true
  );

  const outputWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: outputWorkspace,
    mode: "write"
  });
  const outputPath = path.join(
    outputWorkspace,
    "governed-message-artifact-family",
    "verification",
    "verifies-message.mjs"
  );
  writeFileSync(
    outputPath,
    readFileSync(outputPath, "utf8").replace(
      "ARTIFACT_TEST_CONFORMS",
      "ARTIFACT_TEST_REJECTS"
    )
  );
  const outputEscape = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: outputWorkspace
  });
  assert.equal(
    outputEscape.artifactFamily.conformanceDisposition,
    "ARTIFACT_ESCAPES_CONTRACT"
  );
  assert.equal(
    outputEscape.artifactFamily.findings.some(
      (finding) => finding.findingId === "UNDECLARED_RESULT_CONTRACT"
    ),
    true
  );
});

test("payload drift stays distinct and completion claims cannot exceed receipt evidence", (t) => {
  const trustedWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: trustedWorkspace,
    mode: "write"
  });
  const trustedReceipt = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: trustedWorkspace
  });
  const admittedClaim = evaluateTrustClaim(trustedReceipt, "COMPLETE");
  assert.equal(admittedClaim.claimDisposition, "CLAIM_ADMITTED");
  const receiptWithoutClosure = structuredClone(trustedReceipt);
  delete receiptWithoutClosure.artifactFamily.authorityClosure;
  assert.equal(
    evaluateTrustClaim(
      receiptWithoutClosure,
      "COMPLETE"
    ).claimDisposition,
    "CLAIM_EXCEEDS_EVIDENCE"
  );
  const receiptWithoutScope = structuredClone(trustedReceipt);
  delete receiptWithoutScope.artifactFamily.artifactScope;
  assert.equal(
    evaluateTrustClaim(
      receiptWithoutScope,
      "COMPLETE"
    ).claimDisposition,
    "CLAIM_EXCEEDS_EVIDENCE"
  );
  assert.equal(
    evaluateReceiptClaim(
      {
        contractPath: exampleContractPath,
        workspacePath: trustedWorkspace
      },
      trustedReceipt,
      "COMPLETE"
    ).claimDisposition,
    "CLAIM_ADMITTED"
  );
  const fabricatedReceipt = structuredClone(trustedReceipt);
  fabricatedReceipt.artifactFamily.proofDisposition = "PROOF_INCOMPLETE";
  assert.equal(
    evaluateReceiptClaim(
      {
        contractPath: exampleContractPath,
        workspacePath: trustedWorkspace
      },
      fabricatedReceipt,
      "COMPLETE"
    ).claimDisposition,
    "CLAIM_EXCEEDS_EVIDENCE"
  );

  const driftedWorkspace = makeWorkspace(t);
  projectArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath: driftedWorkspace,
    mode: "write"
  });
  const sourcePath = path.join(
    driftedWorkspace,
    "governed-message-artifact-family",
    "src",
    "project-message.mjs"
  );
  writeFileSync(
    sourcePath,
    `${readFileSync(sourcePath, "utf8")}// Unadmitted payload note.\n`
  );
  const driftedReceipt = evaluateConformance({
    contractPath: exampleContractPath,
    workspacePath: driftedWorkspace
  });
  assert.equal(
    driftedReceipt.artifactFamily.conformanceDisposition,
    "ARTIFACT_CONTENT_MISMATCH"
  );
  assert.equal(
    driftedReceipt.artifactFamily.findings[0].findingId,
    "PAYLOAD_MISMATCH"
  );
  assert.equal(
    driftedReceipt.artifactFamily.authorityClosureDisposition,
    "ARTIFACT_AUTHORITY_CLOSED"
  );
  assert.equal(
    driftedReceipt.artifactFamily.proofDisposition,
    "PROOF_INCOMPLETE"
  );
  const rejectedClaim = evaluateTrustClaim(driftedReceipt, "COMPLETE");
  assert.equal(
    rejectedClaim.claimDisposition,
    "CLAIM_EXCEEDS_EVIDENCE"
  );
  assert.equal(
    rejectedClaim.findings.some(
      (finding) => finding.findingId === "CLAIM_EXCEEDS_EVIDENCE"
    ),
    true
  );
  assert.equal(
    evaluateTrustClaim(trustedReceipt, "UNDECLARED_CLAIM").claimDisposition,
    "CLAIM_EXCEEDS_EVIDENCE"
  );
});

test("the npm archive closes against its external release authority", () => {
  const authorityBytes = readFileSync(DEFAULT_RELEASE_AUTHORITY_PATH);
  const authority = JSON.parse(authorityBytes.toString("utf8"));
  assert.deepEqual(
    authorityBytes,
    canonicalJsonBytes(authority)
  );
  assert.equal(
    authority.authorityClosure.authorityType,
    "closed-world-release-authority-closure.v1"
  );
  assert.equal(
    Object.values(authority.authorityClosure.coverage).every(
      (disposition) => disposition === "exact"
    ),
    true
  );
  const validation = validateReleaseAuthority({
    workspacePath: packageRoot
  });
  assert.equal(
    validation.authorityValidationDisposition,
    "RELEASE_AUTHORITY_VALID"
  );

  const receipt = evaluateReleaseBoundary({
    workspacePath: packageRoot
  });
  assert.equal(
    receipt.conformanceDisposition,
    "RELEASE_BOUNDARY_CLOSED"
  );
  assert.equal(receipt.proofDisposition, "RELEASE_PROOF_COMPLETE");
  assert.equal(receipt.trustDisposition, "RELEASE_TRUSTED");
  assert.equal(
    receipt.authorityClosureDisposition,
    "RELEASE_AUTHORITY_CLOSED"
  );
  assert.deepEqual(receipt.authorityClosure, {
    authorityType: "closed-world-release-authority-closure.v1",
    profileSha256: sha256(
      canonicalJsonBytes(authority.authorityClosure)
    ),
    disposition: "RELEASE_AUTHORITY_CLOSED"
  });
  assert.equal(receipt.findings.length, 0);
  assert.deepEqual(
    receipt.observations.delivery.missingPaths,
    []
  );
  assert.deepEqual(
    receipt.observations.delivery.undeclaredPaths,
    []
  );
  assert.equal(
    receipt.observations.delivery.artifactObservations.filter(
      (artifact) => artifact.role === "current" && artifact.exists
    ).length,
    1
  );
  assert.equal(
    receipt.observations.candidate.packing.entries.some(
      (entry) =>
        entry.relativePath ===
        "release/governed-npm-release-boundary.json"
    ),
    false
  );
  assert.equal(
    evaluateReleaseClaim(receipt, "RELEASE_READY").claimDisposition,
    "RELEASE_CLAIM_ADMITTED"
  );
  const receiptWithoutClosure = structuredClone(receipt);
  delete receiptWithoutClosure.authorityClosure;
  assert.equal(
    evaluateReleaseClaim(
      receiptWithoutClosure,
      "RELEASE_READY"
    ).claimDisposition,
    "RELEASE_CLAIM_EXCEEDS_EVIDENCE"
  );
  assert.equal(
    evaluateReleaseReceiptClaim(
      {
        workspacePath: packageRoot
      },
      receipt,
      "RELEASE_READY"
    ).claimDisposition,
    "RELEASE_CLAIM_ADMITTED"
  );
});

test("release authority closure is mandatory and cannot be weakened", (t) => {
  const workspacePath = makeWorkspace(t);
  const mutations = [
    (authority) => {
      delete authority.authorityClosure;
    },
    (authority) => {
      authority.authorityClosure.resolution.ambientAuthority =
        "permitted";
    }
  ];
  for (const [index, mutate] of mutations.entries()) {
    const authority = JSON.parse(
      readFileSync(DEFAULT_RELEASE_AUTHORITY_PATH, "utf8")
    );
    mutate(authority);
    const authorityPath = path.join(
      workspacePath,
      `invalid-release-authority-${index}.json`
    );
    writeFileSync(authorityPath, canonicalJsonBytes(authority));
    assert.equal(
      validateReleaseAuthority({
        workspacePath: packageRoot,
        releaseAuthorityPath: authorityPath
      }).authorityValidationDisposition,
      "RELEASE_AUTHORITY_INVALID"
    );
  }
});

test("release candidate, durable artifact, toolchain, archive, and receipt drift fail closed", (t) => {
  const workspacePath = makeWorkspace(t);
  const authority = JSON.parse(
    readFileSync(DEFAULT_RELEASE_AUTHORITY_PATH, "utf8")
  );
  authority.packing.entries[0].sha256 =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  authority.archive.sha256 =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  authority.delivery.artifacts.find(
    (artifact) => artifact.role === "current"
  ).sha256 = authority.archive.sha256;
  authority.toolchain.nodeVersion = "v0.0.0";
  authority.delivery.artifacts = authority.delivery.artifacts.filter(
    (artifact) => artifact.releaseVersion !== "0.1.0"
  );
  authority.delivery.artifacts.find(
    (artifact) => artifact.releaseVersion === "0.2.0"
  ).sha256 =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";
  authority.delivery.artifacts.push({
    releaseVersion: "9.9.9",
    role: "historical",
    relativePath:
      "release/artifacts/contract-driven-artifact-governance-engine-9.9.9.tgz",
    size: 1,
    sha256:
      "sha256:0000000000000000000000000000000000000000000000000000000000000000"
  });
  authority.delivery.artifacts.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
  const authorityPath = path.join(
    workspacePath,
    "drifted-release-authority.json"
  );
  writeFileSync(authorityPath, canonicalJsonBytes(authority));
  const receipt = evaluateReleaseBoundary({
    workspacePath: packageRoot,
    releaseAuthorityPath: authorityPath
  });
  assert.equal(
    receipt.conformanceDisposition,
    "RELEASE_BOUNDARY_DRIFT"
  );
  assert.equal(receipt.proofDisposition, "RELEASE_PROOF_INCOMPLETE");
  assert.equal(receipt.trustDisposition, "RELEASE_REJECTED");
  assert.equal(
    receipt.authorityClosureDisposition,
    "RELEASE_AUTHORITY_OPEN"
  );
  assert.equal(
    receipt.findings.some(
      (finding) => finding.findingId === "RELEASE_ENTRY_DRIFT"
    ),
    true
  );
  assert.equal(
    receipt.findings.some(
      (finding) => finding.findingId === "RELEASE_ARCHIVE_DRIFT"
    ),
    true
  );
  assert.equal(
    receipt.findings.some(
      (finding) => finding.findingId === "RELEASE_TOOLCHAIN_DRIFT"
    ),
    true
  );
  for (const findingId of [
    "RELEASE_ARTIFACT_MISSING",
    "RELEASE_ARTIFACT_UNDECLARED",
    "RELEASE_ARTIFACT_CONTENT_MISMATCH"
  ]) {
    assert.equal(
      receipt.findings.some(
        (finding) => finding.findingId === findingId
      ),
      true,
      findingId
    );
  }

  const observed = receipt.observations.candidate;
  assert.equal(
    observed.archive.entryCount,
    observed.packing.entries.length
  );
  assert.equal(
    observed.archive.unpackedSize,
    observed.packing.entries.reduce(
      (total, entry) => total + entry.size,
      0
    )
  );

  const trustedReceipt = evaluateReleaseBoundary({
    workspacePath: packageRoot
  });
  const fabricated = structuredClone(trustedReceipt);
  fabricated.archive = { sha256: "fabricated" };
  assert.equal(
    evaluateReleaseReceiptClaim(
      {
        workspacePath: packageRoot
      },
      fabricated,
      "RELEASE_READY"
    ).claimDisposition,
    "RELEASE_CLAIM_EXCEEDS_EVIDENCE"
  );
  const commandResult = spawnSync(
    process.execPath,
    [
      path.join(packageRoot, "bin", "governed-artifacts.mjs"),
      "release-check",
      "--workspace",
      packageRoot,
      "--release-authority",
      authorityPath
    ],
    {
      cwd: packageRoot,
      encoding: "utf8",
      shell: false
    }
  );
  assert.equal(commandResult.status, 1);
});

test("the published surface uses only governed-artifact language", () => {
  const roots = [
    "bin",
    "examples",
    "lib",
    "registries",
    "schemas",
    "test"
  ];
  const files = [
    path.join(packageRoot, "package.json"),
    path.join(packageRoot, "README.md")
  ];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else {
        files.push(absolutePath);
      }
    }
  };
  for (const root of roots) {
    visit(path.join(packageRoot, root));
  }
  // The canonical lineage spine makes this word first-class engine vocabulary:
  // project, feature, scenario, obligation, responsibility, projection, body.
  // The design-authority spine makes this word first-class engine vocabulary:
  // conversation, decision record, implementation, conformance.
  const disallowedWords = [
    ["cap", "ability"].join(""),
    ["con", "veyor"].join(""),
    ["gene", "rator"].join(""),
    ["pa", "ss"].join("")
  ];
  const disallowed = new RegExp(
    `\\b(?:${disallowedWords.map((word) => `${word}(?:s|ed|es|ing)?`).join("|")})\\b`,
    "i"
  );
  for (const filePath of files) {
    assert.equal(
      disallowed.test(readFileSync(filePath, "utf8")),
      false,
      `Disallowed public vocabulary in ${path.relative(packageRoot, filePath)}`
    );
  }
});

test("executable bodies are authorized by canonical lineage, not by declared bytes", (t) => {
  const workspacePath = makeWorkspace(t);
  const baseline = copyContract(workspacePath, () => {});
  projectArtifactFamily({
    contractPath: baseline,
    workspacePath,
    mode: "write"
  });
  const admitted = evaluateConformance({
    contractPath: baseline,
    workspacePath
  });
  assert.equal(admitted.trustPosture, "CONFORMS");
  assert.equal(
    admitted.artifactFamily.canonicalLineageDisposition,
    "CANONICAL_LINEAGE_CLOSED"
  );
  assert.deepEqual(
    admitted.artifactFamily.canonicalLineage.bodies.map(
      (body) => body.responsibilityId
    ),
    [
      "entry-point-for-message-command",
      "executes-message-projection",
      "evaluates-message-proof"
    ]
  );

  const orphaned = copyContract(workspacePath, (contract) => {
    contract.lineage.responsibilities =
      contract.lineage.responsibilities.filter(
        (responsibility) =>
          responsibility.artifactId !== "message-projector.v1"
      );
  });
  const orphanReport = evaluateConformance({
    contractPath: orphaned,
    workspacePath
  });
  assert.equal(orphanReport.trustDisposition, "REJECTED");
  assert.equal(
    (orphanReport.findings ?? []).some(
      (finding) =>
        finding.findingId === "NO_RESPONSIBILITY_AUTHORITY" &&
        finding.artifactId === "message-projector.v1"
    ),
    true,
    JSON.stringify((orphanReport.findings ?? []).map((f) => f.findingId))
  );

  for (const [findingId, mutate] of [
    [
      "NO_OBLIGATION_AUTHORITY",
      (contract) => {
        contract.lineage.responsibilities[0].obligationId =
          "unowned-obligation";
      }
    ],
    [
      "NO_SCENARIO_AUTHORITY",
      (contract) => {
        contract.lineage.obligations[0].scenarioId = "unowned-scenario";
      }
    ],
    [
      "NO_CANONICAL_FEATURE_LINEAGE",
      (contract) => {
        contract.lineage.scenarios[0].featureId = "unowned-subject";
      }
    ],
    [
      "PROJECTION_PROFILE_NOT_ADMITTED",
      (contract) => {
        contract.lineage.responsibilities[0].responsibilityType =
          "developer-tooling";
      }
    ]
  ]) {
    const brokenPath = copyContract(workspacePath, mutate);
    const broken = evaluateConformance({
      contractPath: brokenPath,
      workspacePath
    });
    // A broken link makes the seal unresolvable, so the artifact cannot be
    // projected at all; only an admitted-but-wrong projection profile survives
    // long enough to be reported by the lineage evaluation step.
    const observed =
      broken.findings ?? broken.artifactFamily?.findings ?? [];
    assert.equal(
      observed.some((finding) => finding.findingId === findingId),
      true,
      `${findingId}: ${JSON.stringify(observed.map((f) => f.findingId))}`
    );
    assert.equal(broken.trustDisposition, "REJECTED", findingId);
  }
});

test("transcription cannot legitimize an executable artifact", (t) => {
  const workspacePath = makeWorkspace(t);
  const contractPath = copyContract(workspacePath, (contract) => {
    const body = contract.artifacts.find(
      (artifact) => artifact.artifactId === "message-projector.v1"
    );
    body.artifactKind = "developer-tooling";
    body.projection = {
      authorityId: body.projection.authorityId,
      projectorId: "utf8-text-projector.v1",
      authority: {
        authorityType: "utf8-text.v1",
        text: "export function projectMessage(value) {\n  return value;\n}\n"
      }
    };
    body.proof.verifierIds = ["content-digest-verifier.v1"];
  });
  // The responsibility is left intact, so the chain resolves. Only the
  // projector is swapped for transcription, which is what must be refused.
  const report = validateContract({ contractPath, workspacePath });
  assert.equal(report.contractValidationDisposition, "CONTRACT_INVALID");
  assert.equal(
    report.findings.some(
      (finding) =>
        finding.findingId === "ARTIFACT_CONTENT_NOT_DERIVED" &&
        finding.artifactId === "message-projector.v1" &&
        finding.expected === "provenance-sealed-source-projector.v1" &&
        finding.observed === "utf8-text-projector.v1"
    ),
    true,
    JSON.stringify(report.findings.map((finding) => finding.findingId))
  );
});

test("source scanning terminates on text that is not admitted source", () => {
  // A bare "#" makes the scanner emit a zero-width token and return it
  // indefinitely. Every admitted token consumes at least one character, so a
  // token end that does not advance proves the text is not scannable.
  for (const [text, offset] of [
    ["# Heading\n\nJust words here.\n", 0],
    ["#", 0],
    ["const admitted = 1;\n# not source\n", 20]
  ]) {
    for (const scan of [sourceTokens, inspectSourceAuthority]) {
      assert.throws(
        () => scan(text),
        (error) =>
          error instanceof Error &&
          error.message ===
            `Source is not scannable as javascript at offset ${offset}.`,
        `${scan.name}: ${JSON.stringify(text)}`
      );
    }
  }

  assert.equal(sourceTokens("const unknown = @@@;\n").length > 0, true);
  assert.equal(
    inspectSourceAuthority(
      "export function admitted(value) {\n  return `x${value}y`;\n}\n"
    ).functions.length,
    1
  );
  assert.throws(
    () => sourceTokens("const admitted = 1;\n", "markdown"),
    /Source language is not admitted: markdown/
  );
});

test("no architectural interpretation may remain undocumented", (t) => {
  const workspacePath = makeWorkspace(t);
  const baseline = copyContract(workspacePath, () => {});
  projectArtifactFamily({ contractPath: baseline, workspacePath, mode: "write" });
  const admitted = evaluateConformance({ contractPath: baseline, workspacePath });
  assert.equal(admitted.trustPosture, "CONFORMS");
  assert.equal(
    admitted.artifactFamily.designAuthorityDisposition,
    "DESIGN_AUTHORITY_CLOSED"
  );
  const design = admitted.artifactFamily.designAuthority;
  assert.match(design.conversationDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(design.decisionRecordDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(design.tieOutDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(design.implementationDigest, /^sha256:[a-f0-9]{64}$/);
  assert.match(design.designLineageSha256, /^sha256:[a-f0-9]{64}$/);
  assert.equal(design.dispositionCounts.deferred > 0, true);

  for (const [findingId, mutate] of [
    [
      "DESIGN_DEVIATION_UNDOCUMENTED",
      (contract) => {
        contract.designAuthority.deviations = [];
      }
    ],
    [
      "DESIGN_DECISION_NOT_IMPLEMENTED",
      (contract) => {
        contract.designAuthority.tieOut =
          contract.designAuthority.tieOut.filter(
            (entry) => entry.decisionId !== "seal-executable-lineage"
          );
      }
    ],
    [
      "DESIGN_TIE_OUT_UNRESOLVED",
      (contract) => {
        contract.designAuthority.tieOut[0].artifactIds = ["not-an-artifact.v1"];
      }
    ],
    [
      "DESIGN_DEVIATION_UNEXPECTED",
      (contract) => {
        contract.designAuthority.decisions.find(
          (decision) => decision.decisionId === "shebang-placement"
        ).disposition = "accepted";
      }
    ],
    [
      "DESIGN_DECISION_DUPLICATE",
      (contract) => {
        contract.designAuthority.decisions.push(
          structuredClone(contract.designAuthority.decisions[0])
        );
      }
    ]
  ]) {
    const brokenPath = copyContract(workspacePath, mutate);
    const broken = evaluateConformance({
      contractPath: brokenPath,
      workspacePath
    });
    const observed = broken.findings ?? broken.artifactFamily?.findings ?? [];
    assert.equal(
      observed.some((finding) => finding.findingId === findingId),
      true,
      `${findingId}: ${JSON.stringify(observed.map((f) => f.findingId))}`
    );
    assert.equal(broken.trustDisposition, "REJECTED", findingId);
  }
});
