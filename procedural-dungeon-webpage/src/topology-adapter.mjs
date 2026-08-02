// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: generate-a-connected-bsp-dungeon
// obligation-id: produce-only-connected-floor-regions
// responsibility-id: executes-topology-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:79acb5ef834e7945c6d67e1e94b85242020fcee00d3e861dc24cfff0229251a1
// projection-authority-sha256: sha256:2fc2f89e1ec5402d34ff86655f554b3e8add78a4bc6f6ba07086a86e8e927ad3
// lineage-sha256: sha256:d09347bc7e24b245bd9183293c35f5be4bf65cc3c8d86b71be850b00de4f4497
// body-sha256: sha256:64102120ec4238b2aea7897a92d0c813bd91e9216bd917f8e9427cdc4030a295
// artifact-provenance-sha256: sha256:2e4d5926e3a446bd415c430cc98659530af73373af443905805e88264367bc95
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonTopologyBundle from "../contracts/dungeon-topology.bundle.json" with { type: "json" };

export function resolveTopology(request) {
  return executeSemanticAuthority(dungeonTopologyBundle, request);
}
