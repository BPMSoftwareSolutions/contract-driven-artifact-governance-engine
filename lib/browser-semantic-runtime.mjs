/*
 * Trusted execution infrastructure, not a domain-authored artifact.
 *
 * This is a narrowed, browser-servable port of this project's own
 * executeSemanticAuthority (lib/semantic-execution-runtime.mjs), limited to
 * the primitives the six dungeon ontology bundles actually use. It exists
 * because a vanilla browser cannot resolve the
 * "contract-driven-artifact-governance-engine" bare-specifier import those
 * bundles are normally executed through (Node resolves that specifier via
 * package resolution; a browser needs a real URL). Serving this as its own
 * relative-path-importable module -- rather than vendoring a copy inline in
 * index.html -- keeps index.html itself free of the primitive-dispatch,
 * DAG-walk, and guard-evaluation machinery below: that machinery is generic
 * interpretation, the same shape regardless of which ontology it runs, not
 * an authored domain decision about the dungeon.
 *
 * This file is engine infrastructure outside the webpage contract's workspace
 * (and is not a contract.artifacts entry), the same scope posture the
 * verification-tools/*.mjs scripts already have, rather than a fully
 * disclosed lossless-source-tokens.v1 webpage artifact. It is trusted by
 * proof of behavioral equivalence to the real
 * engine (verification-tools/verifies-semantic-equivalence.mjs) plus a
 * structural guard that the interpreter cannot silently reappear inline
 * (verification-tools/verifies-page-bootstrap-mechanics.mjs), not by a
 * per-decision token-level disclosure: see designAuthority decision
 * browser-execution-module-stays-outside-governed-scope in
 * examples/procedural-dungeon-webpage.contract.json for why, and what that
 * gives up.
 */

function jsonType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function typedValueMatches(typedValue, value) {
  return (
    typedValue.type === jsonType(value) &&
    JSON.stringify(typedValue.value) === JSON.stringify(value)
  );
}

function sourceValue(value) {
  return value?.state === "value" ? value.value : value;
}

function observePath(source, path) {
  let value = source;
  for (const segment of path) {
    if (value === null || typeof value !== "object" || !(segment in value)) {
      return { state: "missing" };
    }
    value = value[segment];
  }
  return value === null ? { state: "null" } : { state: "value", value };
}

function propertyState(observation, authority) {
  if (observation.state === "missing") {
    return "missing";
  }
  if (observation.state === "null") {
    return "null";
  }
  if (jsonType(observation.value) !== authority.expectedValueType) {
    return "invalid-type";
  }
  if (observation.value === "" && authority.emptyStringState === "empty-string") {
    return "empty-string";
  }
  return "present";
}

function setOutputPath(target, path, value) {
  let cursor = target;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    const next = path[index + 1];
    if (!(segment in cursor)) {
      cursor[segment] = typeof next === "number" ? [] : {};
    }
    cursor = cursor[segment];
  }
  cursor[path.at(-1)] = value;
}

function readPathValue(source, path) {
  let value = source;
  for (const segment of path) {
    value = value?.[segment];
  }
  return value;
}

function factPort(factId) {
  return `fact.${factId}`;
}

function xorshift32Step(state) {
  let x = state >>> 0;
  if (x === 0) {
    x = 0x9e3779b9;
  }
  x ^= x << 13;
  x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return x >>> 0;
}

function xorshift32Draw(seed, callIndex) {
  const mixed = ((seed >>> 0) ^ Math.imul((callIndex >>> 0) + 1, 0x9e3779b1)) >>> 0;
  return xorshift32Step(mixed);
}

function compareOutcomeState(a, b) {
  return a < b ? "less-than" : a > b ? "greater-than" : "equal-to";
}

// current/clone: guards always read the step program's own evolving state
// (never a frozen pre-step snapshot), so a guarded program reads exactly
// like ordinary sequential code -- each statement sees every prior
// statement's effect within the same pass. See lib/semantic-execution-runtime.mjs
// for the identical, cross-validated rule this file mirrors.
function resolveStepOperandValue(operand, current, resultsAccumulator, inputs) {
  if (operand.kind === "fact") {
    return sourceValue(inputs[factPort(operand.factId)]);
  }
  if (operand.kind === "item-field") {
    return readPathValue(current, operand.path);
  }
  if (operand.kind === "item-field-indexed") {
    const array = readPathValue(current, operand.path);
    const index = readPathValue(current, operand.indexPath);
    return array?.[index];
  }
  if (operand.kind === "fact-indexed") {
    const array = sourceValue(inputs[factPort(operand.factId)]);
    const index = readPathValue(current, operand.indexPath);
    return array?.[index];
  }
  if (operand.kind === "seeded-draw") {
    const seed = sourceValue(inputs[factPort(operand.seedFactId)]);
    const callIndex = readPathValue(current, operand.callIndexPath);
    const min = resolveStepOperandValue(operand.min, current, resultsAccumulator, inputs);
    const max = resolveStepOperandValue(operand.max, current, resultsAccumulator, inputs);
    const draw = xorshift32Draw(seed, callIndex);
    return min + (draw % (max - min + 1));
  }
  return (readPathValue(current, operand.path) ?? []).length;
}

function stepGuardPasses(guard, current, resultsAccumulator, inputs) {
  if (!guard) {
    return true;
  }
  const operandValue = resolveStepOperandValue(guard.operand, current, resultsAccumulator, inputs);
  const compareValue = resolveStepOperandValue(guard.compareTo, current, resultsAccumulator, inputs);
  return guard.matchStates.includes(compareOutcomeState(operandValue, compareValue));
}

function applyStepProgram(steps, clone, resultsAccumulator, inputs) {
  for (const step of steps) {
    if (!stepGuardPasses(step.when, clone, resultsAccumulator, inputs)) {
      continue;
    }
    const operandValue = resolveStepOperandValue(step.operand, clone, resultsAccumulator, inputs);
    const existing = readPathValue(clone, step.targetPath);
    const nextValue =
      step.operation === "set"
        ? operandValue
        : step.operation === "add"
          ? existing + operandValue
          : step.operation === "subtract"
            ? existing - operandValue
            : [...(existing ?? []), operandValue];
    setOutputPath(clone, step.targetPath, nextValue);
  }
}

function buildIndexes(authority) {
  const semantic = new Map();
  const byKind = {
    concept: new Map(),
    property: new Map(),
    fact: new Map(),
    classification: new Map(),
    obligation: new Map(),
    transformation: new Map(),
    result: new Map(),
    arithmeticOperation: new Map(),
    indexedRead: new Map(),
    iteration: new Map()
  };
  const declarations = [
    ["concepts", "concept", "conceptId"],
    ["properties", "property", "propertyId"],
    ["facts", "fact", "factId"],
    ["classifications", "classification", "classificationId"],
    ["obligations", "obligation", "obligationId"],
    ["transformations", "transformation", "transformationId"],
    ["results", "result", "resultUnionId"],
    ["arithmeticOperations", "arithmeticOperation", "operationId"],
    ["indexedReads", "indexedRead", "readId"],
    ["iterations", "iteration", "iterationId"]
  ];
  for (const [collection, kind, identityField] of declarations) {
    for (const entry of authority[collection] ?? []) {
      const identity = entry[identityField];
      semantic.set(identity, { entry, kind });
      byKind[kind].set(identity, entry);
    }
  }
  return { semantic, byKind };
}

function resolveNodeInputs(nodeId, edges, outputs) {
  const inputs = {};
  for (const edge of edges) {
    if (edge.to.nodeId === nodeId) {
      inputs[edge.to.port] = outputs.get(edge.from.nodeId)?.[edge.from.port];
    }
  }
  return inputs;
}

function topologicalOrder(nodes, edges) {
  const indegree = new Map(nodes.map((node) => [node.nodeId, 0]));
  const adjacency = new Map(nodes.map((node) => [node.nodeId, []]));
  for (const edge of edges) {
    adjacency.get(edge.from.nodeId).push(edge.to.nodeId);
    indegree.set(edge.to.nodeId, indegree.get(edge.to.nodeId) + 1);
  }
  const isRootId = ([, degree]) => degree === 0;
  const idOf = ([id]) => id;
  const pending = [...indegree].filter(isRootId).map(idOf);
  const order = [];
  while (pending.length > 0) {
    const id = pending.shift();
    order.push(id);
    for (const next of adjacency.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) {
        pending.push(next);
      }
    }
  }
  return order;
}

function executePrimitive(binding, inputs, indexes) {
  const semantic = indexes.semantic.get(binding.semanticAuthorityId);
  const authority = semantic.entry;
  const primitive = binding.executorPrimitive;

  if (primitive === "input.v1") {
    return { value: inputs.__input__ };
  }
  if (primitive === "validate-variant.v1") {
    return { conceptId: authority.variants[0] };
  }
  if (primitive === "read-path.v1") {
    const resolution = authority.resolutions[0];
    return { observation: observePath(inputs.source, resolution.path) };
  }
  if (primitive === "constant.v1") {
    return { value: authority.value.value };
  }
  if (primitive === "test-presence.v1") {
    return { state: propertyState(inputs.observation, authority) };
  }
  if (primitive === "classify-value.v1") {
    const value = sourceValue(inputs.observation);
    const match = authority.cases.find((entry) => typedValueMatches(entry.value, value));
    if (!match) {
      throw new Error(authority.unmatchedDisposition);
    }
    return { state: match.stateId };
  }
  if (primitive === "classify-observations.v1") {
    const conditionMatches = (condition) => {
      const observed = inputs[condition.inputPort];
      const expected = condition.observation;
      if (expected.state !== "value") {
        return observed?.state === expected.state;
      }
      return (
        observed?.state === "value" &&
        typedValueMatches(expected.value, observed.value)
      );
    };
    const caseMatches = (entry) => entry.when.every(conditionMatches);
    const match = authority.cases.find(caseMatches);
    if (!match) {
      throw new Error(authority.noMatchDisposition);
    }
    return { state: match.emit.value };
  }
  if (primitive === "evaluate-obligation.v1") {
    const satisfied = authority.satisfiedStateIds.includes(inputs.state);
    return { status: satisfied ? "satisfied" : "violated" };
  }
  if (primitive === "project-value.v1") {
    return { fragment: { resultIds: authority.resultIds, outputPath: authority.outputPath, value: sourceValue(inputs.value) } };
  }
  if (primitive === "select-result.v1") {
    const conditionSatisfied = (condition) => inputs[condition.inputPort] === condition.status;
    const ruleMatches = (rule) => rule.when.every(conditionSatisfied);
    const match = authority.selectionRules.find(ruleMatches);
    if (!match) {
      throw new Error(authority.noMatchDisposition);
    }
    return { resultId: match.resultId };
  }
  if (primitive === "emit-result.v1") {
    const member = authority.members.find((entry) => entry.resultId === inputs.selection);
    const result = {};
    setOutputPath(result, member.discriminator.outputPath, member.discriminator.value.value);
    for (const [port, fragment] of Object.entries(inputs)) {
      if (port === "selection" || !fragment.resultIds.includes(member.resultId)) {
        continue;
      }
      setOutputPath(result, fragment.outputPath, fragment.value);
    }
    return { result };
  }
  if (primitive === "add-bounded.v1") {
    return { value: sourceValue(inputs.operandA) + sourceValue(inputs.operandB) };
  }
  if (primitive === "read-indexed-path.v1") {
    let cursor = sourceValue(inputs.source);
    for (const segment of authority.basePath) {
      cursor = cursor[segment];
    }
    const index = sourceValue(inputs.index);
    if (!Array.isArray(cursor) || index < 0 || index >= cursor.length) {
      throw new Error(authority.outOfBoundsDisposition);
    }
    return { value: cursor[index] };
  }
  if (primitive === "iterate-bounded-worklist.v1") {
    const results = [];
    let current = sourceValue(inputs.seedItem);
    let terminated = false;
    for (let step = 0; step <= authority.maxSteps; step += 1) {
      if (authority.resultMode === "history") {
        results.push(structuredClone(current));
      }
      const operand = readPathValue(current, authority.continueCondition.operandPath);
      const compareTo = resolveStepOperandValue(authority.continueCondition.compareTo, current, null, inputs);
      if (!authority.continueCondition.continueWhenStates.includes(compareOutcomeState(operand, compareTo))) {
        terminated = true;
        break;
      }
      if (step === authority.maxSteps) {
        break;
      }
      const clone = structuredClone(current);
      applyStepProgram(authority.advance.steps, clone, null, inputs);
      current = clone;
    }
    if (!terminated) {
      throw new Error(authority.unresolvedDisposition);
    }
    return { value: authority.resultMode === "final-item" ? current : results };
  }
  if (primitive === "resolve-branching-worklist.v1") {
    let resultsAccumulator = structuredClone(authority.initialAccumulator);
    const queue = [sourceValue(inputs.seedItem)];
    let processed = 0;
    while (queue.length > 0 && processed < authority.maxItems) {
      const item = queue.shift();
      processed += 1;
      const conditionPasses = (condition) => stepGuardPasses(condition, item, resultsAccumulator, inputs);
      const groupPasses = (group) => group.every(conditionPasses);
      const isTerminal = authority.terminalWhen.anyOf.some(groupPasses);
      if (isTerminal) {
        const clone = structuredClone({ item, accumulator: structuredClone(resultsAccumulator) });
        applyStepProgram(authority.terminalSteps, clone, resultsAccumulator, inputs);
        resultsAccumulator = clone.accumulator;
      } else {
        const clone = structuredClone({ parent: item, left: {}, right: {}, accumulator: structuredClone(resultsAccumulator) });
        applyStepProgram(authority.splitSteps, clone, resultsAccumulator, inputs);
        resultsAccumulator = clone.accumulator;
        queue.push(clone.left, clone.right);
      }
    }
    if (queue.length > 0) {
      throw new Error(authority.unresolvedDisposition);
    }
    return { value: resultsAccumulator };
  }
  if (primitive === "serialize-result.v1") {
    return { result: inputs.result };
  }
  throw new Error(`ONTOLOGY_EXECUTOR_UNRESOLVED:${primitive}`);
}

export function executeBrowserSemanticAuthority(bundle, input) {
  const indexes = buildIndexes(bundle.authority);
  const bindingById = new Map(bundle.authority.executionBindings.map((b) => [b.bindingId, b]));
  const order = topologicalOrder(bundle.authority.executionGraph.nodes, bundle.authority.executionGraph.edges);
  const nodeById = new Map(bundle.authority.executionGraph.nodes.map((node) => [node.nodeId, node]));
  const outputs = new Map();
  for (const nodeId of order) {
    const node = nodeById.get(nodeId);
    const binding = bindingById.get(node.bindingId);
    const inputs = resolveNodeInputs(nodeId, bundle.authority.executionGraph.edges, outputs);
    if (binding.executorPrimitive === "input.v1") {
      inputs.__input__ = input;
    }
    outputs.set(nodeId, executePrimitive(binding, inputs, indexes));
  }
  const terminalId = bundle.authority.executionGraph.terminalNodeIds[0];
  return outputs.get(terminalId).result;
}

export const runDungeonOntology = executeBrowserSemanticAuthority;
