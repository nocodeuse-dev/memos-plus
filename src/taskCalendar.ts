import type { TaskIndexItem } from "./taskIndex";
import type { OrganizerFilterId } from "./organizerPanel";
import type { TaskPriorityFilterValue } from "./taskSearch";

export type TaskCalendarViewMode = "day" | "week";
export type TaskCalendarNavigation = "today" | "upcoming" | "tomorrow" | "week" | "inbox" | "overdue" | "all" | "completed";
export type TaskCalendarMobileTab = "today" | "tasks" | "calendar";

export interface TaskCalendarProjectFilter {
  label: string;
  filePath?: string;
  tag?: string;
}

export interface TaskCalendarTaskFilters {
  query?: string;
  priority?: TaskPriorityFilterValue | "all";
  project?: TaskCalendarProjectFilter | null;
}

export interface TaskCalendarOpenOptions extends TaskCalendarTaskFilters {
  navigation?: TaskCalendarNavigation;
  selectedDate?: string;
  viewMode?: TaskCalendarViewMode;
  focusQuickTask?: boolean;
}

export interface TaskCalendarSettings {
  showRibbon: boolean;
  defaultView: TaskCalendarNavigation;
  inboxPath: string;
  selectedDate: string;
  viewMode: TaskCalendarViewMode;
  navigation: TaskCalendarNavigation;
  mobileTab: TaskCalendarMobileTab;
  sidebarCollapsed: boolean;
  sidebarExpandedManually: boolean;
  tasksPaneHidden: boolean;
  navigationWidth: number;
  taskPaneWidth: number;
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
  sidebarExpandedManually: false,
  tasksPaneHidden: false,
  navigationWidth: 232,
  taskPaneWidth: 390,
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

export interface TaskCalendarMonthDay {
  date: string;
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
}

export function normalizeTaskCalendarSettings(value: unknown): TaskCalendarSettings {
  const raw = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const navigationWidth = raw.navigationWidth === 152 ? DEFAULT_TASK_CALENDAR_SETTINGS.navigationWidth : raw.navigationWidth;
  const taskPaneWidth = raw.taskPaneWidth === 320 ? DEFAULT_TASK_CALENDAR_SETTINGS.taskPaneWidth : raw.taskPaneWidth;
  return {
    showRibbon: typeof raw.showRibbon === "boolean" ? raw.showRibbon : DEFAULT_TASK_CALENDAR_SETTINGS.showRibbon,
    defaultView: normalizeNavigation(raw.defaultView, DEFAULT_TASK_CALENDAR_SETTINGS.defaultView),
    inboxPath: normalizeInboxPath(raw.inboxPath),
    selectedDate: normalizeDate(raw.selectedDate),
    viewMode: raw.viewMode === "week" ? "week" : "day",
    navigation: normalizeNavigation(raw.navigation, DEFAULT_TASK_CALENDAR_SETTINGS.navigation),
    mobileTab: raw.mobileTab === "tasks" || raw.mobileTab === "calendar" ? raw.mobileTab : "today",
    sidebarCollapsed: typeof raw.sidebarCollapsed === "boolean" ? raw.sidebarCollapsed : false,
    sidebarExpandedManually: typeof raw.sidebarExpandedManually === "boolean" ? raw.sidebarExpandedManually : false,
    tasksPaneHidden: typeof raw.tasksPaneHidden === "boolean" ? raw.tasksPaneHidden : false,
    navigationWidth: clampInteger(navigationWidth, 200, 320, DEFAULT_TASK_CALENDAR_SETTINGS.navigationWidth),
    taskPaneWidth: clampInteger(taskPaneWidth, 340, 560, DEFAULT_TASK_CALENDAR_SETTINGS.taskPaneWidth),
    agendaCacheMinutes: clampInteger(raw.agendaCacheMinutes, 1, 30, DEFAULT_TASK_CALENDAR_SETTINGS.agendaCacheMinutes),
    agendaCalendarNames: normalizeCalendarNames(raw.agendaCalendarNames),
    showAllDayEvents: typeof raw.showAllDayEvents === "boolean" ? raw.showAllDayEvents : DEFAULT_TASK_CALENDAR_SETTINGS.showAllDayEvents,
    showHomeEntry: typeof raw.showHomeEntry === "boolean" ? raw.showHomeEntry : DEFAULT_TASK_CALENDAR_SETTINGS.showHomeEntry,
    showMobileQuickActions: typeof raw.showMobileQuickActions === "boolean" ? raw.showMobileQuickActions : DEFAULT_TASK_CALENDAR_SETTINGS.showMobileQuickActions
  };
}

export interface TaskCalendarSidebarState {
  sidebarCollapsed: boolean;
  sidebarExpandedManually: boolean;
}

export function toggleTaskCalendarSidebar(
  state: TaskCalendarSidebarState,
  responsiveCollapsed: boolean,
  isMobile: boolean
): TaskCalendarSidebarState {
  if (isMobile) return { ...state };
  if (state.sidebarCollapsed || responsiveCollapsed) {
    return { sidebarCollapsed: false, sidebarExpandedManually: true };
  }
  return { sidebarCollapsed: true, sidebarExpandedManually: false };
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

export function shiftTaskCalendarMonth(date: string, offset: number): string {
  const selected = parseDate(normalizeDate(date) || todayTaskCalendarDate());
  const next = new Date(selected.getFullYear(), selected.getMonth() + offset, 1, 12, 0, 0, 0);
  return formatDate(next);
}

/** Monday-first six-week grid used by the compact calendar navigator. */
export function taskCalendarMonthDays(date: string, now = new Date()): TaskCalendarMonthDay[] {
  const selected = parseDate(normalizeDate(date) || todayTaskCalendarDate(now));
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1, 12, 0, 0, 0);
  const first = addDays(monthStart, -((monthStart.getDay() + 6) % 7));
  const today = formatDate(now);
  return Array.from({ length: 42 }, (_, index) => {
    const current = addDays(first, index);
    const currentDate = formatDate(current);
    return {
      date: currentDate,
      day: current.getDate(),
      inCurrentMonth: current.getMonth() === selected.getMonth(),
      isToday: currentDate === today
    };
  });
}

export function formatTaskCalendarMonth(date: string, locale = "zh-CN"): string {
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long" }).format(parseDate(normalizeDate(date) || todayTaskCalendarDate()));
}

/**
 * Calendar.app exposes several generated, read-only calendars alongside a
 * user's own calendars.  They are useful when explicitly selected, but asking
 * Calendar.app to hydrate every one of them makes the first agenda read much
 * slower (especially with subscribed holiday feeds).  An empty persisted
 * selection therefore means "normal calendars", not "every generated feed".
 */
export function taskCalendarDefaultAgendaNames(calendarNames: string[]): string[] {
  return normalizeCalendarNames(calendarNames).filter((name) => !isGeneratedSystemCalendar(name));
}

function isGeneratedSystemCalendar(name: string): boolean {
  const normalized = name.trim().toLocaleLowerCase();
  return [
    "birthdays",
    "us holidays",
    "siri suggestions",
    "生日",
    "节假日",
    "中国节假日",
    "siri 建议"
  ].includes(normalized) || normalized.endsWith(" holidays");
}

export function taskCalendarTasks(
  items: TaskIndexItem[],
  navigation: TaskCalendarNavigation,
  selectedDate: string,
  filters: TaskCalendarTaskFilters = {}
): TaskIndexItem[] {
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
    case "overdue":
      filtered = incomplete.filter((item) => Boolean(item.dueDate && item.dueDate < date));
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
    case "upcoming":
      filtered = incomplete.filter((item) => taskDate(item) > date);
      break;
    default:
      filtered = incomplete.filter((item) => matchesDate(item) || Boolean(item.dueDate && item.dueDate < date));
      break;
  }
  const priority = filters.priority ?? "all";
  if (priority !== "all") {
    filtered = filtered.filter((item) => item.priority === priority);
  }
  const query = filters.query?.trim().toLocaleLowerCase() ?? "";
  if (query) {
    filtered = filtered.filter((item) => `${item.text} ${item.fileName} ${item.filePath}`.toLocaleLowerCase().includes(query));
  }
  const project = filters.project;
  if (project) {
    const filePath = project.filePath?.trim().replace(/^\/+/, "") ?? "";
    const tag = normalizeTaskCalendarTag(project.tag);
    filtered = filtered.filter((item) =>
      Boolean(filePath && item.filePath === filePath) || Boolean(tag && taskLineHasTag(item.line, tag))
    );
  }
  return [...filtered].sort((left, right) => {
    if (navigation === "upcoming") return taskDate(left).localeCompare(taskDate(right)) || left.text.localeCompare(right.text);
    return taskSortKey(left, date) - taskSortKey(right, date) || left.text.localeCompare(right.text);
  });
}

export function taskCalendarOpenOptionsForOrganizer(filterId: OrganizerFilterId): TaskCalendarOpenOptions | null {
  switch (filterId) {
    case "tasks":
      return { navigation: "all" };
    case "task-overdue":
      return { navigation: "overdue" };
    case "task-due-today":
      return { navigation: "today", selectedDate: todayTaskCalendarDate(), viewMode: "day" };
    case "task-due-this-week":
      return { navigation: "upcoming", selectedDate: todayTaskCalendarDate(), viewMode: "week" };
    case "task-priority-highest":
      return { navigation: "all", priority: "highest" };
    case "task-priority-high":
      return { navigation: "all", priority: "high" };
    case "task-priority-medium":
      return { navigation: "all", priority: "medium" };
    case "task-priority-low":
      return { navigation: "all", priority: "low" };
    case "task-priority-lowest":
      return { navigation: "all", priority: "lowest" };
    case "task-priority-none":
      return { navigation: "all", priority: "none" };
    default:
      return null;
  }
}

export function taskDate(item: Pick<TaskIndexItem, "dueDate" | "scheduledDate" | "startDate">): string {
  return item.dueDate || item.scheduledDate || item.startDate || "";
}

export function formatTaskCalendarDate(date: string, locale = "zh-CN"): string {
  const parsed = parseDate(normalizeDate(date) || todayTaskCalendarDate());
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(parsed);
}

function normalizeNavigation(value: unknown, fallback: TaskCalendarNavigation): TaskCalendarNavigation {
  if (value === "tomorrow" || value === "week") return "upcoming";
  return value === "upcoming" || value === "inbox" || value === "overdue" || value === "all" || value === "completed" || value === "today" ? value : fallback;
}

function normalizeTaskCalendarTag(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/^#+/, "") : "";
}

function taskLineHasTag(line: string, tag: string): boolean {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)#${escaped}(?=$|\\s|[.,，。;；:：!?！？)])`, "iu").test(line);
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
