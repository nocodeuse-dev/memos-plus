import { setIcon } from "obsidian";
import { t, type Language } from "./i18n";
import { taskCalendarTasks, todayTaskCalendarDate, type TaskCalendarOpenOptions } from "./taskCalendar";
import type { TaskIndexItem } from "./taskIndex";
import type { OrganizerFilterId } from "./organizerPanel";
import {
  learningCardsForFilter,
  type LearningCard,
  type LearningCardFilter
} from "./learning/learningCards";

/**
 * The shared navigation is deliberately only a view adapter.  Task, learning
 * and project data continue to live in their existing services; the two
 * workbench views only provide different content panes for the same routes.
 */
export type WorkbenchSection = "directory" | "tasks" | "learning" | "projects";
export type WorkbenchTaskRoute =
  | "today-todo" | "today-new" | "today-completed"
  | "pending" | "in-progress" | "waiting" | "deferred"
  | "tomorrow" | "this-week" | "next-week" | "no-date"
  | "overdue" | "high-priority" | "stale"
  | "completed" | "cancelled";
export type WorkbenchTaskGroup = "today" | "active" | "time" | "exceptions" | "archive";

export interface WorkbenchDirectoryOptions {
  query?: string;
  organizer?: OrganizerFilterId | "";
}

export interface WorkbenchNavigationCounts {
  pending: number;
  todayNew: number;
  overdue: number;
  completed: number;
  tasks: Record<WorkbenchTaskRoute, number>;
  learning: Record<LearningCardFilter, number>;
}

export interface WorkbenchNavigationOptions {
  language: Language;
  activeSection: WorkbenchSection;
  activeTaskRoute?: WorkbenchTaskRoute | "";
  activeLearningFilter?: LearningCardFilter | "";
  projectsExpanded?: boolean;
  collapsedTaskGroups?: readonly WorkbenchTaskGroup[];
  counts: WorkbenchNavigationCounts;
  onDirectory: () => void;
  onTasks: () => void;
  onTask: (route: WorkbenchTaskRoute) => void;
  onToggleTaskGroup: (group: WorkbenchTaskGroup) => void;
  onLearningHome: () => void;
  onLearning: (filter: LearningCardFilter) => void;
  onProjects: () => void;
}

const TASK_GROUPS: ReadonlyArray<{ id: WorkbenchTaskGroup; icon: string; labelKey: string; routes: ReadonlyArray<{ id: WorkbenchTaskRoute; icon: string; labelKey: string }> }> = [
  { id: "today", icon: "sun", labelKey: "workbench.task.group.today", routes: [
    { id: "today-todo", icon: "calendar-check", labelKey: "workbench.task.todayTodo" },
    { id: "today-new", icon: "calendar-plus", labelKey: "workbench.task.todayNew" },
    { id: "today-completed", icon: "circle-check", labelKey: "workbench.task.todayCompleted" }
  ] },
  { id: "active", icon: "list-todo", labelKey: "workbench.task.group.active", routes: [
    { id: "pending", icon: "list-todo", labelKey: "workbench.task.pending" },
    { id: "in-progress", icon: "play-circle", labelKey: "workbench.task.inProgress" },
    { id: "waiting", icon: "pause-circle", labelKey: "workbench.task.waiting" },
    { id: "deferred", icon: "calendar-clock", labelKey: "workbench.task.deferred" }
  ] },
  { id: "time", icon: "calendar-days", labelKey: "workbench.task.group.time", routes: [
    { id: "tomorrow", icon: "sunrise", labelKey: "workbench.task.tomorrow" },
    { id: "this-week", icon: "calendar-range", labelKey: "workbench.task.thisWeek" },
    { id: "next-week", icon: "calendar-arrow-up", labelKey: "workbench.task.nextWeek" },
    { id: "no-date", icon: "calendar-off", labelKey: "workbench.task.noDate" }
  ] },
  { id: "exceptions", icon: "triangle-alert", labelKey: "workbench.task.group.exceptions", routes: [
    { id: "overdue", icon: "alarm-clock", labelKey: "taskCalendar.nav.overdue" },
    { id: "high-priority", icon: "flame", labelKey: "workbench.task.highPriority" },
    { id: "stale", icon: "clock-alert", labelKey: "workbench.task.stale" }
  ] },
  { id: "archive", icon: "archive", labelKey: "workbench.task.group.archive", routes: [
    { id: "completed", icon: "check-circle-2", labelKey: "taskCalendar.nav.completed" },
    { id: "cancelled", icon: "ban", labelKey: "workbench.task.cancelled" }
  ] }
];

const LEARNING_ROUTES: ReadonlyArray<{ id: LearningCardFilter; icon: string; labelKey: string }> = [
  { id: "today", icon: "brain", labelKey: "taskCalendar.learning.today" },
  { id: "due", icon: "clock-3", labelKey: "taskCalendar.learning.due" },
  { id: "learning", icon: "graduation-cap", labelKey: "taskCalendar.learning.active" },
  { id: "strengthen", icon: "dumbbell", labelKey: "taskCalendar.learning.strengthen" },
  { id: "mastered", icon: "badge-check", labelKey: "taskCalendar.learning.mastered" }
];

export function workbenchNavigationCounts(
  tasks: TaskIndexItem[],
  cards: LearningCard[],
  today = todayTaskCalendarDate()
): WorkbenchNavigationCounts {
  const learningNow = new Date(`${today}T12:00:00`);
  return {
    pending: taskCalendarTasks(tasks, "all", today).length,
    todayNew: tasks.filter((task) => task.createdDate === today).length,
    overdue: taskCalendarTasks(tasks, "overdue", today).length,
    completed: taskCalendarTasks(tasks, "completed", today).length,
    tasks: Object.fromEntries(TASK_GROUPS.flatMap((group) => group.routes).map((route) => [route.id, taskCalendarTasks(tasks, "all", today, workbenchTaskRouteOptions(route.id, today)).length])) as Record<WorkbenchTaskRoute, number>,
    learning: {
      today: learningCardsForFilter(cards, "today", learningNow).length,
      due: learningCardsForFilter(cards, "due", learningNow).length,
      learning: learningCardsForFilter(cards, "learning", learningNow).length,
      strengthen: learningCardsForFilter(cards, "strengthen", learningNow).length,
      mastered: learningCardsForFilter(cards, "mastered", learningNow).length,
      all: learningCardsForFilter(cards, "all", learningNow).length
    }
  };
}

/** Maps a shared-navigation task route to the established TaskCalendar API. */
export function workbenchTaskRouteOptions(route: WorkbenchTaskRoute, today = todayTaskCalendarDate()): TaskCalendarOpenOptions {
  switch (route) {
    case "today-todo": return { navigation: "all", selectedDate: today, viewMode: "day", category: "today-todo" };
    case "today-new":
      return { navigation: "all", selectedDate: today, viewMode: "day", createdOnDate: today };
    case "today-completed": return { navigation: "all", selectedDate: today, viewMode: "day", category: "today-completed" };
    case "in-progress": return { navigation: "all", selectedDate: today, viewMode: "day", category: "in-progress" };
    case "waiting": return { navigation: "all", selectedDate: today, viewMode: "day", category: "waiting" };
    case "deferred": return { navigation: "all", selectedDate: today, viewMode: "day", category: "deferred" };
    case "tomorrow": return { navigation: "all", selectedDate: today, viewMode: "day", category: "tomorrow" };
    case "this-week": return { navigation: "all", selectedDate: today, viewMode: "week", category: "this-week" };
    case "next-week": return { navigation: "all", selectedDate: today, viewMode: "week", category: "next-week" };
    case "no-date": return { navigation: "inbox", selectedDate: today, viewMode: "day", category: "no-date" };
    case "overdue":
      return { navigation: "overdue", selectedDate: today, viewMode: "day", category: "overdue" };
    case "high-priority": return { navigation: "all", selectedDate: today, viewMode: "day", category: "high-priority" };
    case "stale": return { navigation: "all", selectedDate: today, viewMode: "day", category: "stale" };
    case "completed":
      return { navigation: "completed", selectedDate: today, viewMode: "day", category: "completed" };
    case "cancelled": return { navigation: "completed", selectedDate: today, viewMode: "day", category: "cancelled" };
    default:
      return { navigation: "all", selectedDate: today, viewMode: "day" };
  }
}

export function workbenchTaskRouteForOptions(options: TaskCalendarOpenOptions, today = todayTaskCalendarDate()): WorkbenchTaskRoute {
  if (options.createdOnDate === today) return "today-new";
  const categoryRoute = TASK_GROUPS.flatMap((group) => group.routes).find((route) => workbenchTaskRouteOptions(route.id, today).category === options.category)?.id;
  if (categoryRoute) return categoryRoute;
  if (options.navigation === "overdue") return "overdue";
  if (options.navigation === "completed") return "completed";
  return "pending";
}

/**
 * Keeps the tree's second level deliberately exclusive: the active primary
 * section owns the only visible child routes.  Directory and project children
 * are rendered by their established services, because they need the live
 * saved-search and project data owned by those services.
 */
export function workbenchSecondaryRouteIds(section: WorkbenchSection): readonly string[] {
  if (section === "tasks") return TASK_GROUPS.flatMap((group) => group.routes.map((route) => route.id));
  if (section === "learning") return LEARNING_ROUTES.map((route) => route.id);
  return [];
}

export function renderWorkbenchNavigation(container: HTMLElement, options: WorkbenchNavigationOptions): void {
  const root = container.createDiv({ cls: "memos-plus-workbench-navigation", attr: { role: "tree", "aria-label": t(options.language, "workbench.navigation") } });
  const primary = root.createDiv({ cls: "memos-plus-workbench-primary-navigation", attr: { role: "group" } });
  createPrimaryItem(primary, {
    active: options.activeSection === "directory",
    icon: "folder-tree",
    label: t(options.language, "workbench.directory"),
    section: "directory",
    onClick: options.onDirectory
  });
  createPrimaryItem(primary, {
    active: options.activeSection === "tasks",
    icon: "list-todo",
    label: t(options.language, "workbench.tasks"),
    section: "tasks",
    onClick: options.onTasks
  });
  createPrimaryItem(primary, {
    active: options.activeSection === "learning",
    icon: "brain",
    label: t(options.language, "taskCalendar.learning"),
    section: "learning",
    onClick: options.onLearningHome
  });
  createPrimaryItem(primary, {
    active: options.activeSection === "projects",
    icon: "folder-kanban",
    label: t(options.language, "taskCalendar.projects"),
    section: "projects",
    onClick: options.onProjects
  });

  if (options.activeSection === "tasks") {
    for (const group of TASK_GROUPS) {
      const activeRoute = group.routes.some((route) => route.id === options.activeTaskRoute);
      const collapsed = !activeRoute && (options.collapsedTaskGroups ?? []).includes(group.id);
      const section = root.createDiv({ cls: "memos-plus-workbench-nav-section memos-plus-workbench-task-group" });
      const heading = section.createEl("button", {
        cls: "memos-plus-workbench-nav-heading memos-plus-workbench-nav-group-toggle",
        attr: { type: "button", role: "treeitem", "aria-level": "2", "aria-expanded": String(!collapsed), "data-workbench-task-group": group.id }
      });
      setIcon(heading.createSpan({ cls: "memos-plus-workbench-tree-icon", attr: { "aria-hidden": "true" } }), group.icon);
      heading.createSpan({ text: t(options.language, group.labelKey) });
      const chevron = heading.createSpan({ cls: "memos-plus-workbench-nav-chevron", attr: { "aria-hidden": "true" } });
      setIcon(chevron, collapsed ? "chevron-right" : "chevron-down");
      heading.addEventListener("click", () => options.onToggleTaskGroup(group.id));
      if (collapsed) continue;
      const taskSection = section.createDiv({ cls: "memos-plus-workbench-nav-tree-children", attr: { role: "group" } });
      for (const route of group.routes) {
        const active = options.activeTaskRoute === route.id;
        const button = taskSection.createEl("button", {
          cls: `memos-plus-workbench-nav-item${active ? " is-active" : ""}`,
          attr: { type: "button", role: "treeitem", "aria-level": "3", "data-workbench-task-route": route.id }
        });
        setIcon(button, route.icon);
        button.createSpan({ text: t(options.language, route.labelKey) });
        button.createSpan({ cls: `memos-plus-workbench-nav-count${options.counts.tasks[route.id] === 0 ? " is-zero" : ""}`, text: String(options.counts.tasks[route.id]) });
        button.addEventListener("click", () => options.onTask(route.id));
      }
    }
  }

  if (options.activeSection === "learning") {
    const learningSection = createSection(root, t(options.language, "taskCalendar.learning"), "brain");
    for (const route of LEARNING_ROUTES) {
    const active = options.activeSection === "learning" && options.activeLearningFilter === route.id;
    const button = learningSection.createEl("button", {
      cls: `memos-plus-workbench-nav-item${active ? " is-active" : ""}`,
      attr: { type: "button", role: "treeitem", "aria-level": "2", "data-workbench-learning-filter": route.id }
    });
    setIcon(button, route.icon);
    button.createSpan({ text: t(options.language, route.labelKey) });
    button.createSpan({ cls: "memos-plus-workbench-nav-count", text: String(options.counts.learning[route.id]) });
    button.addEventListener("click", () => options.onLearning(route.id));
  }
  }
}

function createPrimaryItem(
  container: HTMLElement,
  options: { active: boolean; icon: string; label: string; section: WorkbenchSection; onClick: () => void }
): void {
  const button = container.createEl("button", {
    cls: `memos-plus-workbench-nav-item memos-plus-workbench-primary-item${options.active ? " is-active" : ""}`,
    attr: { type: "button", role: "treeitem", "aria-level": "1", "data-workbench-section": options.section }
  });
  setIcon(button, options.icon);
  button.createSpan({ text: options.label });
  button.addEventListener("click", options.onClick);
}

function createSection(container: HTMLElement, label: string, icon: string): HTMLElement {
  const section = container.createDiv({ cls: "memos-plus-workbench-nav-section" });
  const heading = section.createDiv({
    cls: "memos-plus-workbench-nav-heading",
    attr: { role: "treeitem", "aria-level": "1", "aria-expanded": "true" }
  });
  setIcon(heading.createSpan({ cls: "memos-plus-workbench-tree-icon", attr: { "aria-hidden": "true" } }), icon);
  heading.createSpan({ text: label });
  return section.createDiv({ cls: "memos-plus-workbench-nav-tree-children", attr: { role: "group" } });
}
