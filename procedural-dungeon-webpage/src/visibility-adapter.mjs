// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: reveal-only-unobstructed-cells
// responsibility-id: executes-visibility-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:d4d56de4d3c1078d9639893bf4efca84767bee5ebe736bb5d8f7f66ceb21d34b
// projection-authority-sha256: sha256:776a241c92c4eb5d7dd1707a8513359c984b8b4effdf42964984f8555cee89f8
// lineage-sha256: sha256:33f9f5f5944edc195748ec28d6b88b766e976e43177107a0163b6e79f60889d0
// body-sha256: sha256:b63fc571b2e21af34ab39c409534770028b2524f0c94745acfe6369f1aa3ffbf
// artifact-provenance-sha256: sha256:4384c31ce890bb6feaf1677a12f45e0951eab51855c73ce5d63b6987fe0a5be4
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonVisibilityBundle from "../contracts/dungeon-visibility.bundle.json" with { type: "json" };

export function resolveVisibility(request) {
  return executeSemanticAuthority(dungeonVisibilityBundle, request);
}
