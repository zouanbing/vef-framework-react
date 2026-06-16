/**
 * Closed condition-operator vocabulary shared with approval-flow editor and
 * backend validation. The {@link ConditionOperator} type derives from this
 * array — one definition site for both the type and the runtime allow-list.
 */
export const CONDITION_OPERATORS = [
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "not_contains",
  "starts_with",
  "ends_with",
  "in",
  "not_in",
  "is_empty",
  "is_not_empty"
] as const;

/**
 * Operators understood by the approval condition model.
 */
export type ConditionOperator = typeof CONDITION_OPERATORS[number];
