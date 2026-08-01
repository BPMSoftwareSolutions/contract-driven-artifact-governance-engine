// @generated
// project-id: procedural-dungeon-webpage
// feature-id: calculate-visibility
// scenario-id: stop-a-visibility-ray-at-a-wall
// obligation-id: resolve-cell-render-role-exactly
// responsibility-id: executes-render-role-resolution
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:c8eafff793891c964236ca693104c535a09dacddc76a1a419ec4079a6e1f4eb7
// projection-authority-sha256: sha256:7c4b3ab7f515893d0e19bcc9e9d09ecfecb1dd2ffe05b80416ce7aba032733dc
// lineage-sha256: sha256:332c04031623b42cadb61e5de3c8bf802fb62ff5bc90dc2b33e2a4faa7052e65
// body-sha256: sha256:8ea600f5f34ce40c7eca17b3efd42e73cf8f098def91da29aa111fed21a00b98
// artifact-provenance-sha256: sha256:dec1061d120756e4aa1829abfee54f0837e305e3a95846108ec2c776e7d97562
//
import { executeSemanticAuthority } from "contract-driven-artifact-governance-engine";
import dungeonRenderRoleBundle from "../contracts/dungeon-render-role.bundle.json" with { type: "json" };

export function resolveRenderRole(request) {
  return executeSemanticAuthority(dungeonRenderRoleBundle, request);
}
