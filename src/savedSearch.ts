import type { MemoItem } from "./markdown";
import {
  TASK_PRIORITY_VALUES,
  TASK_SEARCH_FIELDS,
  TASK_STATUS_VALUES,
  anyTaskMatchesCondition,
  findMatchingTasks,
  isTaskSearchField,
  parseTaskLines
} from "./taskSearch";

export type SavedSearchField =
  | "tag"
  | "text"
  | "date"
  | "status"
  | "image"
  | "link"
  | "task"
  | "taskStatus"
  | "taskPriority"
  | "taskDueDate"
  | "taskScheduledDate"
  | "taskStartDate"
  | "taskCreatedDate"
  | "taskDoneDate"
  | "taskRecurring"
  | "taskOverdue"
  | "taskDueToday"
  | "taskFuture"
  | "year"
  | "path";
export type SavedSearchOperator = "contains" | "notContains" | "equals" | "notEquals" | "before" | "after" | "between" | "exists" | "notExists";
export type SavedSearchMatch = "all" | "any";
export type SavedSearchStatus = "pinned" | "starred" | "archived";
export type SavedSearchScope = "memos" | "vault";

export interface SavedSearchCondition {
  field: SavedSearchField;
  operator: SavedSearchOperator;
  value?: string;
  valueTo?: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  match: SavedSearchMatch;
  searchScope: SavedSearchScope;
  conditions: SavedSearchCondition[];
}

export interface SavedSearchEvalContext {
  today?: string;
}

const FIELDS: SavedSearchField[] = [
  "tag",
  "text",
  "date",
  "status",
  "image",
  "link",
  "task",
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
  "taskFuture",
  "year",
  "path"
];
const OPERATORS_BY_FIELD: Record<SavedSearchField, SavedSearchOperator[]> = {
  tag: ["contains", "notContains", "equals", "notEquals", "exists", "notExists"],
  text: ["contains", "notContains", "equals", "notEquals"],
  date: ["equals", "notEquals", "before", "after", "between"],
  status: ["equals", "notEquals"],
  image: ["exists", "notExists"],
  link: ["exists", "notExists"],
  task: ["exists", "notExists"],
  taskStatus: ["equals", "notEquals"],
  taskPriority: ["equals", "notEquals"],
  taskDueDate: ["equals", "notEquals", "before", "after", "between", "exists", "notExists"],
  taskScheduledDate: ["equals", "notEquals", "before", "after", "between", "exists", "notExists"],
  taskStartDate: ["equals", "notEquals", "before", "after", "between", "exists", "notExists"],
  taskCreatedDate: ["equals", "notEquals", "before", "after", "between", "exists", "notExists"],
  taskDoneDate: ["equals", "notEquals", "before", "after", "between", "exists", "notExists"],
  taskRecurring: ["exists", "notExists"],
  taskOverdue: ["exists", "notExists"],
  taskDueToday: ["exists", "notExists"],
  taskFuture: ["exists", "notExists"],
  year: ["equals", "notEquals", "contains", "notContains"],
  path: ["contains", "notContains", "equals", "notEquals"]
};
const STATUS_VALUES: SavedSearchStatus[] = ["pinned", "starred", "archived"];

export function filterMemosBySavedSearch(memos: MemoItem[], search: SavedSearch, context: SavedSearchEvalContext = {}): MemoItem[] {
  return memos.filter((memo) => matchesSavedSearch(memo, search, context));
}

export function matchesSavedSearch(memo: MemoItem, search: SavedSearch, context: SavedSearchEvalContext = {}): boolean {
  const conditions = search.conditions.filter(isValidCondition);
  if (conditions.length === 0) {
    return false;
  }
  if (search.match === "any") {
    return conditions.some((condition) => matchesCondition(memo, condition, context));
  }
  const taskConditions = conditions.filter((condition) => isTaskSearchField(condition.field));
  const otherConditions = conditions.filter((condition) => !isTaskSearchField(condition.field));
  if (!otherConditions.every((condition) => matchesCondition(memo, condition, context))) {
    return false;
  }
  if (taskConditions.length === 0) {
    return true;
  }
  return findMatchingTasks(parseTaskLines(memo.content), taskConditions, context).length > 0;
}

export function normalizeSavedSearches(value: unknown): SavedSearch[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const conditions = Array.isArray(item.conditions) ? item.conditions.flatMap(normalizeCondition) : [];
    if (!id || !name || conditions.length === 0) {
      return [];
    }
    return [{ id, name, match: item.match === "any" ? "any" : "all", searchScope: item.searchScope === "vault" ? "vault" : "memos", conditions }];
  });
}

export function getSavedSearchTagOptions(memos: MemoItem[], vaultTags: Record<string, number> = {}): string[] {
  const tags = new Set<string>();
  for (const memo of memos) {
    for (const tag of memo.tags) {
      tags.add(tag);
    }
  }
  for (const tag of Object.keys(vaultTags)) {
    const normalized = tag.replace(/^#/, "").trim();
    if (normalized) {
      tags.add(normalized);
    }
  }
  return [...tags].sort((left, right) => left.localeCompare(right, "zh-Hans"));
}

export function savedSearchIncludesArchivedCondition(search: SavedSearch): boolean {
  return search.conditions.some((condition) => condition.field === "status" && condition.operator === "equals" && condition.value === "archived");
}

export function createDefaultSavedSearchCondition(): SavedSearchCondition {
  return { field: "tag", operator: "contains", value: "" };
}

export function createSavedSearchId(now = new Date()): string {
  const suffix = Math.random().toString(36).slice(2, 7) || "memo";
  return `search-${now.getTime().toString(36)}-${suffix}`;
}

export function getOperatorsForField(field: SavedSearchField): SavedSearchOperator[] {
  return OPERATORS_BY_FIELD[field];
}

export function getDefaultOperatorForField(field: SavedSearchField): SavedSearchOperator {
  return OPERATORS_BY_FIELD[field][0];
}

export function isValueRequired(operator: SavedSearchOperator): boolean {
  return operator !== "exists" && operator !== "notExists";
}

export function isBetweenOperator(operator: SavedSearchOperator): boolean {
  return operator === "between";
}

export function isValidCondition(condition: SavedSearchCondition): boolean {
  if (!FIELDS.includes(condition.field)) {
    return false;
  }
  if (!OPERATORS_BY_FIELD[condition.field].includes(condition.operator)) {
    return false;
  }
  if (condition.field === "status" && condition.value !== undefined && condition.value !== "" && !STATUS_VALUES.includes(condition.value as SavedSearchStatus)) {
    return false;
  }
  if (condition.field === "taskStatus" && condition.value !== undefined && condition.value !== "" && !TASK_STATUS_VALUES.includes(condition.value as never)) {
    return false;
  }
  if (condition.field === "taskPriority" && condition.value !== undefined && condition.value !== "" && !TASK_PRIORITY_VALUES.includes(condition.value as never)) {
    return false;
  }
  if (isBetweenOperator(condition.operator)) {
    return hasValue(condition.value) && hasValue(condition.valueTo);
  }
  if (isValueRequired(condition.operator)) {
    return hasValue(condition.value);
  }
  return true;
}

function normalizeCondition(value: unknown): SavedSearchCondition[] {
  if (!isRecord(value) || typeof value.field !== "string" || typeof value.operator !== "string") {
    return [];
  }
  const field = value.field;
  const operator = value.operator;
  if (!isSavedSearchField(field) || !isSavedSearchOperator(operator)) {
    return [];
  }
  const condition: SavedSearchCondition = {
    field,
    operator
  };
  if (typeof value.value === "string") {
    condition.value = value.value.trim();
  }
  if (typeof value.valueTo === "string") {
    condition.valueTo = value.valueTo.trim();
  }
  return isValidCondition(condition) ? [condition] : [];
}

function matchesCondition(memo: MemoItem, condition: SavedSearchCondition, context: SavedSearchEvalContext): boolean {
  switch (condition.field) {
    case "tag":
      return matchStringList(memo.tags, condition);
    case "text":
      return matchString(memo.content, condition);
    case "date":
      return matchDate(memo.date, condition, context);
    case "status":
      return matchStatus(memo, condition);
    case "image":
      return matchBoolean(memo.hasImage, condition.operator);
    case "link":
      return matchBoolean(memo.hasLink, condition.operator);
    case "task":
      return matchBoolean(memo.hasOpenTask || memo.hasClosedTask, condition.operator);
    case "taskStatus":
    case "taskPriority":
    case "taskDueDate":
    case "taskScheduledDate":
    case "taskStartDate":
    case "taskCreatedDate":
    case "taskDoneDate":
    case "taskRecurring":
    case "taskOverdue":
    case "taskDueToday":
    case "taskFuture":
      return anyTaskMatchesCondition(parseTaskLines(memo.content), condition, context);
    case "year":
      return matchString(memo.date.slice(0, 4), condition);
    case "path":
      return matchString(memo.filePath, condition);
  }
}

function matchStringList(values: string[], condition: SavedSearchCondition): boolean {
  if (condition.operator === "exists") {
    return values.length > 0;
  }
  if (condition.operator === "notExists") {
    return values.length === 0;
  }
  const target = normalizeComparable(condition.value);
  if (!target) {
    return false;
  }
  if (condition.operator === "contains") {
    return values.some((value) => normalizeComparable(value).includes(target));
  }
  if (condition.operator === "notContains") {
    return values.every((value) => !normalizeComparable(value).includes(target));
  }
  if (condition.operator === "equals") {
    return values.some((value) => normalizeComparable(value) === target);
  }
  if (condition.operator === "notEquals") {
    return values.every((value) => normalizeComparable(value) !== target);
  }
  return false;
}

function matchString(value: string, condition: SavedSearchCondition): boolean {
  const source = normalizeComparable(value);
  const target = normalizeComparable(condition.value);
  if (!target) {
    return false;
  }
  if (condition.operator === "contains") {
    return source.includes(target);
  }
  if (condition.operator === "notContains") {
    return !source.includes(target);
  }
  if (condition.operator === "equals") {
    return source === target;
  }
  if (condition.operator === "notEquals") {
    return source !== target;
  }
  return false;
}

function matchDate(value: string, condition: SavedSearchCondition, context: SavedSearchEvalContext): boolean {
  const target = resolveDateToken(condition.value ?? "", context);
  if (!target) {
    return false;
  }
  if (condition.operator === "equals") {
    return value === target;
  }
  if (condition.operator === "notEquals") {
    return value !== target;
  }
  if (condition.operator === "before") {
    return value < target;
  }
  if (condition.operator === "after") {
    return value > target;
  }
  if (condition.operator === "between") {
    const end = resolveDateToken(condition.valueTo ?? "", context);
    return Boolean(end) && value >= target && value <= end;
  }
  return false;
}

function resolveDateToken(value: string, context: SavedSearchEvalContext): string {
  const today = context.today ?? formatDateLocal(new Date());
  if (value === "$today") {
    return today;
  }
  if (value === "$weekStart") {
    return startOfWeek(today);
  }
  if (value === "$weekEnd") {
    return addDays(startOfWeek(today), 6);
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

function matchStatus(memo: MemoItem, condition: SavedSearchCondition): boolean {
  const value = statusMatches(memo, condition.value);
  if (condition.operator === "equals") {
    return value;
  }
  if (condition.operator === "notEquals") {
    return !value;
  }
  return false;
}

function statusMatches(memo: MemoItem, value: string | undefined): boolean {
  if (value === "pinned") {
    return memo.isPinned;
  }
  if (value === "starred") {
    return memo.isStarred;
  }
  if (value === "archived") {
    return memo.isArchived;
  }
  return false;
}

function normalizeComparable(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

function startOfWeek(dateString: string): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const diff = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - diff);
  return formatDateLocal(date);
}

function addDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return formatDateLocal(date);
}

function formatDateLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSavedSearchField(value: string): value is SavedSearchField {
  return FIELDS.includes(value as SavedSearchField) || (TASK_SEARCH_FIELDS as readonly string[]).includes(value);
}

function isSavedSearchOperator(value: string): value is SavedSearchOperator {
  return Object.values(OPERATORS_BY_FIELD).some((operators) => operators.includes(value as SavedSearchOperator));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
