import { App, TFile } from "obsidian";
import type { TaskIndexItem } from "./taskIndex";
import { replaceIndexedTaskLine, toggleTaskCheckbox } from "./taskLineActions";

export { replaceIndexedTaskLine, toggleTaskCheckbox } from "./taskLineActions";

interface TasksApiV1 {
  editTaskLineModal(taskLine: string): Promise<string>;
  executeToggleTaskDoneCommand(line: string, path: string): string;
}

interface AppWithCommunityPlugins extends App {
  plugins?: {
    plugins?: Record<string, { apiV1?: Partial<TasksApiV1> }>;
  };
}

export type TaskMutationFailure = "missing-file" | "stale-task" | "cancelled" | "tasks-api-unavailable";

export interface TaskMutationResult {
  updated: boolean;
  file?: TFile;
  failure?: TaskMutationFailure;
}

export function getTasksApi(app: App): Partial<TasksApiV1> | null {
  return (app as AppWithCommunityPlugins).plugins?.plugins?.["obsidian-tasks-plugin"]?.apiV1 ?? null;
}

export async function toggleIndexedTask(app: App, task: TaskIndexItem): Promise<TaskMutationResult> {
  const tasksApi = getTasksApi(app);
  const replacement = tasksApi?.executeToggleTaskDoneCommand
    ? tasksApi.executeToggleTaskDoneCommand(task.line, task.filePath)
    : toggleTaskCheckbox(task.line);
  return mutateIndexedTaskLine(app, task, replacement);
}

export async function editIndexedTaskWithTasksApi(app: App, task: TaskIndexItem): Promise<TaskMutationResult> {
  const editTaskLineModal = getTasksApi(app)?.editTaskLineModal;
  if (!editTaskLineModal) {
    return { updated: false, failure: "tasks-api-unavailable" };
  }
  const replacement = await editTaskLineModal(task.line);
  if (!replacement) {
    return { updated: false, failure: "cancelled" };
  }
  return mutateIndexedTaskLine(app, task, replacement);
}

async function mutateIndexedTaskLine(app: App, task: TaskIndexItem, replacement: string): Promise<TaskMutationResult> {
  const file = app.vault.getAbstractFileByPath(task.filePath);
  if (!(file instanceof TFile)) {
    return { updated: false, failure: "missing-file" };
  }
  let updated = false;
  await app.vault.process(file, (source) => {
    const result = replaceIndexedTaskLine(source, task, replacement);
    updated = result.updated;
    return result.source;
  });
  return updated ? { updated: true, file } : { updated: false, file, failure: "stale-task" };
}
