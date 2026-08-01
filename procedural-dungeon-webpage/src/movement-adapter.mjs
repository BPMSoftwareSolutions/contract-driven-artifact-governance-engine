// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: advance-player-position-by-one-tile
// responsibility-id: executes-movement-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:48116ee982f7f80d19c34b59b7677ba26c55569608b530a0d1ebbaa6dafe2bc5
// projection-authority-sha256: sha256:776a241c92c4eb5d7dd1707a8513359c984b8b4effdf42964984f8555cee89f8
// lineage-sha256: sha256:3e79777c83cc5f57db79d042037a363c6d826b9f9ac4ebeb93af1bb185f9c5a9
// body-sha256: sha256:3200c00be60a5851f7e3b0ab14fdbd97dd3b4704ea9c9e7676ef13af40675c73
// artifact-provenance-sha256: sha256:f70657fd76ed16a19f4792d79a0673361094f1849a038ac52c32b604ffcde019
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonMovementBundle from "../contracts/dungeon-movement.bundle.json" with { type: "json" };

export function resolveMovement(request) {
  return executeSemanticAuthority(dungeonMovementBundle, request);
}
