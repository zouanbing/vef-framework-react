export {
  CONDITION_OPERATORS,
  type ConditionOperator
} from "./condition/types";

export { ExpressionError, ExpressionNotReadyError } from "./engine/errors";

export {
  evaluate,
  evaluateSync,
  evaluateUnary,
  evaluateUnarySync,
  validate,
  validateUnary
} from "./engine/evaluate";

export {
  configureEngine,
  getEngineError,
  getEngineSync,
  isEngineReady,
  loadEngine,
  type ExpressionContext,
  type ExpressionEngine,
  type LoadEngineOptions
} from "./engine/loader";
