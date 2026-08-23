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
export type WorkbenchTaskRoute = "pending" | "today-new" | "overdue" | "completed";

export interface WorkbenchDirectoryOptions {
  query?: string;
  organizer?: OrganizerFilterId | "";
}

export interface WorkbenchNavigationCounts {
  pending: number;
  todayNew: number;
  overdue: number;
  completed: number;
  learning: Record<LearningCardFilter, number>;
}

export interface WorkbenchNavigationOptions {
  language: Language;
  activeSection: WorkbenchSection;
  activeTaskRoute?: WorkbenchTaskRoute | "";
  activeLearningFilter?: LearningCardFilter | "";
  projectsExpanded?: boolean;
  counts: WorkbenchNavigationCounts;
  onDirectory: () => void;
  onTask: (route: WorkbenchTaskRoute) => void;
  onLearning: (filter: LearningCardFilter) => void;
  onProjects: () => void;
}

const TASK_ROUTES: ReadonlyArray<{ id: WorkbenchTaskRoute; icon: string; labelKey: string; countKey: keyof Pick<WorkbenchNavigationCounts, "pending" | "todayNew" | "overdue" | "completed"> }> = [
  { id: "pending", icon: "list-todo", labelKey: "workbench.task.pending", countKey: "pending" },
  { id: "today-new", icon: "calendar-plus", labelKey: "workbench.task.todayNew", countKey: "todayNew" },
  { id: "overdue", icon: "alarm-clock", labelKey: "taskCalendar.nav.overdue", countKey: "overdue" },
  { id: "completed", icon: "check-circle-2", labelKey: "taskCalendar.nav.completed", countKey: "completed" }
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
    case "today-new":
      return { navigation: "all", selectedDate: today, viewMode: "day", createdOnDate: today };
    case "overdue":
      return { navigation: "overdue", selectedDate: today, viewMode: "day" };
    case "completed":
      return { navigation: "completed", selectedDate: today, viewMode: "day" };
    default:
      return { navigation: "all", selectedDate: today, viewMode: "day" };
  }
}

export function renderWorkbenchNavigation(container: HTMLElement, options: WorkbenchNavigationOptions): void {
  const root = container.createDiv({ cls: "memos-plus-workbench-navigation", attr: { role: "tree", "aria-label": t(options.language, "workbench.navigation") } });
  const directory = root.createEl("button", {
    cls: `memos-plus-workbench-nav-item${options.activeSection === "directory" ? " is-active" : ""}`,
    attr: { type: "button", role: "treeitem", "aria-level": "1", "data-workbench-section": "directory" }
  });
  setIcon(directory, "folder-tree");
  directory.createSpan({ text: t(options.language, "workbench.directory") });
  directory.addEventListener("click", options.onDirectory);

  const taskSection = createSection(root, t(options.language, "workbench.tasks"), "list-todo");
  for (const route of TASK_ROUTES) {
    const active = options.activeSection === "tasks" && options.activeTaskRoute === route.id;
    const button = taskSection.createEl("button", {
      cls: `memos-plus-workbench-nav-item${active ? " is-active" : ""}`,
      attr: { type: "button", role: "treeitem", "aria-level": "2", "data-workbench-task-route": route.id }
    });
    setIcon(button, route.icon);
    button.createSpan({ text: t(options.language, route.labelKey) });
    button.createSpan({ cls: "memos-plus-workbench-nav-count", text: String(options.counts[route.countKey]) });
    button.addEventListener("click", () => options.onTask(route.id));
  }

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

  const projects = root.createEl("button", {
    cls: `memos-plus-workbench-nav-item${options.activeSection === "projects" ? " is-active" : ""}`,
    attr: { type: "button", role: "treeitem", "aria-level": "1", "aria-expanded": String(Boolean(options.projectsExpanded)), "data-workbench-section": "projects" }
  });
  setIcon(projects, "folder-kanban");
  projects.createSpan({ text: t(options.language, "taskCalendar.projects") });
  const chevron = projects.createSpan({ cls: "memos-plus-workbench-nav-chevron", attr: { "aria-hidden": "true" } });
  setIcon(chevron, options.projectsExpanded ? "chevron-down" : "chevron-right");
  projects.addEventListener("click", options.onProjects);
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
