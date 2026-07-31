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

The contract supplies consumer-owned authority:

- the reviewed design authority;
- the complete artifact declaration;
- the artifact relationship graph;
- the exact byte authority;
- the exact authority for every semantic control surface;
- the selected verification authorities; and
- independent content digests and byte lengths for projected artifacts.

Artifact files are projections. Durable consumer-authored change begins in the
admitted contract. The contract is the single consumer-authored mutation
authority for an artifact family. Every derived mutation must be a
deterministic consequence of that validated contract under its digest-bound
interpretation base.

Projection has positive path authority only: it may create or replace declared
artifact paths and declared control evidence. It never removes a path.
Undeclared state is observed, reported, and trust-blocking, but absence from the
contract is never interpreted as authority to destroy workspace state.

## Trusted interpretation base

Six independently pinned inputs form the interpretation-base commitment:

1. the engine module;
2. the admitted contract schema;
3. the conformance profile;
4. the projector registry;
5. the verifier registry; and
6. the migration registry.

The target workspace is observed state, never authority. Pin the package
version and every interpretation-base digest so a change to the authority that
reads a contract cannot silently redefine its acceptance standard.

The content-addressed conformance profile owns engine protocol: artifact
postures, closed-world authority closure, operation boundaries, evaluation
order, terminal dispositions, claim prerequisites, and receipt and projection
ledger evidence. Consumer contracts bind the profile identity and digest
without restating those constants.

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
- `EVALUATION_INVALIDATED_BY_MUTATION`

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

The content-addressed conformance profile makes that rule explicit. It fixes
every coverage surface to `exact`, requires each observation to resolve to
exactly one authority, and rejects ambiguous, missing, undeclared, or
unresolved authority. Ambient authority is always `forbidden`; these values
are engine protocol rather than consumer choices. Explicitly empty authority
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
| Operation | authored-mutation, projection, and proof authorities |

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

## Operation authorities

The conformance profile separates seven operation classes:

- `authoredMutation` grants sole authored change authority to the contract and
  forbids authored changes to governed artifacts;
- `mutationAuthority` requires exactly one consumer-authored source, confines
  governed artifact writes to create-or-replace operations on declared
  projections, and forbids removal;
- `bodyPurity` requires projected DTO bodies to contain exactly one semantic
  execution invocation and one direct result flow, with no local decisions,
  construction, failure, or serialization mechanics;
- `projection` permits `project --write` to replace only declared projections,
  and only when write mode is explicit;
- `proof` is read-only, forbids artifact projection and subject mutation, and
  permits an explicitly requested receipt only outside the governed subject;
- `reconciliation` projects candidates only in memory and may change only
  `contentSha256` and `expectedByteLength` in the contract; and
- `migration` interprets the source through its exact historical schema and
  may replace only the contract after an exact candidate diff.

Every artifact is `contract-owned`, `replace-by-projection`, and `projected`.
The contract itself must remain outside governed artifact scope. Projection is
the only operation authorized to replace governed bytes; observation,
evaluation, proof, and claim operations cannot repair them.

Conformance captures the interpretation authority and evaluated subject before
and after evaluation. A change during that interval produces
`EVALUATION_INVALIDATED_BY_MUTATION`, `PROOF_INCOMPLETE`, and `REJECTED`.
Stable proof records `PROOF_SUBJECT_UNCHANGED`.

## Single-source mutation authority

The content-addressed conformance profile admits one mutation law:

```text
Consumer-authored authority
    = contract only

Governed artifact mutation
    = create declared projection
    + replace declared projection

Undeclared state
    = observe + reject trust

Removal
    = forbidden
```

The projection ledger and conformance receipt bind this authority. Contract
commitment reconciliation and admitted migration are derived contract
mutations; neither writes artifacts. Projection and explicit control-evidence
writes remain deterministic consequences of the validated contract.

This is intentionally conservative. A removed, relocated, or unexpectedly
created artifact remains visible as `ARTIFACT_UNDECLARED` until an operator
performs an explicit repository correction. The engine identifies the exact
path and refuses trust, but does not infer destructive authority from omission.

## Semantic execution body purity

Semantic declaration authorizes meaning; it does not authorize equivalent
mechanics in a projected code body. DTO fields, validation outcomes, failure
outcomes, and serialization posture are materialized as governed semantic
authority data. The executor is selected by a contract-declared
`execute-semantic-authority` port, so conformance is bound to the authority
role rather than a particular function spelling. An imported executor may be
aliased without changing the law.

The compatibility projection authority binds one declared schema and one
`semantic-projection-authority.v1` document:

```javascript
export function projectMessage(value) {
  return executeSemanticProjection(projectMessageAuthority, messageSchema, value);
}
```

The body-purity law is fixed by the conformance profile and cannot be relaxed
by adding source declarations. It applies equally to compatibility projection
authorities and deterministic ontology bundles. For a semantic execution body,
conformance
requires:

```text
exactly one exported responsibility
exactly one semantic execution invocation
exactly one direct result flow
zero local decisions
zero local iterations
zero local failure mechanics
zero local DTO construction
zero local serialization or normalization
zero additional execution
```

A locally coded branch produces
`DECLARED_SEMANTICS_DO_NOT_AUTHORIZE_BODY_BRANCHING`; DTO construction produces
`LOCAL_RESULT_CONSTRUCTION_FORBIDDEN`; serialization outside the runtime
produces `EXECUTION_MECHANIC_OUTSIDE_TRUSTED_BOUNDARY`. The semantic authority
remains rich and contract-owned, while the projected body remains an executable
wire rather than a second authoring surface.

## Deterministic ontology authority

`deterministic-ontology-authority.v1` is the complete authored semantic
authority for a governed execution. It declares a finite, typed ontology:

- concepts and explicit `isA` inheritance;
- typed relations, observed and projected properties, and exact cardinality;
- typed facts and finite classifications;
- closed constraints and total finite translations;
- obligations with explicit satisfied states and failure dispositions;
- transformations from named semantic sources to named result properties;
- discriminated result unions with exhaustive, mutually exclusive selection;
- exact bindings from each executable semantic authority to a finite runtime
  primitive;
- one acyclic, reachable, terminating execution graph; and
- exact proof requirements for reference, type, cardinality, classification,
  translation, obligation, result, execution-binding, and graph closure.

The ontology owns meaning. The execution graph owns only ordering and data
flow. Every graph edge must preserve the exact declared semantic connection:
an obligation can consume only its declared classification, a transformation
can consume only its declared source authority, and result emission can consume
only the selection and transformation fragments declared for that result
union. Matching port shapes are not sufficient.

The finite semantic runtime admits only named primitives for input, variant
validation, bounded path reads, constants, presence or finite-value
classification, multi-observation classification, finite translation,
obligation evaluation, value projection, result selection, result emission,
and serialization. The exact primitive vocabulary and runtime limits are
digest-bound. Cycles, recursion, arbitrary expressions, user code, dynamic
invocation, unbounded traversal, implicit coercion, ambient state, clocks,
randomness, network access, and first-match ambiguity are outside authority.

`classify-observations.v1` derives one typed concept from two or more named
property observations without flattening the source wire shape. Each case is a
finite conjunction of exact observation states or typed values. Cases may
overlap, but their order has no authority: zero matches emit the declared
no-match disposition and multiple matches emit the distinct declared
multi-match disposition. For example, native `stopped_eos`, `stopped_limit`,
and `stopped_word` booleans can classify a completion reason directly; no
synthetic `stop_reason` field or generated dispatcher is needed.

An ontology bundle binds every concrete concept to exact JSON Schema bytes and
binds the runtime profile identity, limits, forbidden capabilities, and digest.
Validation rejects unresolved or duplicate authorities, inheritance or
execution cycles, partial classifications or result rules, ambiguous output
paths, incorrect primitive bindings, semantically miswired edges, orphan
nodes, and non-terminating paths. Only complete closure yields
`ONTOLOGY_AUTHORITY_CLOSED`; execution refuses an open ontology.

The projected body for an ontology remains a single invocation:

```javascript
export function normalize(value) {
  return runDeterministicOntology(normalizationOntology, value);
}
```

Schemas and reference documentation can be projected directly from the same
ontology bundle. DTO construction, branching, validation, failure selection,
translation, and serialization therefore remain contract data interpreted by
the bounded runtime rather than authored mechanics in that body.

## Bound semantic execution authority

A closed ontology bundle also carries execution bindings, an execution graph,
bound schema digests, proof requirements, and the runtime profile. None of that
is meaning. It is mechanical assembly, and assembling it by hand — in a builder
function, a fixture, or hand-written JSON — reintroduces stitching one layer
below the body.

`bound-semantic-execution-authority.v1` is therefore the authored subject, and
the bundle is projected from it. The declaration carries meaning only:

```text
authorityId, ontologyId, inputConceptId
semanticLayer  concepts, relations, properties, facts
ontology       classifications, constraints, translations, obligations,
               transformations, discriminated results
context        bound schema values and the executor port binding
```

`bound-semantic-execution-authority-projector.v1` derives the rest:

- one execution binding per semantic authority, from that authority's kind and
  its exactly admitted runtime primitive;
- one graph node per binding, and one graph edge per required executor input
  port, resolved through the same semantic-edge rules that validation enforces;
- the entry node, the serialized terminal, and the exact proof requirements;
- the SHA-256 digest of every bound schema; and
- the digest-bound runtime profile.

Derivation is total or it fails. If declared meaning does not resolve exactly
one source for an executor input, projection emits
`SEMANTIC_AUTHORITY_EDGE_UNRESOLVED` or `SEMANTIC_AUTHORITY_EDGE_AMBIGUOUS` and
refuses. Because the projector and the validator read one primitive vocabulary,
a projected bundle is closed by construction and is still independently proved
`ONTOLOGY_AUTHORITY_CLOSED`.

The contract therefore declares the executable semantic subject, the engine
projects one already-bound bundle, and the body only enters it:

```javascript
import { executeSemanticAuthority } from
  "contract-driven-artifact-governance-engine";
import normalizationOntology from
  "../contracts/project-message.authority.json" with { type: "json" };

export function projectMessage(value) {
  return executeSemanticAuthority(normalizationOntology, value);
}
```

The body composes nothing. It references one bound authority and forwards one
runtime value. Replacing the body language replaces only that binding; the
declared authority is unchanged.

## Commitment reconciliation

Projected content commitments remain independent contract authority. The same
projector therefore cannot silently redefine both the artifact and its only
acceptance digest.

`reconcile` projects candidate bytes in memory, calculates SHA-256 and byte
length, and returns the candidate contract plus an exact field diff. It does
not write artifacts or issue trust. `reconcile --write` atomically updates only
the two commitment fields. A replay must return zero diff.

This is `DERIVED_COMMITMENT_RECONCILIATION_REQUIRED`, not a recursive
fixed-point condition: the contract-derived Markdown projector excludes
commitment values from its projection input.

## Historical migration

The schema catalog maps each admitted digest to exact durable schema bytes.
The migration registry admits exact source-digest to target-digest edges and
binds each edge to a content-addressed migration authority. Every changed field
must be classified as preserved, transformed, introduced, or removed;
unclassified changes fail closed.

`migrate` historically validates the source, applies one admitted edge,
reconciles derived commitments in memory, validates the target, and returns a
candidate contract plus exact diff. `migrate --write` atomically replaces the
contract only. It never projects workspace artifacts or issues trust. Replaying
the operation on the migrated contract returns `MIGRATION_NOT_REQUIRED` with
zero diff.

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

The admitted projector registry contains seven data-driven projectors:

- `canonical-json-value-projector.v1` serializes JSON with sorted object keys,
  two-space indentation, UTF-8, and one final LF;
- `governed-artifact-contract-markdown-projector.v1` renders the structured
  contract authority as a deterministic architecture review document;
- `bound-semantic-execution-authority-projector.v1` derives the complete bound
  semantic execution bundle from declared meaning;
- `deterministic-ontology-schema-projector.v1` projects an exact schema bound
  to a concrete ontology concept;
- `deterministic-ontology-documentation-projector.v1` renders the closed
  ontology as deterministic reference documentation;
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
digest, operation, dependency, effect, runtime, and source authorities,
artifact authority IDs, projector IDs, projection modes, and content
commitments. A missing or altered ledger produces
`PROJECTION_IDENTITY_MISMATCH`.

`project --write` creates missing declared artifacts and replaces drifted
declared artifacts. It does not remove undeclared paths, exact exclusions, or
state outside the governed scope.

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

Reconcile independent projected-content commitments without writing artifacts:

```text
governed-artifacts reconcile \
  --contract architecture/artifact-family.contract.json

governed-artifacts reconcile \
  --contract architecture/artifact-family.contract.json \
  --write
```

Historically validate and migrate a contract without projecting artifacts:

```text
governed-artifacts migrate \
  --contract architecture/artifact-family.contract.json

governed-artifacts migrate \
  --contract architecture/artifact-family.contract.json \
  --write
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

Evaluate the current state without modifying governed artifacts, and optionally
persist its canonical receipt:

```text
governed-artifacts evaluate \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --write-receipt
```

Prove the current state without projecting or repairing it:

```text
governed-artifacts prove \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --write-receipt
```

`prove` is observational by default. `prove --write` is rejected with
`PROOF_SUBJECT_MUTATION_FORBIDDEN`; `--check` remains a read-only compatibility
alias. Recovery is an explicit two-step operation:

```text
governed-artifacts project \
  --contract architecture/artifact-family.contract.json \
  --workspace . \
  --write

governed-artifacts prove \
  --contract architecture/artifact-family.contract.json \
  --workspace .
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
`ARTIFACT_SCOPE_CLOSED`, `PROOF_COMPLETE`, `PROOF_SUBJECT_UNCHANGED`, read-only
proof mode, and `TRUSTED` in the same receipt. Claim evaluation re-observes the
workspace and rejects a supplied receipt that differs from the current
canonical evidence.

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

Each operation also accepts explicit `--schema`, `--conformance-profile`,
`--projector-registry`, `--verifier-registry`, `--migration-registry`, and
`--schema-catalog` paths. Their exact file digests must equal the admitted
identities in the contract or migration registry. When an artifact declares
`validThroughUtc`, use
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

- exact contract and interpretation-base digests;
- artifact-scope authority, resolved path set, observation digest, and
  disposition;
- every artifact observation;
- every observed source authority surface;
- missing and undeclared paths;
- ordered conformance checks;
- operation-authority identity and before/after proof-subject digests;
- fail-closed findings;
- declared claim policies and proof completeness;
- the terminal conformance disposition; and
- the terminal trust disposition.

The receipt contains no implicit clock field. Artifact families without a
freshness policy are byte-deterministic from admitted inputs and artifact
observations alone. When freshness is governed, the explicit observation time
is preserved in the receipt.
