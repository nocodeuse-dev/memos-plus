import { App, Modal } from "obsidian";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { registerMemosPlusModalClose, registerMemosPlusModalOpen, withMobileClickLock } from "./mobileModalSafety";

export interface ConfirmModalOptions {
  language: Language;
  title: string;
  message: string;
  confirmText?: string;
}

export function confirmWithModal(app: App, options: ConfirmModalOptions): Promise<boolean> {
  return new Promise((resolve) => {
    new MemosPlusConfirmModal(app, options, resolve).open();
  });
}

class MemosPlusConfirmModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly options: ConfirmModalOptions,
    private readonly resolve: (value: boolean) => void
  ) {
    super(app);
  }

  onOpen(): void {
    registerMemosPlusModalOpen(this, "MemosPlusConfirmModal");
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal", "memos-plus-confirm-modal");
    contentEl.createEl("h2", { text: this.options.title });
    contentEl.createDiv({ cls: "memos-plus-confirm-message", text: this.options.message });

    const footer = contentEl.createDiv({ cls: "memos-plus-sidebar-group-footer" });
    const cancel = footer.createEl("button", { text: t(this.options.language, "modal.cancel"), attr: { type: "button" } });
    cancel.addEventListener("click", () => this.finish(false));
    const confirm = footer.createEl("button", {
      cls: "memos-plus-save-button",
      text: this.options.confirmText ?? t(this.options.language, "projectSend.confirm"),
      attr: { type: "button" }
    });
    confirm.addEventListener("click", () => {
      void withMobileClickLock(confirm, () => this.finish(true));
    });
  }

  onClose(): void {
    registerMemosPlusModalClose(this, "MemosPlusConfirmModal");
    this.contentEl.empty();
    this.finish(false);
  }

  private finish(value: boolean): void {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.resolve(value);
    this.close();
  }
}
