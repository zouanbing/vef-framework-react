import type { InitInput } from "@gorules/zen-engine-wasm";

import { isUndefined } from "@vef-framework-react/shared";

import { ExpressionError, ExpressionNotReadyError } from "./errors";

/**
 * The data an expression reads from. Property paths in the expression (e.g.
 * `customer.name`) resolve against this object.
 */
export type ExpressionContext = Record<string, unknown>;

export interface LoadEngineOptions {
  /**
   * Override how the wasm binary is located. By default the engine resolves the
   * co-located `.wasm` through the GoRules package's own `import.meta.url`,
   * which the host bundler (Vite / webpack) rewrites to a served asset URL — no
   * option is needed in normal browser app setups. Supply a URL / Response /
   * bytes for exotic hosting (CDN, embedded buffer) or for a non-browser host
   * (Node / SSR), where `import.meta.url` asset resolution does not work and the
   * input must be provided explicitly. Aliased to the wasm initializer's own
   * `InitInput` so it never drifts from the dependency.
   */
  wasmInput?: InitInput;
}

/**
 * The initialized ZEN expression engine. Every method is synchronous — obtain
 * an instance via {@link loadEngine} (async, loads the wasm) before calling.
 */
export interface ExpressionEngine {
  /**
   * Evaluate a standard ZEN expression, returning its computed value.
   */
  evaluate: <T = unknown>(expression: string, context?: ExpressionContext) => T;
  /**
   * Evaluate a ZEN unary (test) expression, returning a boolean.
   */
  evaluateUnary: (expression: string, context?: ExpressionContext) => boolean;
  /**
   * Validate a standard expression; returns ZEN's diagnostic payload (`null`
   * when the expression parses, an error object otherwise).
   */
  validate: (expression: string) => unknown;
  /**
   * Validate a unary expression; returns ZEN's diagnostic payload.
   */
  validateUnary: (expression: string) => unknown;
  /**
   * Whether the underlying wasm module reports itself ready.
   */
  isReady: () => boolean;
}

let enginePromise: Promise<ExpressionEngine> | null = null;
let engineSync: ExpressionEngine | null = null;
let engineError: ExpressionError | null = null;
let configuredInput: InitInput | undefined;

function evaluateSafely<T>(expression: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    throw new ExpressionError(`Failed to evaluate expression: ${expression}`, expression, error);
  }
}

function loadFailureMessage(): string {
  const base = "Failed to load the ZEN expression engine";

  if (isUndefined(globalThis.window)) {
    return `${base}. In a non-browser host (Node / SSR) the wasm cannot be auto-resolved; call configureEngine({ wasmInput }) with the wasm bytes or URL before loading.`;
  }

  return base;
}

/**
 * Configure how the wasm binary is located, before the engine loads. Must be
 * called before the first {@link loadEngine} (or any evaluation), so that the
 * configured input is the one actually used — calling it after the engine has
 * started loading throws, rather than silently taking no effect.
 */
export function configureEngine(options: LoadEngineOptions): void {
  if (enginePromise || engineSync) {
    throw new ExpressionError("configureEngine() must be called before the engine loads.");
  }

  configuredInput = options.wasmInput;
}

/**
 * Load and initialize the ZEN expression engine exactly once. Concurrent and
 * subsequent calls share the same in-flight promise / resolved instance. Set a
 * custom wasm source up front with {@link configureEngine}.
 *
 * The GoRules wasm dependency is reached via a dynamic `import()` on purpose: it
 * keeps this module usable from the package's CommonJS build (the dep is
 * ESM-only, so a static `require` would throw) and defers the multi-megabyte
 * wasm download until the engine is actually needed. Do NOT convert this to a
 * static import.
 */
export function loadEngine(): Promise<ExpressionEngine> {
  if (enginePromise) {
    return enginePromise;
  }

  engineError = null;
  enginePromise = (async () => {
    const zen = await import("@gorules/zen-engine-wasm");
    await zen.default(isUndefined(configuredInput) ? undefined : { module_or_path: configuredInput });

    const engine: ExpressionEngine = Object.freeze({
      evaluate: <T = unknown>(expression: string, context: ExpressionContext = {}): T => evaluateSafely(expression, () => zen.evaluateExpression(expression, context) as T),
      evaluateUnary: (expression: string, context: ExpressionContext = {}): boolean => evaluateSafely(expression, () => zen.evaluateUnaryExpression(expression, context)),
      validate: (expression: string): unknown => zen.validateExpression(expression),
      validateUnary: (expression: string): unknown => zen.validateUnaryExpression(expression),
      isReady: (): boolean => zen.isReady()
    });

    engineSync = engine;
    return engine;
  })().catch((error: unknown) => {
    // Drop the rejected promise so a later imperative call can retry the load,
    // but remember the failure so UI gates can surface it to an error boundary
    // instead of re-suspending on a fresh load forever.
    enginePromise = null;
    engineError = new ExpressionError(loadFailureMessage(), undefined, error);
    throw engineError;
  });

  return enginePromise;
}

/**
 * Whether the engine has finished initializing and is ready for sync use.
 */
export function isEngineReady(): boolean {
  return engineSync?.isReady() ?? false;
}

/**
 * The error from the last failed {@link loadEngine} attempt, or `null`. Used by
 * UI gates to surface a wasm-load failure to an error boundary rather than
 * suspending forever, and by imperative pollers to tell "failed" apart from
 * "still loading". Cleared when a new load starts or {@link resetEngine}.
 */
export function getEngineError(): ExpressionError | null {
  return engineError;
}

/**
 * Return the already-initialized engine synchronously, or throw
 * {@link ExpressionNotReadyError} if {@link loadEngine} has not resolved yet.
 */
export function getEngineSync(): ExpressionEngine {
  if (!engineSync) {
    throw new ExpressionNotReadyError();
  }

  return engineSync;
}

/**
 * Reset the singleton. Intended for tests only.
 */
export function resetEngine(): void {
  enginePromise = null;
  engineSync = null;
  engineError = null;
  configuredInput = undefined;
}
