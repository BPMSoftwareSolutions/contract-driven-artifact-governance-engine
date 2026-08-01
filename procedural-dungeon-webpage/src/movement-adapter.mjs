// @generated
// project-id: procedural-dungeon-webpage
// feature-id: move-the-player
// scenario-id: move-onto-adjacent-floor-tile
// obligation-id: advance-player-position-by-one-tile
// responsibility-id: executes-movement-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:48116ee982f7f80d19c34b59b7677ba26c55569608b530a0d1ebbaa6dafe2bc5
// projection-authority-sha256: sha256:7c4b3ab7f515893d0e19bcc9e9d09ecfecb1dd2ffe05b80416ce7aba032733dc
// lineage-sha256: sha256:8d6c95f56af93d33e8761cd6846d429192a39436872fb10220e90cf84219372f
// body-sha256: sha256:3200c00be60a5851f7e3b0ab14fdbd97dd3b4704ea9c9e7676ef13af40675c73
// artifact-provenance-sha256: sha256:a152bdb6477834f84392387f96e861cfbaaccfd9f57d7a3e9a2b2aca94a0d6a0
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonMovementBundle from "../contracts/dungeon-movement.bundle.json" with { type: "json" };

export function resolveMovement(request) {
  return executeSemanticAuthority(dungeonMovementBundle, request);
}
