import assert from "node:assert/strict";
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
  projectArtifactFamily,
  proveGovernedArtifactFamily,
  validateContract
} from "../lib/governed-artifact-engine.mjs";

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

test("the complete closed loop projects, evaluates, and writes deterministic trust evidence", (t) => {
  const workspacePath = makeWorkspace(t);
  const first = proveGovernedArtifactFamily({
    contractPath: exampleContractPath,
    workspacePath,
    mode: "write",
    writeReceipt: true
  });
  assert.equal(first.artifactFamily.conformanceDisposition, "ARTIFACT_FAMILY_CONFORMS");
  assert.equal(first.trustPosture, "CONFORMS");
  assert.equal(first.trustDisposition, "TRUSTED");
  assert.equal(first.artifactFamily.declaredArtifactCount, 8);
  assert.equal(first.artifactFamily.observedArtifactCount, 8);

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
    const readme = contract.artifacts.find(
      (artifact) => artifact.artifactId === "artifact-family-readme.v1"
    );
    readme.projection.authority.text = readme.projection.authority.text.replace(
      "## Proof\n",
      "Proof\n"
    );
    const bytes = Buffer.from(readme.projection.authority.text, "utf8");
    readme.proof.contentSha256 = sha256(bytes);
    readme.proof.expectedByteLength = bytes.length;
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
