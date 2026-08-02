// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: reveal-only-unobstructed-cells
// responsibility-id: executes-visibility-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:d4d56de4d3c1078d9639893bf4efca84767bee5ebe736bb5d8f7f66ceb21d34b
// projection-authority-sha256: sha256:4013303f8428a5f3900396898d8e173cc889c9417632373d7a0e1e271f813107
// lineage-sha256: sha256:ae0f04446601f0225cf62b365db41ad54eb33ea5fa24ecf6702affb2fc47ea8d
// body-sha256: sha256:b63fc571b2e21af34ab39c409534770028b2524f0c94745acfe6369f1aa3ffbf
// artifact-provenance-sha256: sha256:b62d0f5a0a15c78f0d2203169e1b22df8be7c60514a29a411ca440e013c684ae
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonVisibilityBundle from "../contracts/dungeon-visibility.bundle.json" with { type: "json" };

export function resolveVisibility(request) {
  return executeSemanticAuthority(dungeonVisibilityBundle, request);
}
