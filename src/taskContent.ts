import type { MemosPlusSettings } from "./settings";
import { buildTasksMarkdownLine, type ProjectTaskOptions, type TaskContentMode } from "./tasksFormat";

export interface TaskContentRenderOptions {
  detailContent?: string;
  contentMode?: TaskContentMode;
  projectTag?: string;
  now?: Date;
}

export function renderTaskContentWithDetail(
  content: string,
  task: ProjectTaskOptions | undefined,
  settings: MemosPlusSettings,
  options: TaskContentRenderOptions = {}
): string {
  const trimmed = content.trim();
  if (!task?.isTask) {
    return trimmed;
  }

  const contentMode = task.contentMode ?? options.contentMode ?? "task-only";
  const taskTitle = taskTitleFromContent(trimmed);
  const taskLine = renderTaskLine(taskTitle, task, settings, options);
  const detail = options.detailContent?.trim() || detailContentFromInput(trimmed);

  if (contentMode !== "task-with-detail" || !detail || normalizeForCompare(detail) === normalizeForCompare(taskTitle)) {
    return taskLine;
  }

  return `${taskLine}\n${indentTaskDetail(detail)}`;
}

export function taskTitleFromContent(content: string): string {
  const trimmed = stripTaskMarker(content.trim());
  const calloutTitle = trimmed.match(/^>\s*\[![^\]]+\][+-]?\s*(.+)?/);
  if (calloutTitle) {
    return (calloutTitle[1] || "详情").trim();
  }
  if (trimmed.startsWith("```")) {
    const firstCodeLine = trimmed
      .split("\n")
      .slice(1)
      .find((line) => line.trim() && !line.trim().startsWith("```"));
    return firstCodeLine?.trim() || "代码块";
  }
  return trimmed.split("\n").find((line) => line.trim())?.trim() || "任务";
}

export function indentTaskDetail(content: string): string {
  return content
    .trim()
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function renderTaskLine(content: string, task: ProjectTaskOptions, settings: MemosPlusSettings, options: TaskContentRenderOptions): string {
  if (settings.tasksFormatEnabled) {
    return buildTasksMarkdownLine(
      content,
      {
        priority: task.priority ?? settings.taskDefaultPriority,
        projectTag: options.projectTag,
        startDate: task.startDate,
        scheduledDate: task.scheduledDate ?? settings.taskDefaultScheduledDate,
        dueDate: task.dueDate ?? settings.taskDefaultDueDate,
        recurrence: task.recurrence ?? settings.taskDefaultRecurrence,
        customRecurrence: task.customRecurrence,
        addCreatedDate: task.addCreatedDate ?? settings.taskAddCreatedDate,
        createdDate: task.createdDate,
        doneDate: task.doneDate
      },
      options.now
    );
  }
  return `- [ ] ${stripTaskMarker(content)}`.trimEnd();
}

function detailContentFromInput(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("> [!")) {
    return trimmed;
  }
  if (trimmed.startsWith("```")) {
    return trimmed;
  }
  return "";
}

function stripTaskMarker(content: string): string {
  return content.replace(/^\s*[-*]\s+\[[ xX]\]\s*/, "").trim();
}

function normalizeForCompare(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}
