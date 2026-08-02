// @generated
// project-id: procedural-dungeon-webpage
// feature-id: present-the-dungeon
// scenario-id: render-one-authorized-dungeon-frame
// obligation-id: apply-declared-canvas-operations-only
// responsibility-id: starts-browser-application-authority
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:506ef5c98881eba73a860dc2e18663a866c6acb7900ab0e1c8a8400584c15dc8
// projection-authority-sha256: sha256:2fc2f89e1ec5402d34ff86655f554b3e8add78a4bc6f6ba07086a86e8e927ad3
// lineage-sha256: sha256:a6efc31b967f93afe134383e2819e069dfe85dd7cf62eb5618c04d121423d9f3
// body-sha256: sha256:c2c608b246e16f544c7c4a9eeee85f98eb04bde59acf3e75f088120d2a4bce07
// artifact-provenance-sha256: sha256:7f953d5b480babef6e1e92368e1e26cc6bb2535b666c9eb38cc1a09d52c84a65
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
