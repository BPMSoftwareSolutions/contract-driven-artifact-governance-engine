// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: generate-a-connected-bsp-dungeon
// obligation-id: produce-only-connected-floor-regions
// responsibility-id: executes-topology-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:79acb5ef834e7945c6d67e1e94b85242020fcee00d3e861dc24cfff0229251a1
// projection-authority-sha256: sha256:1c04ce5626b45359c19c046645ee9c54e64a463634c0a26dc151de5941d16fbd
// lineage-sha256: sha256:b2e52967291409ba6f5af2b8bce3254eab2e0d0e39bfa318fdaa3526b728c776
// body-sha256: sha256:64102120ec4238b2aea7897a92d0c813bd91e9216bd917f8e9427cdc4030a295
// artifact-provenance-sha256: sha256:7117072286e964c3fe78621b3c3c25770970d61e7db4507a1f48567293dd33a1
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonTopologyBundle from "../contracts/dungeon-topology.bundle.json" with { type: "json" };

export function resolveTopology(request) {
  return executeSemanticAuthority(dungeonTopologyBundle, request);
}
