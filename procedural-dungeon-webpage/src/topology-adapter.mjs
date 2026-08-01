// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: generate-a-connected-bsp-dungeon
// obligation-id: produce-only-connected-floor-regions
// responsibility-id: executes-topology-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:79acb5ef834e7945c6d67e1e94b85242020fcee00d3e861dc24cfff0229251a1
// projection-authority-sha256: sha256:776a241c92c4eb5d7dd1707a8513359c984b8b4effdf42964984f8555cee89f8
// lineage-sha256: sha256:4ca3150ba4a4ef82990fadc5d60653258b32f97219f6336a3549c70e8a85db2a
// body-sha256: sha256:64102120ec4238b2aea7897a92d0c813bd91e9216bd917f8e9427cdc4030a295
// artifact-provenance-sha256: sha256:3ec5b10ae587a158dd65a73d774184a36fea155ee43b1cd34c11a560ab7112f3
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonTopologyBundle from "../contracts/dungeon-topology.bundle.json" with { type: "json" };

export function resolveTopology(request) {
  return executeSemanticAuthority(dungeonTopologyBundle, request);
}
