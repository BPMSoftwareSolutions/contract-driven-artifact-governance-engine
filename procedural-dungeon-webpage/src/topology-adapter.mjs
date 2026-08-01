// @generated
// project-id: procedural-dungeon-webpage
// feature-id: generate-connected-dungeon
// scenario-id: generate-a-connected-bsp-dungeon
// obligation-id: produce-only-connected-floor-regions
// responsibility-id: executes-topology-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:79acb5ef834e7945c6d67e1e94b85242020fcee00d3e861dc24cfff0229251a1
// projection-authority-sha256: sha256:7c4b3ab7f515893d0e19bcc9e9d09ecfecb1dd2ffe05b80416ce7aba032733dc
// lineage-sha256: sha256:047802a17155185f4abaf5f9e346b58676ead27f4892aafd49763c867f5122b1
// body-sha256: sha256:64102120ec4238b2aea7897a92d0c813bd91e9216bd917f8e9427cdc4030a295
// artifact-provenance-sha256: sha256:9c60dfc982c0b8557a4cea40f024b466ed2623769ff60b614753f05702aa8913
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonTopologyBundle from "../contracts/dungeon-topology.bundle.json" with { type: "json" };

export function resolveTopology(request) {
  return executeSemanticAuthority(dungeonTopologyBundle, request);
}
