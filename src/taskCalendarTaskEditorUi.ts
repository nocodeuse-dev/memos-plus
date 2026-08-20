import { setIcon } from "obsidian";
import { taskDate, type TaskCalendarProjectFilter } from "./taskCalendar";
import { TaskCalendarEditSession, type TaskCalendarEditSnapshot } from "./taskCalendarEditSession";
import {
  parseTaskCalendarDetailMetadata,
  taskCalendarPostponeDate,
  taskCalendarTaskProjectTag,
  taskCalendarTaskRecurrence,
  taskCalendarTaskTags
} from "./taskCalendarTaskEditor";
import type { TaskIndexItem } from "./taskIndex";
import type { TaskPriorityFilterValue } from "./taskSearch";
import { t, type Language } from "./i18n";
import type { TaskRecurrence, TaskSyncTarget } from "./tasksFormat";
import { taskCompletionDate, taskCompletionTime } from "./taskCompletion";

export interface TaskCalendarAppleStatus {
  label: string;
  title: string;
  error: boolean;
}

export interface TaskCalendarTaskEditorUiOptions {
  language: Language;
  task: TaskIndexItem;
  session: TaskCalendarEditSession;
  projects: TaskCalendarProjectFilter[];
  projectTagPrefix: string;
  appleSyncTag: string;
  appleStatus: (task: TaskIndexItem) => TaskCalendarAppleStatus | null;
  onBack?: () => void;
  onOpenSource: (task: TaskIndexItem) => void;
  onTasksEdit?: (task: TaskIndexItem) => void;
  onToggleCompleted: (task: TaskIndexItem) => Promise<TaskIndexItem | null>;
}

export function renderTaskCalendarTaskEditor(container: HTMLElement, options: TaskCalendarTaskEditorUiOptions): () => void {
  const { language: lang, session } = options;
  let task = session.getSnapshot().task;
  const detail = parseTaskCalendarDetailMetadata(task.line);
  const form = container.createDiv({ cls: "memos-plus-task-calendar-task-details" });
  const toolbar = form.createDiv({ cls: "memos-plus-task-calendar-task-detail-toolbar" });
  if (options.onBack) {
    const back = iconButton(toolbar, "arrow-left", t(lang, "taskCalendar.backToTasks"), options.onBack);
    back.addClass("memos-plus-task-calendar-task-detail-back");
  }
  toolbar.createDiv({ cls: "memos-plus-task-calendar-task-detail-path", text: task.filePath, attr: { title: task.filePath } });
  const status = toolbar.createSpan({ cls: "memos-plus-task-calendar-task-detail-sync" });
  const retry = toolbar.createEl("button", { cls: "memos-plus-task-calendar-task-detail-retry", type: "button", text: t(lang, "taskCalendar.retry") });
  retry.addEventListener("click", () => session.retry());
  session.setListener((snapshot) => updateTaskEditStatus(status, retry, snapshot, lang, options.appleStatus));

  const completed = taskDetailCheckbox(form, t(lang, "taskCalendar.detail.completed"), task.completed);
  const completedAt = taskDetailReadonlyField(form, t(lang, "taskCalendar.detail.completedAt"), completionTimeLabel(task, lang));
  completedAt.field.toggleClass("is-hidden", !completionTimeLabel(task, lang));
  const title = taskDetailTextField(form, t(lang, "taskCalendar.detail.title"), task.title);
  const row = form.createDiv({ cls: "memos-plus-task-calendar-task-detail-grid" });
  const date = taskDetailInput(row, t(lang, "taskCalendar.detail.date"), "date", taskDate(task));
  const time = taskDetailInput(row, t(lang, "taskCalendar.detail.time"), "time", task.dueTime || task.startTime);
  const reminderDate = taskDetailInput(row, t(lang, "taskCalendar.detail.reminderDate"), "date", task.reminderDate);
  const reminderTime = taskDetailInput(row, t(lang, "taskCalendar.detail.reminderTime"), "time", task.reminderTime);
  const reminderLead = taskDetailInput(row, t(lang, "taskCalendar.detail.reminderLead"), "number", task.reminderMinutesBefore === undefined ? "" : String(task.reminderMinutesBefore));
  reminderLead.min = "0";
  reminderLead.max = "10080";

  const priority = taskDetailSelect(form, t(lang, "taskCalendar.detail.priority"), [
    ["none", t(lang, "taskPriority.none")],
    ["highest", t(lang, "taskPriority.highest")],
    ["high", t(lang, "taskPriority.high")],
    ["medium", t(lang, "taskPriority.medium")],
    ["low", t(lang, "taskPriority.low")],
    ["lowest", t(lang, "taskPriority.lowest")]
  ], task.priority);
  const syncTarget = taskDetailSelect(form, t(lang, "taskCalendar.detail.syncTarget"), [
    ["tasks", t(lang, "projectSend.syncTarget.tasks")],
    ["reminders", t(lang, "projectSend.syncTarget.reminders")],
    ["calendar", t(lang, "projectSend.syncTarget.calendar")]
  ], task.syncTarget || (task.appleSyncTagged ? "reminders" : "tasks"));
  const currentRecurrence = taskCalendarTaskRecurrence(task.line);
  const recurrence = taskDetailSelect(form, t(lang, "taskCalendar.detail.recurrence"), [
    ["none", t(lang, "taskRecurrence.none")],
    ["daily", t(lang, "taskRecurrence.daily")],
    ["weekdays", t(lang, "taskRecurrence.weekdays")],
    ["weekly", t(lang, "taskRecurrence.weekly")],
    ["monthly", t(lang, "taskRecurrence.monthly")],
    ["yearly", t(lang, "taskRecurrence.yearly")],
    ["custom", t(lang, "taskRecurrence.custom")]
  ], currentRecurrence.recurrence);
  const customRecurrence = taskDetailTextField(form, t(lang, "taskCalendar.detail.customRecurrence"), currentRecurrence.customRecurrence);
  customRecurrence.closest<HTMLElement>(".memos-plus-task-calendar-task-detail-field")?.toggleClass("is-hidden", recurrence.value !== "custom");

  const currentProject = taskCalendarTaskProjectTag(task.line, options.projectTagPrefix);
  const projectOptions: Array<[string, string]> = [["", t(lang, "taskCalendar.noProject")]];
  for (const candidate of options.projects) projectOptions.push([normalizeVisibleProjectTag(candidate.tag ?? candidate.label), candidate.label]);
  if (currentProject && !projectOptions.some(([value]) => value === currentProject)) projectOptions.push([currentProject, currentProject]);
  const project = taskDetailSelect(form, t(lang, "taskCalendar.detail.project"), projectOptions, currentProject);
  const tags = taskDetailTextField(form, t(lang, "taskCalendar.detail.tags"), taskCalendarTaskTags(task.line, {
    projectTagPrefix: options.projectTagPrefix,
    appleSyncTag: options.appleSyncTag
  }).join(" "));
  const notes = taskDetailTextarea(form, t(lang, "taskCalendar.detail.notes"), detail.notes ?? "");
  const related = taskDetailTextField(form, t(lang, "taskCalendar.detail.relatedNote"), detail.relatedNote ?? "");

  completed.addEventListener("change", () => {
    const requested = completed.checked;
    completed.disabled = true;
    void session.flushNow().then(async () => {
      const updated = await options.onToggleCompleted(session.getSnapshot().task);
      if (updated) {
        task = updated;
        session.reconcile(updated);
        completed.checked = updated.completed;
        const label = completionTimeLabel(updated, lang);
        completedAt.value.setText(label);
        completedAt.field.toggleClass("is-hidden", !label);
      } else {
        completed.checked = !requested;
      }
    }).finally(() => {
      completed.disabled = false;
    });
  });
  title.addEventListener("input", () => session.apply({ title: title.value }, 260));
  date.addEventListener("change", () => session.apply({ date: date.value }));
  time.addEventListener("change", () => session.apply({ time: time.value }));
  reminderDate.addEventListener("change", () => session.apply({ reminderDate: reminderDate.value }));
  reminderTime.addEventListener("change", () => session.apply({ reminderTime: reminderTime.value }));
  reminderLead.addEventListener("input", () => {
    const lead = reminderLead.value.trim() ? Math.max(0, Math.min(10080, Math.round(Number(reminderLead.value)))) : undefined;
    session.apply({ reminderMinutesBefore: reminderLead.value.trim() && Number.isFinite(lead) ? lead : null }, 180);
  });
  priority.addEventListener("change", () => session.apply({ priority: priority.value as TaskPriorityFilterValue }));
  syncTarget.addEventListener("change", () => session.apply({ syncTarget: syncTarget.value as TaskSyncTarget }));
  recurrence.addEventListener("change", () => {
    customRecurrence.closest<HTMLElement>(".memos-plus-task-calendar-task-detail-field")?.toggleClass("is-hidden", recurrence.value !== "custom");
    session.apply({ recurrence: recurrence.value as TaskRecurrence, customRecurrence: customRecurrence.value });
  });
  customRecurrence.addEventListener("input", () => session.apply({ recurrence: "custom", customRecurrence: customRecurrence.value }, 220));
  project.addEventListener("change", () => session.apply({ projectTag: project.value }));
  tags.addEventListener("input", () => session.apply({ tags: tags.value.split(/[\s,，]+/u).filter(Boolean) }, 220));
  notes.addEventListener("input", () => session.apply({ notes: notes.value }, 320));
  related.addEventListener("input", () => session.apply({ relatedNote: related.value }, 260));

  const postpone = form.createDiv({ cls: "memos-plus-task-calendar-postpone" });
  postpone.createSpan({ text: t(lang, "taskCalendar.postpone") });
  for (const [kind, label] of [["today", "taskCalendar.postpone.today"], ["tomorrow", "taskCalendar.postpone.tomorrow"], ["next-week", "taskCalendar.postpone.nextWeek"]] as const) {
    const button = postpone.createEl("button", { type: "button", text: t(lang, label) });
    button.addEventListener("click", () => {
      const value = taskCalendarPostponeDate(kind);
      date.value = value;
      session.apply({ date: value });
    });
  }
  const choose = postpone.createEl("button", { type: "button", text: t(lang, "taskCalendar.postpone.choose") });
  choose.addEventListener("click", () => {
    date.focus();
    if ("showPicker" in date) date.showPicker();
  });

  const actions = form.createDiv({ cls: "memos-plus-task-calendar-task-detail-actions" });
  const open = actions.createEl("button", { type: "button", text: t(lang, "taskCalendar.openSource") });
  open.addEventListener("click", () => options.onOpenSource(session.getSnapshot().task));
  if (options.onTasksEdit) {
    const tasksEdit = actions.createEl("button", { type: "button", text: t(lang, "taskCalendar.tasksEdit") });
    tasksEdit.addEventListener("click", () => options.onTasksEdit?.(session.getSnapshot().task));
  }
  const save = actions.createEl("button", { cls: "mod-cta", type: "button", text: t(lang, "common.save") });
  save.addEventListener("click", () => void session.flushNow());
  return () => session.setListener(null);
}

function updateTaskEditStatus(
  status: HTMLElement,
  retry: HTMLButtonElement,
  snapshot: TaskCalendarEditSnapshot,
  lang: Language,
  appleStatus: (task: TaskIndexItem) => TaskCalendarAppleStatus | null
): void {
  status.removeClass("is-error", "is-saving", "is-modified");
  retry.toggle(snapshot.canRetry);
  if (snapshot.saveState === "save-failed") {
    status.addClass("is-error");
    status.setText(t(lang, "taskCalendar.saveFailed"));
    status.setAttr("title", snapshot.saveError);
    return;
  }
  status.removeAttribute("title");
  if (snapshot.saveState === "modified") {
    status.addClass("is-modified");
    status.setText(t(lang, "taskCalendar.modified"));
    return;
  }
  if (snapshot.saveState === "saving" || snapshot.syncState === "syncing") {
    status.addClass("is-saving");
    status.setText(t(lang, snapshot.saveState === "saving" ? "taskCalendar.saving" : "taskCalendar.syncing"));
    return;
  }
  if (snapshot.syncState === "sync-failed") {
    status.addClass("is-error");
    status.setText(t(lang, "taskCalendar.appleFailed"));
    return;
  }
  if (snapshot.syncState === "synced") {
    status.setText(t(lang, "taskCalendar.appleSynced"));
    return;
  }
  const apple = appleStatus(snapshot.task);
  status.setText(apple?.label ?? t(lang, "taskCalendar.saved"));
  status.toggleClass("is-error", apple?.error === true);
  if (apple?.title) status.setAttr("title", apple.title);
}

function iconButton(parent: HTMLElement, icon: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = parent.createEl("button", { cls: "memos-plus-icon-button", attr: { type: "button", title: label, "aria-label": label } });
  setIcon(button, icon);
  button.addEventListener("click", onClick);
  return button;
}

function taskDetailField(container: HTMLElement, label: string): HTMLElement {
  const field = container.createEl("label", { cls: "memos-plus-task-calendar-task-detail-field" });
  field.createSpan({ text: label });
  return field;
}

function taskDetailInput(container: HTMLElement, label: string, type: string, value: string): HTMLInputElement {
  const input = taskDetailField(container, label).createEl("input", { attr: { type } });
  input.value = value;
  return input;
}

function taskDetailTextField(container: HTMLElement, label: string, value: string): HTMLInputElement {
  return taskDetailInput(container, label, "text", value);
}

function taskDetailTextarea(container: HTMLElement, label: string, value: string): HTMLTextAreaElement {
  const textarea = taskDetailField(container, label).createEl("textarea");
  textarea.value = value;
  textarea.rows = 3;
  return textarea;
}

function taskDetailCheckbox(container: HTMLElement, label: string, checked: boolean): HTMLInputElement {
  const field = taskDetailField(container, label);
  field.addClass("is-checkbox");
  const input = field.createEl("input", { attr: { type: "checkbox" } });
  input.checked = checked;
  return input;
}

function taskDetailReadonlyField(container: HTMLElement, label: string, value: string): { field: HTMLElement; value: HTMLElement } {
  const field = taskDetailField(container, label);
  field.addClass("is-readonly");
  return { field, value: field.createSpan({ text: value }) };
}

function taskDetailSelect(container: HTMLElement, label: string, options: Array<[string, string]>, value: string): HTMLSelectElement {
  const select = taskDetailField(container, label).createEl("select");
  for (const [optionValue, optionLabel] of options) {
    const option = select.createEl("option", { value: optionValue, text: optionLabel });
    option.selected = optionValue === value;
  }
  return select;
}

function normalizeVisibleProjectTag(value: string): string {
  const normalized = value.trim().replace(/^#+/u, "");
  return normalized ? `#${normalized}` : "";
}

function completionTimeLabel(task: Pick<TaskIndexItem, "completedAt" | "doneDate">, lang: Language): string {
  const date = taskCompletionDate(task.completedAt);
  const time = taskCompletionTime(task.completedAt);
  if (date && time) return lang === "zh" ? `${date} ${time}` : `${date} ${time}`;
  if (task.doneDate) return task.doneDate;
  return "";
}
