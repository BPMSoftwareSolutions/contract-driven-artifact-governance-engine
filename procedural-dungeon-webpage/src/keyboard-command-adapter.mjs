// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: translate-only-admitted-keys
// responsibility-id: executes-keyboard-command-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:19740422c9f6c8e433d630c91445dafe997434b288572e4ec3ac3eac024dcfde
// projection-authority-sha256: sha256:4013303f8428a5f3900396898d8e173cc889c9417632373d7a0e1e271f813107
// lineage-sha256: sha256:d59c32afff0c05177cf74a4b095d12542c020844eea66feaaa4f5819b2311eb0
// body-sha256: sha256:05d74414e6f9ea2a86cbd04f1a3e6d7f3f68aa1e200660b0d2454ca5262303c9
// artifact-provenance-sha256: sha256:ce2c9f80ec75cb92552f15c1507bbadf8614bbf32d4d86663299f216883c92ea
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonKeyboardCommandBundle from "../contracts/dungeon-keyboard-command.bundle.json" with { type: "json" };

export function resolveKeyboardCommand(request) {
  return executeSemanticAuthority(dungeonKeyboardCommandBundle, request);
}
