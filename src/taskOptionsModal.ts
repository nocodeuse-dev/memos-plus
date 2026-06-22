import { App, Modal } from "obsidian";
import { t, type Language } from "./i18n";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";
import type { MemosPlusSettings } from "./settings";
import { renderTaskContentWithDetail } from "./taskContent";
import { createTaskOptionsForm, type TaskOptionsFormSettings } from "./taskOptionsForm";
import type { ProjectTaskOptions } from "./tasksFormat";

export type TaskOptionsModalSettings = TaskOptionsFormSettings;

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

    const taskOptionsForm = createTaskOptionsForm(contentEl, {
      language: lang,
      taskSettings: this.options.taskSettings,
      defaultAsTask: this.options.defaultAsTask ?? true,
      allowPlain: this.options.allowPlain,
      taskContentMode: "task-with-detail",
      renderMetadataOptions: true
    });

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    const cancel = footer.createEl("button", { attr: { type: "button" }, text: t(lang, "modal.cancel") });
    const confirm = footer.createEl("button", { cls: "memos-plus-save-button", attr: { type: "button" }, text: t(lang, "projectSend.confirm") });
    cancel.addEventListener("click", () => void withMobileClickLock(cancel, () => this.cancel()));
    confirm.addEventListener("click", () => {
      void withMobileClickLock(confirm, () => this.resolve(taskOptionsForm.value()));
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
