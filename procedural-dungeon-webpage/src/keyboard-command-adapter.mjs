// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: translate-only-admitted-keys
// responsibility-id: executes-keyboard-command-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:19740422c9f6c8e433d630c91445dafe997434b288572e4ec3ac3eac024dcfde
// projection-authority-sha256: sha256:2fc2f89e1ec5402d34ff86655f554b3e8add78a4bc6f6ba07086a86e8e927ad3
// lineage-sha256: sha256:a6c40bd5f087a09c0590e7721c090dd961beaf8c2e762f716e8716209d7cce81
// body-sha256: sha256:05d74414e6f9ea2a86cbd04f1a3e6d7f3f68aa1e200660b0d2454ca5262303c9
// artifact-provenance-sha256: sha256:20624aaf33fdd809470bbd3e31a9714df214a03259644438a2829e3634ea0145
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonKeyboardCommandBundle from "../contracts/dungeon-keyboard-command.bundle.json" with { type: "json" };

export function resolveKeyboardCommand(request) {
  return executeSemanticAuthority(dungeonKeyboardCommandBundle, request);
}
