import { Modal, type App } from "obsidian";
import type MemosPlusPlugin from "../main";
import { t, type Language } from "./i18n";
import { selectProjectTarget } from "./projectDelivery";
import type { ProjectSendChoice } from "./projectFileSuggestModal";
import { createTaskOptionsForm, type TaskOptionsFormSettings } from "./taskOptionsForm";
import { parseNaturalLanguageTask, type ParsedNaturalLanguageTask } from "./taskNaturalLanguage";
import type { ProjectTaskOptions, TaskContentMode } from "./tasksFormat";
import { createUnifiedTaskDraft, type UnifiedTaskComposerDefaults } from "./unifiedTaskComposerModel";

export interface UnifiedTaskComposerOptions {
  language: Language;
  content: string;
  taskSettings: TaskOptionsFormSettings;
  defaults?: UnifiedTaskComposerDefaults;
  allowPlain?: boolean;
  defaultAsTask?: boolean;
  taskContentMode?: TaskContentMode;
  hideSyncTarget?: boolean;
  detailsOpen?: boolean;
  showContentInput?: boolean;
}

export interface UnifiedTaskComposer {
  element: HTMLElement;
  value: () => { content: string; task?: ProjectTaskOptions };
}

export interface OpenUnifiedTaskComposerOptions {
  content: string;
  fallbackDueDate?: string;
  projectTag?: string;
  defaultTarget?: ProjectSendChoice | null;
}

export function openUnifiedTaskComposer(plugin: MemosPlusPlugin, options: OpenUnifiedTaskComposerOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new UnifiedTaskComposerModal(plugin.app, plugin, options, resolve).open();
  });
}

export function createUnifiedTaskComposer(container: HTMLElement, options: UnifiedTaskComposerOptions): UnifiedTaskComposer {
  const root = container.createDiv({ cls: "memos-plus-unified-task-composer" });
  let source = options.content.trim();
  const draft = createUnifiedTaskDraft(source, options.taskSettings, options.defaults);

  const contentInput = options.showContentInput === false
    ? null
    : root.createEl("textarea", {
        cls: "memos-plus-unified-task-content",
        attr: {
          rows: "2",
          "aria-label": t(options.language, "unifiedTask.content")
        }
      });
  if (contentInput) contentInput.value = source;

  const preview = root.createDiv({ cls: "memos-plus-unified-task-preview" });
  const renderPreview = (): void => {
    renderUnifiedTaskSummary(preview, parseNaturalLanguageTask(source), options.language);
  };
  contentInput?.addEventListener("input", () => {
    source = contentInput.value.trim();
    renderPreview();
  });
  renderPreview();

  const details = root.createEl("details", { cls: "memos-plus-unified-task-details" });
  details.open = options.detailsOpen ?? false;
  details.createEl("summary", { text: t(options.language, "unifiedTask.details") });
  const formHost = details.createDiv({ cls: "memos-plus-unified-task-fields" });
  const taskOptionsForm = createTaskOptionsForm(formHost, {
    language: options.language,
    taskSettings: options.taskSettings,
    defaultAsTask: options.defaultAsTask ?? true,
    allowPlain: options.allowPlain,
    taskContentMode: options.taskContentMode ?? "task-only",
    renderMetadataOptions: true,
    hideSyncTarget: options.hideSyncTarget,
    initialTask: draft.task
  });

  return {
    element: root,
    value: () => {
      const currentSource = contentInput ? contentInput.value.trim() : source;
      const currentDraft = createUnifiedTaskDraft(currentSource, options.taskSettings, {
        ...options.defaults,
        task: taskOptionsForm.value() ?? undefined
      });
      return {
        content: currentDraft.content,
        task: taskOptionsForm.value()
      };
    }
  };
}

export function renderUnifiedTaskSummary(container: HTMLElement, parsed: ParsedNaturalLanguageTask, language: Language): void {
  container.empty();
  container.createDiv({ cls: "memos-plus-unified-task-preview-label", text: t(language, "taskCalendar.quickTaskPreview") });
  container.createDiv({ cls: "memos-plus-unified-task-preview-title", text: parsed.title });
  const metadata = container.createDiv({ cls: "memos-plus-unified-task-preview-meta" });
  if (!parsed.matched) metadata.createSpan({ text: t(language, "taskCalendar.quickTaskUnparsed") });
  if (parsed.date) metadata.createSpan({ text: `${t(language, "taskCalendar.quickTaskDate")} ${parsed.date}` });
  if (parsed.time) metadata.createSpan({ text: `${t(language, "taskCalendar.quickTaskTime")} ${parsed.time}` });
  if (parsed.reminderMinutesBefore !== undefined) {
    metadata.createSpan({ text: t(language, "taskCalendar.quickTaskReminder").replace("{minutes}", String(parsed.reminderMinutesBefore)) });
  }
  if (parsed.priority !== "none") metadata.createSpan({ text: `${t(language, "taskCalendar.quickTaskPriority")} ${priorityLabel(parsed.priority, language)}` });
  for (const tag of parsed.tags) metadata.createSpan({ text: tag });
}

function priorityLabel(priority: ProjectTaskOptions["priority"], language: Language): string {
  const key: Parameters<typeof t>[1] = priority === "highest"
    ? "taskPriority.highest"
    : priority === "high"
      ? "taskPriority.high"
      : priority === "low"
        ? "taskPriority.low"
        : priority === "lowest"
          ? "taskPriority.lowest"
          : priority === "none"
            ? "taskPriority.none"
            : "taskPriority.medium";
  return t(language, key);
}

class UnifiedTaskComposerModal extends Modal {
  private resolved = false;
  private target: ProjectSendChoice | null;
  private targetTextEl: HTMLElement | null = null;
  private composer: UnifiedTaskComposer | null = null;

  constructor(
    app: App,
    private readonly plugin: MemosPlusPlugin,
    private readonly options: OpenUnifiedTaskComposerOptions,
    private readonly onResolve: (created: boolean) => void
  ) {
    super(app);
    this.target = options.defaultTarget ?? null;
  }

  onOpen(): void {
    const lang = this.plugin.settings.language;
    const { contentEl } = this;
    this.modalEl.addClass("memos-plus-unified-task-modal-shell");
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-unified-task-modal");
    contentEl.createEl("h2", { text: t(lang, "unifiedTask.title") });
    this.composer = createUnifiedTaskComposer(contentEl, {
      language: lang,
      content: this.options.content,
      taskSettings: unifiedTaskFormSettings(this.plugin),
      defaults: {
        fallbackDueDate: this.options.fallbackDueDate,
        projectTag: this.options.projectTag
      },
      allowPlain: false,
      taskContentMode: "task-only",
      detailsOpen: false,
      showContentInput: true
    });

    const destination = contentEl.createDiv({ cls: "memos-plus-unified-task-destination" });
    destination.createDiv({ cls: "memos-plus-unified-task-destination-label", text: t(lang, "unifiedTask.destination") });
    const destinationRow = destination.createDiv({ cls: "memos-plus-unified-task-destination-row" });
    this.targetTextEl = destinationRow.createDiv({ cls: "memos-plus-unified-task-destination-value" });
    this.renderTargetText();
    const destinationActions = destination.createDiv({ cls: "memos-plus-unified-task-destination-actions" });
    const currentFile = this.plugin.app.workspace.getActiveFile();
    if (currentFile) {
      const current = destinationActions.createEl("button", { attr: { type: "button" }, text: t(lang, "unifiedTask.currentFile") });
      current.addEventListener("click", () => {
        this.target = {
          file: currentFile,
          section: "",
          mode: "file",
          fileTarget: { heading: "", position: "file-end" }
        };
        this.renderTargetText();
      });
    }
    const choose = destinationActions.createEl("button", { attr: { type: "button" }, text: t(lang, "unifiedTask.chooseDestination") });
    choose.addEventListener("click", () => void this.chooseTarget(choose));
    const inbox = destinationActions.createEl("button", { attr: { type: "button" }, text: t(lang, "unifiedTask.useInbox") });
    inbox.addEventListener("click", () => {
      this.target = null;
      this.renderTargetText();
    });

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    const cancel = footer.createEl("button", { attr: { type: "button" }, text: t(lang, "modal.cancel") });
    const confirm = footer.createEl("button", { cls: "memos-plus-save-button", attr: { type: "button" }, text: t(lang, "unifiedTask.create") });
    cancel.addEventListener("click", () => this.finish(false));
    confirm.addEventListener("click", () => void this.create(confirm));
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.resolved) {
      this.resolved = true;
      this.onResolve(false);
    }
  }

  private async chooseTarget(button: HTMLButtonElement): Promise<void> {
    const value = this.composer?.value();
    if (!value?.content || !value.task) return;
    button.disabled = true;
    try {
      const target = await selectProjectTarget(
        {
          app: this.plugin.app,
          store: this.plugin.store,
          settings: this.plugin.settings,
          persistSettings: () => this.plugin.persistSettings(),
          selectProjectTargetOnMobile: (modalOptions) => this.plugin.selectProjectTargetOnMobile(modalOptions)
        },
        value.content,
        "search",
        undefined,
        undefined,
        undefined,
        value.task
      );
      if (target) {
        this.target = target;
        this.renderTargetText();
      }
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  private async create(button: HTMLButtonElement): Promise<void> {
    const value = this.composer?.value();
    if (!value?.content || !value.task) return;
    button.disabled = true;
    try {
      const created = await this.plugin.createUnifiedTask(value.content, value.task, this.target);
      if (created) this.finish(true);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  private renderTargetText(): void {
    if (!this.targetTextEl) return;
    const target = this.target;
    this.targetTextEl.setText(target
      ? `${target.file.basename}${target.section ? ` · ${target.section}` : ""}`
      : `${t(this.plugin.settings.language, "unifiedTask.taskInbox")} · ${this.plugin.settings.taskCalendar.inboxPath}`);
    this.targetTextEl.setAttr("title", target?.file.path ?? this.plugin.settings.taskCalendar.inboxPath);
  }

  private finish(created: boolean): void {
    if (this.resolved) return;
    this.resolved = true;
    this.onResolve(created);
    this.close();
  }
}

function unifiedTaskFormSettings(plugin: MemosPlusPlugin): TaskOptionsFormSettings {
  const settings = plugin.settings;
  return {
    enabled: settings.tasksFormatEnabled,
    defaultPriority: settings.taskDefaultPriority,
    defaultDueDate: settings.taskDefaultDueDate,
    defaultScheduledDate: settings.taskDefaultScheduledDate,
    defaultRecurrence: settings.taskDefaultRecurrence,
    addCreatedDate: settings.taskAddCreatedDate,
    appleSyncEnabled: settings.appleSyncEnabled,
    appleSyncTag: settings.appleSyncTag,
    defaultSyncTarget: settings.appleSyncEnabled ? "reminders" : "tasks"
  };
}
