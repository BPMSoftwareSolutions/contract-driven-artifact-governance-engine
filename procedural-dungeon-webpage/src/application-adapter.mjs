// @generated
// project-id: procedural-dungeon-webpage
// feature-id: present-the-dungeon
// scenario-id: render-one-authorized-dungeon-frame
// obligation-id: apply-declared-canvas-operations-only
// responsibility-id: starts-browser-application-authority
// projection-profile-id: javascript-semantic-execution-body.v1
// semantic-authority-sha256: sha256:506ef5c98881eba73a860dc2e18663a866c6acb7900ab0e1c8a8400584c15dc8
// projection-authority-sha256: sha256:776a241c92c4eb5d7dd1707a8513359c984b8b4effdf42964984f8555cee89f8
// lineage-sha256: sha256:88c2a2cbbbdac213e15b0d837fc8325b69e5c7d1a737d4fcfcf9de130cece5eb
// body-sha256: sha256:c2c608b246e16f544c7c4a9eeee85f98eb04bde59acf3e75f088120d2a4bce07
// artifact-provenance-sha256: sha256:cf1ee486b8ec4d56bdf433fbba1af0cabeddf8a02e31dd2823a6b9cfbfc26842
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
