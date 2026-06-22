import { afterEach, describe, expect, it, vi } from "vitest";
import { Platform } from "obsidian";
import { createNativeMarkdownComposer } from "../src/nativeComposer";

vi.mock("obsidian", () => ({
  App: class {},
  Notice: class {},
  PluginSettingTab: class {},
  Setting: class {},
  TFile: class {},
  TFolder: class {},
  Platform: { isMobile: false },
  normalizePath: (value: string) => value.replace(/\/+/g, "/").replace(/\/$/, "")
}));

class FakeElement {
  children: FakeElement[] = [];
  value = "";
  selectionStart = 0;
  selectionEnd = 0;
  className = "";
  textContent = "";
  attrs = new Map<string, string>();
  parentElement: FakeElement | null = null;
  listeners = new Map<string, Array<{ listener: (event: Event) => void; capture: boolean }>>();
  classList = {
    add: (...names: string[]) => {
      this.className = Array.from(new Set([...this.className.split(" ").filter(Boolean), ...names])).join(" ");
    }
  };

  constructor(readonly tagName: string) {}

  appendChild(child: FakeElement): FakeElement {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  addEventListener(type: string, listener: (event: Event) => void, options?: boolean | AddEventListenerOptions): void {
    const capture = typeof options === "boolean" ? options : Boolean(options?.capture);
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), { listener, capture }]);
  }

  dispatch(type: string, event = { target: this } as unknown as Event): void {
    for (const { listener } of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  remove(): void {
    if (!this.parentElement) {
      return;
    }
    this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
  }

  focus(): void {}

  setSelectionRange(start: number, end: number): void {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
}

function installFakeDocument(): void {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => new FakeElement(tagName)
  });
}

describe("createNativeMarkdownComposer", () => {
  afterEach(() => {
    Platform.isMobile = false;
    vi.unstubAllGlobals();
  });

  it("uses an Obsidian markdown embed when available", () => {
    installFakeDocument();
    const animationFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    const editor = {
      getValue: vi.fn(() => "native text"),
      setValue: vi.fn(),
      replaceSelection: vi.fn(),
      getCursor: vi.fn((side?: string) => (side === "to" ? { line: 0, ch: 11 } : { line: 0, ch: 7 })),
      posToOffset: vi.fn((position: { ch: number }) => position.ch),
      offsetToPos: vi.fn((offset: number) => ({ line: 0, ch: offset })),
      setCursor: vi.fn(),
      focus: vi.fn()
    };
    const embed = {
      editable: false,
      set: vi.fn(),
      showEditor: vi.fn(),
      unload: vi.fn(),
      editMode: { editor }
    };
    const factory = vi.fn(() => embed);
    const container = new FakeElement("div");

    const composer = createNativeMarkdownComposer({
      app: { embedRegistry: { embedByExtension: { md: factory } } } as never,
      container: container as never,
      placeholder: "此刻，你在想什么？",
      sourcePath: "Memos/memos.md"
    });

    expect(composer.kind).toBe("native");
    expect(factory).toHaveBeenCalled();
    expect(embed.editable).toBe(true);
    expect(embed.showEditor).toHaveBeenCalled();
    expect(composer.getValue()).toBe("native text");

    const host = composer.element as unknown as FakeElement;
    expect(host.listeners.get("mousedown")?.[0]?.capture).toBe(true);
    expect(host.listeners.get("touchstart")).toBeUndefined();
    expect(host.listeners.get("click")?.[0]?.capture).toBe(true);

    host.dispatch("mousedown");
    expect(editor.focus).toHaveBeenCalled();

    editor.focus.mockClear();
    expect(animationFrames).toHaveLength(1);
    animationFrames[0](0);
    expect(editor.focus).toHaveBeenCalled();

    editor.focus.mockClear();
    composer.insertText("#项目");
    expect(editor.replaceSelection).toHaveBeenCalledWith("#项目");
    expect(editor.focus).toHaveBeenCalled();

    editor.getValue.mockReturnValue("before code");
    composer.wrapCodeBlock();
    expect(editor.setValue).toHaveBeenCalledWith("before \n\n```text\ncode\n```");
    expect(editor.setCursor).toHaveBeenCalledWith({ line: 0, ch: 25 });

    composer.clear();
    expect(editor.setValue).toHaveBeenCalledWith("");

    composer.destroy();
    expect(embed.unload).toHaveBeenCalled();
  });

  it("uses only one touch focus listener for mobile markdown embeds", () => {
    Platform.isMobile = true;
    installFakeDocument();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const editor = {
      getValue: vi.fn(() => ""),
      setValue: vi.fn(),
      replaceSelection: vi.fn(),
      getCursor: vi.fn(() => ({ line: 0, ch: 0 })),
      posToOffset: vi.fn(() => 0),
      offsetToPos: vi.fn(() => ({ line: 0, ch: 0 })),
      setCursor: vi.fn(),
      focus: vi.fn()
    };
    const embed = {
      set: vi.fn(),
      showEditor: vi.fn(),
      unload: vi.fn(),
      editMode: { editor }
    };
    const container = new FakeElement("div");

    const composer = createNativeMarkdownComposer({
      app: { embedRegistry: { embedByExtension: { md: () => embed } } } as never,
      container: container as never,
      placeholder: "",
      sourcePath: "Memos/memos.md"
    });

    const host = composer.element as unknown as FakeElement;
    expect(host.listeners.get("touchstart")?.[0]?.capture).toBe(true);
    expect(host.listeners.get("mousedown")).toBeUndefined();
    expect(host.listeners.get("click")).toBeUndefined();
  });

  it("falls back to a textarea when the markdown embed is unavailable", () => {
    installFakeDocument();
    const container = new FakeElement("div");

    const composer = createNativeMarkdownComposer({
      app: {} as never,
      container: container as never,
      placeholder: "此刻，你在想什么？",
      sourcePath: "Memos/memos.md"
    });

    expect(composer.kind).toBe("textarea");
    composer.setValue("hello");
    expect(composer.getValue()).toBe("hello");

    composer.insertText(" world");
    expect(composer.getValue()).toBe("hello world");

    composer.wrapCodeBlock();
    expect(composer.getValue()).toBe("```text\nhello world\n```");

    composer.clear();
    expect(composer.getValue()).toBe("");
  });
});
