import { App, Modal, Notice, Setting } from "obsidian";
import type { AppleCalendarAgendaEvent, CreateAppleCalendarEventInput } from "./appleCalendarAgenda";
import { t, type Language } from "./i18n";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";

export interface TaskCalendarEventModalOptions {
  language: Language;
  date: string;
  calendars: string[];
  defaultCalendar: string;
  createEvent: (input: CreateAppleCalendarEventInput) => Promise<AppleCalendarAgendaEvent>;
  onCreated: (event: AppleCalendarAgendaEvent) => void;
}

export class TaskCalendarEventModal extends Modal {
  private title = "";
  private calendar = "";
  private date = "";
  private startTime = "09:00";
  private endTime = "10:00";
  private allDay = false;
  private location = "";
  private notes = "";
  private saving = false;

  constructor(app: App, private readonly options: TaskCalendarEventModalOptions) {
    super(app);
    this.date = options.date;
    this.calendar = options.defaultCalendar || options.calendars[0] || "";
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "TaskCalendarEventModal");
    const { contentEl } = this;
    const lang = this.options.language;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-task-calendar-event-modal");
    contentEl.createEl("h2", { text: t(lang, "taskCalendar.newEvent") });

    new Setting(contentEl)
      .setName(t(lang, "taskCalendar.eventTitle"))
      .addText((text) => text.setPlaceholder(t(lang, "taskCalendar.eventTitlePlaceholder")).onChange((value) => { this.title = value; }));
    new Setting(contentEl)
      .setName(t(lang, "taskCalendar.eventCalendar"))
      .addDropdown((dropdown) => {
        for (const calendar of this.options.calendars) dropdown.addOption(calendar, calendar);
        dropdown.setValue(this.calendar).onChange((value) => { this.calendar = value; });
      });
    new Setting(contentEl)
      .setName(t(lang, "taskCalendar.eventDate"))
      .addText((text) => {
        text.inputEl.type = "date";
        text.setValue(this.date).onChange((value) => { this.date = value; });
      });
    new Setting(contentEl)
      .setName(t(lang, "taskCalendar.eventAllDay"))
      .addToggle((toggle) => toggle.setValue(this.allDay).onChange((value) => {
        this.allDay = value;
        this.updateTimeAvailability();
      }));

    const timeSetting = new Setting(contentEl).setName(t(lang, "taskCalendar.eventTime"));
    timeSetting.addText((text) => {
      text.inputEl.type = "time";
      text.setValue(this.startTime).onChange((value) => { this.startTime = value; });
      text.inputEl.addClass("memos-plus-task-calendar-event-time-start");
    });
    timeSetting.addText((text) => {
      text.inputEl.type = "time";
      text.setValue(this.endTime).onChange((value) => { this.endTime = value; });
      text.inputEl.addClass("memos-plus-task-calendar-event-time-end");
    });
    new Setting(contentEl)
      .setName(t(lang, "taskCalendar.eventLocation"))
      .addText((text) => text.onChange((value) => { this.location = value; }));
    new Setting(contentEl)
      .setName(t(lang, "taskCalendar.eventNotes"))
      .addTextArea((text) => text.onChange((value) => { this.notes = value; }));

    const footer = contentEl.createDiv({ cls: "memos-plus-sidebar-group-footer" });
    const cancel = footer.createEl("button", { text: t(lang, "modal.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.close());
    const save = footer.createEl("button", { cls: "memos-plus-save-button", text: t(lang, "taskCalendar.createEvent"), attr: { type: "button" } });
    save.addEventListener("click", () => {
      void withMobileClickLock(save, async () => this.save(save));
    });
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "TaskCalendarEventModal");
    this.contentEl.empty();
  }

  private updateTimeAvailability(): void {
    this.contentEl.querySelectorAll<HTMLInputElement>(".memos-plus-task-calendar-event-time-start, .memos-plus-task-calendar-event-time-end").forEach((element) => {
      element.disabled = this.allDay;
    });
  }

  private async save(button: HTMLButtonElement): Promise<void> {
    if (this.saving) return;
    const lang = this.options.language;
    const input: CreateAppleCalendarEventInput = {
      calendar: this.calendar.trim(),
      title: this.title.trim(),
      date: this.date.trim(),
      startTime: this.startTime.trim(),
      endTime: this.endTime.trim(),
      allDay: this.allDay,
      location: this.location.trim(),
      notes: this.notes.trim()
    };
    if (!input.calendar || !input.title || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || (!input.allDay && (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime)))) {
      new Notice(t(lang, "notice.taskCalendarEventInvalid"));
      return;
    }
    this.saving = true;
    button.disabled = true;
    try {
      const event = await this.options.createEvent(input);
      this.options.onCreated(event);
      new Notice(t(lang, "notice.taskCalendarEventCreated"));
      this.close();
    } catch (error) {
      new Notice(t(lang, "notice.taskCalendarEventFailed").replace("{error}", error instanceof Error ? error.message : String(error)));
    } finally {
      this.saving = false;
      if (button.isConnected) button.disabled = false;
    }
  }
}
