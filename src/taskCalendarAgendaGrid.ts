import type { AppleCalendarAgendaEvent } from "./appleCalendarAgenda";
import type { TaskIndexItem } from "./taskIndex";

export const TASK_CALENDAR_GRID_START_HOUR = 6;
export const TASK_CALENDAR_GRID_END_HOUR = 22;
export const TASK_CALENDAR_GRID_MINUTES_PER_HOUR = 64;

export interface TaskCalendarGridPlacement {
  dayIndex: number;
  top: number;
  height: number;
}

/**
 * Convert one timed Apple event into a bounded visual placement.  Rendering
 * stays local: this neither changes Calendar nor stores an event in data.json.
 */
export function taskCalendarGridPlacement(
  event: Pick<AppleCalendarAgendaEvent, "start" | "end" | "allDay">,
  days: string[],
  startHour = TASK_CALENDAR_GRID_START_HOUR,
  endHour = TASK_CALENDAR_GRID_END_HOUR
): TaskCalendarGridPlacement | null {
  if (event.allDay) return null;
  const start = new Date(event.start);
  const end = new Date(event.end);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const dayIndex = days.indexOf(localDate(start));
  if (dayIndex < 0) return null;
  const startMinutes = start.getHours() * 60 + start.getMinutes();
  const endMinutes = end.getTime() > start.getTime()
    ? end.getHours() * 60 + end.getMinutes() + (localDate(end) !== localDate(start) ? 24 * 60 : 0)
    : startMinutes + 30;
  const visibleStart = startHour * 60;
  const visibleEnd = endHour * 60;
  if (startMinutes >= visibleEnd || endMinutes <= visibleStart) return null;
  const topMinutes = Math.max(visibleStart, startMinutes) - visibleStart;
  const visibleMinutes = Math.max(20, Math.min(visibleEnd, endMinutes) - Math.max(visibleStart, startMinutes));
  return {
    dayIndex,
    top: topMinutes / 60 * TASK_CALENDAR_GRID_MINUTES_PER_HOUR,
    height: visibleMinutes / 60 * TASK_CALENDAR_GRID_MINUTES_PER_HOUR
  };
}

/** Place a dated task with a concrete due time on the same local time grid. */
export function taskCalendarTimedTaskPlacement(
  task: Pick<TaskIndexItem, "dueDate" | "scheduledDate" | "startDate" | "dueTime" | "allDay">,
  days: string[],
  startHour = TASK_CALENDAR_GRID_START_HOUR,
  endHour = TASK_CALENDAR_GRID_END_HOUR
): TaskCalendarGridPlacement | null {
  const date = task.dueDate || task.scheduledDate || task.startDate;
  if (!date || !task.dueTime || task.allDay) return null;
  const start = new Date(`${date}T${task.dueTime}:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 30 * 60_000);
  return taskCalendarGridPlacement({ start: start.toISOString(), end: end.toISOString(), allDay: false }, days, startHour, endHour);
}

function localDate(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}
