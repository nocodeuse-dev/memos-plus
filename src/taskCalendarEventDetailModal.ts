import { App, Modal, Notice } from "obsidian";
import type { AppleCalendarAgendaEvent } from "./appleCalendarAgenda";
import { t, type Language } from "./i18n";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";

export interface TaskCalendarEventDetailModalOptions {
  language: Language;
  event: AppleCalendarAgendaEvent;
  onCreateTask: (event: AppleCalendarAgendaEvent) => Promise<boolean>;
  onQuickCapture: (event: AppleCalendarAgendaEvent) => void;
}

export class TaskCalendarEventDetailModal extends Modal {
  private creatingTask = false;

  constructor(app: App, private readonly options: TaskCalendarEventDetailModalOptions) {
    super(app);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "TaskCalendarEventDetailModal");
    const { contentEl } = this;
    const { event, language } = this.options;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-task-calendar-event-detail-modal");
    contentEl.createEl("h2", { text: event.title || t(language, "taskCalendar.untitledEvent") });
    contentEl.createDiv({ cls: "memos-plus-task-calendar-event-detail-calendar", text: event.calendar });
    this.renderRow(contentEl, t(language, "taskCalendar.eventWhen"), event.allDay ? t(language, "taskCalendar.allDay") : `${formatEventTime(event.start)}–${formatEventTime(event.end)}`);
    if (event.location) this.renderRow(contentEl, t(language, "taskCalendar.eventLocation"), event.location);
    if (event.recurring) this.renderRow(contentEl, t(language, "taskCalendar.eventRecurring"), t(language, "taskCalendar.eventRecurringYes"));
    if (event.notes) {
      contentEl.createEl("h3", { text: t(language, "taskCalendar.eventNotes") });
      contentEl.createDiv({ cls: "memos-plus-task-calendar-event-detail-notes", text: event.notes });
    }

    const actions = contentEl.createDiv({ cls: "memos-plus-sidebar-group-footer" });
    const task = actions.createEl("button", { text: t(language, "taskCalendar.eventCreateTask"), attr: { type: "button" } });
    task.addEventListener("click", () => {
      void withMobileClickLock(task, async () => this.createTask(task));
    });
    const memo = actions.createEl("button", { cls: "memos-plus-save-button", text: t(language, "taskCalendar.eventQuickCapture"), attr: { type: "button" } });
    memo.addEventListener("click", () => {
      this.close();
      window.setTimeout(() => this.options.onQuickCapture(event), 0);
    });
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "TaskCalendarEventDetailModal");
    this.contentEl.empty();
  }

  private renderRow(container: HTMLElement, label: string, value: string): void {
    const row = container.createDiv({ cls: "memos-plus-task-calendar-event-detail-row" });
    row.createSpan({ cls: "memos-plus-task-calendar-event-detail-label", text: label });
    row.createSpan({ text: value });
  }

  private async createTask(button: HTMLButtonElement): Promise<void> {
    if (this.creatingTask) return;
    this.creatingTask = true;
    button.disabled = true;
    try {
      const created = await this.options.onCreateTask(this.options.event);
      if (created) {
        new Notice(t(this.options.language, "notice.taskCalendarEventTaskCreated"));
        this.close();
      }
    } finally {
      this.creatingTask = false;
      if (button.isConnected) button.disabled = false;
    }
  }
}

function formatEventTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
