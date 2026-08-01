// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: rasterize-decided-topology-into-a-grid
// obligation-id: rasterize-topology-into-dense-grid
// responsibility-id: executes-rasterize-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:6684e8207945a9db806005508394064c0c43371448ba5f21d5184bfcca3a4a34
// projection-authority-sha256: sha256:7c4b3ab7f515893d0e19bcc9e9d09ecfecb1dd2ffe05b80416ce7aba032733dc
// lineage-sha256: sha256:8deae817a342cb1cb958738efb5f0bf4019c92e6fe2b16582af46c3d6801d8a3
// body-sha256: sha256:431fed1ec2ac1b8779e3fcfb49ab0559624b12fb660f43145387048651661e38
// artifact-provenance-sha256: sha256:1e334886d2575dbc5459bb92efb4950dcda5464ecc12e4f12e8e55757f825116
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRasterizeBundle from "../contracts/dungeon-rasterize.bundle.json" with { type: "json" };

export function resolveRasterization(request) {
  return executeSemanticAuthority(dungeonRasterizeBundle, request);
}
