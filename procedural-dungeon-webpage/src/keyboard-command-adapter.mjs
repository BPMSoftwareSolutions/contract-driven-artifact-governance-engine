// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: translate-only-admitted-keys
// responsibility-id: executes-keyboard-command-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:19740422c9f6c8e433d630c91445dafe997434b288572e4ec3ac3eac024dcfde
// projection-authority-sha256: sha256:776a241c92c4eb5d7dd1707a8513359c984b8b4effdf42964984f8555cee89f8
// lineage-sha256: sha256:28073292396bce621dbf5bde47205d0c6b1d3fc84c87f31df1c9b6458c75516c
// body-sha256: sha256:05d74414e6f9ea2a86cbd04f1a3e6d7f3f68aa1e200660b0d2454ca5262303c9
// artifact-provenance-sha256: sha256:d25ce2fc4ff44a9dc101ea43d02dea2514bb76543adab4bdc550f82b4245cd14
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonKeyboardCommandBundle from "../contracts/dungeon-keyboard-command.bundle.json" with { type: "json" };

export function resolveKeyboardCommand(request) {
  return executeSemanticAuthority(dungeonKeyboardCommandBundle, request);
}
