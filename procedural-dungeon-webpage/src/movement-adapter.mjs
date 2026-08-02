// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: advance-player-position-by-one-tile
// responsibility-id: executes-movement-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:48116ee982f7f80d19c34b59b7677ba26c55569608b530a0d1ebbaa6dafe2bc5
// projection-authority-sha256: sha256:2fc2f89e1ec5402d34ff86655f554b3e8add78a4bc6f6ba07086a86e8e927ad3
// lineage-sha256: sha256:063ab6c81c65359204fa77338e79b0432bc32c64b526cd733880b3c6d7c202ae
// body-sha256: sha256:3200c00be60a5851f7e3b0ab14fdbd97dd3b4704ea9c9e7676ef13af40675c73
// artifact-provenance-sha256: sha256:ff4b73c734144c6155a094952db3634bf86a6eae327a2764a5e3c494e1b60b34
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonMovementBundle from "../contracts/dungeon-movement.bundle.json" with { type: "json" };

export function resolveMovement(request) {
  return executeSemanticAuthority(dungeonMovementBundle, request);
}
