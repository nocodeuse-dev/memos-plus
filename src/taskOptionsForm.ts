import { t, type Language } from "./i18n";
import {
  normalizeTaskDate,
  normalizeTaskPriority,
  normalizeTaskRecurrence,
  type ProjectTaskOptions,
  type TaskContentMode,
  type TaskPriority,
  type TaskRecurrence
} from "./tasksFormat";

export interface TaskOptionsFormSettings {
  enabled: boolean;
  defaultPriority: TaskPriority;
  defaultDueDate: string;
  defaultScheduledDate: string;
  defaultRecurrence: TaskRecurrence;
  addCreatedDate: boolean;
}

interface TaskOptionsFormOptions {
  language: Language;
  taskSettings: TaskOptionsFormSettings;
  defaultAsTask: boolean;
  allowPlain?: boolean;
  taskContentMode?: TaskContentMode;
  renderMetadataOptions?: boolean;
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
  if (contentModeField) {
    contentModeField.value = defaultContentMode;
  }
  const selectedContentMode = (): TaskContentMode => (contentModeField ? (contentModeField.value as TaskContentMode) : defaultContentMode);
  const shouldRenderMetadataOptions = options.renderMetadataOptions ?? true;

  let metadataValue = (): Omit<ProjectTaskOptions, "isTask" | "contentMode"> => ({});
  if (shouldRenderMetadataOptions) {
    const priority = createSelectField(form, t(lang, "projectSend.priority"), [
      ["none", t(lang, "taskPriority.none")],
      ["highest", t(lang, "taskPriority.highest")],
      ["high", t(lang, "taskPriority.high")],
      ["medium", t(lang, "taskPriority.medium")],
      ["low", t(lang, "taskPriority.low")],
      ["lowest", t(lang, "taskPriority.lowest")]
    ]);
    priority.value = options.taskSettings.defaultPriority;

    const startDate = createDateField(form, t(lang, "projectSend.startDate"));
    const scheduledDate = createDateField(form, t(lang, "projectSend.scheduledDate"));
    scheduledDate.value = options.taskSettings.defaultScheduledDate;
    const dueDate = createDateField(form, t(lang, "projectSend.dueDate"));
    dueDate.value = options.taskSettings.defaultDueDate;
    const doneDate = createDateField(form, t(lang, "projectSend.doneDate"));
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

    const controls = [priority, startDate, scheduledDate, dueDate, doneDate, recurrence, customRecurrence, addCreatedDate];
    const updateDisabledState = (): void => {
      const disabled = asTask ? !asTask.checked : false;
      for (const control of controls) {
        control.toggleAttribute("disabled", disabled);
      }
      customRecurrence.toggleAttribute("disabled", disabled || recurrence.value !== "custom");
    };
    asTask?.addEventListener("change", updateDisabledState);
    recurrence.addEventListener("change", updateDisabledState);
    updateDisabledState();

    metadataValue = () => ({
      priority: normalizeTaskPriority(priority.value),
      startDate: normalizeTaskDate(startDate.value),
      scheduledDate: normalizeTaskDate(scheduledDate.value),
      dueDate: normalizeTaskDate(dueDate.value),
      doneDate: normalizeTaskDate(doneDate.value),
      recurrence: normalizeTaskRecurrence(recurrence.value),
      customRecurrence: customRecurrence.value.trim(),
      addCreatedDate: addCreatedDate.checked
    });
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

function createSelectField(container: HTMLElement, label: string, options: Array<[string, string]>): HTMLSelectElement {
  const field = createTaskOptionField(container, label);
  const select = field.createEl("select");
  for (const [value, text] of options) {
    select.createEl("option", { value, text });
  }
  return select;
}

function createDateField(container: HTMLElement, label: string): HTMLInputElement {
  const field = createTaskOptionField(container, label);
  return field.createEl("input", { attr: { type: "date" } });
}

function createTextField(container: HTMLElement, label: string, placeholder = ""): HTMLInputElement {
  const field = createTaskOptionField(container, label);
  return field.createEl("input", { attr: { type: "text", placeholder } });
}

function createCheckboxField(container: HTMLElement, label: string, checked: boolean): HTMLInputElement {
  const field = createTaskOptionField(container, label);
  const input = field.createEl("input", { attr: { type: "checkbox" } });
  input.checked = checked;
  return input;
}

function createTaskOptionField(container: HTMLElement, label: string): HTMLElement {
  const field = container.createDiv({ cls: "memos-plus-task-option-field" });
  field.createEl("label", { text: label });
  return field;
}
