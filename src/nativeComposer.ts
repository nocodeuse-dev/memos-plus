import { Platform, type App, type Editor } from "obsidian";
import { wrapCodeBlockAtCursor } from "./composerTools";

export type ComposerKind = "native" | "textarea";

export interface NativeMarkdownComposer {
  kind: ComposerKind;
  element: HTMLElement;
  getValue(): string;
  setValue(value: string): void;
  clear(): void;
  focus(): void;
  insertText(text: string): void;
  wrapCodeBlock(): void;
  destroy(): void;
}

export interface NativeMarkdownComposerOptions {
  app: App;
  container: HTMLElement;
  placeholder: string;
  sourcePath: string;
}

interface MarkdownEmbed {
  editable?: boolean;
  editor?: Editor;
  editMode?: {
    editor?: Editor;
    get?: () => string;
    set?: (data: string, clear?: boolean) => void;
  };
  get?: () => string;
  set?: (data: string, clear?: boolean) => void;
  showEditor?: () => void;
  unload?: () => void;
}

type MarkdownEmbedFactory = (context: { app: App; containerEl: HTMLElement }, file: unknown, sourcePath: string) => MarkdownEmbed;

export function createNativeMarkdownComposer(options: NativeMarkdownComposerOptions): NativeMarkdownComposer {
  const native = tryCreateNativeComposer(options);
  return native ?? createTextareaComposer(options);
}

function tryCreateNativeComposer(options: NativeMarkdownComposerOptions): NativeMarkdownComposer | null {
  const factory = getMarkdownEmbedFactory(options.app);
  if (!factory) {
    return null;
  }

  const host = document.createElement("div");
  host.classList.add("memos-plus-native-editor-host");
  host.setAttribute("data-placeholder", options.placeholder);
  options.container.appendChild(host);

  try {
    const embed = factory({ app: options.app, containerEl: host }, null, options.sourcePath);
    embed.editable = true;
    embed.set?.("", true);
    embed.showEditor?.();
    const editor = getEmbedEditor(embed);
    if (!editor) {
      embed.unload?.();
      host.remove();
      return null;
    }
    const focusEditor = (): void => {
      editor.focus();
      requestAnimationFrame(() => {
        editor.focus();
      });
    };
    if (Platform.isMobile) {
      host.addEventListener("touchstart", focusEditor, true);
    } else {
      host.addEventListener("mousedown", focusEditor, true);
      host.addEventListener("click", focusEditor, true);
    }
    return new EmbeddedMarkdownComposer(host, embed, editor);
  } catch (error) {
    console.warn("[Memos Plus] Could not create native Markdown composer", error);
    host.remove();
    return null;
  }
}

function getMarkdownEmbedFactory(app: App): MarkdownEmbedFactory | null {
  const maybeApp = app as App & {
    embedRegistry?: {
      embedByExtension?: {
        md?: MarkdownEmbedFactory;
      };
    };
  };
  return maybeApp.embedRegistry?.embedByExtension?.md ?? null;
}

function getEmbedEditor(embed: MarkdownEmbed): Editor | null {
  return embed.editMode?.editor ?? embed.editor ?? null;
}

class EmbeddedMarkdownComposer implements NativeMarkdownComposer {
  kind: ComposerKind = "native";

  constructor(
    readonly element: HTMLElement,
    private readonly embed: MarkdownEmbed,
    private readonly editor: Editor
  ) {}

  getValue(): string {
    return this.editor.getValue();
  }

  setValue(value: string): void {
    this.editor.setValue(value);
  }

  clear(): void {
    this.setValue("");
  }

  focus(): void {
    this.editor.focus();
  }

  insertText(text: string): void {
    this.editor.replaceSelection(text);
    this.editor.focus();
  }

  wrapCodeBlock(): void {
    const value = this.editor.getValue();
    const start = this.editor.posToOffset(this.editor.getCursor("from"));
    const end = this.editor.posToOffset(this.editor.getCursor("to"));
    const result = wrapCodeBlockAtCursor(value, start, end);
    this.editor.setValue(result.value);
    this.editor.setCursor(this.editor.offsetToPos(result.selectionStart));
    this.editor.focus();
  }

  destroy(): void {
    this.embed.unload?.();
    this.element.remove();
  }
}

class TextareaMarkdownComposer implements NativeMarkdownComposer {
  kind: ComposerKind = "textarea";

  constructor(readonly element: HTMLTextAreaElement) {
    this.element.addEventListener("input", () => this.resizeToContent());
    this.resizeToContent();
  }

  getValue(): string {
    return this.element.value;
  }

  setValue(value: string): void {
    this.element.value = value;
    this.element.selectionStart = value.length;
    this.element.selectionEnd = value.length;
    this.resizeToContent();
  }

  clear(): void {
    this.setValue("");
  }

  focus(): void {
    this.element.focus();
  }

  insertText(text: string): void {
    const start = this.element.selectionStart ?? this.element.value.length;
    const end = this.element.selectionEnd ?? start;
    this.element.value = `${this.element.value.slice(0, start)}${text}${this.element.value.slice(end)}`;
    const cursor = start + text.length;
    this.resizeToContent();
    this.element.setSelectionRange(cursor, cursor);
    this.element.focus();
  }

  wrapCodeBlock(): void {
    const start = this.element.selectionStart ?? this.element.value.length;
    const end = this.element.selectionEnd ?? start;
    const result = wrapCodeBlockAtCursor(this.element.value, start, end);
    this.element.value = result.value;
    this.resizeToContent();
    this.element.setSelectionRange(result.selectionStart, result.selectionEnd);
    this.element.focus();
  }

  destroy(): void {
    this.element.remove();
  }

  private resizeToContent(): void {
    const element = this.element as HTMLTextAreaElement & { style?: CSSStyleDeclaration; scrollHeight?: number };
    if (!element.style) {
      return;
    }
    element.style.height = "auto";
    const scrollHeight = element.scrollHeight ?? 0;
    if (scrollHeight > 0) {
      element.style.height = `${scrollHeight}px`;
    }
  }
}

function createTextareaComposer(options: NativeMarkdownComposerOptions): NativeMarkdownComposer {
  const textarea = document.createElement("textarea");
  textarea.classList.add("memos-plus-composer-input");
  textarea.setAttribute("placeholder", options.placeholder);
  options.container.appendChild(textarea);
  return new TextareaMarkdownComposer(textarea);
}
