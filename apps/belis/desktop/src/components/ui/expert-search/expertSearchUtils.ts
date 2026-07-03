// Where-clause builder for the expert search (Expertensuche).
//
// The expert search UI in this folder produces a small tree of groups → rules,
// stored in the `expertSearch` redux slice. This module turns that tree into a
// Hasura GraphQL `where` clause string, in the same shape the classic per-type
// builders in SearchModal.tsx emit (so it plugs into the same query execution).
//
// `field.key` in the registry is already the real backend column name, so each
// rule maps to a flat `{ key: { _op: value } }` condition.

import type { Field } from "./fieldRegistry";
import type {
  Conjunction,
  ExpertRuleState,
  ExpertTypeState,
} from "../../../store/slices/expertSearch";

// Scalar comparison operators → Hasura operators.
const OP_MAP: Record<string, string> = {
  eq: "_eq",
  neq: "_neq",
  gt: "_gt",
  gte: "_gte",
  lt: "_lt",
  lte: "_lte",
};

const hasuraConj = (c: Conjunction): string => (c === "ODER" ? "_or" : "_and");

const escapeString = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const isEmptyValue = (v: unknown): boolean =>
  v === undefined || v === null || v === "";

// The antd DatePicker yields a dayjs object; duck-type it to avoid importing
// dayjs here. Fall back to plain ISO strings just in case.
const formatDate = (v: unknown): string | null => {
  if (v && typeof (v as { format?: unknown }).format === "function") {
    return (v as { format: (f: string) => string }).format("YYYY-MM-DD");
  }
  if (typeof v === "string" && v) return v.split("T")[0];
  return null;
};

const toBoolean = (v: unknown): boolean =>
  v === true || v === "true" || v === 1 || v === "1";

// Build the condition body for one rule (e.g. `fk_leuchttyp: {_eq: 5}`), or
// null when the rule is incomplete and should be skipped.
const buildRuleCondition = (
  rule: ExpertRuleState,
  field: Field
): string | null => {
  const col = field.key;
  const { operator, value } = rule;

  // "ist leer" needs no value.
  if (operator === "empty") {
    return `${col}: {_is_null: true}`;
  }

  if (isEmptyValue(value)) return null;

  switch (field.type) {
    case "number":
    case "fk": {
      const num = Number(value);
      if (Number.isNaN(num)) return null;
      // Textual "contains" is meaningless on numbers → treat as equality.
      const op = operator === "contains" ? "_eq" : OP_MAP[operator] ?? "_eq";
      return `${col}: {${op}: ${num}}`;
    }

    case "boolean": {
      const bool = toBoolean(value);
      const op = operator === "neq" ? "_neq" : "_eq";
      return `${col}: {${op}: ${bool}}`;
    }

    case "date": {
      const d = formatDate(value);
      if (!d) return null;
      switch (operator) {
        case "eq":
          // Columns store timestamps → match the whole day.
          return `${col}: {_gte: "${d}", _lte: "${d} 23:59:59"}`;
        case "lte":
          return `${col}: {_lte: "${d} 23:59:59"}`;
        case "gt":
        case "gte":
        case "lt":
        case "neq":
          return `${col}: {${OP_MAP[operator]}: "${d}"}`;
        default:
          return `${col}: {_gte: "${d}", _lte: "${d} 23:59:59"}`;
      }
    }

    case "text":
    default: {
      const str = escapeString(String(value));
      if (operator === "contains") {
        return `${col}: {_ilike: "%${str}%"}`;
      }
      const op = OP_MAP[operator] ?? "_eq";
      return `${col}: {${op}: "${str}"}`;
    }
  }
};

const NOT_DELETED =
  "{_or: [{is_deleted: {_eq: false}}, {is_deleted: {_is_null: true}}]}";

// Combine the group tree into a single GraphQL `where: {...}` string, always
// AND-ing the not-deleted guard. Returns just the not-deleted guard when no
// usable rules are present.
export const buildExpertWhereClause = (
  query: ExpertTypeState,
  fields: Field[]
): string => {
  const fieldMap = new Map(fields.map((f) => [f.key, f]));

  const groupClauses: string[] = [];
  for (const group of query.groups) {
    const ruleClauses: string[] = [];
    for (const rule of group.rules) {
      const field = fieldMap.get(rule.field);
      if (!field) continue;
      const cond = buildRuleCondition(rule, field);
      if (cond) ruleClauses.push(`{${cond}}`);
    }
    if (ruleClauses.length === 0) continue;
    groupClauses.push(
      ruleClauses.length === 1
        ? ruleClauses[0]
        : `{${hasuraConj(group.conjunction)}: [${ruleClauses.join(", ")}]}`
    );
  }

  const userFilter =
    groupClauses.length === 0
      ? null
      : groupClauses.length === 1
      ? groupClauses[0]
      : `{${hasuraConj(query.groupConjunction)}: [${groupClauses.join(", ")}]}`;

  if (!userFilter) {
    // Strip the outer braces so it sits directly inside `where: {...}`.
    return `where: {${NOT_DELETED.slice(1, -1)}}`;
  }

  return `where: {_and: [${NOT_DELETED}, ${userFilter}]}`;
};
