import type { TaskIndexItem } from "./taskIndex";

export type TaskCalendarViewMode = "day" | "week";
export type TaskCalendarNavigation = "today" | "tomorrow" | "week" | "inbox" | "all" | "completed";
export type TaskCalendarMobileTab = "today" | "tasks" | "calendar";

export interface TaskCalendarSettings {
  showRibbon: boolean;
  defaultView: TaskCalendarNavigation;
  inboxPath: string;
  selectedDate: string;
  viewMode: TaskCalendarViewMode;
  navigation: TaskCalendarNavigation;
  mobileTab: TaskCalendarMobileTab;
  sidebarCollapsed: boolean;
  tasksPaneHidden: boolean;
  agendaCacheMinutes: number;
  agendaCalendarNames: string[];
  showAllDayEvents: boolean;
  showHomeEntry: boolean;
  showMobileQuickActions: boolean;
}

export const DEFAULT_TASK_CALENDAR_SETTINGS: TaskCalendarSettings = {
  showRibbon: true,
  defaultView: "today",
  inboxPath: "我的资源/Memos/任务收件箱.md",
  selectedDate: "",
  viewMode: "day",
  navigation: "today",
  mobileTab: "today",
  sidebarCollapsed: false,
  tasksPaneHidden: false,
  agendaCacheMinutes: 5,
  agendaCalendarNames: [],
  showAllDayEvents: true,
  showHomeEntry: true,
  showMobileQuickActions: true
};

export interface TaskCalendarDateRange {
  startDate: string;
  endDate: string;
  days: string[];
}

export function normalizeTaskCalendarSettings(value: unknown): TaskCalendarSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    showRibbon: typeof raw.showRibbon === "boolean" ? raw.showRibbon : DEFAULT_TASK_CALENDAR_SETTINGS.showRibbon,
    defaultView: normalizeNavigation(raw.defaultView, DEFAULT_TASK_CALENDAR_SETTINGS.defaultView),
    inboxPath: normalizeInboxPath(raw.inboxPath),
    selectedDate: normalizeDate(raw.selectedDate),
    viewMode: raw.viewMode === "week" ? "week" : "day",
    navigation: normalizeNavigation(raw.navigation, DEFAULT_TASK_CALENDAR_SETTINGS.navigation),
    mobileTab: raw.mobileTab === "tasks" || raw.mobileTab === "calendar" ? raw.mobileTab : "today",
    sidebarCollapsed: typeof raw.sidebarCollapsed === "boolean" ? raw.sidebarCollapsed : false,
    tasksPaneHidden: typeof raw.tasksPaneHidden === "boolean" ? raw.tasksPaneHidden : false,
    agendaCacheMinutes: clampInteger(raw.agendaCacheMinutes, 1, 30, DEFAULT_TASK_CALENDAR_SETTINGS.agendaCacheMinutes),
    agendaCalendarNames: normalizeCalendarNames(raw.agendaCalendarNames),
    showAllDayEvents: typeof raw.showAllDayEvents === "boolean" ? raw.showAllDayEvents : DEFAULT_TASK_CALENDAR_SETTINGS.showAllDayEvents,
    showHomeEntry: typeof raw.showHomeEntry === "boolean" ? raw.showHomeEntry : DEFAULT_TASK_CALENDAR_SETTINGS.showHomeEntry,
    showMobileQuickActions: typeof raw.showMobileQuickActions === "boolean" ? raw.showMobileQuickActions : DEFAULT_TASK_CALENDAR_SETTINGS.showMobileQuickActions
  };
}

export function todayTaskCalendarDate(now = new Date()): string {
  return formatDate(now);
}

export function taskCalendarDateRange(date: string, mode: TaskCalendarViewMode): TaskCalendarDateRange {
  const selected = parseDate(normalizeDate(date) || todayTaskCalendarDate());
  const start = mode === "week" ? startOfWeek(selected) : selected;
  const count = mode === "week" ? 7 : 1;
  const days = Array.from({ length: count }, (_, index) => formatDate(addDays(start, index)));
  return { startDate: days[0], endDate: formatDate(addDays(start, count)), days };
}

export function shiftTaskCalendarDate(date: string, mode: TaskCalendarViewMode, offset: number): string {
  return formatDate(addDays(parseDate(normalizeDate(date) || todayTaskCalendarDate()), offset * (mode === "week" ? 7 : 1)));
}

export function taskCalendarTasks(items: TaskIndexItem[], navigation: TaskCalendarNavigation, selectedDate: string): TaskIndexItem[] {
  const date = normalizeDate(selectedDate) || todayTaskCalendarDate();
  const incomplete = items.filter((item) => !item.completed);
  const matchesDate = (item: TaskIndexItem) => taskDate(item) === date;
  let filtered: TaskIndexItem[];
  switch (navigation) {
    case "completed":
      filtered = items.filter((item) => item.completed);
      break;
    case "all":
      filtered = incomplete;
      break;
    case "inbox":
      filtered = incomplete.filter((item) => !taskDate(item));
      break;
    case "week":
      {
        const range = taskCalendarDateRange(date, "week");
      filtered = incomplete.filter((item) => {
        const itemDate = taskDate(item);
        return Boolean(item.dueDate && item.dueDate < date) || (itemDate >= range.startDate && itemDate < range.endDate);
      });
      }
      break;
    default:
      filtered = incomplete.filter((item) => matchesDate(item) || Boolean(item.dueDate && item.dueDate < date));
      break;
  }
  return [...filtered].sort((left, right) => taskSortKey(left, date) - taskSortKey(right, date) || left.text.localeCompare(right.text));
}

export function taskDate(item: Pick<TaskIndexItem, "dueDate" | "scheduledDate" | "startDate">): string {
  return item.dueDate || item.scheduledDate || item.startDate || "";
}

export function formatTaskCalendarDate(date: string, locale = "zh-CN"): string {
  const parsed = parseDate(normalizeDate(date) || todayTaskCalendarDate());
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(parsed);
}

function normalizeNavigation(value: unknown, fallback: TaskCalendarNavigation): TaskCalendarNavigation {
  return value === "tomorrow" || value === "week" || value === "inbox" || value === "all" || value === "completed" || value === "today" ? value : fallback;
}

function normalizeCalendarNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const candidate of value) {
    if (typeof candidate !== "string") continue;
    const name = candidate.trim();
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    names.push(name);
    if (names.length >= 20) break;
  }
  return names;
}

function normalizeInboxPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_TASK_CALENDAR_SETTINGS.inboxPath;
  const path = value.trim().replace(/^\/+/, "");
  if (!path) return DEFAULT_TASK_CALENDAR_SETTINGS.inboxPath;
  return path.toLowerCase().endsWith(".md") ? path : `${path}.md`;
}

function normalizeDate(value: unknown): string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "";
}

function clampInteger(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
}

function taskSortKey(item: TaskIndexItem, selectedDate: string): number {
  const date = taskDate(item);
  if (date && date < selectedDate) return 0;
  if (date === selectedDate) return 1;
  if (!date) return 2;
  return 3;
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function startOfWeek(date: Date): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - ((result.getDay() + 6) % 7));
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
