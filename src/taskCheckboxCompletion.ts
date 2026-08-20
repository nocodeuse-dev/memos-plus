import { clearTaskCompletedAt, markTaskCompletedAt } from "./taskCompletion";

const TASK_CHECKBOX_RE = /^\s*(?:[-*+]|\d+[.)])\s+\[([^\]])\]/u;

export type TaskCheckboxCompletionTransition = "completed" | "reopened" | null;

/**
 * Identifies user-driven Markdown checkbox changes without treating any
 * non-task line as a task. The caller owns the actual Markdown rewrite.
 */
export function taskCheckboxCompletionTransition(before: string, after: string): TaskCheckboxCompletionTransition {
  const previous = checkboxState(before);
  const next = checkboxState(after);
  if (previous === null || next === null || previous === next) return null;
  return next ? "completed" : "reopened";
}

/**
 * Applies only a confirmed checkbox state change. A regular text edit or an
 * already-normalized line is returned untouched.
 */
export function normalizeTaskCheckboxCompletion(before: string, after: string, completedAt = new Date()): string {
  const transition = taskCheckboxCompletionTransition(before, after);
  if (transition === "completed") return markTaskCompletedAt(after, completedAt);
  if (transition === "reopened") return clearTaskCompletedAt(after);
  return after;
}

function checkboxState(line: string): boolean | null {
  const match = line.match(TASK_CHECKBOX_RE);
  if (!match) return null;
  return Boolean(match[1]?.trim());
}
