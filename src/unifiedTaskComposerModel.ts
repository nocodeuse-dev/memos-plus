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
  const task: ProjectTaskOptions = {
    isTask: true,
    priority: parsed.priority === "none" ? taskSettings.defaultPriority : parsed.priority,
    projectTag: defaults.projectTag ?? taskSettings.defaultProjectTag ?? "",
    dueDate: parsed.date || defaults.fallbackDueDate || taskSettings.defaultDueDate,
    dueTime: parsed.time,
    reminderMinutesBefore: parsed.reminderMinutesBefore,
    scheduledDate: taskSettings.defaultScheduledDate,
    recurrence: taskSettings.defaultRecurrence,
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
  if (parsed.original.includes("\n")) return parsed.original;
  if (!parsed.matched) return parsed.original;
  return [parsed.title, ...parsed.tags].filter(Boolean).join(" ");
}
