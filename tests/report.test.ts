import test from "node:test";
import assert from "node:assert/strict";
import seed from "../data/seed.json";
import { monthEnd, qualityWarnings, reportCutoff, reportTotals } from "../lib/report";
import { isValidDate, parseBudgetItems } from "../lib/validation";
import type { BudgetItem } from "../lib/types";

test("initial file totals are preserved exactly without double-counting detail rows", () => {
  const totals = reportTotals(seed.items as BudgetItem[]);
  assert.equal(totals.budget, 52_744_500);
  assert.equal(totals.approved, 41_858_200);
  assert.equal(totals.allocated, 39_257_500);
  assert.equal(seed.reportedTotals.allocated, 39_557_500);
  assert.equal(totals.unapproved, 10_886_300);
  assert.equal(totals.unallocated, 13_187_000);
  assert.equal(seed.items.length, 11);
});

test("flags source anomalies instead of modifying original budget amounts", () => {
  const warningText = qualityWarnings(seed.items as BudgetItem[],seed.reportedTotals).join(" ");
  assert.match(warningText, /รายการ 3/);
  assert.match(warningText, /รายการ 8/);
  assert.match(warningText, /39,257,500/);
  assert.match(warningText, /39,557,500/);
});

test("monthly reports use the last day of the chosen month", () => {
  assert.equal(monthEnd("2026-02-12"), "2026-02-28");
  assert.equal(monthEnd("2028-02-05"), "2028-02-29");
  assert.equal(reportCutoff({ mode: "monthly", date: "2026-11-01" }), "2026-11-30");
  assert.equal(reportCutoff({ mode: "daily", date: "2026-11-11" }), "2026-11-11");
});

test("rejects invalid dates, duplicate projects, and negative figures", () => {
  assert.equal(isValidDate("2026-02-30"), false);
  assert.equal(isValidDate("2026-11-11"), true);
  const dup = [seed.items[0], seed.items[0]];
  assert.throws(() => parseBudgetItems(dup));
  assert.throws(() => parseBudgetItems([{ ...seed.items[0], budget: -1 }]));
  assert.equal(parseBudgetItems([seed.items[0]]).length, 1);
});
