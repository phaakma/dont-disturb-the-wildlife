import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildWhereClause,
  decodeFilterParam,
  encodeFilterParam,
  EMPTY_FILTER,
  type FilterSpec,
} from "./filterExpression.ts";

test("buildWhereClause returns 1=1 for an empty filter", () => {
  assert.equal(buildWhereClause(EMPTY_FILTER), "1=1");
});

test("buildWhereClause builds each string operator correctly, escaping quotes", () => {
  const spec = (operator: string, value = "O'Brien's"): FilterSpec => ({
    combinator: "AND",
    clauses: [{ field: "NAME", fieldType: "string", operator: operator as never, value }],
  });

  assert.equal(buildWhereClause(spec("eq")), "(NAME = 'O''Brien''s')");
  assert.equal(buildWhereClause(spec("neq")), "(NAME <> 'O''Brien''s')");
  assert.equal(buildWhereClause(spec("contains")), "(NAME LIKE '%O''Brien''s%')");
  assert.equal(buildWhereClause(spec("startsWith")), "(NAME LIKE 'O''Brien''s%')");
});

test("buildWhereClause builds numeric operators", () => {
  const spec = (operator: string): FilterSpec => ({
    combinator: "AND",
    clauses: [{ field: "POP", fieldType: "number", operator: operator as never, value: "100" }],
  });
  assert.equal(buildWhereClause(spec("eq")), "(POP = 100)");
  assert.equal(buildWhereClause(spec("neq")), "(POP <> 100)");
  assert.equal(buildWhereClause(spec("gt")), "(POP > 100)");
  assert.equal(buildWhereClause(spec("gte")), "(POP >= 100)");
  assert.equal(buildWhereClause(spec("lt")), "(POP < 100)");
  assert.equal(buildWhereClause(spec("lte")), "(POP <= 100)");
});

test("buildWhereClause builds date operators as DATE literals", () => {
  const spec = (operator: string): FilterSpec => ({
    combinator: "AND",
    clauses: [{ field: "CREATED", fieldType: "date", operator: operator as never, value: "2024-01-01" }],
  });
  assert.equal(buildWhereClause(spec("eq")), "(CREATED = DATE '2024-01-01')");
  assert.equal(buildWhereClause(spec("gt")), "(CREATED > DATE '2024-01-01')");
  assert.equal(buildWhereClause(spec("lt")), "(CREATED < DATE '2024-01-01')");
});

test("buildWhereClause handles isBlank/isNotBlank without needing a value", () => {
  const blank: FilterSpec = {
    combinator: "AND",
    clauses: [{ field: "NOTES", fieldType: "string", operator: "isBlank", value: "" }],
  };
  const notBlank: FilterSpec = {
    combinator: "AND",
    clauses: [{ field: "NOTES", fieldType: "string", operator: "isNotBlank", value: "" }],
  };
  assert.equal(buildWhereClause(blank), "(NOTES IS NULL)");
  assert.equal(buildWhereClause(notBlank), "(NOTES IS NOT NULL)");
});

test("buildWhereClause joins multiple clauses with the combinator and drops incomplete clauses", () => {
  const spec: FilterSpec = {
    combinator: "OR",
    clauses: [
      { field: "NAME", fieldType: "string", operator: "eq", value: "Wellington" },
      { field: "POP", fieldType: "number", operator: "gt", value: "" }, // incomplete - dropped
      { field: "POP", fieldType: "number", operator: "gt", value: "1000" },
    ],
  };
  assert.equal(buildWhereClause(spec), "(NAME = 'Wellington') OR (POP > 1000)");
});

test("encode/decode filter param round-trips a spec", () => {
  const spec: FilterSpec = {
    combinator: "AND",
    clauses: [{ field: "NAME", fieldType: "string", operator: "eq", value: "Auckland" }],
  };
  const encoded = encodeFilterParam(spec);
  assert.ok(encoded);
  assert.deepEqual(decodeFilterParam(encoded), spec);
});

test("encodeFilterParam returns null for an empty filter, so it's omitted from share URLs", () => {
  assert.equal(encodeFilterParam(EMPTY_FILTER), null);
});

test("decodeFilterParam falls back to EMPTY_FILTER for missing or malformed input", () => {
  assert.deepEqual(decodeFilterParam(null), EMPTY_FILTER);
  assert.deepEqual(decodeFilterParam("not json"), EMPTY_FILTER);
  assert.deepEqual(decodeFilterParam('{"combinator":"XOR","clauses":[]}'), EMPTY_FILTER);
});
