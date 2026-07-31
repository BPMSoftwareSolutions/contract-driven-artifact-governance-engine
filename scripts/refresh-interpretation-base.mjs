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

const registryPath = "registries/migration-registry.json";
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
for (const entry of registry.migrations) {
  entry.migrationAuthority.digest = digest(
    entry.migrationAuthority.relativePath
  );
}
const head = registry.migrations[registry.migrations.length - 1];
head.targetInterpretationBase.engine.digest = digest(
  "lib/governed-artifact-engine.mjs"
);
head.targetInterpretationBase.conformanceProfile.digest = digest(
  "profiles/closed-world-artifact-conformance.v6.json"
);
head.targetSchemaDigest = digest(
  "schemas/governed-artifact-contract.schema.json"
);
registry.schemaCatalog.digest = digest("schemas/schema-catalog.json");
writeFileSync(registryPath, `${JSON.stringify(sortKeys(registry), null, 2)}\n`);

const contractPath = "examples/governed-message-artifact-family.contract.json";
spawnSync("git", ["checkout", "HEAD", "--", contractPath], { stdio: "inherit" });

for (let step = 0; step < 4; step += 1) {
  const migrated = spawnSync(
    process.execPath,
    ["bin/governed-artifacts.mjs", "migrate", "--contract", contractPath, "--write"],
    { encoding: "utf8" }
  );
  const report = JSON.parse(migrated.stdout);
  const disposition =
    report.migrationDisposition ?? report.contractValidationDisposition;
  process.stdout.write(`${step}: ${disposition}\n`);
  if (disposition === "MIGRATION_NOT_REQUIRED") {
    break;
  }
  if (disposition !== "CONTRACT_MIGRATED") {
    process.stdout.write(`${JSON.stringify(report.findings ?? [], null, 2)}\n`);
    break;
  }
}

const lineagePath = "scripts/example-lineage.json";
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
contract.lineage = JSON.parse(readFileSync(lineagePath, "utf8"));
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
