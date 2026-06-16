import type { ExpressionContext, LinkageEvaluators, LinkageScriptResult } from "../../types";

import { evaluateSync } from "@vef-framework-react/expression";
import { lru } from "@vef-framework-react/shared";

/**
 * Default evaluators used when the host project does not inject its own.
 * Condition and assignment expressions run through the shared ZEN engine from
 * `@vef-framework-react/expression`; script actions stay on `new Function`
 * because they are statement blocks and can span multiple lines.
 *
 * The expression scope contains `field` / `$form` (the form values — `field` is
 * the legacy alias), `$vars` (form variables), `$user` / `$node` (host context),
 * and `$now` (the current time). All but `field` / `$form` come from the
 * optional {@link ExpressionContext}.
 *
 * Security model: scripts still run in the host page through `new Function`, so
 * the framework assumes schemas come from a trusted source for script actions.
 * Sandboxing scripts remains the host's responsibility — supply your own
 * `LinkageEvaluators` to swap in a sandboxed script runtime.
 *
 * CSP behavior: only scripts require `'unsafe-eval'`. A blocked or malformed
 * script degrades to `undefined`; malformed ZEN expressions degrade to `false`
 * for conditions and `undefined` for assignment values.
 */

type Scope = Record<string, unknown>;

type ScriptFn = ($form: Scope, $vars: Scope, $user: Scope, $node: Scope, $now: Date) => LinkageScriptResult | void;

const COMPILE_CACHE_SIZE = 100;
const EMPTY_SCOPE: Scope = Object.freeze({});

const scriptCache = lru<ScriptFn>(COMPILE_CACHE_SIZE);

// `field` and `$form` both bind the form values (`field` is the legacy alias);
// strict mode keeps `this === undefined` and disables sloppy-mode escape hatches.
const SCOPE_PARAMS = ["field", "$form", "$vars", "$user", "$node", "$now"] as const;

function compileScript(source: string): ScriptFn {
  // Action scripts are statement blocks — the user must `return { ... }`
  // explicitly if they want to patch state. No return is a valid no-op.
  // eslint-disable-next-line no-new-func -- intentional: script actions are trusted schema-supplied statement blocks; hosts that need a sandbox swap in their own LinkageEvaluators.
  const fn = new Function(...SCOPE_PARAMS, `"use strict"; ${source}`);

  return (($form, $vars, $user, $node, $now) => fn($form, $form, $vars, $user, $node, $now)) as ScriptFn;
}

/**
 * Inert sentinel cached for script sources that fail to compile (syntax errors,
 * CSP-blocked `new Function`). Returning `undefined` is lane-appropriate for a
 * script action: it becomes "no state patch". Caching the failure means a
 * broken script throws once at compile, not on every keystroke-driven
 * re-evaluation.
 */
function inertEvaluation(): undefined {
  // Intentionally empty: see doc comment.
}

function getCompiledScript(source: string): ScriptFn {
  let fn = scriptCache.get(source);

  if (!fn) {
    try {
      fn = compileScript(source);
    } catch {
      fn = inertEvaluation;
    }

    scriptCache.set(source, fn);
  }

  return fn;
}

function createExpressionScope(
  values: Record<string, unknown>,
  context: ExpressionContext | undefined
): Scope {
  return {
    field: values,
    $form: values,
    $vars: context?.variables ?? EMPTY_SCOPE,
    $user: context?.user ?? EMPTY_SCOPE,
    $node: context?.node ?? EMPTY_SCOPE,
    $now: Date.now()
  };
}

function runCompiled<T>(
  fn: ($form: Scope, $vars: Scope, $user: Scope, $node: Scope, $now: Date) => T,
  values: Record<string, unknown>,
  context: ExpressionContext | undefined
): T {
  return fn(
    values,
    context?.variables ?? EMPTY_SCOPE,
    context?.user ?? EMPTY_SCOPE,
    context?.node ?? EMPTY_SCOPE,
    new Date()
  );
}

export function defaultEvaluateExpression(
  source: string,
  values: Record<string, unknown>,
  context?: ExpressionContext
): boolean {
  try {
    return evaluateSync(source, createExpressionScope(values, context)) === true;
  } catch {
    return false;
  }
}

export function defaultEvaluateAssignExpression(
  source: string,
  values: Record<string, unknown>,
  context?: ExpressionContext
): unknown {
  try {
    return evaluateSync(source, createExpressionScope(values, context));
  } catch {
    return undefined;
  }
}

export function defaultEvaluateScriptAction(
  source: string,
  values: Record<string, unknown>,
  context?: ExpressionContext
): LinkageScriptResult | void {
  try {
    return runCompiled(getCompiledScript(source), values, context);
  } catch {
    // Swallow runtime errors — a broken script must not crash the form.
    return undefined;
  }
}

/**
 * No-op effect dispatcher used when the host wires none. Host-delegated effect
 * actions (`alert` / `api_call` / `navigate`) become benign no-ops — exactly as
 * a `remote` data source resolves to an empty list without a resolver.
 */
function noopDispatchEffect(): void {
  // Intentionally empty: see doc comment.
}

/**
 * Resolves a host-supplied {@link LinkageEvaluators} to a fully populated set,
 * filling missing expression slots with the shared ZEN evaluator, script slots
 * with the default `new Function` evaluator, and effects with the no-op
 * dispatcher.
 */
export function resolveLinkageEvaluators(overrides?: LinkageEvaluators): Required<LinkageEvaluators> {
  return {
    evaluateExpression: overrides?.evaluateExpression ?? defaultEvaluateExpression,
    evaluateScriptAction: overrides?.evaluateScriptAction ?? defaultEvaluateScriptAction,
    evaluateAssignExpression: overrides?.evaluateAssignExpression ?? defaultEvaluateAssignExpression,
    dispatchEffect: overrides?.dispatchEffect ?? noopDispatchEffect
  };
}
