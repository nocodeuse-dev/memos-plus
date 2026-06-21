import { App, Modal, Setting } from "obsidian";
import { createComposerSession, type ComposerSession } from "./composerSession";
import type { Language } from "./i18n";
import { t } from "./i18n";
import { focusOnDesktopOnly } from "./modalFocus";
import type { QuickCaptureInitialContentMode } from "./quickCaptureContent";
import type { MemosPlusSettings } from "./settings";
import type { MemosPlusStore } from "./store";

export interface QuickCaptureModalOptions {
  settings: MemosPlusSettings;
  store: MemosPlusStore;
  persistSettings: () => Promise<void>;
  refreshViews: () => Promise<void>;
  initialContent?: string;
  initialContentMode?: QuickCaptureInitialContentMode;
  showClipboardEmptyNotice?: boolean;
  resolveMarkdownLink?: (text: string) => Promise<string | null>;
}

export class QuickCaptureModal extends Modal {
  private composerSession: ComposerSession | null = null;
  private readonly cleanups: Array<() => void> = [];

  constructor(
    app: App,
    private readonly options: QuickCaptureModalOptions
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("memos-plus-quick-capture-keyboard-shell");
    contentEl.addClass("memos-plus-modal", "memos-plus-quick-capture-modal");
    this.composerSession = createComposerSession({
      app: this.app,
      parent: contentEl,
      settings: this.options.settings,
      store: this.options.store,
      persistSettings: this.options.persistSettings,
      refreshViews: this.options.refreshViews,
      registerCleanup: (cleanup) => this.cleanups.push(cleanup),
      resolveMarkdownLink: this.options.resolveMarkdownLink
    }, {
      initialContent: this.options.initialContent,
      initialContentMode: this.options.initialContentMode ?? "auto",
      showClipboardEmptyNotice: this.options.showClipboardEmptyNotice,
      afterDefaultSave: () => this.close(),
      afterProjectSend: () => this.close()
    });

    void this.composerSession.applyInitialContent();
    focusOnDesktopOnly(this.composerSession);
  }

  onClose(): void {
    for (const cleanup of this.cleanups.splice(0)) {
      cleanup();
    }
    this.composerSession?.destroy();
    this.composerSession = null;
    this.modalEl.removeClass("memos-plus-quick-capture-keyboard-shell", "is-keyboard-open");
    this.contentEl.empty();
  }

}

export class EditMemoModal extends Modal {
  private textarea!: HTMLTextAreaElement;

  constructor(
    app: App,
    private readonly language: Language,
    private readonly initialContent: string,
    private readonly onSubmit: (content: string) => Promise<void>
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal");
    contentEl.createEl("h2", { text: t(this.language, "modal.editTitle") });
    this.textarea = contentEl.createEl("textarea", {
      cls: "memos-plus-modal-textarea"
    });
    this.textarea.value = this.initialContent;
    this.textarea.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void this.submit();
      }
    });

    new Setting(contentEl)
      .addButton((button) => button.setButtonText(t(this.language, "modal.cancel")).onClick(() => this.close()))
      .addButton((button) => {
        button
          .setButtonText(t(this.language, "modal.save"))
          .setCta()
          .onClick(() => {
            void this.submit();
          });
      });

    focusOnDesktopOnly(this.textarea);
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    await this.onSubmit(this.textarea.value);
    this.close();
  }
}
