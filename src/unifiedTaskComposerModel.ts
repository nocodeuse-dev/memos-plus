import type { TaskOptionsFormSettings } from "./taskOptionsForm";
import { parseNaturalLanguageTask, type ParsedNaturalLanguageTask } from "./taskNaturalLanguage";
import type { ProjectTaskOptions } from "./tasksFormat";

export interface UnifiedTaskComposerDefaults {
  fallbackDueDate?: string;
  projectTag?: string;
  task?: ProjectTaskOptions;
}

export interface UnifiedTaskDraft {
  source: string;
  content: string;
  parsed: ParsedNaturalLanguageTask;
  task: ProjectTaskOptions;
}

export function createUnifiedTaskDraft(
  input: string,
  taskSettings: TaskOptionsFormSettings,
  defaults: UnifiedTaskComposerDefaults = {}
): UnifiedTaskDraft {
  const source = input.trim();
  const parsed = parseNaturalLanguageTask(source);
  const parsedDate = parsed.date || (parsed.requiresDateConfirmation ? "" : defaults.fallbackDueDate || taskSettings.defaultDueDate);
  const task: ProjectTaskOptions = {
    isTask: true,
    priority: parsed.priority === "none" ? taskSettings.defaultPriority : parsed.priority,
    projectTag: defaults.projectTag ?? taskSettings.defaultProjectTag ?? "",
    startDate: parsed.startDate || parsedDate,
    startTime: parsed.startTime,
    endDate: parsed.endDate,
    endTime: parsed.endTime,
    dueDate: parsedDate,
    dueTime: parsed.dueTime || parsed.time,
    reminderDate: parsed.reminderDate,
    reminderTime: parsed.reminderTime,
    reminderMinutesBefore: parsed.reminderMinutesBefore,
    scheduledDate: parsed.requiresDateConfirmation ? "" : parsedDate || taskSettings.defaultScheduledDate,
    recurrence: parsed.recurrence === "none" ? taskSettings.defaultRecurrence : parsed.recurrence,
    customRecurrence: parsed.customRecurrence,
    addCreatedDate: taskSettings.addCreatedDate,
    syncTarget: taskSettings.defaultSyncTarget ?? (taskSettings.appleSyncEnabled ? "reminders" : "tasks"),
    syncTag: taskSettings.appleSyncTag,
    ...defaults.task
  };
  return {
    source,
    content: normalizedTaskContent(parsed),
    parsed,
    task
  };
}

function normalizedTaskContent(parsed: ParsedNaturalLanguageTask): string {
  if (parsed.original.includes("\n") || parsed.requiresDateConfirmation) return parsed.original;
  if (!parsed.matched) return parsed.original;
  return [parsed.title, ...parsed.tags].filter(Boolean).join(" ");
}
