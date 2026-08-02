// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: translate-only-admitted-keys
// responsibility-id: executes-keyboard-command-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:19740422c9f6c8e433d630c91445dafe997434b288572e4ec3ac3eac024dcfde
// projection-authority-sha256: sha256:1c04ce5626b45359c19c046645ee9c54e64a463634c0a26dc151de5941d16fbd
// lineage-sha256: sha256:a54a0f4f12eb59fac01ff25cfbc264419f853fdf887fe8bab45725bd1ff7596d
// body-sha256: sha256:05d74414e6f9ea2a86cbd04f1a3e6d7f3f68aa1e200660b0d2454ca5262303c9
// artifact-provenance-sha256: sha256:dbd8070fb3b3af05fa119886c33b103b48601157267c0bd3e6bc98e231e7ff75
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonKeyboardCommandBundle from "../contracts/dungeon-keyboard-command.bundle.json" with { type: "json" };

export function resolveKeyboardCommand(request) {
  return executeSemanticAuthority(dungeonKeyboardCommandBundle, request);
}
