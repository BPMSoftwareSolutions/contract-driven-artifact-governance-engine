// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: advance-player-position-by-one-tile
// responsibility-id: executes-movement-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:48116ee982f7f80d19c34b59b7677ba26c55569608b530a0d1ebbaa6dafe2bc5
// projection-authority-sha256: sha256:4013303f8428a5f3900396898d8e173cc889c9417632373d7a0e1e271f813107
// lineage-sha256: sha256:329c863b5535773dd9ee5ecb5643942ff26d32a5212ec4936d5f1acd032b0aa4
// body-sha256: sha256:3200c00be60a5851f7e3b0ab14fdbd97dd3b4704ea9c9e7676ef13af40675c73
// artifact-provenance-sha256: sha256:0740a8914ed65770fb3921b73556e8a03a4284bd8edad94ab7e4e014a03b44db
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonMovementBundle from "../contracts/dungeon-movement.bundle.json" with { type: "json" };

export function resolveMovement(request) {
  return executeSemanticAuthority(dungeonMovementBundle, request);
}
