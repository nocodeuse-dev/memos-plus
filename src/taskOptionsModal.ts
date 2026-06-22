import { App, Modal } from "obsidian";
import { t, type Language } from "./i18n";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";
import type { MemosPlusSettings } from "./settings";
import { renderTaskContentWithDetail } from "./taskContent";
import {
  normalizeTaskDate,
  normalizeTaskPriority,
  normalizeTaskRecurrence,
  type ProjectTaskOptions,
  type TaskPriority,
  type TaskRecurrence
} from "./tasksFormat";

export interface TaskOptionsModalSettings {
  enabled: boolean;
  defaultPriority: TaskPriority;
  defaultDueDate: string;
  defaultScheduledDate: string;
  defaultRecurrence: TaskRecurrence;
  addCreatedDate: boolean;
}

export interface TaskOptionsModalOptions {
  language: Language;
  title: string;
  description?: string;
  taskSettings: TaskOptionsModalSettings;
  defaultAsTask?: boolean;
  allowPlain?: boolean;
}

export function openTaskOptionsModal(app: App, options: TaskOptionsModalOptions): Promise<ProjectTaskOptions | undefined | null> {
  return new Promise((resolve) => {
    new TaskOptionsModal(app, options, resolve).open();
  });
}

export function renderTaskContentWithOptions(content: string, task: ProjectTaskOptions | undefined, settings: MemosPlusSettings, now = new Date()): string {
  return renderTaskContentWithDetail(content, task, settings, { now });
}

class TaskOptionsModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly options: TaskOptionsModalOptions,
    private readonly onResolve: (task: ProjectTaskOptions | undefined | null) => void
  ) {
    super(app);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "TaskOptionsModal");
    const lang = this.options.language;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-task-options-modal");
    contentEl.createEl("h2", { text: this.options.title });
    if (this.options.description) {
      contentEl.createDiv({ cls: "memos-plus-project-section-hint", text: this.options.description });
    }

    const form = contentEl.createDiv({ cls: "memos-plus-task-options" });
    const asTask = this.options.allowPlain === false ? null : createCheckboxField(form, t(lang, "projectSend.asTask"), this.options.defaultAsTask ?? true);
    const priority = createSelectField(form, t(lang, "projectSend.priority"), [
      ["none", t(lang, "taskPriority.none")],
      ["highest", t(lang, "taskPriority.highest")],
      ["high", t(lang, "taskPriority.high")],
      ["medium", t(lang, "taskPriority.medium")],
      ["low", t(lang, "taskPriority.low")],
      ["lowest", t(lang, "taskPriority.lowest")]
    ]);
    priority.value = this.options.taskSettings.defaultPriority;

    const startDate = createDateField(form, t(lang, "projectSend.startDate"));
    const scheduledDate = createDateField(form, t(lang, "projectSend.scheduledDate"));
    scheduledDate.value = this.options.taskSettings.defaultScheduledDate;
    const dueDate = createDateField(form, t(lang, "projectSend.dueDate"));
    dueDate.value = this.options.taskSettings.defaultDueDate;
    const doneDate = createDateField(form, t(lang, "projectSend.doneDate"));
    const recurrence = createSelectField(form, t(lang, "projectSend.recurrence"), [
      ["none", t(lang, "taskRecurrence.none")],
      ["daily", t(lang, "taskRecurrence.daily")],
      ["weekly", t(lang, "taskRecurrence.weekly")],
      ["monthly", t(lang, "taskRecurrence.monthly")],
      ["yearly", t(lang, "taskRecurrence.yearly")],
      ["custom", t(lang, "taskRecurrence.custom")]
    ]);
    recurrence.value = this.options.taskSettings.defaultRecurrence;
    const customRecurrence = createTextField(form, t(lang, "projectSend.customRecurrence"), "every 2 weeks");
    const addCreatedDate = createCheckboxField(form, t(lang, "projectSend.addCreatedDate"), this.options.taskSettings.addCreatedDate);

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

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    const cancel = footer.createEl("button", { attr: { type: "button" }, text: t(lang, "modal.cancel") });
    const confirm = footer.createEl("button", { cls: "memos-plus-save-button", attr: { type: "button" }, text: t(lang, "projectSend.confirm") });
    cancel.addEventListener("click", () => void withMobileClickLock(cancel, () => this.cancel()));
    confirm.addEventListener("click", () => {
      void withMobileClickLock(confirm, () =>
        this.resolve(
          asTask && !asTask.checked
            ? undefined
            : {
                isTask: true,
                priority: normalizeTaskPriority(priority.value),
                startDate: normalizeTaskDate(startDate.value),
                scheduledDate: normalizeTaskDate(scheduledDate.value),
                dueDate: normalizeTaskDate(dueDate.value),
                doneDate: normalizeTaskDate(doneDate.value),
                recurrence: normalizeTaskRecurrence(recurrence.value),
                customRecurrence: customRecurrence.value.trim(),
                addCreatedDate: addCreatedDate.checked
              }
        )
      );
    });
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "TaskOptionsModal");
    this.contentEl.empty();
    if (!this.resolved) {
      this.onResolve(null);
      this.resolved = true;
    }
  }

  private cancel(): void {
    this.resolve(null);
  }

  private resolve(task: ProjectTaskOptions | undefined | null): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.onResolve(task);
    this.close();
  }
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
