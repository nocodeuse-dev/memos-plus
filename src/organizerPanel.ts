import type { MemoItem } from "./markdown";
import { parseTaskLines, type ParsedTaskLine, type TaskPriorityFilterValue } from "./taskSearch";

export type OrganizerPanelSectionId = "inbox" | "today" | "unarchived" | "links" | "images" | "tasks";
export type OrganizerTaskBranchId =
  | "task-priority-highest"
  | "task-priority-high"
  | "task-priority-medium"
  | "task-priority-low"
  | "task-priority-lowest"
  | "task-priority-none"
  | "task-overdue"
  | "task-due-today"
  | "task-due-this-week";
export type OrganizerFilterId = OrganizerPanelSectionId | OrganizerTaskBranchId;
export type OrganizerMemoLastAction = "organized" | "archived" | "transferred" | "deleted";

export interface OrganizerPanelSectionSettings {
  visible: boolean;
  desktopHeight: number;
  mobileHeight: number;
}

export type OrganizerPanelSectionsSettings = Record<OrganizerPanelSectionId, OrganizerPanelSectionSettings>;

export interface OrganizerMemoState {
  organized: boolean;
  organizedAt: string;
  lastAction: OrganizerMemoLastAction;
  targetPath: string;
}

export type OrganizerMemoStates = Record<string, OrganizerMemoState>;

export interface OrganizerPanelSectionDefinition {
  id: OrganizerPanelSectionId;
  labelKey: string;
  icon: string;
}

export interface OrganizerTaskBranchDefinition {
  id: OrganizerTaskBranchId;
  labelKey: string;
  icon: string;
  type: "priority" | "date";
  priority?: TaskPriorityFilterValue;
}

export interface OrganizerPanelSectionData {
  id: OrganizerFilterId;
  labelKey: string;
  icon: string;
  total: number;
  items: MemoItem[];
  settings?: OrganizerPanelSectionSettings;
}

export const ORGANIZER_PANEL_SECTION_DEFINITIONS: OrganizerPanelSectionDefinition[] = [
  { id: "inbox", labelKey: "organizer.section.inbox", icon: "inbox" },
  { id: "today", labelKey: "organizer.section.today", icon: "calendar-days" },
  { id: "unarchived", labelKey: "organizer.section.unarchived", icon: "archive-restore" },
  { id: "links", labelKey: "organizer.section.links", icon: "link" },
  { id: "images", labelKey: "organizer.section.images", icon: "image" },
  { id: "tasks", labelKey: "organizer.section.tasks", icon: "list-checks" }
];

export const ORGANIZER_TASK_PRIORITY_BRANCH_DEFINITIONS: OrganizerTaskBranchDefinition[] = [
  { id: "task-priority-highest", labelKey: "organizer.taskBranch.priorityHighest", icon: "chevrons-up", type: "priority", priority: "highest" },
  { id: "task-priority-high", labelKey: "organizer.taskBranch.priorityHigh", icon: "chevron-up", type: "priority", priority: "high" },
  { id: "task-priority-medium", labelKey: "organizer.taskBranch.priorityMedium", icon: "arrow-up", type: "priority", priority: "medium" },
  { id: "task-priority-low", labelKey: "organizer.taskBranch.priorityLow", icon: "chevron-down", type: "priority", priority: "low" },
  { id: "task-priority-lowest", labelKey: "organizer.taskBranch.priorityLowest", icon: "chevrons-down", type: "priority", priority: "lowest" },
  { id: "task-priority-none", labelKey: "organizer.taskBranch.priorityNone", icon: "circle", type: "priority", priority: "none" }
];

export const ORGANIZER_TASK_DATE_BRANCH_DEFINITIONS: OrganizerTaskBranchDefinition[] = [
  { id: "task-overdue", labelKey: "organizer.taskBranch.overdue", icon: "alarm-clock", type: "date" },
  { id: "task-due-today", labelKey: "organizer.taskBranch.dueToday", icon: "calendar-check", type: "date" },
  { id: "task-due-this-week", labelKey: "organizer.taskBranch.dueThisWeek", icon: "calendar-range", type: "date" }
];

export const ORGANIZER_TASK_BRANCH_DEFINITIONS: OrganizerTaskBranchDefinition[] = [
  ...ORGANIZER_TASK_PRIORITY_BRANCH_DEFINITIONS,
  ...ORGANIZER_TASK_DATE_BRANCH_DEFINITIONS
];

export const DEFAULT_ORGANIZER_PANEL_DESKTOP_HEIGHT = 220;
export const DEFAULT_ORGANIZER_PANEL_MOBILE_HEIGHT = 160;

export const DEFAULT_ORGANIZER_PANEL_SECTIONS: OrganizerPanelSectionsSettings = ORGANIZER_PANEL_SECTION_DEFINITIONS.reduce(
  (sections, definition) => {
    sections[definition.id] = {
      visible: true,
      desktopHeight: DEFAULT_ORGANIZER_PANEL_DESKTOP_HEIGHT,
      mobileHeight: DEFAULT_ORGANIZER_PANEL_MOBILE_HEIGHT
    };
    return sections;
  },
  {} as OrganizerPanelSectionsSettings
);

export function normalizeOrganizerPanelHeight(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(80, Math.min(480, Math.floor(parsed)));
}

export function normalizeOrganizerPanelSections(value: unknown): OrganizerPanelSectionsSettings {
  const raw = isRecord(value) ? value : {};
  return ORGANIZER_PANEL_SECTION_DEFINITIONS.reduce((sections, definition) => {
    const candidate = raw[definition.id];
    const item: Record<string, unknown> = isRecord(candidate) ? candidate : {};
    const defaults = DEFAULT_ORGANIZER_PANEL_SECTIONS[definition.id];
    sections[definition.id] = {
      visible: typeof item.visible === "boolean" ? item.visible : defaults.visible,
      desktopHeight: normalizeOrganizerPanelHeight(item.desktopHeight, defaults.desktopHeight),
      mobileHeight: normalizeOrganizerPanelHeight(item.mobileHeight, defaults.mobileHeight)
    };
    return sections;
  }, {} as OrganizerPanelSectionsSettings);
}

export function normalizeOrganizerMemoStates(value: unknown): OrganizerMemoStates {
  if (!isRecord(value)) {
    return {};
  }
  const result: OrganizerMemoStates = {};
  for (const [memoId, state] of Object.entries(value)) {
    if (!memoId || !isRecord(state) || state.organized !== true || typeof state.organizedAt !== "string") {
      continue;
    }
    result[memoId] = {
      organized: true,
      organizedAt: state.organizedAt,
      lastAction: normalizeOrganizerMemoLastAction(state.lastAction),
      targetPath: typeof state.targetPath === "string" ? state.targetPath : ""
    };
  }
  return result;
}

export function createOrganizerMemoState(lastAction: OrganizerMemoLastAction, targetPath = "", now = new Date()): OrganizerMemoState {
  return {
    organized: true,
    organizedAt: now.toISOString(),
    lastAction,
    targetPath
  };
}

export function buildOrganizerPanelSections(
  memos: MemoItem[],
  options: {
    today: string;
    states: OrganizerMemoStates;
    sectionSettings: OrganizerPanelSectionsSettings;
    limit: number;
  }
): OrganizerPanelSectionData[] {
  return ORGANIZER_PANEL_SECTION_DEFINITIONS.flatMap((definition) => {
    const settings = options.sectionSettings[definition.id] ?? DEFAULT_ORGANIZER_PANEL_SECTIONS[definition.id];
    if (!settings.visible) {
      return [];
    }
    const filtered = filterMemosForOrganizerSection(definition.id, memos, {
      today: options.today,
      states: options.states
    });
    return [
      {
        ...definition,
        total: filtered.length,
        items: filtered.slice(0, Math.max(1, options.limit)),
        settings
      }
    ];
  });
}

export function buildOrganizerTaskBranchSections(
  memos: MemoItem[],
  options: {
    today: string;
    showPriorityBranches: boolean;
    showDateBranches: boolean;
    limit?: number;
  }
): OrganizerPanelSectionData[] {
  const definitions = getOrganizerTaskBranchDefinitions(options);
  return definitions.map((definition) => {
    const filtered = filterMemosForOrganizerTaskBranch(definition.id, memos, options.today);
    return {
      id: definition.id,
      labelKey: definition.labelKey,
      icon: definition.icon,
      total: filtered.length,
      items: options.limit && options.limit > 0 ? filtered.slice(0, options.limit) : []
    };
  });
}

export function getOrganizerTaskBranchDefinitions(options: { showPriorityBranches: boolean; showDateBranches: boolean }): OrganizerTaskBranchDefinition[] {
  return [
    ...(options.showPriorityBranches ? ORGANIZER_TASK_PRIORITY_BRANCH_DEFINITIONS : []),
    ...(options.showDateBranches ? ORGANIZER_TASK_DATE_BRANCH_DEFINITIONS : [])
  ];
}

export function filterMemosForOrganizerSection(
  sectionId: OrganizerPanelSectionId,
  memos: MemoItem[],
  options: { today: string; states: OrganizerMemoStates }
): MemoItem[] {
  return memos
    .filter((memo) => memoMatchesOrganizerSection(sectionId, memo, options))
    .sort((left, right) => right.datetime.getTime() - left.datetime.getTime());
}

export function filterMemosForOrganizerFilter(
  filterId: OrganizerFilterId,
  memos: MemoItem[],
  options: { today: string; states: OrganizerMemoStates }
): MemoItem[] {
  return isOrganizerTaskBranchId(filterId)
    ? filterMemosForOrganizerTaskBranch(filterId, memos, options.today)
    : filterMemosForOrganizerSection(filterId, memos, options);
}

export function organizerFilterLabelKey(filterId: OrganizerFilterId): string {
  return ORGANIZER_TASK_BRANCH_DEFINITIONS.find((definition) => definition.id === filterId)?.labelKey ?? `organizer.section.${filterId}`;
}

export function isOrganizerTaskBranchId(value: string): value is OrganizerTaskBranchId {
  return ORGANIZER_TASK_BRANCH_DEFINITIONS.some((definition) => definition.id === value);
}

export function memoIsOrganized(memo: MemoItem, states: OrganizerMemoStates): boolean {
  return states[memo.id]?.organized === true;
}

function memoMatchesOrganizerSection(sectionId: OrganizerPanelSectionId, memo: MemoItem, options: { today: string; states: OrganizerMemoStates }): boolean {
  if (memo.isArchived) {
    return false;
  }
  switch (sectionId) {
    case "inbox":
      return !memoIsOrganized(memo, options.states);
    case "today":
      return memo.date === options.today;
    case "unarchived":
      return true;
    case "links":
      return memo.hasLink;
    case "images":
      return memo.hasImage;
    case "tasks":
      return memoHasOpenTask(memo);
    default:
      return false;
  }
}

function filterMemosForOrganizerTaskBranch(sectionId: OrganizerTaskBranchId, memos: MemoItem[], today: string): MemoItem[] {
  return memos
    .filter((memo) => !memo.isArchived && openTasksForMemo(memo).some((task) => taskMatchesOrganizerTaskBranch(task, sectionId, today)))
    .sort((left, right) => right.datetime.getTime() - left.datetime.getTime());
}

function memoHasOpenTask(memo: MemoItem): boolean {
  return memo.hasOpenTask || openTasksForMemo(memo).length > 0;
}

function openTasksForMemo(memo: MemoItem): ParsedTaskLine[] {
  return parseTaskLines(memo.content).filter((task) => !task.completed);
}

function taskMatchesOrganizerTaskBranch(task: ParsedTaskLine, sectionId: OrganizerTaskBranchId, today: string): boolean {
  const definition = ORGANIZER_TASK_BRANCH_DEFINITIONS.find((item) => item.id === sectionId);
  if (!definition) {
    return false;
  }
  if (definition.type === "priority") {
    return task.priority === definition.priority;
  }
  if (sectionId === "task-overdue") {
    return Boolean(task.dueDate) && task.dueDate < today;
  }
  if (sectionId === "task-due-today") {
    return task.dueDate === today;
  }
  if (sectionId === "task-due-this-week") {
    const start = startOfWeek(today);
    const end = addDays(start, 6);
    return Boolean(task.dueDate) && task.dueDate >= start && task.dueDate <= end;
  }
  return false;
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

function normalizeOrganizerMemoLastAction(value: unknown): OrganizerMemoLastAction {
  if (value === "archived" || value === "transferred" || value === "deleted") {
    return value;
  }
  return "organized";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
