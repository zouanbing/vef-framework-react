import type { Completion, CompletionContext, CompletionResult } from "@codemirror/autocomplete";
import type { Diagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

import type { SourceFieldOption } from "./options";

import { autocompletion } from "@codemirror/autocomplete";
import { linter } from "@codemirror/lint";

/**
 * Editor assistance for ZEN linkage expressions (`field.x > 1`-style
 * conditions and value expressions): scope-aware autocompletion plus a lint
 * pass that flags member access on keys the current scope does not provide.
 * Script sources can reuse the same scope assistance even though their
 * execution still goes through `new Function`.
 */

/**
 * Mirrors the evaluator's `SCOPE_PARAMS` — `field` and `$form` alias the form values.
 */
const VALUE_ROOTS = new Set(["field", "$form"]);

const ROOT_COMPLETIONS: Completion[] = [
  {
    label: "field",
    type: "variable",
    detail: "表单字段值（field.字段Key）"
  },
  {
    label: "$form",
    type: "variable",
    detail: "表单字段值（field 的别名）"
  },
  {
    label: "$vars",
    type: "variable",
    detail: "表单变量"
  },
  {
    label: "$user",
    type: "variable",
    detail: "宿主用户上下文"
  },
  {
    label: "$node",
    type: "variable",
    detail: "宿主节点上下文"
  },
  {
    label: "$now",
    type: "variable",
    detail: "当前时间"
  }
];

export interface ExpressionAssistArgs {
  /**
   * Keyed fields reachable from the rule's value scope.
   */
  fields: SourceFieldOption[];
  /**
   * Declared form-variable names (completion only — hosts may inject more).
   */
  variables: string[];
}

/**
 * Completion source: after `field.` / `$form.` offer the scope's field keys
 * (labels as detail), after `$vars.` the declared variables, and at a bare
 * word the scope roots themselves.
 */
export function buildCompletionSource(args: ExpressionAssistArgs): (context: CompletionContext) => CompletionResult | null {
  const fieldCompletions: Completion[] = args.fields.map(field => {
    return {
      label: field.value,
      type: "property",
      detail: field.label
    };
  });
  const variableCompletions: Completion[] = args.variables.map(name => {
    return {
      label: name,
      type: "property"
    };
  });

  return context => {
    const member = context.matchBefore(/(?:\$vars|\$form|field)\.[\w$]*/);

    if (member) {
      const dot = member.text.indexOf(".");
      const root = member.text.slice(0, dot);
      const options = root === "$vars" ? variableCompletions : fieldCompletions;

      if (options.length === 0) {
        return null;
      }

      return {
        from: member.from + dot + 1,
        options,
        validFor: /^[\w$]*$/
      };
    }

    const word = context.matchBefore(/[\w$]+/);

    if (!word && !context.explicit) {
      return null;
    }

    return {
      from: word?.from ?? context.pos,
      options: ROOT_COMPLETIONS,
      validFor: /^[\w$]*$/
    };
  };
}

/**
 * Lint pass over the parsed tree: `field.x` / `$form.x` where `x` is not a
 * key in the rule's scope gets a warning — the most common silent failure in
 * hand-written expressions is a misspelled key that simply never matches.
 * `$vars` / `$user` / `$node` are deliberately NOT linted: hosts inject
 * members the schema cannot know about.
 */
export function lintUnknownFieldMembers(view: EditorView, fieldKeys: ReadonlySet<string>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (fieldKeys.size === 0) {
    return diagnostics;
  }

  const doc = view.state.doc.toString();
  const memberPattern = /(?:^|[^\w$])(?<root>\$form|field)\.(?<key>[A-Z_$][\w$]*)/gi;

  for (const match of doc.matchAll(memberPattern)) {
    const root = match.groups?.root;
    const key = match.groups?.key;

    if (root === undefined || key === undefined || !VALUE_ROOTS.has(root) || fieldKeys.has(key)) {
      continue;
    }

    const keyStart = (match.index ?? 0) + match[0].lastIndexOf(key);

    diagnostics.push({
      from: keyStart,
      to: keyStart + key.length,
      severity: "warning",
      message: `当前作用域内没有字段 key「${key}」`
    });
  }

  return diagnostics;
}

/**
 * The complete extension set for a linkage expression / script editor.
 */
export function expressionAssistExtensions(args: ExpressionAssistArgs) {
  const fieldKeys: ReadonlySet<string> = new Set(args.fields.map(field => field.value));

  return [
    autocompletion({ override: [buildCompletionSource(args)] }),
    linter(view => lintUnknownFieldMembers(view, fieldKeys), { delay: 300 })
  ];
}
