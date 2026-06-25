import { Menu, Notice, Platform, setIcon, type App, type TFile } from "obsidian";
import { applyComposerIndent, handleComposerEnter } from "./composerInput";
import {
  applyComposerTool,
  formatImageEmbedInsertion,
  insertTableAtCursor,
  type ComposerTextTool,
  type ComposerToolbarToolId
} from "./composerTools";
import type { DisplayModuleId } from "./displayModules";
import { shouldMemosHandleImagePaste } from "./imageHandling";
import { t } from "./i18n";
import { createNativeMarkdownComposer, type NativeMarkdownComposer } from "./nativeComposer";
import { mergeComposerContent, type QuickCaptureContentAction } from "./quickCaptureContent";
import type { MemosPlusSettings } from "./settings";

interface ComposerToolbarButton {
  id: ComposerToolbarToolId;
  icon: string;
  labelKey: string;
  active?: () => boolean;
  onClick: (anchor: HTMLElement) => void | Promise<void>;
}

export interface ComposerWidgetOptions {
  app: App;
  parent: Element;
  settings: () => MemosPlusSettings;
  sourcePath: string;
  onSend: () => void | Promise<void>;
  formatTaskContent?: (content: string, context: { manualCalloutMode: boolean }) => Promise<string | null>;
  saveImageAttachment: (buffer: ArrayBuffer, extension: string) => Promise<string>;
  createExcalidrawAttachment: () => Promise<TFile>;
  registerCleanup?: (cleanup: () => void) => void;
  sendActionTitle?: () => MemosPlusSettings["defaultSendAction"];
  resolveMarkdownLink?: (text: string) => Promise<string | null>;
  onClearDraft?: () => void | Promise<void>;
  surface?: ComposerSurface;
  displayModules?: ReadonlySet<DisplayModuleId>;
}

export type ComposerInputChangeSource = "quick-input-paste" | "clipboard-fill" | "clipboard-append" | "selection-fill" | "selection-append";
export type ComposerSurface = "home" | "mobileHome" | "sidebar" | "quickCaptureModal";
type ComposerInputChangeAction = Extract<QuickCaptureContentAction, "replace" | "append"> | "insert";

interface ComposerInputChangeOptions {
  action?: ComposerInputChangeAction;
  focus?: boolean;
  emitInputEvent?: boolean;
  analyzeLinks?: boolean;
}

interface KeyboardAwareSurfaces {
  content: HTMLElement | null;
  shell: HTMLElement | null;
  modalShell: boolean;
}

export class ComposerWidget {
  readonly element: HTMLElement;
  private readonly composer: NativeMarkdownComposer;
  private readonly surface: ComposerSurface;
  private readonly mobileKeyboardCleanups: Array<() => void> = [];
  private readonly mobileKeyboardScrollTimers: number[] = [];
  private mobileKeyboardViewportTimer: number | null = null;
  private mobileKeyboardActive = false;
  private mobileViewportBaselineHeight = 0;
  private calloutMode = false;
  private calloutStatus: HTMLElement | null = null;
  private clearButton: HTMLButtonElement | null = null;

  constructor(private readonly options: ComposerWidgetOptions) {
    this.surface = this.options.surface ?? "home";
    const settings = this.options.settings();
    this.element = this.options.parent.createDiv({ cls: "memos-plus-composer" });
    this.applyAppearanceSettings(settings);
    const editorHost = this.element.createDiv({ cls: "memos-plus-composer-editor" });
    this.composer = createNativeMarkdownComposer({
      app: this.options.app,
      container: editorHost,
      placeholder: t(settings.language, "composer.placeholder"),
      sourcePath: this.options.sourcePath
    });
    this.bindInputEvents();
    this.renderFooter();
    this.bindMobileKeyboardVisibility();
  }

  get manualCalloutMode(): boolean {
    return this.calloutMode;
  }

  getValue(): string {
    return this.composer.getValue();
  }

  setValue(value: string): void {
    this.composer.setValue(value);
    this.handleInputContentUpdated(false);
  }

  clear(): void {
    this.composer.clear();
    this.calloutMode = false;
    this.handleInputContentUpdated(false);
  }

  focus(): void {
    this.composer.focus();
  }

  insertText(text: string): void {
    this.composer.insertText(text);
    this.handleInputContentUpdated(false);
  }

  async processInputContentChange(source: ComposerInputChangeSource, text: string, options: ComposerInputChangeOptions = {}): Promise<void> {
    const action = options.action ?? "replace";
    this.debugInputPipeline(source, { action, textLength: text.length });
    const processedText = options.analyzeLinks === false ? text : await this.resolveInputLinkText(source, text);
    if (action === "insert") {
      this.composer.insertText(processedText);
    } else {
      this.composer.setValue(mergeComposerContent(this.composer.getValue(), processedText, action));
      if (options.focus) {
        this.composer.focus();
      }
    }
    this.handleInputContentUpdated(options.emitInputEvent ?? false);
  }

  async insertImageFile(file: File): Promise<void> {
    await this.handleImageFile(file);
  }

  resetCalloutMode(): void {
    this.calloutMode = false;
    this.updateCalloutStatus();
  }

  destroy(): void {
    this.setMobileComposerFocusState(false);
    this.clearMobileKeyboardScrollTimers();
    this.clearMobileKeyboardViewportTimer();
    for (const cleanup of this.mobileKeyboardCleanups.splice(0)) {
      cleanup();
    }
    this.composer.destroy();
  }

  private applyAppearanceSettings(settings: MemosPlusSettings): void {
    if (settings.composerBorderColor) {
      this.element.style.setProperty("--memos-plus-composer-border-color", settings.composerBorderColor);
    }
    if (settings.composerBackgroundColor) {
      this.element.style.setProperty("--memos-plus-composer-background-color", settings.composerBackgroundColor);
    }
  }

  private bindInputEvents(): void {
    this.element.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void this.options.onSend();
        return;
      }
      if (this.composer.kind === "textarea") {
        this.handleTextareaKeydown(event);
      }
    });
    this.element.addEventListener("paste", (event) => {
      void this.handleComposerPaste(event);
    });
    this.element.addEventListener("dragover", (event) => {
      if (hasImageFiles(event.dataTransfer)) {
        event.preventDefault();
        this.element.classList.add("is-dragging");
      }
    });
    this.element.addEventListener("dragleave", () => {
      this.element.classList.remove("is-dragging");
    });
    this.element.addEventListener("drop", (event) => {
      void this.handleComposerDrop(event);
    });
    this.element.addEventListener("input", () => {
      this.updateClearButtonState();
    });
  }

  private bindMobileKeyboardVisibility(): void {
    if (!Platform.isMobile) {
      return;
    }

    this.mobileViewportBaselineHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);

    const handleFocus = (): void => {
      if (!this.isComposerEditorActive()) {
        return;
      }
      this.mobileKeyboardActive = true;
      this.setMobileComposerFocusState(true);
      if (!window.visualViewport) {
        this.applyFallbackMobileKeyboardInset();
      } else {
        this.applyVisualViewportKeyboardInset();
      }
      this.scheduleMobileKeyboardRevealSequence();
    };
    this.element.addEventListener("focusin", handleFocus);
    this.element.addEventListener("input", handleFocus);
    this.mobileKeyboardCleanups.push(() => {
      this.element.removeEventListener("focusin", handleFocus);
      this.element.removeEventListener("input", handleFocus);
    });

    const handleBlur = (): void => {
      window.setTimeout(() => {
        if (!this.isComposerEditorActive()) {
          this.mobileKeyboardActive = false;
          this.setMobileComposerFocusState(false);
          this.clearVisualViewportKeyboardInset();
        }
      }, 120);
    };
    this.element.addEventListener("focusout", handleBlur);
    this.mobileKeyboardCleanups.push(() => {
      this.element.removeEventListener("focusout", handleBlur);
    });

    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return;
    }

    const handleDocumentPointer = (event: MouseEvent | TouchEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!this.element.contains(target)) {
        this.mobileKeyboardActive = false;
        this.setMobileComposerFocusState(false);
        this.clearMobileKeyboardScrollTimers();
        this.clearMobileKeyboardViewportTimer();
        this.clearVisualViewportKeyboardInset();
      }
    };
    document.addEventListener("mousedown", handleDocumentPointer, true);
    document.addEventListener("touchstart", handleDocumentPointer, true);
    this.mobileKeyboardCleanups.push(() => {
      document.removeEventListener("mousedown", handleDocumentPointer, true);
      document.removeEventListener("touchstart", handleDocumentPointer, true);
    });

    const handleViewportChange = (): void => {
      this.scheduleMobileKeyboardViewportUpdate();
    };
    visualViewport.addEventListener("resize", handleViewportChange);
    visualViewport.addEventListener("scroll", handleViewportChange);
    this.mobileKeyboardCleanups.push(() => {
      visualViewport.removeEventListener("resize", handleViewportChange);
      visualViewport.removeEventListener("scroll", handleViewportChange);
      this.clearVisualViewportKeyboardInset();
    });
  }

  private scheduleMobileKeyboardRevealSequence(): void {
    if (!this.isMobileKeyboardSessionActive()) {
      return;
    }
    this.clearMobileKeyboardScrollTimers();
    for (const delay of [80, 260, 520]) {
      this.scheduleMobileKeyboardReveal(delay);
    }
  }

  private scheduleMobileKeyboardReveal(delayMs: number): void {
    if (!Platform.isMobile) {
      return;
    }
    const timer = window.setTimeout(() => {
      const index = this.mobileKeyboardScrollTimers.indexOf(timer);
      if (index >= 0) {
        this.mobileKeyboardScrollTimers.splice(index, 1);
      }
      if (!this.isMobileKeyboardSessionActive()) {
        return;
      }
      this.scrollComposerIntoView();
    }, delayMs);
    this.mobileKeyboardScrollTimers.push(timer);
  }

  private clearMobileKeyboardScrollTimers(): void {
    for (const timer of this.mobileKeyboardScrollTimers.splice(0)) {
      window.clearTimeout(timer);
    }
  }

  private clearMobileKeyboardViewportTimer(): void {
    if (this.mobileKeyboardViewportTimer === null) {
      return;
    }
    window.clearTimeout(this.mobileKeyboardViewportTimer);
    this.mobileKeyboardViewportTimer = null;
  }

  private scheduleMobileKeyboardViewportUpdate(): void {
    if (!this.isMobileKeyboardSessionActive()) {
      return;
    }
    if (this.mobileKeyboardViewportTimer !== null) {
      return;
    }
    this.mobileKeyboardViewportTimer = window.setTimeout(() => {
      this.mobileKeyboardViewportTimer = null;
      if (!this.isMobileKeyboardSessionActive()) {
        return;
      }
      this.applyVisualViewportKeyboardInset();
      this.scheduleMobileKeyboardRevealSequence();
    }, 80);
  }

  private isMobileKeyboardSessionActive(): boolean {
    return this.mobileKeyboardActive || this.isComposerEditorActive();
  }

  private isComposerEditorActive(): boolean {
    const activeElement = document.activeElement;
    return activeElement instanceof Node && this.composer.element.contains(activeElement);
  }

  private scrollComposerIntoView(): void {
    if (!this.isMobileKeyboardSessionActive()) {
      return;
    }
    const target = this.composer.element || this.element;
    target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
    const { content } = this.getKeyboardAwareSurfaces();
    if (content) {
      const modalRect = content.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const verticalPadding = 24;
      if (targetRect.bottom > modalRect.bottom - verticalPadding || targetRect.top < modalRect.top + verticalPadding) {
        content.scrollTo({
          top: Math.max(0, content.scrollTop + targetRect.top - modalRect.top - verticalPadding),
          behavior: "smooth"
        });
      }
    }

    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return;
    }
    const targetRect = target.getBoundingClientRect();
    const visibleBottom = visualViewport.offsetTop + visualViewport.height - 28;
    if (targetRect.bottom > visibleBottom) {
      window.scrollBy({ top: targetRect.bottom - visibleBottom, behavior: "smooth" });
    }
  }

  private applyVisualViewportKeyboardInset(): void {
    if (!this.isMobileKeyboardSessionActive()) {
      return;
    }
    const { content, shell } = this.getKeyboardAwareSurfaces();
    const visualViewport = window.visualViewport;
    if (!content || !visualViewport) {
      return;
    }
    const viewportHeight = Math.max(1, Math.round(visualViewport.height));
    this.mobileViewportBaselineHeight = Math.max(this.mobileViewportBaselineHeight, Math.round(window.innerHeight), viewportHeight);
    const heightLoss = Math.max(0, this.mobileViewportBaselineHeight - viewportHeight - Math.round(visualViewport.offsetTop));
    const keyboardInset = Math.max(0, Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop), heightLoss);
    this.applyKeyboardSurfaceState(content, shell, keyboardInset, viewportHeight, Math.round(visualViewport.offsetTop));
  }

  private applyFallbackMobileKeyboardInset(): void {
    const { content, shell } = this.getKeyboardAwareSurfaces();
    if (!content) {
      return;
    }
    const fallbackViewportHeight = Math.max(320, Math.round(window.innerHeight - 320));
    this.applyKeyboardSurfaceState(content, shell, 320, fallbackViewportHeight, 0);
  }

  private applyKeyboardSurfaceState(content: HTMLElement, shell: HTMLElement | null, keyboardInset: number, viewportHeight: number, viewportTop: number): void {
    const isKeyboardOpen = keyboardInset > 80 || (this.isComposerEditorActive() && viewportHeight < this.mobileViewportBaselineHeight - 80);
    const keyboardShift = isKeyboardOpen ? Math.min(180, Math.max(96, Math.round(keyboardInset * 0.45))) : 0;
    const { modalShell } = this.getKeyboardAwareSurfaces();
    for (const surface of [content, shell].filter((item): item is HTMLElement => item instanceof HTMLElement)) {
      surface.style.setProperty("--memos-plus-keyboard-inset", `${keyboardInset}px`);
      surface.style.setProperty("--memos-plus-keyboard-shift", `${keyboardShift}px`);
      surface.style.setProperty("--memos-plus-mobile-viewport-height", `${viewportHeight}px`);
      surface.style.setProperty("--memos-plus-mobile-viewport-top", `${viewportTop}px`);
      surface.classList.toggle("is-keyboard-open", isKeyboardOpen);
    }
    if (modalShell) {
      shell?.classList.add("memos-plus-quick-capture-keyboard-shell");
    }
  }

  private clearVisualViewportKeyboardInset(): void {
    const { content, shell } = this.getKeyboardAwareSurfaces();
    for (const surface of [content, shell].filter((item): item is HTMLElement => item instanceof HTMLElement)) {
      surface.style.removeProperty("--memos-plus-keyboard-inset");
      surface.style.removeProperty("--memos-plus-keyboard-shift");
      surface.style.removeProperty("--memos-plus-mobile-viewport-height");
      surface.style.removeProperty("--memos-plus-mobile-viewport-top");
      surface.classList.remove("is-keyboard-open");
    }
  }

  private setMobileComposerFocusState(focused: boolean): void {
    if (!Platform.isMobile) {
      return;
    }
    const { content, shell } = this.getKeyboardAwareSurfaces();
    for (const surface of [content, shell].filter((item): item is HTMLElement => item instanceof HTMLElement)) {
      surface.classList.toggle("is-composer-focused", focused);
    }
  }

  private getKeyboardAwareSurfaces(): KeyboardAwareSurfaces {
    switch (this.surface) {
      case "quickCaptureModal": {
        const content = this.element.closest<HTMLElement>(".memos-plus-quick-capture-modal");
        return {
          content,
          shell: content?.closest<HTMLElement>(".modal") ?? null,
          modalShell: true
        };
      }
      case "sidebar": {
        const content = this.element.closest<HTMLElement>(".memos-plus-quick-input-view");
        return {
          content,
          shell: content,
          modalShell: false
        };
      }
      case "mobileHome":
      case "home": {
        const content = this.element.closest<HTMLElement>(".memos-plus-view");
        return {
          content,
          shell: this.element.closest<HTMLElement>(".memos-plus-shell, .memos-plus-mobile-light-shell"),
          modalShell: false
        };
      }
    }
  }

  private renderFooter(): void {
    const settings = this.options.settings();
    const lang = settings.language;
    const showInputToolbar = this.shouldRenderDisplayModule("inputToolbar");
    const showMoreMenu = this.shouldRenderDisplayModule("moreMenu");
    const showSendButton = this.shouldRenderDisplayModule("sendButton");
    if (!showInputToolbar && !showMoreMenu && !showSendButton) {
      return;
    }
    const footer = this.element.createDiv({ cls: "memos-plus-composer-footer" });
    const tools = showInputToolbar || showMoreMenu ? footer.createDiv({ cls: "memos-plus-composer-tools" }) : null;
    const toolButtons: ComposerToolbarButton[] = [
      { id: "tag", icon: "hash", labelKey: "toolbar.insertTag", onClick: () => this.applyTextTool("tag") },
      { id: "image", icon: "image", labelKey: "toolbar.insertImage", onClick: () => this.pickImageFromDisk() },
      { id: "unorderedList", icon: "list", labelKey: "toolbar.insertUL", onClick: () => this.applyTextTool("ul") },
      { id: "orderedList", icon: "list-ordered", labelKey: "toolbar.insertOL", onClick: () => this.applyTextTool("ol") },
      { id: "task", icon: "square-check", labelKey: "toolbar.insertTask", onClick: () => this.applyTaskTool() },
      { id: "table", icon: "table", labelKey: "toolbar.insertTable", onClick: (button) => this.showTablePicker(button) },
      {
        id: "codeBlock",
        icon: "code-2",
        labelKey: "toolbar.insertCodeBlock",
        onClick: () => {
          this.composer.wrapCodeBlock();
          this.handleInputContentUpdated(false);
        }
      },
      { id: "excalidraw", icon: "pencil-ruler", labelKey: "toolbar.insertExcalidraw", onClick: () => this.createExcalidrawAttachment() }
    ];
    if (settings.calloutEnabled) {
      toolButtons.push({
        id: "callout",
        icon: "text-quote",
        labelKey: "toolbar.calloutMode",
        active: () => this.calloutMode,
        onClick: () => {
          this.calloutMode = !this.calloutMode;
          this.updateCalloutStatus();
        }
      });
    }
    const visibleTools = showInputToolbar ? toolButtons.filter((item) => settings.composerToolbar[item.id]) : [];
    const hiddenTools = showInputToolbar ? toolButtons.filter((item) => !settings.composerToolbar[item.id]) : toolButtons;
    if (tools && showInputToolbar) {
      for (const item of visibleTools) {
        const label = t(lang, item.labelKey);
        const button = tools.createEl("button", {
          cls: `memos-plus-tool-button${item.active?.() ? " is-active" : ""}`,
          attr: { type: "button", "aria-label": label, title: label }
        });
        setIcon(button, item.icon);
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          void item.onClick(button);
          button.classList.toggle("is-active", item.active?.() ?? false);
        });
      }
    }
    if (tools && showMoreMenu) {
      const moreButton = tools.createEl("button", {
        cls: "memos-plus-tool-button",
        attr: { type: "button", "aria-label": t(lang, "toolbar.more"), title: t(lang, "toolbar.more") }
      });
      setIcon(moreButton, "more-horizontal");
      moreButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openComposerToolsMenu(event, hiddenTools, moreButton);
      });
    }
    if (tools && showInputToolbar) {
      const clearTool = { icon: "eraser", labelKey: "toolbar.clearInput" } as const;
      const clearLabel = t(lang, clearTool.labelKey);
      const clearButton = tools.createEl("button", {
        cls: "memos-plus-tool-button memos-plus-clear-input-button",
        attr: { type: "button", "aria-label": clearLabel, title: clearLabel }
      });
      setIcon(clearButton, "eraser");
      clearButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        void this.clearInput();
      });
      this.clearButton = clearButton;
      this.calloutStatus = tools.createDiv({ cls: "memos-plus-callout-status" });
      this.updateCalloutStatus();
      this.updateClearButtonState();
    }
    if (showSendButton) {
      const sendTitle = t(lang, `sendAction.${this.options.sendActionTitle?.() ?? settings.defaultSendAction}`);
      const save = footer.createEl("button", { cls: "memos-plus-save-button", text: t(lang, "composer.send"), attr: { title: sendTitle } });
      save.addEventListener("click", () => {
        void this.options.onSend();
      });
    }
  }

  private shouldRenderDisplayModule(moduleId: DisplayModuleId): boolean {
    return this.options.displayModules?.has(moduleId) ?? true;
  }

  private updateCalloutStatus(): void {
    const settings = this.options.settings();
    if (!this.calloutStatus) {
      return;
    }
    if (!settings.calloutEnabled || !this.calloutMode) {
      this.calloutStatus.setText("");
      this.calloutStatus.addClass("is-hidden");
      return;
    }
    this.calloutStatus.removeClass("is-hidden");
    this.calloutStatus.setText(`${t(settings.language, "callout.status")} · ${settings.calloutType} · ${t(settings.language, `callout.fold.${settings.calloutFoldMode}`)}`);
  }

  private applyTextTool(tool: ComposerTextTool): void {
    if (this.composer.kind === "textarea" && this.composer.element instanceof HTMLTextAreaElement) {
      const textarea = this.composer.element;
      const result = applyComposerTool(textarea.value, textarea.selectionStart, textarea.selectionEnd, tool);
      textarea.value = result.value;
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      this.handleInputContentUpdated(false);
      return;
    }
    this.composer.insertText(textForTool(tool));
    this.handleInputContentUpdated(false);
  }

  private async applyTaskTool(): Promise<void> {
    const settings = this.options.settings();
    if (!settings.taskPromptOnCreate || !this.options.formatTaskContent) {
      this.applyTextTool("task");
      return;
    }
    const content = this.composer.getValue();
    const formatted = await this.options.formatTaskContent(content, { manualCalloutMode: this.calloutMode });
    if (formatted === null) {
      this.focusComposerAfterTaskModal();
      return;
    }
    if (!content.trim()) {
      this.applyTextTool("task");
      return;
    }
    this.composer.setValue(formatted);
    this.calloutMode = false;
    this.updateCalloutStatus();
    this.updateClearButtonState();
    this.focusComposerAfterTaskModal();
  }

  private focusComposerAfterTaskModal(): void {
    if (Platform.isMobile) {
      return;
    }
    this.composer.focus();
  }

  private async clearInput(): Promise<void> {
    const content = this.composer.getValue();
    if (!content) {
      this.updateClearButtonState();
      return;
    }
    if (this.isClearInputRisky(content) && !window.confirm(t(this.options.settings().language, "composer.clearConfirm"))) {
      return;
    }
    this.composer.clear();
    this.calloutMode = false;
    this.handleInputContentUpdated(false);
    try {
      await this.options.onClearDraft?.();
    } catch (error) {
      console.warn("[Memos Plus] Failed to clear composer draft cache", error);
    }
  }

  private isClearInputRisky(content: string): boolean {
    return (
      content.trim().length > 100 ||
      /https?:\/\/|www\.|!\[\[|\]\(|\.(?:png|jpe?g|gif|webp|m4a|mp3|wav|pdf)\b/i.test(content) ||
      /^\s*[-*]\s+\[[ xX]\]/m.test(content)
    );
  }

  private updateClearButtonState(): void {
    if (!this.clearButton) {
      return;
    }
    const hasContent = this.composer.getValue().trim().length > 0;
    this.clearButton.disabled = !hasContent;
    this.clearButton.classList.toggle("is-disabled", !hasContent);
  }

  private openComposerToolsMenu(event: MouseEvent, tools: ComposerToolbarButton[], anchor: HTMLElement): void {
    const lang = this.options.settings().language;
    const menu = new Menu();
    if (tools.length === 0) {
      menu.addItem((item) => {
        item.setTitle(t(lang, "toolbar.noHiddenTools")).setDisabled(true);
      });
    }
    for (const tool of tools) {
      menu.addItem((item) => {
        item
          .setTitle(t(lang, tool.labelKey))
          .setIcon(tool.icon)
          .setChecked(tool.active?.() ?? null)
          .onClick(() => {
            void tool.onClick(anchor);
          });
      });
    }
    menu.showAtMouseEvent(event);
  }

  private pickImageFromDisk(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => {
      void this.handleSelectedImages(input.files);
    });
    input.click();
  }

  private async handleSelectedImages(files: FileList | null): Promise<void> {
    for (const file of Array.from(files ?? [])) {
      if (file.type.startsWith("image/")) {
        await this.handleImageFile(file);
      }
    }
  }

  private async handleImageFile(file: File): Promise<void> {
    const lang = this.options.settings().language;
    try {
      const extension = file.name.split(".").pop() || "png";
      const buffer = await file.arrayBuffer();
      const path = await this.options.saveImageAttachment(buffer, extension);
      const fileName = path.split("/").pop() ?? path;
      this.insertImageEmbed(fileName);
      new Notice(`${t(lang, "notice.imageSaved")}: ${fileName}`);
    } catch (error) {
      console.error("[Memos Plus] Failed to save image attachment", error);
      new Notice(t(lang, "notice.imageFailed"));
    }
  }

  private async createExcalidrawAttachment(): Promise<void> {
    const lang = this.options.settings().language;
    try {
      const file = await this.options.createExcalidrawAttachment();
      const linkName = file.basename;
      this.insertImageEmbed(linkName);
      new Notice(`${t(lang, "notice.excalidrawCreated")}: ${file.name}`);
    } catch (error) {
      console.error("[Memos Plus] Failed to create Excalidraw attachment", error);
      new Notice(t(lang, "notice.excalidrawFailed"));
    }
  }

  private insertImageEmbed(linkName: string): void {
    if (this.composer.kind === "textarea" && this.composer.element instanceof HTMLTextAreaElement) {
      const textarea = this.composer.element;
      const result = formatImageEmbedInsertion(textarea.value, textarea.selectionStart, textarea.selectionEnd, linkName);
      textarea.value = result.value;
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      this.handleInputContentUpdated(false);
      return;
    }
    this.composer.insertText(`![[${linkName}]]`);
    this.handleInputContentUpdated(false);
  }

  private async handleComposerPaste(event: ClipboardEvent): Promise<void> {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
    const file = imageItem?.getAsFile();
    if (file) {
      if (!shouldMemosHandleImagePaste(this.options.settings().imageHandlingMode, this.options.app)) {
        return;
      }
      event.preventDefault();
      await this.handleImageFile(file);
      return;
    }

    const text = event.clipboardData?.getData("text/plain") ?? "";
    if (!text || !this.options.resolveMarkdownLink) {
      return;
    }
    event.preventDefault();
    await this.processInputContentChange("quick-input-paste", text, {
      action: "insert",
      emitInputEvent: true
    });
  }

  private async resolveInputLinkText(source: ComposerInputChangeSource, text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed || !this.options.resolveMarkdownLink) {
      return text;
    }
    this.debugInputPipeline("link-analysis-start", { source, textLength: trimmed.length });
    try {
      const markdownLink = await this.options.resolveMarkdownLink(trimmed);
      this.debugInputPipeline("link-analysis-result", { source, matched: Boolean(markdownLink) });
      return markdownLink ?? text;
    } catch (error) {
      this.debugInputPipeline("link-analysis-result", { source, matched: false, error: true });
      console.warn("[Memos Plus] link-analysis-result failed", error);
      return text;
    }
  }

  private handleInputContentUpdated(emitInputEvent: boolean): void {
    this.updateCalloutStatus();
    this.updateClearButtonState();
    if (emitInputEvent) {
      this.composer.element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  private debugInputPipeline(event: string, data: Record<string, unknown>): void {
    if (!this.options.settings().performanceDebugMode) {
      return;
    }
    console.warn(`[Memos Plus debug] ${event}`, data);
  }

  private async handleComposerDrop(event: DragEvent): Promise<void> {
    const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.type.startsWith("image/"));
    if (files.length === 0) {
      return;
    }
    if (!shouldMemosHandleImagePaste(this.options.settings().imageHandlingMode, this.options.app)) {
      this.element.classList.remove("is-dragging");
      return;
    }
    event.preventDefault();
    this.element.classList.remove("is-dragging");
    for (const file of files) {
      await this.handleImageFile(file);
    }
  }

  private showTablePicker(anchor: HTMLElement): void {
    const existing = document.querySelector(".memos-plus-table-picker");
    if (existing) {
      existing.remove();
      return;
    }

    const isMobile = Platform.isMobile;
    const size = isMobile ? 5 : 6;
    const picker = document.body.createDiv({ cls: `memos-plus-table-picker${isMobile ? " is-mobile" : ""}` });
    const label = picker.createDiv({ cls: "memos-plus-table-picker-label", text: isMobile ? t(this.options.settings().language, "table.mobileHint") : "0 × 0" });
    const grid = picker.createDiv({ cls: "memos-plus-table-picker-grid" });
    const cells: HTMLElement[][] = [];
    let selectedRow = 0;
    let selectedColumn = 0;

    const updateSelection = (row: number, column: number): void => {
      selectedRow = row;
      selectedColumn = column;
      for (let rowIndex = 0; rowIndex < size; rowIndex++) {
        for (let columnIndex = 0; columnIndex < size; columnIndex++) {
          cells[rowIndex][columnIndex].classList.toggle("is-active", rowIndex <= row && columnIndex <= column);
        }
      }
      label.setText(`${row + 1} × ${column + 1}`);
    };

    for (let row = 0; row < size; row++) {
      cells[row] = [];
      for (let column = 0; column < size; column++) {
        const cell = grid.createEl("button", {
          cls: "memos-plus-table-picker-cell",
          attr: { type: "button", "aria-label": `${row + 1} x ${column + 1}` }
        });
        cell.dataset.row = String(row);
        cell.dataset.column = String(column);
        if (isMobile) {
          cell.createSpan({ cls: "memos-plus-table-picker-cell-text", text: `${row + 1}×${column + 1}` });
        }
        cells[row][column] = cell;
      }
    }

    grid.addEventListener("mouseover", (event) => {
      if (isMobile) {
        return;
      }
      const cell = getTablePickerCell(event.target);
      if (!cell) {
        return;
      }
      updateSelection(Number(cell.dataset.row ?? "0"), Number(cell.dataset.column ?? "0"));
    });
    grid.addEventListener("click", (event) => {
      const cell = getTablePickerCell(event.target);
      if (!cell) {
        return;
      }
      const row = isMobile ? Number(cell.dataset.row ?? "0") : selectedRow;
      const column = isMobile ? Number(cell.dataset.column ?? "0") : selectedColumn;
      this.insertTable(row + 1, column + 1);
      close();
    });

    if (isMobile) {
      picker.setCssStyles({ left: "50%", top: "50%", transform: "translate(-50%, -50%)" });
    } else {
      const rect = anchor.getBoundingClientRect();
      picker.setCssStyles({ left: `${Math.round(rect.left)}px`, top: `${Math.round(rect.bottom + 6)}px` });
      requestAnimationFrame(() => {
        const pickerRect = picker.getBoundingClientRect();
        const width = document.documentElement.clientWidth;
        const height = document.documentElement.clientHeight;
        if (pickerRect.right > width - 8) {
          picker.setCssStyles({ left: `${Math.max(8, width - pickerRect.width - 8)}px` });
        }
        if (pickerRect.bottom > height - 8) {
          picker.setCssStyles({ top: `${Math.max(8, rect.top - pickerRect.height - 6)}px` });
        }
      });
    }

    const handleOutside = (event: MouseEvent | TouchEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (!picker.contains(target) && target !== anchor) {
        close();
      }
    };
    const close = (): void => {
      picker.remove();
      document.removeEventListener("mousedown", handleOutside, true);
      document.removeEventListener("touchstart", handleOutside, true);
    };
    setTimeout(() => {
      document.addEventListener("mousedown", handleOutside, true);
      document.addEventListener("touchstart", handleOutside, true);
    }, 0);
    this.options.registerCleanup?.(close);
  }

  private insertTable(rows: number, columns: number): void {
    if (this.composer.kind === "textarea" && this.composer.element instanceof HTMLTextAreaElement) {
      const textarea = this.composer.element;
      const result = insertTableAtCursor(textarea.value, textarea.selectionStart, textarea.selectionEnd, rows, columns);
      textarea.value = result.value;
      textarea.focus();
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      this.handleInputContentUpdated(false);
      return;
    }
    this.composer.insertText(buildTable(rows, columns));
    this.handleInputContentUpdated(false);
  }

  private handleTextareaKeydown(event: KeyboardEvent): void {
    if (!(this.composer.element instanceof HTMLTextAreaElement)) {
      return;
    }
    const textarea = this.composer.element;
    if (event.key === "Enter") {
      const result = handleComposerEnter(textarea.value, textarea.selectionStart, textarea.selectionEnd);
      if (result) {
        event.preventDefault();
        textarea.value = result.value;
        textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
        this.handleInputContentUpdated(false);
      }
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const result = applyComposerIndent(textarea.value, textarea.selectionStart, textarea.selectionEnd, event.shiftKey ? "outdent" : "indent");
      textarea.value = result.value;
      textarea.setSelectionRange(result.selectionStart, result.selectionEnd);
      this.handleInputContentUpdated(false);
    }
  }
}

function hasImageFiles(dataTransfer: DataTransfer | null): boolean {
  return Array.from(dataTransfer?.items ?? []).some((item) => item.kind === "file" && item.type.startsWith("image/"));
}

function getTablePickerCell(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) {
    return null;
  }
  return target.closest<HTMLElement>(".memos-plus-table-picker-cell");
}

function textForTool(tool: ComposerTextTool): string {
  switch (tool) {
    case "tag":
      return "#";
    case "ol":
      return "1. ";
    case "task":
      return "- [ ] ";
    case "ul":
      return "- ";
  }
}

function buildTable(rows: number, columns: number): string {
  const safeRows = Math.max(1, Math.min(rows, 12));
  const safeColumns = Math.max(1, Math.min(columns, 12));
  const header = `| ${Array.from({ length: safeColumns }, (_, index) => `列 ${index + 1}`).join(" | ")} |`;
  const separator = `| ${Array.from({ length: safeColumns }, () => "---").join(" | ")} |`;
  const body = Array.from({ length: Math.max(1, safeRows - 1) }, () => `| ${Array.from({ length: safeColumns }, () => " ").join(" | ")} |`);
  return `\n${[header, separator, ...body].join("\n")}\n`;
}
