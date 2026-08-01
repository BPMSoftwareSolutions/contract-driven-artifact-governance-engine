// @generated
// project-id: procedural-dungeon-webpage
// feature-id: present-the-dungeon
// scenario-id: render-one-authorized-dungeon-frame
// obligation-id: apply-declared-canvas-operations-only
// responsibility-id: starts-browser-application-authority
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:506ef5c98881eba73a860dc2e18663a866c6acb7900ab0e1c8a8400584c15dc8
// projection-authority-sha256: sha256:7c4b3ab7f515893d0e19bcc9e9d09ecfecb1dd2ffe05b80416ce7aba032733dc
// lineage-sha256: sha256:d1e7661b9bbe1c15dcb6119ea1f9e07dbf08e36139b926c657f475ef4f4c21a1
// body-sha256: sha256:c2c608b246e16f544c7c4a9eeee85f98eb04bde59acf3e75f088120d2a4bce07
// artifact-provenance-sha256: sha256:872e1e860a2e3d739c61dbd4098d86627b503acb76c9f85ab747eee449a98f72
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
