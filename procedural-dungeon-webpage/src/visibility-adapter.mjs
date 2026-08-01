// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: reveal-only-unobstructed-cells
// responsibility-id: executes-visibility-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:d4d56de4d3c1078d9639893bf4efca84767bee5ebe736bb5d8f7f66ceb21d34b
// projection-authority-sha256: sha256:7c4b3ab7f515893d0e19bcc9e9d09ecfecb1dd2ffe05b80416ce7aba032733dc
// lineage-sha256: sha256:2fdb3222eeffce1ee2df5b63d60bbc2bf20a0bd567f61e2c4b0814610bd2d816
// body-sha256: sha256:b63fc571b2e21af34ab39c409534770028b2524f0c94745acfe6369f1aa3ffbf
// artifact-provenance-sha256: sha256:e4754009a564341bcc014f3c0df6ec26f81a602df37f16150a77a7afc6da099a
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonVisibilityBundle from "../contracts/dungeon-visibility.bundle.json" with { type: "json" };

export function resolveVisibility(request) {
  return executeSemanticAuthority(dungeonVisibilityBundle, request);
}
