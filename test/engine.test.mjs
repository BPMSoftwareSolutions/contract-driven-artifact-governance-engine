import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  canonicalJsonBytes,
  evaluateConformance,
  evaluateReceiptClaim,
  evaluateTrustClaim,
  inspectSourceAuthority,
  projectArtifactFamily,
  projectGovernedArtifactContractMarkdown,
  proveGovernedArtifactFamily,
  validateContract
} from "../lib/governed-artifact-engine.mjs";
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

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function makeWorkspace(t) {
  const workspacePath = mkdtempSync(
    path.join(os.tmpdir(), "governed-artifacts-")
  );
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

test("the contract makes every governed control surface explicit", () => {
  const contract = JSON.parse(readFileSync(exampleContractPath, "utf8"));
  assert.equal(
    contract.artifacts.every(
      (artifact) =>
        typeof artifact.relativePath === "string" &&
        artifact.relativePath.length > 0
    ),
    true
  );
  assert.equal(
    contract.dependencies.every(
      (dependency) =>
        dependency.specifier.length > 0 &&
        dependency.allowedImports.length > 0 &&
        dependency.allowedInvocations.length > 0 &&
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
        claim.requiredConformanceDisposition.length > 0 &&
        claim.requiredAuthorityClosureDisposition.length > 0 &&
        claim.requiredProofDisposition.length > 0 &&
        claim.requiredTrustDisposition.length > 0
    ),
    true
  );
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
  const first = proveGovernedArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    mode: "write",
    writeReceipt: true
  });
  assert.equal(first.artifactFamily.conformanceDisposition, "CONTRACT_AUTHORITY_CLOSED");
  assert.equal(
    first.artifactFamily.authorityClosureDisposition,
    "ARTIFACT_AUTHORITY_CLOSED"
  );
  assert.equal(first.artifactFamily.proofDisposition, "PROOF_COMPLETE");
  assert.equal(first.trustPosture, "CONFORMS");
  assert.equal(first.trustDisposition, "TRUSTED");
  assert.equal(first.artifactFamily.declaredArtifactCount, 8);
  assert.equal(first.artifactFamily.observedArtifactCount, 8);

  const contract = JSON.parse(readFileSync(exampleContractPath, "utf8"));
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

test("schema identity and digest failures do not evaluate artifact conformance", (t) => {
  const workspacePath = makeWorkspace(t);
  const wrongIdentityPath = copyContract(workspacePath, (contract) => {
    contract.schema.identity = "https://governed.local/schemas/not-admitted.json";
  });
  const wrongIdentity = validateContract({ contractPath: wrongIdentityPath });
  assert.equal(wrongIdentity.contractValidationDisposition, "SCHEMA_NOT_ADMITTED");
  assert.equal(wrongIdentity.conformanceDisposition, "NOT_EVALUATED");

  const wrongDigestPath = copyContract(workspacePath, (contract) => {
    contract.schema.digest = `sha256:${"0".repeat(64)}`;
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
  assert.equal(extra.artifactFamily.conformanceDisposition, "ARTIFACT_UNDECLARED");
  assert.equal(extra.trustPosture, "EXTRA");

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
      expectedFindingId: "UNDECLARED_DECISION_PATH",
      mutate: (text) => `${text}\nconst fallbackValue = value ?? {};\n`
    },
    {
      expectedFindingId: "UNDECLARED_ITERATION_OR_CONTINUATION",
      mutate: (text) => `${text}\nfor (;;) {}\n`
    },
    {
      expectedFindingId: "UNDECLARED_PROJECTION_LOGIC",
      mutate: (text) =>
        text.replace(
          "{ message: value.message }",
          "{ text: value.message }"
        )
    },
    {
      expectedFindingId: "UNDECLARED_SEMANTIC_EDGE",
      mutate: (text) =>
        text.replace(
          "{ message: value.message }, null, 2",
          "{ message: value.message }, null, 4"
        )
    },
    {
      expectedFindingId: "UNDECLARED_FAILURE_POLICY",
      mutate: (text) =>
        text.replace(
          "Message contract is invalid.",
          "Message contract is rejected."
        )
    },
    {
      expectedFindingId: "DECLARED_RESULT_CONTRACT_MISSING",
      mutate: (text) => text.replace("  return `", "  void `")
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
  assert.deepEqual(
    authorityBytes,
    canonicalJsonBytes(
      JSON.parse(authorityBytes.toString("utf8"))
    )
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
  const disallowedWords = [
    ["cap", "ability"].join(""),
    ["fea", "ture"].join(""),
    ["con", "veyor"].join(""),
    ["implemen", "tation"].join(""),
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
