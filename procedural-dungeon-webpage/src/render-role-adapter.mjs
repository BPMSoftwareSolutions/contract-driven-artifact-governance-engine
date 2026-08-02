// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: resolve-cell-render-role-exactly
// responsibility-id: executes-render-role-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:c8eafff793891c964236ca693104c535a09dacddc76a1a419ec4079a6e1f4eb7
// projection-authority-sha256: sha256:1c04ce5626b45359c19c046645ee9c54e64a463634c0a26dc151de5941d16fbd
// lineage-sha256: sha256:2c8af752826a3956986e6a33c63502981fd19a3bb08045b63c4d365547a1eb51
// body-sha256: sha256:8ea600f5f34ce40c7eca17b3efd42e73cf8f098def91da29aa111fed21a00b98
// artifact-provenance-sha256: sha256:c35960553322ee0c56d2332c198d4a69cf7b19f38eb77784c5e9b69072a4e741
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRenderRoleBundle from "../contracts/dungeon-render-role.bundle.json" with { type: "json" };

export function resolveRenderRole(request) {
  return executeSemanticAuthority(dungeonRenderRoleBundle, request);
}
