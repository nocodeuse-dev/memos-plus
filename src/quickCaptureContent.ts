import { MarkdownView, Modal, Setting, type App } from "obsidian";
import { t, type Language } from "./i18n";
import { type MemosPlusSettings } from "./settings";

export type QuickCaptureInitialContentMode = "auto" | "selection" | "clipboard" | "none";
export type QuickCaptureContentSource = "selection" | "clipboard-text" | "clipboard-link" | "clipboard-image";
export type QuickCaptureContentAction = "replace" | "append" | "skip";

export interface QuickCapturePromptRequest {
  source: QuickCaptureContentSource;
  existingContent: string;
  incomingContent: string;
}

export interface QuickCaptureInitialContentResult {
  action: QuickCaptureContentAction;
  content: string;
  source: QuickCaptureContentSource;
  imageFile?: File;
}

export interface QuickCaptureInitialContentOptions {
  settings: MemosPlusSettings;
  existingContent?: string;
  mode?: QuickCaptureInitialContentMode;
  readSelection?: () => string;
  readClipboardText?: () => Promise<string>;
  readClipboardImage?: () => Promise<File | null>;
  chooseAction?: (request: QuickCapturePromptRequest) => Promise<QuickCaptureContentAction>;
  onClipboardUnsupported?: () => void;
}

export async function getQuickCaptureInitialContent(options: QuickCaptureInitialContentOptions): Promise<QuickCaptureInitialContentResult | null> {
  const mode = options.mode ?? "auto";
  if (mode === "none") {
    return null;
  }
  if ((mode === "auto" || mode === "selection") && options.settings.quickCaptureAutoSelection) {
    const selection = options.readSelection?.().trim() ?? "";
    if (selection) {
      return resolveIncomingContent(options, selection, "selection");
    }
  }
  if (mode === "selection") {
    return null;
  }
  if (!shouldReadClipboard(options.settings, mode)) {
    return null;
  }
  const clipboardText = await readClipboardText(options);
  if (clipboardText) {
    const source = options.settings.quickCaptureRecognizeClipboardLinks && isLikelyUrl(clipboardText) ? "clipboard-link" : "clipboard-text";
    return resolveIncomingContent(options, clipboardText, source);
  }
  const imageFile = await options.readClipboardImage?.();
  if (imageFile) {
    const result = await resolveIncomingContent(options, imageFile.name, "clipboard-image");
    return result ? { ...result, imageFile } : null;
  }
  return null;
}

export function mergeComposerContent(existingContent: string, incomingContent: string, action: QuickCaptureContentAction): string {
  if (action === "skip") {
    return existingContent;
  }
  if (action === "replace" || !existingContent.trim()) {
    return incomingContent;
  }
  return `${existingContent.replace(/\s+$/, "")}\n${incomingContent}`;
}

export function readCurrentEditorSelection(app: App): string {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  return view?.editor?.getSelection()?.trim() ?? "";
}

export async function readClipboardTextSafely(onUnsupported?: () => void): Promise<string> {
  const clipboard = navigator.clipboard;
  if (!clipboard?.readText) {
    onUnsupported?.();
    return "";
  }
  try {
    return (await clipboard.readText()).trim();
  } catch (error) {
    console.warn("[Memos Plus] Could not read clipboard text", error);
    onUnsupported?.();
    return "";
  }
}

export async function readClipboardImageSafely(onUnsupported?: () => void): Promise<File | null> {
  const clipboard = navigator.clipboard as Clipboard & { read?: () => Promise<ClipboardItem[]> };
  if (!clipboard?.read) {
    return null;
  }
  try {
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find((candidate) => candidate.startsWith("image/"));
      if (!type) {
        continue;
      }
      const blob = await item.getType(type);
      const extension = imageTypeToExtension(type);
      return new File([blob], `clipboard.${extension}`, { type });
    }
  } catch (error) {
    console.warn("[Memos Plus] Could not read clipboard image", error);
    onUnsupported?.();
  }
  return null;
}

export function openQuickCaptureContentPrompt(app: App, language: Language, request: QuickCapturePromptRequest): Promise<QuickCaptureContentAction> {
  return new Promise((resolve) => {
    new QuickCaptureContentPromptModal(app, language, request, resolve).open();
  });
}

async function resolveIncomingContent(
  options: QuickCaptureInitialContentOptions,
  incomingContent: string,
  source: QuickCaptureContentSource
): Promise<QuickCaptureInitialContentResult | null> {
  const existingContent = options.existingContent ?? "";
  const action = existingContent.trim()
    ? await resolveExistingContentAction(options, source, incomingContent, existingContent)
    : await resolveEmptyComposerAction(options, source, incomingContent);
  if (action === "skip") {
    return null;
  }
  return { action, content: incomingContent, source };
}

async function resolveExistingContentAction(
  options: QuickCaptureInitialContentOptions,
  source: QuickCaptureContentSource,
  incomingContent: string,
  existingContent: string
): Promise<QuickCaptureContentAction> {
  const mode = options.settings.quickCaptureExistingContentMode;
  if (mode === "keep") {
    return "skip";
  }
  if (mode === "replace" || mode === "append") {
    return mode;
  }
  return options.chooseAction?.({ source, existingContent, incomingContent }) ?? "skip";
}

async function resolveEmptyComposerAction(
  options: QuickCaptureInitialContentOptions,
  source: QuickCaptureContentSource,
  incomingContent: string
): Promise<QuickCaptureContentAction> {
  if (source === "selection") {
    return "replace";
  }
  const mode = options.settings.quickCaptureClipboardMode;
  if (mode === "off") {
    return "skip";
  }
  if (mode === "replace" || mode === "append") {
    return mode;
  }
  return options.chooseAction?.({ source, existingContent: "", incomingContent }) ?? "skip";
}

async function readClipboardText(options: QuickCaptureInitialContentOptions): Promise<string> {
  try {
    return (await options.readClipboardText?.())?.trim() ?? "";
  } catch (error) {
    console.warn("[Memos Plus] Could not read clipboard text", error);
    options.onClipboardUnsupported?.();
    return "";
  }
}

function shouldReadClipboard(settings: MemosPlusSettings, mode: QuickCaptureInitialContentMode): boolean {
  if (mode === "clipboard") {
    return true;
  }
  return settings.quickCaptureDetectClipboard && settings.quickCaptureClipboardMode !== "off";
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value.trim());
}

function imageTypeToExtension(type: string): string {
  if (type.includes("jpeg")) {
    return "jpg";
  }
  const match = type.match(/^image\/([a-z0-9.+-]+)$/i);
  return match?.[1]?.replace("svg+xml", "svg") || "png";
}

class QuickCaptureContentPromptModal extends Modal {
  private resolved = false;

  constructor(
    app: App,
    private readonly language: Language,
    private readonly request: QuickCapturePromptRequest,
    private readonly resolve: (action: QuickCaptureContentAction) => void
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("memos-plus-modal");
    const hasDraft = Boolean(this.request.existingContent.trim());
    contentEl.createEl("h2", {
      text: t(this.language, hasDraft ? "quickCaptureContent.selectionPrompt" : "quickCaptureContent.clipboardPrompt")
    });
    const preview = contentEl.createEl("pre", { cls: "memos-plus-quick-capture-preview" });
    preview.setText(this.request.incomingContent.slice(0, 500));
    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText(t(this.language, hasDraft ? "quickCaptureContent.replaceDraft" : "quickCaptureContent.fill"))
          .setCta()
          .onClick(() => this.finish("replace"))
      )
      .addButton((button) =>
        button
          .setButtonText(t(this.language, hasDraft ? "quickCaptureContent.appendDraft" : "quickCaptureContent.append"))
          .onClick(() => this.finish("append"))
      )
      .addButton((button) =>
        button.setButtonText(t(this.language, hasDraft ? "quickCaptureContent.cancel" : "quickCaptureContent.ignore")).onClick(() => this.finish("skip"))
      );
  }

  onClose(): void {
    if (!this.resolved) {
      this.resolve("skip");
    }
    this.contentEl.empty();
  }

  private finish(action: QuickCaptureContentAction): void {
    this.resolved = true;
    this.resolve(action);
    this.close();
  }
}
