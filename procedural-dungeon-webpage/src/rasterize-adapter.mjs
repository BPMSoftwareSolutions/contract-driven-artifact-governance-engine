// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: rasterize-decided-topology-into-a-grid
// obligation-id: rasterize-topology-into-dense-grid
// responsibility-id: executes-rasterize-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:6684e8207945a9db806005508394064c0c43371448ba5f21d5184bfcca3a4a34
// projection-authority-sha256: sha256:4013303f8428a5f3900396898d8e173cc889c9417632373d7a0e1e271f813107
// lineage-sha256: sha256:6ba6debb7d3844ef6a2ce422eb8ecd596f644c2342a9ad5c13b00e4dbcf7eed5
// body-sha256: sha256:431fed1ec2ac1b8779e3fcfb49ab0559624b12fb660f43145387048651661e38
// artifact-provenance-sha256: sha256:2b0fe63d8ab258fd1fb654f2dc8995246764f374ee39dbd9aafc7227f299f639
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRasterizeBundle from "../contracts/dungeon-rasterize.bundle.json" with { type: "json" };

export function resolveRasterization(request) {
  return executeSemanticAuthority(dungeonRasterizeBundle, request);
}
