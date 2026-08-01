/*
 * Generic browser application executor.
 *
 * Capability bodies are deliberately collapsed to one direct invocation.
 * This trusted host interprets a governed browser-context authority: the
 * context owns document structure, presentation, state, workflows, ontology
 * selection, event bindings, projections, and effect bindings. Mechanics in
 * this module therefore interpret declared data and do not author dungeon
 * meaning.
 */

import { executeBrowserSemanticAuthority } from "./browser-semantic-runtime.mjs";

function readPath(source, path) {
  let value = source;
  for (const segment of path.split(".")) {
    value = value?.[segment];
  }
  return value;
}

function readSegments(source, path) {
  return path.reduce((value, segment) => value?.[segment], source);
}

function executeApplicationProjection(authority, browserPort) {
  if (!browserPort || typeof browserPort.document !== "object") {
    throw new Error(authority.failure.message);
  }
  return Object.fromEntries(
    authority.projection.fields.map((field) => [
      field.outputField,
      readSegments(browserPort, field.sourcePath)
    ])
  );
}

function writePath(scope, path, value) {
  const segments = path.split(".");
  let target = scope;
  for (const segment of segments.slice(0, -1)) {
    target = target[segment];
  }
  target[segments.at(-1)] = value;
}

function evaluate(expression, scope) {
  if (
    expression === null ||
    typeof expression !== "object" ||
    Array.isArray(expression)
  ) {
    return expression;
  }
  if ("$ref" in expression) {
    return readPath(scope, expression.$ref);
  }
  if ("$object" in expression) {
    return Object.fromEntries(
      Object.entries(expression.$object).map(([key, value]) => [
        key,
        evaluate(value, scope)
      ])
    );
  }
  if ("$array" in expression) {
    return expression.$array.map((value) => evaluate(value, scope));
  }
  const args = (expression.args ?? []).map((value) => evaluate(value, scope));
  if (expression.$op === "add") return args[0] + args[1];
  if (expression.$op === "subtract") return args[0] - args[1];
  if (expression.$op === "multiply") return args[0] * args[1];
  if (expression.$op === "equal") return args[0] === args[1];
  if (expression.$op === "not-equal") return args[0] !== args[1];
  if (expression.$op === "index") return args.slice(1).reduce((v, i) => v[i], args[0]);
  if (expression.$op === "lookup") return args[0][args[1]];
  if (expression.$op === "toggle-binary") return args[0] === 0 ? 1 : 0;
  if (expression.$op === "slice-grid") {
    return args[0]
      .slice(args[1], args[1] + args[3])
      .map((row) => row.slice(args[2], args[2] + args[4]));
  }
  if (expression.$op === "format") {
    return args.slice(1).reduce(
      (text, value, index) => text.replace(`{${index}}`, String(value)),
      args[0]
    );
  }
  throw new Error(`BROWSER_CONTEXT_EXPRESSION_UNRESOLVED:${expression.$op}`);
}

function createNode(document, authority) {
  const node = document.createElement(authority.tag);
  for (const [name, value] of Object.entries(authority.attributes ?? {})) {
    node.setAttribute(name, String(value));
  }
  if (authority.text !== undefined) {
    node.textContent = authority.text;
  }
  for (const child of authority.children ?? []) {
    node.append(createNode(document, child));
  }
  return node;
}

function mountDocument(context, browserPort) {
  const document = browserPort.document;
  document.title = context.documentProjection.title;
  const style = document.createElement("style");
  style.textContent = context.documentProjection.cssText;
  document.head.append(style);
  const root = document.getElementById(
    context.documentProjection.applicationRootElementId
  );
  root.replaceChildren(
    ...context.documentProjection.children.map((child) =>
      createNode(document, child)
    )
  );
}

function createGrid(width, height, value) {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => value)
  );
}

function applyCanvasFrame(frame, bindingId, scope) {
  const canvas = scope.document.getElementById(
    scope.context.effectBindings[bindingId].elementId
  );
  const rendering = canvas.getContext("2d");
  rendering.fillStyle = frame.canvas.background;
  rendering.fillRect(0, 0, frame.canvas.width, frame.canvas.height);
  for (const operation of frame.operations) {
    rendering.fillStyle = operation.fill;
    rendering.fillRect(
      operation.x,
      operation.y,
      operation.width,
      operation.height
    );
  }
}

function runSteps(steps, scope) {
  for (const step of steps) {
    if (step.operation === "assign") {
      writePath(scope, step.target, evaluate(step.value, scope));
      continue;
    }
    if (step.operation === "invoke-authority") {
      const bundleId = scope.context.authoritySelections[step.authoritySelection];
      try {
        writePath(
          scope,
          step.target,
          executeBrowserSemanticAuthority(
            scope.bundles.get(bundleId),
            evaluate(step.input, scope)
          )
        );
      } catch (error) {
        if (step.failureDisposition === "halt-workflow") return false;
        throw error;
      }
      continue;
    }
    if (step.operation === "fill-grid") {
      writePath(
        scope,
        step.target,
        createGrid(
          evaluate(step.width, scope),
          evaluate(step.height, scope),
          evaluate(step.value, scope)
        )
      );
      continue;
    }
    if (step.operation === "write-indexed-pairs") {
      const grid = evaluate(step.grid, scope);
      const xs = evaluate(step.xs, scope);
      const ys = evaluate(step.ys, scope);
      const value = evaluate(step.value, scope);
      for (let index = 0; index < xs.length; index += 1) {
        grid[ys[index]][xs[index]] = value;
      }
      continue;
    }
    if (step.operation === "for-range") {
      const start = evaluate(step.start, scope);
      const end = evaluate(step.endExclusive, scope);
      for (let value = start; value < end; value += 1) {
        scope.loop[step.iterator] = value;
        if (runSteps(step.steps, scope) === false) return false;
      }
      continue;
    }
    if (step.operation === "when") {
      if (evaluate(step.condition, scope)) {
        if (runSteps(step.steps, scope) === false) return false;
      }
      continue;
    }
    if (step.operation === "append") {
      evaluate(step.target, scope).push(evaluate(step.value, scope));
      continue;
    }
    if (step.operation === "run-workflow") {
      if (runWorkflow(step.workflowId, scope) === false) return false;
      continue;
    }
    if (step.operation === "prevent-default") {
      scope.event.preventDefault();
      continue;
    }
    if (step.operation === "apply-canvas-frame") {
      applyCanvasFrame(evaluate(step.frame, scope), step.bindingId, scope);
      continue;
    }
    if (step.operation === "set-text") {
      scope.document.getElementById(
        scope.context.effectBindings[step.bindingId].elementId
      ).textContent = evaluate(step.value, scope);
      continue;
    }
    if (step.operation === "toggle-class") {
      scope.document.getElementById(
        scope.context.effectBindings[step.bindingId].elementId
      ).classList.toggle(
        scope.context.effectBindings[step.bindingId].className,
        Boolean(evaluate(step.present, scope))
      );
      continue;
    }
    throw new Error(`BROWSER_CONTEXT_STEP_UNRESOLVED:${step.operation}`);
  }
  return true;
}

function runWorkflow(workflowId, scope) {
  scope.local = {};
  scope.loop = {};
  return runSteps(scope.context.workflows[workflowId], scope);
}

function bindEvents(context, scope) {
  for (const binding of context.eventBindings) {
    const target =
      binding.target === "document"
        ? scope.document
        : scope.document.getElementById(
            context.effectBindings[binding.target].elementId
          );
    target.addEventListener(binding.event, (event) => {
      scope.event = event;
      runWorkflow(binding.workflowId, scope);
    });
  }
}

export function executeBrowserApplication(
  applicationAuthority,
  context,
  browserPort,
  ...semanticBundles
) {
  const applicationProjection = executeApplicationProjection(
    applicationAuthority,
    browserPort
  );
  const admittedBrowserPort = applicationProjection.execution;
  const scope = {
    applicationAuthority,
    bundles: new Map(semanticBundles.map((bundle) => [bundle.bundleId, bundle])),
    context,
    document: admittedBrowserPort.document,
    event: undefined,
    local: {},
    loop: {},
    state: structuredClone(context.initialState)
  };
  mountDocument(context, admittedBrowserPort);
  bindEvents(context, scope);
  runWorkflow(context.lifecycle.initialWorkflowId, scope);
  return scope;
}
