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
  "profiles/closed-world-artifact-conformance.v5.json"
);
head.targetSchemaDigest = digest("schemas/governed-artifact-contract.schema.json");
registry.schemaCatalog.digest = digest("schemas/schema-catalog.json");
writeFileSync(registryPath, `${JSON.stringify(sortKeys(registry), null, 2)}\n`);

spawnSync("git", ["checkout", "examples/governed-message-artifact-family.contract.json"], {
  stdio: "inherit"
});
const migrated = spawnSync(
  process.execPath,
  [
    "bin/governed-artifacts.mjs",
    "migrate",
    "--contract",
    "examples/governed-message-artifact-family.contract.json",
    "--write"
  ],
  { encoding: "utf8" }
);
const report = JSON.parse(migrated.stdout);
process.stdout.write(
  `${report.migrationDisposition ?? report.contractValidationDisposition}\n`
);
if (report.findings?.length) {
  process.stdout.write(`${JSON.stringify(report.findings, null, 2)}\n`);
}
