import { App, Modal, Setting } from "obsidian";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { focusOnDesktopOnly } from "./modalFocus";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";
import {
  TEMPLATE_AFTER_TRANSFER_ACTIONS,
  TEMPLATE_GLOBAL_OVERRIDE_MODES,
  TEMPLATE_INSERT_FORMATS,
  buildTemplateFileContent,
  createEmptyManagedTemplate,
  normalizeTemplateBoundHeadings,
  type ManagedTemplate,
  type TemplateAfterTransferAction,
  type TemplateGlobalOverrideMode,
  type TemplateInsertFormat
} from "./templateManager";
import type { TaskContentMode } from "./tasksFormat";

interface TemplateEditorModalOptions {
  language: Language;
  template?: ManagedTemplate;
  onSubmit: (template: ManagedTemplate) => Promise<void>;
}

type TemplatePurpose = "project" | "tag-file" | "recent" | "search" | "default";

const TEMPLATE_PURPOSES: TemplatePurpose[] = ["project", "tag-file", "recent", "search", "default"];
const FORMAT_RULE_TASK_CONTENT_MODES: TaskContentMode[] = ["task-with-detail", "task-only"];

export class TemplateEditorModal extends Modal {
  private draft: ManagedTemplate;
  private formEl!: HTMLElement;
  private previewEl!: HTMLPreElement;

  constructor(app: App, private readonly options: TemplateEditorModalOptions) {
    super(app);
    this.draft = options.template
      ? { ...options.template, defaultTags: [...options.template.defaultTags], boundHeadings: [...(options.template.boundHeadings ?? [])] }
      : createEmptyManagedTemplate();
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "TemplateEditorModal");
    const { contentEl } = this;
    const lang = this.options.language;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-template-modal");
    contentEl.createEl("h2", { text: this.options.template ? t(lang, "templateManager.editTemplate") : t(lang, "templateManager.addTemplate") });
    contentEl.createDiv({ cls: "setting-item-description memos-plus-template-editor-desc", text: t(lang, "templateManager.editorDesc") });

    this.formEl = contentEl.createDiv({ cls: "memos-plus-template-form" });
    this.renderForm(this.formEl);

    const footer = contentEl.createDiv({ cls: "memos-plus-project-footer" });
    footer.createEl("button", { attr: { type: "button" }, text: t(lang, "modal.cancel") }).addEventListener("click", () => this.close());
    const save = footer.createEl("button", { cls: "memos-plus-save-button", attr: { type: "button" }, text: t(lang, "modal.save") });
    save.addEventListener("click", () => void withMobileClickLock(save, () => this.submit(save)));
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "TemplateEditorModal");
    this.contentEl.empty();
  }

  private renderForm(container: HTMLElement): void {
    this.renderBasicInfoSection(container);
    this.renderFormatSection(container);
    this.renderAfterSendSection(container);

    const preview = container.createDiv({ cls: "memos-plus-template-preview-wrap" });
    preview.createDiv({ cls: "memos-plus-template-preview-label", text: t(this.options.language, "templateManager.preview") });
    this.previewEl = preview.createEl("pre", { cls: "memos-plus-template-preview" });

    this.renderAdvancedSettings(container);
    this.refreshPreview();
  }

  private rerenderForm(): void {
    this.formEl.empty();
    this.renderForm(this.formEl);
  }

  private renderBasicInfoSection(container: HTMLElement): void {
    const lang = this.options.language;
    const section = this.renderSection(container, "templateManager.section.basic");
    new Setting(section)
      .setName(t(lang, "templateManager.name"))
      .addText((text) => {
        text.setValue(this.draft.name).onChange((value) => {
          this.draft.name = value.trim() || t(lang, "templateManager.untitled");
          this.refreshPreview();
        });
      });

    new Setting(section)
      .setName(t(lang, "templateManager.purpose"))
      .addDropdown((dropdown) => {
        for (const purpose of TEMPLATE_PURPOSES) {
          dropdown.addOption(purpose, t(lang, `templateManager.purpose.${purpose}`));
        }
        dropdown.setValue(purposeFromTemplate(this.draft)).onChange((value) => {
          applyPurpose(this.draft, value as TemplatePurpose);
          this.rerenderForm();
        });
      });

    new Setting(section)
      .setName(t(lang, "templateManager.boundHeadings"))
      .setDesc(t(lang, "templateManager.boundHeadingsDesc"))
      .addTextArea((text) => {
        text.setPlaceholder(t(lang, "templateManager.boundHeadingsPlaceholder"));
        text.setValue(this.draft.boundHeadings.join("\n")).onChange((value) => {
          this.draft.boundHeadings = normalizeTemplateBoundHeadings(value);
          this.refreshPreview();
        });
        text.inputEl.rows = 3;
      });
  }

  private renderFormatSection(container: HTMLElement): void {
    const lang = this.options.language;
    const section = this.renderSection(container, "templateManager.section.format");
    new Setting(section)
      .setName(t(lang, "templateManager.insertFormat"))
      .addDropdown((dropdown) => {
        for (const format of TEMPLATE_INSERT_FORMATS) {
          dropdown.addOption(format, t(lang, `templateManager.insertFormat.${format}`));
        }
        dropdown.setValue(this.draft.insertFormat).onChange((value) => {
          this.draft.insertFormat = value as TemplateInsertFormat;
          this.rerenderForm();
        });
      });

    if (this.draft.insertFormat === "custom") {
      this.renderCustomTemplateEditor(section);
    }

    new Setting(section)
      .setName(t(lang, "templateManager.taskContentMode"))
      .setDesc(t(lang, "templateManager.taskContentModeDesc"))
      .addDropdown((dropdown) => {
        for (const mode of FORMAT_RULE_TASK_CONTENT_MODES) {
          dropdown.addOption(mode, t(lang, `templateManager.taskContentMode.${mode}`));
        }
        dropdown.setValue(this.draft.taskContentMode).onChange((value) => {
          this.draft.taskContentMode = value as TaskContentMode;
          this.refreshPreview();
        });
      });
  }

  private renderAfterSendSection(container: HTMLElement): void {
    const lang = this.options.language;
    const section = this.renderSection(container, "templateManager.section.afterSend");
    new Setting(section)
      .setName(t(lang, "templateManager.clearAfterSendMode"))
      .setDesc(t(lang, "templateManager.clearAfterSendModeDesc"))
      .addDropdown((dropdown) => {
        for (const mode of TEMPLATE_GLOBAL_OVERRIDE_MODES) {
          dropdown.addOption(mode, t(lang, `templateManager.globalOverride.${mode}`));
        }
        dropdown.setValue(this.draft.clearAfterSendMode).onChange((value) => {
          this.draft.clearAfterSendMode = value as TemplateGlobalOverrideMode;
          this.rerenderForm();
        });
      });
    if (this.draft.clearAfterSendMode === "custom") {
      new Setting(section)
        .setName(t(lang, "templateManager.clearAfterSend"))
        .addToggle((toggle) => {
          toggle.setValue(this.draft.clearAfterSend).onChange((value) => {
            this.draft.clearAfterSend = value;
            this.refreshPreview();
          });
        });
    }

    new Setting(section)
      .setName(t(lang, "templateManager.afterTransferActionMode"))
      .setDesc(t(lang, "templateManager.afterTransferActionModeDesc"))
      .addDropdown((dropdown) => {
        for (const mode of TEMPLATE_GLOBAL_OVERRIDE_MODES) {
          dropdown.addOption(mode, t(lang, `templateManager.globalOverride.${mode}`));
        }
        dropdown.setValue(this.draft.afterTransferActionMode).onChange((value) => {
          this.draft.afterTransferActionMode = value as TemplateGlobalOverrideMode;
          this.rerenderForm();
        });
      });
    if (this.draft.afterTransferActionMode === "custom") {
      new Setting(section)
        .setName(t(lang, "templateManager.afterTransferAction"))
        .addDropdown((dropdown) => {
          for (const action of TEMPLATE_AFTER_TRANSFER_ACTIONS) {
            dropdown.addOption(action, t(lang, `templateManager.afterTransferAction.${action}`));
          }
          dropdown.setValue(this.draft.afterTransferAction).onChange((value) => {
            this.draft.afterTransferAction = value as TemplateAfterTransferAction;
            this.refreshPreview();
          });
        });
    }
  }

  private renderSection(container: HTMLElement, titleKey: string): HTMLElement {
    const section = container.createDiv({ cls: "memos-plus-template-section" });
    section.createEl("h3", { cls: "memos-plus-template-section-title", text: t(this.options.language, titleKey) });
    return section;
  }

  private renderAdvancedSettings(container: HTMLElement): void {
    const lang = this.options.language;
    const details = container.createEl("details", { cls: "memos-plus-template-advanced" });
    details.createEl("summary", { text: t(lang, "templateManager.advanced") });
    details.createDiv({ cls: "setting-item-description", text: t(lang, "templateManager.advancedDesc") });
  }

  private renderCustomTemplateEditor(container: HTMLElement): void {
    const lang = this.options.language;
    let advancedInput: HTMLTextAreaElement | null = null;
    const variableSetting = new Setting(container).setName(t(lang, "templateManager.variableButtons"));
    for (const [variable, labelKey] of [
      ["title", "templateManager.variable.title"],
      ["date", "templateManager.variable.date"],
      ["time", "templateManager.variable.time"],
      ["datetime", "templateManager.variable.datetime"],
      ["content", "templateManager.variable.content"],
      ["tag", "templateManager.variable.tag"],
      ["source", "templateManager.variable.source"],
      ["folder", "templateManager.variable.folder"]
    ] as Array<[string, string]>) {
      variableSetting.addButton((button) => {
        button.setButtonText(t(lang, labelKey)).onClick(() => {
          if (!advancedInput) {
            return;
          }
          const token = `{{${variable}}}`;
          advancedInput.setRangeText(token, advancedInput.selectionStart, advancedInput.selectionEnd, "end");
          this.draft.advancedContentTemplate = advancedInput.value;
          this.refreshPreview();
          focusOnDesktopOnly(advancedInput);
        });
      });
    }

    new Setting(container)
      .setName(t(lang, "templateManager.advancedContent"))
      .setDesc(t(lang, "templateManager.advancedContentDesc"))
      .addTextArea((text) => {
        advancedInput = text.inputEl;
        text.setValue(this.draft.advancedContentTemplate).onChange((value) => {
          this.draft.advancedContentTemplate = value;
          this.refreshPreview();
        });
        text.inputEl.rows = 6;
      });
  }

  private refreshPreview(): void {
    if (!this.previewEl) {
      return;
    }
    this.previewEl.setText(
      buildTemplateFileContent(this.draft, {
        title: this.draft.name || "示例标题",
        content: "这里是收集到的正文内容",
        tag: this.draft.defaultTags[0] ?? "标签",
        source: "https://example.com",
        folder: this.draft.folderPath,
        now: new Date(2026, 5, 16, 8, 9)
      }).trim()
    );
  }

  private async submit(button: HTMLButtonElement): Promise<void> {
    if (!this.draft.name.trim()) {
      this.draft.name = t(this.options.language, "templateManager.untitled");
    }
    button.disabled = true;
    try {
      await this.options.onSubmit({
        ...this.draft,
        defaultTags: [...this.draft.defaultTags],
        boundHeadings: normalizeTemplateBoundHeadings(this.draft.boundHeadings)
      });
      this.close();
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }
}

function purposeFromTemplate(template: ManagedTemplate): TemplatePurpose {
  if (template.targetSource === "project-tag") {
    return "project";
  }
  if (template.targetSource === "specific-tag") {
    return "tag-file";
  }
  if (template.targetSource === "recent-file") {
    return "recent";
  }
  if (template.targetSource === "vault-search" || template.targetSource === "fixed-file" || template.targetSource === "new-file") {
    return "search";
  }
  if (template.targetSource === "default-memo") {
    return "default";
  }
  return "default";
}

function applyPurpose(template: ManagedTemplate, purpose: TemplatePurpose): void {
  if (purpose === "project") {
    template.type = "project";
    template.targetSource = "project-tag";
    template.recognitionTag = template.recognitionTag || "项目";
    return;
  }
  if (purpose === "tag-file") {
    template.type = "tag-file";
    template.targetSource = "specific-tag";
    return;
  }
  if (purpose === "recent") {
    template.type = "general";
    template.targetSource = "recent-file";
    return;
  }
  if (purpose === "search") {
    template.type = "general";
    template.targetSource = "vault-search";
    return;
  }
  if (purpose === "default") {
    template.type = "general";
    template.targetSource = "default-memo";
    return;
  }
}
