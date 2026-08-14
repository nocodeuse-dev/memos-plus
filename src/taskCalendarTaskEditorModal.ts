import { Modal } from "obsidian";
import type MemosPlusPlugin from "../main";
import { t } from "./i18n";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen } from "./mobileModalSafety";
import { taskCalendarTaskKey } from "./taskCalendarTaskEditor";
import { renderTaskCalendarTaskEditor } from "./taskCalendarTaskEditorUi";
import type { TaskCalendarEditSession } from "./taskCalendarEditSession";
import type { TaskIndexItem } from "./taskIndex";

export async function openTaskCalendarTaskEditorModal(plugin: MemosPlusPlugin, task: TaskIndexItem): Promise<void> {
  let projects: Array<{ label: string; filePath?: string; tag?: string }> = [];
  try {
    projects = (await plugin.store.getProjects()).map((project) => ({
      label: project.name,
      filePath: project.file.path,
      tag: `${plugin.settings.projectTag}/${project.name}`
    }));
  } catch (error) {
    console.warn("[Memos Plus] Failed to load projects for task editor", error);
  }
  new TaskCalendarTaskEditorModal(plugin, task, projects).open();
}

class TaskCalendarTaskEditorModal extends Modal {
  private readonly session: TaskCalendarEditSession;
  private cleanupEditor: (() => void) | null = null;

  constructor(
    private readonly plugin: MemosPlusPlugin,
    private readonly task: TaskIndexItem,
    private readonly projects: Array<{ label: string; filePath?: string; tag?: string }>
  ) {
    super(plugin.app);
    this.session = plugin.createTaskCalendarEditSession(task);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "TaskCalendarTaskEditorModal");
    this.contentEl.empty();
    this.contentEl.addClass("memos-plus-modal", "memos-plus-task-editor-modal");
    this.contentEl.createEl("h2", { text: t(this.plugin.settings.language, "taskCalendar.editTask") });
    this.cleanupEditor = renderTaskCalendarTaskEditor(this.contentEl, {
      language: this.plugin.settings.language,
      task: this.task,
      session: this.session,
      projects: this.projects,
      projectTagPrefix: this.plugin.settings.projectTag,
      appleSyncTag: this.plugin.settings.appleSyncTag,
      appleStatus: (task) => this.plugin.taskCalendarAppleStatus(task),
      onOpenSource: (task) => {
        this.close();
        void this.plugin.openTaskCalendarTask(task);
      },
      onTasksEdit: this.plugin.canEditTaskCalendarTask()
        ? (task) => {
          this.close();
          void this.plugin.editTaskCalendarTask(task);
        }
        : undefined,
      onToggleCompleted: async (task) => {
        const updated = await this.plugin.toggleTaskCalendarTask(task);
        return updated
          ? this.plugin.taskIndex.getItems().find((item) => taskCalendarTaskKey(item) === taskCalendarTaskKey(task)) ?? null
          : null;
      }
    });
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "TaskCalendarTaskEditorModal");
    this.cleanupEditor?.();
    this.cleanupEditor = null;
    void this.session.flushNow().finally(() => this.session.dispose());
    this.contentEl.empty();
  }
}
