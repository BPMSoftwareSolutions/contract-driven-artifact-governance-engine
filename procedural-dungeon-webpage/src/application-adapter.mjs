// @generated
// project-id: procedural-dungeon-webpage
// feature-id: present-the-dungeon
// scenario-id: render-one-authorized-dungeon-frame
// obligation-id: apply-declared-canvas-operations-only
// responsibility-id: starts-browser-application-authority
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:506ef5c98881eba73a860dc2e18663a866c6acb7900ab0e1c8a8400584c15dc8
// projection-authority-sha256: sha256:1c04ce5626b45359c19c046645ee9c54e64a463634c0a26dc151de5941d16fbd
// lineage-sha256: sha256:31e0a3a3dd4b397b688a229b1f7c60c72c1ab43dc83bcd7fc93bef4524c0f631
// body-sha256: sha256:c2c608b246e16f544c7c4a9eeee85f98eb04bde59acf3e75f088120d2a4bce07
// artifact-provenance-sha256: sha256:bfa43f18c096fc9ff8ce63752c1c600b4496ae9c4e4dfac916fed227951be623
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
