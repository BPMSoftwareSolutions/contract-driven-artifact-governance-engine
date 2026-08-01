// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: rasterize-decided-topology-into-a-grid
// obligation-id: rasterize-topology-into-dense-grid
// responsibility-id: executes-rasterize-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:6684e8207945a9db806005508394064c0c43371448ba5f21d5184bfcca3a4a34
// projection-authority-sha256: sha256:776a241c92c4eb5d7dd1707a8513359c984b8b4effdf42964984f8555cee89f8
// lineage-sha256: sha256:536dbbecc6b2cb67aaf7db29d274f50c87937eb9bd4a41c6d2cd64d26da93ad5
// body-sha256: sha256:431fed1ec2ac1b8779e3fcfb49ab0559624b12fb660f43145387048651661e38
// artifact-provenance-sha256: sha256:e3710ab5c4d62328e6849e62c63724cbb4c5682fbf0eeed74e2eb6fcd444b41d
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRasterizeBundle from "../contracts/dungeon-rasterize.bundle.json" with { type: "json" };

export function resolveRasterization(request) {
  return executeSemanticAuthority(dungeonRasterizeBundle, request);
}
