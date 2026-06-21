import { App, Modal, Setting, TFolder, normalizePath } from "obsidian";
import { normalizeFileTag } from "./fileSend";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { focusOnDesktopOnly } from "./modalFocus";
import {
  DEFAULT_TEMPLATE_HEADING,
  MANAGED_TEMPLATE_TYPES,
  TEMPLATE_AFTER_TRANSFER_ACTIONS,
  TEMPLATE_GLOBAL_OVERRIDE_MODES,
  TEMPLATE_INSERT_FORMATS,
  TEMPLATE_INSERT_LOCATIONS,
  TEMPLATE_TASK_CONTENT_MODES,
  TEMPLATE_TARGET_SOURCES,
  buildTemplateFileContent,
  createEmptyManagedTemplate,
  type ManagedTemplate,
  type ManagedTemplateType,
  type TemplateAfterTransferAction,
  type TemplateFilenameRule,
  type TemplateGlobalOverrideMode,
  type TemplateInsertFormat,
  type TemplateInsertLocation,
  type TemplateTargetSource
} from "./templateManager";
import type { TaskContentMode } from "./tasksFormat";

interface TemplateEditorModalOptions {
  language: Language;
  template?: ManagedTemplate;
  onSubmit: (template: ManagedTemplate) => Promise<void>;
}

type PickerMode = "file" | "folder";
type TemplatePurpose = "project" | "tag-file" | "new-file" | "fixed-file" | "daily" | "custom";

const TEMPLATE_PURPOSES: TemplatePurpose[] = ["project", "tag-file", "new-file", "fixed-file", "daily", "custom"];
const SIMPLE_FILENAME_RULES: TemplateFilenameRule[] = ["title", "date-title", "title-date"];

export class TemplateEditorModal extends Modal {
  private draft: ManagedTemplate;
  private formEl!: HTMLElement;
  private previewEl!: HTMLPreElement;

  constructor(app: App, private readonly options: TemplateEditorModalOptions) {
    super(app);
    this.draft = options.template ? { ...options.template, defaultTags: [...options.template.defaultTags] } : createEmptyManagedTemplate();
  }

  onOpen(): void {
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
    save.addEventListener("click", () => void this.submit(save));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderForm(container: HTMLElement): void {
    this.renderBasicInfoSection(container);
    this.renderTargetFileSection(container);
    this.renderNewFileSection(container);
    this.renderInsertSection(container);
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
  }

  private renderTargetFileSection(container: HTMLElement): void {
    const lang = this.options.language;
    const purpose = purposeFromTemplate(this.draft);
    const section = this.renderSection(container, "templateManager.section.target");

    if (purpose === "project") {
      new Setting(section)
        .setName(t(lang, "templateManager.findProjectTag"))
        .addText((text) => {
          text.setPlaceholder("项目").setValue(this.draft.recognitionTag).onChange((value) => {
            this.draft.recognitionTag = normalizeFileTag(value);
            this.refreshPreview();
          });
        });
      return;
    }

    if (purpose === "tag-file") {
      new Setting(section)
        .setName(t(lang, "templateManager.findFileTag"))
        .addText((text) => {
          text.setPlaceholder("病").setValue(this.draft.recognitionTag).onChange((value) => {
            this.draft.recognitionTag = normalizeFileTag(value);
            this.refreshPreview();
          });
        });
      return;
    }

    if (purpose === "fixed-file") {
      this.renderPathPicker(section, "templateManager.chooseFixedFile", "file", this.draft.fixedFilePath, (value) => {
        this.draft.fixedFilePath = value;
        this.refreshPreview();
      });
      return;
    }

    section.createDiv({
      cls: "memos-plus-template-section-desc",
      text: t(lang, purpose === "daily" ? "templateManager.targetDesc.daily" : purpose === "new-file" ? "templateManager.targetDesc.newFile" : "templateManager.targetDesc.custom")
    });
  }

  private renderNewFileSection(container: HTMLElement): void {
    if (purposeFromTemplate(this.draft) !== "new-file") {
      return;
    }
    const lang = this.options.language;
    const section = this.renderSection(container, "templateManager.section.newFile");
    this.renderPathPicker(section, "templateManager.newFileTemplate", "file", this.draft.templateFilePath, (value) => {
      this.draft.templateFilePath = value;
      this.refreshPreview();
    });
    this.renderPathPicker(section, "templateManager.folder", "folder", this.draft.folderPath, (value) => {
      this.draft.folderPath = value || "我的资源/Memos";
      this.refreshPreview();
    });

    new Setting(section)
      .setName(t(lang, "templateManager.filenameRule"))
      .addDropdown((dropdown) => {
        const rules = [...SIMPLE_FILENAME_RULES];
        if (!rules.includes(this.draft.filenameRule)) {
          rules.push(this.draft.filenameRule);
        }
        for (const rule of rules) {
          dropdown.addOption(rule, t(lang, `templateManager.filenameRule.${rule}`));
        }
        dropdown.setValue(this.draft.filenameRule).onChange((value) => {
          this.draft.filenameRule = value as TemplateFilenameRule;
          this.refreshPreview();
        });
      });

    new Setting(section)
      .setName(t(lang, "templateManager.newFileTags"))
      .setDesc(t(lang, "templateManager.newFileTagsDesc"))
      .addText((text) => {
        text.setPlaceholder("项目, 病").setValue(this.draft.defaultTags.join(", ")).onChange((value) => {
          this.draft.defaultTags = parseTags(value);
          this.refreshPreview();
        });
      });
  }

  private renderInsertSection(container: HTMLElement): void {
    const lang = this.options.language;
    const section = this.renderSection(container, "templateManager.section.insert");
    new Setting(section)
      .setName(t(lang, "templateManager.insertLocation"))
      .addDropdown((dropdown) => {
        for (const location of TEMPLATE_INSERT_LOCATIONS) {
          dropdown.addOption(location, t(lang, `templateManager.insertLocation.${location}`));
        }
        dropdown.setValue(this.draft.insertLocation).onChange((value) => {
          this.draft.insertLocation = value as TemplateInsertLocation;
          this.draft.insertPosition = toLegacyInsertPosition(this.draft.insertLocation, this.draft.insertPosition);
          this.rerenderForm();
        });
      });

    if (this.draft.insertLocation === "heading") {
      new Setting(section)
        .setName(t(lang, "templateManager.heading"))
        .addText((text) => {
          text.setPlaceholder(DEFAULT_TEMPLATE_HEADING).setValue(this.draft.heading).onChange((value) => {
            this.draft.heading = value.trim();
            this.refreshPreview();
          });
        });

      new Setting(section)
        .setName(t(lang, "templateManager.createHeading"))
        .addToggle((toggle) => {
          toggle.setValue(this.draft.createHeadingIfMissing).onChange((value) => {
            this.draft.createHeadingIfMissing = value;
            this.refreshPreview();
          });
        });
    }

    if (this.draft.insertLocation === "new-heading") {
      new Setting(section)
        .setName(t(lang, "templateManager.newHeadingName"))
        .addText((text) => {
          text.setPlaceholder(DEFAULT_TEMPLATE_HEADING).setValue(this.draft.newHeadingName).onChange((value) => {
            this.draft.newHeadingName = value.trim();
            this.refreshPreview();
          });
        });

      new Setting(section)
        .setName(t(lang, "templateManager.newHeadingLevel"))
        .addDropdown((dropdown) => {
          for (let level = 1; level <= 6; level += 1) {
            dropdown.addOption(String(level), t(lang, `fileSend.headingLevel.${level}`));
          }
          dropdown.setValue(String(this.draft.newHeadingLevel)).onChange((value) => {
            const parsed = Number.parseInt(value, 10);
            this.draft.newHeadingLevel = parsed >= 1 && parsed <= 6 ? (parsed as ManagedTemplate["newHeadingLevel"]) : 2;
            this.refreshPreview();
          });
        });

      new Setting(section)
        .setName(t(lang, "templateManager.newHeadingPosition"))
        .addDropdown((dropdown) => {
          for (const position of ["file-end", "file-start", "after-current-heading"] as const) {
            dropdown.addOption(position, t(lang, `fileSend.newHeadingPosition.${position}`));
          }
          dropdown.setValue(this.draft.newHeadingPosition).onChange((value) => {
            this.draft.newHeadingPosition = value === "file-start" || value === "after-current-heading" ? value : "file-end";
            this.refreshPreview();
          });
        });

      new Setting(section)
        .setName(t(lang, "templateManager.existingHeadingBehavior"))
        .addDropdown((dropdown) => {
          for (const behavior of ["use-existing", "create-duplicate", "cancel"] as const) {
            dropdown.addOption(behavior, t(lang, `fileSend.existingHeadingBehavior.${behavior}`));
          }
          dropdown.setValue(this.draft.existingHeadingBehavior).onChange((value) => {
            this.draft.existingHeadingBehavior = value === "create-duplicate" || value === "cancel" ? value : "use-existing";
            this.refreshPreview();
          });
        });
    }
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
        for (const mode of TEMPLATE_TASK_CONTENT_MODES) {
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

  private renderPathPicker(container: HTMLElement, labelKey: string, mode: PickerMode, value: string, onChange: (value: string) => void): void {
    const lang = this.options.language;
    let inputEl: HTMLInputElement | null = null;
    new Setting(container)
      .setName(t(lang, labelKey))
      .addText((text) => {
        inputEl = text.inputEl;
        text.setValue(value);
        text.inputEl.readOnly = true;
      })
      .addButton((button) => {
        button.setButtonText(t(lang, mode === "file" ? "templateManager.chooseTemplateFile" : "templateManager.chooseFolder")).onClick(() => {
          new TemplatePathPickerModal(this.app, lang, mode, (path) => {
            onChange(path);
            if (inputEl) {
              inputEl.value = path;
            }
          }).open();
        });
      });
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

    new Setting(details)
      .setName(t(lang, "templateManager.advancedTemplateType"))
      .addDropdown((dropdown) => {
        for (const type of MANAGED_TEMPLATE_TYPES) {
          dropdown.addOption(type, t(lang, `templateManager.type.${type}`));
        }
        dropdown.setValue(this.draft.type).onChange((value) => {
          this.draft.type = value as ManagedTemplateType;
          this.refreshPreview();
        });
      });

    new Setting(details)
      .setName(t(lang, "templateManager.advancedTargetSource"))
      .addDropdown((dropdown) => {
        for (const source of TEMPLATE_TARGET_SOURCES) {
          dropdown.addOption(source, t(lang, `templateManager.targetSource.${source}`));
        }
        dropdown.setValue(this.draft.targetSource).onChange((value) => {
          this.draft.targetSource = value as TemplateTargetSource;
          this.rerenderForm();
        });
      });

    new Setting(details)
      .setName(t(lang, "templateManager.manualTemplateFile"))
      .addText((text) => {
        text.setValue(this.draft.templateFilePath).onChange((value) => {
          this.draft.templateFilePath = normalizePath(value.trim());
          this.refreshPreview();
        });
      });

    new Setting(details)
      .setName(t(lang, "templateManager.manualFixedFile"))
      .addText((text) => {
        text.setValue(this.draft.fixedFilePath).onChange((value) => {
          this.draft.fixedFilePath = normalizePath(value.trim());
          this.refreshPreview();
        });
      });

    new Setting(details)
      .setName(t(lang, "templateManager.manualFolder"))
      .addText((text) => {
        text.setValue(this.draft.folderPath).onChange((value) => {
          this.draft.folderPath = normalizePath(value.trim() || "我的资源/Memos");
          this.refreshPreview();
        });
      });

    new Setting(details)
      .setName(t(lang, "templateManager.customFilenameRule"))
      .addText((text) => {
        text.setValue(this.draft.customFilenameRule).onChange((value) => {
          this.draft.customFilenameRule = value;
          this.refreshPreview();
        });
      });

    if (this.draft.insertFormat !== "custom") {
      this.renderCustomTemplateEditor(details);
    }
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
          advancedInput.focus();
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
      await this.options.onSubmit({ ...this.draft, defaultTags: [...this.draft.defaultTags] });
      this.close();
    } finally {
      if (button.isConnected) {
        button.disabled = false;
      }
    }
  }
}

function toLegacyInsertPosition(location: TemplateInsertLocation, current: ManagedTemplate["insertPosition"]): ManagedTemplate["insertPosition"] {
  if (location === "file-start") {
    return "file-start";
  }
  if (location === "file-end") {
    return "file-end";
  }
  if (location === "heading") {
    return current === "heading-bottom" ? "heading-bottom" : "heading-top";
  }
  if (location === "new-heading") {
    return "new-heading";
  }
  return current;
}

function purposeFromTemplate(template: ManagedTemplate): TemplatePurpose {
  if (template.targetSource === "project-tag") {
    return "project";
  }
  if (template.targetSource === "specific-tag") {
    return "tag-file";
  }
  if (template.targetSource === "new-file") {
    return "new-file";
  }
  if (template.targetSource === "fixed-file") {
    return "fixed-file";
  }
  if (template.targetSource === "default-memo") {
    return "daily";
  }
  return "custom";
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
  if (purpose === "new-file") {
    template.type = template.type === "custom" ? "custom" : "general";
    template.targetSource = "new-file";
    return;
  }
  if (purpose === "fixed-file") {
    template.targetSource = "fixed-file";
    return;
  }
  if (purpose === "daily") {
    template.type = "general";
    template.targetSource = "default-memo";
    return;
  }
  template.type = "custom";
  template.targetSource = "vault-search";
}

function parseTags(value: string): string[] {
  return value
    .split(/[\n,，]+/)
    .map((tag) => normalizeFileTag(tag))
    .filter((tag, index, array) => tag && array.indexOf(tag) === index);
}

class TemplatePathPickerModal extends Modal {
  private query = "";

  constructor(
    app: App,
    private readonly language: Language,
    private readonly mode: PickerMode,
    private readonly onChoose: (path: string) => void
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.addClass("memos-plus-modal");
    this.contentEl.createEl("h2", {
      text: t(this.language, this.mode === "file" ? "templateManager.chooseTemplateFile" : "templateManager.chooseFolder")
    });
    const search = this.contentEl.createEl("input", {
      cls: "memos-plus-project-search",
      attr: { type: "search", placeholder: t(this.language, "common.search") }
    });
    const list = this.contentEl.createDiv({ cls: "memos-plus-project-list" });
    search.addEventListener("input", () => {
      this.query = search.value.trim().toLowerCase();
      this.renderList(list);
    });
    this.renderList(list);
    focusOnDesktopOnly(search);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderList(list: HTMLElement): void {
    list.empty();
    const items = this.mode === "file" ? this.templateFiles() : this.folders();
    for (const path of items.filter((path) => !this.query || path.toLowerCase().includes(this.query)).slice(0, 120)) {
      const button = list.createEl("button", { cls: "memos-plus-project-option", attr: { type: "button" } });
      button.createDiv({ cls: "memos-plus-project-option-title", text: path || "/" });
      button.addEventListener("click", () => {
        this.onChoose(path);
        this.close();
      });
    }
  }

  private templateFiles(): string[] {
    return this.app.vault
      .getMarkdownFiles()
      .map((file) => file.path)
      .sort((left, right) => left.localeCompare(right));
  }

  private folders(): string[] {
    const folders = new Set<string>([""]);
    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (file instanceof TFolder) {
        folders.add(normalizePath(file.path));
      }
    }
    return Array.from(folders).sort((left, right) => left.localeCompare(right));
  }
}
