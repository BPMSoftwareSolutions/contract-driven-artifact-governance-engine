// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: resolve-cell-render-role-exactly
// responsibility-id: executes-render-role-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:c8eafff793891c964236ca693104c535a09dacddc76a1a419ec4079a6e1f4eb7
// projection-authority-sha256: sha256:776a241c92c4eb5d7dd1707a8513359c984b8b4effdf42964984f8555cee89f8
// lineage-sha256: sha256:c58f608da29e638f9490a0d1b3526f32532fd4b4a314ab9f3b23fdd98a5c2188
// body-sha256: sha256:8ea600f5f34ce40c7eca17b3efd42e73cf8f098def91da29aa111fed21a00b98
// artifact-provenance-sha256: sha256:6802280eca82a0fc795260bb05bd36c7bace999bf8380502311d7ce12f028efc
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRenderRoleBundle from "../contracts/dungeon-render-role.bundle.json" with { type: "json" };

export function resolveRenderRole(request) {
  return executeSemanticAuthority(dungeonRenderRoleBundle, request);
}
