import { describe, expect, it, vi } from "vitest";
import { captureClipboardLinkToMemos } from "../src/linkCaptureActions";

describe("link capture actions", () => {
  it("captures a resolved clipboard link into the default Memos file with default tags", async () => {
    const store = {
      addMemo: vi.fn(async () => undefined)
    };
    const refreshViews = vi.fn(async () => undefined);

    const result = await captureClipboardLinkToMemos({
      readClipboard: async () => "https://example.com",
      resolveMarkdownLink: async () => "[Example](https://example.com)",
      store,
      settings: {
        linkCaptureDefaultTags: ["链接", "收集"]
      },
      refreshViews,
      notice: vi.fn()
    });

    expect(result).toBe("saved");
    expect(store.addMemo).toHaveBeenCalledWith("[Example](https://example.com) #链接 #收集");
    expect(refreshViews).toHaveBeenCalledOnce();
  });

  it("does not write when clipboard access fails", async () => {
    const store = {
      addMemo: vi.fn(async () => undefined)
    };
    const notice = vi.fn();

    const result = await captureClipboardLinkToMemos({
      readClipboard: async () => {
        throw new Error("denied");
      },
      resolveMarkdownLink: async () => "[Example](https://example.com)",
      store,
      settings: {
        linkCaptureDefaultTags: []
      },
      refreshViews: vi.fn(async () => undefined),
      notice
    });

    expect(result).toBe("clipboard-error");
    expect(store.addMemo).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith("无法读取剪贴板，请先复制链接后再运行命令");
  });

  it("does not write when clipboard text has no URL", async () => {
    const store = {
      addMemo: vi.fn(async () => undefined)
    };
    const notice = vi.fn();

    const result = await captureClipboardLinkToMemos({
      readClipboard: async () => "not a link",
      resolveMarkdownLink: async () => null,
      store,
      settings: {
        linkCaptureDefaultTags: []
      },
      refreshViews: vi.fn(async () => undefined),
      notice
    });

    expect(result).toBe("no-url");
    expect(store.addMemo).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith("剪贴板中没有可收集的链接");
  });
});
