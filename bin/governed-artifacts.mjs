#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  DEFAULT_PROJECTOR_REGISTRY_PATH,
  DEFAULT_SCHEMA_PATH,
  DEFAULT_VERIFIER_REGISTRY_PATH,
  evaluateConformance,
  evaluateReceiptClaim,
  migrateContract,
  observeArtifactState,
  projectArtifactFamily,
  proveGovernedArtifactFamily,
  reconcileContractCommitments,
  resolveArtifactPlan,
  validateContract,
  writeCanonicalReceipt
} from "../lib/governed-artifact-engine.mjs";
import {
  DEFAULT_RELEASE_AUTHORITY_PATH,
  DEFAULT_RELEASE_SCHEMA_PATH,
  evaluateReleaseBoundary,
  evaluateReleaseReceiptClaim,
  materializeReleaseArtifact,
  observeReleasePackage,
  validateReleaseAuthority,
  writeCanonicalReleaseReceipt
} from "../lib/governed-release-boundary.mjs";

function usage() {
  return [
    "Usage:",
    "  governed-artifacts validate --contract <path> [inputs]",
    "  governed-artifacts plan --contract <path> [inputs]",
    "  governed-artifacts reconcile --contract <path> [--write] [inputs]",
    "  governed-artifacts migrate --contract <path> [--write] [inputs]",
    "  governed-artifacts project --contract <path> --workspace <path> (--write|--check) [inputs]",
    "  governed-artifacts observe --contract <path> --workspace <path> [inputs]",
    "  governed-artifacts evaluate --contract <path> --workspace <path> [--write-receipt] [inputs]",
    "  governed-artifacts prove --contract <path> --workspace <path> [--write-receipt] [inputs]",
    "  governed-artifacts claim --contract <path> --workspace <path> --receipt <path> --claim <claim> [inputs]",
    "  governed-artifacts release-observe --workspace <path>",
    "  governed-artifacts release-validate [release inputs]",
    "  governed-artifacts release-materialize --workspace <path> [release inputs]",
    "  governed-artifacts release-check --workspace <path> [--write-receipt] [release inputs]",
    "  governed-artifacts release-claim --workspace <path> --release-receipt <path> --claim RELEASE_READY [release inputs]",
    "",
    "Inputs:",
    "  --schema <path>",
    "  --projector-registry <path>",
    "  --verifier-registry <path>",
    "  --conformance-profile <path>",
    "  --migration-registry <path>",
    "  --schema-catalog <path>",
    "  --observed-at <ISO-8601 timestamp>",
    "",
    "Release inputs:",
    "  --release-authority <path>",
    "  --release-schema <path>"
  ].join("\n");
}

function parseArguments(argv) {
  const [operation, ...args] = argv;
  if (!operation || operation === "--help" || operation === "-h") {
    return { help: true };
  }
  const options = {
    schemaPath: DEFAULT_SCHEMA_PATH,
    projectorRegistryPath: DEFAULT_PROJECTOR_REGISTRY_PATH,
    verifierRegistryPath: DEFAULT_VERIFIER_REGISTRY_PATH,
    releaseAuthorityPath: DEFAULT_RELEASE_AUTHORITY_PATH,
    releaseSchemaPath: DEFAULT_RELEASE_SCHEMA_PATH,
    writeReceipt: false
  };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--write") {
      options.mode = "write";
    } else if (argument === "--check") {
      options.mode = "check";
    } else if (argument === "--write-receipt") {
      options.writeReceipt = true;
    } else {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`);
      }
      index += 1;
      if (argument === "--contract") {
        options.contractPath = value;
      } else if (argument === "--schema") {
        options.schemaPath = value;
      } else if (argument === "--projector-registry") {
        options.projectorRegistryPath = value;
      } else if (argument === "--verifier-registry") {
        options.verifierRegistryPath = value;
      } else if (argument === "--conformance-profile") {
        options.conformanceProfilePath = value;
      } else if (argument === "--migration-registry") {
        options.migrationRegistryPath = value;
      } else if (argument === "--schema-catalog") {
        options.schemaCatalogPath = value;
      } else if (argument === "--workspace") {
        options.workspacePath = value;
      } else if (argument === "--observed-at") {
        options.observedAt = value;
      } else if (argument === "--receipt") {
        options.receiptPath = value;
      } else if (argument === "--claim") {
        options.claim = value;
      } else if (argument === "--release-authority") {
        options.releaseAuthorityPath = value;
      } else if (argument === "--release-schema") {
        options.releaseSchemaPath = value;
      } else if (argument === "--release-receipt") {
        options.releaseReceiptPath = value;
      } else {
        throw new Error(`Unknown argument: ${argument}`);
      }
    }
  }
  return { operation, options };
}

function execute(operation, options) {
  if (
    options.mode !== undefined &&
    operation !== "project" &&
    operation !== "prove" &&
    operation !== "reconcile" &&
    operation !== "migrate"
  ) {
    throw new Error(
      "--write and --check are admitted only for project, reconcile, migrate, and the read-only prove compatibility alias."
    );
  }
  if (operation === "release-observe") {
    if (!options.workspacePath) {
      throw new Error("Release observation requires --workspace.");
    }
    return observeReleasePackage(options);
  }
  if (operation === "release-validate") {
    return validateReleaseAuthority(options);
  }
  if (operation === "release-check") {
    if (!options.workspacePath) {
      throw new Error("Release evaluation requires --workspace.");
    }
    const receipt = evaluateReleaseBoundary(options);
    if (options.writeReceipt && receipt.receiptType) {
      writeCanonicalReleaseReceipt(options, receipt);
    }
    return receipt;
  }
  if (operation === "release-materialize") {
    if (!options.workspacePath) {
      throw new Error("Release materialization requires --workspace.");
    }
    return materializeReleaseArtifact(options);
  }
  if (operation === "release-claim") {
    if (
      !options.workspacePath ||
      !options.releaseReceiptPath ||
      !options.claim
    ) {
      throw new Error(
        "Release claim evaluation requires --workspace, --release-receipt, and --claim."
      );
    }
    return evaluateReleaseReceiptClaim(
      options,
      JSON.parse(readFileSync(options.releaseReceiptPath, "utf8")),
      options.claim
    );
  }
  if (operation === "claim") {
    if (
      !options.contractPath ||
      !options.workspacePath ||
      !options.receiptPath ||
      !options.claim
    ) {
      throw new Error(
        "Claim evaluation requires --contract, --workspace, --receipt, and --claim."
      );
    }
    return evaluateReceiptClaim(
      options,
      JSON.parse(readFileSync(options.receiptPath, "utf8")),
      options.claim
    );
  }
  if (operation === "validate") {
    return validateContract(options);
  }
  if (operation === "plan") {
    return resolveArtifactPlan(options);
  }
  if (operation === "reconcile") {
    return reconcileContractCommitments(options);
  }
  if (operation === "migrate") {
    return migrateContract(options);
  }
  if (operation === "project") {
    if (!["write", "check"].includes(options.mode)) {
      throw new Error("Projection requires an explicit --write or --check.");
    }
    return projectArtifactFamily(options);
  }
  if (operation === "observe") {
    return observeArtifactState(options);
  }
  if (operation === "evaluate") {
    const receipt = evaluateConformance(options);
    if (options.writeReceipt && receipt.receiptType) {
      writeCanonicalReceipt(options, receipt);
    }
    return receipt;
  }
  if (operation === "prove") {
    return proveGovernedArtifactFamily(options);
  }
  throw new Error(`Unknown operation: ${operation}`);
}

try {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    process.exitCode = 0;
  } else {
    const result = execute(parsed.operation, parsed.options);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    const rejected =
      result.contractValidationDisposition === "CONTRACT_INVALID" ||
      result.contractValidationDisposition === "SCHEMA_NOT_ADMITTED" ||
      result.contractValidationDisposition === "SCHEMA_DIGEST_MISMATCH" ||
      result.trustDisposition === "REJECTED" ||
      result.claimDisposition === "CLAIM_EXCEEDS_EVIDENCE" ||
      result.authorityValidationDisposition ===
        "RELEASE_AUTHORITY_INVALID" ||
      result.authorityValidationDisposition ===
        "RELEASE_SCHEMA_NOT_ADMITTED" ||
      result.authorityValidationDisposition ===
        "RELEASE_SCHEMA_DIGEST_MISMATCH" ||
      result.conformanceDisposition === "RELEASE_BOUNDARY_DRIFT" ||
      result.conformanceDisposition === "RELEASE_CANDIDATE_DRIFT" ||
      result.conformanceDisposition === "RELEASE_OBSERVATION_FAILED" ||
      result.trustDisposition === "RELEASE_REJECTED" ||
      result.claimDisposition === "RELEASE_CLAIM_EXCEEDS_EVIDENCE" ||
      (result.reconciliationDisposition ===
        "DERIVED_COMMITMENT_RECONCILIATION_REQUIRED" &&
        result.reconciliationMode !== "write") ||
      (result.projectionDisposition !== undefined &&
        result.projectionDisposition !== "ARTIFACT_FAMILY_PROJECTED");
    process.exitCode = rejected ? 1 : 0;
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify(
      {
        operation: "governed-artifact-operation",
        contractValidationDisposition: "CONTRACT_INVALID",
        conformanceDisposition: "NOT_EVALUATED",
        trustPosture: "NOT_EVALUATED",
        trustDisposition: "REJECTED",
        findings: [
          {
            findingId: "operation-input",
            detail: error.message
          }
        ]
      },
      null,
      2
    )}\n`
  );
  process.exitCode = 1;
}
