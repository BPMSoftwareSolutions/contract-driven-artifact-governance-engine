# Agent instructions

This repository is the contract-driven artifact governance engine itself —
its own rules apply to how an agent should touch it. See `README.md` for the
full model; the summary an agent needs before acting:

- The **contract** (a JSON document under `examples/` or wherever the caller
  points `--contract`) is the only consumer-authored mutation authority.
  Generated/projected artifacts are consequences of a contract, not
  independent sources of truth. Don't hand-edit a projected artifact and
  consider the job done — the contract is what should change, and projection
  (`governed-artifacts project --write`) is what regenerates bytes from it.
- Projection has positive-path authority only: it creates or replaces
  declared paths, never deletes. Don't delete workspace paths to make a
  `WORKSPACE_PATH_UNCLASSIFIED` finding go away — either the contract needs
  to declare the path, or the path genuinely doesn't belong in a governed
  workspace directory (point `--workspace` at a narrower directory instead
  of the repo root, which also contains `.git/`, `node_modules/`, etc.).
- `governed-artifacts gate` is the only trust-conferring operation. Every
  other subcommand (`validate`, `plan`, `observe`, `evaluate`, `project`) is
  a partial check and is explicitly marked `NOT_A_TRUST_GATE` in its own
  output. Don't report a contract as trustworthy off the back of `validate`
  alone — that only checks the contract document against the schema, not the
  workspace.
- Six pinned inputs form the interpretation base (engine module, schema,
  conformance profile, projector registry, verifier registry, migration
  registry). If you change any of them, digests referenced elsewhere may go
  stale — check `registries/` and `schemas/` for what pins what before
  editing.
- Prefer read-only investigation (`read`, `grep`, `find`, `ls`, and running
  `governed-artifacts` subcommands via `bash`) when the task is "what does
  this contract/gate say." Reserve `edit`/`write` for tasks that explicitly
  ask for a contract change, and show a diff before treating it as done —
  this engine's whole point is that mutation authority is deliberate, not
  incidental.

## Useful commands

```bash
# Run the test suite
npm test

# Validate a contract document against the schema (no workspace check)
node bin/governed-artifacts.mjs validate --contract <path>

# Full trust gate: contract + workspace + conformance + trust, in one call
node bin/governed-artifacts.mjs gate --contract <path> --workspace <dir>

# Everything else (plan, observe, evaluate, project, reconcile, migrate,
# release-*) — see bin/governed-artifacts.mjs --help for the full list
```
