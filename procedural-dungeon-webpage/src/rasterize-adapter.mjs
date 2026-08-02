// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: rasterize-decided-topology-into-a-grid
// obligation-id: rasterize-topology-into-dense-grid
// responsibility-id: executes-rasterize-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:6684e8207945a9db806005508394064c0c43371448ba5f21d5184bfcca3a4a34
// projection-authority-sha256: sha256:1c04ce5626b45359c19c046645ee9c54e64a463634c0a26dc151de5941d16fbd
// lineage-sha256: sha256:f0e70afed9212ac41e12bac62c6347c7ac9a582cccac3b5f0b65e9d4a81dd7a6
// body-sha256: sha256:431fed1ec2ac1b8779e3fcfb49ab0559624b12fb660f43145387048651661e38
// artifact-provenance-sha256: sha256:a028fae831e0414d9172c045ee8207b28076cef0c3ca00ca1dd30d1e8959efae
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRasterizeBundle from "../contracts/dungeon-rasterize.bundle.json" with { type: "json" };

export function resolveRasterization(request) {
  return executeSemanticAuthority(dungeonRasterizeBundle, request);
}
