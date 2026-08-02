// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: advance-player-position-by-one-tile
// responsibility-id: executes-movement-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:48116ee982f7f80d19c34b59b7677ba26c55569608b530a0d1ebbaa6dafe2bc5
// projection-authority-sha256: sha256:1c04ce5626b45359c19c046645ee9c54e64a463634c0a26dc151de5941d16fbd
// lineage-sha256: sha256:61b728291e6e91f96982b141ce3af74d1d9a56a5fb3976d391a68d4b58a508f5
// body-sha256: sha256:3200c00be60a5851f7e3b0ab14fdbd97dd3b4704ea9c9e7676ef13af40675c73
// artifact-provenance-sha256: sha256:69fe272c055c789f609da99304c80a90a963ff83ae7d0f5374d86f797bff6283
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonMovementBundle from "../contracts/dungeon-movement.bundle.json" with { type: "json" };

export function resolveMovement(request) {
  return executeSemanticAuthority(dungeonMovementBundle, request);
}
