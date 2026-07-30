# Contract-Driven Artifact Governance Engine

This package operates one closed governance loop:

```text
Schema -> Contract -> Artifacts -> Conformance -> Trust
```

The Governed Artifact Contract is the admitted authority for one complete
artifact family. Registered projectors turn its typed authorities into exact
bytes and bind their identities in a canonical projection ledger. Registered
verifiers observe the target workspace, evaluate the declared artifact family,
and issue a canonical trust receipt.

The contract is simultaneously:

- the reviewed design authority;
- the complete artifact declaration;
- the artifact relationship graph;
- the exact byte authority;
- the exact authority for every semantic control surface;
- the conformance policy; and
- the evidence requirement for a trust disposition.

Artifact files are projections. Durable change begins in the admitted contract.

## Trusted interpretation base

Four independently pinned inputs control every operation:

1. the admitted contract schema;
2. the Governed Artifact Contract;
3. the projector registry; and
4. the verifier registry.

The target workspace is observed state, never authority. Pin the package
version, schema digest, and registry digests so a change to the interpretation
base cannot silently redefine an admitted contract.

## Contract validation gate

Contract validation is separate from artifact conformance. Its terminal
dispositions are:

- `CONTRACT_VALID`
- `CONTRACT_INVALID`
- `SCHEMA_NOT_ADMITTED`
- `SCHEMA_DIGEST_MISMATCH`

Any non-valid result leaves artifact conformance and trust
`NOT_EVALUATED`.

## Artifact conformance gate

After a contract is valid, the engine resolves the artifact plan, observes the
workspace, and evaluates the declared checks in fail-closed order. Its terminal
conformance dispositions are:

- `CONTRACT_AUTHORITY_CLOSED`
- `ARTIFACT_MISSING`
- `ARTIFACT_UNDECLARED`
- `ARTIFACT_CONTENT_MISMATCH`
- `ARTIFACT_STRUCTURE_MISMATCH`
- `ARTIFACT_STALE`
- `PROJECTION_IDENTITY_MISMATCH`
- `ARTIFACT_ESCAPES_CONTRACT`

Every result maps to one trust posture:

- `CONFORMS`
- `DRIFTED`
- `MISSING`
- `EXTRA`
- `STALE`
- `CONTAMINATED`
- `NOT_EVALUATED`

Only `CONTRACT_AUTHORITY_CLOSED` produces `TRUSTED`.

## Authority closure gate

Authority closure is a closed-world rule. Every applicable control surface is
present as structured contract data:

The top-level `authorityClosure` profile makes that rule explicit. The admitted
schema fixes every coverage surface to `exact`, requires each observation to
resolve to exactly one authority, and rejects ambiguous, missing, undeclared,
or unresolved authority. Ambient authority is always `forbidden`; these values
are schema constants rather than contract options. Explicitly empty authority
collections remain closed declarations.

| Surface | Required contract authority |
| --- | --- |
| Artifact path | artifact declaration |
| Import | dependency specifier and exact import bindings |
| Package use | dependency authority and exact admitted invocations |
| Function | named responsibility, declaration, kind, and purpose |
| Invocation or governed reference | semantic edge, argument expressions, occurrence count, and authority references |
| External operation | effect authority bound to an exact port |
| DTO field | projection mapping from output field to source expression |
| Branch | decision authority with exact condition expression |
| Loop | iteration authority with exact control expression, continuation policy, and termination policy |
| Failure handling | failure policy with exact source form and expression where applicable |
| Return or emitted output | result contract with exact source expression and projection mapping where applicable |
| Trust claim | claim policy with exact conformance, proof, and trust requirements |

Empty collections are significant. For example, `iterations: []` declares that
an artifact has no iteration authority; every loop is therefore an escape.
Likewise, the forbidden-syntax set closes source forms that have no admitted
authority.

The contract also declares every importable dependency, the artifacts permitted
to use it, and the port or artifact responsibility that grants authority.
Ambient operations such as process input and output require separate effect
authorities bound to exact ports. Runtime operations such as `JSON.parse` and
`new URL` require named runtime authorities.

The evaluator observes source structure before byte comparison. Undeclared
paths, imports, package operations, functions, semantic edges, effects,
decisions, iterations, failure policies, DTO mappings, and results therefore
produce deterministic escape findings and `ARTIFACT_ESCAPES_CONTRACT`. A
comment-only byte change remains a distinct `PAYLOAD_MISMATCH`.

Runtime availability grants no authority. Installed packages, Node built-ins,
workspace modules, and global effects are prohibited unless they resolve
through the contract.

## Artifact scope authority

Workspace resolution and artifact inventory are separate authorities:

- `workspaceRoot` selects the contract-relative base beneath the supplied
  consumer workspace;
- `artifactRoot` selects the base for declared artifact paths; and
- `governedScope` declares the inventory boundary.

`exclusive-subtree` preserves the original posture: every file beneath
`artifactRoot` belongs to the artifact family. `declared-paths` observes only
declared artifact paths, exact exclusions, and every descendant of an
explicitly governed directory.

```json
{
  "workspace": {
    "workspaceRoot": ".",
    "artifactRoot": ".",
    "governedScope": {
      "scopeType": "declared-artifact-scope.v1",
      "inventoryMode": "declared-paths",
      "governedDirectories": [
        "src/generated"
      ],
      "outsideScopePosture": "outside-authority",
      "requiredDisposition": "ARTIFACT_SCOPE_CLOSED"
    }
  }
}
```

Declared-path scope has no implicit ignore list and no glob interpretation.
Repository state such as `.git`, `node_modules`, lockfiles, and unrelated
source is outside authority only because it does not resolve through the
declared path set. An undeclared descendant of `src/generated` remains governed
inventory and produces `ARTIFACT_UNDECLARED`. An exact exclusion is observed
even when it is outside a governed directory.

The artifact plan records the selected mode, scope-authority digest, and
resolved governed path set. The canonical receipt records the same authority,
its digest-bound observation, the outside-authority classification rule, and
`ARTIFACT_SCOPE_CLOSED` or `ARTIFACT_SCOPE_OPEN`. Trust claims require the
closed disposition.

## Release boundary

The repository-level npm archive has a separate admitted authority:
`release/governed-npm-release-boundary.json`. It is intentionally outside the
published archive. Including an archive authority inside the archive whose
digest it declares would create a self-reference.

Durable archives live exclusively under `release/artifacts`. Historical
archives remain declared with exact path, size, and digest. The current archive
must be materialized at its declared path; missing, additional, or altered
files make the release boundary red.

The release authority declares:

- an immutable closed-world release-authority closure profile;
- package name, version, published paths, exports, and command binaries;
- the exact Node and npm versions used to pack;
- the dependency-lock digest;
- the exact `npm pack --json --ignore-scripts` operation;
- a forbidden packing-lifecycle-script policy;
- the complete archive entry inventory, including path, size, mode, and
  SHA-256 for every entry;
- archive size, unpacked size, entry count, SHA-256, npm shasum, and
  SHA-512 integrity;
- the exclusive durable release directory and every admitted archive path;
- canonical release-receipt evidence; and
- the proof requirements for the `RELEASE_READY` claim.

Release evaluation creates the archive in an isolated temporary directory,
parses the gzip and tar bytes independently, checks tar-header checksums, and
compares every observation with the authority. It separately observes the
durable release directory and compares its complete inventory and file
digests. Any entry, metadata, toolchain, lockfile, lifecycle, archive, missing
durable artifact, additional durable artifact, or durable byte difference
produces `RELEASE_AUTHORITY_OPEN`, `RELEASE_BOUNDARY_DRIFT`, and
`RELEASE_REJECTED`.

## Projectors

The admitted projector registry contains four data-driven projectors:

- `canonical-json-value-projector.v1` serializes JSON with sorted object keys,
  two-space indentation, UTF-8, and one final LF;
- `governed-artifact-contract-markdown-projector.v1` renders the structured
  contract authority as a deterministic architecture review document;
- `utf8-text-projector.v1` emits the exact admitted UTF-8 text; and
- `lossless-source-token-projector.v1` concatenates ordered token text and
  independently rescans the result to prove token identity.

No projector selects content from an artifact kind or subject identity. The
contract supplies all artifact authority.

The contract-Markdown projector derives contract identity, semantic subject,
artifact inventory, proof requirements, projection bindings, relationships,
exclusions, evaluation order, terminal dispositions, and evidence requirements
from the contract. Its authority contains only presentation fields: document
title, future-state paragraphs, reviewer perspective, schema-constrained
section order, and review checklist. The resulting Markdown is content-hashed
and reprojected during conformance evaluation.

Every projection operation also writes or checks the contract-declared
projection ledger. The ledger binds the contract digest, projector-registry
digest, dependency, effect, runtime, and source authorities, artifact authority
IDs, projector IDs, projection modes, and content commitments. A missing or
altered ledger produces `PROJECTION_IDENTITY_MISMATCH`.

## Verifiers

The admitted verifier registry covers:

- declared versus observed artifact inventory;
- dependency, import, responsibility, semantic-edge, effect, decision,
  iteration, failure, projection-mapping, result, and syntax authority closure;
- SHA-256 and byte length;
- lossless source-token structure;
- Draft 2020-12 JSON Schema validity;
- ordered Markdown section headings;
- forbidden-text absence;
- artifact relationship resolution; and
- declared command exit code and standard output.

## Command surface

Validate only:

```text
governed-artifacts validate \
  --contract architecture/artifact-family.contract.json
```

Inspect the resolved artifact plan:

```text
governed-artifacts plan \
  --contract architecture/artifact-family.contract.json
```

Project declared bytes:

```text
governed-artifacts project \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --write
```

Check projected bytes without writing:

```text
governed-artifacts project \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --check
```

Observe without evaluating:

```text
governed-artifacts observe \
  --contract architecture/artifact-family.contract.json \
  --workspace .
```

Evaluate and persist the canonical receipt:

```text
governed-artifacts evaluate \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --write-receipt
```

Operate the complete closed loop:

```text
governed-artifacts prove \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --write-receipt
```

Admit a claim only when a canonical receipt contains its declared evidence:

```text
governed-artifacts claim \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --receipt .governance/receipts/artifact-family.receipt.json \
  --claim COMPLETE
```

The result is `CLAIM_ADMITTED` or `CLAIM_EXCEEDS_EVIDENCE`. A trusted claim
requires `CONTRACT_AUTHORITY_CLOSED`, `ARTIFACT_AUTHORITY_CLOSED`,
`ARTIFACT_SCOPE_CLOSED`, `PROOF_COMPLETE`, and `TRUSTED` in the same receipt.
Claim evaluation re-observes the workspace and rejects a supplied receipt that
differs from the current canonical evidence.

Observe the npm release archive without granting trust:

```text
governed-artifacts release-observe --workspace .
```

Validate the external release authority:

```text
governed-artifacts release-validate \
  --release-authority release/governed-npm-release-boundary.json
```

Materialize the current archive only after the reproducible candidate conforms:

```text
governed-artifacts release-materialize \
  --workspace . \
  --release-authority release/governed-npm-release-boundary.json
```

The repository shorthand is `npm run release:materialize`.

Evaluate the release boundary and write its canonical receipt:

```text
governed-artifacts release-check \
  --workspace . \
  --release-authority release/governed-npm-release-boundary.json \
  --write-receipt
```

Admit a release claim only against current canonical evidence:

```text
governed-artifacts release-claim \
  --workspace . \
  --release-authority release/governed-npm-release-boundary.json \
  --release-receipt .governance/releases/npm-release.receipt.json \
  --claim RELEASE_READY
```

Successful release evaluation yields `RELEASE_AUTHORITY_CLOSED`,
`RELEASE_BOUNDARY_CLOSED`, `RELEASE_PROOF_COMPLETE`, and `RELEASE_TRUSTED`.
A current release receipt can then admit `RELEASE_READY`. The repository's
`npm run prove` command includes this release check after audit, tests, and the
npm dry-run inspection. Archive reproducibility without durable artifact
conformance is insufficient.

Each operation also accepts explicit `--schema`, `--projector-registry`, and
`--verifier-registry` paths. Their exact file digests must equal the admitted
identities in the contract. When an artifact declares `validThroughUtc`, use
`--observed-at <ISO-8601 timestamp>` to make the freshness observation
reproducible. An observation after that authority produces `ARTIFACT_STALE`.

## Included governed artifact family

[governed-message-artifact-family.contract.json](./examples/governed-message-artifact-family.contract.json)
declares eight heterogeneous artifacts:

- a Draft 2020-12 schema;
- a JSON contract;
- a source module;
- a command entrypoint;
- a verification command;
- a contract-derived architecture review document;
- a Mermaid diagram; and
- a package manifest.

The engine projects them into an empty workspace, executes the declared
verification command, evaluates all observations, and writes a deterministic
public receipt. The example contains no artifact bytes outside its contract.

## Canonical receipt

The receipt binds:

- exact contract, schema, and registry digests;
- artifact-scope authority, resolved path set, observation digest, and
  disposition;
- every artifact observation;
- every observed source authority surface;
- missing and undeclared paths;
- ordered conformance checks;
- fail-closed findings;
- declared claim policies and proof completeness;
- the terminal conformance disposition; and
- the terminal trust disposition.

The receipt contains no implicit clock field. Artifact families without a
freshness policy are byte-deterministic from admitted inputs and artifact
observations alone. When freshness is governed, the explicit observation time
is preserved in the receipt.
