import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";
import Ajv2020 from "ajv/dist/2020.js";
import { canonicalJsonBytes } from "./governed-artifact-engine.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

export const DEFAULT_RELEASE_SCHEMA_PATH = path.join(
  packageRoot,
  "schemas",
  "governed-release-boundary.schema.json"
);

export const DEFAULT_RELEASE_AUTHORITY_PATH = path.join(
  packageRoot,
  "release",
  "governed-npm-release-boundary.json"
);

const PACK_COMMAND = ["npm", "pack", "--json", "--ignore-scripts"];
const FORBIDDEN_LIFECYCLE_SCRIPTS = ["prepack", "prepare", "postpack"];

function digest(algorithm, bytes) {
  return createHash(algorithm).update(bytes).digest("hex");
}

function sha256(bytes) {
  return `sha256:${digest("sha256", bytes)}`;
}

function sha512Integrity(bytes) {
  return `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`${label} could not be read as JSON: ${error.message}`);
  }
}

function canonicalEqual(left, right) {
  return canonicalJsonBytes(left).equals(canonicalJsonBytes(right));
}

function confinedPath(root, relativePath, label) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(
    resolvedRoot,
    ...relativePath.split("/")
  );
  const relation = path.relative(resolvedRoot, resolved);
  if (
    relation !== "" &&
    (relation.startsWith("..") || path.isAbsolute(relation))
  ) {
    throw new Error(`${label} escapes the workspace: ${relativePath}`);
  }
  return resolved;
}

function tarText(bytes, offset, length) {
  const end = bytes.indexOf(0, offset);
  return bytes
    .subarray(offset, end === -1 || end > offset + length ? offset + length : end)
    .toString("utf8")
    .trim();
}

function tarNumber(bytes, offset, length) {
  const field = bytes.subarray(offset, offset + length);
  if ((field[0] & 0x80) !== 0) {
    let value = BigInt(field[0] & 0x7f);
    for (const byte of field.subarray(1)) {
      value = (value << 8n) | BigInt(byte);
    }
    return Number(value);
  }
  const text = field
    .toString("ascii")
    .replace(/\0.*$/s, "")
    .trim();
  return text === "" ? 0 : Number.parseInt(text, 8);
}

function verifyTarHeaderChecksum(header) {
  const expected = tarNumber(header, 148, 8);
  let observed = 0;
  for (let index = 0; index < header.length; index += 1) {
    observed +=
      index >= 148 && index < 156 ? 32 : header[index];
  }
  if (expected !== observed) {
    throw new Error(
      `Archive header checksum differs: expected ${expected}, observed ${observed}.`
    );
  }
}

function parsePax(bytes) {
  const fields = {};
  let cursor = 0;
  while (cursor < bytes.length) {
    const space = bytes.indexOf(32, cursor);
    if (space === -1) {
      break;
    }
    const length = Number.parseInt(
      bytes.subarray(cursor, space).toString("ascii"),
      10
    );
    if (!Number.isInteger(length) || length <= 0) {
      throw new Error("Archive extended header length is invalid.");
    }
    const record = bytes
      .subarray(space + 1, cursor + length - 1)
      .toString("utf8");
    const separator = record.indexOf("=");
    if (separator !== -1) {
      fields[record.slice(0, separator)] = record.slice(separator + 1);
    }
    cursor += length;
  }
  return fields;
}

export function inspectNpmArchive(archiveBytes) {
  const tarBytes = gunzipSync(archiveBytes);
  const entries = [];
  let offset = 0;
  let extendedFields = {};
  let longPath = null;
  while (offset + 512 <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      break;
    }
    verifyTarHeaderChecksum(header);
    const rawName = tarText(header, 0, 100);
    const prefix = tarText(header, 345, 155);
    const headerPath = prefix ? `${prefix}/${rawName}` : rawName;
    const size = tarNumber(header, 124, 12);
    const mode = tarNumber(header, 100, 8) & 0o777;
    const type = String.fromCharCode(header[156] || 48);
    const contentStart = offset + 512;
    const content = tarBytes.subarray(contentStart, contentStart + size);

    if (type === "x") {
      extendedFields = parsePax(content);
    } else if (type === "L") {
      longPath = content.toString("utf8").replace(/\0.*$/s, "");
    } else if (type === "0" || type === "\0") {
      const archivePath = extendedFields.path ?? longPath ?? headerPath;
      if (!archivePath.startsWith("package/")) {
        throw new Error(
          `Archive entry is outside the package root: ${archivePath}`
        );
      }
      entries.push({
        relativePath: archivePath.slice("package/".length),
        size,
        mode,
        sha256: sha256(content)
      });
      extendedFields = {};
      longPath = null;
    } else if (type !== "5") {
      throw new Error(
        `Archive entry type is not admitted: ${JSON.stringify(type)}`
      );
    }

    offset =
      contentStart + Math.ceil(size / 512) * 512;
  }
  return entries.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath)
  );
}

function normalizeExports(exportsValue) {
  if (typeof exportsValue === "string") {
    return [{ subpath: ".", target: exportsValue }];
  }
  return Object.entries(exportsValue ?? {})
    .map(([subpath, target]) => ({ subpath, target }))
    .sort((left, right) => left.subpath.localeCompare(right.subpath));
}

function normalizeBinaries(name, binValue) {
  if (typeof binValue === "string") {
    return [{ name, target: `./${binValue.replace(/^\.\//, "")}` }];
  }
  return Object.entries(binValue ?? {})
    .map(([binaryName, target]) => ({
      name: binaryName,
      target: `./${String(target).replace(/^\.\//, "")}`
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function npmInvocation() {
  const candidates = [
    process.env.npm_execpath,
    path.join(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js"
    )
  ].filter(Boolean);
  const cliPath = candidates.find((candidate) => existsSync(candidate));
  return cliPath
    ? {
        executable: process.execPath,
        prefixArguments: [cliPath]
      }
    : {
        executable: "npm",
        prefixArguments: []
      };
}

function spawnNpm(args, options) {
  const invocation = npmInvocation();
  return spawnSync(
    invocation.executable,
    [...invocation.prefixArguments, ...args],
    options
  );
}

function npmVersion(workspacePath) {
  const result = spawnNpm(["--version"], {
    cwd: workspacePath,
    encoding: "utf8",
    shell: false
  });
  if (result.status !== 0) {
    throw new Error(
      `npm version observation failed: ${result.stderr || result.error?.message}`
    );
  }
  return result.stdout.trim();
}

function createReleasePackageObservation(options = {}) {
  const workspacePath = path.resolve(options.workspacePath ?? process.cwd());
  const manifestRelativePath = options.manifestPath ?? "package.json";
  const dependencyLockRelativePath =
    options.dependencyLockPath ?? "package-lock.json";
  const manifestPath = confinedPath(
    workspacePath,
    manifestRelativePath,
    "Package manifest"
  );
  const dependencyLockPath = confinedPath(
    workspacePath,
    dependencyLockRelativePath,
    "Dependency lock"
  );
  if (!existsSync(manifestPath)) {
    throw new Error(`Package manifest is missing: ${manifestRelativePath}`);
  }
  if (!existsSync(dependencyLockPath)) {
    throw new Error(
      `Dependency lock is missing: ${dependencyLockRelativePath}`
    );
  }
  const manifest = readJson(manifestPath, "Package manifest");
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "governed-release-")
  );
  try {
    const packResult = spawnNpm(
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        temporaryDirectory
      ],
      {
        cwd: workspacePath,
        encoding: "utf8",
        shell: false
      }
    );
    if (packResult.status !== 0) {
      throw new Error(
        `npm archive observation failed: ${packResult.stderr || packResult.error?.message}`
      );
    }
    let packReport;
    try {
      [packReport] = JSON.parse(packResult.stdout);
    } catch (error) {
      throw new Error(
        `npm archive report is not valid JSON: ${error.message}`
      );
    }
    const archivePath = confinedPath(
      temporaryDirectory,
      packReport.filename,
      "Observed archive"
    );
    const archiveBytes = readFileSync(archivePath);
    const entries = inspectNpmArchive(archiveBytes);
    const reportedEntries = [...packReport.files]
      .map((entry) => ({
        relativePath: entry.path,
        size: entry.size,
        mode: entry.mode
      }))
      .sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath)
      );
    const observedEntryCoordinates = entries.map(
      ({ relativePath, size, mode }) => ({ relativePath, size, mode })
    );
    if (!canonicalEqual(reportedEntries, observedEntryCoordinates)) {
      throw new Error(
        "npm archive report differs from the observed archive entries."
      );
    }
    const observedShasum = digest("sha1", archiveBytes);
    const observedIntegrity = sha512Integrity(archiveBytes);
    if (
      packReport.shasum !== observedShasum ||
      packReport.integrity !== observedIntegrity
    ) {
      throw new Error(
        "npm archive report differs from the observed archive digest."
      );
    }
    return {
      archiveBytes,
      observation: {
        operation: "observe-release-package",
        package: {
        name: manifest.name,
        version: manifest.version,
        manifestPath: manifestRelativePath,
        publishedPaths: manifest.files ?? [],
        exports: normalizeExports(manifest.exports),
        binaries: normalizeBinaries(manifest.name, manifest.bin)
        },
        toolchain: {
        nodeVersion: process.version,
        packageManager: "npm",
        packageManagerVersion: npmVersion(workspacePath)
        },
        dependencyLock: {
        relativePath: dependencyLockRelativePath,
        sha256: sha256(readFileSync(dependencyLockPath))
        },
        packing: {
        command: PACK_COMMAND,
        observedLifecycleScripts: FORBIDDEN_LIFECYCLE_SCRIPTS.flatMap(
          (scriptName) =>
            manifest.scripts?.[scriptName]
              ? [
                  {
                    scriptName,
                    command: manifest.scripts[scriptName]
                  }
                ]
              : []
        ),
        bundledDependencies: [...(packReport.bundled ?? [])].sort(),
        entries
        },
        archive: {
        fileName: packReport.filename,
        size: archiveBytes.length,
        unpackedSize: entries.reduce(
          (total, entry) => total + entry.size,
          0
        ),
        entryCount: entries.length,
        sha256: sha256(archiveBytes),
        shasum: observedShasum,
        integrity: observedIntegrity
        }
      }
    };
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

export function observeReleasePackage(options = {}) {
  return createReleasePackageObservation(options).observation;
}

function listRelativeFiles(root) {
  if (!existsSync(root)) {
    return [];
  }
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        files.push(
          path.relative(root, absolutePath).split(path.sep).join("/")
        );
      }
    }
  };
  visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function observeDurableReleaseArtifacts(workspacePath, delivery) {
  const artifactDirectoryPath = confinedPath(
    workspacePath,
    delivery.artifactDirectory,
    "Release artifact directory"
  );
  const observedRelativePaths = listRelativeFiles(
    artifactDirectoryPath
  );
  const declaredRelativePaths = delivery.artifacts.map(
    (artifact) => artifact.relativePath
  );
  const observations = delivery.artifacts.map((artifact) => {
    const absolutePath = confinedPath(
      workspacePath,
      artifact.relativePath,
      "Durable release artifact"
    );
    if (!existsSync(absolutePath)) {
      return {
        releaseVersion: artifact.releaseVersion,
        role: artifact.role,
        relativePath: artifact.relativePath,
        exists: false
      };
    }
    const bytes = readFileSync(absolutePath);
    return {
      releaseVersion: artifact.releaseVersion,
      role: artifact.role,
      relativePath: artifact.relativePath,
      exists: true,
      size: bytes.length,
      sha256: sha256(bytes)
    };
  });
  const declaredDirectoryRelativePaths = declaredRelativePaths.map(
    (relativePath) =>
      path
        .relative(
          artifactDirectoryPath,
          confinedPath(
            workspacePath,
            relativePath,
            "Durable release artifact"
          )
        )
        .split(path.sep)
        .join("/")
  );
  return {
    artifactDirectory: delivery.artifactDirectory,
    currentArtifactPath: delivery.currentArtifactPath,
    exclusiveInventory: delivery.exclusiveInventory,
    artifactObservations: observations,
    missingPaths: observations
      .filter((observation) => !observation.exists)
      .map((observation) => observation.relativePath),
    undeclaredPaths: observedRelativePaths
      .filter(
        (relativePath) =>
          !declaredDirectoryRelativePaths.includes(relativePath)
      )
      .map(
        (relativePath) =>
          `${delivery.artifactDirectory}/${relativePath}`
      )
  };
}

function releaseReport({
  operation = "evaluate-release-boundary",
  authorityValidationDisposition,
  conformanceDisposition = "NOT_EVALUATED",
  proofDisposition = "NOT_EVALUATED",
  trustDisposition = "RELEASE_REJECTED",
  findings = []
}) {
  return {
    operation,
    authorityValidationDisposition,
    conformanceDisposition,
    proofDisposition,
    trustDisposition,
    findings
  };
}

function inspectReleaseAuthority(options = {}) {
  const workspacePath = path.resolve(options.workspacePath ?? process.cwd());
  const authorityPath = path.resolve(
    options.releaseAuthorityPath ?? DEFAULT_RELEASE_AUTHORITY_PATH
  );
  const schemaPath = path.resolve(
    options.releaseSchemaPath ?? DEFAULT_RELEASE_SCHEMA_PATH
  );
  let authority;
  let schema;
  let authorityBytes;
  try {
    authorityBytes = readFileSync(authorityPath);
    authority = JSON.parse(authorityBytes.toString("utf8"));
    schema = readJson(schemaPath, "Release schema");
  } catch (error) {
    return {
      report: releaseReport({
        authorityValidationDisposition: "RELEASE_AUTHORITY_INVALID",
        findings: [
          {
            findingId: "RELEASE_AUTHORITY_INPUT",
            detail: error.message
          }
        ]
      })
    };
  }
  if (!authorityBytes.equals(canonicalJsonBytes(authority))) {
    return {
      report: releaseReport({
        authorityValidationDisposition: "RELEASE_AUTHORITY_INVALID",
        findings: [
          {
            findingId: "RELEASE_AUTHORITY_NOT_CANONICAL"
          }
        ]
      })
    };
  }
  const schemaDigest = sha256(readFileSync(schemaPath));
  if (authority.schema?.identity !== schema.$id) {
    return {
      report: releaseReport({
        authorityValidationDisposition: "RELEASE_SCHEMA_NOT_ADMITTED",
        findings: [
          {
            findingId: "RELEASE_SCHEMA_IDENTITY_MISMATCH",
            expected: authority.schema?.identity ?? null,
            observed: schema.$id ?? null
          }
        ]
      })
    };
  }
  if (authority.schema?.digest !== schemaDigest) {
    return {
      report: releaseReport({
        authorityValidationDisposition: "RELEASE_SCHEMA_DIGEST_MISMATCH",
        findings: [
          {
            findingId: "RELEASE_SCHEMA_DIGEST_MISMATCH",
            expected: authority.schema?.digest ?? null,
            observed: schemaDigest
          }
        ]
      })
    };
  }
  let validate;
  try {
    validate = new Ajv2020({
      allErrors: true,
      strict: true
    }).compile(schema);
  } catch (error) {
    return {
      report: releaseReport({
        authorityValidationDisposition: "RELEASE_SCHEMA_NOT_ADMITTED",
        findings: [
          {
            findingId: "RELEASE_SCHEMA_COMPILATION",
            detail: error.message
          }
        ]
      })
    };
  }
  if (!validate(authority)) {
    return {
      report: releaseReport({
        authorityValidationDisposition: "RELEASE_AUTHORITY_INVALID",
        findings: [
          {
            findingId: "RELEASE_AUTHORITY_SCHEMA",
            errors: validate.errors ?? []
          }
        ]
      })
    };
  }

  const semanticFindings = [];
  const entryPaths = authority.packing.entries.map(
    (entry) => entry.relativePath
  );
  if (new Set(entryPaths).size !== entryPaths.length) {
    semanticFindings.push({
      findingId: "RELEASE_ENTRY_PATH_DUPLICATE"
    });
  }
  if (
    !canonicalEqual(
      entryPaths,
      [...entryPaths].sort((left, right) => left.localeCompare(right))
    )
  ) {
    semanticFindings.push({
      findingId: "RELEASE_ENTRY_ORDER_INVALID"
    });
  }
  for (const [identities, findingId] of [
    [
      authority.package.exports.map((entry) => entry.subpath),
      "RELEASE_EXPORT_DUPLICATE"
    ],
    [
      authority.package.binaries.map((entry) => entry.name),
      "RELEASE_BINARY_DUPLICATE"
    ]
  ]) {
    if (new Set(identities).size !== identities.length) {
      semanticFindings.push({ findingId });
    }
  }
  if (authority.archive.entryCount !== authority.packing.entries.length) {
    semanticFindings.push({
      findingId: "RELEASE_ENTRY_COUNT_AUTHORITY_MISMATCH"
    });
  }
  const declaredUnpackedSize = authority.packing.entries.reduce(
    (total, entry) => total + entry.size,
    0
  );
  if (authority.archive.unpackedSize !== declaredUnpackedSize) {
    semanticFindings.push({
      findingId: "RELEASE_UNPACKED_SIZE_AUTHORITY_MISMATCH"
    });
  }
  for (const target of [
    ...authority.package.exports.map((entry) =>
      entry.target.replace(/^\.\//, "")
    ),
    ...authority.package.binaries.map((entry) =>
      entry.target.replace(/^\.\//, "")
    ),
    authority.package.manifestPath
  ]) {
    if (!entryPaths.includes(target)) {
      semanticFindings.push({
        findingId: "RELEASE_ENTRYPOINT_UNRESOLVED",
        relativePath: target
      });
    }
  }
  if (entryPaths.includes(authority.dependencyLock.relativePath)) {
    semanticFindings.push({
      findingId: "RELEASE_DEPENDENCY_LOCK_PACKAGED",
      relativePath: authority.dependencyLock.relativePath
    });
  }
  const authorityRelativePath = path
    .relative(workspacePath, authorityPath)
    .split(path.sep)
    .join("/");
  if (entryPaths.includes(authorityRelativePath)) {
    semanticFindings.push({
      findingId: "RELEASE_AUTHORITY_PACKAGED",
      relativePath: authorityRelativePath
    });
  }
  if (entryPaths.includes(authority.receipt.relativePath)) {
    semanticFindings.push({
      findingId: "RELEASE_RECEIPT_PACKAGED",
      relativePath: authority.receipt.relativePath
    });
  }
  const claimIds = authority.claims.map((claim) => claim.claimId);
  if (new Set(claimIds).size !== claimIds.length) {
    semanticFindings.push({
      findingId: "RELEASE_CLAIM_ID_DUPLICATE"
    });
  }
  const claimValues = authority.claims.map((claim) => claim.claim);
  if (new Set(claimValues).size !== claimValues.length) {
    semanticFindings.push({
      findingId: "RELEASE_CLAIM_DUPLICATE"
    });
  }
  const durablePaths = authority.delivery.artifacts.map(
    (artifact) => artifact.relativePath
  );
  if (new Set(durablePaths).size !== durablePaths.length) {
    semanticFindings.push({
      findingId: "RELEASE_DURABLE_PATH_DUPLICATE"
    });
  }
  if (
    !canonicalEqual(
      durablePaths,
      [...durablePaths].sort((left, right) =>
        left.localeCompare(right)
      )
    )
  ) {
    semanticFindings.push({
      findingId: "RELEASE_DURABLE_PATH_ORDER_INVALID"
    });
  }
  const currentArtifacts = authority.delivery.artifacts.filter(
    (artifact) => artifact.role === "current"
  );
  if (
    currentArtifacts.length !== 1 ||
    currentArtifacts[0]?.relativePath !==
      authority.delivery.currentArtifactPath
  ) {
    semanticFindings.push({
      findingId: "RELEASE_CURRENT_ARTIFACT_CARDINALITY"
    });
  } else {
    const [currentArtifact] = currentArtifacts;
    if (
      currentArtifact.releaseVersion !== authority.package.version ||
      currentArtifact.size !== authority.archive.size ||
      currentArtifact.sha256 !== authority.archive.sha256 ||
      path.basename(currentArtifact.relativePath) !==
        authority.archive.fileName
    ) {
      semanticFindings.push({
        findingId: "RELEASE_CURRENT_ARTIFACT_AUTHORITY_MISMATCH"
      });
    }
  }
  const durableDirectoryPath = confinedPath(
    workspacePath,
    authority.delivery.artifactDirectory,
    "Release artifact directory"
  );
  const archiveNamePrefix = authority.package.name
    .replace(/^@/, "")
    .replace("/", "-");
  for (const durableArtifact of authority.delivery.artifacts) {
    const durablePath = durableArtifact.relativePath;
    const absoluteDurablePath = confinedPath(
      workspacePath,
      durablePath,
      "Durable release artifact"
    );
    const relation = path.relative(
      durableDirectoryPath,
      absoluteDurablePath
    );
    if (
      relation === "" ||
      relation.startsWith("..") ||
      path.isAbsolute(relation)
    ) {
      semanticFindings.push({
        findingId: "RELEASE_DURABLE_PATH_OUTSIDE_DIRECTORY",
        relativePath: durablePath
      });
    }
    if (
      path.basename(durablePath) !==
      `${archiveNamePrefix}-${durableArtifact.releaseVersion}.tgz`
    ) {
      semanticFindings.push({
        findingId: "RELEASE_DURABLE_FILENAME_MISMATCH",
        relativePath: durablePath,
        releaseVersion: durableArtifact.releaseVersion
      });
    }
  }
  if (semanticFindings.length > 0) {
    return {
      report: releaseReport({
        authorityValidationDisposition: "RELEASE_AUTHORITY_INVALID",
        findings: semanticFindings
      })
    };
  }

  return {
    workspacePath,
    authorityPath,
    schemaPath,
    authority,
    schema,
    schemaDigest,
    authorityDigest: sha256(authorityBytes)
  };
}

export function validateReleaseAuthority(options = {}) {
  const inspected = inspectReleaseAuthority(options);
  if (inspected.report) {
    return inspected.report;
  }
  return releaseReport({
    operation: "validate-release-authority",
    authorityValidationDisposition: "RELEASE_AUTHORITY_VALID",
    trustDisposition: "NOT_EVALUATED"
  });
}

function addDifference(findings, findingId, expected, observed) {
  if (!canonicalEqual(expected, observed)) {
    findings.push({
      findingId,
      expected,
      observed
    });
  }
}

function candidateReleaseFindings(inspected, observation) {
  const findings = [];
  addDifference(
    findings,
    "RELEASE_PACKAGE_METADATA_DRIFT",
    inspected.authority.package,
    observation.package
  );
  addDifference(
    findings,
    "RELEASE_TOOLCHAIN_DRIFT",
    inspected.authority.toolchain,
    observation.toolchain
  );
  addDifference(
    findings,
    "RELEASE_DEPENDENCY_LOCK_DRIFT",
    inspected.authority.dependencyLock,
    observation.dependencyLock
  );
  if (observation.packing.observedLifecycleScripts.length > 0) {
    findings.push({
      findingId: "RELEASE_LIFECYCLE_SCRIPT_FORBIDDEN",
      observed: observation.packing.observedLifecycleScripts
    });
  }
  addDifference(
    findings,
    "RELEASE_PACK_COMMAND_DRIFT",
    inspected.authority.packing.command,
    observation.packing.command
  );
  addDifference(
    findings,
    "RELEASE_BUNDLED_DEPENDENCY_DRIFT",
    inspected.authority.packing.bundledDependencies,
    observation.packing.bundledDependencies
  );
  addDifference(
    findings,
    "RELEASE_ENTRY_DRIFT",
    inspected.authority.packing.entries,
    observation.packing.entries
  );
  addDifference(
    findings,
    "RELEASE_ARCHIVE_DRIFT",
    inspected.authority.archive,
    observation.archive
  );
  return findings;
}

function durableReleaseFindings(authority, observation) {
  const findings = [];
  const expectedByPath = new Map(
    authority.delivery.artifacts.map((artifact) => [
      artifact.relativePath,
      artifact
    ])
  );
  for (const artifactObservation of observation.artifactObservations) {
    const expected = expectedByPath.get(
      artifactObservation.relativePath
    );
    if (!artifactObservation.exists) {
      findings.push({
        findingId: "RELEASE_ARTIFACT_MISSING",
        relativePath: artifactObservation.relativePath
      });
    } else if (
      artifactObservation.size !== expected.size ||
      artifactObservation.sha256 !== expected.sha256
    ) {
      findings.push({
        findingId: "RELEASE_ARTIFACT_CONTENT_MISMATCH",
        relativePath: artifactObservation.relativePath,
        expected: {
          size: expected.size,
          sha256: expected.sha256
        },
        observed: {
          size: artifactObservation.size,
          sha256: artifactObservation.sha256
        }
      });
    }
  }
  for (const relativePath of observation.undeclaredPaths) {
    findings.push({
      findingId: "RELEASE_ARTIFACT_UNDECLARED",
      relativePath
    });
  }
  return findings;
}

function makeReleaseReceipt(
  inspected,
  candidateObservation,
  deliveryObservation,
  candidateFindings,
  deliveryFindings
) {
  const findings = [...candidateFindings, ...deliveryFindings];
  const closed = findings.length === 0;
  return {
    receiptType: inspected.authority.receipt.receiptType,
    authorityValidationDisposition: "RELEASE_AUTHORITY_VALID",
    releaseAuthority: {
      releaseId: inspected.authority.release.releaseId,
      authoritySha256: inspected.authorityDigest
    },
    schema: {
      identity: inspected.schema.$id,
      digest: inspected.schemaDigest,
      authorityValidationDisposition: "RELEASE_AUTHORITY_VALID"
    },
    observations: {
      candidate: candidateObservation,
      delivery: deliveryObservation
    },
    checks: [
      {
        checkId: "validate-release-authority",
        disposition: "RELEASE_AUTHORITY_VALID"
      },
      {
        checkId: "observe-release-package",
        disposition: "RELEASE_PACKAGE_OBSERVED"
      },
      {
        checkId: "evaluate-release-candidate",
        disposition:
          candidateFindings.length === 0
            ? "RELEASE_CANDIDATE_CONFORMS"
            : "RELEASE_CANDIDATE_DRIFT"
      },
      {
        checkId: "evaluate-durable-release-artifacts",
        disposition:
          deliveryFindings.length === 0
            ? "RELEASE_ARTIFACTS_CONFORM"
            : "RELEASE_ARTIFACTS_DRIFT"
      },
      {
        checkId: "evaluate-release-boundary",
        disposition: closed
          ? "RELEASE_BOUNDARY_CLOSED"
          : "RELEASE_BOUNDARY_DRIFT"
      },
      {
        checkId: "issue-release-trust",
        disposition: closed ? "RELEASE_TRUSTED" : "RELEASE_REJECTED"
      }
    ],
    findings,
    claimPolicies: inspected.authority.claims,
    conformanceDisposition: closed
      ? "RELEASE_BOUNDARY_CLOSED"
      : "RELEASE_BOUNDARY_DRIFT",
    proofDisposition: closed
      ? "RELEASE_PROOF_COMPLETE"
      : "RELEASE_PROOF_INCOMPLETE",
    trustDisposition: closed ? "RELEASE_TRUSTED" : "RELEASE_REJECTED"
  };
}

export function evaluateReleaseBoundary(options = {}) {
  const inspected = inspectReleaseAuthority(options);
  if (inspected.report) {
    return inspected.report;
  }
  let observation;
  try {
    observation = observeReleasePackage({
      workspacePath: inspected.workspacePath,
      manifestPath: inspected.authority.package.manifestPath,
      dependencyLockPath:
        inspected.authority.dependencyLock.relativePath
    });
  } catch (error) {
    return releaseReport({
      authorityValidationDisposition: "RELEASE_AUTHORITY_VALID",
      conformanceDisposition: "RELEASE_OBSERVATION_FAILED",
      proofDisposition: "RELEASE_PROOF_INCOMPLETE",
      findings: [
        {
          findingId: "RELEASE_OBSERVATION_FAILED",
          detail: error.message
        }
      ]
    });
  }

  const deliveryObservation = observeDurableReleaseArtifacts(
    inspected.workspacePath,
    inspected.authority.delivery
  );
  const candidateFindings = candidateReleaseFindings(
    inspected,
    observation
  );
  const deliveryFindings = durableReleaseFindings(
    inspected.authority,
    deliveryObservation
  );
  return makeReleaseReceipt(
    inspected,
    observation,
    deliveryObservation,
    candidateFindings,
    deliveryFindings
  );
}

export function materializeReleaseArtifact(options = {}) {
  const inspected = inspectReleaseAuthority(options);
  if (inspected.report) {
    return inspected.report;
  }
  let created;
  try {
    created = createReleasePackageObservation({
      workspacePath: inspected.workspacePath,
      manifestPath: inspected.authority.package.manifestPath,
      dependencyLockPath:
        inspected.authority.dependencyLock.relativePath
    });
  } catch (error) {
    return releaseReport({
      operation: "materialize-release-artifact",
      authorityValidationDisposition: "RELEASE_AUTHORITY_VALID",
      conformanceDisposition: "RELEASE_OBSERVATION_FAILED",
      proofDisposition: "RELEASE_PROOF_INCOMPLETE",
      findings: [
        {
          findingId: "RELEASE_OBSERVATION_FAILED",
          detail: error.message
        }
      ]
    });
  }
  const candidateFindings = candidateReleaseFindings(
    inspected,
    created.observation
  );
  if (candidateFindings.length > 0) {
    return releaseReport({
      operation: "materialize-release-artifact",
      authorityValidationDisposition: "RELEASE_AUTHORITY_VALID",
      conformanceDisposition: "RELEASE_CANDIDATE_DRIFT",
      proofDisposition: "RELEASE_PROOF_INCOMPLETE",
      findings: candidateFindings
    });
  }
  const currentArtifact = inspected.authority.delivery.artifacts.find(
    (artifact) => artifact.role === "current"
  );
  const outputPath = confinedPath(
    inspected.workspacePath,
    currentArtifact.relativePath,
    "Current release artifact"
  );
  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, created.archiveBytes);
  const receipt = evaluateReleaseBoundary(options);
  return {
    ...receipt,
    operation: "materialize-release-artifact",
    materializedArtifact: {
      relativePath: currentArtifact.relativePath,
      size: created.archiveBytes.length,
      sha256: sha256(created.archiveBytes)
    }
  };
}

export function writeCanonicalReleaseReceipt(options, receipt) {
  const inspected = inspectReleaseAuthority(options);
  if (inspected.report) {
    return inspected.report;
  }
  const receiptPath = confinedPath(
    inspected.workspacePath,
    inspected.authority.receipt.relativePath,
    "Release receipt"
  );
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, canonicalJsonBytes(receipt));
  return {
    operation: "write-release-receipt",
    relativePath: inspected.authority.receipt.relativePath,
    receiptSha256: sha256(canonicalJsonBytes(receipt)),
    trustDisposition: receipt.trustDisposition
  };
}

export function evaluateReleaseClaim(receipt, claim) {
  const policy = receipt?.claimPolicies?.find(
    (entry) => entry.claim === claim
  );
  const findings = [];
  if (!policy) {
    findings.push({
      findingId: "RELEASE_CLAIM_UNDECLARED",
      claim
    });
  } else {
    for (const [field, expected] of [
      [
        "conformanceDisposition",
        policy.requiredConformanceDisposition
      ],
      ["proofDisposition", policy.requiredProofDisposition],
      ["trustDisposition", policy.requiredTrustDisposition]
    ]) {
      if (receipt?.[field] !== expected) {
        findings.push({
          findingId: "RELEASE_CLAIM_EXCEEDS_EVIDENCE",
          evidence: field,
          expected,
          observed: receipt?.[field] ?? "NOT_EVALUATED"
        });
      }
    }
  }
  return {
    operation: "evaluate-release-claim",
    claim,
    claimId: policy?.claimId ?? null,
    findings,
    claimDisposition:
      findings.length === 0
        ? "RELEASE_CLAIM_ADMITTED"
        : "RELEASE_CLAIM_EXCEEDS_EVIDENCE"
  };
}

export function evaluateReleaseReceiptClaim(
  options,
  suppliedReceipt,
  claim
) {
  const currentReceipt = evaluateReleaseBoundary(options);
  const currentClaim = evaluateReleaseClaim(currentReceipt, claim);
  const suppliedDigest = sha256(canonicalJsonBytes(suppliedReceipt));
  const currentDigest = sha256(canonicalJsonBytes(currentReceipt));
  if (
    suppliedReceipt?.receiptType !==
      "governed-release-boundary-receipt.v1" ||
    suppliedDigest !== currentDigest
  ) {
    return {
      ...currentClaim,
      suppliedReceiptSha256: suppliedDigest,
      currentReceiptSha256: currentDigest,
      findings: [
        {
          findingId: "RELEASE_CLAIM_EXCEEDS_EVIDENCE",
          evidence: "current-release-receipt",
          expected: currentDigest,
          observed: suppliedDigest
        },
        ...currentClaim.findings
      ],
      claimDisposition: "RELEASE_CLAIM_EXCEEDS_EVIDENCE"
    };
  }
  return currentClaim;
}
