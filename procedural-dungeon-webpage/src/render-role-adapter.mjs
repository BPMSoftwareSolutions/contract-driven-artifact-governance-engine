// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: resolve-cell-render-role-exactly
// responsibility-id: executes-render-role-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:c8eafff793891c964236ca693104c535a09dacddc76a1a419ec4079a6e1f4eb7
// projection-authority-sha256: sha256:4013303f8428a5f3900396898d8e173cc889c9417632373d7a0e1e271f813107
// lineage-sha256: sha256:295d1967b64a820df123e2535f69d47a30e2ef4d09991642513a777a2618c7ad
// body-sha256: sha256:8ea600f5f34ce40c7eca17b3efd42e73cf8f098def91da29aa111fed21a00b98
// artifact-provenance-sha256: sha256:4ad5fc2bcb2faeed7f12245c99f7f9b85c21af7214c1705b6e3c267836e3862b
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRenderRoleBundle from "../contracts/dungeon-render-role.bundle.json" with { type: "json" };

export function resolveRenderRole(request) {
  return executeSemanticAuthority(dungeonRenderRoleBundle, request);
}
