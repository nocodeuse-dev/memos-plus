import { parseTaskDateRecurrence } from "./taskDateRecurrenceParser";
import type { TaskPriority, TaskRecurrence } from "./tasksFormat";

export interface ParsedNaturalLanguageTask {
  original: string;
  title: string;
  date: string;
  dateExpression: string;
  requiresDateConfirmation: boolean;
  time: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  dueTime: string;
  reminderDate: string;
  reminderTime: string;
  reminderMinutesBefore?: number;
  recurrence: TaskRecurrence;
  customRecurrence: string;
  tags: string[];
  priority: TaskPriority;
  matched: boolean;
}

/** Shared natural-language task parser used by quick task, send-as-task and calendar task entry points. */
export function parseNaturalLanguageTask(input: string, now = new Date()): ParsedNaturalLanguageTask {
  const original = input.trim();
  const temporal = parseTaskDateRecurrence(original, now);
  let working = temporal.remaining;
  let priority: TaskPriority = "none";
  let matched = temporal.matched;

  const tags = unique(working.match(/#[^\s#，,。；;!！]+/gu) ?? []);
  if (tags.length > 0) {
    working = working.replace(/#[^\s#，,。；;!！]+/gu, " ");
    matched = true;
  }

  const priorityMatch = working.match(/(?:^|\s|[，,。；;])![低中高](?=$|\s|[，,。；;])/u);
  if (priorityMatch) {
    const marker = priorityMatch[0].match(/![低中高]/u)?.[0] ?? "";
    priority = marker === "!高" ? "high" : marker === "!低" ? "low" : "medium";
    working = removeMatch(working, priorityMatch);
    matched = true;
  }

  const title = working
    .replace(/[，,。；;]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  return {
    original,
    title: title || original,
    date: temporal.date,
    dateExpression: temporal.dateExpression,
    requiresDateConfirmation: temporal.requiresDateConfirmation,
    time: temporal.time,
    startDate: temporal.startDate,
    startTime: temporal.startTime,
    endDate: temporal.endDate,
    endTime: temporal.endTime,
    dueTime: temporal.dueTime,
    reminderDate: temporal.reminderDate,
    reminderTime: temporal.reminderTime,
    reminderMinutesBefore: temporal.reminderMinutesBefore,
    recurrence: temporal.recurrence,
    customRecurrence: temporal.customRecurrence,
    tags,
    priority,
    matched: matched && Boolean(title)
  };
}

function removeMatch(value: string, match: RegExpMatchArray): string {
  const start = match.index ?? value.indexOf(match[0]);
  if (start < 0) return value;
  return `${value.slice(0, start)} ${value.slice(start + match[0].length)}`;
}

function unique(values: string[]): string[] {
  const result: string[] = [];
  for (const value of values) {
    const normalized = value.startsWith("#") ? value : `#${value}`;
    if (!result.includes(normalized)) result.push(normalized);
  }
  return result;
}
