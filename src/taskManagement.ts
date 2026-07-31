import { filterTaskIndexItems, sortTaskIndexItems, type TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";

export type TaskManagementFilter = "open" | "overdue" | "today" | "week" | "completed";

export function taskManagementCounts(items: TaskIndexItem[], today: string): Record<TaskManagementFilter, number> {
  return {
    open: items.filter((item) => !item.completed).length,
    overdue: filterTaskIndexItems(items, "task-overdue", today).length,
    today: filterTaskIndexItems(items, "task-due-today", today).length,
    week: filterTaskIndexItems(items, "task-due-this-week", today).length,
    completed: items.filter((item) => item.completed).length
  };
}

export function filterTaskManagementItems(
  items: TaskIndexItem[],
  options: { filter: TaskManagementFilter; priority: TaskPriorityFilterValue | "all"; query: string; today: string }
): TaskIndexItem[] {
  let filtered: TaskIndexItem[];
  switch (options.filter) {
    case "overdue":
      filtered = filterTaskIndexItems(items, "task-overdue", options.today);
      break;
    case "today":
      filtered = filterTaskIndexItems(items, "task-due-today", options.today);
      break;
    case "week":
      filtered = filterTaskIndexItems(items, "task-due-this-week", options.today);
      break;
    case "completed":
      filtered = sortTaskIndexItems(items.filter((item) => item.completed));
      break;
    default:
      filtered = filterTaskIndexItems(items, "tasks", options.today);
  }
  if (options.priority !== "all") {
    filtered = filtered.filter((item) => item.priority === options.priority);
  }
  if (options.query) {
    filtered = filtered.filter((item) => `${item.text} ${item.fileName} ${item.filePath}`.toLowerCase().includes(options.query));
  }
  return filtered;
}
