import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

/*
 * Exercise the projected browser-context authority through the collapsed
 * application adapter. The HTML owns only its empty root; required DOM and
 * event surfaces must be produced from browser-context.json.
 */

class ClassList {
  values = new Set();
  toggle(name, present) {
    present ? this.values.add(name) : this.values.delete(name);
  }
}

class Element {
  constructor(tagName, document) {
    this.tagName = tagName;
    this.document = document;
    this.attributes = {};
    this.children = [];
    this.classList = new ClassList();
    this.listeners = {};
    this.textContent = "";
    this.renderOperations = [];
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
    if (name === "id") this.document.elements.set(value, this);
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = children;
  }
  addEventListener(name, listener) {
    this.listeners[name] = listener;
  }
  getContext() {
    const element = this;
    return {
      set fillStyle(value) {
        this.currentFill = value;
      },
      fillRect(...rectangle) {
        element.renderOperations.push({ fill: this.currentFill, rectangle });
      }
    };
  }
}

class Document extends Element {
  constructor() {
    super("document", undefined);
    this.document = this;
    this.elements = new Map();
    this.head = new Element("head", this);
    const root = new Element("main", this);
    root.setAttribute("id", "dungeon-application");
    this.root = root;
  }
  createElement(tagName) {
    return new Element(tagName, this);
  }
  getElementById(id) {
    return this.elements.get(id);
  }
}

const appDir = path.resolve(process.argv[2] ?? process.cwd());
const html = readFileSync(path.join(appDir, "index.html"), "utf8");
assert.match(html, /<main id="dungeon-application" class="app"><\/main>/);

const context = JSON.parse(
  readFileSync(path.join(appDir, "browser-context.json"), "utf8")
);
const application = await import(
  pathToFileURL(path.join(appDir, "src", "application-adapter.mjs"))
);
const document = new Document();
const scope = application.startsProceduralDungeonPage({ document });

const viewport = document.getElementById(context.effectBindings.viewport.elementId);
assert.equal(viewport.tagName, "canvas", "context must project the canvas");
assert.equal(viewport.attributes.width, String(context.canvasProfile.widthPx));
assert.equal(viewport.attributes.height, String(context.canvasProfile.heightPx));
assert.ok(document.getElementById(context.effectBindings.coordinates.elementId));
assert.ok(document.getElementById(context.effectBindings.regenerateControl.elementId));
assert.ok(document.getElementById(context.effectBindings.godModeControl.elementId));
assert.equal(document.root.children.length, context.documentProjection.children.length);
assert.equal(typeof document.listeners.keydown, "function", "context must bind keyboard input");
assert.equal(
  typeof document.getElementById("regenerateBtn").listeners.click,
  "function",
  "context must bind regeneration"
);
assert.equal(
  typeof document.getElementById("godModeBtn").listeners.click,
  "function",
  "context must bind God Mode"
);
assert.equal(scope.state.map.length, 78, "initial workflow must project the padded map");
assert.equal(scope.state.visibility.length, 78, "initial workflow must reset visibility");
assert.ok(viewport.renderOperations.length > 1, "initial workflow must render a frame");
assert.equal(
  viewport.renderOperations[0].fill,
  context.renderingProjection.palette.background,
  "the frame must begin with the context-declared canvas background"
);

const godModeControl = document.getElementById("godModeBtn");
const operationsBeforeGodMode = viewport.renderOperations.length;
godModeControl.listeners.click({});
assert.equal(scope.state.godMode, 1, "God Mode workflow must toggle declared state");
assert.equal(godModeControl.classList.values.has("active"), true);
assert.equal(
  viewport.renderOperations.length - operationsBeforeGodMode,
  3602,
  "God Mode must project background + every tile + player"
);

const movementCandidates = [
  { dx: 0, dy: -1, key: "ArrowUp" },
  { dx: 0, dy: 1, key: "ArrowDown" },
  { dx: -1, dy: 0, key: "ArrowLeft" },
  { dx: 1, dy: 0, key: "ArrowRight" }
];
const admittedMove = movementCandidates.find(
  ({ dx, dy }) =>
    scope.state.map[scope.state.player.y + dy][scope.state.player.x + dx] === 0
);
assert.ok(admittedMove, "generated spawn must have an adjacent floor tile");
const positionBeforeMove = { ...scope.state.player };
let defaultPrevented = false;
document.listeners.keydown({
  key: admittedMove.key,
  preventDefault() {
    defaultPrevented = true;
  }
});
assert.equal(defaultPrevented, true, "admitted keyboard command must be consumed");
assert.deepEqual(scope.state.player, {
  x: positionBeforeMove.x + admittedMove.dx,
  y: positionBeforeMove.y + admittedMove.dy
});

process.stdout.write("DOM_STRUCTURE_CONFORMS\n");
