import test from "node:test";
import assert from "node:assert/strict";
import {
  businessDateKey,
  isTaskOverdue,
  normalizeTaskDueDate,
  overdueDays,
} from "./overdue.ts";

const TODAY = "2026-09-27";

test("A: 25/09 BLOCKED is overdue", () => {
  assert.equal(isTaskOverdue("2026-09-25", "BLOCKED", TODAY), true);
});

test("B: 26/09 monitoring/in progress is overdue", () => {
  assert.equal(isTaskOverdue("2026-09-26", "IN_PROGRESS", TODAY), true);
  assert.equal(isTaskOverdue("26/09/2026", "MONITORING", TODAY), true);
});

test("C-D: today and future date are not overdue", () => {
  assert.equal(isTaskOverdue("2026-09-27", "IN_PROGRESS", TODAY), false);
  assert.equal(isTaskOverdue("2026-09-28", "BLOCKED", TODAY), false);
});

test("E-F: terminal status and null deadline are not overdue", () => {
  assert.equal(isTaskOverdue("2026-09-25", "DONE", TODAY), false);
  assert.equal(isTaskOverdue(null, "IN_PROGRESS", TODAY), false);
});

test("G: blocked and overdue can coexist", () => {
  const blocked = true;
  const overdue = isTaskOverdue("2026-09-25", "BLOCKED", TODAY);
  assert.equal(blocked, true);
  assert.equal(overdue, true);
});

test("normalizes TASK-001 DD/MM/YYYY and counts whole overdue days", () => {
  assert.equal(normalizeTaskDueDate("25/09/2026"), "2026-09-25");
  assert.equal(overdueDays("25/09/2026", TODAY), 2);
});

test("business date uses Asia/Bangkok UTC+7", () => {
  assert.equal(businessDateKey(new Date("2026-09-26T17:30:00Z")), "2026-09-27");
});
