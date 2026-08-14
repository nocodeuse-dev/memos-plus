import {
  shiftTaskCalendarDate,
  taskCalendarCompletedOnDate,
  taskDate,
  todayTaskCalendarDate,
  type TaskCalendarQuickPanelTab
} from "./taskCalendar";
import type { TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";

export function quickTaskPanelItems(
  items: TaskIndexItem[],
  tab: TaskCalendarQuickPanelTab,
  today = todayTaskCalendarDate()
): TaskIndexItem[] {
  const endDate = shiftTaskCalendarDate(today, "day", 6);
  const filtered = items.filter((item) => {
    const date = taskDate(item);
    if (tab === "today") return (!item.completed && date === today) || taskCalendarCompletedOnDate(item, today);
    if (tab === "next-seven") return !item.completed && Boolean(date && date >= today && date <= endDate);
    if (tab === "important") return !item.completed && (item.priority === "highest" || item.priority === "high");
    return !item.completed && Boolean(date && date < today);
  });
  return [...filtered].sort((left, right) => {
    if (tab === "today" && left.completed !== right.completed) return left.completed ? 1 : -1;
    if (tab === "today" && left.completed && right.completed) {
      const placementOrder = Number(taskDate(left) !== today) - Number(taskDate(right) !== today);
      if (placementOrder) return placementOrder;
    }
    return taskDate(left).localeCompare(taskDate(right))
      || quickTaskTime(left).localeCompare(quickTaskTime(right))
      || priorityRank(left.priority) - priorityRank(right.priority)
      || left.title.localeCompare(right.title);
  });
}

export function quickTaskTime(task: Pick<TaskIndexItem, "dueTime" | "startTime">): string {
  return task.dueTime || task.startTime || "";
}

function priorityRank(priority: TaskPriorityFilterValue): number {
  return ({ highest: 0, high: 1, medium: 2, low: 3, lowest: 4, none: 5 } as const)[priority];
}
