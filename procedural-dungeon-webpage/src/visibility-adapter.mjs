// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: reveal-only-unobstructed-cells
// responsibility-id: executes-visibility-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:d4d56de4d3c1078d9639893bf4efca84767bee5ebe736bb5d8f7f66ceb21d34b
// projection-authority-sha256: sha256:1c04ce5626b45359c19c046645ee9c54e64a463634c0a26dc151de5941d16fbd
// lineage-sha256: sha256:0188ab0f21c3f64e505f0abf414411e839716e4ba27abf165b05d19280dc207c
// body-sha256: sha256:b63fc571b2e21af34ab39c409534770028b2524f0c94745acfe6369f1aa3ffbf
// artifact-provenance-sha256: sha256:a259d17504e1087b2e1d31c56f075b35194e50b023ce2674b1a12f80a1bd9cb2
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonVisibilityBundle from "../contracts/dungeon-visibility.bundle.json" with { type: "json" };

export function resolveVisibility(request) {
  return executeSemanticAuthority(dungeonVisibilityBundle, request);
}
