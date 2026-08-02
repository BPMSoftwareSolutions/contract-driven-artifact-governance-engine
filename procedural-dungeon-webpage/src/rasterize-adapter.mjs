// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: rasterize-decided-topology-into-a-grid
// obligation-id: rasterize-topology-into-dense-grid
// responsibility-id: executes-rasterize-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:6684e8207945a9db806005508394064c0c43371448ba5f21d5184bfcca3a4a34
// projection-authority-sha256: sha256:2fc2f89e1ec5402d34ff86655f554b3e8add78a4bc6f6ba07086a86e8e927ad3
// lineage-sha256: sha256:72356dea9fd59bc245c8276115f5138bb3a0dc74fcd7e4f30caf9b21629fa391
// body-sha256: sha256:431fed1ec2ac1b8779e3fcfb49ab0559624b12fb660f43145387048651661e38
// artifact-provenance-sha256: sha256:3a0b8fb9620e915b6881ec646edabdeff29980435838e34f77d26790c8046f9b
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRasterizeBundle from "../contracts/dungeon-rasterize.bundle.json" with { type: "json" };

export function resolveRasterization(request) {
  return executeSemanticAuthority(dungeonRasterizeBundle, request);
}
