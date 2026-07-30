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
- the exact dependency, import, declaration, invocation, and control-flow authority;
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

Source artifacts declare their exact top-level declarations, invocations,
meaningful syntax kinds, and forbidden syntax. The contract also declares every
importable dependency, its exact import bindings, the artifacts permitted to
use it, its exact admitted invocations, and the port or artifact edge that
grants authority. Ambient operations such as process input and output require
separate effect authorities bound to exact ports.

The evaluator observes source structure before byte comparison. Undeclared
imports, ambient effects, declarations, decision paths, loops, and projection
logic therefore produce deterministic escape findings and
`ARTIFACT_ESCAPES_CONTRACT`. A literal-only byte change remains a distinct
`PAYLOAD_MISMATCH`.

Runtime availability grants no authority. Installed packages, Node built-ins,
workspace modules, and global effects are prohibited unless they resolve
through the contract.

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
digest, dependency and effect authorities, artifact authority IDs, projector
IDs, projection modes, and content commitments. A missing or altered ledger produces
`PROJECTION_IDENTITY_MISMATCH`.

## Verifiers

The admitted verifier registry covers:

- declared versus observed artifact inventory;
- dependency, import, declaration, invocation, and syntax authority closure;
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
`PROOF_COMPLETE`, and `TRUSTED` in the same receipt. Claim evaluation
re-observes the workspace and rejects a supplied receipt that differs from the
current canonical evidence.

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
