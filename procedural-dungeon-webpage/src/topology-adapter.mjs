// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: generate-a-connected-bsp-dungeon
// obligation-id: produce-only-connected-floor-regions
// responsibility-id: executes-topology-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:79acb5ef834e7945c6d67e1e94b85242020fcee00d3e861dc24cfff0229251a1
// projection-authority-sha256: sha256:4013303f8428a5f3900396898d8e173cc889c9417632373d7a0e1e271f813107
// lineage-sha256: sha256:e63a0502d1a6f700fab46d6365d1c16902a81dcf293ffa628a6b49740329c45b
// body-sha256: sha256:64102120ec4238b2aea7897a92d0c813bd91e9216bd917f8e9427cdc4030a295
// artifact-provenance-sha256: sha256:efa59efcb05f9ea0b6565e9f9aa6d0f697877d1fc73cad472c88251c9836d757
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonTopologyBundle from "../contracts/dungeon-topology.bundle.json" with { type: "json" };

export function resolveTopology(request) {
  return executeSemanticAuthority(dungeonTopologyBundle, request);
}
