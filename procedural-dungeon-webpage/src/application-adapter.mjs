// @generated
// project-id: procedural-dungeon-webpage
// feature-id: present-the-dungeon
// scenario-id: render-one-authorized-dungeon-frame
// obligation-id: apply-declared-canvas-operations-only
// responsibility-id: starts-browser-application-authority
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:506ef5c98881eba73a860dc2e18663a866c6acb7900ab0e1c8a8400584c15dc8
// projection-authority-sha256: sha256:4013303f8428a5f3900396898d8e173cc889c9417632373d7a0e1e271f813107
// lineage-sha256: sha256:3b49d599b57f84b1a0837667de534d34d7ca0b7b3922556a471314d3a9e5276b
// body-sha256: sha256:c2c608b246e16f544c7c4a9eeee85f98eb04bde59acf3e75f088120d2a4bce07
// artifact-provenance-sha256: sha256:ccb69f0c7c083035d99ba7dc3c22ca4f302f6c0d5d0663d5439a86d55c7f4ea7
//
import { executeBrowserApplication } from "../../lib/browser-application-runtime.mjs";
import applicationAuthority from "../contracts/procedural-dungeon-application.authority.json" with { type: "json" };
import browserContext from "../browser-context.json" with { type: "json" };
import keyboardCommandAuthority from "../contracts/dungeon-keyboard-command.bundle.json" with { type: "json" };
import movementAuthority from "../contracts/dungeon-movement.bundle.json" with { type: "json" };
import rasterizeAuthority from "../contracts/dungeon-rasterize.bundle.json" with { type: "json" };
import renderRoleAuthority from "../contracts/dungeon-render-role.bundle.json" with { type: "json" };
import topologyAuthority from "../contracts/dungeon-topology.bundle.json" with { type: "json" };
import visibilityAuthority from "../contracts/dungeon-visibility.bundle.json" with { type: "json" };

export function startsProceduralDungeonPage(browserContextPort) {
  return executeBrowserApplication(applicationAuthority, browserContext, browserContextPort, keyboardCommandAuthority, movementAuthority, rasterizeAuthority, renderRoleAuthority, topologyAuthority, visibilityAuthority);
}
