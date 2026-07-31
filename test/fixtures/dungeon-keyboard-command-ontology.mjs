import { readFileSync } from "node:fs";
import { projectBoundSemanticExecutionBundle } from "../../lib/governed-artifact-engine.mjs";

const declaration = JSON.parse(
  readFileSync(
    new URL(
      "../../examples/dungeon-keyboard-command.authority.json",
      import.meta.url
    ),
    "utf8"
  )
);

export function makeDungeonKeyboardCommandSemanticAuthority() {
  return structuredClone(declaration);
}

export function makeDungeonKeyboardCommandOntologyBundle() {
  return projectBoundSemanticExecutionBundle(
    makeDungeonKeyboardCommandSemanticAuthority()
  );
}
