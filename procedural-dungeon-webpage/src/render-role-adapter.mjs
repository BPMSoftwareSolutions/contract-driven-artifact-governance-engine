// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: resolve-cell-render-role-exactly
// responsibility-id: executes-render-role-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:c8eafff793891c964236ca693104c535a09dacddc76a1a419ec4079a6e1f4eb7
// projection-authority-sha256: sha256:2fc2f89e1ec5402d34ff86655f554b3e8add78a4bc6f6ba07086a86e8e927ad3
// lineage-sha256: sha256:56adbd16854141f37e64600617029a1d5ba36c7d605646048911d976a1eb04c8
// body-sha256: sha256:8ea600f5f34ce40c7eca17b3efd42e73cf8f098def91da29aa111fed21a00b98
// artifact-provenance-sha256: sha256:3a032c785194137c49b936ee410733656b292a59b6bca18c6a21c84f5783d46d
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRenderRoleBundle from "../contracts/dungeon-render-role.bundle.json" with { type: "json" };

export function resolveRenderRole(request) {
  return executeSemanticAuthority(dungeonRenderRoleBundle, request);
}
