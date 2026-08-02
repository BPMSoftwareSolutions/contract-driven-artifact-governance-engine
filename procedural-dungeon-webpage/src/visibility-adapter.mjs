// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: reveal-only-unobstructed-cells
// responsibility-id: executes-visibility-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:d4d56de4d3c1078d9639893bf4efca84767bee5ebe736bb5d8f7f66ceb21d34b
// projection-authority-sha256: sha256:2fc2f89e1ec5402d34ff86655f554b3e8add78a4bc6f6ba07086a86e8e927ad3
// lineage-sha256: sha256:802022b6bff2b8a6a51460340ad491411d5877c9892a7ffb9ae97108e768bd99
// body-sha256: sha256:b63fc571b2e21af34ab39c409534770028b2524f0c94745acfe6369f1aa3ffbf
// artifact-provenance-sha256: sha256:70c82a7393c7557658bb4ba49299f196bd9b292a89e345cbc9d59123d0081f72
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonVisibilityBundle from "../contracts/dungeon-visibility.bundle.json" with { type: "json" };

export function resolveVisibility(request) {
  return executeSemanticAuthority(dungeonVisibilityBundle, request);
}
