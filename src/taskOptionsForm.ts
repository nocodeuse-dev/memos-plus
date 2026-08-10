import { t, type Language } from "./i18n";
import {
  normalizeTaskDate,
  normalizeTaskPriority,
  normalizeTaskProjectTag,
  normalizeTaskRecurrence,
  normalizeTaskSyncTarget,
  normalizeTaskTime,
  type ProjectTaskOptions,
  type TaskContentMode,
  type TaskPriority,
  type TaskRecurrence,
  type TaskSyncTarget
} from "./tasksFormat";

export interface TaskOptionsFormSettings {
  enabled: boolean;
  defaultPriority: TaskPriority;
  defaultDueDate: string;
  defaultScheduledDate: string;
  defaultRecurrence: TaskRecurrence;
  addCreatedDate: boolean;
  appleSyncEnabled?: boolean;
  appleSyncTag?: string;
  defaultProjectTag?: string;
  defaultSyncTarget?: TaskSyncTarget;
}

interface TaskOptionsFormOptions {
  language: Language;
  taskSettings: TaskOptionsFormSettings;
  defaultAsTask: boolean;
  allowPlain?: boolean;
  taskContentMode?: TaskContentMode;
  renderMetadataOptions?: boolean;
  hideSyncTarget?: boolean;
}

export interface TaskOptionsForm {
  element: HTMLElement;
  value: () => ProjectTaskOptions | undefined;
}

export function createTaskOptionsForm(container: HTMLElement, options: TaskOptionsFormOptions): TaskOptionsForm {
  const lang = options.language;
  const form = container.createDiv({ cls: "memos-plus-task-options" });
  const asTask = options.allowPlain === false ? null : createCheckboxField(form, t(lang, "projectSend.asTask"), options.defaultAsTask);
  const defaultContentMode = normalizeTaskContentMode(options.taskContentMode);
  const contentModeField =
    options.taskContentMode === "ask"
      ? createSelectField(form, t(lang, "projectSend.taskContentMode"), [
          ["task-with-detail", t(lang, "projectSend.taskContentMode.task-with-detail")],
          ["task-only", t(lang, "projectSend.taskContentMode.task-only")]
        ])
      : null;
  if (contentModeField) contentModeField.value = defaultContentMode;
  const selectedContentMode = (): TaskContentMode => (contentModeField ? (contentModeField.value as TaskContentMode) : defaultContentMode);
  const shouldRenderMetadataOptions = options.renderMetadataOptions ?? true;

  let metadataValue = (): Omit<ProjectTaskOptions, "isTask" | "contentMode"> => ({});
  if (shouldRenderMetadataOptions) {
    const defaultTarget = normalizeTaskSyncTarget(
      options.taskSettings.defaultSyncTarget ?? (options.taskSettings.appleSyncEnabled ? "reminders" : "tasks")
    );
    const syncTarget = createSelectField(form, t(lang, "projectSend.syncTarget"), [
      ["tasks", t(lang, "projectSend.syncTarget.tasks")],
      ["reminders", t(lang, "projectSend.syncTarget.reminders")],
      ["calendar", t(lang, "projectSend.syncTarget.calendar")]
    ]);
    if (options.hideSyncTarget) syncTarget.closest<HTMLElement>(".memos-plus-task-option-field")?.addClass("is-hidden");
    syncTarget.value = defaultTarget;
    const project = createTextField(form, t(lang, "projectSend.project"), t(lang, "projectSend.projectPlaceholder"));
    project.value = options.taskSettings.defaultProjectTag ?? "";
    const priority = createSelectField(form, t(lang, "projectSend.priority"), [
      ["none", t(lang, "taskPriority.none")],
      ["highest", t(lang, "taskPriority.highest")],
      ["high", t(lang, "taskPriority.high")],
      ["medium", t(lang, "taskPriority.medium")],
      ["low", t(lang, "taskPriority.low")],
      ["lowest", t(lang, "taskPriority.lowest")]
    ]);
    priority.value = options.taskSettings.defaultPriority;

    const taskFields = createTargetGroup(form, "tasks");
    const startDate = createDateField(taskFields, t(lang, "projectSend.startDate"));
    const scheduledDate = createDateField(taskFields, t(lang, "projectSend.scheduledDate"));
    scheduledDate.value = options.taskSettings.defaultScheduledDate;
    const taskDueDate = createDateField(taskFields, t(lang, "projectSend.dueDate"));
    taskDueDate.value = options.taskSettings.defaultDueDate;
    const doneDate = createDateField(taskFields, t(lang, "projectSend.doneDate"));

    const reminderFields = createTargetGroup(form, "reminders");
    const reminderDueDate = createDateField(reminderFields, t(lang, "projectSend.dueDate"));
    reminderDueDate.value = options.taskSettings.defaultDueDate;
    const dueTime = createTimeField(reminderFields, t(lang, "projectSend.dueTime"));
    const reminderDate = createDateField(reminderFields, t(lang, "projectSend.reminderDate"));
    const reminderTime = createTimeField(reminderFields, t(lang, "projectSend.reminderTime"));
    const reminderLead = createNumberField(reminderFields, t(lang, "projectSend.reminderMinutesBefore"), "0", "10080");
    const reminderAllDay = createCheckboxField(reminderFields, t(lang, "projectSend.allDay"), false);

    const calendarFields = createTargetGroup(form, "calendar");
    const calendarDate = createDateField(calendarFields, t(lang, "projectSend.date"));
    calendarDate.value = options.taskSettings.defaultScheduledDate || options.taskSettings.defaultDueDate;
    const startTime = createTimeField(calendarFields, t(lang, "projectSend.startTime"));
    startTime.value = "09:00";
    const endDate = createDateField(calendarFields, t(lang, "projectSend.endDate"));
    const endTime = createTimeField(calendarFields, t(lang, "projectSend.endTime"));
    endTime.value = "10:00";
    const calendarLead = createNumberField(calendarFields, t(lang, "projectSend.reminderMinutesBefore"), "0", "10080");
    const calendarAllDay = createCheckboxField(calendarFields, t(lang, "projectSend.allDay"), false);

    const recurrence = createSelectField(form, t(lang, "projectSend.recurrence"), [
      ["none", t(lang, "taskRecurrence.none")],
      ["daily", t(lang, "taskRecurrence.daily")],
      ["weekly", t(lang, "taskRecurrence.weekly")],
      ["monthly", t(lang, "taskRecurrence.monthly")],
      ["yearly", t(lang, "taskRecurrence.yearly")],
      ["custom", t(lang, "taskRecurrence.custom")]
    ]);
    recurrence.value = options.taskSettings.defaultRecurrence;
    const customRecurrence = createTextField(form, t(lang, "projectSend.customRecurrence"), "every 2 weeks");
    const addCreatedDate = createCheckboxField(form, t(lang, "projectSend.addCreatedDate"), options.taskSettings.addCreatedDate);

    const controls = Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"));
    const updateState = (): void => {
      const disabled = asTask ? !asTask.checked : false;
      const target = normalizeTaskSyncTarget(syncTarget.value);
      taskFields.toggleClass("is-hidden", target !== "tasks");
      reminderFields.toggleClass("is-hidden", target !== "reminders");
      calendarFields.toggleClass("is-hidden", target !== "calendar");
      for (const control of controls) {
        const group = control.closest<HTMLElement>(".memos-plus-task-target-fields");
        const outsideActiveGroup = Boolean(group && group.dataset.target !== target);
        control.disabled = disabled || outsideActiveGroup;
      }
      syncTarget.disabled = disabled;
      project.disabled = disabled;
      priority.disabled = disabled;
      recurrence.disabled = disabled;
      addCreatedDate.disabled = disabled;
      customRecurrence.disabled = disabled || recurrence.value !== "custom";
      dueTime.disabled = dueTime.disabled || reminderAllDay.checked;
      reminderTime.disabled = reminderTime.disabled || reminderAllDay.checked;
      startTime.disabled = startTime.disabled || calendarAllDay.checked;
      endTime.disabled = endTime.disabled || calendarAllDay.checked;
    };
    asTask?.addEventListener("change", updateState);
    syncTarget.addEventListener("change", updateState);
    recurrence.addEventListener("change", updateState);
    reminderAllDay.addEventListener("change", updateState);
    calendarAllDay.addEventListener("change", updateState);
    updateState();

    metadataValue = () => {
      const target = normalizeTaskSyncTarget(syncTarget.value);
      const common = {
        syncTarget: target,
        syncTag: options.taskSettings.appleSyncTag,
        projectTag: normalizeTaskProjectTag(project.value),
        priority: normalizeTaskPriority(priority.value),
        recurrence: normalizeTaskRecurrence(recurrence.value),
        customRecurrence: customRecurrence.value.trim(),
        addCreatedDate: addCreatedDate.checked
      };
      if (target === "reminders") {
        return {
          ...common,
          dueDate: normalizeTaskDate(reminderDueDate.value),
          dueTime: reminderAllDay.checked ? "" : normalizeTaskTime(dueTime.value),
          reminderDate: normalizeTaskDate(reminderDate.value),
          reminderTime: reminderAllDay.checked ? "" : normalizeTaskTime(reminderTime.value),
          reminderMinutesBefore: normalizeReminderMinutes(reminderLead.value),
          allDay: reminderAllDay.checked
        };
      }
      if (target === "calendar") {
        return {
          ...common,
          startDate: normalizeTaskDate(calendarDate.value),
          startTime: calendarAllDay.checked ? "" : normalizeTaskTime(startTime.value),
          endDate: normalizeTaskDate(endDate.value),
          endTime: calendarAllDay.checked ? "" : normalizeTaskTime(endTime.value),
          reminderMinutesBefore: normalizeReminderMinutes(calendarLead.value),
          allDay: calendarAllDay.checked
        };
      }
      return {
        ...common,
        startDate: normalizeTaskDate(startDate.value),
        scheduledDate: normalizeTaskDate(scheduledDate.value),
        dueDate: normalizeTaskDate(taskDueDate.value),
        doneDate: normalizeTaskDate(doneDate.value)
      };
    };
  }

  return {
    element: form,
    value: () =>
      asTask && !asTask.checked
        ? undefined
        : {
            isTask: true,
            ...metadataValue(),
            contentMode: selectedContentMode()
          }
  };
}

function normalizeTaskContentMode(value: TaskContentMode | undefined): TaskContentMode {
  return value === "task-only" ? "task-only" : "task-with-detail";
}

function normalizeReminderMinutes(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 10080 ? Math.round(number) : undefined;
}

function createTargetGroup(container: HTMLElement, target: TaskSyncTarget): HTMLElement {
  return container.createDiv({ cls: "memos-plus-task-target-fields", attr: { "data-target": target } });
}

function createSelectField(container: HTMLElement, label: string, options: Array<[string, string]>): HTMLSelectElement {
  const field = createTaskOptionField(container, label);
  const select = field.createEl("select");
  for (const [value, text] of options) select.createEl("option", { value, text });
  return select;
}

function createDateField(container: HTMLElement, label: string): HTMLInputElement {
  return createTaskOptionField(container, label).createEl("input", { attr: { type: "date" } });
}

function createTimeField(container: HTMLElement, label: string): HTMLInputElement {
  return createTaskOptionField(container, label).createEl("input", { attr: { type: "time" } });
}

function createNumberField(container: HTMLElement, label: string, min: string, max: string): HTMLInputElement {
  return createTaskOptionField(container, label).createEl("input", { attr: { type: "number", min, max, step: "1" } });
}

function createTextField(container: HTMLElement, label: string, placeholder = ""): HTMLInputElement {
  return createTaskOptionField(container, label).createEl("input", { attr: { type: "text", placeholder } });
}

function createCheckboxField(container: HTMLElement, label: string, checked: boolean): HTMLInputElement {
  const input = createTaskOptionField(container, label).createEl("input", { attr: { type: "checkbox" } });
  input.checked = checked;
  return input;
}

function createTaskOptionField(container: HTMLElement, label: string): HTMLElement {
  const field = container.createDiv({ cls: "memos-plus-task-option-field" });
  field.createEl("label", { text: label });
  return field;
}
