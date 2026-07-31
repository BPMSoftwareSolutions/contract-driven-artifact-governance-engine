# Using pi as an agent harness for this engine

[pi](https://pi.dev) (`@earendil-works/pi-coding-agent`) is a CLI coding
agent. This doc covers running it against Gemini Flash and pointing it at
this repository's `governed-artifacts` CLI — i.e. using pi as the
natural-language front end that invokes and interprets the engine, not as a
replacement for the engine's own trust decisions.

`pi` auto-loads `AGENTS.md` from the repo root, so once it's installed you
get the guardrails in that file for free (fail-closed dispositions, contract
is the sole mutation authority, `gate` is the only trust-conferring op).

## Install (Windows)

```powershell
powershell -c "irm https://pi.dev/install.ps1 | iex"
```

Read the script before piping it to `iex` on a machine you care about — it's
a normal thing to want to verify for any curl/irm-to-shell installer. It
needs Node.js >= 22.19.0; if your system Node is older, the installer offers
to fetch a standalone, checksum-verified Node into
`%LOCALAPPDATA%\pi-node`, isolated from your existing Node install. That's
also where `pi`, `pi.cmd`, and `pi.ps1` end up if you take that path.

If you go the standalone-Node route, put it on `PATH` (the installer does
this in normal interactive terminals; in a non-interactive shell you may
need to do it yourself once per session):

```powershell
$env:PATH = (Join-Path $env:LOCALAPPDATA "pi-node\current") + ";" + $env:PATH
```

```bash
export PATH="/c/Users/$USER/AppData/Local/pi-node/current:$PATH"
```

Verify: `pi --version`.

## API key

pi reads `GEMINI_API_KEY` natively for the `google` provider. If your key
lives in a differently-named variable (as it does here, `LOC_GEMINI_API_KEY`),
copy it into the name pi expects for the session:

```powershell
$env:GEMINI_API_KEY = $env:LOC_GEMINI_API_KEY
```

```bash
export GEMINI_API_KEY="$LOC_GEMINI_API_KEY"
```

Note: `GOOGLE_API_KEY` is an equally valid variable name and takes
precedence if both are set — pi will tell you which one it picked. Either
is fine as long as it holds the right value.

## Picking a Gemini Flash model

The static catalog only fills in once a key is present (it does a live
lookup), and can go stale — refresh it if a model you expect is missing:

```bash
pi update --models          # refresh model catalogs
pi --list-models flash      # list Gemini flash variants
```

As of this setup, `gemini-flash-latest` is the sensible default — it always
points at Google's current flash model rather than pinning a dated snapshot.
Use a dated one (`gemini-2.5-flash`, `gemini-3.5-flash`, etc.) if you want
reproducible behavior across pi upgrades instead.

## Basic invocation

```bash
pi --provider google --model gemini-flash-latest -p "<prompt>"
```

- `--provider google --model <id>` — selects the model. `--model
  google/<id>` also works without `--provider`.
- `-p` / `--print` — non-interactive: run once, print, exit. Drop it to get
  an interactive session in the current directory.
- Default tools are `read`, `bash`, `edit`, `write`. Restrict with
  `--tools <comma-list>` for read-only investigation
  (`--tools read,bash,grep,find,ls`), or exclude one with `--exclude-tools`.

## Driving the governance engine

The engine's own CLI (`bin/governed-artifacts.mjs`) already does the actual
governance work deterministically; pi's value here is translating a
plain-English ask into the right subcommand and explaining the JSON/report
output using this repo's disposition vocabulary (see `README.md`).

Example — validate a contract and have pi explain the result instead of you
parsing the disposition enum yourself:

```bash
pi --provider google --model gemini-flash-latest -p \
  "Run: node bin/governed-artifacts.mjs validate --contract examples/governed-message-artifact-family.contract.json
   Then explain the result in plain English: what happened, what the
   disposition means, and what command to run next to evaluate the
   workspace, not just the contract document."
```

Sample output from that exact prompt:

> Running the `validate` command checked
> `examples/governed-message-artifact-family.contract.json` against the
> engine's admitted contract schema without inspecting any files in the
> workspace. The `CONTRACT_VALID` disposition confirms that the contract
> document itself is well-formed and structurally compliant, satisfying the
> required gate before artifact checks can begin. Because contract
> validation operates in isolation, workspace conformance and trust
> dispositions remain unassessed (`NOT_EVALUATED`). To evaluate the
> workspace artifacts against the validated contract, you would run
> `node bin/governed-artifacts.mjs evaluate --contract ... --workspace .`
> (or `node bin/governed-artifacts.mjs gate --contract ...`).

That's correct — and it's the kind of thing worth spot-checking against
`README.md`'s "Contract validation gate" / "Artifact conformance gate"
sections the first few times, since an LLM explaining a fail-closed system
in prose is not itself a fail-closed system.

### Command reference

| Command | What it does | Trust-conferring? |
| --- | --- | --- |
| `validate --contract <path>` | Contract document vs. schema only | No |
| `plan --contract <path>` | Resolve the artifact plan from a valid contract | No |
| `observe --contract <path> --workspace <dir>` | Observe workspace state | No |
| `evaluate --contract <path> --workspace <dir>` | Full conformance evaluation | No |
| `project --contract <path> --workspace <dir> --write\|--check` | Materialize/verify projected bytes | No |
| `gate --contract <path> --workspace <dir>` | The full chain: contract → workspace → conformance → trust | **Yes** |
| `reconcile` / `migrate` | Contract-authoring helpers | No |
| `release-*` | Same shape, for the release boundary (`registries/`, `release/`) | `release-check` is |

Run `node bin/governed-artifacts.mjs --help` for the authoritative, current
list — this table can drift from it.

**Workspace scope matters.** `gate`/`evaluate` walk the whole `--workspace`
directory under closed-world rules — pointing it at the repo root will
surface every `.git/` object and `node_modules/` file as
`WORKSPACE_PATH_UNCLASSIFIED`. Point `--workspace` at the actual governed
subdirectory the contract declares, not the repo root, unless the contract
genuinely governs the whole tree.

## Guardrails when using pi here specifically

- Ask pi to run and interpret `governed-artifacts` output; don't ask it to
  hand-edit projected artifacts to "fix" a drift finding — the fix belongs
  in the contract, and projection regenerates the bytes
  (`project --write`). This is spelled out in `AGENTS.md` for pi itself to
  pick up, but worth remembering when writing prompts.
- Treat `gate`'s `TRUSTED` disposition as the only real trust signal.
  Everything else — including pi's own prose summary of a partial check —
  is `NOT_A_TRUST_GATE`.
- For anything beyond read-only explanation, review the diff before
  committing, same as with any other agent-authored change in this repo.
