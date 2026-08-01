// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: translate-only-admitted-keys
// responsibility-id: executes-keyboard-command-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:19740422c9f6c8e433d630c91445dafe997434b288572e4ec3ac3eac024dcfde
// projection-authority-sha256: sha256:7c4b3ab7f515893d0e19bcc9e9d09ecfecb1dd2ffe05b80416ce7aba032733dc
// lineage-sha256: sha256:6d32484506f130dbd59c83b7af1d053ac11bf0a623544ca7d559e30eb5a1ed49
// body-sha256: sha256:05d74414e6f9ea2a86cbd04f1a3e6d7f3f68aa1e200660b0d2454ca5262303c9
// artifact-provenance-sha256: sha256:ded304d346bd92c68f8658ffd7b40b77fb14a3f79f4e5aa93f0a225148b57157
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonKeyboardCommandBundle from "../contracts/dungeon-keyboard-command.bundle.json" with { type: "json" };

export function resolveKeyboardCommand(request) {
  return executeSemanticAuthority(dungeonKeyboardCommandBundle, request);
}
