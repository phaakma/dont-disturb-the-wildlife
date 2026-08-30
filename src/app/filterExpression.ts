export type FilterFieldType = "string" | "number" | "date";

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "startsWith"
  | "isBlank"
  | "isNotBlank";

export interface FilterClause {
  field: string;
  fieldType: FilterFieldType;
  operator: FilterOperator;
  /** Raw text/number/date-input value. Ignored for isBlank/isNotBlank. */
  value: string;
}

export interface FilterSpec {
  combinator: "AND" | "OR";
  clauses: FilterClause[];
}

export const EMPTY_FILTER: FilterSpec = { combinator: "AND", clauses: [] };

const OPERATORS_BY_FIELD_TYPE: Record<FilterFieldType, FilterOperator[]> = {
  string: ["eq", "neq", "contains", "startsWith", "isBlank", "isNotBlank"],
  number: ["eq", "neq", "gt", "gte", "lt", "lte", "isBlank", "isNotBlank"],
  date: ["eq", "gt", "lt", "isBlank", "isNotBlank"],
};

export function operatorsForFieldType(fieldType: FilterFieldType): FilterOperator[] {
  return OPERATORS_BY_FIELD_TYPE[fieldType];
}

const OPERATOR_LABEL: Record<FilterFieldType, Partial<Record<FilterOperator, string>>> = {
  string: {
    eq: "is",
    neq: "is not",
    contains: "contains",
    startsWith: "starts with",
    isBlank: "is blank",
    isNotBlank: "is not blank",
  },
  number: {
    eq: "=",
    neq: "≠",
    gt: ">",
    gte: "≥",
    lt: "<",
    lte: "≤",
    isBlank: "is blank",
    isNotBlank: "is not blank",
  },
  date: {
    eq: "on",
    gt: "after",
    lt: "before",
    isBlank: "is blank",
    isNotBlank: "is not blank",
  },
};

export function operatorLabel(fieldType: FilterFieldType, operator: FilterOperator): string {
  return OPERATOR_LABEL[fieldType][operator] ?? operator;
}

function escapeStringLiteral(value: string): string {
  return value.replace(/'/g, "''");
}

function clauseWhere(clause: FilterClause): string | null {
  const { field, fieldType, operator, value } = clause;

  if (operator === "isBlank") return `(${field} IS NULL)`;
  if (operator === "isNotBlank") return `(${field} IS NOT NULL)`;

  const trimmed = value.trim();
  if (!trimmed) return null; // incomplete clause - drop it rather than build invalid SQL

  if (fieldType === "number") {
    if (!Number.isFinite(Number(trimmed))) return null;
    const opSql = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }[operator as "eq" | "neq" | "gt" | "gte" | "lt" | "lte"];
    if (!opSql) return null;
    return `(${field} ${opSql} ${trimmed})`;
  }

  if (fieldType === "date") {
    const opSql = { eq: "=", gt: ">", lt: "<" }[operator as "eq" | "gt" | "lt"];
    if (!opSql) return null;
    return `(${field} ${opSql} DATE '${trimmed}')`;
  }

  // string
  const literal = escapeStringLiteral(trimmed);
  switch (operator) {
    case "eq":
      return `(${field} = '${literal}')`;
    case "neq":
      return `(${field} <> '${literal}')`;
    case "contains":
      return `(${field} LIKE '%${literal}%')`;
    case "startsWith":
      return `(${field} LIKE '${literal}%')`;
    default:
      return null;
  }
}

/** Builds a FeatureLayer.definitionExpression-compatible where clause. "1=1" (match everything) when there are no usable clauses. */
export function buildWhereClause(spec: FilterSpec): string {
  const parts = spec.clauses.map(clauseWhere).filter((p): p is string => p !== null);
  if (parts.length === 0) return "1=1";
  return parts.join(` ${spec.combinator} `);
}

/**
 * Returns a raw (not URI-encoded) JSON string, for use directly with
 * URLSearchParams.set(), which does its own encoding - matching how every
 * other param in shareUrl.ts is handled.
 */
export function encodeFilterParam(spec: FilterSpec): string | null {
  if (spec.clauses.length === 0) return null;
  return JSON.stringify(spec);
}

export function isFilterSpec(value: unknown): value is FilterSpec {
  if (!value || typeof value !== "object") return false;
  const spec = value as Partial<FilterSpec>;
  if (spec.combinator !== "AND" && spec.combinator !== "OR") return false;
  if (!Array.isArray(spec.clauses)) return false;
  return spec.clauses.every(
    (c) =>
      c &&
      typeof c === "object" &&
      typeof (c as FilterClause).field === "string" &&
      typeof (c as FilterClause).operator === "string" &&
      typeof (c as FilterClause).fieldType === "string" &&
      typeof (c as FilterClause).value === "string",
  );
}

/** `raw` is expected to already be decoded, e.g. straight from URLSearchParams.get(). */
export function decodeFilterParam(raw: string | null): FilterSpec {
  if (!raw) return EMPTY_FILTER;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isFilterSpec(parsed) ? parsed : EMPTY_FILTER;
  } catch {
    return EMPTY_FILTER;
  }
}
