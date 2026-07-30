#!/usr/bin/env node

import {
  DEFAULT_PROJECTOR_REGISTRY_PATH,
  DEFAULT_SCHEMA_PATH,
  DEFAULT_VERIFIER_REGISTRY_PATH,
  evaluateConformance,
  observeArtifactState,
  projectArtifactFamily,
  proveGovernedArtifactFamily,
  resolveArtifactPlan,
  validateContract,
  writeCanonicalReceipt
} from "../lib/governed-artifact-engine.mjs";

function usage() {
  return [
    "Usage:",
    "  governed-artifacts validate --contract <path> [inputs]",
    "  governed-artifacts plan --contract <path> [inputs]",
    "  governed-artifacts project --contract <path> --workspace <path> (--write|--check) [inputs]",
    "  governed-artifacts observe --contract <path> --workspace <path> [inputs]",
    "  governed-artifacts evaluate --contract <path> --workspace <path> [--write-receipt] [inputs]",
    "  governed-artifacts prove --contract <path> --workspace <path> [--check] [--write-receipt] [inputs]",
    "",
    "Inputs:",
    "  --schema <path>",
    "  --projector-registry <path>",
    "  --verifier-registry <path>",
    "  --observed-at <ISO-8601 timestamp>"
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
    mode: "write",
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
      } else if (argument === "--workspace") {
        options.workspacePath = value;
      } else if (argument === "--observed-at") {
        options.observedAt = value;
      } else {
        throw new Error(`Unknown argument: ${argument}`);
      }
    }
  }
  return { operation, options };
}

function execute(operation, options) {
  if (operation === "validate") {
    return validateContract(options);
  }
  if (operation === "plan") {
    return resolveArtifactPlan(options);
  }
  if (operation === "project") {
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
