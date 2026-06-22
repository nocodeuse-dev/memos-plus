import { App, Modal, Notice, setIcon } from "obsidian";
import { IconPickerModal, normalizeIconName } from "./iconPicker";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { focusOnDesktopOnly } from "./modalFocus";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";

export interface SidebarGroupModalOptions {
  language: Language;
  initialTitle?: string;
  initialIcon?: string;
  onSubmit: (result: SidebarGroupModalResult) => Promise<void>;
}

export interface SidebarGroupModalResult {
  title: string;
  icon: string;
}

export class SidebarGroupModal extends Modal {
  private titleInput!: HTMLInputElement;
  private selectedIcon: string;
  private iconPreviewEl!: HTMLElement;
  private iconNameEl!: HTMLElement;

  constructor(
    app: App,
    private readonly options: SidebarGroupModalOptions
  ) {
    super(app);
    this.selectedIcon = normalizeIconName(options.initialIcon, "folder");
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "SidebarGroupModal");
    const lang = this.options.language;
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-sidebar-group-modal");

    contentEl.createEl("h2", { text: t(lang, this.options.initialTitle ? "sidebar.editGroup" : "sidebar.createGroup") });

    const titleField = contentEl.createDiv({ cls: "memos-plus-sidebar-group-field" });
    titleField.createEl("label", { text: t(lang, "sidebar.groupName") });
    this.titleInput = titleField.createEl("input", {
      cls: "memos-plus-sidebar-group-input",
      attr: { type: "text", placeholder: t(lang, "sidebar.groupName") }
    });
    this.titleInput.value = this.options.initialTitle ?? "";

    const iconField = contentEl.createDiv({ cls: "memos-plus-sidebar-group-field" });
    iconField.createEl("label", { text: t(lang, "sidebar.icon") });
    const iconControl = iconField.createDiv({ cls: "memos-plus-icon-setting-control" });
    this.iconPreviewEl = iconControl.createSpan({ cls: "memos-plus-icon-setting-preview" });
    this.iconNameEl = iconControl.createSpan({ cls: "memos-plus-icon-setting-name" });
    const chooseIcon = iconControl.createEl("button", { text: t(lang, "iconPicker.choose"), attr: { type: "button" } });
    chooseIcon.addEventListener("click", () => {
      new IconPickerModal(this.app, {
        language: lang,
        selectedIcon: this.selectedIcon,
        onChoose: (icon) => {
          this.selectedIcon = icon;
          this.renderIcon();
        }
      }).open();
    });
    this.renderIcon();

    const footer = contentEl.createDiv({ cls: "memos-plus-sidebar-group-footer" });
    const cancel = footer.createEl("button", { text: t(lang, "modal.cancel") });
    cancel.addEventListener("click", () => this.close());
    const save = footer.createEl("button", { cls: "memos-plus-save-button", text: t(lang, "modal.save") });
    save.addEventListener("click", () => {
      void withMobileClickLock(save, () => this.submit());
    });

    this.titleInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void withMobileClickLock(save, () => this.submit());
      }
    });
    focusOnDesktopOnly(this.titleInput);
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "SidebarGroupModal");
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    const lang = this.options.language;
    const title = this.titleInput.value.trim();
    if (!title) {
      new Notice(t(lang, "sidebar.groupNameRequired"));
      return;
    }
    await this.options.onSubmit({
      title,
      icon: normalizeIconName(this.selectedIcon, "folder")
    });
    this.close();
  }

  private renderIcon(): void {
    this.iconPreviewEl.empty();
    setIcon(this.iconPreviewEl, normalizeIconName(this.selectedIcon, "folder"));
    this.iconNameEl.setText(normalizeIconName(this.selectedIcon, "folder"));
  }
}
