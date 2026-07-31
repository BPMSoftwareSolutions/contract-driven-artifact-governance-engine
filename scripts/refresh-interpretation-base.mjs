// The interpretation base and the migration head are derived from the engine
// inputs, not authored. This restamps both after an engine change so the
// example contract keeps interpreting itself with the bytes on disk.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const digest = (relativePath) =>
  `sha256:${createHash("sha256").update(readFileSync(relativePath)).digest("hex")}`;

const sortKeys = (value) =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sortKeys(value[key])])
        )
      : value;

const enginePath = "lib/governed-artifact-engine.mjs";
const profilePath = "profiles/closed-world-artifact-conformance.v6.json";
const schemaPath = "schemas/governed-artifact-contract.schema.json";
const registryPath = "registries/migration-registry.json";
const contractPath = "examples/governed-message-artifact-family.contract.json";

const engineIdentity = /ENGINE_IDENTITY = "([^"]+)"/.exec(
  readFileSync(enginePath, "utf8")
)[1];

const registry = JSON.parse(readFileSync(registryPath, "utf8"));
for (const entry of registry.migrations) {
  entry.migrationAuthority.digest = digest(
    entry.migrationAuthority.relativePath
  );
}
const head = registry.migrations[registry.migrations.length - 1];
head.targetInterpretationBase.engine = {
  digest: digest(enginePath),
  identity: engineIdentity
};
head.targetInterpretationBase.conformanceProfile = {
  digest: digest(profilePath),
  identity: JSON.parse(readFileSync(profilePath, "utf8")).profileId
};
head.targetSchemaDigest = digest(schemaPath);
registry.schemaCatalog.digest = digest("schemas/schema-catalog.json");
writeFileSync(registryPath, `${JSON.stringify(sortKeys(registry), null, 2)}\n`);

const contract = JSON.parse(readFileSync(contractPath, "utf8"));
contract.interpretationBase = {
  ...contract.interpretationBase,
  engine: structuredClone(head.targetInterpretationBase.engine),
  conformanceProfile: structuredClone(
    head.targetInterpretationBase.conformanceProfile
  ),
  schema: {
    ...contract.interpretationBase.schema,
    digest: head.targetSchemaDigest
  },
  migrationRegistry: {
    ...contract.interpretationBase.migrationRegistry,
    digest: digest(registryPath)
  },
  projectorRegistry: {
    ...contract.interpretationBase.projectorRegistry,
    digest: digest("registries/projector-registry.json")
  },
  verifierRegistry: {
    ...contract.interpretationBase.verifierRegistry,
    digest: digest("registries/verifier-registry.json")
  }
};
writeFileSync(contractPath, `${JSON.stringify(sortKeys(contract), null, 2)}\n`);

const reconciled = spawnSync(
  process.execPath,
  ["bin/governed-artifacts.mjs", "reconcile", "--contract", contractPath, "--write"],
  { encoding: "utf8" }
);
const report = JSON.parse(reconciled.stdout);
process.stdout.write(
  `reconcile: ${report.reconciliationDisposition ?? report.contractValidationDisposition}\n`
);
if (report.findings?.length) {
  process.stdout.write(`${JSON.stringify(report.findings, null, 2)}\n`);
}
