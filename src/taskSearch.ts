import type { SavedSearchCondition, SavedSearchEvalContext, SavedSearchOperator } from "./savedSearch";

export type TaskPriorityFilterValue = "highest" | "high" | "medium" | "low" | "lowest" | "none";
export type TaskStatusFilterValue = "open" | "completed" | "all";
export type TaskDateField = "taskDueDate" | "taskScheduledDate" | "taskStartDate" | "taskCreatedDate" | "taskDoneDate";

export interface ParsedTaskLine {
  line: string;
  text: string;
  completed: boolean;
  priority: TaskPriorityFilterValue;
  dueDate: string;
  scheduledDate: string;
  startDate: string;
  createdDate: string;
  doneDate: string;
  recurring: boolean;
}

export const TASK_SEARCH_FIELDS = [
  "taskStatus",
  "taskPriority",
  "taskDueDate",
  "taskScheduledDate",
  "taskStartDate",
  "taskCreatedDate",
  "taskDoneDate",
  "taskRecurring",
  "taskOverdue",
  "taskDueToday",
  "taskFuture"
] as const;

export const TASK_DATE_FIELDS: TaskDateField[] = ["taskDueDate", "taskScheduledDate", "taskStartDate", "taskCreatedDate", "taskDoneDate"];
export const TASK_STATUS_VALUES: TaskStatusFilterValue[] = ["open", "completed", "all"];
export const TASK_PRIORITY_VALUES: TaskPriorityFilterValue[] = ["highest", "high", "medium", "low", "lowest", "none"];

const TASK_LINE_RE = /^\s*[-*+]\s+\[([^\]])]\s+(.*)$/gm;
const DATE_MARKERS: Record<TaskDateField, string> = {
  taskDueDate: "📅",
  taskScheduledDate: "⏳",
  taskStartDate: "🛫",
  taskCreatedDate: "➕",
  taskDoneDate: "✅"
};
const PRIORITIES: Array<[TaskPriorityFilterValue, string]> = [
  ["highest", "🔺"],
  ["high", "⏫"],
  ["medium", "🔼"],
  ["low", "🔽"],
  ["lowest", "⏬"]
];

export function isTaskSearchField(field: string): field is (typeof TASK_SEARCH_FIELDS)[number] {
  return (TASK_SEARCH_FIELDS as readonly string[]).includes(field);
}

export function isTaskDateField(field: string): field is TaskDateField {
  return (TASK_DATE_FIELDS as readonly string[]).includes(field);
}

export function parseTaskLines(source: string): ParsedTaskLine[] {
  const tasks: ParsedTaskLine[] = [];
  for (const match of source.matchAll(TASK_LINE_RE)) {
    const text = match[2].trim();
    tasks.push({
      line: match[0],
      text,
      completed: match[1].trim() !== "",
      priority: parseTaskPriority(text),
      dueDate: parseMarkedDate(text, "taskDueDate"),
      scheduledDate: parseMarkedDate(text, "taskScheduledDate"),
      startDate: parseMarkedDate(text, "taskStartDate"),
      createdDate: parseMarkedDate(text, "taskCreatedDate"),
      doneDate: parseMarkedDate(text, "taskDoneDate"),
      recurring: text.includes("🔁")
    });
  }
  return tasks;
}

export function findMatchingTasks(tasks: ParsedTaskLine[], conditions: SavedSearchCondition[], context: SavedSearchEvalContext = {}): ParsedTaskLine[] {
  const taskConditions = conditions.filter((condition) => isTaskSearchField(condition.field));
  if (taskConditions.length === 0) {
    return tasks;
  }
  return tasks.filter((task) => taskConditions.every((condition) => taskMatchesCondition(task, condition, context)));
}

export function anyTaskMatchesCondition(tasks: ParsedTaskLine[], condition: SavedSearchCondition, context: SavedSearchEvalContext = {}): boolean {
  if (!isTaskSearchField(condition.field)) {
    return false;
  }
  return tasks.some((task) => taskMatchesCondition(task, condition, context));
}

function taskMatchesCondition(task: ParsedTaskLine, condition: SavedSearchCondition, context: SavedSearchEvalContext): boolean {
  switch (condition.field) {
    case "taskStatus":
      return matchComparable(taskStatusValue(task), condition.value, condition.operator);
    case "taskPriority":
      return matchComparable(task.priority, condition.value, condition.operator);
    case "taskDueDate":
    case "taskScheduledDate":
    case "taskStartDate":
    case "taskCreatedDate":
    case "taskDoneDate":
      return matchTaskDate(taskDateValue(task, condition.field), condition, context);
    case "taskRecurring":
      return matchBoolean(task.recurring, condition.operator);
    case "taskOverdue":
      return matchBoolean(!task.completed && Boolean(task.dueDate) && task.dueDate < today(context), condition.operator);
    case "taskDueToday":
      return matchBoolean(task.dueDate === today(context), condition.operator);
    case "taskFuture":
      return matchBoolean(!task.completed && taskFutureDateValues(task).some((date) => date > today(context)), condition.operator);
    default:
      return false;
  }
}

function taskStatusValue(task: ParsedTaskLine): TaskStatusFilterValue {
  return task.completed ? "completed" : "open";
}

function taskDateValue(task: ParsedTaskLine, field: TaskDateField): string {
  if (field === "taskDueDate") {
    return task.dueDate;
  }
  if (field === "taskScheduledDate") {
    return task.scheduledDate;
  }
  if (field === "taskStartDate") {
    return task.startDate;
  }
  if (field === "taskCreatedDate") {
    return task.createdDate;
  }
  return task.doneDate;
}

function taskFutureDateValues(task: ParsedTaskLine): string[] {
  return [task.dueDate, task.scheduledDate, task.startDate].filter(Boolean);
}

function matchComparable(source: string, target: string | undefined, operator: SavedSearchOperator): boolean {
  if (operator !== "equals" && operator !== "notEquals") {
    return false;
  }
  const normalized = (target ?? "").trim();
  const matches = normalized === "all" ? source === "open" || source === "completed" : source === normalized;
  return operator === "equals" ? matches : !matches;
}

function matchTaskDate(value: string, condition: SavedSearchCondition, context: SavedSearchEvalContext): boolean {
  if (condition.operator === "exists") {
    return Boolean(value);
  }
  if (condition.operator === "notExists") {
    return !value;
  }
  if (!value) {
    return false;
  }
  if (condition.operator === "equals") {
    return dateMatchesToken(value, condition.value ?? "", context);
  }
  if (condition.operator === "notEquals") {
    return !dateMatchesToken(value, condition.value ?? "", context);
  }
  const target = resolveComparableDate(condition.value ?? "", context);
  if (!target) {
    return false;
  }
  if (condition.operator === "before") {
    return value < target;
  }
  if (condition.operator === "after") {
    return value > target;
  }
  if (condition.operator === "between") {
    const end = resolveComparableDate(condition.valueTo ?? "", context);
    return Boolean(end) && value >= target && value <= end;
  }
  return false;
}

function dateMatchesToken(value: string, token: string, context: SavedSearchEvalContext): boolean {
  const current = today(context);
  if (token === "$today") {
    return value === current;
  }
  if (token === "$tomorrow") {
    return value === addDays(current, 1);
  }
  if (token === "$thisWeek") {
    const start = startOfWeek(current);
    return value >= start && value <= addDays(start, 6);
  }
  if (token === "$nextWeek") {
    const start = addDays(startOfWeek(current), 7);
    return value >= start && value <= addDays(start, 6);
  }
  if (token === "$past") {
    return value < current;
  }
  if (token === "$future") {
    return value > current;
  }
  return value === token;
}

function resolveComparableDate(value: string, context: SavedSearchEvalContext): string {
  const current = today(context);
  if (value === "$today" || value === "$past" || value === "$future") {
    return current;
  }
  if (value === "$tomorrow") {
    return addDays(current, 1);
  }
  if (value === "$thisWeek") {
    return startOfWeek(current);
  }
  if (value === "$nextWeek") {
    return addDays(startOfWeek(current), 7);
  }
  return value;
}

function matchBoolean(value: boolean, operator: SavedSearchOperator): boolean {
  if (operator === "exists") {
    return value;
  }
  if (operator === "notExists") {
    return !value;
  }
  return false;
}

function parseTaskPriority(text: string): TaskPriorityFilterValue {
  return PRIORITIES.find(([, marker]) => text.includes(marker))?.[0] ?? "none";
}

function parseMarkedDate(text: string, field: TaskDateField): string {
  const marker = DATE_MARKERS[field];
  const match = text.match(new RegExp(`${escapeRegExp(marker)}\\s*(\\d{4}-\\d{2}-\\d{2})`));
  return match?.[1] ?? "";
}

function today(context: SavedSearchEvalContext): string {
  return context.today ?? formatDate(new Date());
}

function startOfWeek(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return formatDate(date);
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

function formatDate(date: Date): string {
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
